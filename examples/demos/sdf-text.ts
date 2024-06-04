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
import { vec3, mat4 } from 'gl-matrix';
import {
  cubeVertexArray,
  cubeVertexSize,
  cubeVertexCount,
} from '../meshes/cube';
import { Tuples, makeTuples } from '../utils/tuple';

import {
  Font,
  glyphToSDF,
  rgbaToSDF,
  RustText,
  packStrings,
} from '@use-gpu/glyph';
import { makeInlineCursor } from '../utils/cursor';
import memoizeOne from 'memoize-one';
import { Atlas, makeAtlas } from '../utils/atlas';
import { mixBits53, scrambleBits53 } from '../utils/hash';

type Rectangle = [number, number, number, number];

type FontMetrics = {
  ascent: number;
  descent: number;
  lineHeight: number;
  xHeight: number;
  emUnit: number;
};
type Alignment =
  | 'start'
  | 'center'
  | 'end'
  | 'justify'
  | 'justify-start'
  | 'justify-center'
  | 'justify-end'
  | 'between'
  | 'evenly';

export type GlyphMetrics = {
  id: number[];
  layoutBounds: [number, number, number, number];
  outlineBounds: [number, number, number, number] | null;
  image: Uint8Array;
  width: number;
  height: number;
  rgba: boolean;
  scale: number;
};
type CachedGlyph = {
  glyph: GlyphMetrics;
  mapping: [number, number, number, number];
};
type SDFFontContextProps = {
  __debug: {
    atlas: Atlas;
  };

  getRadius: () => number;
  getScale: (size: number) => number;
  getGlyph: (font: number, id: number, size: number) => CachedGlyph;
  getTexture: () => any;
};

const FONTS = [
  {
    family: 'Lato',
    weight: 900,
    style: 'normal',
    src: '/Lato-Regular.ttf',
  },
];

