# @strawberry-vis/g-device-api

A set of Device API which implements with WebGL1/2 & WebGPU.

-   [API](#api)
-   [Shader Language](#shader-language)
-   [Examples](#examples)

## Installing

```bash
npm install @strawberry-vis/g-device-api
```

## <a id='api' />API Reference

-   [Create a device](#createDevice)
-   Resource Creation

    -   [createBuffer](#createBuffer)
    -   [createTexture](#createTexture)
    -   [createSampler](#createSampler)
    -   [createRenderTarget](#createRenderTarget)
    -   [createRenderTargetFromTexture](#createRenderTargetFromTexture)
    -   [createProgram](#createProgram)
    -   [createBindings](#createBindings)
    -   [createInputLayout](#createInputLayout)
    -   [createRenderPipeline](#createRenderPipeline)
    -   [createComputePipeline](#createComputePipeline)
    -   [createReadback](#createReadback)
    -   [createQueryPool](#createQueryPool)
    -   [createRenderPass](#createRenderPass)
    -   [createComputePass](#createComputePass)

-   Submit
    -   [submitPass](#submitPass)
    -   [copySubTexture2D](#copySubTexture2D)
-   Query
    -   [queryLimits](#queryLimits)
    -   [queryTextureFormatSupported](#queryTextureFormatSupported)
    -   [queryPlatformAvailable](#queryPlatformAvailable)
    -   [queryVendorInfo](#queryVendorInfo)
-   Debug
    -   [setResourceName](#setResourceName)
    -   [checkForLeaks](#checkForLeaks)
    -   [pushDebugGroup](#pushDebugGroup)
    -   [popDebugGroup](#popDebugGroup)

### <a id='createDevice' />Create Device

A device is the logical instantiation of GPU.

```js
import {
    Device,
    BufferUsage,
    WebGLDeviceContribution,
    WebGPUDeviceContribution,
} from '@strawberry-vis/g-device-api';

// Create a WebGL based device contribution.
const deviceContribution = new WebGLDeviceContribution({
    targets: ['webgl2', 'webgl1'],
});
// Or create a WebGPU based device contribution.
const deviceContribution = new WebGPUDeviceContribution({
    shaderCompilerPath: '/glsl_wgsl_compiler_bg.wasm',
});

const swapChain = await deviceContribution.createSwapChain($canvas);
swapChain.configureSwapChain(width, height);
const device = swapChain.getDevice();
```

### <a id="createBuffer" />createBuffer

<https://www.w3.org/TR/webgpu/#dom-gpudevice-createbuffer>

```ts
createBuffer: (descriptor: BufferDescriptor) => Buffer;
```

```ts
/**
 * @see https://www.w3.org/TR/webgpu/#GPUBufferDescriptor
 */
export interface BufferDescriptor {
    viewOrSize: ArrayBufferView | number;
    usage: BufferUsage;
    hint?: BufferFrequencyHint;
}

/**
 * @see https://www.w3.org/TR/webgpu/#buffer-usage
 */
export enum BufferUsage {
    MAP_READ = 0x0001,
    MAP_WRITE = 0x0002,
    COPY_SRC = 0x0004,
    COPY_DST = 0x0008,
    INDEX = 0x0010,
    VERTEX = 0x0020,
    UNIFORM = 0x0040,
    STORAGE = 0x0080,
    INDIRECT = 0x0100,
    QUERY_RESOLVE = 0x0200,
}

export enum BufferFrequencyHint {
    Static = 0x01,
    Dynamic = 0x02,
}
```

### <a id="createTexture" />createTexture

<https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createTexture>

```ts
createTexture: (descriptor: TextureDescriptor) => Texture;
```

### <a id="createSampler" />createSampler

```ts
createSampler: (descriptor: SamplerDescriptor) => Sampler;

export interface SamplerDescriptor {
    wrapS: WrapMode;
    wrapT: WrapMode;
    wrapQ?: WrapMode;
    minFilter: TexFilterMode;
    magFilter: TexFilterMode;
    mipFilter: MipFilterMode;
    minLOD?: number;
    maxLOD?: number;
    maxAnisotropy?: number;
    compareMode?: CompareMode;
}
```

```ts
export enum WrapMode {
    CLAMP,
    REPEAT,
    MIRROR,
}
export enum TexFilterMode {
    POINT,
    BILINEAR,
}
export enum MipFilterMode {
    NO_MIP,
    NEAREST,
    LINEAR,
}
export enum CompareMode {
    NEVER = GL.NEVER,
    LESS = GL.LESS,
    EQUAL = GL.EQUAL,
    LEQUAL = GL.LEQUAL,
    GREATER = GL.GREATER,
    NOTEQUAL = GL.NOTEQUAL,
    GEQUAL = GL.GEQUAL,
    ALWAYS = GL.ALWAYS,
}
```

### <a id="createRenderTarget" />createRenderTarget

```ts
createRenderTarget: (descriptor: RenderTargetDescriptor) => RenderTarget;
```

```ts
export interface RenderTargetDescriptor {
    pixelFormat: Format;
    width: number;
    height: number;
    sampleCount: number;
    texture?: Texture;
}
```

### <a id="createRenderTargetFromTexture" />createRenderTargetFromTexture

```ts
createRenderTargetFromTexture: (texture: Texture) => RenderTarget;
```

### <a id="createProgram" />createProgram

```ts
createProgram: (program: ProgramDescriptor) => Program;
```

```ts
export interface ProgramDescriptor {
    vertex?: {
        glsl?: string;
        wgsl?: string;
    };
    fragment?: {
        glsl?: string;
        wgsl?: string;
    };
    compute?: {
        wgsl: string;
    };
}
```

### <a id="createBindings" />createBindings

```ts
createBindings: (bindingsDescriptor: BindingsDescriptor) => Bindings;
```

```ts
export interface BindingsDescriptor {
    bindingLayout: BindingLayoutDescriptor;
    pipeline?: RenderPipeline | ComputePipeline;
    uniformBufferBindings?: BufferBinding[];
    samplerBindings?: SamplerBinding[];
    storageBufferBindings?: BufferBinding[];
}
```

### <a id="createInputLayout" />createInputLayout

```ts
createInputLayout: (inputLayoutDescriptor: InputLayoutDescriptor) =>
    InputLayout;
```

```ts
export interface InputLayoutDescriptor {
    vertexBufferDescriptors: (InputLayoutBufferDescriptor | null)[];
    vertexAttributeDescriptors: VertexAttributeDescriptor[];
    indexBufferFormat: Format | null;
    program: Program;
}

export interface InputLayoutBufferDescriptor {
    byteStride: number;
    stepMode: VertexStepMode;
}

export interface VertexAttributeDescriptor {
    location: number;
    format: Format;
    bufferIndex: number;
    bufferByteOffset: number;
    divisor?: number;
}
```

### <a id="createReadback" />createReadback

Create a Readback to read GPU resouce's data from CPU side:

```ts
createReadback: () => Readback;
```

```ts
readBuffer: (
    b: Buffer,
    srcByteOffset?: number,
    dst?: ArrayBufferView,
    dstOffset?: number,
    length?: number,
) => Promise<ArrayBufferView>;
```

```ts
const readback = device.createReadback();
readback.readBuffer(buffer);
```

### <a id="createQueryPool" />createQueryPool

Only WebGL 2 & WebGPU support:

```ts
createQueryPool: (type: QueryPoolType, elemCount: number) => QueryPool;
```

```ts
queryResultOcclusion(dstOffs: number): boolean | null
```

### <a id="createRenderPipeline" />createRenderPipeline

```ts
createRenderPipeline: (descriptor: RenderPipelineDescriptor) => RenderPipeline;
```

### <a id="createComputePipeline" />createComputePipeline

```ts
createComputePipeline: (descriptor: ComputePipelineDescriptor) =>
    ComputePipeline;
```

```ts
export type ComputePipelineDescriptor = PipelineDescriptor;
export interface PipelineDescriptor {
    bindingLayouts: BindingLayoutDescriptor[];
    inputLayout: InputLayout | null;
    program: Program;
}
```

### <a id="createRenderPass" />createRenderPass

### <a id="createComputePass" />createComputePass

⚠️Only WebGPU support.

```ts
createComputePass: () => ComputePass;
```

### <a id="submitPass" />submitPass

```ts
submitPass(o: RenderPass | ComputePass): void;
```

### <a id="copySubTexture2D" />copySubTexture2D

```ts
copySubTexture2D: (
  dst: Texture,
  dstX: number,
  dstY: number,
  src: Texture,
  srcX: number,
  srcY: number,
) => void;
```

-   ⚠️WebGL 1 not supported
-   WebGL 2 uses [blitFramebuffer](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/blitFramebuffer)
-   WebGPU uses [copyTextureToTexture](https://developer.mozilla.org/en-US/docs/Web/API/GPUCommandEncoder/copyTextureToTexture)

### <a id="queryLimits" />queryLimits

```ts
// @see https://www.w3.org/TR/webgpu/#gpusupportedlimits
queryLimits: () => DeviceLimits;
```

```ts
export interface DeviceLimits {
    uniformBufferWordAlignment: number;
    uniformBufferMaxPageWordSize: number;
    supportedSampleCounts: number[];
    occlusionQueriesRecommended: boolean;
    computeShadersSupported: boolean;
}
```

### <a id="queryPlatformAvailable" />queryPlatformAvailable

Query whether device's context is already lost:

```ts
queryPlatformAvailable(): boolean
```

WebGL / WebGPU will trigger Lost event:

```ts
device.queryPlatformAvailable(); // false
```

### <a id="queryTextureFormatSupported" />queryTextureFormatSupported

```ts
queryTextureFormatSupported(format: Format, width: number, height: number): boolean;
```

```ts
const shadowsSupported = device.queryTextureFormatSupported(
    Format.U16_RG_NORM,
    0,
    0,
);
```

### <a id="queryVendorInfo" />queryVendorInfo

WebGL 1/2 & WebGPU use different origin:

```ts
queryVendorInfo: () => VendorInfo;
```

```ts
export interface VendorInfo {
    readonly platformString: string;
    readonly glslVersion: string;
    readonly explicitBindingLocations: boolean;
    readonly separateSamplerTextures: boolean;
    readonly viewportOrigin: ViewportOrigin;
    readonly clipSpaceNearZ: ClipSpaceNearZ;
    readonly supportMRT: boolean;
}
```

### <a id="setResourceName" />setResourceName

When using Spector.js to debug our application, we can set a name to relative GPU resource.

```ts
setResourceName: (o: Resource, s: string) => void;
```

For instance, we add a label for RT and Spector.js will show us the metadata:

```ts
device.setResourceName(renderTarget, 'Main Render Target');
```

<img width="1130" alt="spector.js metadata" src="https://github.com/antvis/G/assets/3608471/b4c5b519-27c3-4bea-8f76-624169d3f130">

On WebGPU devtools we can also see the label:
<img width="761" alt="webgpu devtools label" src="https://github.com/antvis/G/assets/3608471/7e4a4513-a1e0-4f98-ab06-468b794d66b8">

### <a id="checkForLeaks" />checkForLeaks

Checks if there is currently a leaking GPU resource. We keep track of every GPU resource object created, and calling this method prints the currently undestroyed object and the stack information where the resource was created on the console, making it easy to troubleshoot memory leaks.

It is recommended to call this when destroying the scene to determine if there are resources that have not been destroyed correctly. For example, in the image below, there is a WebGL Buffer that has not been destroyed:

<img width="879" alt="check for leaks" src="https://github.com/antvis/G/assets/3608471/8a0b3c2f-f267-4e72-a8a1-758cd0728dcb">

We should call `buffer.destroy()` at this time to avoid OOM.

### <a id="pushDebugGroup" />pushDebugGroup

<https://developer.mozilla.org/en-US/docs/Web/API/GPUCommandEncoder/pushDebugGroup>

```ts
pushDebugGroup(debugGroup: DebugGroup): void;
```

```ts
interface DebugGroup {
    name: string;
    drawCallCount: number;
    textureBindCount: number;
    bufferUploadCount: number;
    triangleCount: number;
}
```

### <a id="popDebugGroup" />popDebugGroup

<https://developer.mozilla.org/en-US/docs/Web/API/GPUCommandEncoder/popDebugGroup>

## <a id='shader-language' />Shader Language

Since WebGL 1/2 & WebGPU use different shader languages, we do a lot of transpiling work at runtime.

We use a syntax very closed to GLSL 300, and for different devices:

-   WebGL1. Downgrade to GLSL 100.
-   WebGL2. Almost keep the same which means GLSL 300.
-   WebGPU. Transpile to GLSL 440 and then use [gfx-naga]() WASM to generate WGSL.

Syntax as follows:

-   [Attribute](#attribute)
-   [Varying](#varying)
-   [Sampler](#sampler)
-   [Uniform](#uniform)
-   [gl_Position](#gl_Position)
-   [gl_FragColor](#gl_FragColor)
-   [Define](#define)

### <a id='attribute' />Attribute

```glsl
// raw
layout(location = 0) in vec4 a_Position;

// compiled GLSL 100
attribute vec4 a_Position;

// compiled GLSL 300
layout(location = 0) in vec4 a_Position;

// compiled GLSL 440
layout(location = 0) in vec4 a_Position;

// compiled WGSL
var<private> a_Position_1: vec4<f32>;
@vertex
fn main(@location(0) a_Position: vec4<f32>) -> VertexOutput {
    a_Position_1 = a_Position;
}
```

### <a id='varying' />Varying

```glsl
// raw
out vec4 a_Position;

// compiled GLSL 100
varying vec4 a_Position;

// compiled GLSL 300
out vec4 a_Position;

// compiled GLSL 440
layout(location = 0) out vec4 a_Position;

// compiled WGSL
struct VertexOutput {
    @location(0) v_Position: vec4<f32>,
}
```

### <a id='sampler' />Sampler

We need to use `SAMPLER_2D / SAMPLER_Cube` wrapping our texture.

```glsl
// raw
uniform sampler2D u_Texture;
outputColor = texture(SAMPLER_2D(u_Texture), v_Uv);

// compiled GLSL 100
uniform sampler2D u_Texture;
outputColor = texture2D(u_Texture, v_TexCoord);

// compiled GLSL 300
uniform sampler2D u_Texture;
outputColor = texture(u_Texture, v_Uv);

// compiled GLSL 440
layout(set = 1, binding = 0) uniform texture2D T_u_Texture;
layout(set = 1, binding = 1) uniform sampler S_u_Texture;
outputColor = texture(sampler2D(T_u_Texture, S_u_Texture), v_Uv);

// compiled WGSL
@group(1) @binding(0)
var T_u_Texture: texture_2d<f32>;
@group(1) @binding(1)
var S_u_Texture: sampler;
outputColor = textureSample(T_u_Texture, S_u_Texture, _e5);
```

### <a id='uniform' />Uniform

WebGL2 uses Uniform Buffer Object.

```glsl
// raw
layout(std140) uniform Uniforms {
  mat4 u_ModelViewProjectionMatrix;
};

// compiled GLSL 100
uniform mat4 u_ModelViewProjectionMatrix;

// compiled GLSL 300
layout(std140) uniform Uniforms {
  mat4 u_ModelViewProjectionMatrix;
};

// compiled GLSL 440
layout(std140, set = 0, binding = 0) uniform  Uniforms {
  mat4 u_ModelViewProjectionMatrix;
};

// compiled WGSL
struct Uniforms {
  u_ModelViewProjectionMatrix: mat4x4<f32>,
}
@group(0) @binding(0)
var<uniform> global: Uniforms;
```

### <a id='gl_Position' />gl_Position

We still use `gl_Position` to represent the output of vertex shader:

```glsl
// raw
gl_Position = vec4(1.0);

// compiled GLSL 100
gl_Position = vec4(1.0);

// compiled GLSL 300
gl_Position = vec4(1.0);

// compiled GLSL 440
gl_Position = vec4(1.0);

// compiled WGSL
struct VertexOutput {
    @builtin(position) member: vec4<f32>,
}
```

### <a id='gl_FragColor' />gl_FragColor

```glsl
// raw
out vec4 outputColor;
outputColor = vec4(1.0);

// compiled GLSL 100
vec4 outputColor;
outputColor = vec4(1.0);
gl_FragColor = vec4(outputColor);

// compiled GLSL 300
out vec4 outputColor;
outputColor = vec4(1.0);

// compiled GLSL 440
layout(location = 0) out vec4 outputColor;
outputColor = vec4(1.0);

// compiled WGSL
struct FragmentOutput {
    @location(0) outputColor: vec4<f32>,
}
```

### <a id='define' />Define

It is worth mentioning that since WGSL is not natively supported, naga does conditional compilation during the GLSL 440 -> WGSL translation process.

`#define KEY VAR`

```glsl
#define PI 3.14
```
