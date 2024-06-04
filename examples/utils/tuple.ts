export type TypedArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Uint8ClampedArray
  | Float32Array
  | Float64Array;

export type Tuples<N extends number, T = number> = {
  array: T[];
  dims: N;
  length: number;
  get: (i: number, j: number) => T;
  iterate: (f: (...args: T[]) => void, start?: number, end?: number) => void;
};

export const makeTuples = <N extends number, T = number>(
  array: TypedArray | T[],
  dims: N,
): Tuples<N, T> => {
  const n = array.length / dims;
  const t: T[] = [];

  const aa: T[] = array as any;

  const get = (i: number, j: number) => aa[i * dims + j];

  const length = n;

  const iterate = (
    f: (...args: any[]) => void,
    start: number = 0,
    end: number = n,
  ) => {
    if (n === 0) return;

    while (start < 0) start += n;
    while (end < 0) end += n;

    const s = start * dims;
    const e = end * dims;

    if (dims === 1) {
      for (let i = s; i < e; ++i) {
        f(aa[i], i);
      }
      return;
    }
    if (dims === 2) {
      for (let i = s; i < e; i += 2) {
        f(aa[i], aa[i + 1], i >> 1);
      }
      return;
    }
    if (dims === 3) {
      for (let i = s, j = start; i < e; i += 3) {
        f(aa[i], aa[i + 1], aa[i + 2], j++);
      }
      return;
    }
    if (dims === 4) {
      for (let i = s; i < e; i += 4) {
        f(aa[i], aa[i + 1], aa[i + 2], aa[i + 3], i >> 2);
      }
      return;
    }

    for (let i = s, j = start; i < e; i += dims) {
      t.length = 0;
      for (let k = 0; k < dims; ++k) t.push(aa[i + k]);
      t.push(j++ as any);
      f(...t);
    }
  };

  return { array: aa, get, iterate, dims, length };
};
