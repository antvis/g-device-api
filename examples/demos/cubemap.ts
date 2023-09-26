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
  AddressMode,
  FilterMode,
  MipmapFilterMode,
  TextureDimension,
} from '../../src';
import { initExample, loadImage } from './utils';
import { vec3, mat4 } from 'gl-matrix';
import {
  cubeVertexArray,
  cubeVertexSize,
  cubeVertexCount,
  cubePositionOffset,
  cubeUVOffset,
} from '../meshes/cube';
// @ts-ignore
import posx from '../public/images/posx.jpg';
// @ts-ignore
import negx from '../public/images/negx.jpg';
// @ts-ignore
import posy from '../public/images/posy.jpg';
// @ts-ignore
import negy from '../public/images/negy.jpg';
// @ts-ignore
import posz from '../public/images/posz.jpg';
// @ts-ignore
import negz from '../public/images/negz.jpg';

/**
 * @see https://webgpu.github.io/webgpu-samples/samples/texturedCube
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
layout(location = 1) in vec2 a_Uv;

out vec2 v_Uv;
out vec4 v_Position;

void main() {
  v_Uv = a_Uv;
  v_Position = 0.5 * (a_Position + vec4(1.0, 1.0, 1.0, 1.0));
  gl_Position = u_ModelViewProjectionMatrix * a_Position;
} 
`,
    },
    fragment: {
      glsl: `
uniform samplerCube u_Texture;
in vec2 v_Uv;
in vec4 v_Position;
out vec4 outputColor;

void main() {
  vec3 cubemapVec = v_Position.xyz - vec3(0.5);
  outputColor = texture(SAMPLER_Cube(u_Texture), cubemapVec);
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

  // The order of the array layers is [+X, -X, +Y, -Y, +Z, -Z]
  const imageBitmaps = await Promise.all(
    [posx, negx, posy, negy, posz, negz].map(async (src) => loadImage(src)),
  );

  const texture = device.createTexture({
    format: Format.U8_RGBA_NORM,
    width: imageBitmaps[0].width,
    height: imageBitmaps[0].height,
    depthOrArrayLayers: 6,
    dimension: TextureDimension.TEXTURE_CUBE_MAP,
    usage: TextureUsage.SAMPLED,
  });
  texture.setImageData(imageBitmaps);
  device.setResourceName(texture, 'Cube map');

  const sampler = device.createSampler({
    addressModeU: AddressMode.CLAMP_TO_EDGE,
    addressModeV: AddressMode.CLAMP_TO_EDGE,
    minFilter: FilterMode.BILINEAR,
    magFilter: FilterMode.BILINEAR,
    mipmapFilter: MipmapFilterMode.LINEAR,
    lodMinClamp: 0,
    lodMaxClamp: 0,
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
          {
            shaderLocation: 1,
            offset: cubeUVOffset,
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
      // Since we are seeing from inside of the cube
      // and we are using the regular cube geomtry data with outward-facing normals,
      // the cullMode should be 'front' or 'none'.
      cullMode: CullMode.NONE,
      stencilWrite: false,
    },
  });

  const bindings = device.createBindings({
    pipeline,
    uniformBufferBindings: [
      {
        binding: 0,
        buffer: uniformBuffer,
      },
    ],
    samplerBindings: [
      {
        texture,
        sampler,
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

  let id;
  const modelMatrix = mat4.fromScaling(
    mat4.create(),
    vec3.fromValues(1000, 1000, 1000),
  );
  const modelViewProjectionMatrix = mat4.create();
  const viewMatrix = mat4.identity(mat4.create());
  const tmpMat4 = mat4.create();

  const frame = () => {
    const aspect = $canvas.width / $canvas.height;
    const projectionMatrix = mat4.perspective(
      mat4.create(),
      (2 * Math.PI) / 5,
      aspect,
      1,
      3000,
    );

    const now = Date.now() / 800;

    mat4.rotate(
      tmpMat4,
      viewMatrix,
      (Math.PI / 10) * Math.sin(now),
      vec3.fromValues(1, 0, 0),
    );
    mat4.rotate(tmpMat4, tmpMat4, now * 0.2, vec3.fromValues(0, 1, 0));
    mat4.multiply(modelViewProjectionMatrix, tmpMat4, modelMatrix);
    mat4.multiply(
      modelViewProjectionMatrix,
      projectionMatrix,
      modelViewProjectionMatrix,
    );
    uniformBuffer.setSubData(
      0,
      new Uint8Array((modelViewProjectionMatrix as Float32Array).buffer),
    );
    // WebGL1 need this
    program.setUniformsLegacy({
      u_ModelViewProjectionMatrix: modelViewProjectionMatrix,
      u_Texture: texture,
    });

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
    renderPass.setBindings(bindings);
    renderPass.draw(cubeVertexCount, 1, 0, 0);

    device.submitPass(renderPass);
    id = requestAnimationFrame(frame);
  };

  frame();

  return () => {
    if (id) {
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
    texture.destroy();
    sampler.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

export async function Cubemap($container: HTMLDivElement) {
  return initExample($container, render, {
    targets: ['webgl1', 'webgl2', 'webgpu'],
    default: 'webgl2',
  });
}
