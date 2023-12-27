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

  const mouse = { pos: { x: 0, y: 0 }, click: 0 };
  $canvas.addEventListener('mousemove', (e) => {
    if (mouse.click) {
      mouse.pos.x = e.offsetX;
      mouse.pos.y = e.offsetY;
      // console.log(e.offsetX - , e.offsetY, $canvas.clientHeight);
    }
  });
  $canvas.addEventListener('mousedown', (e) => {
    mouse.click = 1;
  });
  $canvas.addEventListener('mouseup', (e) => {
    mouse.click = 0;
  });

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
  AnimatedNoise: f32,
  Accumulation: f32,
  Exposure: f32,
  BlurExponentA: f32,
  BlurExponentB: f32,
  BlurRadius: f32,
  KerrA: f32,
  KerrQ: f32,
  InitSpeed: f32,
  InitThick: f32,
  Steps: f32,
  FocalPlane: f32,
  MotionBlur: f32,
  Gamma: f32
}

@group(0) @binding(2) var<uniform> custom: Custom;
  `;

  registerShaderModule(device, prelude);
  registerShaderModule(device, math);
  registerShaderModule(device, custom);
  registerShaderModule(device, camera);
  registerShaderModule(device, particle);

  const computeWgsl = /* wgsl */ `
#import prelude::{screen, time, mouse, pass_in, pass_out};
#import math::{PI, TWO_PI, state, rand4, nrand4, sqr, diag, disk};
#import camera::{Camera, GetCameraMatrix, Project, camera};
#import particle::{Particle, LoadParticle, SaveParticle, RasterizePoint, atomic_storage};
#import custom::{Custom, custom};

const MaxSamples = 8.0;
const FOV = 0.8;

//sqrt of particle count
const PARTICLE_COUNT = 1000;

const DEPTH_MIN = 0.2;
const DEPTH_MAX = 5.0;
const DEPTH_BITS = 16u;
const dq = float2(0.0, 1.0);
const eps = 0.01;

const KerrM = 1.0;

struct GeodesicRay
{    
    q:  float4,
    qt: float4,
    p:  float4,
}; 

var<private> bokehRad : float;

fn SetCamera(ang: float2, fov: float)
{
    camera.fov = fov;
    camera.cam = GetCameraMatrix(ang); 
    camera.pos = - (camera.cam*float3(50.0*custom.Radius+0.5,0.0,0.0));
    camera.size = float2(textureDimensions(screen));
}

fn KerrGetR2(p: float3) -> float
{
    let rho = dot(p,p) - sqr(custom.KerrA);
    let r2 = 0.5*(rho + sqrt(sqr(rho) + sqr(2.0*custom.KerrA*p.z)));
    return r2;
}

fn KerrGetK(p: float3) -> float4
{
    let r2 = KerrGetR2(p);
    let r = sqrt(r2);
    let invr2 = 1.0 / (r2 + sqr(custom.KerrA) + 1e-3); 
    let  k = float3((r*p.x - custom.KerrA*p.y) * invr2, (r*p.y + custom.KerrA*p.x) * invr2, p.z/(r + 1e-4));
    let f = r2 * (2.0 * KerrM * r - sqr(custom.KerrQ)) / (r2 * r2 + sqr(custom.KerrA * p.z) + 1e-3);
    return float4(k, f);
}

fn G(q: float4) -> float4x4 
{
    //Kerr metric in Kerr-Schild coordinates 
    let k = KerrGetK(q.yzw);
    let kf = k.w*float4(1.0, k.xyz);
    return diag(float4(-1.0,1.0,1.0,1.0)) + float4x4(kf, k.x*kf, k.y*kf, k.z*kf);    
}

fn Ginv(q: float4) -> float4x4 
{
    //inverse of Kerr metric in Kerr-Schild coordinates 
    let k = KerrGetK(q.yzw);
    let kf = k.w*vec4(1.0, -k.xyz)/dot(k.xyz, k.xyz);
    return diag(float4(-1.0,1.0,1.0,1.0)) + float4x4(-kf, k.x*kf, k.y*kf, k.z*kf); 
}

//lagrangian
fn Lmat(qt: float4, g: float4x4) -> float 
{
    return   g[0][0]*qt.x*qt.x + g[1][1]*qt.y*qt.y + g[2][2]*qt.z*qt.z + g[3][3]*qt.w*qt.w +
        2.0*(g[0][1]*qt.x*qt.y + g[0][2]*qt.x*qt.z + g[0][3]*qt.x*qt.w +
                g[1][2]*qt.y*qt.z + g[1][3]*qt.y*qt.w +
                g[2][3]*qt.z*qt.w);
}

fn L(qt: float4, q: float4) -> float 
{
    return Lmat(qt, G(q));
}

fn H(p: float4, ginv: float4x4) -> float 
{
    return Lmat(p, ginv);
}

fn  ToMomentum(ray: GeodesicRay) -> float4 
{
    return G(ray.q)*ray.qt; 
}

