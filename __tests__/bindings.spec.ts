import _gl from 'gl';
import {
  BufferUsage,
  Format,
  WrapMode,
  TextureUsage,
  TexFilterMode,
  MipFilterMode,
  BufferFrequencyHint,
  VertexStepMode,
  ChannelWriteMask,
  BlendMode,
  BlendFactor,
  TransparentBlack,
  CompareMode,
  CullMode,
} from '../src';
import { Device_GL } from '../src/webgl/Device';
import { getWebGLDevice } from './utils';
import { Bindings_GL } from '../src/webgl/Bindings';

let device: Device_GL;
describe('Bindings', () => {
  beforeAll(async () => {
    device = await getWebGLDevice();
  });

  afterAll(() => {
    device.destroy();
  });

  it('should create bindings correctly.', () => {
    const program = device.createProgram({
      vertex: {
        glsl: `
  layout(std140) uniform Uniforms {
    mat4 u_ModelViewProjectionMatrix;
  };
  
  layout(location = 0) in vec4 a_Position;
  layout(location = 1) in vec2 a_Uv;
  
  out vec2 v_Uv;
  
  void main() {
    v_Uv = a_Uv;
    gl_Position = u_ModelViewProjectionMatrix * a_Position;
  } 
  `,
      },
      fragment: {
        glsl: `
  uniform sampler2D u_Texture;
  in vec2 v_Uv;
  out vec4 outputColor;
  
  void main() {
    outputColor = texture(SAMPLER_2D(u_Texture), v_Uv);
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
      1, 0, 0, 1, 1, 0, 1, 1, -1, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
      0, 1, 1, -1, -1, 1, 1, 0, 0, 1, 1, 0,

      -1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, -1, 1,
      1, 1, 0, 1, 1, 0, -1, 1, -1, 1, 0, 1, 0, 1, 0, 0, -1, 1, 1, 1, 0, 1, 1, 1,
      0, 1, 1, 1, -1, 1, 1, 1, 0, 1, 1, 0,

      -1, -1, 1, 1, 0, 0, 1, 1, 0, 1, -1, 1, 1, 1, 0, 1, 1, 1, 1, 1, -1, 1, -1,
      1, 0, 1, 0, 1, 1, 0, -1, -1, -1, 1, 0, 0, 0, 1, 0, 0, -1, -1, 1, 1, 0, 0,
      1, 1, 0, 1, -1, 1, -1, 1, 0, 1, 0, 1, 1, 0,

      1, 1, 1, 1, 1, 1, 1, 1, 0, 1, -1, 1, 1, 1, 0, 1, 1, 1, 1, 1, -1, -1, 1, 1,
      0, 0, 1, 1, 1, 0, -1, -1, 1, 1, 0, 0, 1, 1, 1, 0, 1, -1, 1, 1, 1, 0, 1, 1,
      0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1,

      1, -1, -1, 1, 1, 0, 0, 1, 0, 1, -1, -1, -1, 1, 0, 0, 0, 1, 1, 1, -1, 1,
      -1, 1, 0, 1, 0, 1, 1, 0, 1, 1, -1, 1, 1, 1, 0, 1, 0, 0, 1, -1, -1, 1, 1,
      0, 0, 1, 0, 1, -1, 1, -1, 1, 0, 1, 0, 1, 1, 0,
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

    const texture = device.createTexture({
      pixelFormat: Format.U8_RGBA_NORM,
      width: 10,
      height: 10,
      usage: TextureUsage.SAMPLED,
    });

    const sampler = device.createSampler({
      wrapS: WrapMode.CLAMP,
      wrapT: WrapMode.CLAMP,
      minFilter: TexFilterMode.POINT,
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
        cullMode: CullMode.BACK,
        stencilWrite: false,
      },
    });

    let bindings = device.createBindings({
      pipeline,
    }) as Bindings_GL;

    bindings = device.createBindings({
      pipeline,
      uniformBufferBindings: [
        {
          binding: 0,
          buffer: uniformBuffer,
          size: 16 * 4,
        },
      ],
    }) as Bindings_GL;

    bindings = device.createBindings({
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
    }) as Bindings_GL;

    expect(bindings.uniformBufferBindings.length).toBe(1);
    expect(bindings.samplerBindings.length).toBe(1);
    expect(bindings.bindingLayouts.numUniformBuffers).toBe(1);
    expect(bindings.bindingLayouts.numSamplers).toBe(1);
    expect(bindings.bindingLayouts.bindingLayoutTables.length).toBe(1);
  });
});
