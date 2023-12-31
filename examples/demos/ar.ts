import {
  DeviceContribution,
  VertexStepMode,
  Format,
  BufferUsage,
  BufferFrequencyHint,
  BlendMode,
  BlendFactor,
  TextureUsage,
  CullMode,
  ChannelWriteMask,
  TransparentBlack,
  CompareFunction,
  TransparentWhite,
} from '../../src';
import { vec3, mat4, quat } from 'gl-matrix';
import {
  cubeVertexArray,
  cubeVertexSize,
  cubeVertexCount,
} from '../meshes/cube';

export async function render(
  deviceContribution: DeviceContribution,
  $canvas: HTMLCanvasElement,
) {
  // create swap chain and get device
  const swapChain = await deviceContribution.createSwapChain($canvas);

  const device = swapChain.getDevice();
  const gl = device['gl'];

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
    outputColor = vec4(1.0, 0.0, 0.0, 1.0);
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

  const activateXR = async () => {
    // Initialize a WebXR session using "immersive-ar".
    const session = await navigator.xr!.requestSession('immersive-ar', {
      requiredFeatures: ['local'],
    });
    session.updateRenderState({
      baseLayer: new XRWebGLLayer(session, gl, {
        alpha: true,
        antialias: false,
        depth: true,
        stencil: false,
      }),
    });

    // A 'local' reference space has a native origin that is located
    // near the viewer's position at the time the session was created.
    const referenceSpace = await session.requestReferenceSpace('local');

    const modelViewProjectionMatrix = mat4.create();
    const modelViewMatrix = mat4.create();
    const modelMatrix = mat4.fromRotationTranslationScale(
      mat4.create(),
      quat.create(),
      vec3.fromValues(0, 0, 0),
      vec3.fromValues(1, 1, 1),
    );

    const onXRFrame: XRFrameRequestCallback = (time, frame) => {
      // Assumed to be a XRWebGLLayer for now.
      let layer = session.renderState.baseLayer;
      if (!layer) {
        layer = session.renderState.layers![0] as XRWebGLLayer;
      } else {
        // Bind the graphics framebuffer to the baseLayer's framebuffer.
        // Only baseLayer has framebuffer and we need to bind it, even if it is null (for inline sessions).
        // gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
      }

      swapChain.configureSwapChain(
        layer.framebufferWidth,
        layer.framebufferHeight,
        layer.framebuffer,
      );
      /**
       * An application should call getCurrentTexture() in the same task that renders to the canvas texture.
       * Otherwise, the texture could get destroyed by these steps before the application is finished rendering to it.
       */
      const onscreenTexture = swapChain.getOnscreenTexture();

      // Retrieve the pose of the device.
      // XRFrame.getViewerPose can return null while the session attempts to establish tracking.
      const pose = frame.getViewerPose(referenceSpace);
      if (pose) {
        // In mobile AR, we only have one view.
        const view = pose.views[0];

        const viewport = session.renderState.baseLayer!.getViewport(view)!;

        // Use the view's transform matrix and projection matrix
        const viewMatrix = mat4.invert(mat4.create(), view.transform.matrix);
        const projectionMatrix = view.projectionMatrix;

        const fov = 2.0 * Math.atan(1.0 / projectionMatrix[5]);
        const aspect = projectionMatrix[5] / projectionMatrix[0];

        console.log(fov, aspect, $canvas.width, $canvas.height);

        mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
        mat4.multiply(
          modelViewProjectionMatrix,
          projectionMatrix,
          modelViewMatrix,
        );

        uniformBuffer.setSubData(
          0,
          new Uint8Array((modelViewProjectionMatrix as Float32Array).buffer),
        );
        // WebGL1 need this
        program.setUniformsLegacy({
          u_ModelViewProjectionMatrix: modelViewProjectionMatrix,
        });

        const renderPass = device.createRenderPass({
          colorAttachment: [mainColorRT],
          colorResolveTo: [null],
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

        device.copySubTexture2D(
          onscreenTexture,
          viewport.x,
          viewport.y,
          mainColorTexture,
          0,
          0,
        );
      }

      // Queue up the next draw request.
      session.requestAnimationFrame(onXRFrame);
    };
    session.requestAnimationFrame(onXRFrame);
  };

  // Starting an immersive WebXR session requires user interaction.
  // We start this one with a simple button.
  const $button = document.createElement('button');
  $button.innerHTML = 'Start Hello WebXR';
  $button.onclick = activateXR;
  $canvas.parentElement?.appendChild($button);

  return () => {
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

render.params = {
  targets: ['webgl1', 'webgl2'],
  xrCompatible: true,
  default: 'webgl2',
};
