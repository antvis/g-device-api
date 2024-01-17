import {
  DeviceContribution,
  VertexStepMode,
  Format,
  TransparentWhite,
  BufferUsage,
  BufferFrequencyHint,
  TextureUsage,
} from '../../src';

/**
 * A WebGPU port of the Animometer MotionMark benchmark.
 * @see https://webgpu.github.io/webgpu-samples/samples/animometer#main.ts
 * @see https://developer.mozilla.org/en-US/docs/Web/API/GPURenderBundle
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
  layout(std140) uniform Uniforms {
    float scale;
    float offsetX;
    float offsetY;
    float scalar;
    float scalarOffset;
  };
  layout(std140) uniform Time {
    float value;
  };

  layout(location = 0) in vec4 position;
  layout(location = 1) in vec4 color;

  out vec4 v_color;
  
  void main() {
    // GLSL doesn't support % operator.
    // @see https://stackoverflow.com/questions/35155598/unable-to-use-in-glsl
    float a = (scalarOffset + value * scalar / 10.0);
    float b = 1.0;
    float fade = a - (b * floor(a/b));
    if (fade < 0.5) {
      fade = fade * 2.0;
    } else {
      fade = (1.0 - fade) * 2.0;
    }

    float xpos = position.x * scale;
    float ypos = position.y * scale;
    float angle = 3.14159 * 2.0 * fade;
    float xrot = xpos * cos(angle) - ypos * sin(angle);
    float yrot = xpos * sin(angle) + ypos * cos(angle);
    xpos = xrot + offsetX;
    ypos = yrot + offsetY;

    v_color = vec4(fade, 1.0 - fade, 0.0, 1.0) + color;
    gl_Position = vec4(xpos, ypos, 0.0, 1.0);
  } 
  `,
    },
    fragment: {
      glsl: `
  in vec4 v_color;
  out vec4 outputColor;
  
  void main() {
    outputColor = v_color;
  }
  `,
    },
  });

  const numTriangles = 500;
  const uniformBytes = 5 * Float32Array.BYTES_PER_ELEMENT;
  const alignedUniformBytes = Math.ceil(uniformBytes / 256) * 256;
  const alignedUniformFloats =
    alignedUniformBytes / Float32Array.BYTES_PER_ELEMENT;
  const uniformBufferData = new Float32Array(
    numTriangles * alignedUniformFloats,
  );
  for (let i = 0; i < numTriangles; ++i) {
    uniformBufferData[alignedUniformFloats * i + 0] = Math.random() * 0.2 + 0.2; // scale
    uniformBufferData[alignedUniformFloats * i + 1] =
      0.9 * 2 * (Math.random() - 0.5); // offsetX
    uniformBufferData[alignedUniformFloats * i + 2] =
      0.9 * 2 * (Math.random() - 0.5); // offsetY
    uniformBufferData[alignedUniformFloats * i + 3] = Math.random() * 1.5 + 0.5; // scalar
    uniformBufferData[alignedUniformFloats * i + 4] = Math.random() * 10; // scalarOffset
  }

  const uniformBuffer = device.createBuffer({
    viewOrSize: Float32Array.BYTES_PER_ELEMENT * uniformBufferData.length, // mat4
    usage: BufferUsage.UNIFORM,
    hint: BufferFrequencyHint.DYNAMIC,
  });
  uniformBuffer.setSubData(0, new Uint8Array(uniformBufferData.buffer));
  const timeUniformBuffer = device.createBuffer({
    viewOrSize: Float32Array.BYTES_PER_ELEMENT * 1,
    usage: BufferUsage.UNIFORM,
    hint: BufferFrequencyHint.DYNAMIC,
  });

  const vec4Size = 4 * Float32Array.BYTES_PER_ELEMENT;
  const vertexBuffer = device.createBuffer({
    viewOrSize: new Float32Array([
      // position data  /**/ color data
      0, 0.1, 0, 1, /**/ 1, 0, 0, 1, -0.1, -0.1, 0, 1, /**/ 0, 1, 0, 1, 0.1,
      -0.1, 0, 1, /**/ 0, 0, 1, 1,
    ]),
    usage: BufferUsage.VERTEX,
    hint: BufferFrequencyHint.DYNAMIC,
  });

  const inputLayout = device.createInputLayout({
    vertexBufferDescriptors: [
      {
        arrayStride: 2 * vec4Size,
        stepMode: VertexStepMode.VERTEX,
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: Format.F32_RGBA,
          },
          {
            shaderLocation: 1,
            offset: 4 * 4,
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
  });

  const bindGroups = new Array(numTriangles);
  for (let i = 0; i < numTriangles; ++i) {
    bindGroups[i] = device.createBindings({
      pipeline,
      uniformBufferBindings: [
        {
          buffer: uniformBuffer,
          offset: i * alignedUniformBytes,
          size: 6 * Float32Array.BYTES_PER_ELEMENT,
        },
        {
          buffer: timeUniformBuffer,
        },
      ],
    });
  }

  const renderTarget = device.createRenderTargetFromTexture(
    device.createTexture({
      format: Format.U8_RGBA_RT,
      width: $canvas.width,
      height: $canvas.height,
      usage: TextureUsage.RENDER_TARGET,
    }),
  );
  device.setResourceName(renderTarget, 'Main Render Target');

  const renderBundle = device.createRenderBundle();

  let id: number;
  let frameCount = 0;
  const frame = (time: number) => {
    timeUniformBuffer.setSubData(
      0,
      new Uint8Array(new Float32Array([time / 1000]).buffer),
    );

    device.beginFrame();
    /**
     * An application should call getCurrentTexture() in the same task that renders to the canvas texture.
     * Otherwise, the texture could get destroyed by these steps before the application is finished rendering to it.
     */
    const onscreenTexture = swapChain.getOnscreenTexture();

    const renderPass = device.createRenderPass({
      colorAttachment: [renderTarget],
      colorResolveTo: [onscreenTexture],
      colorClearColor: [TransparentWhite],
    });

    if (frameCount === 0) {
      renderPass.beginBundle(renderBundle);
      for (let i = 0; i < numTriangles; ++i) {
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
        renderPass.setBindings(bindGroups[i]);
        renderPass.setViewport(0, 0, $canvas.width, $canvas.height);
        renderPass.draw(3);
      }
      renderPass.endBundle();
    } else {
      renderPass.executeBundles([renderBundle]);
    }

    device.submitPass(renderPass);

    device.endFrame();
    if (useRAF) {
      id = requestAnimationFrame(frame);
      frameCount++;
    }
  };

  frame(0);

  return () => {
    if (useRAF && id) {
      cancelAnimationFrame(id);
    }
    program.destroy();
    vertexBuffer.destroy();
    inputLayout.destroy();
    pipeline.destroy();
    renderTarget.destroy();
    renderBundle.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

render.params = {
  targets: ['webgl2', 'webgpu'],
  default: 'webgl2',
};
