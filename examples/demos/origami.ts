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

@compute @workgroup_size(16, 16)
fn main_image(@builtin(global_invocation_id) id: vec3u) {
    // Viewport resolution (in pixels)
    let screen_size = textureDimensions(screen);

    // Prevent overdraw for workgroups on the edge of the viewport
    if (id.x >= screen_size.x || id.y >= screen_size.y) { return; }

    // Pixel coordinates (centre of pixel, origin at bottom left)
    let p = vec2f(f32(id.x) + .5, f32(screen_size.y - id.y) - .5);

    //Initialize hue and clear fragcolor
    var h=vec4f(0.0);
    var c=vec4f(1.0);
    
    //Resolution for scaling
    var r = vec2f(screen_size);
    //Alpha, length, angle
    var A=0f;
    var l=0f;
    var a=0f;
    //Loop through layer
    for(var i=0.6; i>0.1; i-=0.1)
    {
        //Smoothly rotate a quarter at a time
        a=(time.elapsed+i)*4;
        a-=sin(a); a-=sin(a);

        //Rotate
        var t = cos(a/4+vec2f(0,11));
        var R = mat2x2(t.x, -t.y, t.y, t.x);

        //Scale and center
        var u =(p*2f - r)/ r.y;
        //Compute round square SDF
        u -= R*clamp(u*R,-vec2f(i),vec2f(i));
        l = max(length(u),0.1);
        //Compute anti-aliased alpha using SDF
        A = min((l - 0.1) * r.y / 5, 1);
        //Pick layer color
        h = sin(i*10+a/3+vec4f(1,3,5,0))/5+0.8;
        //Color blending and lighting
        c = mix(h,c,A) * mix(h/h,h+A*u.y/l/2,0.1/l);
    }

    var color = tanh(c*c);
    color.a = 1.0;

    // Output to screen (tanh tonemap)
    textureStore(screen, id.xy, color);
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
