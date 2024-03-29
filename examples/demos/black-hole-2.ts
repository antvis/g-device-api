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

@group(0) @binding(1) var<uniform> custom: Custom;
  `;

  registerShaderModule(device, prelude);
  registerShaderModule(device, math);
  registerShaderModule(device, custom);
  registerShaderModule(device, camera);
  registerShaderModule(device, particle);

  const computeWgsl = /* wgsl */ `
#import prelude::{screen, time, pass_in, pass_out};
#import math::{PI, TWO_PI, state, rand4, nrand4, rand4s, sqr, diag, disk};
#import camera::{Camera, GetCameraMatrix, Project, camera};
#import particle::{Particle, LoadParticle, SaveParticle};
#import custom::{Custom, custom};

fn SetCamera(ang: vec2f, fov: f32)
{
    camera.fov = fov;
    camera.cam = GetCameraMatrix(ang); 
    camera.pos = - (camera.cam*vec3f(50.0*custom.Radius+0.5,0.0,0.0));
    camera.size = vec2f(textureDimensions(screen));
}

@group(2) @binding(0) var<storage, read_write> grid : ScreenIndexGrid;

const SCREEN_WIDTH: f32 = 400.0;
const SCREEN_HEIGHT: f32 = 400.0;
const SCREEN_GRID_X = 128u;
const SCREEN_GRID_Y = 64u;
const GRID_STORAGE = 3000u;
const PARTICLE_RAD = 32.0;

//store the id's of the particles in each screen "cell"
struct ScreenIndexGrid 
{
    count: array<array<atomic<u32>, SCREEN_GRID_Y>, SCREEN_GRID_X>,
    ids: array<array<array<u32, GRID_STORAGE>, SCREEN_GRID_Y>, SCREEN_GRID_X>
}

fn GetCellID(pos: vec2u) -> vec2u
{
    let uv = vec2f(pos) / vec2f(SCREEN_WIDTH, SCREEN_HEIGHT);
    return vec2u(floor(uv * vec2f(f32(SCREEN_GRID_X), f32(SCREEN_GRID_Y))) - 1);
}

fn AddToCell(cell: vec2u, id: u32)
{
    let cid = atomicAdd(&grid.count[cell.x][cell.y], 1u);
    if(cid < GRID_STORAGE)
    {
        grid.ids[cell.x][cell.y][cid] = id;
    }
}

fn AddParticle(pos: vec2u, id: u32)
{
    let cell = GetCellID(pos);
    AddToCell(cell, id);
}

fn AddParticleQuad(pos0: vec2u, pos1: vec2u, id: u32)
{
    let cell0 = GetCellID(pos0);
    let cell1 = GetCellID(pos1);
    
    for(var i = cell0.x; i <= cell1.x; i++)
    {
        for(var j = cell0.y; j <= cell1.y; j++)
        {
            AddToCell(vec2u(i, j), id);
        }
    }
}

fn ClearCell(cell: vec2u)
{
    atomicStore(&grid.count[cell.x][cell.y], 0u);
}
 
const MaxSamples = 8.0;
const FOV = 0.8;

//sqrt of particle count
const PARTICLE_COUNT = 128u;
//PARTICLE_COUNT / 16
const PARTICLE_COUNT_16 = 16u;
const DEPTH_MIN = 0.2;
const DEPTH_MAX = 5.0;
const DEPTH_BITS = 16u;
const dq = vec2f(0.0, 1.0);
const eps = 0.01;

fn GetParticleID(pix: vec2i) -> u32
{
    return u32(pix.x) + u32(pix.y)*PARTICLE_COUNT;
}

fn GetParticlePix(id: u32) -> vec2i
{
    return vec2i(i32(id%PARTICLE_COUNT), i32(id/PARTICLE_COUNT));
}

const KerrM = 1.0;

struct GeodesicRay
{    
    q:  vec4f,
    qt: vec4f,
    p:  vec4f,
}; 

var<private> bokehRad : f32;

