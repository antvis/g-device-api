import _gl from 'gl';
import {
  BufferUsage,
  Format,
  TextureUsage,
  BufferFrequencyHint,
  VertexStepMode,
  TransparentWhite,
  PrimitiveTopology,
} from '../../src';
import { Device_GL } from '../../src/webgl/Device';
import { getWebGLDevice } from '../utils';
import '../useSnapshotMatchers';

let device: Device_GL;
describe('RenderPass', () => {
  beforeAll(async () => {
    device = await getWebGLDevice();
  });

  afterAll(() => {
    device.destroy();
  });

  it('should create RenderPass and destroy correctly.', () => {
    const $canvas = device.gl.canvas;
    const onscreenTexture = device.getOnscreenTexture();

    const program = device.createProgram({
      vertex: {
        glsl: `
  layout(location = 0) in vec2 a_Position;
  
  void main() {
    gl_Position = vec4(a_Position, 0.0, 1.0);
    gl_PointSize = 10.0;
  } 
  `,
      },
      fragment: {
        glsl: `
  out vec4 outputColor;
  
  void main() {
    outputColor = vec4(1.0, 0.0, 0.0, 1.0);
  }
  `,
      },
    });

    const vertexBuffer = device.createBuffer({
      viewOrSize: new Float32Array([0, 0.5, -0.5, -0.5, 0.5, -0.5]),
      usage: BufferUsage.VERTEX,
      hint: BufferFrequencyHint.DYNAMIC,
    });

    const inputLayout = device.createInputLayout({
      vertexBufferDescriptors: [
        {
          byteStride: 4 * 2,
          stepMode: VertexStepMode.VERTEX,
        },
      ],
      vertexAttributeDescriptors: [
        {
          location: 0,
          bufferIndex: 0,
          bufferByteOffset: 0,
          format: Format.F32_RG,
        },
      ],
      indexBufferFormat: null,
      program,
    });

    const pipeline = device.createRenderPipeline({
      inputLayout,
      program,
      topology: PrimitiveTopology.POINTS,
      colorAttachmentFormats: [Format.U8_RGBA_RT],
    });

    const renderTarget = device.createRenderTargetFromTexture(
      device.createTexture({
        pixelFormat: Format.U8_RGBA_RT,
        width: $canvas.width,
        height: $canvas.height,
        usage: TextureUsage.RENDER_TARGET,
      }),
    );

    const renderPass = device.createRenderPass({
      colorAttachment: [renderTarget],
      colorResolveTo: [onscreenTexture],
      colorClearColor: [TransparentWhite],
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
    renderPass.draw(3);

    device.submitPass(renderPass);

    const dir = `${__dirname}/snapshots`;
    expect(device.gl).toMatchWebGLSnapshot(dir, 'primitive-topology-points');

    pipeline.destroy();
  });
});
