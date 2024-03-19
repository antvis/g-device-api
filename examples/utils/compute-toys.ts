import {
  AddressMode,
  Device,
  FilterMode,
  Format,
  MipmapFilterMode,
  ProgramDescriptor,
  Texture,
} from '../../src';

/**
 * Use naga-oil to combine and manipulate shaders.
 * The order is important.
 */
export function registerShaderModule(device: Device, shader: string): string {
  const compiler = device['WGSLComposer'];
  return compiler.load_composable(alias + shader);
}

export function defineStr(k: string, v: string): string {
  return `#define ${k} ${v}`;
}

export function createProgram(
  device: Device,
  desc: ProgramDescriptor,
  defines?: Record<string, boolean | number>,
) {
  const compiler = device['WGSLComposer'];

  // Prepend defines.
  const prefix =
    Object.keys(defines || {})
      .map((key) => {
        return defineStr(key, '');
      })
      .join('\n') + '\n';

  Object.keys(desc).forEach((key) => {
    desc[key].wgsl = alias + desc[key].wgsl;

    if (desc[key].defines) {
      desc[key].wgsl = prefix + desc[key].wgsl;
    }
    // Use naga-oil to combine shaders.
    desc[key].wgsl = compiler.wgsl_compile(desc[key].wgsl);
  });

  return device.createProgram(desc);
}

// We cannot use alias for now. @see https://github.com/bevyengine/naga_oil/issues/79
export const alias = /* wgsl */ `
// alias int = i32;
// alias uint = u32;
// alias float = f32;
// alias int2 = vec2<i32>;
// alias int3 = vec3<i32>;
// alias int4 = vec4<i32>;
// alias uint2 = vec2<u32>;
// alias uint3 = vec3<u32>;
// alias uint4 = vec4<u32>;
// alias float2 = vec2<f32>;
// alias float3 = vec3<f32>;
// alias float4 = vec4<f32>;
// alias bool2 = vec2<bool>;
// alias bool3 = vec3<bool>;
// alias bool4 = vec4<bool>;
// alias float2x2 = mat2x2<f32>;
// alias float2x3 = mat2x3<f32>;
// alias float2x4 = mat2x4<f32>;
// alias float3x2 = mat3x2<f32>;
// alias float3x3 = mat3x3<f32>;
// alias float3x4 = mat3x4<f32>;
// alias float4x2 = mat4x2<f32>;
// alias float4x3 = mat4x3<f32>;
// alias float4x4 = mat4x4<f32>;
`;

/**
 * @see https://github.com/compute-toys/wgpu-compute-toy/blob/master/src/lib.rs#L367
 * @see https://github.com/compute-toys/wgpu-compute-toy/blob/master/src/bind.rs#L437
 */
export const prelude = /* wgsl */ `
#define_import_path prelude

struct Time {
  frame: u32,
  elapsed: f32
}

struct Mouse { 
  pos: vec2<u32>, 
  click: i32
}

@group(0) @binding(0) var<uniform> time : Time;
@group(0) @binding(1) var<uniform> mouse: Mouse;
@group(1) @binding(0) var pass_in: texture_2d_array<f32>;
@group(1) @binding(1) var bilinear: sampler;
@group(3) @binding(0) var screen : texture_storage_2d<rgba16float, write>;
@group(3) @binding(1) var pass_out: texture_storage_2d_array<rgba16float,write>;

fn passStore(pass_index: i32, coord: vec2<i32>, value: vec4<f32>) {
  textureStore(pass_out, coord, pass_index, value);
}

fn passLoad(pass_index: i32, coord: vec2<i32>, lod: i32) -> vec4<f32> {
  return textureLoad(pass_in, coord, pass_index, lod);
}

fn passSampleLevelBilinearRepeat(pass_index: i32, uv: vec2<f32>, lod: f32) -> vec4<f32> {
  return textureSampleLevel(pass_in, bilinear, fract(uv), pass_index, lod);
}
`;

/**
 * https://github.com/compute-toys/wgpu-compute-toy/blob/master/src/blit.wgsl
 */
