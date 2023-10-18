import {
  DeviceContribution,
  VertexStepMode,
  Format,
  BufferUsage,
  BufferFrequencyHint,
  TransparentWhite,
} from '../../src';

const width = 1000;
const height = 1000;

export async function render(
  deviceContribution: DeviceContribution,
  $canvas: HTMLCanvasElement,
  useRAF = true,
) {
  // create swap chain and get device
  const swapChain = (await deviceContribution.createSwapChain($canvas))!;
  swapChain.configureSwapChain($canvas.width, $canvas.height);
  const device = swapChain.getDevice();

  const program = device.createProgram({
    vertex: {
      glsl: `
layout(location = 0) in vec2 a_Position;

void main() {
  gl_Position = vec4(a_Position, 0.0, 1.0);
} 
`,
    },
    fragment: {
      glsl: `
out vec4 outputColor;

void main() {
  outputColor = vec4(0.5, 0.4, 0.3, 1.0);
}
`,
    },
  });

  const vertexBuffer = device.createBuffer({
    viewOrSize: new Float32Array([0, 0.5, -0.5, -0.5, 0.5, -0.5]),
    usage: BufferUsage.VERTEX,
    hint: BufferFrequencyHint.DYNAMIC,
  });
  device.setResourceName(vertexBuffer, 'a_Position');

  const inputLayout = device.createInputLayout({
    vertexBufferDescriptors: [
      {
        arrayStride: 4 * 2,
        stepMode: VertexStepMode.VERTEX,
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: Format.F32_RG,
          },
        ],
      },
    ],
    indexBufferFormat: null,
    program,
  });

  const pipeline = device.createRenderPipeline({
    inputLayout,
    program,
    colorAttachmentFormats: [Format.F32_RGBA],
  });

  const renderTarget = device.createRenderTarget({
    format: Format.F32_RGBA,
    width: $canvas.width,
    height: $canvas.height,
  });
  device.setResourceName(renderTarget, 'Main Render Target');

  const readback = device.createReadback();

  const onscreenTexture = swapChain.getOnscreenTexture();
  const renderPass = device.createRenderPass({
    colorAttachment: [renderTarget],
    colorResolveTo: [null],
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

  const result = await readback.readRenderTarget(
    renderTarget,
    250,
    250,
    1,
    1,
    new Float32Array(4),
  );
  console.log(result); // [0.5, 0.4, 0.3, 1.0]

  return () => {
    program.destroy();
    vertexBuffer.destroy();
    inputLayout.destroy();
    pipeline.destroy();
    renderTarget.destroy();
    readback.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

render.params = {
  targets: ['webgl1', 'webgl2', 'webgpu'],
  default: 'webgl2',
  width,
  height,
};
