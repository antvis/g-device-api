// Keys. Don't make more than 2^53 of these.
let KEY = 0;
const KEYS = new WeakMap<object, number>();

/** Get new unique key */
export const makeKey = (): number => ++KEY;

/** Get unique key for object */
export const getObjectKey = (v: any) => {
  if (v && typeof v === 'object') {
    const c = KEYS.get(v);
    if (c != null) return c;

    const k = makeKey();
    KEYS.set(v, k);
    return k;
  }
  return 0;
}

/** Set global hashing key. Default `0xf1c3a587` */
export const setGlobalHashKey = (k?: number) => HASH_KEY = (k ?? DEFAULT_HASH_KEY);
const DEFAULT_HASH_KEY = 0xf1c3a587;
let HASH_KEY = DEFAULT_HASH_KEY;

const C1 = 0xcc9e2d51;
const C2 = 0x1b873593;
const C3 = 0xe6546b64;
const C4 = 0x85ebca6b;
const C5 = 0xc2b2ae35;

const add = (a: number, b: number) => ((a|0) + (b|0)) >>> 0;
const rot = (a: number, b: number) => ((a << b) | (a >>> (32 - b))) >>> 0;
const mul = Math.imul;

/** Pack 2 uint32's into one uint53 / float64. B is truncated. */
export const toUint53 = (a: number, b: number) => {
  return a + ((b & 0x1fffff) * 0x100000000);
}

/** Format murmur53 value as a base64 string. */
export const formatMurmur53 = (uint: number) => {
  return uint.toString(36).slice(-10);
}

/** Hash value and return a base64 string. */
export const toHash = <T>(t: T) => formatMurmur53(toMurmur53(t));

/** Hash value and return a uint53. */
export const toMurmur53 = (s: any) => {
  if (typeof s === 'string') return getStringHash(s);
  if (typeof s === 'number') return getNumberHash(s);
  if (typeof s === 'boolean') return getBooleanHash(s);
  if (s === undefined) return scrambleBits53(mixBits53(HASH_KEY, 1));
  if (s === null) return scrambleBits53(mixBits53(HASH_KEY, 2));
  if (Array.isArray(s)) return getArrayHash(s);
  if (isTypedArray(s)) return getTypedArrayHash(s);
  if (s) return getObjectHash(s);

  return scrambleBits53(mixBits53(HASH_KEY, -1));
}

const getStringHash  = (s: string) => stringToMurmur53(s, HASH_KEY + 15);

const f64 = new Float64Array(1);
const uint32 = new Uint32Array(f64.buffer);
const getNumberHash = (n: number) => scrambleBits53(getNumberHashInner(n));
const getNumberHashInner = (n: number) => {
  f64[0] = n;
  let k = HASH_KEY + 63;
  k = mixBits53(k, uint32[0]);
  k = mixBits53(k, uint32[1]);
  return k;
}

const getBooleanHash = (b: boolean) => scrambleBits53(mixBits53(HASH_KEY + 255, +b));

const getArrayHash = (t: any[]) => {
  let h = mixBits53(HASH_KEY + 1023, 0);
  for (const v of t) {
    h = mixBits53(h, toMurmur53(v));
  }
  return scrambleBits53(h, t.length);
}

const getObjectHash = (t: Record<string, any>) => {
  let i = 0;
  let h = mixBits53(HASH_KEY + 4095, 0);
  for (const k in t) {
    h = mixBits53(h, toMurmur53(k));
    h = mixBits53(h, toMurmur53(t[k]));
    ++i;
  }
  return scrambleBits53(h, i);
}

export type TypedArray =
  Int8Array |
  Uint8Array |
  Int16Array |
  Uint16Array |
  Int32Array |
  Uint32Array |
  Uint8ClampedArray |
  Float32Array |
  Float64Array;

const isTypedArray = (() => {
  const TypedArray = Object.getPrototypeOf(Uint8Array);
  return (obj: any) => obj instanceof TypedArray;
})();

const getTypedArrayHash = (t: TypedArray) => {
  let h = mixBits53(HASH_KEY + 16383, 0);

  if (
    t instanceof Int8Array ||
    t instanceof Uint8Array ||
    t instanceof Int16Array ||
    t instanceof Uint16Array ||
    t instanceof Int32Array ||
    t instanceof Uint32Array ||
    t instanceof Uint8ClampedArray
  ) {
    h = integerArrayToMurmur53(t, h);
  }
  else {
    const n = t.length;
    for (let i = 0; i < n; ++i) h = mixBits53(h, getNumberHashInner(t[i]));
  }

  return scrambleBits53(h);
}

