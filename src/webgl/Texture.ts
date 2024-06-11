import {
  ExternalImage,
  Format,
  GL,
  ResourceType,
  SamplerFormatKind,
  Texture,
  Texture1DData,
  Texture2DData,
  Texture3DData,
  TextureArrayData,
  TextureCubeArrayData,
  TextureCubeData,
  TextureDescriptor,
  TextureDimension,
  TextureLevelData,
  TextureUsage,
  getFormatSamplerKind,
  getTextureDataSize,
  getWebGLTextureTarget,
  isPowerOfTwo,
} from '../api';
import type { Device_GL } from './Device';
import { ResourceBase_GL } from './ResourceBase';
import {
  getPlatformTexture,
  isTextureFormatCompressed,
  // isTextureFormatCompressed,
  isWebGL2,
} from './utils';

export class Texture_GL extends ResourceBase_GL implements Texture {
  type: ResourceType.Texture = ResourceType.Texture;
  gl_texture: WebGLTexture;
  gl_target: GLenum;
  format: Format;
  dimension: TextureDimension;
  width: number;
  height: number;
  depthOrArrayLayers: number;
  mipLevelCount: number;
  immutable: boolean;
  // @see https://developer.mozilla.org/zh-CN/docs/Web/API/WebGLRenderingContext/pixelStorei
  pixelStore: Partial<{
    packAlignment: number;
    unpackAlignment: number;
    unpackFlipY: boolean;
  }>;
  mipmaps: boolean;
  formatKind: SamplerFormatKind;
  textureIndex: number; // used in WebGL1
  isCompressed: boolean;
  is3D: boolean;
  isCube: boolean;

  constructor({
    id,
    device,
    descriptor,
    fake,
  }: {
    id: number;
    device: Device_GL;
    descriptor: TextureDescriptor;
    fake?: boolean;
  }) {
    super({ id, device });

    // Default values.
    descriptor = {
      dimension: TextureDimension.TEXTURE_2D,
      depthOrArrayLayers: 1,
      mipLevelCount: 1,
      ...descriptor,
    };

    const gl = this.device.gl;
    let gl_texture: WebGLTexture;
    // const mipLevelCount = this.clampmipLevelCount(descriptor);
    this.immutable = descriptor.usage === TextureUsage.RENDER_TARGET;
    this.pixelStore = descriptor.pixelStore;
    this.format = descriptor.format;
    this.dimension = descriptor.dimension;
    const gl_target = getWebGLTextureTarget(this.dimension);
    this.gl_target = gl_target;
    this.formatKind = getFormatSamplerKind(descriptor.format);

    // Infer width & height from data.
    let width = descriptor.width;
    let height = descriptor.width;
    if (!width || !height) {
      const textureSize = getTextureDataSize(descriptor.data);
      width = textureSize?.width || 1;
      height = textureSize?.height || 1;
    }

    this.width = width;
    this.height = height;
    this.depthOrArrayLayers = descriptor.depthOrArrayLayers;

    // If mipmap generation is requested and mipLevels is not provided, initialize a full pyramid
    if (descriptor.mipmaps && descriptor.mipLevelCount === undefined) {
      descriptor.mipLevelCount = 'pyramid';
    }

    // Auto-calculate the number of mip levels as a convenience
    this.mipLevelCount =
      descriptor.mipLevelCount === 'pyramid'
        ? this.getMipLevelCount(this.width, this.height)
        : descriptor.mipLevelCount || 1;
    this.mipmaps = descriptor.mipmaps ?? this.mipLevelCount >= 1;

    this.isCompressed = isTextureFormatCompressed(this.format);
    // @see https://github.com/shrekshao/MoveWebGL1EngineToWebGL2/blob/master/Move-a-WebGL-1-Engine-To-WebGL-2-Blog-2.md#3d-texture
    this.is3D =
      this.gl_target === GL.TEXTURE_3D ||
      this.gl_target === GL.TEXTURE_2D_ARRAY;
    this.isCube = this.gl_target === GL.TEXTURE_CUBE_MAP;

    if (!fake) {
      this.preprocessImage();

      gl_texture = this.device.ensureResourceExists(gl.createTexture());
      this.gl_texture = gl_texture;

      this.bind();

      if (!descriptor.data) {
        this.initializeTextureStorage();
      } else {
        this.setImageData(descriptor.data);
      }
    }
  }

