import {
  DeviceContribution,
  Format,
  TransparentWhite,
  BufferUsage,
  TextureUsage,
  TextureDimension,
} from '../../src';
import {
  createBlitPipelineAndBindings,
  createProgram,
  prelude,
  registerShaderModule,
} from '../utils/compute-toys';

/**
 * @see https://compute.toys/view/76
 */

export async function render(
  deviceContribution: DeviceContribution,
  $canvas: HTMLCanvasElement,
  useRAF = true,
) {
  // create swap chain and get device
  const swapChain = await deviceContribution.createSwapChain($canvas);
  swapChain.configureSwapChain($canvas.width, $canvas.height);
  const device = swapChain.getDevice();

  registerShaderModule(device, prelude);

  const screen = device.createTexture({
    format: Format.F16_RGBA,
    width: $canvas.width,
    height: $canvas.height,
    dimension: TextureDimension.TEXTURE_2D,
    usage: TextureUsage.STORAGE,
  });

  const { pipeline: blitPipeline, bindings: blitBindings } =
    createBlitPipelineAndBindings(device, screen);

  const computeWgsl = /* wgsl */ `
#import prelude::{screen}

@group(2) @binding(0) var<storage, read_write> stor1 : array<f32>;

@compute @workgroup_size(16, 16)
fn pas(@builtin(global_invocation_id) id: vec3u) {
    let idx = id.y * textureDimensions(screen).x + id.x;
    stor1[idx] = f32(id.x) / f32(textureDimensions(screen).x);
}

@compute @workgroup_size(16, 16)
fn main_image(@builtin(global_invocation_id) id: vec3u) {
    let idx = id.y * textureDimensions(screen).x + id.x;
    let val = stor1[idx];
    let col = vec3f(val);
    textureStore(screen, vec2i(id.xy), vec4f(col, 1.));
}
          `;

  const pass1Program = createProgram(device, {
    compute: {
      entryPoint: 'pas',
      wgsl: computeWgsl,
    },
  });
  const mainImageProgram = createProgram(device, {
    compute: {
      entryPoint: 'main_image',
      wgsl: computeWgsl,
    },
  });

  const uniformBuffer = device.createBuffer({
    viewOrSize: 1 * Float32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.UNIFORM,
  });
  uniformBuffer.setSubData(0, new Uint8Array(new Float32Array([0]).buffer));

  const storageBuffer = device.createBuffer({
    viewOrSize: $canvas.width * $canvas.height * Uint32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.STORAGE,
  });

  const pass1Pipeline = device.createComputePipeline({
    inputLayout: null,
    program: pass1Program,
  });
  const mainImagePipeline = device.createComputePipeline({
    inputLayout: null,
    program: mainImageProgram,
  });

  const bindings = device.createBindings({
    pipeline: pass1Pipeline,
    storageBufferBindings: [
      {
        buffer: storageBuffer,
      },
    ],
    storageTextureBindings: [
      {
        texture: screen,
      },
    ],
  });
  const bindings2 = device.createBindings({
    pipeline: mainImagePipeline,
    storageBufferBindings: [
      {
        buffer: storageBuffer,
      },
    ],
    storageTextureBindings: [
      {
        texture: screen,
      },
    ],
  });

  const renderTarget = device.createRenderTarget({
    format: Format.U8_RGBA_RT,
    width: $canvas.width,
    height: $canvas.height,
  });

  let id;
  let t = 0;
  const frame = (time) => {
    uniformBuffer.setSubData(
      0,
      new Uint8Array(new Float32Array([time / 1000]).buffer),
    );

    device.beginFrame();
    const computePass = device.createComputePass();
    computePass.setPipeline(pass1Pipeline);
    computePass.setBindings(bindings);
    computePass.dispatchWorkgroups(
      Math.floor($canvas.width / 16),
      Math.floor($canvas.height / 16),
    );

    computePass.setPipeline(mainImagePipeline);
    computePass.setBindings(bindings2);
    computePass.dispatchWorkgroups(
      Math.floor($canvas.width / 16),
      Math.floor($canvas.height / 16),
    );
    device.submitPass(computePass);
    device.endFrame();

    /**
     * An application should call getCurrentTexture() in the same task that renders to the canvas texture.
     * Otherwise, the texture could get destroyed by these steps before the application is finished rendering to it.
     */
    const onscreenTexture = swapChain.getOnscreenTexture();
    device.beginFrame();
    const renderPass = device.createRenderPass({
      colorAttachment: [renderTarget],
      colorResolveTo: [onscreenTexture],
      colorClearColor: [TransparentWhite],
    });
    renderPass.setPipeline(blitPipeline);
    renderPass.setBindings(blitBindings);
    renderPass.setViewport(0, 0, $canvas.width, $canvas.height);
    renderPass.draw(3);

    device.submitPass(renderPass);
    device.endFrame();
    ++t;
    id = requestAnimationFrame(frame);
  };

  frame(0);

  return () => {
    if (useRAF && id) {
      cancelAnimationFrame(id);
    }
    pass1Program.destroy();
    pass1Pipeline.destroy();
    mainImageProgram.destroy();
    mainImagePipeline.destroy();
    screen.destroy();
    uniformBuffer.destroy();
    blitPipeline.destroy();
    renderTarget.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

render.params = {
  targets: ['webgpu'],
  default: 'webgpu',
};
