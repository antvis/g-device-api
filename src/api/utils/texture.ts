import { GL } from '../constants';
import {
  ExternalImage,
  TextureArrayData,
  TextureCubeArrayData,
  TextureCubeData,
  TextureData,
  TextureDimension,
} from '../interfaces';
import { TypedArray } from '../utils';

export function isExternalImage(data: unknown): data is ExternalImage {
  return (
    (typeof ImageData !== 'undefined' && data instanceof ImageData) ||
    (typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap) ||
    (typeof HTMLImageElement !== 'undefined' &&
      data instanceof HTMLImageElement) ||
    (typeof HTMLCanvasElement !== 'undefined' &&
      data instanceof HTMLCanvasElement) ||
    (typeof HTMLVideoElement !== 'undefined' &&
      data instanceof HTMLVideoElement)
  );
}

function getExternalImageSize(
  data: ExternalImage,
): { width: number; height: number } | null {
  if (
    (typeof ImageData !== 'undefined' && data instanceof ImageData) ||
    (typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap) ||
    (typeof HTMLCanvasElement !== 'undefined' &&
      data instanceof HTMLCanvasElement)
  ) {
    return { width: data.width, height: data.height };
  }
  if (
    typeof HTMLImageElement !== 'undefined' &&
    data instanceof HTMLImageElement
  ) {
    return { width: data.naturalWidth, height: data.naturalHeight };
  }
  if (
    typeof HTMLVideoElement !== 'undefined' &&
    data instanceof HTMLVideoElement
  ) {
    return { width: data.videoWidth, height: data.videoHeight };
  }
  return null;
}

export function getTextureDataSize(
  data:
    | TextureData
    | TextureCubeData
    | TextureArrayData
    | TextureCubeArrayData
    | TypedArray,
): { width: number; height: number } | null {
  if (!data) {
    return null;
  }
  if (ArrayBuffer.isView(data)) {
    return null;
  }
  // Recurse into arrays (array of miplevels)
  if (Array.isArray(data)) {
    return getTextureDataSize(data[0]);
  }
  if (isExternalImage(data)) {
    return getExternalImageSize(data);
  }
  if (data && typeof data === 'object' && data.constructor === Object) {
    const untypedData = data as unknown as Record<string, number>;
    return { width: untypedData.width, height: untypedData.height };
  }
  throw new Error('texture size deduction failed');
}

export function getWebGLTextureTarget(dimension: TextureDimension): number {
  switch (dimension) {
    case TextureDimension.TEXTURE_1D:
      break; // not supported in any WebGL version
    case TextureDimension.TEXTURE_2D:
      return GL.TEXTURE_2D; // supported in WebGL1
    case TextureDimension.TEXTURE_3D:
      return GL.TEXTURE_3D; // supported in WebGL2
    case TextureDimension.TEXTURE_CUBE_MAP:
      return GL.TEXTURE_CUBE_MAP; // supported in WebGL1
    case TextureDimension.TEXTURE_2D_ARRAY:
      return GL.TEXTURE_2D_ARRAY; // supported in WebGL2
    case TextureDimension.TEXTURE_CUBE_MAP_ARRAY:
      break; // not supported in any WebGL version
  }
  throw new Error('Wrong texture dimension.');
}