fn  FromMomentum(ray: GeodesicRay) -> float4 
{
    return Ginv(ray.q)*ray.p; 
}

fn ParticleToGeodesic(particle: Particle) -> GeodesicRay
{
    var ray: GeodesicRay;
    ray.q = particle.position;
    ray.p = particle.velocity;
    return ray;
}

fn GeodesicToParticle(ray: GeodesicRay) -> Particle
{
    var particle: Particle;
    particle.position = ray.q;
    particle.velocity = ray.p/length(ray.qt);
    return particle;
}

fn HamiltonianGradient(ray: GeodesicRay) -> float4 
{
    let ginv = Ginv(ray.q);
    let H0 = H(ray.p, ginv);
    let delta = 0.1; 
    return (float4(
        L(ray.qt,ray.q+delta*dq.yxxx),
        L(ray.qt,ray.q+delta*dq.xyxx),
        L(ray.qt,ray.q+delta*dq.xxyx),
        L(ray.qt,ray.q+delta*dq.xxxy)) - H0)/delta;
}

fn VelClamp(vel: float4) -> float4
{
    return vel;//float4(vel.x, vel.yzw / max(1.0, length(vel.yzw)));
}

@compute @workgroup_size(16, 16)
fn SimulateParticles(@builtin(global_invocation_id) id: uint3) 
{
    var pix = int2(id.xy);
    var p = LoadParticle(pix);

    if(pix.x > PARTICLE_COUNT || pix.y > PARTICLE_COUNT) 
    {   
        return;
    }
    
    state = uint4(id.x, id.y, id.z, time.frame);
    
    let r = sqrt(KerrGetR2(p.position.yzw));

    if(time.frame == 0u || r < 0.9 || r > 30.0)
    {
        let rng = rand4();
        let rng1 = rand4();
        p.position = 30.0*float4(1.0, 1.0, 1.0, custom.InitThick) * float4(0.0,2.0*rng.xyz - 1.0);

        let r01 = sqrt(KerrGetR2(p.position.yzw)); 
        if(r01 < 0.9)
        {
            return;
        }

        var vel = normalize(cross(p.position.yzw, float3(0.0,0.0,1.0)));

        vel += 0.3*(rng1.xyz * 0.5 - 0.25);
        let vscale = clamp(1.0 / (0.2 + 0.08*r01), 0., 1.0);
        p.velocity = float4(-1.0,2.0*(custom.InitSpeed - 0.5)*vel*vscale);
    }

   
    
    var ray = ParticleToGeodesic(p);

    // if(mouse.click == 1) 
    // {
    //    // return;
    // }
   
    for(var i = 0; i < int(custom.Steps*16.0 + 1.0); i++)
    {
        ray.qt = FromMomentum(ray);
        let qt0 = ray.qt;
        let dt = 0.5 * custom.TimeStep / (abs(ray.qt.x) + 0.01);
        ray.p += HamiltonianGradient(ray)*dt;
        ray.qt = FromMomentum(ray);
        ray.q += (ray.qt+qt0)*dt;
    }

    SaveParticle(pix, GeodesicToParticle(ray));
}

@compute @workgroup_size(16, 16)
fn Clear(@builtin(global_invocation_id) id: uint3) {
    let screen_size = int2(textureDimensions(screen));
    let idx0 = int(id.x) + int(screen_size.x * int(id.y));

    atomicStore(&atomic_storage[idx0*4+0], 0);
    atomicStore(&atomic_storage[idx0*4+1], 0);
    atomicStore(&atomic_storage[idx0*4+2], 0);
    atomicStore(&atomic_storage[idx0*4+3], 0);
}

@compute @workgroup_size(16, 16)
fn Rasterize(@builtin(global_invocation_id) id: uint3) {
    // Viewport resolution (in pixels)
    let screen_size = int2(textureDimensions(screen));
    let screen_size_f = float2(screen_size);
    
    let ang = float2(mouse.pos.xy)*float2(-TWO_PI, PI)/screen_size_f + 1e-4;
    
    SetCamera(ang, FOV);

    //RNG state
    state = uint4(id.x, id.y, id.z, 0u);
    
    let rng = rand4();
    bokehRad = pow(rng.x, custom.BlurExponentA);

    if(mouse.click == 1 && custom.AnimatedNoise > 0.5)
    {
        state.w = time.frame;
    }

    var pix = int2(id.xy);

    if(pix.x > PARTICLE_COUNT || pix.y > PARTICLE_COUNT) 
    {   
        return;
    }

    var p = LoadParticle(pix);

    var pos = p.position.ywz;
    let vel = abs(p.velocity.ywz);
    var col = clamp(8.5*abs(vel)*dot(vel,vel)+0.1, float3(0.0), float3(5.0));
    col /= (0.1+bokehRad);
    let impSample = (col.x + col.y + col.z)*bokehRad;
    let sampleCount = clamp(int(impSample*custom.Samples*MaxSamples + 1.0), 1, 1024);
    let normalCount = int(custom.Samples*MaxSamples + 1.0);

    col *= float(normalCount)/float(sampleCount);

    for(var i = 0; i < sampleCount; i++)
    {
        let R = 2.0*custom.BlurRadius*bokehRad;
        let rng = rand4();
        let dpos = R*normalize(nrand4(1.0, float4(0.0)).xyz)*pow(rng.x, custom.BlurExponentB);
        RasterizePoint(pos + dpos, col);
    }
}