  private setTexture1DData(data: Texture1DData) {
    throw new Error('setTexture1DData not supported in WebGL.');
  }

  private setTexture2DData(lodData: Texture2DData, depth = 0) {
    this.bind();

    const lodArray = normalizeTextureData(lodData, {
      width: this.width,
      height: this.height,
      depth: this.depthOrArrayLayers,
    });

    console.log(lodArray);

    // If the user provides multiple LODs, then automatic mipmap
    // generation generateMipmap() should be disabled to avoid overwriting them.
    if (lodArray.length > 1 && this.mipmaps !== false) {
      console.warn(`Texture ${this.id} mipmap and multiple LODs.`);
    }

    // for (let lodLevel = 0; lodLevel < lodArray.length; lodLevel++) {
    //   const imageData = lodArray[lodLevel];
    //   this.setMipLevel(depth, lodLevel, imageData);
    // }

    this.unbind();
  }

  private setTextureArrayData(data: TextureArrayData) {
    throw new Error('setTextureArrayData not implemented.');
  }

  private setTextureCubeArrayData(data: TextureCubeArrayData) {
    throw new Error('setTextureCubeArrayData not supported in WebGL2.');
  }

  private bind() {
    const gl = this.device.gl;
    this.device.setActiveTexture(gl.TEXTURE0);
    this.device['currentTextures'][0] = null;
    gl.bindTexture(this.gl_target, this.gl_texture);
  }

  private unbind() {
    const gl = this.device.gl;
    gl.bindTexture(this.gl_target, null);
  }

  private initializeTextureStorage() {
    if (this.immutable) {
      const gl = this.device.gl;
      const gl_type = this.device.translateTextureType(this.format);
      const internalformat = this.device.translateTextureInternalFormat(
        this.format,
      );
      if (isWebGL2(gl)) {
        switch (this.dimension) {
          case TextureDimension.TEXTURE_2D_ARRAY:
          case TextureDimension.TEXTURE_3D:
            // @see https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/texStorage3D
            gl.texStorage3D(
              this.gl_target,
              this.mipLevelCount,
              internalformat,
              this.width,
              this.height,
              this.depthOrArrayLayers,
            );
            break;
          default:
            gl.texStorage2D(
              this.gl_target,
              this.mipLevelCount,
              internalformat,
              this.width,
              this.height,
            );
        }
      } else {
      }
    }

    // if (this.dimension === TextureDimension.TEXTURE_2D) {
    //   if (this.immutable) {
    //     if (isWebGL2(gl)) {

    //       gl.texStorage2D(
    //         this.gl_target,
    //         this.mipLevelCount,
    //         internalformat,
    //         this.width,
    //         this.height,
    //       );
    //     } else {
    //       // texImage2D: level must be 0 for DEPTH_COMPONENT format
    //       // const level = internalformat === GL.DEPTH_COMPONENT || this.isNPOT() ? 0 : mipLevelCount;
    //       const level =
    //         internalformat === GL.DEPTH_COMPONENT || this.isNPOT() ? 0 : 0;

    //       if (
    //         (this.format === Format.D32F || this.format === Format.D24_S8) &&
    //         !isWebGL2(gl) &&
    //         !this.device.WEBGL_depth_texture
    //       ) {
    //       } else {
    //         // if (!isWebGL2(gl)) {
    //         //   if (internalformat === GL.RGBA4) {
    //         //     internalformat = GL.RGBA;
    //         //   }
    //         // }
    //         // @see https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texImage2D
    //         gl.texImage2D(
    //           this.gl_target,
    //           level,
    //           internalformat,
    //           this.width,
    //           this.height,
    //           0,
    //           internalformat,
    //           gl_type,
    //           null,
    //         );

    //         // @see https://stackoverflow.com/questions/21954036/dartweb-gl-render-warning-texture-bound-to-texture-unit-0-is-not-renderable
    //         // [.WebGL-0x106ad0400]RENDER WARNING: texture bound to texture unit 0 is not renderable. It might be non-power-of-2 or have incompatible texture filtering (maybe)?
    //         if (this.mipmaps) {
    //           this.mipmaps = false;
    //           gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.LINEAR);
    //           gl.texParameteri(
    //             GL.TEXTURE_2D,
    //             GL.TEXTURE_WRAP_S,
    //             GL.CLAMP_TO_EDGE,
    //           );
    //           gl.texParameteri(
    //             GL.TEXTURE_2D,
    //             GL.TEXTURE_WRAP_T,
    //             GL.CLAMP_TO_EDGE,
    //           );
    //         }
    //       }
    //     }
    //   }
    //   assert(this.depthOrArrayLayers === 1);
    // } else if (this.dimension === TextureDimension.TEXTURE_CUBE_MAP) {
    //   if (this.immutable) {
    //     if (isWebGL2(gl)) {

    //     }
    //   }
    //   assert(this.depthOrArrayLayers === 6);
    // } else {
    //   throw new Error('whoops');
    // }
  }

