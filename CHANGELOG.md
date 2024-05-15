# @antv/g-device-api

## 1.6.9

### Patch Changes

-   86536cf: Pass through antialias option when creating webgl context.

## 1.6.8

### Patch Changes

-   97429ba: Commit rust bundle.

## 1.6.7

### Patch Changes

-   c4f1bb3: Copy rust bundle.

## 1.6.6

### Patch Changes

-   5cfa31c: Display more granular error message when compiling wgsl with naga.

## 1.6.5

### Patch Changes

-   d9b7078: Separate sampler and textures correctly.

## 1.6.4

### Patch Changes

-   5c86bba: Enable filterable float32 feature in WebGPU.

## 1.6.3

### Patch Changes

-   8fde282: WriteTexture should account for bytesPerRow in WebGPU.

## 1.6.2

### Patch Changes

-   94fa643: Support drawIndirect in WebGPU.

## 1.6.1

### Patch Changes

-   5081681: Configure shaderdebug when creating webgl device contribution.

## 1.6.0

### Minor Changes

-   d7508c4: Support render bundle to reduce draw calls in both WebGL & WebGPU.

## 1.5.0

### Minor Changes

-   868f3ba: Postprocess after shader compilation.

## 1.4.16

### Patch Changes

-   9030813: Support stencil value mask.

## 1.4.15

### Patch Changes

-   9c0c37d: Binding hash should account for storage buffer & texture bindings.

## 1.4.14

### Patch Changes

-   05e33ac: Read texture in webgpu.

## 1.4.13

### Patch Changes

-   ce8f26d: Support set image data in webgpu.

## 1.4.12

### Patch Changes

-   c1255e8: Allow heading spaces when compiling to GLSL 440.

## 1.4.11

### Patch Changes

-   77b0479: Storage texture binding can be assigned manually.

## 1.4.10

### Patch Changes

-   703db62: SamplerBindings can ignore sampler in webgpu compute shader.

## 1.4.9

### Patch Changes

-   d24939d: Add storage texture binding for webgpu.

## 1.4.8

### Patch Changes

-   e2e8ffa: Add flipY option in webgpu texture.

## 1.4.7

### Patch Changes

-   72ddd05: Use internal format in webgl2 when calling texImage2D.

## 1.4.6

### Patch Changes

-   82c8d04: Split Format.ALPHA and LUMINANCE.

## 1.4.5

### Patch Changes

-   ca5eb24: Space before uniform block can be ignored.

## 1.4.4

### Patch Changes

-   38d0b8e: Copy storage bindings correctly.

## 1.4.3

### Patch Changes

-   f28757e: Support nested render pass in WebGL2.

## 1.4.2

### Patch Changes

-   d150566: Support multi textures in WebGL2.

## 1.4.1

### Patch Changes

-   d473bdf: Export wasm pkg.

## 1.4.0

### Minor Changes

-   aacebe6: Use naga-oil to combine and manipulate WGSL shaders.

## 1.3.9

### Patch Changes

-   94a3fda: Compiler should account for space when transpiling shaders.

## 1.3.8

### Patch Changes

-   ff7fbb5: Create simple program in WebGPU device.

## 1.3.7

### Patch Changes

-   12c25d1: Use compatible newline char in shader compiler.

## 1.3.6

### Patch Changes

-   efa1878: Compile raw GLSL100 shader correctly.

## 1.3.5

### Patch Changes

-   42d3a0d: Fix readTexture in WebGL2.

## 1.3.4

### Patch Changes

-   8343e43: Floating-point texture in WebGL1.

## 1.3.3

### Patch Changes

-   fbcb785: Support floating-point texture.

## 1.3.2

### Patch Changes

-   ae4f84b: Support luminance pixel format.

## 1.3.1

### Patch Changes

-   c0f1220: Use lowerleft as origin in setViewport & setScissorRect.

## 1.3.0

### Minor Changes

-   5d930c0: Support multiple render targets.

## 1.2.3

### Patch Changes

-   14f2b4d: Add xrCompatible to device contribution.
-   14f2b4d: Uniform binding can omit size.

## 1.2.2

### Patch Changes

-   d627fe8: Size in storage bindings can be undefined.

## 1.2.1

### Patch Changes

-   f948404: Use default mega state in WebGPU device.

## 1.2.0

### Minor Changes

-   991faea: Support stencil front & back.

### Patch Changes

-   d74a956: Set default offset of IndexBuffer.

## 1.1.3

### Patch Changes

-   d7760db: Export rust bundle.

## 1.1.2

### Patch Changes

-   e521c2a: Use default sampler entry.

## 1.1.1

### Patch Changes

-   6891a60: Export compiler utils.

## 1.1.0

### Minor Changes

-   59a952f: Rename interface & params to make API closed to WebGPU style.

## 1.0.3

### Patch Changes

-   6143192: Generate mipmap for 3D texture.

## 1.0.2

### Patch Changes

-   8a03cab: Add naga wasm to dist.

## 1.0.1

### Patch Changes

-   8f5c332: Add UMD bundle.

## 1.0.0

### Major Changes

-   40f4045: WebGPU implementation.

### Patch Changes

-   25e7d22: Add WebGL Implementation.
