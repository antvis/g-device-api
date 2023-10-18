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
  makeTextureDescriptor2D,
} from '../../src';
import { vec3, mat4 } from 'gl-matrix';
// @ts-ignore
import ndarray from 'ndarray';
// @ts-ignore
import fill from 'ndarray-fill';
// @ts-ignore
import diric from 'dirichlet';
import pool from 'typedarray-pool';
import bits from 'bit-twiddle';
import ops from 'ndarray-ops';
import pack from 'ndarray-pack';
import gradient from 'ndarray-gradient';
import colormap from 'colormap';

const SURFACE_VERTEX_SIZE = 4 * (4 + 3 + 3);
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const QUAD = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
  [1, 0],
  [0, 1],
];
const PERMUTATIONS = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
];

(function () {
  for (var i = 0; i < 3; ++i) {
    var p = PERMUTATIONS[i];
    var u = (i + 1) % 3;
    var v = (i + 2) % 3;
    p[u + 0] = 1;
    p[v + 3] = 1;
    p[i + 6] = 1;
  }
})();

const N_COLORS = 256;
const ZERO_VEC = [0, 0, 0];

const PROJECT_DATA = {
  showSurface: false,
  showContour: false,
  projections: [IDENTITY.slice(), IDENTITY.slice(), IDENTITY.slice()],
  clipBounds: [
    [
      [0, 0, 0],
      [0, 0, 0],
    ],
    [
      [0, 0, 0],
      [0, 0, 0],
    ],
    [
      [0, 0, 0],
      [0, 0, 0],
    ],
  ],
};

const UNIFORMS = {
  model: IDENTITY,
  view: IDENTITY,
  projection: IDENTITY,
  inverseModel: IDENTITY.slice(),
  lowerBound: [0, 0, 0],
  upperBound: [0, 0, 0],
  colorMap: 0,
  clipBounds: [
    [0, 0, 0],
    [0, 0, 0],
  ],
  height: 0.0,
  contourTint: 0,
  contourColor: [0, 0, 0, 1],
  permutation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  zOffset: -1e-4,
  objectOffset: [0, 0, 10],
  kambient: 1,
  kdiffuse: 1,
  kspecular: 1,
  lightPosition: [1000, 1000, 1000],
  eyePosition: [0, 0, 0],
  roughness: 1,
  fresnel: 1,
  opacity: 1,
  vertexColor: 0,
};

var MATRIX_INVERSE = IDENTITY.slice();
var DEFAULT_PERM = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// var uniforms = UNIFORMS
// uniforms.model = params.model || IDENTITY
// uniforms.view = params.view || IDENTITY
// uniforms.projection = params.projection || IDENTITY
// uniforms.lowerBound = [bounds[0][0], bounds[0][1], colorBounds[0] || bounds[0][2]]
// uniforms.upperBound = [bounds[1][0], bounds[1][1], colorBounds[1] || bounds[1][2]]
// uniforms.objectOffset = objectOffset
// uniforms.contourColor = contourColor[0]

// uniforms.inverseModel = invert(uniforms.inverseModel, uniforms.model)

// for (var i = 0; i < 2; ++i) {
//   var clipClamped = uniforms.clipBounds[i]
//   for (var j = 0; j < 3; ++j) {
//     clipClamped[j] = Math.min(Math.max(clipBounds[i][j], -1e8), 1e8)
//   }
// }

var size = 100;
var field = ndarray(new Float32Array(4 * (size + 1) * (size + 1)), [
  2 * size + 1,
  2 * size + 1,
]);

fill(field, function (x, y) {
  return (
    0.5 *
    size *
    diric(10, (5.0 * (x - size)) / size) *
    diric(10, (5.0 * (y - size)) / size)
  );
});

// var coords = [
//   ndarray(new Float32Array(4 * (size + 1) * (size + 1)), [
//     2 * size + 1,
//     2 * size + 1,
//   ]),
//   ndarray(new Float32Array(4 * (size + 1) * (size + 1)), [
//     2 * size + 1,
//     2 * size + 1,
//   ]),
//   field,
// ];

// var x = coords[0];
// var y = coords[1];
// var z = field;