  // @ts-ignore
  setImageData(
    data:
      | Texture1DData
      | Texture2DData
      | Texture3DData
      | TextureArrayData
      | TextureCubeData
      | TextureCubeArrayData,
    lod = 0,
    origin?: [number, number] | [number, number, number],
    size?: [number, number] | [number, number, number],
    byteOffset = 0,
  ) {
    const gl = this.device.gl;

    this.bind();

    switch (this.dimension) {
      case TextureDimension.TEXTURE_1D:
        this.setTexture1DData(data as Texture1DData);
        break;
      case TextureDimension.TEXTURE_2D:
        this.setTexture2DData(data as Texture2DData);
        break;
      // case TextureDimension.TEXTURE_3D: this.setTexture3DData(descriptor.data); break;
      // case TextureDimension.TEXTURE_CUBE_MAP: this.setTextureCubeData(descriptor.data); break;
      case TextureDimension.TEXTURE_2D_ARRAY:
        this.setTextureArrayData(data as TextureArrayData);
        break;
      case TextureDimension.TEXTURE_CUBE_MAP_ARRAY:
        this.setTextureCubeArrayData(data as TextureCubeArrayData);
        break;
    }

    // const isTA = isTypedArray(levelDatas[0]);

    // const data = levelDatas[0];

    // let xoffset = origin?.[0] || 0;
    // let yoffset = origin?.[1] || 0;
    // let width: number;
    // let height: number;
    // let depth: number;
    // if (isTA) {
    //   width = size?.[0] || this.width;
    //   height = size?.[1] || this.height;
    //   depth = size?.[2] || this.depthOrArrayLayers;
    // } else {
    //   // FIXME: Property 'width' does not exist on type 'TexImageSource'.
    //   // Property 'width' does not exist on type 'VideoFrame'.
    //   // @ts-ignore
    //   width = (data as TexImageSource).width;
    //   // @ts-ignore
    //   height = (data as TexImageSource).height;
    //   // update size
    //   this.width = width;
    //   this.height = height;
    // }

    // const gl_format = this.device.translateTextureFormat(this.format);
    // // In WebGL 1, this must be the same as internalformat
    // const gl_internal_format = isWebGL2(gl)
    //   ? this.device.translateInternalTextureFormat(this.format)
    //   : gl_format;
    // const gl_type = this.device.translateTextureType(this.format);

    // this.preprocessImage();

    // for (let z = 0; z < this.depthOrArrayLayers; z++) {
    //   const levelData = levelDatas[z];
    //   let gl_target = this.gl_target;

    //   if (this.isCube) {
    //     gl_target = GL.TEXTURE_CUBE_MAP_POSITIVE_X + (z % 6);
    //   }

    //   if (this.immutable) {
    //     if (this.is3D) {
    //       if (isWebGL2(gl)) {
    //         if (this.isCompressed) {
    //           gl.compressedTexSubImage3D(
    //             gl_target,
    //             lod,
    //             xoffset,
    //             yoffset,
    //             z,
    //             width,
    //             height,
    //             this.depthOrArrayLayers,
    //             gl_format,
    //             levelData as ArrayBufferView,
    //             byteOffset,
    //           );
    //         } else {
    //           gl.texSubImage3D(
    //             gl_target,
    //             lod,
    //             xoffset,
    //             yoffset,
    //             z,
    //             width,
    //             height,
    //             depth,
    //             gl_format,
    //             gl_type,
    //             levelData as ArrayBufferView,
    //             byteOffset,
    //           );
    //         }
    //       } else {
    //         throw new Error('texSubImage3D not supported in WebGL1.');
    //       }
    //     } else {
    //       if (this.isCompressed) {
    //         gl.compressedTexSubImage2D(
    //           gl_target,
    //           lod,
    //           xoffset,
    //           yoffset,
    //           width,
    //           height,
    //           gl_format,
    //           levelData as ArrayBufferView,
    //           byteOffset,
    //         );
    //       } else {
    //         // must use texSubImage2D instead of texImage2D, since texture is immutable
    //         // @see https://stackoverflow.com/questions/56123201/unity-plugin-texture-is-immutable?rq=1
    //         // @see https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texSubImage2D
    //         gl.texSubImage2D(
    //           gl_target,
    //           lod,
    //           xoffset,
    //           yoffset,
    //           width,
    //           height,
    //           gl_format,
    //           gl_type,
    //           levelData as ArrayBufferView,
    //           byteOffset,
    //         );
    //       }
    //     }
    //   } else {
    //     if (isWebGL2(gl)) {
    //       if (this.is3D) {
    //         gl.texImage3D(
    //           gl_target,
    //           lod,
    //           gl_internal_format,
    //           width,
    //           height,
    //           this.depthOrArrayLayers,
    //           0, // border must be 0
    //           gl_format, // TODO: can be different with gl_format
    //           gl_type,
    //           levelData as ArrayBufferView,
    //         );
    //       } else {
    //         // @see https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texImage2D
    //         gl.texImage2D(
    //           gl_target,
    //           lod,
    //           gl_internal_format,
    //           width,
    //           height,
    //           0, // border must be 0
    //           gl_format, // TODO: can be different with gl_format
    //           gl_type,
    //           levelData as ArrayBufferView,
    //         );
    //       }
    //     } else {
    //       // WebGL1: upload Array & Image separately
    //       if (isTA) {
    //         (gl as WebGLRenderingContext).texImage2D(
    //           gl_target,
    //           lod,
    //           gl_format,
    //           width,
    //           height,
    //           0,
    //           gl_format,
    //           gl_type,
    //           levelData as ArrayBufferView,
    //         );
    //       } else {
    //         (gl as WebGLRenderingContext).texImage2D(
    //           gl_target,
    //           lod,
    //           gl_format,
    //           gl_format,
    //           gl_type,
    //           levelData as TexImageSource,
    //         );
    //       }
    //     }
    //   }
    // }

    // if (this.mipmaps) {
    //   this.generateMipmap();
    // }
  }

