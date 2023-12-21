import {
  AddressMode,
  Device,
  FilterMode,
  Format,
  MipmapFilterMode,
  Texture,
} from '../../src';

/**
 * @see https://github.com/compute-toys/wgpu-compute-toy/blob/master/src/lib.rs#L367
 * @see https://github.com/compute-toys/wgpu-compute-toy/blob/master/src/bind.rs#L437
 */
export const prelude = `
alias int = i32;
alias uint = u32;
alias float = f32;
alias int2 = vec2<i32>;
alias int3 = vec3<i32>;
alias int4 = vec4<i32>;
alias uint2 = vec2<u32>;
alias uint3 = vec3<u32>;
alias uint4 = vec4<u32>;
alias float2 = vec2<f32>;
alias float3 = vec3<f32>;
alias float4 = vec4<f32>;
alias bool2 = vec2<bool>;
alias bool3 = vec3<bool>;
alias bool4 = vec4<bool>;
alias float2x2 = mat2x2<f32>;
alias float2x3 = mat2x3<f32>;
alias float2x4 = mat2x4<f32>;
alias float3x2 = mat3x2<f32>;
alias float3x3 = mat3x3<f32>;
alias float3x4 = mat3x4<f32>;
alias float4x2 = mat4x2<f32>;
alias float4x3 = mat4x3<f32>;
alias float4x4 = mat4x4<f32>;

struct Time {
  frame: u32,
  elapsed : f32
}

@group(0) @binding(0) var<uniform> time : Time;
@group(3) @binding(0) var screen : texture_storage_2d<rgba16float, write>;

@group(1) @binding(0) var pass_in: texture_2d_array<f32>;
@group(1) @binding(1) var bilinear: sampler;
@group(3) @binding(1) var pass_out: texture_storage_2d_array<rgba16float,write>;

fn passStore(pass_index: int, coord: int2, value: float4) {
  textureStore(pass_out, coord, pass_index, value);
}

fn passLoad(pass_index: int, coord: int2, lod: int) -> float4 {
  return textureLoad(pass_in, coord, pass_index, lod);
}

fn passSampleLevelBilinearRepeat(pass_index: int, uv: float2, lod: float) -> float4 {
  return textureSampleLevel(pass_in, bilinear, fract(uv), pass_index, lod);
}
`;

/**
 * https://github.com/compute-toys/wgpu-compute-toy/blob/master/src/blit.wgsl
 */
export function createBlitPipelineAndBindings(device: Device, screen: Texture) {
  const sampler = device.createSampler({
    addressModeU: AddressMode.CLAMP_TO_EDGE,
    addressModeV: AddressMode.CLAMP_TO_EDGE,
    minFilter: FilterMode.BILINEAR,
    magFilter: FilterMode.BILINEAR,
    mipmapFilter: MipmapFilterMode.LINEAR,
  });

  const renderProgram = device.createProgram({
    vertex: {
      entryPoint: 'vert_main',
      wgsl: `
    @group(1) @binding(0) var myTexture : texture_2d<f32>;
    @group(1) @binding(1) var mySampler : sampler;
    
    struct VertexOutput {
      @builtin(position) Position : vec4<f32>,
      @location(0) fragUV : vec2<f32>,
    }
    
    @vertex
    fn vert_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
      const pos = array(
        vec2( 1.0,  1.0),
        vec2( 1.0, -1.0),
        vec2(-1.0, -1.0),
        vec2( 1.0,  1.0),
        vec2(-1.0, -1.0),
        vec2(-1.0,  1.0),
      );
    
      const uv = array(
        vec2(1.0, 0.0),
        vec2(1.0, 1.0),
        vec2(0.0, 1.0),
        vec2(1.0, 0.0),
        vec2(0.0, 1.0),
        vec2(0.0, 0.0),
      );
    
      var output : VertexOutput;
      output.Position = vec4(pos[VertexIndex], 0.0, 1.0);
      output.fragUV = uv[VertexIndex];
      return output;
    }
          `,
    },
    fragment: {
      entryPoint: 'fs_main_linear_to_srgb',
      wgsl: `
    @group(1) @binding(0) var myTexture : texture_2d<f32>;
    @group(1) @binding(1) var mySampler : sampler;
    
    fn srgb_to_linear(rgb: vec3<f32>) -> vec3<f32> {
      return select(
          pow((rgb + 0.055) * (1.0 / 1.055), vec3<f32>(2.4)),
          rgb * (1.0/12.92),
          rgb <= vec3<f32>(0.04045));
    }
    
    fn linear_to_srgb(rgb: vec3<f32>) -> vec3<f32> {
      return select(
          1.055 * pow(rgb, vec3(1.0 / 2.4)) - 0.055,
          rgb * 12.92,
          rgb <= vec3<f32>(0.0031308));
    }
    
    @fragment
    fn fs_main(@location(0) fragUV : vec2<f32>) -> @location(0) vec4<f32> {
        return textureSample(myTexture, mySampler, fragUV);
    }
    
    @fragment
    fn fs_main_linear_to_srgb(@location(0) fragUV : vec2<f32>) -> @location(0) vec4<f32> {
        let rgba = textureSample(myTexture, mySampler, fragUV);
        return vec4<f32>(linear_to_srgb(rgba.rgb), rgba.a);
    }
    
    @fragment
    fn fs_main_rgbe_to_linear(@location(0) fragUV : vec2<f32>) -> @location(0) vec4<f32> {
        let rgbe = textureSample(myTexture, mySampler, fragUV);
        return vec4<f32>(rgbe.rgb * exp2(rgbe.a * 255. - 128.), 1.);
    }
          `,
    },
  });

  const renderPipeline = device.createRenderPipeline({
    inputLayout: null,
    program: renderProgram,
    colorAttachmentFormats: [Format.U8_RGBA_RT],
  });
  const showResultBindings = device.createBindings({
    pipeline: renderPipeline,
    samplerBindings: [
      {
        texture: screen, // Binding = 0
        sampler, // Binding = 1
      },
    ],
  });

  return {
    pipeline: renderPipeline,
    bindings: showResultBindings,
  };
}
