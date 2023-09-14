import _gl from 'gl';
import { Device_GL } from '../src/webgl/Device';
import { Program_GL } from '../src/webgl/Program';
import { getWebGLDevice } from './utils';
import { Format, TextureUsage } from '../src';

let device: Device_GL;
describe('Program', () => {
  beforeAll(async () => {
    device = await getWebGLDevice();
  });

  afterAll(() => {
    device.destroy();
  });

  it('should create program correctly.', async () => {
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

    expect(program.gl_program).toBeTruthy();
    expect(program.gl_shader_vert).toBeTruthy();
    expect(program.gl_shader_frag).toBeTruthy();

    // Attributes
    expect(program.attributes.length).toBe(1);
    expect(program.attributes[0].name).toBe('a_Position');
    expect(program.attributes[0].location).toBe(0);
    expect(program.attributes[0].type).toBe(35665);
    expect(program.attributes[0].size).toBe(1);

    // Uniform
    const uniforms = Object.keys(program.uniformSetters);
    expect(uniforms.length).toBe(1);
    expect(uniforms[0]).toBe('u_ModelViewProjectionMatrix');

    program.destroy();
  });

  it('should setUniformsLegacy correctly.', async () => {
    const program = device.createProgram({
      vertex: {
        glsl: `
layout(std140) uniform Uniforms {
  mat4 u_ModelViewProjectionMatrix;
  vec4 u_Array[2];
  vec4 u_Unused;
};

layout(location = 0) in vec3 a_Position;

out vec4 v_Position;

void main() {
  v_Position = vec4(a_Position, 1.0) + u_Array[0] + u_Array[1];
  gl_Position = u_ModelViewProjectionMatrix * vec4(a_Position, 1.0);
}
`,
      },
      fragment: {
        glsl: `
uniform sampler2D u_Texture;
in vec4 v_Position;
out vec4 outputColor;

void main() {
  outputColor = texture(SAMPLER_2D(u_Texture), vec2(1.0));
  outputColor = v_Position;
}
`,
      },
    }) as Program_GL;

    // Uniform
    const uniforms = Object.keys(program.uniformSetters);
    expect(uniforms.length).toBe(5);
    expect(uniforms[0]).toBe('u_ModelViewProjectionMatrix');
    expect(uniforms[1]).toBe('u_Array');
    expect(uniforms[2]).toBe('u_Array[0]');
    expect(uniforms[3]).toBe('u_Array[1]');
    expect(uniforms[4]).toBe('u_Texture');

    // Empty
    program.setUniformsLegacy();

    // Set one uniform.
    program.setUniformsLegacy({
      u_ModelViewProjectionMatrix: new Float32Array(16),
    });

    // Set multiple uniforms once.
    const texture = device.createTexture({
      pixelFormat: Format.U8_RGBA_NORM,
      width: 1,
      height: 1,
      usage: TextureUsage.SAMPLED,
    });
    program.setUniformsLegacy({
      u_ModelViewProjectionMatrix: new Float32Array(16),
      u_Text: new Float32Array(4),
      u_Texture: texture,
    });

    texture.destroy();
    program.destroy();
  });
});
