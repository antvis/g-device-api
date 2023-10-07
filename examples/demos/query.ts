import {
  DeviceContribution,
  VertexStepMode,
  Format,
  TransparentWhite,
  BufferUsage,
  BufferFrequencyHint,
  TextureUsage,
  QueryPoolType,
  ChannelWriteMask,
  BlendMode,
  BlendFactor,
  TransparentBlack,
  CompareFunction,
  CullMode,
} from '../../src';

/**
 * @see https://webglsamples.org/WebGL2Samples/#query_occlusion
 * @see https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/endQuery
 */

export async function render(
  deviceContribution: DeviceContribution,
  $canvas: HTMLCanvasElement,
  useRAF = true,
) {
  // create swap chain and get device
  const swapChain = (await deviceContribution.createSwapChain($canvas))!;
  // TODO: resize
  swapChain.configureSwapChain($canvas.width, $canvas.height);
  const device = swapChain.getDevice();

  const program = device.createProgram({
    vertex: {
      glsl: `
layout(location = 0) in vec3 a_Position;

void main() {
  gl_Position = vec4(a_Position, 1.0);
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
    viewOrSize: new Float32Array([
      -0.3, -0.5, 0.0, 0.3, -0.5, 0.0, 0.0, 0.5, 0.0,

      -0.3, -0.5, 0.5, 0.3, -0.5, 0.5, 0.0, 0.5, 0.5,
    ]),
    usage: BufferUsage.VERTEX,
    hint: BufferFrequencyHint.DYNAMIC,
  });
  device.setResourceName(vertexBuffer, 'a_Position');

  const inputLayout = device.createInputLayout({
    vertexBufferDescriptors: [
      {
        arrayStride: 4 * 3,
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
      depthCompare: CompareFunction.LESS,
      cullMode: CullMode.BACK,
      stencilWrite: false,
    },
  });

  const mainColorRT = device.createRenderTargetFromTexture(
    device.createTexture({
      format: Format.U8_RGBA_RT,
      width: $canvas.width,
      height: $canvas.height,
      usage: TextureUsage.RENDER_TARGET,
    }),
  );
  const mainDepthRT = device.createRenderTargetFromTexture(
    device.createTexture({
      format: Format.D24_S8,
      width: $canvas.width,
      height: $canvas.height,
      usage: TextureUsage.RENDER_TARGET,
    }),
  );

  const queryPool = device.createQueryPool(QueryPoolType.ANY_SAMPLES_PASSED, 1);

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
    occlusionQueryPool: queryPool,
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

  renderPass.beginOcclusionQuery(0);
  renderPass.draw(3, undefined, 3);
  renderPass.endOcclusionQuery();

  device.submitPass(renderPass);

  let id: number;
  const frame = () => {
    const result = queryPool.queryPoolResultOcclusion(0);
    if (result == null) {
      id = requestAnimationFrame(frame);
      return;
    }
    console.log(result);
  };

  frame();

  return () => {
    if (useRAF && id) {
      cancelAnimationFrame(id);
    }
    program.destroy();
    vertexBuffer.destroy();
    inputLayout.destroy();
    pipeline.destroy();
    mainColorRT.destroy();
    mainDepthRT.destroy();
    queryPool.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

render.params = {
  targets: ['webgl2', 'webgpu'],
  default: 'webgl2',
};
