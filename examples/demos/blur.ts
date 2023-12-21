import {
  DeviceContribution,
  VertexStepMode,
  Format,
  TransparentWhite,
  Buffer,
  Bindings,
  BufferUsage,
  TextureUsage,
  AddressMode,
  FilterMode,
  MipmapFilterMode,
  TextureDimension,
} from '../../src';
import { loadImage } from '../utils/image';

/**
 * This example shows how to blur an image using a WebGPU compute shader.
 * @see https://webgpu.github.io/webgpu-samples/samples/imageBlur
 */

// Contants from the blur.wgsl shader.
const tileDim = 128;
const batch = [4, 4];
const filterSize = 15;
const iterations = 2;
const blockDim = tileDim - (filterSize - 1);

export async function render(
  deviceContribution: DeviceContribution,
  $canvas: HTMLCanvasElement,
  useRAF = true,
) {
  // create swap chain and get device
  const swapChain = await deviceContribution.createSwapChain($canvas);
  swapChain.configureSwapChain($canvas.width, $canvas.height);
  const device = swapChain.getDevice();

  const imageBitmap = await loadImage(
    'https://gw.alipayobjects.com/mdn/rms_6ae20b/afts/img/A*_aqoS73Se3sAAAAAAAAAAAAAARQnAQ',
  );
  const [srcWidth, srcHeight] = [imageBitmap.width, imageBitmap.height];
  const cubeTexture = device.createTexture({
    format: Format.U8_RGBA_NORM,
    width: imageBitmap.width,
    height: imageBitmap.height,
    dimension: TextureDimension.TEXTURE_2D,
    usage: TextureUsage.SAMPLED,
  });
  cubeTexture.setImageData([imageBitmap]);
  const textures = [0, 1].map(() => {
    return device.createTexture({
      format: Format.U8_RGBA_NORM,
      width: srcWidth,
      height: srcHeight,
      dimension: TextureDimension.TEXTURE_2D,
      usage: TextureUsage.STORAGE,
    });
  });

  const sampler = device.createSampler({
    addressModeU: AddressMode.CLAMP_TO_EDGE,
    addressModeV: AddressMode.CLAMP_TO_EDGE,
    minFilter: FilterMode.BILINEAR,
    magFilter: FilterMode.BILINEAR,
    mipmapFilter: MipmapFilterMode.LINEAR,
  });

  const renderProgram = device.createProgram({
    vertex: {
      entryPoint: 'vert_main',
      wgsl: `
      @group(0) @binding(0) var myTexture : texture_2d<f32>;
      @group(0) @binding(1) var mySampler : sampler;
      
      struct VertexOutput {
        @builtin(position) Position : vec4<f32>,
        @location(0) fragUV : vec2<f32>,
      }
      
      @vertex
      fn vert_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
        const pos = array(
          vec2( 1.0,  1.0),
          vec2( 1.0, -1.0),
          vec2(-1.0, -1.0),
          vec2( 1.0,  1.0),
          vec2(-1.0, -1.0),
          vec2(-1.0,  1.0),
        );
      
        const uv = array(
          vec2(1.0, 0.0),
          vec2(1.0, 1.0),
          vec2(0.0, 1.0),
          vec2(1.0, 0.0),
          vec2(0.0, 1.0),
          vec2(0.0, 0.0),
        );
      
        var output : VertexOutput;
        output.Position = vec4(pos[VertexIndex], 0.0, 1.0);
        output.fragUV = uv[VertexIndex];
        return output;
      }
    `,
    },
    fragment: {
      entryPoint: 'frag_main',
      wgsl: `
      @group(0) @binding(0) var myTexture : texture_2d<f32>;
      @group(0) @binding(1) var mySampler : sampler;

      @fragment
      fn frag_main(@location(0) fragUV : vec2<f32>) -> @location(0) vec4<f32> {
        return textureSample(myTexture, mySampler, fragUV);
      }      
    `,
    },
  });

  const computeProgram = device.createProgram({
    compute: {
      wgsl: `
  struct Params {
    filterDim : i32,
    blockDim : u32,
  }
  struct Flip {
    value : u32,
  }

  @group(0) @binding(0) var<uniform> params : Params;
  @group(0) @binding(1) var<uniform> flip : Flip;
  @group(1) @binding(0) var inputTex : texture_2d<f32>;
  @group(1) @binding(1) var samp : sampler;
  @group(2) @binding(0) var outputTex : texture_storage_2d<rgba8unorm, write>;

  // This shader blurs the input texture in one direction, depending on whether
  // |flip.value| is 0 or 1.
  // It does so by running (128 / 4) threads per workgroup to load 128
  // texels into 4 rows of shared memory. Each thread loads a
  // 4 x 4 block of texels to take advantage of the texture sampling
  // hardware.
  // Then, each thread computes the blur result by averaging the adjacent texel values
  // in shared memory.
  // Because we're operating on a subset of the texture, we cannot compute all of the
  // results since not all of the neighbors are available in shared memory.
  // Specifically, with 128 x 128 tiles, we can only compute and write out
  // square blocks of size 128 - (filterSize - 1). We compute the number of blocks
  // needed in Javascript and dispatch that amount.

  var<workgroup> tile : array<array<vec3<f32>, 128>, 4>;

  @compute @workgroup_size(32, 1, 1)
  fn main(
    @builtin(workgroup_id) WorkGroupID : vec3<u32>,
    @builtin(local_invocation_id) LocalInvocationID : vec3<u32>
  ) {
    let filterOffset = (params.filterDim - 1) / 2;
    let dims = vec2<i32>(textureDimensions(inputTex, 0));
    let baseIndex = vec2<i32>(WorkGroupID.xy * vec2(params.blockDim, 4) +
                              LocalInvocationID.xy * vec2(4, 1))
                    - vec2(filterOffset, 0);

    for (var r = 0; r < 4; r++) {
      for (var c = 0; c < 4; c++) {
        var loadIndex = baseIndex + vec2(c, r);
        if (flip.value != 0u) {
          loadIndex = loadIndex.yx;
        }

        tile[r][4 * LocalInvocationID.x + u32(c)] = textureSampleLevel(
          inputTex,
          samp,
          (vec2<f32>(loadIndex) + vec2<f32>(0.25, 0.25)) / vec2<f32>(dims),
          0.0
        ).rgb;
      }
    }

    workgroupBarrier();

    for (var r = 0; r < 4; r++) {
      for (var c = 0; c < 4; c++) {
        var writeIndex = baseIndex + vec2(c, r);
        if (flip.value != 0) {
          writeIndex = writeIndex.yx;
        }

        let center = i32(4 * LocalInvocationID.x) + c;
        if (center >= filterOffset &&
            center < 128 - filterOffset &&
            all(writeIndex < dims)) {
          var acc = vec3(0.0, 0.0, 0.0);
          for (var f = 0; f < params.filterDim; f++) {
            var i = center + f - filterOffset;
            acc = acc + (1.0 / f32(params.filterDim)) * tile[r][i];
          }
          textureStore(outputTex, writeIndex, vec4(acc, 1.0));
        }
      }
    }
  }

    `,
    },
  });

  const buffer0 = device.createBuffer({
    viewOrSize: 1 * Uint32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.UNIFORM,
  });
  buffer0.setSubData(0, new Uint8Array(new Uint32Array([0]).buffer));
  const buffer1 = device.createBuffer({
    viewOrSize: 1 * Uint32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.UNIFORM,
  });
  buffer1.setSubData(0, new Uint8Array(new Uint32Array([1]).buffer));
  const blurParamsBuffer = device.createBuffer({
    viewOrSize: 2 * Uint32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.UNIFORM,
  });
  blurParamsBuffer.setSubData(
    0,
    new Uint8Array(new Uint32Array([filterSize, blockDim]).buffer),
  );

  const renderPipeline = device.createRenderPipeline({
    inputLayout: null,
    program: renderProgram,
    colorAttachmentFormats: [Format.U8_RGBA_RT],
  });
  const showResultBindings = device.createBindings({
    pipeline: renderPipeline,
    samplerBindings: [
      {
        texture: textures[1], // Binding = 0
        sampler, // Binding = 1
      },
    ],
  });

  const computePipeline = device.createComputePipeline({
    inputLayout: null,
    program: computeProgram,
  });

  const bindings0 = device.createBindings({
    pipeline: computePipeline,
    uniformBufferBindings: [
      // Group0
      {
        binding: 0,
        buffer: blurParamsBuffer,
      },
      {
        binding: 1,
        buffer: buffer0,
      },
    ],
    samplerBindings: [
      // Group1
      {
        texture: cubeTexture,
        sampler,
      },
    ],
    storageTextureBindings: [
      // Group2
      {
        binding: 0,
        texture: textures[0],
      },
    ],
  });

  const bindings1 = device.createBindings({
    pipeline: computePipeline,
    uniformBufferBindings: [
      {
        binding: 0,
        buffer: blurParamsBuffer,
      },
      {
        binding: 1,
        buffer: buffer1,
      },
    ],
    samplerBindings: [
      {
        texture: textures[0],
        sampler,
      },
    ],
    storageTextureBindings: [
      {
        binding: 0,
        texture: textures[1],
      },
    ],
  });

  const bindings2 = device.createBindings({
    pipeline: computePipeline,
    uniformBufferBindings: [
      {
        binding: 0,
        buffer: blurParamsBuffer,
      },
      {
        binding: 1,
        buffer: buffer0,
      },
    ],
    samplerBindings: [
      {
        texture: textures[1],
        sampler,
      },
    ],
    storageTextureBindings: [
      {
        binding: 0,
        texture: textures[0],
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
  const frame = () => {
    const computePass = device.createComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindings(bindings0);
    computePass.dispatchWorkgroups(
      Math.ceil(srcWidth / blockDim),
      Math.ceil(srcHeight / batch[1]),
    );
    computePass.setBindings(bindings1);
    computePass.dispatchWorkgroups(
      Math.ceil(srcHeight / blockDim),
      Math.ceil(srcWidth / batch[1]),
    );

    for (let i = 0; i < iterations - 1; ++i) {
      computePass.setBindings(bindings2);
      computePass.dispatchWorkgroups(
        Math.ceil(srcWidth / blockDim),
        Math.ceil(srcHeight / batch[1]),
      );

      computePass.setBindings(bindings1);
      computePass.dispatchWorkgroups(
        Math.ceil(srcHeight / blockDim),
        Math.ceil(srcWidth / batch[1]),
      );
    }

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
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindings(showResultBindings);
    renderPass.setViewport(0, 0, $canvas.width, $canvas.height);
    renderPass.draw(6);

    device.submitPass(renderPass);
    ++t;
    id = requestAnimationFrame(frame);
  };

  frame();

  return () => {
    if (useRAF && id) {
      cancelAnimationFrame(id);
    }
    renderProgram.destroy();
    computeProgram.destroy();
    cubeTexture.destroy();
    buffer0.destroy();
    buffer1.destroy();
    renderPipeline.destroy();
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
