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
} from '../../src';
import { initExample } from './utils';
import {
  cubeVertexArray,
  cubeVertexSize,
  cubeVertexCount,
  cubePositionOffset,
} from '../meshes/cube';
import { vec3, mat4 } from 'gl-matrix';

/**
 * This example shows some of the alignment requirements involved when updating and binding multiple slices of a uniform buffer.
 * It renders two rotating cubes which have transform matrices at different offsets in a uniform buffer.
 * @see https://webgpu.github.io/webgpu-samples/samples/twoCubes
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

out vec4 v_Position;

void main() {
  v_Position = 0.5 * (a_Position + vec4(1.0, 1.0, 1.0, 1.0));
  gl_Position = u_ModelViewProjectionMatrix * a_Position;
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

  const matrixSize = 4 * 16; // 4x4 matrix
  const offset = 256; // uniformBindGroup offset must be 256-byte aligned
  const uniformBufferSize = offset + matrixSize;

  const uniformBuffer = device.createBuffer({
    viewOrSize: uniformBufferSize, // mat4
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
            offset: cubePositionOffset,
            format: Format.F32_RGBA,
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

  const bindings1 = device.createBindings({
    pipeline,
    uniformBufferBindings: [
      {
        binding: 0,
        buffer: uniformBuffer,
        offset: 0,
        size: matrixSize,
      },
    ],
  });
  const bindings2 = device.createBindings({
    pipeline,
    uniformBufferBindings: [
      {
        binding: 0,
        buffer: uniformBuffer,
        offset,
        size: matrixSize,
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

  const modelMatrix1 = mat4.fromTranslation(
    mat4.create(),
    vec3.fromValues(-2, 0, 0),
  );
  const modelMatrix2 = mat4.fromTranslation(
    mat4.create(),
    vec3.fromValues(2, 0, 0),
  );
  const modelViewProjectionMatrix1 = mat4.create();
  const modelViewProjectionMatrix2 = mat4.create();
  const viewMatrix = mat4.fromTranslation(
    mat4.create(),
    vec3.fromValues(0, 0, -7),
  );
  const tmpMat41 = mat4.create();
  const tmpMat42 = mat4.create();
  let id: number;
  const frame = () => {
    const aspect = $canvas.width / $canvas.height;
    const projectionMatrix = mat4.perspective(
      mat4.create(),
      (2 * Math.PI) / 5,
      aspect,
      1,
      100,
    );

    const now = useRAF ? Date.now() / 1000 : 0;
    mat4.rotate(
      tmpMat41,
      modelMatrix1,
      1,
      vec3.fromValues(Math.sin(now), Math.cos(now), 0),
    );
    mat4.rotate(
      tmpMat42,
      modelMatrix2,
      1,
      vec3.fromValues(Math.cos(now), Math.sin(now), 0),
    );

    mat4.multiply(modelViewProjectionMatrix1, viewMatrix, tmpMat41);
    mat4.multiply(
      modelViewProjectionMatrix1,
      projectionMatrix,
      modelViewProjectionMatrix1,
    );
    mat4.multiply(modelViewProjectionMatrix2, viewMatrix, tmpMat42);
    mat4.multiply(
      modelViewProjectionMatrix2,
      projectionMatrix,
      modelViewProjectionMatrix2,
    );

    uniformBuffer.setSubData(
      0,
      new Uint8Array((modelViewProjectionMatrix1 as Float32Array).buffer),
    );
    uniformBuffer.setSubData(
      offset,
      new Uint8Array((modelViewProjectionMatrix2 as Float32Array).buffer),
    );

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
    renderPass.setBindings(bindings1);
    renderPass.draw(cubeVertexCount);
    renderPass.setBindings(bindings2);
    renderPass.draw(cubeVertexCount);

    device.submitPass(renderPass);
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
    bindings1.destroy();
    bindings2.destroy();
    pipeline.destroy();
    mainColorRT.destroy();
    mainDepthRT.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

export async function TwoCubes($container: HTMLDivElement) {
  return initExample($container, render, {
    targets: ['webgl2', 'webgpu'],
    default: 'webgl2',
  });
}
