import uniq from 'lodash/uniq';
import {
  AddressMode,
  Device,
  FilterMode,
  Format,
  MipmapFilterMode,
  Sampler,
  Texture,
  TextureUsage,
} from '../../src';
import { TypedArray } from './tuple';

export const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;
export const clamp = (x: number, a: number, b: number) =>
  Math.max(a, Math.min(b, x));

export type Atlas = {
  place: (key: number, w: number, h: number) => Rectangle;
  snug: () => { width: number; height: number };
  map: Map<number, Rectangle>;
  width: number;
  height: number;
  version: number;
};
type Rectangle = [number, number, number, number];
type XY = [number, number];

export type VectorLike = TypedArray | number[];
export type ColorSpace =
  | 'linear'
  | 'srgb'
  | 'p3'
  | 'native'
  | 'picking'
  | 'auto';

type Slot = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
type Bin = Set<Slot>;
type Bins = Map<number, Set<Slot>>;

const EMPTY: any[] = [];

export type TextureSource = {
  texture: Texture;
  sampler: Sampler;
  layout: string;
  format: Format;
  size: VectorLike;
  version: number;
  mips?: number;
  variant?: string;
  absolute?: boolean;
  comparison?: boolean;
  volatile?: number;
  colorSpace?: ColorSpace;
  // aspect?: GPUTextureAspect,
};

export const makeAtlasSource = (
  device: Device,
  atlas: Atlas,
  format: Format,
  volatile?: number,
): TextureSource => {
  const { width, height } = atlas;
  const mips = Math.floor(Math.log2(Math.min(width, height))) + 1;
  const texture = device.createTexture({
    format,
    width,
    height,
    // depthOrArrayLayers: 1,
    usage: TextureUsage.RENDER_TARGET,
  });

  console.log(texture);
  const sampler = device.createSampler({
    addressModeU: AddressMode.CLAMP_TO_EDGE,
    addressModeV: AddressMode.CLAMP_TO_EDGE,
    minFilter: FilterMode.BILINEAR,
    magFilter: FilterMode.BILINEAR,
    mipmapFilter: MipmapFilterMode.LINEAR,
    maxAnisotropy: 16,
  });

  return {
    texture,
    sampler,
    layout: 'texture_2d<f32>',
    mips,
    absolute: true,
    volatile,
    format,
    colorSpace: 'srgb',
    size: [atlas.width, atlas.height],
    version: 1,
  };
};

/**
 * Tight 2D packing texture atlas.
 *
 * For optimal performance, feed items that are sorted large to small, e.g. by area.
 * Will still produce high quality packing otherwise, but performance will degrade significantly.
 */
