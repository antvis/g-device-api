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
  createBlitPipelineAndBindings,
  createProgram,
  prelude,
  registerShaderModule,
} from '../utils/compute-toys';

/**
 * 3D Atomic rasterizer
 * @see https://compute.toys/view/21
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

  const camera = /* wgsl */ ``;

  registerShaderModule(device, prelude);
  registerShaderModule(device, custom);
  // registerShaderModule(device, camera);

  const computeWgsl = /* wgsl */ `
#import prelude::{screen, time, pass_in, pass_out};
#import custom::{custom};

@group(2) @binding(0) var<storage, read_write> atomic_storage : array<atomic<i32>>;

const MaxSamples = 256.0;
const FOV = 0.8;
const PI = 3.14159265;
const TWO_PI = 6.28318530718;
//sqrt of particle count
const PARTICLE_COUNT = 60;

const DEPTH_MIN = 0.2;
const DEPTH_MAX = 5.0;
const DEPTH_BITS = 16u;

struct Camera 
{
  pos: float3,
  cam: float3x3,
  fov: float,
  size: float2
}

struct Particle
{
    position: float4,
    velocity: float4,
}

var<private> camera : Camera;
var<private> state : uint4;
var<private> bokehRad : float;

fn pcg4d(a: uint4) -> uint4
{
	var v = a * 1664525u + 1013904223u;
    v.x += v.y*v.w; v.y += v.z*v.x; v.z += v.x*v.y; v.w += v.y*v.z;
    v = v ^  ( v >> uint4(16u) );
    v.x += v.y*v.w; v.y += v.z*v.x; v.z += v.x*v.y; v.w += v.y*v.z;
    return v;
}

fn rand4() -> float4
{ 
    state = pcg4d(state);
    return float4(state)/float(0xffffffffu); 
}

fn nrand4(sigma: float, mean: float4) -> float4
{
    let Z = rand4();
    return mean + sigma * sqrt(-2.0 * log(Z.xxyy)) * 
           float4(cos(TWO_PI * Z.z),sin(TWO_PI * Z.z),cos(TWO_PI * Z.w),sin(TWO_PI * Z.w));
}

fn disk(r: float2) -> float2
{
    return vec2(sin(TWO_PI*r.x), cos(TWO_PI*r.x))*(r.y);
}

fn GetCameraMatrix(ang: float2) -> float3x3
{
    let x_dir = float3(cos(ang.x)*sin(ang.y), cos(ang.y), sin(ang.x)*sin(ang.y));
    let y_dir = normalize(cross(x_dir, float3(0.0,1.0,0.0)));
    let z_dir = normalize(cross(y_dir, x_dir));
    return float3x3(-x_dir, y_dir, z_dir);
}

fn SetCamera(ang: float2, fov: float)
{
    camera.fov = fov;
    camera.cam = GetCameraMatrix(ang); 
    camera.pos = - (camera.cam*float3(15.0*custom.Radius+0.5,0.0,0.0));
    camera.size = float2(textureDimensions(screen));
}

//project to clip space
fn Project(cam: Camera, p: float3) -> float3
{
    let td = distance(cam.pos, p);
    let dir = (p - cam.pos)/td;
    let screen = dir*cam.cam;
    return float3(screen.yz*cam.size.y/(cam.fov*screen.x) + 0.5*cam.size,screen.x*td);
}

fn LoadParticle(pix: int2) -> Particle
{
    var p: Particle;
    p.position = textureLoad(pass_in, pix, 0, 0); 
    p.velocity = textureLoad(pass_in, pix, 1, 0);
    return p;
}

fn SaveParticle(pix: int2, p: Particle) 
{
    textureStore(pass_out, pix, 0, p.position); 
    textureStore(pass_out, pix, 1, p.velocity); 
}

fn ForceField(pos: float3, t: float) -> float4
{
    let a0 = float3(sin(t),cos(0.4*t),cos(t));
    let d = distance(pos, a0);
    let F = (a0 - pos)*(1.0/(d*d*d + 1e-3) - 0.4/(d*d*d*d + 1e-3)) + 1e-3;
    return 0.2*float4(F, 0.0);
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
    
    if(time.frame == 0u)
    {
        let rng = rand4();
        p.position = float4(2.0*rng.xyz - 1.0, 0.0);
        p.velocity = float4(0.0,0.0,0.0,0.0);
    }
    let t = fract(custom.Speed*float(time.frame)/800.0)*30.0;

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

// @compute @workgroup_size(16, 16)
// fn Clear(@builtin(global_invocation_id) id: uint3) {
//     let screen_size = int2(textureDimensions(screen));
//     let idx0 = int(id.x) + int(screen_size.x * int(id.y));

//     atomicStore(&atomic_storage[idx0*4+0], 0);
//     atomicStore(&atomic_storage[idx0*4+1], 0);
//     atomicStore(&atomic_storage[idx0*4+2], 0);
//     atomicStore(&atomic_storage[idx0*4+3], 0);
// }

// fn AdditiveBlend(color: float3, depth: float, index: int)
// {
//     let scaledColor = 256.0 * color/depth;

//     atomicAdd(&atomic_storage[index*4+0], int(scaledColor.x));
//     atomicAdd(&atomic_storage[index*4+1], int(scaledColor.y));
//     atomicAdd(&atomic_storage[index*4+2], int(scaledColor.z));
// }


// fn RasterizePoint(pos: float3, color: float3)
// {
//     let screen_size = int2(camera.size);
//     let projectedPos = Project(camera, pos);
    
//     let screenCoord = int2(projectedPos.xy);
    
//     //outside of our view
//     if(screenCoord.x < 0 || screenCoord.x >= screen_size.x || 
//         screenCoord.y < 0 || screenCoord.y >= screen_size.y || projectedPos.z < 0.0)
//     {
//         return;
//     }

//     let idx = screenCoord.x + screen_size.x * screenCoord.y;
    
//     AdditiveBlend(color, projectedPos.z, idx);
// }

// @compute @workgroup_size(16, 16)
// fn Rasterize(@builtin(global_invocation_id) id: uint3) {
//     // Viewport resolution (in pixels)
//     let screen_size = int2(textureDimensions(screen));
//     let screen_size_f = float2(screen_size);
    
//     let ang = float2(-TWO_PI, PI)/screen_size_f + 1e-4;
//     // let ang = float2(mouse.pos.xy)*float2(-TWO_PI, PI)/screen_size_f + 1e-4;
    
//     SetCamera(ang, FOV);

//     //RNG state
//     state = uint4(id.x, id.y, id.z, 0u);
    
//     let rng = rand4();
//     bokehRad = pow(rng.x, custom.BlurExponentA);

//     // if(mouse.click == 1 && custom.AnimatedNoise > 0.5)
//     // {
//     //     state.w = time.frame;
//     // }

//     var pix = int2(id.xy);

//     if(pix.x > PARTICLE_COUNT || pix.y > PARTICLE_COUNT) 
//     {   
//         return;
//     }

//     var p = LoadParticle(pix);

//     var pos = p.position.xyz;
//     var col = 5.5*abs(p.velocity.xyz)*dot(p.velocity,p.velocity)+0.1;
//     col /= (0.1+bokehRad);
//     let impSample = (col.x + col.y + col.z)*bokehRad;
//     let sampleCount = clamp(int(impSample*custom.Samples*MaxSamples + 1.0), 1, 1024);
//     let normalCount = int(custom.Samples*MaxSamples + 1.0);

//     col *= float(normalCount)/float(sampleCount);

//     for(var i = 0; i < sampleCount; i++)
//     {
//         let R = 2.0*custom.BlurRadius*bokehRad;
//         let rng = rand4();
//         let dpos = R*normalize(nrand4(1.0, float4(0.0)).xyz)*pow(rng.x, custom.BlurExponentB);
//         RasterizePoint(pos + dpos, col);
//     }
// }

// fn Sample(pos: int2) -> float3
// {
//     let screen_size = int2(textureDimensions(screen));
//     let idx = pos.x + screen_size.x * pos.y;

//     var color: float3;
//         let x = float(atomicLoad(&atomic_storage[idx*4+0]))/(256.0);
//         let y = float(atomicLoad(&atomic_storage[idx*4+1]))/(256.0);
//         let z = float(atomicLoad(&atomic_storage[idx*4+2]))/(256.0);
        
//         color = tanh(custom.Exposure*0.03*float(screen_size.x)*float3(x,y,z)/(custom.Samples*MaxSamples + 1.0));

//     return abs(color);
// }

// @compute @workgroup_size(16, 16)
// fn main_image(@builtin(global_invocation_id) id: uint3) 
// {
//     let screen_size = uint2(textureDimensions(screen));

//     // Prevent overdraw for workgroups on the edge of the viewport
//     if (id.x >= screen_size.x || id.y >= screen_size.y) { return; }

//     // Pixel coordinates (centre of pixel, origin at bottom left)
//     let fragCoord = float2(float(id.x) + .5, float(id.y) + .5);

  
//     var color = float4(Sample(int2(id.xy)),1.0);

//     let oldColor = textureLoad(pass_in, int2(id.xy), 2, 0);

//     // if(mouse.click == 1 && custom.AnimatedNoise > 0.5)
//     // {
//     //     color += oldColor * custom.Accumulation;
//     // }
    
//     // Output to buffer
//     textureStore(pass_out, int2(id.xy), 2, color);

//     textureStore(screen, int2(id.xy), float4(color.xyz/color.w, 1.));
// }
          `;

  const simulateParticlesProgram = createProgram(device, {
    compute: {
      entryPoint: 'SimulateParticles',
      wgsl: computeWgsl,
    },
  });
  // const clearProgram = createProgram(device, {
  //   compute: {
  //     entryPoint: 'Clear',
  //     wgsl: computeWgsl,
  //   },
  // });
  // const rasterizeProgram = createProgram(device, {
  //   compute: {
  //     entryPoint: 'Rasterize',
  //     wgsl: computeWgsl,
  //   },
  // });
  // const mainImageProgram = createProgram(device, {
  //   compute: {
  //     entryPoint: 'main_image',
  //     wgsl: computeWgsl,
  //   },
  // });

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
  // const clearPipeline = device.createComputePipeline({
  //   inputLayout: null,
  //   program: clearProgram,
  // });
  // const rasterizePipeline = device.createComputePipeline({
  //   inputLayout: null,
  //   program: rasterizeProgram,
  // });
  // const mainImagePipeline = device.createComputePipeline({
  //   inputLayout: null,
  //   program: mainImageProgram,
  // });

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
  // const clearBindings = device.createBindings({
  //   pipeline: clearPipeline,
  //   storageBufferBindings: [
  //     {
  //       binding: 0,
  //       buffer: storageBuffer,
  //     },
  //   ],
  //   storageTextureBindings: [
  //     {
  //       binding: 0,
  //       texture: screen,
  //     },
  //   ],
  // });
  // const rasterizeBindings = device.createBindings({
  //   pipeline: rasterizePipeline,
  //   uniformBufferBindings: [
  //     {
  //       binding: 0,
  //       buffer: uniformBuffer,
  //     },
  //     {
  //       binding: 1,
  //       buffer: customUniformBuffer,
  //     },
  //   ],
  //   storageBufferBindings: [
  //     {
  //       binding: 0,
  //       buffer: storageBuffer,
  //     },
  //   ],
  //   storageTextureBindings: [
  //     {
  //       binding: 0,
  //       texture: screen,
  //     },
  //   ],
  // });
  // const mainImageBindings = device.createBindings({
  //   pipeline: mainImagePipeline,
  //   uniformBufferBindings: [
  //     {
  //       binding: 1,
  //       buffer: customUniformBuffer,
  //     },
  //   ],
  //   storageBufferBindings: [
  //     {
  //       binding: 0,
  //       buffer: storageBuffer,
  //     },
  //   ],
  //   storageTextureBindings: [
  //     {
  //       binding: 0,
  //       texture: screen,
  //     },
  //   ],
  // });

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

    const computePass = device.createComputePass();
    computePass.setPipeline(simulateParticlesPipeline);
    computePass.setBindings(simulateParticlesBindings);
    computePass.dispatchWorkgroups(
      Math.ceil($canvas.width / 16),
      Math.ceil($canvas.height / 16),
    );

    // computePass.setPipeline(clearPipeline);
    // computePass.setBindings(clearBindings);
    // computePass.dispatchWorkgroups(
    //   Math.ceil($canvas.width / 16),
    //   Math.ceil($canvas.height / 16),
    // );

    // computePass.setPipeline(rasterizePipeline);
    // computePass.setBindings(rasterizeBindings);
    // computePass.dispatchWorkgroups(
    //   Math.ceil($canvas.width / 16),
    //   Math.ceil($canvas.height / 16),
    // );

    // computePass.setPipeline(mainImagePipeline);
    // computePass.setBindings(mainImageBindings);
    // computePass.dispatchWorkgroups(
    //   Math.ceil($canvas.width / 16),
    //   Math.ceil($canvas.height / 16),
    // );
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
    ++t;
    id = requestAnimationFrame(frame);
  };

  frame(0);

  return () => {
    if (useRAF && id) {
      cancelAnimationFrame(id);
    }
    // clearProgram.destroy();
    // clearPipeline.destroy();
    // rasterizeProgram.destroy();
    // rasterizePipeline.destroy();
    // mainImageProgram.destroy();
    // mainImagePipeline.destroy();
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
