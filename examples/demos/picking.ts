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
  ViewportOrigin,
  Readback,
} from '../../src';
import { vec3, mat4 } from 'gl-matrix';
import {
  cubeVertexArray,
  cubeVertexSize,
  cubeVertexCount,
} from '../meshes/cube';

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
  const queryVendorInfo = device.queryVendorInfo();

  const program = device.createProgram({
    vertex: {
      glsl: `
layout(std140) uniform Uniforms {
  mat4 u_ModelViewProjectionMatrix;
};

layout(std140) uniform PickingUniforms {
  float u_IsPicking;
  float u_IsHighLighting;
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
layout(std140) uniform Uniforms {
  mat4 u_ModelViewProjectionMatrix;
};

layout(std140) uniform PickingUniforms {
  float u_IsPicking;
  float u_IsHighLighting;
};

in vec4 v_Position;
out vec4 outputColor;

void main() {
  outputColor = u_IsPicking == 1.0 ? vec4(1.0, 0.0, 0.0, 1.0) : (u_IsHighLighting == 1.0 ? vec4(0.0, 1.0, 0.0, 1.0) : v_Position);
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
  const pickingUniformBuffer = device.createBuffer({
    viewOrSize: 2 * 4, // 2 floats
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
    },
  });

  const pipeline2 = device.createRenderPipeline({
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
      depthWrite: true,
      depthCompare: CompareFunction.LESS,
      stencilWrite: false,
    },
  });

  const bindings = device.createBindings({
    pipeline,
    uniformBufferBindings: [
      {
        buffer: uniformBuffer,
      },
      {
        buffer: pickingUniformBuffer,
      },
    ],
  });
  const bindings2 = device.createBindings({
    pipeline: pipeline2,
    uniformBufferBindings: [
      {
        buffer: uniformBuffer,
      },
      {
        buffer: pickingUniformBuffer,
      },
    ],
  });

  const mainColorTexture = device.createTexture({
    format: Format.U8_RGBA_RT,
    width: $canvas.width,
    height: $canvas.height,
    usage: TextureUsage.RENDER_TARGET,
  });
  const mainColorRT = device.createRenderTargetFromTexture(mainColorTexture);
  const mainDepthRT = device.createRenderTargetFromTexture(
    device.createTexture({
      format: Format.D24_S8,
      width: $canvas.width,
      height: $canvas.height,
      usage: TextureUsage.RENDER_TARGET,
    }),
  );
  const pickingColorTexture = device.createTexture({
    format: Format.U8_RGBA_RT,
    width: $canvas.width,
    height: $canvas.height,
    usage: TextureUsage.RENDER_TARGET,
    mipLevelCount: 1,
  });
  const pickingColorRT =
    device.createRenderTargetFromTexture(pickingColorTexture);
  const pickingDepthRT = device.createRenderTargetFromTexture(
    device.createTexture({
      format: Format.D24_S8,
      width: $canvas.width,
      height: $canvas.height,
      usage: TextureUsage.RENDER_TARGET,
    }),
  );
  const readback = device.createReadback();

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
    pickingUniformBuffer.setSubData(
      0,
      new Uint8Array(new Float32Array([0, 0]).buffer),
    );
    // WebGL1 need this
    program.setUniformsLegacy({
      u_ModelViewProjectionMatrix: modelViewProjectionMatrix,
      u_IsPicking: 0,
      u_IsHighLighting: 0,
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
    renderPass.draw(cubeVertexCount);
    device.submitPass(renderPass);
    device.endFrame();
  };

  $canvas.addEventListener('mousemove', async (e) => {
    pickingUniformBuffer.setSubData(
      0,
      new Uint8Array(new Float32Array([1, 0]).buffer),
    );
    program.setUniformsLegacy({
      u_IsPicking: 1,
      u_IsHighLighting: 0,
    });

    device.beginFrame();
    const renderPass2 = device.createRenderPass({
      colorAttachment: [pickingColorRT],
      colorResolveTo: [null],
      colorClearColor: [TransparentWhite],
      colorStore: [true],
      depthStencilAttachment: pickingDepthRT,
      depthClearValue: 1,
    });
    renderPass2.setPipeline(pipeline2);
    renderPass2.setVertexInput(
      inputLayout,
      [
        {
          buffer: vertexBuffer,
        },
      ],
      null,
    );
    renderPass2.setViewport(0, 0, $canvas.width, $canvas.height);
    renderPass2.setBindings(bindings2);
    renderPass2.draw(cubeVertexCount);
    device.submitPass(renderPass2);
    device.endFrame();

    const dpr = window.devicePixelRatio;
    // const pixel = readback.readTextureSync(
    const pixel = (await readback.readTexture(
      pickingColorTexture,
      e.offsetX * dpr,
      queryVendorInfo.platformString === 'WebGPU'
        ? 1000 - e.offsetY * dpr
        : e.offsetY * dpr,
      1,
      1,
      new Uint8ClampedArray(1 * 1 * 4),
    )) as Uint8ClampedArray | Uint8Array;

    // Since we use U8_RGBA_RT format in render target, need to change bgranorm -> rgba here.
    if (queryVendorInfo.platformString === 'WebGPU') {
      for (let j = 0; j < pixel.length; j += 4) {
        // Switch b and r components.
        const t = pixel[j];
        pixel[j] = pixel[j + 2];
        pixel[j + 2] = t;
      }
    }

    if (
      pixel[0] === 255 &&
      pixel[1] === 0 &&
      pixel[2] === 0 &&
      pixel[3] === 255
    ) {
      pickingUniformBuffer.setSubData(
        0,
        new Uint8Array(new Float32Array([0, 1]).buffer),
      );
      program.setUniformsLegacy({
        u_IsPicking: 0,
        u_IsHighLighting: 1,
      });
    } else {
      pickingUniformBuffer.setSubData(
        0,
        new Uint8Array(new Float32Array([0, 0]).buffer),
      );
      program.setUniformsLegacy({
        u_IsPicking: 0,
        u_IsHighLighting: 0,
      });
    }

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
    renderPass.draw(cubeVertexCount);
    device.submitPass(renderPass);
    device.endFrame();
  });

  frame();

  return () => {
    program.destroy();
    vertexBuffer.destroy();
    uniformBuffer.destroy();
    pickingUniformBuffer.destroy();
    inputLayout.destroy();
    bindings.destroy();
    bindings2.destroy();
    pipeline.destroy();
    pipeline2.destroy();
    mainColorRT.destroy();
    mainDepthRT.destroy();
    pickingColorRT.destroy();
    pickingDepthRT.destroy();
    readback.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

render.params = {
  targets: ['webgl1', 'webgl2', 'webgpu'],
  default: 'webgl2',
};
