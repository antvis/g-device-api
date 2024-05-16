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
  CompareFunction,
  StencilOp,
} from '../../src';
import { vec3, mat4 } from 'gl-matrix';
import {
  cubeVertexArray,
  cubeVertexSize,
  cubeVertexCount,
} from '../meshes/cube';

/**
 * Use stencil buffer
 * 0 1 0
 * 1 1 1
 * 0 0 0
 *
 * @see https://maxammann.org/posts/2022/01/wgpu-stencil-testing/
 * @see https://webglfundamentals.org/webgl/lessons/webgl-qna-how-to-use-the-stencil-buffer.html
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

  const triangleProgram = device.createProgram({
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
  outputColor = vec4(0.0, 0.0, 0.0, 0.0);
}
`,
    },
  });
  const triangleVertexBuffer = device.createBuffer({
    viewOrSize: new Float32Array([0, 0.5, -0.5, -0.5, 0.5, -0.5]),
    usage: BufferUsage.VERTEX,
    hint: BufferFrequencyHint.DYNAMIC,
  });
  const triangleInputLayout = device.createInputLayout({
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
    program: triangleProgram,
  });

  const trianglePipeline = device.createRenderPipeline({
    inputLayout: triangleInputLayout,
    program: triangleProgram,
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
      depthWrite: false,
      depthCompare: CompareFunction.LESS,
      cullMode: CullMode.BACK,
      stencilWrite: true,
      stencilFront: {
        compare: CompareFunction.ALWAYS,
        passOp: StencilOp.REPLACE,
      },
      stencilBack: {
        compare: CompareFunction.ALWAYS,
        passOp: StencilOp.REPLACE,
      },
    },
  });

  const triangleProgram2 = device.createProgram({
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
  outputColor = vec4(0.0, 0.0, 0.0, 0.0);
}
`,
    },
  });
  const triangleVertexBuffer2 = device.createBuffer({
    viewOrSize: new Float32Array([0, -0.5, 0.5, 0.5, -0.5, 0.5]),
    usage: BufferUsage.VERTEX,
    hint: BufferFrequencyHint.DYNAMIC,
  });
  const triangleInputLayout2 = device.createInputLayout({
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
    program: triangleProgram2,
  });

  const trianglePipeline2 = device.createRenderPipeline({
    inputLayout: triangleInputLayout2,
    program: triangleProgram2,
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
      depthWrite: false,
      depthCompare: CompareFunction.LESS,
      cullMode: CullMode.BACK,
      stencilWrite: true,
      stencilFront: {
        compare: CompareFunction.ALWAYS,
        passOp: StencilOp.REPLACE,
      },
      stencilBack: {
        compare: CompareFunction.ALWAYS,
        passOp: StencilOp.REPLACE,
      },
    },
  });

  const program = device.createProgram({
    vertex: {
      glsl: `
layout(std140) uniform Uniforms {
  mat4 u_ModelViewProjectionMatrix;
};

layout(location = 0) in vec3 a_Position;

out vec4 v_Position;

void main() {
  v_Position = vec4(a_Position, 1.0);
  gl_Position = u_ModelViewProjectionMatrix * vec4(a_Position, 1.0);
}
`,
    },
    fragment: {
      glsl: `
  in vec4 v_Position;
  out vec4 outputColor;
  
  void main() {
    outputColor = v_Position;
  }
  `,
    },
  });

  const vertexBuffer = device.createBuffer({
    viewOrSize: cubeVertexArray,
    usage: BufferUsage.VERTEX,
  });

  const uniformBuffer = device.createBuffer({
    viewOrSize: 16 * 4, // mat4
    usage: BufferUsage.UNIFORM,
    hint: BufferFrequencyHint.DYNAMIC,
  });

  const inputLayout = device.createInputLayout({
    vertexBufferDescriptors: [
      {
        arrayStride: cubeVertexSize,
        stepMode: VertexStepMode.VERTEX,
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: Format.F32_RGB,
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
      stencilFront: {
        compare: CompareFunction.EQUAL,
        passOp: StencilOp.KEEP,
        mask: 0xff,
      },
      stencilBack: {
        compare: CompareFunction.EQUAL,
        passOp: StencilOp.KEEP,
        mask: 0xff,
      },
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
    const aspect = $canvas.width / $canvas.height;
    const projectionMatrix = mat4.perspective(
      mat4.create(),
      (2 * Math.PI) / 5,
      aspect,
      0.1,
      1000,
    );
    const viewMatrix = mat4.identity(mat4.create());
    const modelViewProjectionMatrix = mat4.create();
    mat4.translate(viewMatrix, viewMatrix, vec3.fromValues(0, 0, -4));
    const now = useRAF ? Date.now() / 1000 : 0;
    mat4.rotate(
      viewMatrix,
      viewMatrix,
      1,
      vec3.fromValues(Math.sin(now), Math.cos(now), 0),
    );
    mat4.multiply(modelViewProjectionMatrix, projectionMatrix, viewMatrix);
    uniformBuffer.setSubData(
      0,
      new Uint8Array((modelViewProjectionMatrix as Float32Array).buffer),
    );
    // WebGL1 need this
    program.setUniformsLegacy({
      u_ModelViewProjectionMatrix: modelViewProjectionMatrix,
    });

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
      stencilClearValue: 0,
    });

    /**
     * Draw a triangle in stencil buffer.
     */
    renderPass.setPipeline(trianglePipeline);
    renderPass.setVertexInput(
      triangleInputLayout,
      [
        {
          buffer: triangleVertexBuffer,
        },
      ],
      null,
    );
    renderPass.setViewport(0, 0, $canvas.width, $canvas.height);
    renderPass.setStencilReference(1);
    renderPass.draw(3);

    /**
     * Draw another triangle in stencil buffer.
     */
    renderPass.setPipeline(trianglePipeline2);
    renderPass.setVertexInput(
      triangleInputLayout2,
      [
        {
          buffer: triangleVertexBuffer2,
        },
      ],
      null,
    );
    renderPass.setViewport(0, 0, $canvas.width, $canvas.height);
    renderPass.setStencilReference(1);
    renderPass.draw(3);

    /**
     * Draw a cube.
     */
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
    // renderPass.setViewport(0, 0, $canvas.width, $canvas.height);
    renderPass.setBindings(bindings);
    renderPass.setStencilReference(1);
    renderPass.draw(cubeVertexCount);

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
    uniformBuffer.destroy();
    inputLayout.destroy();
    bindings.destroy();
    pipeline.destroy();
    mainColorRT.destroy();
    mainDepthRT.destroy();

    triangleProgram.destroy();
    triangleInputLayout.destroy();
    trianglePipeline.destroy();
    triangleVertexBuffer.destroy();

    triangleProgram2.destroy();
    triangleInputLayout2.destroy();
    trianglePipeline2.destroy();
    triangleVertexBuffer2.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

render.params = {
  targets: ['webgl1', 'webgl2', 'webgpu'],
  default: 'webgl2',
};
