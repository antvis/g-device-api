import {
  DeviceContribution,
  VertexStepMode,
  Format,
  BufferUsage,
  BufferFrequencyHint,
  TextureUsage,
  colorNewFromRGBA,
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
    colorAttachmentFormats: [Format.U8_RGBA_RT],
  });

  const renderTargetTexture = device.createTexture({
    format: Format.U8_RGBA_RT,
    width: $canvas.width,
    height: $canvas.height,
    usage: TextureUsage.RENDER_TARGET,
  });
  const renderTarget =
    device.createRenderTargetFromTexture(renderTargetTexture);
  device.setResourceName(renderTarget, 'Main Render Target');

  const readback = device.createReadback();

  /**
   * An application should call getCurrentTexture() in the same task that renders to the canvas texture.
   * Otherwise, the texture could get destroyed by these steps before the application is finished rendering to it.
   */
  const onscreenTexture = swapChain.getOnscreenTexture();

  const renderPass = device.createRenderPass({
    colorAttachment: [renderTarget],
    colorResolveTo: [onscreenTexture],
    colorClearColor: [colorNewFromRGBA(0, 0, 255, 1)],
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

  const length = width * height * 4;
  const pixel = await readback.readTexture(
    renderTargetTexture,
    0,
    0,
    width,
    height,
    new Uint8ClampedArray(length),
  );
  let data = new Uint8ClampedArray(pixel.buffer);
  // data = data.slice(0, length);

  const $c = document.createElement('canvas');
  $c.width = width;
  $c.height = height;
  $c.style.width = `${width / 2}px`;
  $c.style.height = `${height / 2}px`;
  $canvas.parentElement?.appendChild($c);

  const context = $c.getContext('2d')!;
  const ci = context.createImageData(width, height);
  const row = width * 4;
  const end = (height - 1) * row;
  for (let i = 0; i < length; i += row) {
    ci.data.set(data.subarray(i, i + row), i);
  }
  context.putImageData(ci, 0, 0);

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
  default: 'webgpu',
  width,
  height,
};