export const makeAtlas = (
  width: number,
  height: number,
  maxWidth: number = 4096,
  maxHeight: number = 4096,
  snap: number = 1,
) => {
  const ls: Bins = new Map();
  const rs: Bins = new Map();
  const ts: Bins = new Map();
  const bs: Bins = new Map();
  const slots: Bin = new Set();

  // Place 1 rectangle
  const place = (key: number, w: number, h: number): Rectangle => {
    if (!w || !h)
      throw new Error(`cannot map empty rectangle ${w}x${h} for '${key}'`);

    if (map.get(key)) throw new Error(`key mapped already: ${key}`);
    self.version = self.version + 1;

    // Snap to minimum modulus
    const cw = Math.ceil(w / snap) * snap;
    const ch = Math.ceil(h / snap) * snap;

    // If no next slot, expand and retry
    const slot = getNextAvailable(cw, ch);
    if (!slot) {
      expand();
      return place(key, w, h);
    }

    const [x, y] = slot;
    const rect = [x, y, x + w, y + h] as Rectangle;

    // Clip out occupied area from slots
    if (snap > 1) {
      const clip = [x, y, x + cw, y + ch] as Rectangle;
      clipRectangle(clip);
    } else clipRectangle(rect);

    map.set(key, rect);
    return rect;
  };

  // Expand atlas by doubling width or height
  const expand = () => {
    // First height, then width
    const w = width < height && width < maxWidth ? width * 2 : width;
    const h =
      (width >= height || w == width) && height < maxHeight
        ? height * 2
        : height;

    if (w == width && h == height) {
      throw new Error(
        `Atlas is full and can't expand any more (${maxWidth}x${maxHeight})`,
      );
    }

    // Make slot(s) for newly added area
    const slot = [0, 0, w, h, w, h, w, h, 1] as Slot;
    const splits = subtractSlot(slot, [0, 0, width, height] as Rectangle);
    for (const s of splits) addSlot(s);

    // Extend existing slots that touch the old border
    const r = rs.get(width);
    const b = bs.get(height);
    const expandX = r ? Array.from(r.values()) : EMPTY;
    const expandY = b ? Array.from(b.values()) : EMPTY;
    const expand = uniq([...expandX, ...expandY]);

    for (const s of expand) removeSlot(s);
    for (const s of expand) {
      // eslint-disable-next-line prefer-const
      let [l, t, r, b, nearX, nearY, farX, farY, corner] = s;
      if (r === width) r = w;
      if (b === height) b = h;
      addSlot([l, t, r, b, nearX, nearY, farX, farY, corner]);
    }

    self.width = width = w;
    self.height = height = h;
  };

  const snug = () => {
    const { width, height } = self;
    let w = 0;
    let h = 0;

    for (const k of map.keys()) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const [, , r, b] = map.get(k)!;
      w = Math.max(r, w);
      h = Math.max(b, h);
    }
    self.width = w;
    self.height = h;

    if (w !== width || h !== height) {
      const remove: Slot[] = [];
      const add: Slot[] = [];
      for (const s of slots.values()) {
        const [l, t, r, b, nearX, nearY, farX, farY, corner] = s;
        if (l >= w || t >= h) {
          remove.push(s);
        } else if (r > w || b > h) {
          const rr = Math.min(r, w);
          const bb = Math.min(b, h);
          remove.push(s);
          add.push([
            l,
            t,
            rr,
            bb,
            Math.min(nearX, rr - l),
            Math.min(nearY, bb - t),
            Math.min(farX, rr - l),
            Math.min(farY, bb - t),
            corner,
          ]);
        }
      }
      for (const s of remove) removeSlot(s);
      for (const s of add) addSlot(s);
    }

    return { width: w, height: h };
  };

  // Lazily allocate bin for a particular coordinate
  const getBin = (xs: Bins, x: number) => {
    let vs = xs.get(x);
    if (!vs) xs.set(x, (vs = new Set<Slot>()));
    return vs;
  };

  // Add a new slot to the available space
  const addSlot = (slot: Slot) => {
    const [l, t, r, b] = slot;

    // Check if it is made redundant by another slot
    // Check if it makes another slot redundant
    {
      const lsb = ls.get(l);
      const rsb = rs.get(r);
      const tsb = ts.get(t);
      const bsb = bs.get(b);

      const remove: Slot[] = [];
      if (lsb)
        for (const s of lsb) {
          if (containsRectangle(s, slot)) return;
          if (containsRectangle(slot, s)) remove.push(s);
        }
      if (rsb)
        for (const s of rsb) {
          if (containsRectangle(s, slot)) return;
          if (containsRectangle(slot, s)) remove.push(s);
        }
      if (tsb)
        for (const s of tsb) {
          if (containsRectangle(s, slot)) return;
          if (containsRectangle(slot, s)) remove.push(s);
        }
      if (bsb)
        for (const s of bsb) {
          if (containsRectangle(s, slot)) return;
          if (containsRectangle(slot, s)) remove.push(s);
        }

      for (const s of remove) removeSlot(s);
    }

    {
      const lsb = getBin(ls, l);
      const rsb = getBin(rs, r);
      const tsb = getBin(ts, t);
      const bsb = getBin(bs, b);

      slots.add(slot);
      lsb.add(slot);
      rsb.add(slot);
      tsb.add(slot);
      bsb.add(slot);
    }
  };

  const removeSlot = (slot: Slot) => {
    const [l, t, r, b] = slot;

    const lsb = getBin(ls, l);
    const rsb = getBin(rs, r);
    const tsb = getBin(ts, t);
    const bsb = getBin(bs, b);

    slots.delete(slot);
    lsb.delete(slot);
    rsb.delete(slot);
    tsb.delete(slot);
    bsb.delete(slot);

    if (lsb.size === 0) ls.delete(l);
    if (rsb.size === 0) rs.delete(r);
    if (tsb.size === 0) ts.delete(t);
    if (bsb.size === 0) bs.delete(b);
  };

  const map = new Map<number, Rectangle>();

  const slotFit = (x: number, near: number, far: number, full: number) => {
    // Must not exceed near, unless already close to full
    const f1 = x <= near ? x / near : x / full;

    // Must not exceed far, with penalty for overhang, unless far is close to full
    const f2 = lerp(
      x <= far ? x / far : 0.5 + (x - far) / (full - far) / 2,
      1.0,
      far / full,
    );

    return f1 * f2;
  };

  // Get highest scoring slot of at least given size
  const getNextAvailable = (w: number, h: number) => {
    let slot: Slot | null = null;
    let max = 0;

    for (const s of slots.values()) {
      const [l, t, r, b] = s;

      const x = l;
      const y = t;
      const cw = r - l;
      const ch = b - t;

      if (w <= cw && h <= ch) {
        const [, , , , nearX, nearY, farX, farY, corner] = s;

        const fx = slotFit(w, nearX, farX, cw);
        const fy = slotFit(h, nearY, farY, ch);

        const f =
          1.0 -
          (Math.min(x / width, y / height) + ((x / width) * y) / height) * 0.25;

        const b = corner + 1;
        const d = b * f * fx * fy;

        if (d > max) {
          slot = s;
          max = d;
        }
      }
    }

    return slot;
  };

  const stats = {
    slots: 0,
    checks: 0,
    clips: 0,
  };

  // Clip the given rectangle from all available slots
  const clipRectangle = (other: Rectangle) => {
    const add = [] as Slot[];
    const remove = [] as Slot[];

    for (const slot of slots.values()) {
      stats.checks++;
      if (intersectRectangle(slot, other)) {
        const splits = subtractSlot(slot, other);
        add.push(...splits);
        remove.push(slot);

        stats.slots += splits.length;
        stats.clips++;
      }
    }

    for (const s of remove) removeSlot(s);
    for (const s of add) addSlot(s);
  };

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const debugPlacements = () => Array.from(map.keys()).map((k) => map.get(k)!);
  const debugSlots = () => Array.from(slots.values()).map((s) => s);

  const debugValidate = () => {
    const rects = debugPlacements();
    const n = rects.length;

    const out: any[] = [];

    const box: Rectangle = [Infinity, Infinity, -Infinity, -Infinity];

    for (let i = 0; i < n; ++i) {
      const a = rects[i];
      const [l, t, r, b] = a;

      box[0] = Math.min(box[0], l);
      box[1] = Math.min(box[1], t);
      box[2] = Math.max(box[2], r);
      box[3] = Math.max(box[3], b);

      for (let j = i + 1; j < n; ++j) {
        const b = rects[j];

        if (!(a[0] >= b[2] || b[0] >= a[2] || a[1] >= b[3] || b[1] >= a[3])) {
          console.warn(`Overlap detected ${a.join(',')} => ${b.join(',')}`);
          const pl = Math.max(a[0], b[0]);
          const pt = Math.max(a[1], b[1]);
          const pr = Math.min(a[2], b[2]);
          const pb = Math.min(a[3], b[3]);
          const dx = pr - pl;
          const dy = pb - pt;
          out.push({ x: pl, y: pt, dx, dy });
        }
      }
    }

    return out;
  };

  const slot = [0, 0, width, height, width, height, width, height, 1] as Slot;
  addSlot(slot);

  const self = {
    place,
    map,
    expand,
    snug,
    width,
    height,
    version: 0,
    debugPlacements,
    debugSlots,
    debugValidate,
  } as Atlas;

  return self;
};