fn Sample(pos: int2) -> float3
{
    let screen_size = int2(textureDimensions(screen));
    let idx = pos.x + screen_size.x * pos.y;

    var color: float3;
        let x = float(atomicLoad(&atomic_storage[idx*4+0]))/(256.0);
        let y = float(atomicLoad(&atomic_storage[idx*4+1]))/(256.0);
        let z = float(atomicLoad(&atomic_storage[idx*4+2]))/(256.0);
        
        color = tanh(custom.Exposure*0.03*float(screen_size.x)*float3(x,y,z)/(custom.Samples*MaxSamples + 1.0));

    return abs(color);
}

@compute @workgroup_size(16, 16)
fn main_image(@builtin(global_invocation_id) id: uint3) 
{
    let screen_size = uint2(textureDimensions(screen));

    // Prevent overdraw for workgroups on the edge of the viewport
    if (id.x >= screen_size.x || id.y >= screen_size.y) { return; }

    // Pixel coordinates (centre of pixel, origin at bottom left)
    let fragCoord = float2(float(id.x) + .5, float(id.y) + .5);

  
    var color = float4(Sample(int2(id.xy)),1.0);

    let oldColor = textureLoad(pass_in, int2(id.xy), 2, 0);

    if(mouse.click == 1 && custom.AnimatedNoise > 0.5)
    {
        color += oldColor * custom.Accumulation;
    }

    // Output to buffer
    textureStore(pass_out, int2(id.xy), 2, color);

    textureStore(screen, int2(id.xy), float4(color.xyz/color.w, 1.));
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

  const timeBuffer = device.createBuffer({
    viewOrSize: 2 * Float32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.UNIFORM,
  });
  timeBuffer.setSubData(0, new Uint8Array(new Float32Array([0, 0]).buffer));
  const mouseBuffer = device.createBuffer({
    viewOrSize: 4 * Int32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.UNIFORM,
  });
  mouseBuffer.setSubData(0, new Uint8Array(new Uint32Array([0, 0, 0]).buffer));

  const customUniformBuffer = device.createBuffer({
    viewOrSize: 17 * Float32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.UNIFORM,
  });
  customUniformBuffer.setSubData(
    0,
    new Uint8Array(
      new Float32Array([
        1, // Radius
        0.039, // TimeStep
        0.03, // Samples
        0, // AnimatedNoise
        1, // Accumulation
        0.369, // Exposure
        0.393, // BlurExponentA
        0.81, // BlurExponentB
        0.743, // BlurRadius
        0.876, // KerrA
        0, // KerrQ
        0.719, // InitSpeed
        0.22, // InitThick
        0.387, // Steps
        0.53, // FocalPlane
        0.829, // MotionBlur
        0.827, // Gamma
      ]).buffer,
    ),
  );

  const storageBuffer = device.createBuffer({
    viewOrSize:
      $canvas.width * $canvas.height * 20 * Float32Array.BYTES_PER_ELEMENT,
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
        buffer: timeBuffer,
      },
      {
        binding: 2,
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
        binding: 0,
        buffer: timeBuffer,
      },
      {
        binding: 1,
        buffer: mouseBuffer,
      },
      {
        binding: 2,
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
        buffer: mouseBuffer,
      },
      {
        binding: 2,
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
    timeBuffer.setSubData(
      0,
      new Uint8Array(new Float32Array([t, time / 1000]).buffer),
    );
    mouseBuffer.setSubData(
      0,
      new Uint8Array(
        new Uint32Array([mouse.pos.x, mouse.pos.y, mouse.click]).buffer,
      ),
    );

    const x = Math.ceil($canvas.width / 16);
    const y = Math.ceil($canvas.height / 16);

    const computePass = device.createComputePass();
    computePass.setPipeline(simulateParticlesPipeline);
    computePass.setBindings(simulateParticlesBindings);
    computePass.dispatchWorkgroups(x, y);

    computePass.setPipeline(clearPipeline);
    computePass.setBindings(clearBindings);
    computePass.dispatchWorkgroups(x, y);

    computePass.setPipeline(rasterizePipeline);
    computePass.setBindings(rasterizeBindings);
    computePass.dispatchWorkgroups(x, y);

    computePass.setPipeline(mainImagePipeline);
    computePass.setBindings(mainImageBindings);
    computePass.dispatchWorkgroups(x, y);
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
    timeBuffer.destroy();
    mouseBuffer.destroy();
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
