import _gl from 'gl';
import {
  getDefines,
  getUniforms,
  preprocessShader_GLSL,
} from '../../src/shader';
import { ClipSpaceNearZ, ViewportOrigin } from '../../src';
import { findall } from '../../src/webgl/utils';
import { UNIFROM_BLOCK_REGEXP } from '../../src/webgl/Device';

const WebGL1VendorInfo = {
  platformString: 'WebGL1',
  glslVersion: '#version 100',
  explicitBindingLocations: false,
  separateSamplerTextures: false,
  viewportOrigin: ViewportOrigin.LOWER_LEFT,
  clipSpaceNearZ: ClipSpaceNearZ.NEGATIVE_ONE,
  supportMRT: false,
};

const WebGL2VendorInfo = {
  platformString: 'WebGL2',
  glslVersion: '#version 300',
  explicitBindingLocations: false,
  separateSamplerTextures: false,
  viewportOrigin: ViewportOrigin.LOWER_LEFT,
  clipSpaceNearZ: ClipSpaceNearZ.NEGATIVE_ONE,
  supportMRT: false,
};

const WebGPUVendorInfo = {
  platformString: 'WebGPU',
  glslVersion: '#version 440',
  explicitBindingLocations: true,
  separateSamplerTextures: true,
  viewportOrigin: ViewportOrigin.UPPER_LEFT,
  clipSpaceNearZ: ClipSpaceNearZ.ZERO,
  supportMRT: true,
};

const glsl100Vert = `
attribute vec2 a_Position;
void main() {
  gl_Position = vec4(a_Position, 0.0, 1.0);
  gl_PointSize = 10.0;
}`;
const glsl100Frag = `
in vec4 v_Color;
void main() {
  gl_FragColor = v_Color;
}`;

const simpleVert = `
layout(location = 0) in vec2 a_Position;
void main() {
  gl_Position = vec4(a_Position, 0.0, 1.0);
  gl_PointSize = 10.0;
}`;
const simpleFrag = `
out vec4 outputColor;
void main() {
  outputColor = vec4(1.0, 0.0, 0.0, 1.0);
}`;
const sampler2DFrag = `
uniform sampler2D u_Texture;
in vec2 v_Uv;
out vec4 outputColor;

void main() {
  outputColor = texture(SAMPLER_2D(u_Texture), v_Uv);
}`;
const samplerCubeFrag = `
uniform samplerCube u_Texture;
in vec2 v_Uv;
in vec4 v_Position;
out vec4 outputColor;

void main() {
  vec3 cubemapVec = v_Position.xyz - vec3(0.5);
  outputColor = texture(SAMPLER_Cube(u_Texture), cubemapVec);
}`;

const uniformVert = `
layout(std140) uniform commonUniforms {
  vec3 u_blur_height_fixed;
  float u_stroke_width;
  float u_additive;
  float u_stroke_opacity;
  float u_size_unit;
};

layout(location = 0) in vec2 a_Position;

void main() {
  gl_Position = vec4(a_Position, 0.0, 1.0);
  gl_PointSize = 10.0;
}`;

const compatibleUniformVert = `
layout(std140) uniform commonUniforms1
{
  vec3 u_blur_height_fixed;
};
layout(std140) uniform commonUniforms2{ // space can be ignored
  vec3 u_blur_height_fixed;
  float u_stroke_width;
  float u_additive;
  float u_stroke_opacity;
  float u_size_unit;
};

layout(location = 0) in vec2 a_Position;

void main() {
  gl_Position = vec4(a_Position, 0.0, 1.0);
  gl_PointSize = 10.0;
}`;

