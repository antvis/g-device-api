import {
  BindingsDescriptor,
  BufferUsage,
  MipmapFilterMode,
  PrimitiveTopology,
  RenderPipelineDescriptor,
  SamplerFormatKind,
  FilterMode,
  TextureDimension,
  AddressMode,
  bindingsDescriptorEquals,
  renderPipelineDescriptorEquals,
  Format,
  TextureUsage,
} from '../../../src';
import { Buffer_GL } from '../../../src/webgl/Buffer';
import { Device_GL } from '../../../src/webgl/Device';
import { Program_GL } from '../../../src/webgl/Program';
import { Sampler_GL } from '../../../src/webgl/Sampler';
import { getWebGLDevice } from '../../utils';

let device: Device_GL;
describe('Hash', () => {
  beforeAll(async () => {
    device = await getWebGLDevice();
  });

  afterAll(() => {
    device.destroy();
  });

  it('should bindingsDescriptorEquals.', () => {
    let a: BindingsDescriptor = {};
    let b: BindingsDescriptor = {};
    expect(bindingsDescriptorEquals(a, b)).toBeTruthy();

    a = {
      uniformBufferBindings: [],
    };
    expect(bindingsDescriptorEquals(a, b)).toBeTruthy();

    a = {
      samplerBindings: [],
    };
    expect(bindingsDescriptorEquals(a, b)).toBeTruthy();

    const buffer = device.createBuffer({
      viewOrSize: 8,
      usage: BufferUsage.VERTEX,
    }) as Buffer_GL;
    const buffer2 = device.createBuffer({
      viewOrSize: 8,
      usage: BufferUsage.VERTEX,
    }) as Buffer_GL;
    a.uniformBufferBindings?.push({
      binding: 0,
      buffer,
      size: 0,
      offset: 0,
    });
    expect(bindingsDescriptorEquals(a, b)).toBeFalsy();

    b.uniformBufferBindings?.push({
      binding: 0,
      buffer,
      size: 0,
      offset: 0,
    });
    expect(bindingsDescriptorEquals(a, b)).toBeTruthy();

    // bufferBindingEquals
    b.uniformBufferBindings![0].binding = 1;
    expect(bindingsDescriptorEquals(a, b)).toBeFalsy();
    b.uniformBufferBindings![0].binding = 0;
    b.uniformBufferBindings![0].buffer = buffer2;
    expect(bindingsDescriptorEquals(a, b)).toBeFalsy();
    b.uniformBufferBindings![0].buffer = buffer;
    b.uniformBufferBindings![0].size = 1;
    expect(bindingsDescriptorEquals(a, b)).toBeFalsy();
    b.uniformBufferBindings![0].size = 0;
    b.uniformBufferBindings![0].offset = 1;
    expect(bindingsDescriptorEquals(a, b)).toBeFalsy();
    b.uniformBufferBindings![0].offset = 0;
    expect(bindingsDescriptorEquals(a, b)).toBeTruthy();

    // samplerBindingEquals
    const sampler = device.createSampler({
      addressModeU: AddressMode.CLAMP_TO_EDGE,
      addressModeV: AddressMode.CLAMP_TO_EDGE,
      minFilter: FilterMode.POINT,
      magFilter: FilterMode.BILINEAR,
      mipmapFilter: MipmapFilterMode.LINEAR,
      lodMinClamp: 0,
      lodMaxClamp: 0,
    }) as Sampler_GL;
    const sampler2 = device.createSampler({
      addressModeU: AddressMode.CLAMP_TO_EDGE,
      addressModeV: AddressMode.CLAMP_TO_EDGE,
      minFilter: FilterMode.POINT,
      magFilter: FilterMode.BILINEAR,
      mipmapFilter: MipmapFilterMode.LINEAR,
      lodMinClamp: 0,
      lodMaxClamp: 0,
    }) as Sampler_GL;
    a.samplerBindings?.push({
      sampler,
      texture: null,
      dimension: TextureDimension.TEXTURE_2D,
      formatKind: SamplerFormatKind.Float,
      comparison: false,
    });
    expect(bindingsDescriptorEquals(a, b)).toBeFalsy();
    b.samplerBindings?.push({
      sampler,
      texture: null,
      dimension: TextureDimension.TEXTURE_2D,
      formatKind: SamplerFormatKind.Float,
      comparison: false,
    });
    expect(bindingsDescriptorEquals(a, b)).toBeTruthy();
    b.samplerBindings![0].sampler = sampler2;
    expect(bindingsDescriptorEquals(a, b)).toBeFalsy();
    b.samplerBindings![0].sampler = sampler;
    expect(bindingsDescriptorEquals(a, b)).toBeTruthy();

    b.samplerBindings![0].dimension = TextureDimension.TEXTURE_2D_ARRAY;
    expect(bindingsDescriptorEquals(a, b)).toBeFalsy();
    b.samplerBindings![0].dimension = TextureDimension.TEXTURE_2D;
    expect(bindingsDescriptorEquals(a, b)).toBeTruthy();

    b.samplerBindings![0].formatKind = SamplerFormatKind.Depth;
    expect(bindingsDescriptorEquals(a, b)).toBeFalsy();
    b.samplerBindings![0].formatKind = SamplerFormatKind.Float;
    expect(bindingsDescriptorEquals(a, b)).toBeTruthy();

    b.samplerBindings![0].comparison = true;
    expect(bindingsDescriptorEquals(a, b)).toBeFalsy();
    b.samplerBindings![0].comparison = false;
    expect(bindingsDescriptorEquals(a, b)).toBeTruthy();

    a.storageBufferBindings?.push({
      binding: 0,
      buffer,
      size: 0,
      offset: 0,
    });
    expect(bindingsDescriptorEquals(a, b)).toBeFalsy();
    b.storageBufferBindings?.push({
      binding: 1,
      buffer,
      size: 0,
      offset: 0,
    });
    expect(bindingsDescriptorEquals(a, b)).toBeFalsy();
    // @ts-ignore
    b.storageBufferBindings[0].binding = 0;
    expect(bindingsDescriptorEquals(a, b)).toBeTruthy();
    // @ts-ignore
    b.storageBufferBindings[0].size = 100;
    expect(bindingsDescriptorEquals(a, b)).toBeFalsy();
    // @ts-ignore
    b.storageBufferBindings[0].size = 0;

    const texture = device.createTexture({
      format: Format.U8_RGBA_RT,
      width: 100,
      height: 100,
      usage: TextureUsage.SAMPLED,
    });
    const texture2 = device.createTexture({
      format: Format.U8_RGBA_RT,
      width: 100,
      height: 100,
      usage: TextureUsage.SAMPLED,
    });
    a.storageTextureBindings?.push({
      binding: 0,
      texture,
    });
    expect(bindingsDescriptorEquals(a, b)).toBeFalsy();
    b.storageTextureBindings?.push({
      binding: 0,
      texture,
    });
    expect(bindingsDescriptorEquals(a, b)).toBeTruthy();
    // @ts-ignore
    b.storageTextureBindings[0].texture = texture2;
    expect(bindingsDescriptorEquals(a, b)).toBeFalsy();
  });

  it('should renderPipelineDescriptorEquals.', () => {
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
    }) as Program_GL;

    let a: RenderPipelineDescriptor = {
      inputLayout: null,
      program,
      colorAttachmentFormats: [],
      topology: PrimitiveTopology.TRIANGLES,
    };
    let b: RenderPipelineDescriptor = {
      inputLayout: null,
      program,
      colorAttachmentFormats: [],
      topology: PrimitiveTopology.TRIANGLES,
    };
    expect(renderPipelineDescriptorEquals(a, b)).toBeTruthy();

    b.topology = PrimitiveTopology.POINTS;
    expect(renderPipelineDescriptorEquals(a, b)).toBeFalsy();
    b.topology = PrimitiveTopology.TRIANGLES;
    expect(renderPipelineDescriptorEquals(a, b)).toBeTruthy();
  });
});