export function createBlitPipelineAndBindings(device: Device, screen: Texture) {
  const sampler = device.createSampler({
    addressModeU: AddressMode.CLAMP_TO_EDGE,
    addressModeV: AddressMode.CLAMP_TO_EDGE,
    minFilter: FilterMode.BILINEAR,
    magFilter: FilterMode.BILINEAR,
    mipmapFilter: MipmapFilterMode.LINEAR,
  });

  const renderProgram = device.createProgram({
    vertex: {
      entryPoint: 'fullscreen_vertex_shader',
      wgsl: /* wgsl */ `
struct FullscreenVertexOutput {
  @builtin(position)
  position: vec4<f32>,
  @location(0)
  uv: vec2<f32>,
};

// This vertex shader produces the following, when drawn using indices 0..3:
//
//  1 |  0-----x.....2
//  0 |  |  s  |  . ´
// -1 |  x_____x´
// -2 |  :  .´
// -3 |  1´
//    +---------------
//      -1  0  1  2  3
//
// The axes are clip-space x and y. The region marked s is the visible region.
// The digits in the corners of the right-angled triangle are the vertex
// indices.
//
// The top-left has UV 0,0, the bottom-left has 0,2, and the top-right has 2,0.
// This means that the UV gets interpolated to 1,1 at the bottom-right corner
// of the clip-space rectangle that is at 1,-1 in clip space.
@vertex
fn fullscreen_vertex_shader(@builtin(vertex_index) vertex_index: u32) -> FullscreenVertexOutput {
  // See the explanation above for how this works
  let uv = vec2<f32>(f32(vertex_index >> 1u), f32(vertex_index & 1u)) * 2.0;
  let clip_position = vec4<f32>(uv * vec2<f32>(2.0, -2.0) + vec2<f32>(-1.0, 1.0), 0.0, 1.0);

  return FullscreenVertexOutput(clip_position, uv);
}
`,
    },
    fragment: {
      entryPoint: 'fs_main_linear_to_srgb',
      wgsl: /* wgsl */ `
struct FullscreenVertexOutput {
  @builtin(position)
  position: vec4<f32>,
  @location(0)
  uv: vec2<f32>,
};

@group(1) @binding(0) var in_texture : texture_2d<f32>;
@group(1) @binding(1) var in_sampler : sampler;

fn srgb_to_linear(rgb: vec3<f32>) -> vec3<f32> {
  return select(
      pow((rgb + 0.055) * (1.0 / 1.055), vec3<f32>(2.4)),
      rgb * (1.0/12.92),
      rgb <= vec3<f32>(0.04045));
}

fn linear_to_srgb(rgb: vec3<f32>) -> vec3<f32> {
  return select(
      1.055 * pow(rgb, vec3(1.0 / 2.4)) - 0.055,
      rgb * 12.92,
      rgb <= vec3<f32>(0.0031308));
}
    
@fragment
fn fs_main(in: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    return textureSample(in_texture, in_sampler, in.uv);
}

@fragment
fn fs_main_linear_to_srgb(in: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let rgba = textureSample(in_texture, in_sampler, in.uv);
    return vec4<f32>(linear_to_srgb(rgba.rgb), rgba.a);
}

@fragment
fn fs_main_rgbe_to_linear(in: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let rgbe = textureSample(in_texture, in_sampler, in.uv);
    return vec4<f32>(rgbe.rgb * exp2(rgbe.a * 255. - 128.), 1.);
}
`,
    },
  });

  const renderPipeline = device.createRenderPipeline({
    inputLayout: null,
    program: renderProgram,
    colorAttachmentFormats: [Format.U8_RGBA_RT],
  });
  const showResultBindings = device.createBindings({
    pipeline: renderPipeline,
    samplerBindings: [
      {
        texture: screen, // Binding = 0
        sampler, // Binding = 1
      },
    ],
  });

  return {
    pipeline: renderPipeline,
    bindings: showResultBindings,
  };
}