const intersectRange = (
  minA: number,
  maxA: number,
  minB: number,
  maxB: number,
) => !(minA >= maxB || minB >= maxA);
const containsRange = (
  minA: number,
  maxA: number,
  minB: number,
  maxB: number,
) => minA <= minB && maxA >= maxB;

type RectLike = Rectangle | Slot;

const containsRectangle = (a: RectLike, b: RectLike): boolean => {
  const [al, at, ar, ab] = a;
  const [bl, bt, br, bb] = b;

  return containsRange(al, ar, bl, br) && containsRange(at, ab, bt, bb);
};

const intersectRectangle = (a: RectLike, b: RectLike): boolean => {
  const [al, at, ar, ab] = a;
  const [bl, bt, br, bb] = b;

  return intersectRange(al, ar, bl, br) && intersectRange(at, ab, bt, bb);
};

const subtractSlot = (a: Slot, b: RectLike): Slot[] => {
  const [al, at, ar, ab, nearX, nearY, farX, farY] = a;
  const [bl, bt, br, bb] = b;

  const out: Slot[] = [];

  const push = (
    l: number,
    t: number,
    r: number,
    b: number,
    nx: number,
    ny: number,
    fx: number,
    fy: number,
    corner: number,
  ) => {
    const w = r - l;
    const h = b - t;

    nx = clamp(nx, 0, w) || w;
    ny = clamp(ny, 0, h) || h;
    fx = clamp(fx, 0, w) || w;
    fy = clamp(fy, 0, h) || h;

    out.push([
      l,
      t,
      r,
      b,
      clamp(nx, 0, w),
      clamp(ny, 0, h),
      clamp(fx, 0, w),
      clamp(fy, 0, h),
      corner,
    ]);
  };

  if (al < bl) {
    const nx = at < bt ? nearX : Math.min(nearX, bl - al);
    const fx = ab > bb ? farX : Math.min(farX, bl - al);
    const ny = nearY;
    const fy = at < bt ? 0 : at - bt;

    push(al, at, bl, ab, nx, ny, fx, fy, 1);
  }
  if (at < bt) {
    const ny = al < bl ? nearY : Math.min(nearY, bt - at);
    const fy = ar > br ? farY : Math.min(farY, bt - at);
    const nx = nearX;
    const fx = al < bl ? 0 : al - br;
    push(al, at, ar, bt, nx, ny, fx, fy, 1);
  }
  if (ar > br) {
    const nx = nearX - (br - al);
    const fx = farX - (br - al);
    const ny = at < bt ? ab - at : bb - at;
    const fy = farY;
    push(br, at, ar, ab, nx, ny, fx, fy, +(at >= bt || at === 0));
  }
  if (ab > bb) {
    const ny = nearY - (bb - at);
    const fy = farY - (bb - at);
    const nx = al < br ? ar - al : br - al;
    const fx = farX;
    push(al, bb, ar, ab, nx, ny, fx, fy, +(al >= bl || al === 0));
  }

  return out;
};

