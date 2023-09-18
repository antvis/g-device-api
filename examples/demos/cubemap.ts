import {
  DeviceContribution,
  VertexStepMode,
  Format,
  TransparentWhite,
  BufferUsage,
  BufferFrequencyHint,
  BlendMode,
  BlendFactor,
  TextureUsage,
  CullMode,
  ChannelWriteMask,
  TransparentBlack,
  CompareMode,
  WrapMode,
  TexFilterMode,
  MipFilterMode,
  TextureDimension,
} from '../../src';
import { initExample, loadImage } from './utils';
import { vec3, mat4 } from 'gl-matrix';

/**
 * @see https://webgpu.github.io/webgpu-samples/samples/texturedCube
 */

export async function render(
  deviceContribution: DeviceContribution,
  $canvas: HTMLCanvasElement,
  useRAF = true,
) {
  // create swap chain and get device
  const swapChain = await deviceContribution.createSwapChain($canvas);

  // TODO: resize
  swapChain.configureSwapChain($canvas.width, $canvas.height);
  const device = swapChain.getDevice();

  const program = device.createProgram({
    vertex: {
      glsl: `
layout(std140) uniform Uniforms {
  mat4 u_ModelViewProjectionMatrix;
};

layout(location = 0) in vec4 a_Position;
layout(location = 1) in vec2 a_Uv;

out vec2 v_Uv;
out vec4 v_Position;

void main() {
  v_Uv = a_Uv;
  v_Position = 0.5 * (a_Position + vec4(1.0, 1.0, 1.0, 1.0));
  gl_Position = u_ModelViewProjectionMatrix * a_Position;
} 
`,
    },
    fragment: {
      glsl: `
uniform samplerCube u_Texture;
in vec2 v_Uv;
in vec4 v_Position;
out vec4 outputColor;

void main() {
  vec3 cubemapVec = v_Position.xyz - vec3(0.5);
  outputColor = texture(SAMPLER_Cube(u_Texture), cubemapVec);
}
`,
    },
  });

  const cubeVertexSize = 4 * 10; // Byte size of one cube vertex.
  const cubePositionOffset = 0;
  const cubeColorOffset = 4 * 4; // Byte offset of cube vertex color attribute.
  const cubeUVOffset = 4 * 8;
  const cubeVertexCount = 36;

  const cubeVertexArray = new Float32Array([
    // float4 position, float4 color, float2 uv,
    1, -1, 1, 1, 1, 0, 1, 1, 0, 1, -1, -1, 1, 1, 0, 0, 1, 1, 1, 1, -1, -1, -1,
    1, 0, 0, 0, 1, 1, 0, 1, -1, -1, 1, 1, 0, 0, 1, 0, 0, 1, -1, 1, 1, 1, 0, 1,
    1, 0, 1, -1, -1, -1, 1, 0, 0, 0, 1, 1, 0,

    1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, -1, 1, 1, 1, 0, 1, 1, 1, 1, 1, -1, -1, 1,
    1, 0, 0, 1, 1, 0, 1, 1, -1, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
    1, 1, -1, -1, 1, 1, 0, 0, 1, 1, 0,

    -1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, -1, 1, 1,
    1, 0, 1, 1, 0, -1, 1, -1, 1, 0, 1, 0, 1, 0, 0, -1, 1, 1, 1, 0, 1, 1, 1, 0,
    1, 1, 1, -1, 1, 1, 1, 0, 1, 1, 0,

    -1, -1, 1, 1, 0, 0, 1, 1, 0, 1, -1, 1, 1, 1, 0, 1, 1, 1, 1, 1, -1, 1, -1, 1,
    0, 1, 0, 1, 1, 0, -1, -1, -1, 1, 0, 0, 0, 1, 0, 0, -1, -1, 1, 1, 0, 0, 1, 1,
    0, 1, -1, 1, -1, 1, 0, 1, 0, 1, 1, 0,

    1, 1, 1, 1, 1, 1, 1, 1, 0, 1, -1, 1, 1, 1, 0, 1, 1, 1, 1, 1, -1, -1, 1, 1,
    0, 0, 1, 1, 1, 0, -1, -1, 1, 1, 0, 0, 1, 1, 1, 0, 1, -1, 1, 1, 1, 0, 1, 1,
    0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1,

    1, -1, -1, 1, 1, 0, 0, 1, 0, 1, -1, -1, -1, 1, 0, 0, 0, 1, 1, 1, -1, 1, -1,
    1, 0, 1, 0, 1, 1, 0, 1, 1, -1, 1, 1, 1, 0, 1, 0, 0, 1, -1, -1, 1, 1, 0, 0,
    1, 0, 1, -1, 1, -1, 1, 0, 1, 0, 1, 1, 0,
  ]);

  const vertexBuffer = device.createBuffer({
    viewOrSize: cubeVertexArray,
    usage: BufferUsage.VERTEX,
  });

  const uniformBuffer = device.createBuffer({
    viewOrSize: 16 * 4, // mat4
    usage: BufferUsage.UNIFORM,
    hint: BufferFrequencyHint.DYNAMIC,
  });

  // The order of the array layers is [+X, -X, +Y, -Y, +Z, -Z]
  const imageBitmaps = await Promise.all(
    [
      '/images/posx.jpg',
      '/images/negx.jpg',
      '/images/posy.jpg',
      '/images/negy.jpg',
      '/images/posz.jpg',
      '/images/negz.jpg',
    ].map(async (src) => loadImage(src)),
  );

  const texture = device.createTexture({
    pixelFormat: Format.U8_RGBA_NORM,
    width: imageBitmaps[0].width,
    height: imageBitmaps[0].height,
    depth: 6,
    dimension: TextureDimension.TEXTURE_CUBE_MAP,
    usage: TextureUsage.SAMPLED,
  });
  texture.setImageData(imageBitmaps);
  device.setResourceName(texture, 'Cube map');

  const sampler = device.createSampler({
    wrapS: WrapMode.CLAMP,
    wrapT: WrapMode.CLAMP,
    minFilter: TexFilterMode.BILINEAR,
    magFilter: TexFilterMode.BILINEAR,
    mipFilter: MipFilterMode.LINEAR,
    minLOD: 0,
    maxLOD: 0,
  });

  const inputLayout = device.createInputLayout({
    vertexBufferDescriptors: [
      {
        byteStride: cubeVertexSize,
        stepMode: VertexStepMode.VERTEX,
      },
    ],
    vertexAttributeDescriptors: [
      {
        location: 0,
        bufferIndex: 0,
        bufferByteOffset: cubePositionOffset,
        format: Format.F32_RGBA,
      },
      {
        location: 1,
        bufferIndex: 0,
        bufferByteOffset: cubeUVOffset,
        format: Format.F32_RG,
      },
    ],
    indexBufferFormat: null,
    program,
  });

  const pipeline = device.createRenderPipeline({
    inputLayout,
    program,
    colorAttachmentFormats: [Format.U8_RGBA_RT],
    depthStencilAttachmentFormat: Format.D24_S8,
    megaStateDescriptor: {
      attachmentsState: [
        {
          channelWriteMask: ChannelWriteMask.ALL,
          rgbBlendState: {
            blendMode: BlendMode.ADD,
            blendSrcFactor: BlendFactor.SRC_ALPHA,
            blendDstFactor: BlendFactor.ONE_MINUS_SRC_ALPHA,
          },
          alphaBlendState: {
            blendMode: BlendMode.ADD,
            blendSrcFactor: BlendFactor.ONE,
            blendDstFactor: BlendFactor.ONE_MINUS_SRC_ALPHA,
          },
        },
      ],
      blendConstant: TransparentBlack,
      depthWrite: true,
      depthCompare: CompareMode.LESS,
      // Since we are seeing from inside of the cube
      // and we are using the regular cube geomtry data with outward-facing normals,
      // the cullMode should be 'front' or 'none'.
      cullMode: CullMode.NONE,
      stencilWrite: false,
    },
  });

  const bindings = device.createBindings({
    pipeline,
    uniformBufferBindings: [
      {
        binding: 0,
        buffer: uniformBuffer,
        size: 16 * 4,
      },
    ],
    samplerBindings: [
      {
        texture,
        sampler,
      },
    ],
  });

  const mainColorRT = device.createRenderTargetFromTexture(
    device.createTexture({
      pixelFormat: Format.U8_RGBA_RT,
      width: $canvas.width,
      height: $canvas.height,
      usage: TextureUsage.RENDER_TARGET,
    }),
  );
  const mainDepthRT = device.createRenderTargetFromTexture(
    device.createTexture({
      pixelFormat: Format.D24_S8,
      width: $canvas.width,
      height: $canvas.height,
      usage: TextureUsage.RENDER_TARGET,
    }),
  );

  let id;
  const modelMatrix = mat4.fromScaling(
    mat4.create(),
    vec3.fromValues(1000, 1000, 1000),
  );
  const modelViewProjectionMatrix = mat4.create();
  const viewMatrix = mat4.identity(mat4.create());
  const tmpMat4 = mat4.create();

  const frame = () => {
    const aspect = $canvas.width / $canvas.height;
    const projectionMatrix = mat4.perspective(
      mat4.create(),
      (2 * Math.PI) / 5,
      aspect,
      1,
      3000,
    );

    const now = Date.now() / 800;

    mat4.rotate(
      tmpMat4,
      viewMatrix,
      (Math.PI / 10) * Math.sin(now),
      vec3.fromValues(1, 0, 0),
    );
    mat4.rotate(tmpMat4, tmpMat4, now * 0.2, vec3.fromValues(0, 1, 0));
    mat4.multiply(modelViewProjectionMatrix, tmpMat4, modelMatrix);
    mat4.multiply(
      modelViewProjectionMatrix,
      projectionMatrix,
      modelViewProjectionMatrix,
    );
    uniformBuffer.setSubData(
      0,
      new Uint8Array((modelViewProjectionMatrix as Float32Array).buffer),
    );
    // WebGL1 need this
    program.setUniformsLegacy({
      u_ModelViewProjectionMatrix: modelViewProjectionMatrix,
      u_Texture: texture,
    });

    /**
     * An application should call getCurrentTexture() in the same task that renders to the canvas texture.
     * Otherwise, the texture could get destroyed by these steps before the application is finished rendering to it.
     */
    const onscreenTexture = swapChain.getOnscreenTexture();

    const renderPass = device.createRenderPass({
      colorAttachment: [mainColorRT],
      colorResolveTo: [onscreenTexture],
      colorClearColor: [TransparentWhite],
      depthStencilAttachment: mainDepthRT,
      depthClearValue: 1,
    });

    renderPass.setPipeline(pipeline);
    renderPass.setVertexInput(
      inputLayout,
      [
        {
          buffer: vertexBuffer,
        },
      ],
      null,
    );
    renderPass.setViewport(0, 0, $canvas.width, $canvas.height);
    renderPass.setBindings(bindings);
    renderPass.draw(cubeVertexCount, 1, 0, 0);

    device.submitPass(renderPass);
    id = requestAnimationFrame(frame);
  };

  frame();

  return () => {
    if (id) {
      cancelAnimationFrame(id);
    }
    program.destroy();
    vertexBuffer.destroy();
    uniformBuffer.destroy();
    inputLayout.destroy();
    bindings.destroy();
    pipeline.destroy();
    mainColorRT.destroy();
    mainDepthRT.destroy();
    texture.destroy();
    sampler.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

export async function Cubemap($container: HTMLDivElement) {
  return initExample($container, render, {
    targets: ['webgl1', 'webgl2', 'webgpu'],
    default: 'webgl2',
  });
}