fn sdLine(p: vec2f, a: vec2f, b: vec2f) -> f32
{
    let pa = p - a;
    let ba = b - a;
    let h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
    return length(pa - ba*h);
}

fn KerrGetR2(p: vec3f) -> f32
{
    let rho = dot(p,p) - sqr(custom.KerrA);
    let r2 = 0.5 * (rho + sqrt(sqr(rho) + sqr(2.0 * custom.KerrA * p.z)));
    return r2;
}

fn KerrGetK(p: vec3f) -> vec4f
{
    let r2 = KerrGetR2(p);
    let r = sqrt(r2);
    let invr2 = 1.0 / (r2 + sqr(custom.KerrA) + 1e-3); 
    let  k = vec3f((r*p.x - custom.KerrA*p.y) * invr2, (r*p.y + custom.KerrA*p.x) * invr2, p.z/(r + 1e-4));
    let f = r2 * (2.0 * KerrM * r - sqr(custom.KerrQ)) / (r2 * r2 + sqr(custom.KerrA * p.z) + 1e-3);
    return vec4f(k, f);
}

fn G(q: vec4f) -> mat4x4f 
{
    //Kerr metric in Kerr-Schild coordinates 
    let k = KerrGetK(q.yzw);
    let kf = k.w*vec4f(1.0, k.xyz);
    return diag(vec4f(-1.0,1.0,1.0,1.0)) + mat4x4f(kf, k.x*kf, k.y*kf, k.z*kf);    
}

fn Ginv(q: vec4f) -> mat4x4f 
{
    //inverse of Kerr metric in Kerr-Schild coordinates 
    let k = KerrGetK(q.yzw);
    let kf = k.w*vec4(1.0, -k.xyz)/dot(k.xyz, k.xyz);
    return diag(vec4f(-1.0,1.0,1.0,1.0)) + mat4x4f(-kf, k.x*kf, k.y*kf, k.z*kf); 
}

//lagrangian
fn Lmat(qt: vec4f, g: mat4x4f) -> f32 
{
    return   g[0][0]*qt.x*qt.x + g[1][1]*qt.y*qt.y + g[2][2]*qt.z*qt.z + g[3][3]*qt.w*qt.w +
        2.0*(g[0][1]*qt.x*qt.y + g[0][2]*qt.x*qt.z + g[0][3]*qt.x*qt.w +
                g[1][2]*qt.y*qt.z + g[1][3]*qt.y*qt.w +
                g[2][3]*qt.z*qt.w);
}

fn L(qt: vec4f, q: vec4f) -> f32 
{
    return Lmat(qt, G(q));
}

fn H(p: vec4f, ginv: mat4x4f) -> f32 
{
    return Lmat(p, ginv);
}

fn  ToMomentum(ray: GeodesicRay) -> vec4f 
{
    return G(ray.q)*ray.qt; 
}

fn  FromMomentum(ray: GeodesicRay) -> vec4f 
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

fn HamiltonianGradient(ray: GeodesicRay) -> vec4f 
{
    let ginv = Ginv(ray.q);
    let H0 = H(ray.p, ginv);
    let delta = 0.1; 
    return (vec4f(
        L(ray.qt,ray.q+delta*dq.yxxx),
        L(ray.qt,ray.q+delta*dq.xyxx),
        L(ray.qt,ray.q+delta*dq.xxyx),
        L(ray.qt,ray.q+delta*dq.xxxy)) - H0)/delta;
}

fn VelClamp(vel: vec4f) -> vec4f
{
    return vel;//vec4f(vel.x, vel.yzw / max(1.0, length(vel.yzw)));
}