export const uploadAtlasMapping = (
  texture: Texture,
  data: Uint8Array,
  rect: Rectangle,
): void => {
  const [l, t, r, b] = rect;

  const offset = [l, t] as XY;
  const size = [r - l, b - t] as XY;

  texture.setImageData([data], 0, offset, size);
};

// export const resizeTextureSource = (
//   device: Device,
//   source: TextureSource,
//   width: number,
//   height: number,
//   depth: number = 1,
//   mips: "auto" | number = 1,
//   mipLevel = 0,
//   aspect = "all",
//   dimension = "2d"
// ) => {
//   const { format } = source;

//   const ms =
//     mips === "auto" ? Math.floor(Math.log2(Math.min(width, height))) + 1 : mips;
//   const newTexture = makeDynamicTexture(
//     device,
//     width,
//     height,
//     depth,
//     format as any,
//     1,
//     ms,
//     dimension
//   );

//   const src = {
//     texture: source.texture,
//     origin: [0, 0, 0],
//     mipLevel,
//     aspect,
//   };
//   const dst = {
//     texture: newTexture,
//     origin: [0, 0, 0],
//     mipLevel,
//     aspect,
//   };

//   device.copySubTexture2D();

//   const [w, h, d] = source.size;
//   const commandEncoder = device.createCommandEncoder();
//   commandEncoder.copyTextureToTexture(src, dst, [w, h, d || 1]);
//   device.queue.submit([commandEncoder.finish()]);

//   return {
//     ...source,
//     texture: newTexture,
//     view: newTexture.createView({ mipLevelCount: ms }),
//     size: [width, height, depth] as [number, number, number],
//     version: 1,
//   };
// };