const integerArrayToMurmur53 = (list: number[] | TypedArray, seed: number = 0) => {
  const n = list.length;

  let a = seed;
  let b = seed ^ C4;

  for (let i = 0; i < n; ++i) {
    const d = list[i];
    let d1 = add(rot(d, 16), b);
    let d2 = add(d, a);

    d1 = mul(d1, C1);
    d1 = rot(d1, 15);
    d1 = mul(d1, C2);

    a ^= d1;
    a = rot(a, 13);
    a = add(mul(a, 5), C3);

    d2 = mul(d2, C1);
    d2 = rot(d2, 15);
    d2 = mul(d2, C2);

    b ^= d2;
    b = rot(b, 13);
    b = add(mul(b, 5), C3);
  }

  a ^= n;
  b ^= n;

  a ^= a >>> 16;
  a = mul(a, C4);
  a ^= a >>> 13;
  a = mul(a, C5);
  a ^= a >>> 16;

  b ^= b >>> 16;
  b = mul(b, C4);
  b ^= b >>> 13;
  b = mul(b, C5);
  b ^= b >>> 16;

  return toUint53(a, b);
}

const stringToMurmur53 = (s: string, seed: number = 0) => {
  const n = s.length;
  let a = seed;
  let b = seed ^ C4;

  for (let i = 0; i < n; ++i) {
    const d = s.charCodeAt(i);
    let d1 = add(rot(d, 16), b);
    let d2 = add(d, a);

    d1 = mul(d1, C1);
    d1 = rot(d1, 15);
    d1 = mul(d1, C2);

    a ^= d1;
    a = rot(a, 13);
    a = add(mul(a, 5), C3);

    d2 = mul(d2, C1);
    d2 = rot(d2, 15);
    d2 = mul(d2, C2);

    b ^= d2;
    b = rot(b, 13);
    b = add(mul(b, 5), C3);
  }

  a ^= n;
  b ^= n;

  a ^= a >>> 16;
  a = mul(a, C4);
  a ^= a >>> 13;
  a = mul(a, C5);
  a ^= a >>> 16;

  b ^= b >>> 16;
  b = mul(b, C4);
  b ^= b >>> 13;
  b = mul(b, C5);
  b ^= b >>> 16;

  return toUint53(a, b);
}

/** Hash an integer directly */
export const hashBits53 = (x: number) => scrambleBits53(mixBits53(HASH_KEY + 65535, x));

/** Murmur3 32-bit hash mixing function */
export const mixBits = (x: number, d: number) => {
  d = mul(d, C1);
  d = rot(d, 15);
  d = mul(d, C2);

  x ^= d;
  x = rot(x, 13);
  x = add(mul(x, 5), C3);

  return x;
};

/** Murmur3 32-bit hash whitening function */
export const scrambleBits = (x: number, n: number = 0) => {
  x ^= n;

  x ^= x >>> 16;
  x = mul(x, C4);
  x ^= x >>> 13;
  x = mul(x, C5);
  x ^= x >>> 16;

  return x;
};

/** Custom Murmur53 53-bit hash mixing function */
export const mixBits53 = (x: number, d: number) => {
  let a = x >>> 0;
  let b = Math.floor(x / 0x100000000);

  let d1 = add(rot(d, 16), add(a, b));
  let d2 = add(d, a);

  d1 = mul(d1, C1);
  d1 = rot(d1, 15);
  d1 = mul(d1, C2);

  a ^= d1;
  a = rot(a, 13);
  a = add(mul(a, 5), C3);

  d2 = mul(d2, C1);
  d2 = rot(d2, 15);
  d2 = mul(d2, C2);

  b ^= d2;
  b = rot(b, 13);
  b = add(mul(b, 5), C3);

  return toUint53(a, b);
};

/** Custom Murmur53 53-bit hash whitening function */
export const scrambleBits53 = (x: number, n: number = 0) => {
  let a = x >>> 0;
  let b = Math.floor(x / 0x100000000);

  a ^= n;
  b ^= n;

  a ^= a >>> 16;
  a = mul(a, C4);
  a ^= a >>> 13;
  a = mul(a, C5);
  a ^= a >>> 16;

  b ^= b >>> 16;
  b = mul(b, C4);
  b ^= b >>> 13;
  b = mul(b, C5);
  b ^= b >>> 16;

  return toUint53(a, b);
};