export const math = /* wgsl */ `
#define_import_path math

const PI = 3.14159265;
const TWO_PI = 6.28318530718;

var<private> state : vec4<u32>;

fn pcg4d(a: vec4<u32>) -> vec4<u32>
{
  var v = a * 1664525u + 1013904223u;
    v.x += v.y*v.w; v.y += v.z*v.x; v.z += v.x*v.y; v.w += v.y*v.z;
    v = v ^  ( v >> vec4<u32>(16u) );
    v.x += v.y*v.w; v.y += v.z*v.x; v.z += v.x*v.y; v.w += v.y*v.z;
    return v;
}

fn rand4() -> vec4<f32>
{ 
    state = pcg4d(state);
    return vec4<f32>(state)/f32(0xffffffffu); 
}

fn nrand4(sigma: f32, mean: vec4<f32>) -> vec4<f32>
{
    let Z = rand4();
    return mean + sigma * sqrt(-2.0 * log(Z.xxyy)) * 
    vec4<f32>(cos(TWO_PI * Z.z),sin(TWO_PI * Z.z),cos(TWO_PI * Z.w),sin(TWO_PI * Z.w));
}

fn disk(r: vec2<f32>) -> vec2<f32>
{
    return vec2(sin(TWO_PI*r.x), cos(TWO_PI*r.x))*(r.y);
}

fn sqr(x: f32) -> f32
{
    return x*x;
}

fn diag(a: vec4<f32>) -> mat4x4<f32>
{
    return mat4x4<f32>(
        a.x,0.0,0.0,0.0,
        0.0,a.y,0.0,0.0,
        0.0,0.0,a.z,0.0,
        0.0,0.0,0.0,a.w
    );
}

fn rand4s(seed: vec4<u32>) -> vec4<f32>
{ 
    return vec4<f32>(pcg4d(seed))/f32(0xffffffffu); 
}
`;

export const camera = /* wgsl */ `
#define_import_path camera

struct Camera 
{
  pos: vec3<f32>,
  cam: mat3x3<f32>,
  fov: f32,
  size: vec2<f32>
}

var<private> camera : Camera;

fn GetCameraMatrix(ang: vec2<f32>) -> mat3x3<f32>
{
    let x_dir = vec3<f32>(cos(ang.x)*sin(ang.y), cos(ang.y), sin(ang.x)*sin(ang.y));
    let y_dir = normalize(cross(x_dir, vec3<f32>(0.0,1.0,0.0)));
    let z_dir = normalize(cross(y_dir, x_dir));
    return mat3x3<f32>(-x_dir, y_dir, z_dir);
}

//project to clip space
fn Project(cam: Camera, p: vec3<f32>) -> vec3<f32>
{
    let td = distance(cam.pos, p);
    let dir = (p - cam.pos)/td;
    let screen = dir*cam.cam;
    return vec3<f32>(screen.yz*cam.size.y/(cam.fov*screen.x) + 0.5*cam.size,screen.x*td);
}
  `;

export const particle = /* wgsl */ `
#define_import_path particle

#import prelude::{pass_in, pass_out};
#import camera::{Project, camera};

struct Particle
{
    position: vec4<f32>,
    velocity: vec4<f32>,
}

@group(2) @binding(0) var<storage, read_write> atomic_storage : array<atomic<i32>>;

fn AdditiveBlend(color: vec3<f32>, depth: f32, index: i32)
{
    let scaledColor = 256.0 * color/depth;

    atomicAdd(&atomic_storage[index*4+0], i32(scaledColor.x));
    atomicAdd(&atomic_storage[index*4+1], i32(scaledColor.y));
    atomicAdd(&atomic_storage[index*4+2], i32(scaledColor.z));
}

fn RasterizePoint(pos: vec3<f32>, color: vec3<f32>)
{
    let screen_size = vec2<i32>(camera.size);
    let projectedPos = Project(camera, pos);
    
    let screenCoord = vec2<i32>(projectedPos.xy);
    
    //outside of our view
    if(screenCoord.x < 0 || screenCoord.x >= screen_size.x || 
        screenCoord.y < 0 || screenCoord.y >= screen_size.y || projectedPos.z < 0.0)
    {
        return;
    }

    let idx = screenCoord.x + screen_size.x * screenCoord.y;
    
    AdditiveBlend(color, projectedPos.z, idx);
}

fn LoadParticle(pix: vec2<i32>) -> Particle
{
    var p: Particle;
    p.position = textureLoad(pass_in, pix, 0, 0); 
    p.velocity = textureLoad(pass_in, pix, 1, 0);
    return p;
}

fn SaveParticle(pix: vec2<i32>, p: Particle) 
{
    textureStore(pass_out, pix, 0, p.position); 
    textureStore(pass_out, pix, 1, p.velocity); 
}
`;
