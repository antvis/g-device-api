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
 * @see https://compute.toys/view/16
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

  const computeProgram = createProgram(device, {
    compute: {
      entryPoint: 'main_image',
      wgsl: /* wgsl */ `
#import prelude::{screen, time}

fn sphereMap(p: float3) -> float
{
    return length(p) - 1.; // distance to a sphere of radius 1
}

fn rayMarchSphere(ro: float3, rd: float3, tmin: float, tmax: float) -> float
{
    var t = tmin; 
    for(var i=0; i<400; i++ )
    {
        let  pos = ro + t*rd;
        let  d = sphereMap( pos );
        t += d;
        if( t>tmax ) { break; };
    }

    return t;
}

@compute @workgroup_size(16, 16)
fn main_image(@builtin(global_invocation_id) id: uint3) {
  let screen_size = uint2(textureDimensions(screen));
    if (id.x >= screen_size.x || id.y >= screen_size.y) { return; }
    let fragCoord = float2(id.xy) + .5;
    let resolution = float2(screen_size);

    var ignore = time.elapsed / time.elapsed; // to avoid rewriting run without the time bindings.
    var uv = (fragCoord * 2. - resolution.xy) / resolution.y * ignore;
    // var uv = (fragCoord * 2. - resolution.xy) / resolution.y;

    // camera
    let ro = vec3(0.0, 0, -3.0);
    let rd = normalize(vec3(uv, 1.));

    //----------------------------------
    // raycast terrain and tree envelope
    //----------------------------------
    let tmax = 2000.0;
    let t = rayMarchSphere(ro, rd, 0, tmax);
    let col = vec3(t * .2);
    textureStore(screen, int2(id.xy), float4(col, 1.));
}
`,
    },
  });

  const uniformBuffer = device.createBuffer({
    viewOrSize: 2 * Float32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.UNIFORM,
  });
  uniformBuffer.setSubData(0, new Uint8Array(new Float32Array([0]).buffer));

  const computePipeline = device.createComputePipeline({
    inputLayout: null,
    program: computeProgram,
  });

  const bindings = device.createBindings({
    pipeline: computePipeline,
    uniformBufferBindings: [
      {
        binding: 0,
        buffer: uniformBuffer,
      },
    ],
    storageTextureBindings: [
      {
        binding: 0,
        texture: screen,
      },
    ],
  });

  const renderTarget = device.createRenderTarget({
    format: Format.U8_RGBA_RT,
    width: $canvas.width,
    height: $canvas.height,
  });
  device.setResourceName(renderTarget, 'Main Render Target');

  let id;
  let t = 0;
  const frame = (time) => {
    uniformBuffer.setSubData(
      0,
      new Uint8Array(new Float32Array([t, time / 1000]).buffer),
    );

    device.beginFrame();
    const computePass = device.createComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindings(bindings);
    computePass.dispatchWorkgroups(
      Math.ceil($canvas.width / 16),
      Math.ceil($canvas.height / 16),
    );
    device.submitPass(computePass);

    /**
     * An application should call getCurrentTexture() in the same task that renders to the canvas texture.
     * Otherwise, the texture could get destroyed by these steps before the application is finished rendering to it.
     */
    const onscreenTexture = swapChain.getOnscreenTexture();
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
    blitBindings.destroy();
    computeProgram.destroy();
    screen.destroy();
    uniformBuffer.destroy();
    blitPipeline.destroy();
    computePipeline.destroy();
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