// for (var i = 0; i <= 2 * size; ++i) {
//   var theta = (Math.PI * (i - size)) / size;
//   for (var j = 0; j <= 2 * size; ++j) {
//     var phi = (Math.PI * (j - size)) / size;

//     x.set(i, j, (50.0 + 20.0 * Math.cos(theta)) * Math.cos(phi));
//     y.set(i, j, (50.0 + 20.0 * Math.cos(theta)) * Math.sin(phi));
//     z.set(i, j, 20.0 * Math.sin(theta));
//   }
// }

console.log(field);

const padField = function (dstField, srcField) {
  var srcShape = srcField.shape.slice();
  var dstShape = dstField.shape.slice();

  // Center
  ops.assign(dstField.lo(1, 1).hi(srcShape[0], srcShape[1]), srcField);

  // Edges
  ops.assign(dstField.lo(1).hi(srcShape[0], 1), srcField.hi(srcShape[0], 1));
  ops.assign(
    dstField.lo(1, dstShape[1] - 1).hi(srcShape[0], 1),
    srcField.lo(0, srcShape[1] - 1).hi(srcShape[0], 1),
  );
  ops.assign(dstField.lo(0, 1).hi(1, srcShape[1]), srcField.hi(1));
  ops.assign(
    dstField.lo(dstShape[0] - 1, 1).hi(1, srcShape[1]),
    srcField.lo(srcShape[0] - 1),
  );
  // Corners
  dstField.set(0, 0, srcField.get(0, 0));
  dstField.set(0, dstShape[1] - 1, srcField.get(0, srcShape[1] - 1));
  dstField.set(dstShape[0] - 1, 0, srcField.get(srcShape[0] - 1, 0));
  dstField.set(
    dstShape[0] - 1,
    dstShape[1] - 1,
    srcField.get(srcShape[0] - 1, srcShape[1] - 1),
  );
};

function getOpacityFromScale(ratio, opacityscale) {
  // copied form gl-mesh3d
  if (!opacityscale) return 1;
  if (!opacityscale.length) return 1;

  for (var i = 0; i < opacityscale.length; ++i) {
    if (opacityscale.length < 2) return 1;
    if (opacityscale[i][0] === ratio) return opacityscale[i][1];
    if (opacityscale[i][0] > ratio && i > 0) {
      var d =
        (opacityscale[i][0] - ratio) /
        (opacityscale[i][0] - opacityscale[i - 1][0]);
      return opacityscale[i][1] * (1 - d) + d * opacityscale[i - 1][1];
    }
  }

  return 1;
}

const genColormap = function (name = 'jet', opacityscale = false) {
  var hasAlpha = false;
  var x = pack([
    colormap({
      colormap: name,
      nshades: N_COLORS,
      format: 'rgba',
    }).map(function (c, i) {
      var a = opacityscale
        ? getOpacityFromScale(i / 255.0, opacityscale)
        : c[3];
      if (a < 1) hasAlpha = true;
      return [c[0], c[1], c[2], 255 * a];
    }),
  ]);

  return [hasAlpha, x];
};

