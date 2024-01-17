import {
  DeviceContribution,
  Format,
  TransparentWhite,
  BufferUsage,
  TextureUsage,
  TextureDimension,
  AddressMode,
  FilterMode,
  MipmapFilterMode,
} from '../../src';
import {
  createBlitPipelineAndBindings,
  createProgram,
  prelude,
  registerShaderModule,
} from '../utils/compute-toys';

/**
 * Water caustics, using the atomic storage buffer for accumulating photons.
 * @see https://compute.toys/view/14
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
    // Use F32_RGBA
    // @see https://www.w3.org/TR/webgpu/#float32-filterable
    // @see https://github.com/compute-toys/wgpu-compute-toy/blob/master/src/bind.rs#L433
    format: Format.F16_RGBA,
    width: $canvas.width,
    height: $canvas.height,
    dimension: TextureDimension.TEXTURE_2D,
    usage: TextureUsage.STORAGE,
  });

  /**
   * For compute shader input and output @compute.toys provides:
   * * one input texture array pass_in,
   * * one output storage texture array pass_out,
   * * and one output screen storage texture screen.
   *
   * The shader can write to pass_out, which will be copied into pass_in after the current entrypoint has returned.
   * pass_in will always contain whatever has been written to pass_out during all of the previous entrypoints.
   * The contents of pass_in will not change while an entrypoint is running.
   * pass_in and pass_out are both texture arrays with 4 texture layers.
   */
  const pass_in = device.createTexture({
    format: Format.F16_RGBA,
    width: $canvas.width,
    height: $canvas.height,
    dimension: TextureDimension.TEXTURE_2D_ARRAY,
    depthOrArrayLayers: 4,
    usage: TextureUsage.SAMPLED,
  });
  const pass_out = device.createTexture({
    format: Format.F16_RGBA,
    width: $canvas.width,
    height: $canvas.height,
    dimension: TextureDimension.TEXTURE_2D_ARRAY,
    depthOrArrayLayers: 4,
    usage: TextureUsage.STORAGE,
  });
  const bilinear = device.createSampler({
    addressModeU: AddressMode.CLAMP_TO_EDGE,
    addressModeV: AddressMode.CLAMP_TO_EDGE,
    minFilter: FilterMode.BILINEAR,
    magFilter: FilterMode.BILINEAR,
    mipmapFilter: MipmapFilterMode.NO_MIP,
  });

  const { pipeline: blitPipeline, bindings: blitBindings } =
    createBlitPipelineAndBindings(device, screen);

  const computeWgsl = /* wgsl */ `
#import prelude::{screen, time, passStore, passLoad, passSampleLevelBilinearRepeat};

@group(2) @binding(0) var<storage, read_write> atomic_storage : array<atomic<i32>>;

// 2022 David A Roberts <https://davidar.io/>

// https://www.shadertoy.com/view/4djSRW
fn hash44(p: float4) -> float4 {
    var p4 = fract(p * float4(.1031, .1030, .0973, .1099));
    p4 = p4 + dot(p4, p4.wzxy+33.33);
    return fract((p4.xxyz+p4.yzzw)*p4.zywx);
}

const dt = 1.;
const n = float2(0., 1.);
const e = float2(1., 0.);
const s = float2(0., -1.);
const w = float2(-1., 0.);

fn A(fragCoord: float2) -> float4 {
    return passLoad(0, int2(fragCoord), 0);
}

fn B(fragCoord: float2) -> float4 {
    return passSampleLevelBilinearRepeat(1, fragCoord / float2(textureDimensions(screen)), 0.);
}

fn T(fragCoord: float2) -> float4 {
    return B(fragCoord - dt * B(fragCoord).xy);
}

@compute @workgroup_size(16, 16)
fn main_velocity(@builtin(global_invocation_id) id: uint3) {
    let screen_size = uint2(textureDimensions(screen));
    if (id.x >= screen_size.x || id.y >= screen_size.y) { return; }
    let u = float2(id.xy) + 0.5;
    var r = T(u);
    r.x = r.x - dt * 0.25 * (T(u+e).z - T(u+w).z);
    r.y = r.y - dt * 0.25 * (T(u+n).z - T(u+s).z);

    if (u32(time.frame) < 3u) { r = float4(0.); }
    passStore(0, int2(id.xy), r);
}

@compute @workgroup_size(16, 16)
fn main_pressure(@builtin(global_invocation_id) id: uint3) {
    let screen_size = uint2(textureDimensions(screen));
    if (id.x >= screen_size.x || id.y >= screen_size.y) { return; }
    let u = float2(id.xy) + 0.5;
    var r = A(u);
    r.z = r.z - dt * 0.25 * (A(u+e).x - A(u+w).x + A(u+n).y - A(u+s).y);

    let t = float(time.frame) / 120.;
    let o = float2(screen_size)/2. * (1. + .75 * float2(cos(t/15.), sin(2.7*t/15.)));
    r = mix(r, float4(0.5 * sin(dt * 2. * t) * sin(dt * t), 0., r.z, 1.), exp(-0.2 * length(u - o)));
    passStore(1, int2(id.xy), r);
}

@compute @workgroup_size(16, 16)
fn main_caustics(@builtin(global_invocation_id) id: uint3) {
    let screen_size = uint2(textureDimensions(screen));
    if (id.x >= screen_size.x || id.y >= screen_size.y) { return; }
    for (var i = 0; i < 25; i = i+1) {
        let h = hash44(float4(float2(id.xy), float(time.frame), float(i)));
        var p = float2(id.xy) + h.xy;
        let z = mix(.3, 1., h.z);
        let c = max(cos(z*6.2+float4(1.,2.,3.,4.)),float4(0.));
        let grad = 0.25 * float2(B(p+e).z - B(p+w).z, B(p+n).z - B(p+s).z);
        p = p + 1e5 * grad * z;
        p = fract(p / float2(screen_size)) * float2(screen_size);
        let idx = int(p.x) + int(p.y) * int(screen_size.x);
        atomicAdd(&atomic_storage[idx*4+0], int(c.x * 256.));
        atomicAdd(&atomic_storage[idx*4+1], int(c.y * 256.));
        atomicAdd(&atomic_storage[idx*4+2], int(c.z * 256.));
    }
}

@compute @workgroup_size(16, 16)
fn main_image(@builtin(global_invocation_id) id: uint3) {
    let screen_size = uint2(textureDimensions(screen));
    if (id.x >= screen_size.x || id.y >= screen_size.y) { return; }
    let idx = int(id.x) + int(id.y) * int(screen_size.x);
    let x = float(atomicLoad(&atomic_storage[idx*4+0]));
    let y = float(atomicLoad(&atomic_storage[idx*4+1]));
    let z = float(atomicLoad(&atomic_storage[idx*4+2]));
    var r = float3(x, y, z) / 256.;
    r = r * sqrt(r) / 5e3;
    r = r * float3(.5, .75, 1.);
    textureStore(screen, int2(id.xy), float4(r, 1.));
    atomicStore(&atomic_storage[idx*4+0], int(x * .9));
    atomicStore(&atomic_storage[idx*4+1], int(y * .9));
    atomicStore(&atomic_storage[idx*4+2], int(z * .9));
}

        `;

  const mainVelocityProgram = createProgram(device, {
    compute: {
      entryPoint: 'main_velocity',
      wgsl: computeWgsl,
    },
  });
  const mainPressureProgram = createProgram(device, {
    compute: {
      entryPoint: 'main_pressure',
      wgsl: computeWgsl,
    },
  });
  const mainCausticsProgram = createProgram(device, {
    compute: {
      entryPoint: 'main_caustics',
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
    viewOrSize: 2 * Float32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.UNIFORM,
  });
  uniformBuffer.setSubData(0, new Uint8Array(new Float32Array([0, 0]).buffer));

  const storageBuffer = device.createBuffer({
    viewOrSize:
      $canvas.width * $canvas.height * 4 * Float32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.STORAGE,
  });

  const mainVelocityPipeline = device.createComputePipeline({
    inputLayout: null,
    program: mainVelocityProgram,
  });
  const mainPressurePipeline = device.createComputePipeline({
    inputLayout: null,
    program: mainPressureProgram,
  });
  const mainCausticsPipeline = device.createComputePipeline({
    inputLayout: null,
    program: mainCausticsProgram,
  });
  const mainImagePipeline = device.createComputePipeline({
    inputLayout: null,
    program: mainImageProgram,
  });

  const mainVelocityBindings = device.createBindings({
    pipeline: mainVelocityPipeline,
    uniformBufferBindings: [
      {
        binding: 0,
        buffer: uniformBuffer,
      },
    ],
    samplerBindings: [
      {
        texture: pass_in,
        sampler: bilinear,
      },
    ],
    storageTextureBindings: [
      {
        binding: 0,
        texture: screen,
      },
      {
        binding: 1,
        texture: pass_out,
      },
    ],
  });
  const mainPressureBindings = device.createBindings({
    pipeline: mainPressurePipeline,
    uniformBufferBindings: [
      {
        binding: 0,
        buffer: uniformBuffer,
      },
    ],
    samplerBindings: [
      {
        texture: pass_in,
        sampler: bilinear,
        samplerBinding: -1,
      },
    ],
    storageTextureBindings: [
      {
        binding: 0,
        texture: screen,
      },
      {
        binding: 1,
        texture: pass_out,
      },
    ],
  });
  const mainCausticsBindings = device.createBindings({
    pipeline: mainCausticsPipeline,
    uniformBufferBindings: [
      {
        binding: 0,
        buffer: uniformBuffer,
      },
    ],
    samplerBindings: [
      {
        texture: pass_in,
        sampler: bilinear,
      },
    ],
    storageBufferBindings: [
      {
        binding: 0,
        buffer: storageBuffer,
      },
    ],
    storageTextureBindings: [
      {
        binding: 0,
        texture: screen,
      },
    ],
  });
  const mainImageBindings = device.createBindings({
    pipeline: mainImagePipeline,
    storageBufferBindings: [
      {
        binding: 0,
        buffer: storageBuffer,
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
    computePass.setPipeline(mainVelocityPipeline);
    computePass.setBindings(mainVelocityBindings);
    computePass.dispatchWorkgroups(
      Math.ceil($canvas.width / 16),
      Math.ceil($canvas.height / 16),
    );

    computePass.setPipeline(mainPressurePipeline);
    computePass.setBindings(mainPressureBindings);
    computePass.dispatchWorkgroups(
      Math.ceil($canvas.width / 16),
      Math.ceil($canvas.height / 16),
    );

    computePass.setPipeline(mainCausticsPipeline);
    computePass.setBindings(mainCausticsBindings);
    computePass.dispatchWorkgroups(
      Math.ceil($canvas.width / 16),
      Math.ceil($canvas.height / 16),
    );

    computePass.setPipeline(mainImagePipeline);
    computePass.setBindings(mainImageBindings);
    computePass.dispatchWorkgroups(
      Math.ceil($canvas.width / 16),
      Math.ceil($canvas.height / 16),
    );
    device.submitPass(computePass);
    device.copySubTexture2D(pass_in, 0, 0, pass_out, 0, 0, 4);

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
    mainVelocityProgram.destroy();
    mainVelocityPipeline.destroy();
    mainPressureProgram.destroy();
    mainPressurePipeline.destroy();
    mainCausticsPipeline.destroy();
    mainCausticsProgram.destroy();
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
