import { DeviceContribution } from '../../src';

export async function render(
  deviceContribution: DeviceContribution,
  $canvas: HTMLCanvasElement,
  useRAF = true,
) {
  // create swap chain and get device
  const swapChain = await deviceContribution.createSwapChain($canvas);
  swapChain.configureSwapChain($canvas.width, $canvas.height);
  const device = swapChain.getDevice();

  const compiler = device['WGSLComposer'];
  const code1 = compiler.wgsl_compile(
    `
#define_import_path my_module

fn my_func() -> f32 {
	return 1.0;
}

struct FullscreenVertexOutput {
  @builtin(position)
  position: vec4<f32>,
  @location(0)
  uv: vec2<f32>,
};
    `,
  );

  const code = compiler.wgsl_compile(
    `
    #import my_module;
  
  @group(0) @binding(0) var screenTexture: texture_2d<f32>;
  @group(0) @binding(1) var samp: sampler;
  
  #define EDGE_THRESH_MIN_LOW 1
  #define EDGE_THRESH_LOW 1
  
  // Trims the algorithm from processing darks.
  #ifdef EDGE_THRESH_MIN_LOW
      const EDGE_THRESHOLD_MIN: f32 = 0.0833;
  #endif
  
  fn main() -> f32 {
    let x = my_module::my_func();

    return x;
}
  `,
  );
  console.log(code);
  console.log(code1);
}

render.params = {
  targets: ['webgpu'],
  default: 'webgpu',
};
