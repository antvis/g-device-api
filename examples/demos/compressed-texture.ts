import { CompressedTextureLoader } from '@loaders.gl/textures';
import { load } from '@loaders.gl/core';
import {
  DeviceContribution,
  VertexStepMode,
  Format,
  TransparentWhite,
  BufferUsage,
  BlendMode,
  BlendFactor,
  TextureUsage,
  CullMode,
  ChannelWriteMask,
  TransparentBlack,
  CompareFunction,
} from '../../src';
// @ts-ignore
import dds from '../public/images/shannon-dxt1.dds';

/**
 * Use compressed textures.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Compressed_texture_formats
 * @see https://toji.github.io/texture-tester/
 *
 * Use @loaders.gl
 * @see https://loaders.gl/docs/modules/textures/api-reference/compressed-texture-loader
 * @see https://loaders.gl/examples/textures
 * @see https://github.com/visgl/loaders.gl/blob/master/examples/website/textures/components/compressed-texture.tsx
 */
export async function render(
  deviceContribution: DeviceContribution,
  $canvas: HTMLCanvasElement,
  useRAF = true,
) {
  const mipLevels = await load(dds, CompressedTextureLoader);
  const { width, height } = mipLevels[0];

  // create swap chain and get device
  const swapChain = await deviceContribution.createSwapChain($canvas);

  // TODO: resize
  swapChain.configureSwapChain($canvas.width, $canvas.height);
  const device = swapChain.getDevice();

  // Recurse into arrays (array of miplevels)
  const texture = device.createTexture({
    format: Format.BC1,
    width,
    height,
    usage: TextureUsage.RENDER_TARGET,
    mipmaps: false,
  });

  [mipLevels[0]].forEach((image, i) => {
    // console.log(image);
    texture.setImageData([image.data], i);
  });

  const program = device.createProgram({
    vertex: {
      glsl: `
  layout(location = 0) in vec2 a_Position;
  
  out vec2 v_TexCoord;
  
  void main() {
    v_TexCoord = 0.5 * (a_Position + 1.0);
    gl_Position = vec4(a_Position, 0., 1.);
  
    v_TexCoord.y = 1.0 - v_TexCoord.y;
  }
    `,
    },
    fragment: {
      glsl: `
  uniform sampler2D u_Texture;
  in vec2 v_TexCoord;
  
  out vec4 outputColor;
  
  void main() {
    outputColor = texture(SAMPLER_2D(u_Texture), v_TexCoord);
    outputColor.a = 1.0;
  }
    `,
    },
  });

  const vertexBuffer = device.createBuffer({
    viewOrSize: new Float32Array([1, 3, -3, -1, 1, -1]),
    usage: BufferUsage.VERTEX,
  });

  const inputLayout = device.createInputLayout({
    vertexBufferDescriptors: [
      {
        arrayStride: 4 * 2,
        stepMode: VertexStepMode.VERTEX,
        attributes: [
          {
            shaderLocation: 0, // a_Position
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

  const bindings = device.createBindings({
    pipeline,
    samplerBindings: [
      {
        texture,
        sampler: null,
      },
    ],
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

  let id: number;
  const frame = () => {
    /**
     * An application should call getCurrentTexture() in the same task that renders to the canvas texture.
     * Otherwise, the texture could get destroyed by these steps before the application is finished rendering to it.
     */
    const onscreenTexture = swapChain.getOnscreenTexture();

    device.beginFrame();
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
    renderPass.draw(3);

    device.submitPass(renderPass);
    device.endFrame();
    if (useRAF) {
      id = requestAnimationFrame(frame);
    }
  };

  frame();

  return () => {
    if (useRAF && id) {
      cancelAnimationFrame(id);
    }
    program.destroy();
    vertexBuffer.destroy();
    inputLayout.destroy();
    bindings.destroy();
    pipeline.destroy();
    mainColorRT.destroy();
    mainDepthRT.destroy();

    texture.destroy();

    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

render.params = {
  targets: ['webgl1', 'webgl2', 'webgpu'],
  default: 'webgl2',
};
