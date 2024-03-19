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

  const { pipeline: blitPipeline, bindings: blitBindings } =
    createBlitPipelineAndBindings(device, screen);

  const custom = /* wgsl */ `
#define_import_path custom

struct Custom {
  Radius: f32,
  Sinea: f32,
  Sineb: f32,
  Speed: f32,
  Blur: f32,
  Samples: f32,
  Mode: f32
}
@group(0) @binding(1) var<uniform> custom: Custom;

  `;

  registerShaderModule(device, prelude);
  registerShaderModule(device, custom);

  const computeWgsl = /* wgsl */ `
  #import prelude::{screen, time};
  #import custom::{custom};

  @group(2) @binding(0) var<storage, read_write> atomic_storage : array<atomic<i32>>;

  //Check Uniforms
  //Mode 0 - additive blending (atomicAdd)
  //Mode 1 - closest sample (atomicMax)

  const MaxSamples = 64.0;
  const FOV = 0.8;
  const PI = 3.14159265;
  const TWO_PI = 6.28318530718;

  const DEPTH_MIN = 0.2;
  const DEPTH_MAX = 5.0;
  const DEPTH_BITS = 16u;

  struct Camera
  {
    pos: vec3f,
    cam: mat3x3<f32>,
    fov: f32,
    size: vec2f
  }

  var<private> camera : Camera;
  var<private> state : vec4u;

  fn pcg4d(a: vec4u) -> vec4u
  {
  	var v = a * 1664525u + 1013904223u;
      v.x += v.y*v.w; v.y += v.z*v.x; v.z += v.x*v.y; v.w += v.y*v.z;
      v = v ^  ( v >> vec4u(16u) );
      v.x += v.y*v.w; v.y += v.z*v.x; v.z += v.x*v.y; v.w += v.y*v.z;
      return v;
  }

  fn rand4() -> vec4f
  {
      state = pcg4d(state);
      return vec4f(state)/f32(0xffffffffu);
  }

  fn nrand4(sigma: f32, mean: vec4f) -> vec4f
  {
      let Z = rand4();
      return mean + sigma * sqrt(-2.0 * log(Z.xxyy)) *
             vec4f(cos(TWO_PI * Z.z),sin(TWO_PI * Z.z),cos(TWO_PI * Z.w),sin(TWO_PI * Z.w));
  }

  fn GetCameraMatrix(ang: vec2f) -> mat3x3<f32>
  {
      let x_dir = vec3f(cos(ang.x)*sin(ang.y), cos(ang.y), sin(ang.x)*sin(ang.y));
      let y_dir = normalize(cross(x_dir, vec3f(0.0,1.0,0.0)));
      let z_dir = normalize(cross(y_dir, x_dir));
      return mat3x3<f32>(-x_dir, y_dir, z_dir);
  }

  fn SetCamera(ang: vec2f, fov: f32)
  {
      camera.fov = fov;
      camera.cam = GetCameraMatrix(ang);
      camera.pos = - (camera.cam*vec3f(3.0*custom.Radius+0.5,0.0,0.0));
      camera.size = vec2f(textureDimensions(screen));
  }

  //project to clip space
  fn Project(cam: Camera, p: vec3f) -> vec3f
  {
      let td = distance(cam.pos, p);
      let dir = (p - cam.pos)/td;
      let screen = dir*cam.cam;
      return vec3f(screen.yz*cam.size.y/(cam.fov*screen.x) + 0.5*cam.size,screen.x*td);
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

  fn Pack(a: u32, b: u32) -> i32
  {
      return i32(a + (b << (31u - DEPTH_BITS)));
  }

  fn Unpack(a: i32) -> f32
  {
      let mask = i32(1u << (DEPTH_BITS - 1u)) - 1i;
      return f32(a & mask)/256.0;
  }

  fn ClosestPoint(color: vec3f, depth: f32, index: i32)
  {
      let inverseDepth = 1.0/depth;
      let scaledDepth = (inverseDepth - 1.0/DEPTH_MAX)/(1.0/DEPTH_MIN - 1.0/DEPTH_MAX);

      if(scaledDepth > 1.0 || scaledDepth < 0.0)
      {
          return;
      }

      let uintDepth = u32(scaledDepth*f32((1u << DEPTH_BITS) - 1u));
      let uintColor = vec3u(color * 256.0);

      atomicMax(&atomic_storage[index*4+0], Pack(uintColor.x, uintDepth));
      atomicMax(&atomic_storage[index*4+1], Pack(uintColor.y, uintDepth));
      atomicMax(&atomic_storage[index*4+2], Pack(uintColor.z, uintDepth));
  }

  fn AdditiveBlend(color: vec3f, depth: f32, index: i32)
  {
      let scaledColor = 256.0 * color/depth;

      atomicAdd(&atomic_storage[index*4+0], i32(scaledColor.x));
      atomicAdd(&atomic_storage[index*4+1], i32(scaledColor.y));
      atomicAdd(&atomic_storage[index*4+2], i32(scaledColor.z));
  }

  fn RasterizePoint(pos: vec3f, color: vec3f)
  {
      let screen_size = vec2i(camera.size);
      let projectedPos = Project(camera, pos);
      let screenCoord = vec2i(projectedPos.xy);

      //outside of our view
      if(screenCoord.x < 0 || screenCoord.x >= screen_size.x ||
          screenCoord.y < 0 || screenCoord.y >= screen_size.y || projectedPos.z < 0.0)
      {
          return;
      }

      let idx = screenCoord.x + screen_size.x * screenCoord.y;

      if(custom.Mode < 0.5)
      {
          AdditiveBlend(color, projectedPos.z, idx);
      }
      else
      {
          ClosestPoint(color, projectedPos.z, idx);
      }
  }

  @compute @workgroup_size(16, 16)
  fn Rasterize(@builtin(global_invocation_id) id: vec3u) {
      // Viewport resolution (in pixels)
      let screen_size = vec2i(textureDimensions(screen));
      let screen_size_f = vec2f(screen_size);

      // let ang = vec2f(mouse.pos.xy)*vec2f(-TWO_PI, PI)/screen_size_f + vec2f(0.4, 0.4);
      let ang = vec2f(0.0, 0.0)*vec2f(-TWO_PI, PI)/screen_size_f + vec2f(0.4, 0.4);

      SetCamera(ang, FOV);

      //RNG state
      state = vec4u(id.x, id.y, id.z, 0u*time.frame);

      for(var i: i32 = 0; i < i32(custom.Samples*MaxSamples + 1.0); i++)
      {
          let rand = nrand4(1.0, vec4f(0.0));
          var pos = 0.2*rand.xyz;
          let col = vec3f(0.5 + 0.5*sin(10.0*pos));

          let sec = 5.0+custom.Speed*time.elapsed;
          //move points along sines
          pos += sin(vec3f(2.0,1.0,1.5)*sec)*0.1*sin(30.0*custom.Sinea*pos);
          pos += sin(vec3f(2.0,1.0,1.5)*sec)*0.02*sin(30.0*custom.Sineb*pos.zxy);

          RasterizePoint(pos, col);
      }
  }

  fn Sample(pos: vec2i) -> vec3f
  {
      let screen_size = vec2i(textureDimensions(screen));
      let idx = pos.x + screen_size.x * pos.y;

      var color: vec3f;
      if(custom.Mode < 0.5)
      {
          let x = f32(atomicLoad(&atomic_storage[idx*4+0]))/(256.0);
          let y = f32(atomicLoad(&atomic_storage[idx*4+1]))/(256.0);
          let z = f32(atomicLoad(&atomic_storage[idx*4+2]))/(256.0);

          color = tanh(0.1*vec3f(x,y,z)/(custom.Samples*MaxSamples + 1.0));
      }
      else
      {
          let x = Unpack(atomicLoad(&atomic_storage[idx*4+0]));
          let y = Unpack(atomicLoad(&atomic_storage[idx*4+1]));
          let z = Unpack(atomicLoad(&atomic_storage[idx*4+2]));

          color = vec3f(x,y,z);
      }

      return abs(color);
  }

  @compute @workgroup_size(16, 16)
  fn main_image(@builtin(global_invocation_id) id: vec3u)
  {
      let screen_size = vec2u(textureDimensions(screen));

      // Prevent overdraw for workgroups on the edge of the viewport
      if (id.x >= screen_size.x || id.y >= screen_size.y) { return; }

      // Pixel coordinates (centre of pixel, origin at bottom left)
      // let fragCoord = vec2f(f32(id.x) + .5, f32(id.y) + .5);

      let color = vec4f(Sample(vec2i(id.xy)),1.0);

      // Output to screen (linear colour space)
      textureStore(screen, vec2i(id.xy), color);
  }
          `;

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
    viewOrSize: 7 * Float32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.UNIFORM,
  });
  customUniformBuffer.setSubData(
    0,
    new Uint8Array(
      new Float32Array([0.082, 0.513, 0.534, 0.485, 0, 0.25, 0]).buffer,
    ),
  );

  const storageBuffer = device.createBuffer({
    viewOrSize:
      $canvas.width * $canvas.height * 4 * Float32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.STORAGE,
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
        buffer: uniformBuffer,
      },
      {
        binding: 1,
        buffer: customUniformBuffer,
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
    device.beginFrame();

    uniformBuffer.setSubData(
      0,
      new Uint8Array(new Float32Array([t, time / 1000]).buffer),
    );

    const x = Math.ceil($canvas.width / 16);
    const y = Math.ceil($canvas.height / 16);
    const computePass = device.createComputePass();
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
    clearProgram.destroy();
    clearPipeline.destroy();
    rasterizeProgram.destroy();
    rasterizePipeline.destroy();
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