describe('Shader Compiler', () => {
  it('should compile raw GLSL 100 vert correctly.', () => {
    const vert = preprocessShader_GLSL(WebGL1VendorInfo, 'vert', glsl100Vert);

    expect(vert).toBe(`precision mediump float;

attribute vec2 a_Position;
void main() {
  gl_Position = vec4(a_Position, 0.0, 1.0);
  gl_PointSize = 10.0;
}`);
  });
  it('should compile raw GLSL 100 frag correctly.', () => {
    const frag = preprocessShader_GLSL(WebGL1VendorInfo, 'frag', glsl100Frag);

    expect(frag).toBe(`#extension GL_OES_standard_derivatives : enable
precision mediump float;
varying vec4 v_Color;

void main() {
  gl_FragColor = v_Color;
}`);
  });

  it('should compile GLSL 100 vert correctly.', () => {
    const vert = preprocessShader_GLSL(WebGL1VendorInfo, 'vert', simpleVert);

    expect(vert).toBe(`precision mediump float;
attribute vec2 a_Position;

void main() {
  gl_Position = vec4(a_Position, 0.0, 1.0);
  gl_PointSize = 10.0;
}`);
  });

  it('should compile GLSL 100 vert without precision correctly.', () => {
    const vert = preprocessShader_GLSL(
      WebGL1VendorInfo,
      'vert',
      simpleVert,
      null,
      false,
    );

    expect(vert).toBe(`attribute vec2 a_Position;

void main() {
  gl_Position = vec4(a_Position, 0.0, 1.0);
  gl_PointSize = 10.0;
}`);
  });

  it('should compile GLSL 300 vert correctly.', () => {
    const vert = preprocessShader_GLSL(WebGL2VendorInfo, 'vert', simpleVert);

    expect(vert).toBe(`#version 300

precision mediump float;

layout(location = 0) in vec2 a_Position;
void main() {
  gl_Position = vec4(a_Position, 0.0, 1.0);
  gl_PointSize = 10.0;
}`);
  });

  it('should compile GLSL 440 vert correctly.', () => {
    const vert = preprocessShader_GLSL(WebGPUVendorInfo, 'vert', simpleVert);

    expect(vert).toBe(`#version 440

precision mediump float;
#define VIEWPORT_ORIGIN_TL 1
#define CLIPSPACE_NEAR_ZERO 1
#define gl_VertexID gl_VertexIndex
#define gl_InstanceID gl_InstanceIndex

layout(location = 0) in vec2 a_Position;
void main() {
  gl_Position = vec4(a_Position, 0.0, 1.0);
  gl_PointSize = 10.0;
}`);
  });

  it('should compile GLSL 100 frag correctly.', () => {
    const frag = preprocessShader_GLSL(WebGL1VendorInfo, 'frag', simpleFrag);
    expect(frag).toBe(`#extension GL_OES_standard_derivatives : enable
precision mediump float;
vec4 outputColor;

void main() {
  outputColor = vec4(1.0, 0.0, 0.0, 1.0);

  gl_FragColor = vec4(outputColor);
}`);
  });

  it('should compile GLSL 300 frag correctly.', () => {
    const frag = preprocessShader_GLSL(WebGL2VendorInfo, 'frag', simpleFrag);
    expect(frag).toBe(`#version 300

precision mediump float;

out vec4 outputColor;
void main() {
  outputColor = vec4(1.0, 0.0, 0.0, 1.0);
}`);
  });

  it('should compile GLSL 440 frag correctly.', () => {
    const frag = preprocessShader_GLSL(WebGPUVendorInfo, 'frag', simpleFrag);
    expect(frag).toBe(`#version 440

precision mediump float;
#define VIEWPORT_ORIGIN_TL 1
#define CLIPSPACE_NEAR_ZERO 1
#define gl_VertexID gl_VertexIndex
#define gl_InstanceID gl_InstanceIndex

out vec4 outputColor;
void main() {
  outputColor = vec4(1.0, 0.0, 0.0, 1.0);
}`);
  });

  it('should compile GLSL with defines correctly.', () => {
    const vert = preprocessShader_GLSL(WebGL1VendorInfo, 'vert', simpleVert, {
      DEFINE_TEST1: '1',
    });

    expect(vert).toBe(`precision mediump float;
#define DEFINE_TEST1 1
attribute vec2 a_Position;

void main() {
  gl_Position = vec4(a_Position, 0.0, 1.0);
  gl_PointSize = 10.0;
}`);
  });

  it('should compile GLSL with precision correctly.', () => {
    const vert = preprocessShader_GLSL(
      WebGL1VendorInfo,
      'vert',
      'precision mediump float;' + simpleVert,
    );

    expect(vert).toBe(`precision mediump float;
attribute vec2 a_Position;

void main() {
  gl_Position = vec4(a_Position, 0.0, 1.0);
  gl_PointSize = 10.0;
}`);
  });

  it('should compile GLSL 100 with sampler2D correctly.', () => {
    const vert = preprocessShader_GLSL(WebGL1VendorInfo, 'frag', sampler2DFrag);

    expect(vert).toBe(`#extension GL_OES_standard_derivatives : enable
precision mediump float;

uniform sampler2D u_Texture; // BINDING=0
varying vec2 v_Uv;
vec4 outputColor;

void main() {
  outputColor = texture2D(u_Texture, v_Uv);

  gl_FragColor = vec4(outputColor);
}`);
  });

  it('should compile GLSL 300 with sampler2D correctly.', () => {
    const vert = preprocessShader_GLSL(WebGL2VendorInfo, 'frag', sampler2DFrag);

    expect(vert).toBe(`#version 300

precision mediump float;

uniform sampler2D u_Texture; // BINDING=0
in vec2 v_Uv;
out vec4 outputColor;
void main() {
  outputColor = texture(u_Texture, v_Uv);
}`);
  });

  it('should compile GLSL 440 with sampler2D correctly.', () => {
    const vert = preprocessShader_GLSL(WebGPUVendorInfo, 'frag', sampler2DFrag);

    expect(vert).toBe(`#version 440

precision mediump float;
#define VIEWPORT_ORIGIN_TL 1
#define CLIPSPACE_NEAR_ZERO 1
#define gl_VertexID gl_VertexIndex
#define gl_InstanceID gl_InstanceIndex

layout(set = 1, binding = 0) uniform texture2D T_u_Texture;
layout(set = 1, binding = 1) uniform sampler S_u_Texture;
layout(location = 0) in vec2 v_Uv;
out vec4 outputColor;
void main() {
  outputColor = texture(sampler2D(T_u_Texture, S_u_Texture), v_Uv);
}`);
  });

  it('should compile GLSL 100 with samplerCube correctly.', () => {
    const vert = preprocessShader_GLSL(
      WebGL1VendorInfo,
      'frag',
      samplerCubeFrag,
    );

    expect(vert).toBe(`#extension GL_OES_standard_derivatives : enable
precision mediump float;

uniform samplerCube u_Texture; // BINDING=0
varying vec2 v_Uv;

varying vec4 v_Position;
vec4 outputColor;

void main() {
  vec3 cubemapVec = v_Position.xyz - vec3(0.5);
  outputColor = textureCube(u_Texture, cubemapVec);

  gl_FragColor = vec4(outputColor);
}`);
  });

  it('should compile GLSL 300 with samplerCube correctly.', () => {
    const vert = preprocessShader_GLSL(
      WebGL2VendorInfo,
      'frag',
      samplerCubeFrag,
    );

    expect(vert).toBe(`#version 300

precision mediump float;

uniform samplerCube u_Texture; // BINDING=0
in vec2 v_Uv;
in vec4 v_Position;
out vec4 outputColor;
void main() {
  vec3 cubemapVec = v_Position.xyz - vec3(0.5);
  outputColor = texture(u_Texture, cubemapVec);
}`);
  });

  it('should compile GLSL 440 with samplerCube correctly.', () => {
    const vert = preprocessShader_GLSL(
      WebGPUVendorInfo,
      'frag',
      samplerCubeFrag,
    );

    expect(vert).toBe(`#version 440

precision mediump float;
#define VIEWPORT_ORIGIN_TL 1
#define CLIPSPACE_NEAR_ZERO 1
#define gl_VertexID gl_VertexIndex
#define gl_InstanceID gl_InstanceIndex

layout(set = 1, binding = 0) uniform textureCube T_u_Texture;
layout(set = 1, binding = 1) uniform sampler S_u_Texture;
layout(location = 0) in vec2 v_Uv;
layout(location = 1) in vec4 v_Position;
out vec4 outputColor;
void main() {
  vec3 cubemapVec = v_Position.xyz - vec3(0.5);
  outputColor = texture(samplerCube(T_u_Texture, S_u_Texture), cubemapVec);
}`);
  });

  it('should compile GLSL 100 with uniforms correctly.', () => {
    const vert = preprocessShader_GLSL(WebGL1VendorInfo, 'vert', uniformVert);

    expect(vert).toBe(`precision mediump float;
uniform vec3 u_blur_height_fixed;
uniform float u_stroke_width;
uniform float u_additive;
uniform float u_stroke_opacity;
uniform float u_size_unit;
attribute vec2 a_Position;

void main() {
  gl_Position = vec4(a_Position, 0.0, 1.0);
  gl_PointSize = 10.0;
}`);

    let uniformBlocks = findall(uniformVert, UNIFROM_BLOCK_REGEXP);
    expect(uniformBlocks.length).toBe(1);

    uniformBlocks = findall(compatibleUniformVert, UNIFROM_BLOCK_REGEXP);
    expect(uniformBlocks.length).toBe(2);
    expect(uniformBlocks[0][1]).toBe('commonUniforms1');
    expect(uniformBlocks[1][1]).toBe('commonUniforms2');
  });

  it('should getDefines correctly.', () => {
    const defines = getDefines(`#define NUM1 1
#define NUM2 2
#define BOOL true
#define STR test`);
    expect(defines).toEqual({
      NUM1: 1,
      NUM2: 2,
      BOOL: 'true',
      STR: 'test',
    });
  });

  it('should getUniforms correctly.', () => {
    const uniforms = getUniforms(`
struct DirectionalLight {
  vec3 direction;
  float intensity;
  vec3 color;
};

layout(std140) uniform ub_ObjectParams {
  mat4 u_ModelMatrix;
  vec4 u_Color;
  vec4 u_StrokeColor;
  DirectionalLight directionalLight;
  #ifdef NUM_DIR_LIGHTS
  DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
  #endif
}
`);
    expect(uniforms).toEqual([
      'u_ModelMatrix',
      'u_Color',
      'u_StrokeColor',
      'directionalLight.direction',
      'directionalLight.intensity',
      'directionalLight.color',
      'directionalLight',
      'directionalLights[0].direction',
      'directionalLights[0].intensity',
      'directionalLights[0].color',
      'directionalLights[1].direction',
      'directionalLights[1].intensity',
      'directionalLights[1].color',
      'directionalLights[2].direction',
      'directionalLights[2].intensity',
      'directionalLights[2].color',
      'directionalLights[3].direction',
      'directionalLights[3].intensity',
      'directionalLights[3].color',
      'directionalLights[4].direction',
      'directionalLights[4].intensity',
      'directionalLights[4].color',
      'directionalLights',
    ]);
  });

  it('compile to GLSL 440', () => {
    let set = 0,
      implicitBinding = 0,
      location = 0;

    const rest = `
layout(std140) uniform AttributeUniforms {
  vec4 u_stroke;
};

  layout(std140) uniform CommonUniforms {
vec3 u_blur_height_fixed;
};
`.replace(
      /^\s*(layout\((.*)\))?\s*uniform(.+{)$/gm,
      (substr, cap, layout, rest) => {
        const layout2 = layout ? `${layout}, ` : ``;
        return `layout(${layout2}set = ${set}, binding = ${implicitBinding++}) uniform ${rest}`;
      },
    );

    expect(rest)
      .toEqual(`layout(std140, set = 0, binding = 0) uniform  AttributeUniforms {
  vec4 u_stroke;
};
layout(std140, set = 0, binding = 1) uniform  CommonUniforms {
vec3 u_blur_height_fixed;
};
`);
  });

  it('should separate sampler textures correctly.', () => {
    const raw = `uniform sampler2D u_Texture;
in vec2 v_TexCoord;

out vec4 outputColor;

vec4 FXAA(PD_SAMPLER_2D(t_Texture), in vec2 t_PixelCenter, in vec2 t_InvResolution) {
  float lumaNW = MonochromeNTSC(texture(PU_SAMPLER_2D(t_Texture), t_PixelTopLeft.xy)             .rgb);
  return rgbOutput;
}

void main() {
  outputColor = FXAA(PP_SAMPLER_2D(u_Texture), v_TexCoord.xy, u_InvResolution.xy);
}`;
    const glsl100 = preprocessShader_GLSL(WebGL1VendorInfo, 'frag', raw);
    expect(glsl100).toEqual(`#extension GL_OES_standard_derivatives : enable
precision mediump float;

uniform sampler2D u_Texture; // BINDING=0
varying vec2 v_TexCoord;
vec4 outputColor;

vec4 FXAA(sampler2D P_t_Texture, in vec2 t_PixelCenter, in vec2 t_InvResolution) {
  float lumaNW = MonochromeNTSC(texture2D(P_t_Texture, t_PixelTopLeft.xy)             .rgb);
  return rgbOutput;
}
void main() {
  outputColor = FXAA(u_Texture, v_TexCoord.xy, u_InvResolution.xy);

  gl_FragColor = vec4(outputColor);
}`);

    const glsl300 = preprocessShader_GLSL(WebGL2VendorInfo, 'frag', raw);
    expect(glsl300).toEqual(`#version 300

precision mediump float;

uniform sampler2D u_Texture; // BINDING=0
in vec2 v_TexCoord;
out vec4 outputColor;
vec4 FXAA(sampler2D P_t_Texture, in vec2 t_PixelCenter, in vec2 t_InvResolution) {
  float lumaNW = MonochromeNTSC(texture(P_t_Texture, t_PixelTopLeft.xy)             .rgb);
  return rgbOutput;
}
void main() {
  outputColor = FXAA(u_Texture, v_TexCoord.xy, u_InvResolution.xy);
}`);

    const glsl440 = preprocessShader_GLSL(WebGPUVendorInfo, 'frag', raw);
    expect(glsl440).toEqual(`#version 440

precision mediump float;
#define VIEWPORT_ORIGIN_TL 1
#define CLIPSPACE_NEAR_ZERO 1
#define gl_VertexID gl_VertexIndex
#define gl_InstanceID gl_InstanceIndex

layout(set = 1, binding = 0) uniform texture2D T_u_Texture;
layout(set = 1, binding = 1) uniform sampler S_u_Texture;
layout(location = 0) in vec2 v_TexCoord;
out vec4 outputColor;
vec4 FXAA(texture2D T_P_t_Texture, sampler S_P_t_Texture, in vec2 t_PixelCenter, in vec2 t_InvResolution) {
  float lumaNW = MonochromeNTSC(texture(sampler2D(T_P_t_Texture, S_P_t_Texture), t_PixelTopLeft.xy)             .rgb);
  return rgbOutput;
}
void main() {
  outputColor = FXAA(T_u_Texture, S_u_Texture, v_TexCoord.xy, u_InvResolution.xy);
}`);
  });
});
