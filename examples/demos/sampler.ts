import {
  DeviceContribution,
  VertexStepMode,
  Format,
  TransparentWhite,
  BufferUsage,
  BufferFrequencyHint,
  TextureUsage,
} from '../../src';

// Low-res, pixelated render target so it's easier to see fine details.
const kCanvasSize = 200;
const kViewportGridSize = 4;
const kViewportGridStride = Math.floor(kCanvasSize / kViewportGridSize);
const kViewportSize = kViewportGridStride - 2;

// The canvas buffer size is 200x200.
// Compute a canvas CSS size such that there's an integer number of device
// pixels per canvas pixel ("integer" or "pixel-perfect" scaling).
// Note the result may be 1 pixel off since ResizeObserver is not used.
const kCanvasLayoutCSSSize = 500; // set by template styles
const kCanvasLayoutDevicePixels =
  kCanvasLayoutCSSSize * window.devicePixelRatio;
const kScaleFactor = Math.floor(kCanvasLayoutDevicePixels / kCanvasSize);
const kCanvasDevicePixels = kScaleFactor * kCanvasSize;
const kCanvasCSSSize = kCanvasDevicePixels / window.devicePixelRatio;

// Set up a texture with 4 mip levels, each containing a differently-colored
// checkerboard with 1x1 pixels (so when rendered the checkerboards are
// different sizes). This is different from a normal mipmap where each level
// would look like a lower-resolution version of the previous one.
// Level 0 is 16x16 white/black
// Level 1 is 8x8 blue/black
// Level 2 is 4x4 yellow/black
// Level 3 is 2x2 pink/black
const kTextureMipLevels = 4;
const kTextureBaseSize = 16;

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

  const checkerboard = device.createTexture({
    format: Format.U8_RGBA_RT,
    usage: TextureUsage.SAMPLED,
    width: kTextureBaseSize,
    height: kTextureBaseSize,
    mipLevelCount: 4,
  });
  const kColorForLevel = [
    [255, 255, 255, 255],
    [30, 136, 229, 255], // blue
    [255, 193, 7, 255], // yellow
    [216, 27, 96, 255], // pink
  ];
  for (let mipLevel = 0; mipLevel < kTextureMipLevels; ++mipLevel) {
    const size = 2 ** (kTextureMipLevels - mipLevel); // 16, 8, 4, 2
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; ++y) {
      for (let x = 0; x < size; ++x) {
        data.set(
          (x + y) % 2 ? kColorForLevel[mipLevel] : [0, 0, 0, 255],
          (y * size + x) * 4,
        );
      }
    }

    checkerboard.setImageData([data], mipLevel);
    // device.queue.writeTexture(
    //   { texture: checkerboard, mipLevel },
    //   data,
    //   { bytesPerRow: size * 4 },
    //   [size, size]
    // );
  }

  const program = device.createProgram({
    vertex: {
      wgsl: `
struct Config {
  viewProj: mat4x4f,
  animationOffset: vec2f,
  flangeSize: f32,
  highlightFlange: f32,
};
@group(0) @binding(0) var<uniform> config: Config;
@group(0) @binding(1) var<storage, read> matrices: array<mat4x4f>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var tex: texture_2d<f32>;

struct Varying {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

override kTextureBaseSize: f32;
override kViewportSize: f32;

@vertex
fn vmain(
  @builtin(instance_index) instance_index: u32,
  @builtin(vertex_index) vertex_index: u32,
) -> Varying {
  let flange = config.flangeSize;
  var uvs = array(
    vec2(-flange, -flange), vec2(-flange, 1 + flange), vec2(1 + flange, -flange),
    vec2(1 + flange, -flange), vec2(-flange, 1 + flange), vec2(1 + flange, 1 + flange),
  );
  // Default size (if matrix is the identity) makes 1 texel = 1 pixel.
  let radius = (1 + 2 * flange) * kTextureBaseSize / kViewportSize;
  var positions = array(
    vec2(-radius, -radius), vec2(-radius, radius), vec2(radius, -radius),
    vec2(radius, -radius), vec2(-radius, radius), vec2(radius, radius),
  );

  let modelMatrix = matrices[instance_index];
  let pos = config.viewProj * modelMatrix * vec4f(positions[vertex_index] + config.animationOffset, 0, 1);
  return Varying(pos, uvs[vertex_index]);
}
`,
    },
    fragment: {
      wgsl: `
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

  const renderTarget = device.createRenderTargetFromTexture(
    device.createTexture({
      format: Format.U8_RGBA_RT,
      width: $canvas.width,
      height: $canvas.height,
      usage: TextureUsage.RENDER_TARGET,
    }),
  );
  device.setResourceName(renderTarget, 'Main Render Target');

  let id: number;
  const frame = () => {
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
    pipeline.destroy();
    renderTarget.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

render.params = {
  targets: ['webgl1', 'webgl2', 'webgpu'],
  default: 'webgpu',
};