export async function render(
  deviceContribution: DeviceContribution,
  $canvas: HTMLCanvasElement,
  useRAF = true,
) {
  const rustText = RustText();

  const fonts: Font[] = await Promise.all(
    FONTS.map(async ({ family, style, weight, src }) => {
      const buffer = await (await fetch(src)).arrayBuffer();
      return {
        props: { family, style, weight },
        buffer,
      };
    }),
  );
  rustText.setFonts(fonts);

  const family = 'Lato';
  const weight = 900;
  const style = 'normal';
  const content = 'test';
  const size = 48;
  const lineHeight = undefined;
  const align = 'center';
  const wrap = 0;
  const snap = undefined;
  const NO_LAYOUT: Rectangle = [0, 0, 0, 0];

  const useFontFamily = memoizeOne(
    (family?: string, weight?: number, style?: string) => {
      const families =
        family != null
          ? family.split(/\s*,\s*/g).filter((s) => s !== '')
          : [undefined];
      return rustText.resolveFontStack(
        families.map((family) => ({ family, weight, style })),
      );
    },
  );

  const useFontText = memoizeOne(
    (stack: number[], strings: string[] | string, size: number) => {
      const packed = packStrings(strings);

      const {
        breaks,
        metrics: m,
        glyphs: g,
        missing: i,
      } = rustText.measureSpans(stack, packed, size);
      const spans = makeTuples(m, 3);
      const glyphs = makeTuples(g, 4);
      const missing = makeTuples(i, 2);

      missing.iterate((index: number, glyph: number) =>
        rustText.loadMissingGlyph(stack[index], glyph, () => {}),
      );

      return { spans, glyphs, breaks };
    },
  );

  const useFontHeight = memoizeOne(
    (stack: number[], size: number, lineHeight?: number) => {
      const [fontId] = stack;
      let {
        ascent,
        descent,
        lineHeight: fontHeight,
        xHeight,
        emUnit,
      } = rustText.measureFont(fontId, size);
      const lh = lineHeight ?? fontHeight;
      const xh = (xHeight * lh) / fontHeight;
      const pad = (lh - fontHeight) / 2;
      ascent += pad;
      descent -= pad;
      return { ascent, descent, lineHeight: lh, xHeight: xh, emUnit };
    },
  );

  const roundUp2 = (v: number) => {
    v--;
    v |= v >> 1;
    v |= v >> 2;
    v |= v >> 4;
    v |= v >> 8;
    v |= v >> 16;
    v++;
    return v;
  };

  const getNearestScale = (size: number) => roundUp2(Math.max(24, size)) * 1.5;
  const hashGlyph = (font: number, id: number, size: number) =>
    scrambleBits53(mixBits53(mixBits53(font, id), size * 100));

  const useSDFFontContext = (
    width = 256,
    height = 256,
    radius = 16,
    pad = 0,
  ): SDFFontContextProps => {
    pad += Math.ceil(radius * 0.75);
    // subpixel, solidify, preprocess, postprocess

    // const format = 'rgba8unorm' as GPUTextureFormat;

    const glyphs = new Map<number, CachedGlyph>();
    const atlas = makeAtlas(width, height);

    const bounds = makeBoundsTracker();

    const getRadius = () => radius;
    const getScale = (size: number) => size / getNearestScale(size);
    const getTexture = () => biasedSource;
    const getGlyph = (font: number, id: number, size: number): CachedGlyph => {
      const scale = getNearestScale(size);
      const key = hashGlyph(font, id, scale);

      const cache = glyphs.get(key);
      if (cache) return cache;

      // Measure glyph and get image
      const glyph = rustText.measureGlyph(font, id, scale);
      return mapGlyph(key, glyph);
    };

    const mapGlyph = (key: number, glyph: GlyphMetrics) => {
      let mapping: Rectangle = NO_MAPPING;

      const { image, width: w, height: h, outlineBounds: ob, rgba } = glyph;
      if (image && w && h && ob) {
        // Convert to SDF
        const { data, width, height } = (rgba ? rgbaToSDF : glyphToSDF)(
          image,
          w,
          h,
          pad,
          radius,
          undefined,
          subpixel,
          solidify,
          preprocess,
          postprocess,
        );
        glyph.outlineBounds = padRectangle(ob, pad);
        glyph.image = data;

        try {
          mapping = atlas.place(key, width, height);
          bounds.push(mapping);
        } catch (e) {
          mapping = [0, 0, 0, 0];
          console.warn('atlas place failed', key, width, height, e);
          /*
          debugger;
          throw new Error('atlas place failed', key, width, height);
          */
        }

        // If atlas resized, resize the texture backing it
        const [sw, sh] = source.size;
        if (atlas.width !== sw || atlas.height !== sh) {
          const newSource = resizeTextureSource(
            device,
            source,
            atlas.width,
            atlas.height,
            1,
            'auto',
          );
          biasable.texture = source.texture = newSource.texture;
          biasable.view = source.view = newSource.view;
          biasable.size = source.size = newSource.size;

          updateMipTextureChain(device, source, [[0, 0, sw, sh]]);
        }

        uploadAtlasMapping(device, source.texture, format, data, mapping);
      }

      const entry = { glyph, mapping };
      glyphs.set(key, entry);
      source.version = incrementVersion(source.version);

      return entry;
    };

    return {
      __debug: {
        atlas,
        source,
      },

      getRadius,
      getScale,
      getGlyph,
      getTexture,
    };
  };

  const emitGlyphSpans = (
    context: SDFFontContextProps,
    layout: Rectangle,
    currentIndex: number,

    font: number[],
    spans: Tuples<3>,
    glyphs: Tuples<4>,
    breaks: Uint32Array,

    start: number,
    end: number,

    size: number,
    gap: number,
    lead: number,
    snap: boolean,

    emit: (
      l1: number,
      t1: number,
      r1: number,
      b1: number,

      l2: number,
      t2: number,
      r2: number,
      b2: number,

      i: number,
    ) => void,
  ) => {
    const { getGlyph, getScale } = context;
    const [left, top] = layout;

    const scale = getScale(size);

    let x = left + lead;
    const y = top;
    let sx = snap ? Math.round(x) : x;

    spans.iterate(
      (_a, trim, hard, index) => {
        glyphs.iterate(
          (
            fontIndex: number,
            id: number,
            isWhiteSpace: number,
            kerning: number,
          ) => {
            const { glyph, mapping } = getGlyph(font[fontIndex], id, size);
            const {
              image,
              layoutBounds,
              outlineBounds,
              rgba,
              scale: glyphScale,
            } = glyph;
            const [, , lr] = layoutBounds;

            const r = rgba ? -1 : 1;
            const s = scale * glyphScale;
            const k = (kerning / 65536.0) * scale;
            x += k;
            sx += k;

            if (!isWhiteSpace) {
              if (image && outlineBounds) {
                const [gl, gt, gr, gb] = outlineBounds;

                const cx = snap ? Math.round(sx) : sx;
                const cy = snap ? Math.round(y) : y;

                emit(
                  s * gl + cx,
                  s * gt + cy,
                  s * gr + cx,
                  s * gb + cy,

                  r * mapping[0],
                  r * mapping[1],
                  r * mapping[2],
                  r * mapping[3],

                  currentIndex,
                );
              }
            }

            sx += lr * scale;
            x += lr * scale;
          },
          breaks[index - 1] || 0,
          breaks[index],
        );

        if (hard === 2) {
          currentIndex++;
        }

        if (trim) {
          x += gap;
          sx = snap ? Math.round(x) : x;
        }
      },
      start,
      end,
    );
  };

  const makeBoundsTracker = () => {
    const rects: Rectangle[] = [];

    const joinRectangles = (a: Rectangle, b: Rectangle): Rectangle => {
      const [al, at, ar, ab] = a;
      const [bl, bt, br, bb] = b;
      return [
        Math.min(al, bl),
        Math.min(at, bt),
        Math.max(ar, br),
        Math.max(ab, bb),
      ] as Rectangle;
    };

    const getArea = ([l, t, r, b]: Rectangle) =>
      Math.abs(r - l) * Math.abs(b - t);

    const push = (rect: Rectangle) => {
      const area = getArea(rect);
      const n = rects.length;

      let max = 0.5;
      let merge = -1;
      let join = null as Rectangle | null;
      for (let i = 0; i < n; ++i) {
        const slot = rects[i];
        const joined = joinRectangles(rect, slot);
        const fit = (area + getArea(slot)) / getArea(joined);
        if (fit > max) {
          max = fit;
          merge = i;
          join = joined;
        }
      }
      if (join) rects.splice(merge, 1, join);
      else rects.push(rect);
    };

    const flush = () => {
      const rs = rects.slice();
      rects.length = 0;
      return rs;
    };

    return { push, flush };
  };

  const useSDFGlyphData = (
    layout: Rectangle,
    font: number[],
    spans: Tuples<3>,
    glyphs: Tuples<4>,
    breaks: Uint32Array,
    height: FontMetrics,
    align: Alignment,
    size: number = 48,
    wrap: number = 0,
    snap: boolean = false,
  ) => {
    const context = useSDFFontContext();

    // Final buffers
    const n = glyphs.length;
    const rectangles = new Float32Array(n * 4);
    const uvs = new Float32Array(n * 4);
    const indices = new Uint32Array(n);

    // Custom emitter
    let i = 0;
    let i4 = 0;
    const emit = (
      l1: number,
      t1: number,
      r1: number,
      b1: number,

      l2: number,
      t2: number,
      r2: number,
      b2: number,

      index: number,
    ) => {
      rectangles[i4] = l1;
      rectangles[i4 + 1] = t1;
      rectangles[i4 + 2] = r1;
      rectangles[i4 + 3] = b1;

      uvs[i4] = l2;
      uvs[i4 + 1] = t2;
      uvs[i4 + 2] = r2;
      uvs[i4 + 3] = b2;

      indices[i] = index;

      i4 += 4;
      i++;
    };

    // Push all text spans into layout
    const { ascent, lineHeight } = height;
    const cursor = makeInlineCursor(wrap, align);
    spans.iterate((advance, trim, hard) =>
      cursor.push(advance, trim, hard, lineHeight, 0, 0, 0),
    );

    // Gather lines produced
    const [left, top] = layout;
    const currentLayout: Rectangle = [left, top + ascent, 0, 0];
    let lastIndex = -1;

    const layouts = cursor.gather(
      (start, end, gap, lead, count, _c, _a, _d, _x, index) => {
        if (index !== lastIndex) {
          currentLayout[1] = top + ascent;
          lastIndex = index;
        }

        emitGlyphSpans(
          context,
          currentLayout,
          index,
          font,
          spans,
          glyphs,
          breaks,
          start,
          end,
          size,
          gap,
          lead,
          snap,
          emit,
        );
        currentLayout[1] += lineHeight;
      },
    );

    const radius = context.getRadius();
    const scale = context.getScale(size);

    return {
      id,
      indices,
      layouts,
      rectangles,
      uvs,
      sdf: [radius, scale, size, 0] as [number, number, number, number],
    };
  };

  const font = useFontFamily(family, weight, style);
  const { spans, glyphs, breaks } = useFontText(font, content, size);
  const height = useFontHeight(font, size, lineHeight);
  const data = useSDFGlyphData(
    NO_LAYOUT,
    font,
    spans,
    glyphs,
    breaks,
    height,
    align,
    size,
    wrap,
    snap,
  );

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
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

render.params = {
  targets: ['webgl1', 'webgl2', 'webgpu'],
  default: 'webgl2',
};