@compute @workgroup_size(16, 16)
fn SimulateParticles(@builtin(global_invocation_id) id: vec3u) 
{
    var pix = vec2i(id.xy);
    var p = LoadParticle(pix);

    if(pix.x > i32(PARTICLE_COUNT) || pix.y > i32(PARTICLE_COUNT)) 
    {   
        return;
    }

    state = vec4u(id.x, id.y, id.z, time.frame);
    
    let r = sqrt(KerrGetR2(p.position.yzw));

    if(time.frame == 0u || r < 0.9 || r > 30.0)
    {
        let rng = rand4();
        let rng1 = rand4();
        p.position = 30.0*vec4f(1.0, 1.0, 1.0, custom.InitThick) * vec4f(0.0,2.0*rng.xyz - 1.0);

        let r01 = sqrt(KerrGetR2(p.position.yzw)); 
        if(r01 < 0.9)
        {
            return;
        }

        var vel = normalize(cross(p.position.yzw, vec3f(0.0,0.0,1.0)));

        vel += 0.3*(rng1.xyz * 0.5 - 0.25);
        let vscale = clamp(1.0 / (0.2 + 0.08*r01), 0., 1.0);
        p.velocity = vec4f(-1.0,2.0*(custom.InitSpeed - 0.5)*vel*vscale);
    }

   
    
    var ray = ParticleToGeodesic(p);

    // if(mouse.click == 1) 
    // {
    //    // return;
    // }
   
    for(var i = 0; i < i32(custom.Steps*16.0 + 1.0); i++)
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
fn ClearScreenGrid(@builtin(global_invocation_id) id: vec3u) 
{
    let cell = id.xy;
    ClearCell(cell);
}

@compute @workgroup_size(16, 16)
fn UpdateScreenGrid(@builtin(global_invocation_id) id: vec3u) {
    let screen_size = vec2i(textureDimensions(screen));
    let screen_size_f = vec2f(screen_size);
    
    let ang = vec2f(0.0, 0.0);
    // let ang = vec2f(mouse.pos.xy)*vec2f(-TWO_PI, PI)/screen_size_f + 1e-4;
    
    SetCamera(ang, FOV);

    var pix = vec2i(id.xy);

    if(pix.x > i32(PARTICLE_COUNT) || pix.y > i32(PARTICLE_COUNT)) 
    {
        return;
    }

    var p = LoadParticle(pix);
    var pos = p.position.ywz;
    let projectedPos = Project(camera, pos);
    let screenCoord = vec2i(projectedPos.xy);
    
    //outside of our view
    if(screenCoord.x < 0 || screenCoord.x >= screen_size.x || 
        screenCoord.y < 0 || screenCoord.y >= screen_size.y || projectedPos.z < 0.0)
    {
        return;
    }
    let pos0 = vec2u(clamp(screenCoord - i32(PARTICLE_RAD), vec2i(0), screen_size));
    let pos1 = vec2u(clamp(screenCoord + i32(PARTICLE_RAD), vec2i(0), screen_size));
    AddParticleQuad(pos0, pos1, GetParticleID(pix));
}

fn hue(v: f32) -> vec4f {
    return .6 + .6 * cos(6.3 * v + vec4f(0.,23.,21.,0.));
}

fn RenderParticles(pix: vec2u) -> vec3f
{
    //setup camera
    let screen_size = vec2i(textureDimensions(screen));
    let screen_size_f = vec2f(screen_size);

    let ang = vec2f(0.0, 0.0);
    // let ang = vec2f(mouse.pos.xy)*vec2f(-TWO_PI, PI)/screen_size_f + 1e-4;
    SetCamera(ang, FOV);

    //loop over particles in screen cell
    let fpix = vec2f(pix);
    let cell = GetCellID(pix);
    let pcount = min(atomicLoad(&grid.count[cell.x][cell.y]), GRID_STORAGE);

    // //heatmap
    // //return vec3f(vec3u(pcount))/f32(GRID_STORAGE);

    var color = vec3f(0.0);
    for(var i = 0u; i < pcount; i++)
    {
        let pid = grid.ids[cell.x][cell.y][i];
        var p = LoadParticle(GetParticlePix(pid));
        var pos = p.position.ywz;
        let vel = p.velocity.ywz;
        var ang = atan2(vel.x, vel.z+0.000001)/6.28;
        ang += (rand4s(vec4u(pid, 0, 0, 0)).x - 0.5)*0.33;
        var col = hue(ang).xyz;
        
        let projectedPos0 = Project(camera, pos - vel*custom.MotionBlur);
        let projectedPos1 = Project(camera, pos + vel*custom.MotionBlur);
        let vlen = distance(projectedPos0.xy, projectedPos1.xy);
        let pdist = sdLine(fpix, projectedPos0.xy, projectedPos1.xy);
        let R = clamp(2.0*custom.BlurRadius*abs(projectedPos0.z- 100.*custom.FocalPlane), 1.5, PARTICLE_RAD);
        //color = color + 0.05*vec3f(1,1,1)*smoothstep(PARTICLE_RAD, 0.0, pdist)/(0.25 + pdist*pdist);
        let area = R*vlen + R*R;
        color += 20.0*col*smoothstep(R, R - 1.0, pdist) / area;
    }
    let exposure = screen_size_f.x * screen_size_f.y *custom.Exposure / (896*504);
    color = 1.0 - exp(-exposure*color);
    return pow(color, vec3f(3.0*custom.Gamma));
}

@compute @workgroup_size(16, 16)
fn main_image(@builtin(global_invocation_id) id: vec3u) 
{
    let screen_size = vec2u(textureDimensions(screen));

    // Prevent overdraw for workgroups on the edge of the viewport
    if (id.x >= screen_size.x || id.y >= screen_size.y) { return; }

    let color = vec4f(RenderParticles(id.xy), 1.0);

    textureStore(screen, vec2i(id.xy), vec4f(color.xyz/color.w, 1.));
}
          `;

  const simulateParticlesProgram = createProgram(device, {
    compute: {
      entryPoint: 'SimulateParticles',
      wgsl: computeWgsl,
    },
  });
  const clearScreenGridProgram = createProgram(device, {
    compute: {
      entryPoint: 'ClearScreenGrid',
      wgsl: computeWgsl,
    },
  });
  const updateScreenGridProgram = createProgram(device, {
    compute: {
      entryPoint: 'UpdateScreenGrid',
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
    viewOrSize: 17 * Float32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.UNIFORM,
  });
  customUniformBuffer.setSubData(
    0,
    new Uint8Array(
      new Float32Array([
        1, // Radius
        0.072, // TimeStep
        0.218, // Samples
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
      $canvas.width * $canvas.height * 4 * Float32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.STORAGE,
  });

  const simulateParticlesPipeline = device.createComputePipeline({
    inputLayout: null,
    program: simulateParticlesProgram,
  });
  const clearScreenGridPipeline = device.createComputePipeline({
    inputLayout: null,
    program: clearScreenGridProgram,
  });
  const updateScreenGridPipeline = device.createComputePipeline({
    inputLayout: null,
    program: updateScreenGridProgram,
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
  const clearScreenGridBindings = device.createBindings({
    pipeline: clearScreenGridPipeline,
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
  const updateScreenGridBindings = device.createBindings({
    pipeline: updateScreenGridPipeline,
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
    device.beginFrame();

    uniformBuffer.setSubData(
      0,
      new Uint8Array(new Float32Array([t, time / 1000]).buffer),
    );

    const x = Math.ceil($canvas.width / 16);
    const y = Math.ceil($canvas.height / 16);

    const computePass = device.createComputePass();
    computePass.setPipeline(simulateParticlesPipeline);
    computePass.setBindings(simulateParticlesBindings);
    computePass.dispatchWorkgroups(x, y);

    computePass.setPipeline(clearScreenGridPipeline);
    computePass.setBindings(clearScreenGridBindings);
    computePass.dispatchWorkgroups(32, 16);

    // #workgroup_count ClearGrid PARTICLE_COUNT_16 PARTICLE_COUNT_16 1
    computePass.setPipeline(updateScreenGridPipeline);
    computePass.setBindings(updateScreenGridBindings);
    computePass.dispatchWorkgroups(16, 16);

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
    // clearPipeline.destroy();
    // clearProgram.destroy();
    // clearPipeline.destroy();
    // rasterizeProgram.destroy();
    // rasterizePipeline.destroy();
    // mainImageProgram.destroy();
    // mainImagePipeline.destroy();
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
