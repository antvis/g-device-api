import {
  DeviceContribution,
  Format,
  TransparentWhite,
  BufferUsage,
  TextureUsage,
  TextureDimension,
  FilterMode,
  AddressMode,
  MipmapFilterMode,
} from '../../src';
import {
  camera,
  createBlitPipelineAndBindings,
  createProgram,
  math,
  particle,
  prelude,
  registerShaderModule,
} from '../utils/compute-toys';

/**
 * Stardust
 * @see https://compute.toys/view/29
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

  const screen = device.createTexture({
    // Use F32_RGBA
    // @see https://www.w3.org/TR/webgpu/#vec3f2-filterable
    // @see https://github.com/compute-toys/wgpu-compute-toy/blob/master/src/bind.rs#L433
    format: Format.F16_RGBA,
    width: $canvas.width,
    height: $canvas.height,
    dimension: TextureDimension.TEXTURE_2D,
    usage: TextureUsage.STORAGE,
  });
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

  const custom = /* wgsl */ `
#define_import_path custom

struct Custom {
  Radius: f32,
  TimeStep: f32,
  Samples: f32,
  BlurRadius: f32,
  VelocityDecay: f32,
  Speed: f32,
  BlurExponentA: f32,
  BlurExponentB: f32,
  AnimatedNoise: f32,
  Accumulation: f32,
  Exposure: f32,
}

@group(0) @binding(1) var<uniform> custom: Custom;
  `;

  registerShaderModule(device, prelude);
  registerShaderModule(device, math);
  registerShaderModule(device, custom);
  registerShaderModule(device, camera);
  registerShaderModule(device, particle);

  const computeWgsl = /* wgsl */ `
#import prelude::{screen, time, pass_in, pass_out};
#import math::{PI, TWO_PI, state, rand4, nrand4, disk};
#import camera::{Camera, GetCameraMatrix, Project, camera};
#import particle::{Particle, LoadParticle, SaveParticle, RasterizePoint, atomic_storage};
#import custom::{Custom, custom};

const MaxSamples = 256.0;
const FOV = 0.8;

//sqrt of particle count
const PARTICLE_COUNT = 160;

const DEPTH_MIN = 0.2;
const DEPTH_MAX = 5.0;
const DEPTH_BITS = 16u;


var<private> bokehRad : f32;

fn SetCamera(ang: vec2f, fov: f32)
{
    camera.fov = fov;
    camera.cam = GetCameraMatrix(ang); 
    camera.pos = - (camera.cam*vec3f(15.0*custom.Radius+0.5,0.0,0.0));
    camera.size = vec2f(textureDimensions(screen));
}

fn ForceField(pos: vec3f, t: f32) -> vec4f
{
    let a0 = vec3f(sin(t),cos(0.4*t),cos(t));
    let d = distance(pos, a0);
    let F = (a0 - pos)*(1.0/(d*d*d + 1e-3) - 0.4/(d*d*d*d + 1e-3)) + 1e-3;
    return 0.2*vec4f(F, 0.0);
}

@compute @workgroup_size(16, 16)
fn SimulateParticles(@builtin(global_invocation_id) id: vec3u) 
{
    var pix = vec2i(id.xy);
    var p = LoadParticle(pix);

    if(pix.x > PARTICLE_COUNT || pix.y > PARTICLE_COUNT) 
    {   
        return;
    }
    
    state = vec4u(id.x, id.y, id.z, time.frame);
    
    if(time.frame == 0u)
    {
        let rng = rand4();
        p.position = vec4f(2.0*rng.xyz - 1.0, 0.0);
        p.velocity = vec4f(0.0,0.0,0.0,0.0);
    }
    let t = fract(custom.Speed*f32(time.frame)/800.0)*30.0;

    // if(mouse.click == 1) 
    // {
    //     return;
    // }

    if(t < 0.05)
    {
        p.velocity -= 0.5 * p.velocity * length(p.velocity);
    }
    
    let dt = custom.Speed * custom.TimeStep;
    p.velocity += (ForceField(p.position.xyz, t) - custom.VelocityDecay*p.velocity) * dt;
    p.position += p.velocity * dt;

    SaveParticle(pix, p);
}

@compute @workgroup_size(16, 16)
fn Clear(@builtin(global_invocation_id) id: vec3u) {
    let screen_size = vec2i(textureDimensions(screen));
    let idx0 = i32(id.x) + i32(screen_size.x * i32(id.y));

    atomicStore(&atomic_storage[idx0*4+0], 0);
    atomicStore(&atomic_storage[idx0*4+1], 0);
    atomicStore(&atomic_storage[idx0*4+2], 0);
    atomicStore(&atomic_storage[idx0*4+3], 0);
}

@compute @workgroup_size(16, 16)
fn Rasterize(@builtin(global_invocation_id) id: vec3u) {
    // Viewport resolution (in pixels)
    let screen_size = vec2i(textureDimensions(screen));
    let screen_size_f = vec2f(screen_size);
    
    let ang = vec2f(-TWO_PI, PI)/screen_size_f + 1e-4;
    // let ang = vec2f(mouse.pos.xy)*vec2f(-TWO_PI, PI)/screen_size_f + 1e-4;
    
    SetCamera(ang, FOV);

    //RNG state
    state = vec4u(id.x, id.y, id.z, 0u);
    
    let rng = rand4();
    bokehRad = pow(rng.x, custom.BlurExponentA);

    // if(mouse.click == 1 && custom.AnimatedNoise > 0.5)
    // {
    //     state.w = time.frame;
    // }

    var pix = vec2i(id.xy);

    if(pix.x > PARTICLE_COUNT || pix.y > PARTICLE_COUNT) 
    {   
        return;
    }

    var p = LoadParticle(pix);

    var pos = p.position.xyz;
    var col = 5.5*abs(p.velocity.xyz)*dot(p.velocity,p.velocity)+0.1;
    col /= (0.1+bokehRad);
    let impSample = (col.x + col.y + col.z)*bokehRad;
    let sampleCount = clamp(i32(impSample*custom.Samples*MaxSamples + 1.0), 1, 1024);
    let normalCount = i32(custom.Samples*MaxSamples + 1.0);

    col *= f32(normalCount)/f32(sampleCount);

    for(var i = 0; i < sampleCount; i++)
    {
        let R = 2.0*custom.BlurRadius*bokehRad;
        let rng = rand4();
        let dpos = R*normalize(nrand4(1.0, vec4f(0.0)).xyz)*pow(rng.x, custom.BlurExponentB);
        RasterizePoint(pos + dpos, col);
    }
}

fn Sample(pos: vec2i) -> vec3f
{
    let screen_size = vec2i(textureDimensions(screen));
    let idx = pos.x + screen_size.x * pos.y;

    var color: vec3f;
    let x = f32(atomicLoad(&atomic_storage[idx*4+0]))/(256.0);
    let y = f32(atomicLoad(&atomic_storage[idx*4+1]))/(256.0);
    let z = f32(atomicLoad(&atomic_storage[idx*4+2]))/(256.0);
    
    color = tanh(
      custom.Exposure * 0.03 * f32(screen_size.y) * vec3f(x,y,z)
      / (custom.Samples * MaxSamples + 1.0));

    return abs(color);
}

@compute @workgroup_size(16, 16)
fn main_image(@builtin(global_invocation_id) id: vec3u) 
{
    let screen_size = vec2u(textureDimensions(screen));

    // Prevent overdraw for workgroups on the edge of the viewport
    if (id.x >= screen_size.x || id.y >= screen_size.y) { return; }

    // Pixel coordinates (centre of pixel, origin at bottom left)
    let fragCoord = vec2f(f32(id.x) + .5, f32(id.y) + .5);

  
    var color = vec4f(Sample(vec2i(id.xy)),1.0);

    let oldColor = textureLoad(pass_in, vec2i(id.xy), 2, 0);

    // if(mouse.click == 1 && custom.AnimatedNoise > 0.5)
    // {
    //     color += oldColor * custom.Accumulation;
    // }
    
    // Output to buffer
    textureStore(pass_out, vec2i(id.xy), 2, color);

    textureStore(screen, vec2i(id.xy), vec4f(color.xyz/color.w, 1.));
}
          `;

  const simulateParticlesProgram = createProgram(device, {
    compute: {
      entryPoint: 'SimulateParticles',
      wgsl: computeWgsl,
    },
  });
  const clearProgram = createProgram(device, {
    compute: {
      entryPoint: 'Clear',
      wgsl: computeWgsl,
    },
  });
  const rasterizeProgram = createProgram(device, {
    compute: {
      entryPoint: 'Rasterize',
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
  const customUniformBuffer = device.createBuffer({
    viewOrSize: 11 * Float32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.UNIFORM,
  });
  customUniformBuffer.setSubData(
    0,
    new Uint8Array(
      new Float32Array([
        0.551, 0.313, 0.632, 0.489, 0.018, 0.697, 0.621, 0, 1, 0.962, 0.224,
      ]).buffer,
    ),
  );

  const storageBuffer = device.createBuffer({
    viewOrSize:
      $canvas.width * $canvas.height * 4 * Float32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.STORAGE,
  });

  const simulateParticlesPipeline = device.createComputePipeline({
    inputLayout: null,
    program: simulateParticlesProgram,
  });
  const clearPipeline = device.createComputePipeline({
    inputLayout: null,
    program: clearProgram,
  });
  const rasterizePipeline = device.createComputePipeline({
    inputLayout: null,
    program: rasterizeProgram,
  });
  const mainImagePipeline = device.createComputePipeline({
    inputLayout: null,
    program: mainImageProgram,
  });

  const simulateParticlesBindings = device.createBindings({
    pipeline: simulateParticlesPipeline,
    uniformBufferBindings: [
      {
        buffer: uniformBuffer,
      },
      {
        buffer: customUniformBuffer,
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
        binding: 1,
        texture: pass_out,
      },
    ],
  });
  const clearBindings = device.createBindings({
    pipeline: clearPipeline,
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
  const rasterizeBindings = device.createBindings({
    pipeline: rasterizePipeline,
    uniformBufferBindings: [
      {
        binding: 1,
        buffer: customUniformBuffer,
      },
    ],
    samplerBindings: [
      {
        texture: pass_in,
        sampler: bilinear,
        samplerBinding: -1,
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
    uniformBufferBindings: [
      {
        binding: 1,
        buffer: customUniformBuffer,
      },
    ],
    samplerBindings: [
      {
        texture: pass_in,
        sampler: bilinear,
        samplerBinding: -1,
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
      {
        binding: 1,
        texture: pass_out,
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
    computePass.setPipeline(simulateParticlesPipeline);
    computePass.setBindings(simulateParticlesBindings);
    computePass.dispatchWorkgroups(
      Math.ceil($canvas.width / 16),
      Math.ceil($canvas.height / 16),
    );

    computePass.setPipeline(clearPipeline);
    computePass.setBindings(clearBindings);
    computePass.dispatchWorkgroups(
      Math.ceil($canvas.width / 16),
      Math.ceil($canvas.height / 16),
    );

    computePass.setPipeline(rasterizePipeline);
    computePass.setBindings(rasterizeBindings);
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
    device.endFrame();
    device.copySubTexture2D(pass_in, 0, 0, pass_out, 0, 0, 4);

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
    simulateParticlesProgram.destroy();
    simulateParticlesPipeline.destroy();
    clearPipeline.destroy();
    clearProgram.destroy();
    clearPipeline.destroy();
    rasterizeProgram.destroy();
    rasterizePipeline.destroy();
    mainImageProgram.destroy();
    mainImagePipeline.destroy();
    screen.destroy();
    uniformBuffer.destroy();
    customUniformBuffer.destroy();
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