  destroy() {
    super.destroy();
    this.device.gl.deleteTexture(getPlatformTexture(this));
  }

  // private clampmipLevelCount(descriptor: TextureDescriptor): number {
  //   if (
  //     descriptor.dimension === TextureDimension.TEXTURE_2D_ARRAY &&
  //     descriptor.depthOrArrayLayers > 1
  //   ) {
  //     const typeFlags: FormatTypeFlags = getFormatTypeFlags(descriptor.format);
  //     if (typeFlags === FormatTypeFlags.BC1) {
  //       // Chrome/ANGLE seems to have issues with compressed miplevels of size 1/2, so clamp before they arrive...
  //       // https://bugs.chromium.org/p/angleproject/issues/detail?id=4056
  //       let w = descriptor.width,
  //         h = descriptor.height;
  //       for (let i = 0; i < descriptor.mipLevelCount; i++) {
  //         if (w <= 2 || h <= 2) return i - 1;

  //         w = Math.max((w / 2) | 0, 1);
  //         h = Math.max((h / 2) | 0, 1);
  //       }
  //     }
  //   }

  //   return descriptor.mipLevelCount;
  // }

  private preprocessImage() {
    const gl = this.device.gl;
    if (this.pixelStore) {
      if (this.pixelStore.unpackFlipY) {
        gl.pixelStorei(GL.UNPACK_FLIP_Y_WEBGL, true);
      }
      if (this.pixelStore.packAlignment) {
        gl.pixelStorei(GL.PACK_ALIGNMENT, this.pixelStore.packAlignment);
      }
      if (this.pixelStore.unpackAlignment) {
        gl.pixelStorei(GL.UNPACK_ALIGNMENT, this.pixelStore.unpackAlignment);
      }
    }
  }