export async function render(
  deviceContribution: DeviceContribution,
  $canvas: HTMLCanvasElement,
  useRAF = true,
) {
  const _field = [
    ndarray(pool.mallocFloat(1024), [0, 0]),
    ndarray(pool.mallocFloat(1024), [0, 0]),
    ndarray(pool.mallocFloat(1024), [0, 0]),
  ];

  var fsize = (field.shape[0] + 2) * (field.shape[1] + 2);

  // Resize if necessary
  if (fsize > _field[2].data.length) {
    pool.freeFloat(_field[2].data);
    _field[2].data = pool.mallocFloat(bits.nextPow2(fsize));
  }

  // Pad field
  _field[2] = ndarray(_field[2].data, [field.shape[0] + 2, field.shape[1] + 2]);
  padField(_field[2], field);

  // Save shape of field
  const shape = field.shape.slice();

  // Resize coordinate fields if necessary
  for (var i = 0; i < 2; ++i) {
    if (_field[2].size > _field[i].data.length) {
      pool.freeFloat(_field[i].data);
      _field[i].data = pool.mallocFloat(_field[2].size);
    }
    _field[i] = ndarray(_field[i].data, [shape[0] + 2, shape[1] + 2]);
  }

  // Generate x/y coordinates
  // for (i = 0; i < 2; ++i) {
  //   var coord = coords[i];
  //   for (j = 0; j < 2; ++j) {
  //     if (coord.shape[j] !== shape[j]) {
  //       throw new Error('gl-surface: coords have incorrect shape');
  //     }
  //   }
  //   padField(_field[i], coord);
  // }

  for (i = 0; i < 2; ++i) {
    var offset = [0, 0];
    offset[i] = 1;
    _field[i] = ndarray(
      _field[i].data,
      [shape[0] + 2, shape[1] + 2],
      offset,
      0,
    );
  }
  _field[0].set(0, 0, 0);
  for (var j = 0; j < shape[0]; ++j) {
    _field[0].set(j + 1, 0, j);
  }
  _field[0].set(shape[0] + 1, 0, shape[0] - 1);
  _field[1].set(0, 0, 0);
  for (j = 0; j < shape[1]; ++j) {
    _field[1].set(0, j + 1, j);
  }
  _field[1].set(0, shape[1] + 1, shape[1] - 1);

  // Save shape
  var fields = _field;

  // Compute surface normals
  var dfields = ndarray(pool.mallocFloat(fields[2].size * 3 * 2), [
    3,
    shape[0] + 2,
    shape[1] + 2,
    2,
  ]);
  for (i = 0; i < 3; ++i) {
    gradient(dfields.pick(i), fields[i], 'mirror');
  }
  var normals = ndarray(pool.mallocFloat(fields[2].size * 3), [
    shape[0] + 2,
    shape[1] + 2,
    3,
  ]);
  for (i = 0; i < shape[0] + 2; ++i) {
    for (j = 0; j < shape[1] + 2; ++j) {
      var dxdu = dfields.get(0, i, j, 0);
      var dxdv = dfields.get(0, i, j, 1);
      var dydu = dfields.get(1, i, j, 0);
      var dydv = dfields.get(1, i, j, 1);
      var dzdu = dfields.get(2, i, j, 0);
      var dzdv = dfields.get(2, i, j, 1);

      var nx = dydu * dzdv - dydv * dzdu;
      var ny = dzdu * dxdv - dzdv * dxdu;
      var nz = dxdu * dydv - dxdv * dydu;

      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (nl < 1e-8) {
        nl = Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz));
        if (nl < 1e-8) {
          nz = 1.0;
          ny = nx = 0.0;
          nl = 1.0;
        } else {
          nl = 1.0 / nl;
        }
      } else {
        nl = 1.0 / Math.sqrt(nl);
      }

      normals.set(i, j, 0, nx * nl);
      normals.set(i, j, 1, ny * nl);
      normals.set(i, j, 2, nz * nl);
    }
  }
  pool.free(dfields.data);

  const objectOffset = UNIFORMS.objectOffset;

  // Initialize surface
  var lo = [Infinity, Infinity, Infinity];
  var hi = [-Infinity, -Infinity, -Infinity];
  var lo_intensity = Infinity;
  var hi_intensity = -Infinity;
  var count = (shape[0] - 1) * (shape[1] - 1) * 6;
  var tverts = pool.mallocFloat(bits.nextPow2(10 * count));
  var tptr = 0;
  var vertexCount = 0;
  for (i = 0; i < shape[0] - 1; ++i) {
    j_loop: for (j = 0; j < shape[1] - 1; ++j) {
      // Test for NaNs
      for (var dx = 0; dx < 2; ++dx) {
        for (var dy = 0; dy < 2; ++dy) {
          for (var k = 0; k < 3; ++k) {
            var f = _field[k].get(1 + i + dx, 1 + j + dy);
            if (isNaN(f) || !isFinite(f)) {
              continue j_loop;
            }
          }
        }
      }
      for (k = 0; k < 6; ++k) {
        var r = i + QUAD[k][0];
        var c = j + QUAD[k][1];

        var tx = _field[0].get(r + 1, c + 1);
        var ty = _field[1].get(r + 1, c + 1);
        f = _field[2].get(r + 1, c + 1);

        nx = normals.get(r + 1, c + 1, 0);
        ny = normals.get(r + 1, c + 1, 1);
        nz = normals.get(r + 1, c + 1, 2);

        // if (params.intensity) {
        //   vf = params.intensity.get(r, c)
        // }

        // var vf = (params.intensity) ?
        //   params.intensity.get(r, c) :
        //   f + objectOffset[2];

        var vf = f + objectOffset[2];

        tverts[tptr++] = r;
        tverts[tptr++] = c;
        tverts[tptr++] = tx;
        tverts[tptr++] = ty;
        tverts[tptr++] = f;
        tverts[tptr++] = 0;
        tverts[tptr++] = vf;
        tverts[tptr++] = nx;
        tverts[tptr++] = ny;
        tverts[tptr++] = nz;

        lo[0] = Math.min(lo[0], tx + objectOffset[0]);
        lo[1] = Math.min(lo[1], ty + objectOffset[1]);
        lo[2] = Math.min(lo[2], f + objectOffset[2]);
        lo_intensity = Math.min(lo_intensity, vf);

        hi[0] = Math.max(hi[0], tx + objectOffset[0]);
        hi[1] = Math.max(hi[1], ty + objectOffset[1]);
        hi[2] = Math.max(hi[2], f + objectOffset[2]);
        hi_intensity = Math.max(hi_intensity, vf);

        vertexCount += 1;
      }
    }
  }

  // if (params.intensityBounds) {
  //   lo_intensity = +params.intensityBounds[0]
  //   hi_intensity = +params.intensityBounds[1]
  // }

  // Scale all vertex intensities
  for (i = 6; i < tptr; i += 10) {
    tverts[i] = (tverts[i] - lo_intensity) / (hi_intensity - lo_intensity);
  }

  const _vertexCount = vertexCount;

  // create swap chain and get device
  const swapChain = await deviceContribution.createSwapChain($canvas);

  // TODO: resize
  swapChain.configureSwapChain($canvas.width, $canvas.height);
  const device = swapChain.getDevice();

  const program = device.createProgram({
    vertex: {
      glsl: `
layout(std140) uniform Uniforms {
  mat4 u_ProjectionMatrix;
  mat4 u_ViewMatrix;
  mat4 u_ModelMatrix;
  mat4 u_InverseModelMatrix;
  vec3 u_LightPosition;
  vec3 u_EyePosition;
};

layout(location = 0) in vec4 uv;
layout(location = 1) in vec3 f;
layout(location = 2) in vec3 normal;

out float kill;
out float value;
out vec3 lightDirection;
out vec3 eyeDirection;
out vec3 surfaceNormal;

void main() {
  vec3 localCoordinate = vec3(uv.zw, f.x);
  vec4 worldPosition = u_ModelMatrix * vec4(localCoordinate, 1.0);
  vec4 clipPosition = u_ProjectionMatrix * u_ViewMatrix * worldPosition;
  gl_Position = clipPosition;

  kill = f.y;
  value = f.z;

  vec4 cameraCoordinate = u_ViewMatrix * worldPosition;
  cameraCoordinate.xyz /= cameraCoordinate.w;
  lightDirection = u_LightPosition - cameraCoordinate.xyz;
  eyeDirection   = u_EyePosition - cameraCoordinate.xyz;
  surfaceNormal  = normalize((vec4(normal,0.0) * u_InverseModelMatrix).xyz);
} 
`,
    },
    fragment: {
      glsl: `
uniform sampler2D u_Texture;

in float value;
in float kill;
in vec3 lightDirection;
in vec3 eyeDirection;
in vec3 surfaceNormal;

out vec4 outputColor;

void main() {
  if (
    kill > 0.0
  ) discard;

  vec3 N = normalize(surfaceNormal);
  vec3 V = normalize(eyeDirection);
  vec3 L = normalize(lightDirection);

  if (gl_FrontFacing) {
    N = -N;
  }

  vec4 surfaceColor = texture(SAMPLER_2D(u_Texture), vec2(value, value));

  outputColor = surfaceColor;
}
`,
    },
  });

  const coordinateBuffer = device.createBuffer({
    viewOrSize: new Uint8Array(tverts.subarray(0, tptr).buffer),
    usage: BufferUsage.VERTEX,
  });
  pool.freeFloat(tverts);
  pool.free(normals.data);

  const [hasAlpha, data] = genColormap();
  const colorMap = device.createTexture({
    ...makeTextureDescriptor2D(Format.U8_RGBA, N_COLORS, 1, 1),
  });
  colorMap.setImageData([new Uint8Array([...data.data])]);
  const colorSampler = device.createSampler({
    addressModeU: AddressMode.CLAMP_TO_EDGE,
    addressModeV: AddressMode.CLAMP_TO_EDGE,
    minFilter: FilterMode.BILINEAR,
    magFilter: FilterMode.BILINEAR,
    mipmapFilter: MipmapFilterMode.LINEAR,
    lodMinClamp: 0,
    lodMaxClamp: 0,
  });

  const uniformBuffer = device.createBuffer({
    viewOrSize: 16 * 4 + 16 * 4 + 16 * 4 + 16 * 4 + 4 * 4 + 4 * 4, // mat4
    usage: BufferUsage.UNIFORM,
    hint: BufferFrequencyHint.DYNAMIC,
  });

  const inputLayout = device.createInputLayout({
    vertexBufferDescriptors: [
      {
        arrayStride: SURFACE_VERTEX_SIZE,
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
            format: Format.F32_RGB,
          },
          {
            shaderLocation: 2,
            offset: 4 * 7,
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
        texture: colorMap,
        sampler: colorSampler,
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
    const modelMatrix = mat4.identity(mat4.create());
    const viewMatrix = mat4.identity(mat4.create());
    const modelViewProjectionMatrix = mat4.create();
    mat4.translate(viewMatrix, viewMatrix, vec3.fromValues(0, 0, -200));
    const now = useRAF ? Date.now() / 1000 : 0;
    mat4.rotate(
      viewMatrix,
      viewMatrix,
      1,
      vec3.fromValues(Math.sin(now), Math.cos(now), 0),
    );
    mat4.multiply(modelViewProjectionMatrix, projectionMatrix, viewMatrix);

    // Compute camera matrix inverse
    const invCameraMatrix = mat4.identity(mat4.create());
    mat4.multiply(invCameraMatrix, viewMatrix, modelMatrix);
    mat4.multiply(invCameraMatrix, projectionMatrix, invCameraMatrix);
    mat4.invert(invCameraMatrix, invCameraMatrix);

    const eyePosition = vec3.create();
    const light = [10, 10000, 0];
    const lightPosition = vec3.create();
    for (i = 0; i < 3; ++i) {
      eyePosition[i] = invCameraMatrix[12 + i] / invCameraMatrix[15];
    }
    var w = invCameraMatrix[15];
    for (i = 0; i < 3; ++i) {
      w += light[i] * invCameraMatrix[4 * i + 3];
    }
    for (i = 0; i < 3; ++i) {
      var s = invCameraMatrix[12 + i];
      for (j = 0; j < 3; ++j) {
        s += invCameraMatrix[4 * j + i] * light[j];
      }
      lightPosition[i] = s / w;
    }

    uniformBuffer.setSubData(
      0,
      new Uint8Array(
        new Float32Array([
          // mat4 u_ProjectionMatrix;
          // mat4 u_ViewMatrix;
          // mat4 u_ModelMatrix;
          // mat4 u_InverseModelMatrix;
          // vec3 u_LightPosition;
          // vec3 u_EyePosition;
          ...projectionMatrix,
          ...viewMatrix,
          ...modelMatrix,
          ...modelMatrix,
          ...lightPosition,
          0,
          ...eyePosition,
          0,
        ]).buffer,
      ),
    );
    // WebGL1 need this
    // program.setUniformsLegacy({
    //   u_ModelViewProjectionMatrix: modelViewProjectionMatrix,
    // });

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
          buffer: coordinateBuffer,
        },
      ],
      null,
    );
    renderPass.setViewport(0, 0, $canvas.width, $canvas.height);
    renderPass.setBindings(bindings);
    renderPass.draw(vertexCount);

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
    coordinateBuffer.destroy();
    uniformBuffer.destroy();
    inputLayout.destroy();
    bindings.destroy();
    pipeline.destroy();
    mainColorRT.destroy();
    mainDepthRT.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

render.params = {
  targets: ['webgl1', 'webgl2', 'webgpu'],
  default: 'webgl2',
};