  private generateMipmap(): this {
    const gl = this.device.gl;
    if (!isWebGL2(gl) && this.isNPOT()) {
      return this;
    }

    if (this.gl_texture && this.gl_target) {
      gl.bindTexture(this.gl_target, this.gl_texture);

      if (this.isCompressed) {
        // We can't use gl.generateMipmaps with compressed textures, so only use
        // mipmapped filtering if the compressed texture data contained mip levels.
        // @see https://github.com/toji/texture-tester/blob/master/js/webgl-texture-util.js#L857
        if (this.mipLevelCount > 1) {
          gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.LINEAR);
          gl.texParameteri(
            GL.TEXTURE_2D,
            GL.TEXTURE_MIN_FILTER,
            GL.LINEAR_MIPMAP_NEAREST,
          );
        } else {
          gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.LINEAR);
          gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.LINEAR);
        }
      } else {
        // if (this.is3D) {
        //   gl.texParameteri(this.gl_target, GL.TEXTURE_BASE_LEVEL, 0);
        //   gl.texParameteri(
        //     this.gl_target,
        //     GL.TEXTURE_MAX_LEVEL,
        //     Math.log2(this.width),
        //   );
        //   gl.texParameteri(
        //     this.gl_target,
        //     GL.TEXTURE_MIN_FILTER,
        //     GL.LINEAR_MIPMAP_LINEAR,
        //   );
        //   gl.texParameteri(this.gl_target, GL.TEXTURE_MAG_FILTER, GL.LINEAR);
        // } else {
        //   gl.texParameteri(
        //     GL.TEXTURE_2D,
        //     GL.TEXTURE_MIN_FILTER,
        //     GL.NEAREST_MIPMAP_LINEAR,
        //   );
        // }

        gl.generateMipmap(this.gl_target);
      }
      gl.bindTexture(this.gl_target, null);
    }
    return this;
  }

  private getMipLevelCount(width: number, height: number): number {
    return Math.floor(Math.log2(Math.max(width, height))) + 1;
  }

  private isNPOT(): boolean {
    const gl = this.device.gl;
    if (isWebGL2(gl)) {
      // NPOT restriction is only for WebGL1
      return false;
    }
    return !isPowerOfTwo(this.width) || !isPowerOfTwo(this.height);
  }
}

/**
 * Normalize TextureData to an array of TextureLevelData / ExternalImages
 */
function normalizeTextureData(
  data: Texture2DData,
  options: { width: number; height: number; depth: number },
): (TextureLevelData | ExternalImage)[] {
  let lodArray: (TextureLevelData | ExternalImage)[];
  if (ArrayBuffer.isView(data)) {
    lodArray = [
      {
        data,
        width: options.width,
        height: options.height,
        // depth: options.depth
      },
    ];
  } else if (!Array.isArray(data)) {
    lodArray = [data];
  } else {
    lodArray = data;
  }
  return lodArray;
}
