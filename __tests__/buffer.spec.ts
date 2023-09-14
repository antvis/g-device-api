import _gl from 'gl';
import { BufferUsage, ResourceType, GL } from '../src';
import { Device_GL } from '../src/webgl/Device';
import { Buffer_GL } from '../src/webgl/Buffer';
import { getWebGLDevice } from './utils';

let device: Device_GL;
describe('Buffer', () => {
  beforeAll(async () => {
    device = await getWebGLDevice();
  });

  afterAll(() => {
    device.destroy();
  });

  it('should create Vertex WebGLBuffer and destroy correctly.', () => {
    const buffer = device.createBuffer({
      viewOrSize: 8,
      usage: BufferUsage.VERTEX,
    }) as Buffer_GL;
    expect(buffer.type).toBe(ResourceType.Buffer);
    expect(buffer.byteSize).toBe(8);
    expect(buffer.usage).toBe(BufferUsage.VERTEX);
    expect(buffer.gl_target).toBe(GL.ARRAY_BUFFER);
    expect(buffer.gl_buffer_pages.length).toBe(1);

    buffer.destroy();
    expect(buffer.gl_buffer_pages.length).toBe(0);
  });

  it('should create Uniform WebGLBuffer and destroy correctly.', () => {
    const buffer = device.createBuffer({
      viewOrSize: 8,
      usage: BufferUsage.UNIFORM,
    }) as Buffer_GL;
    expect(buffer.type).toBe(ResourceType.Buffer);
    expect(buffer.byteSize).toBe(8);
    expect(buffer.usage).toBe(BufferUsage.UNIFORM);
    expect(buffer.gl_target).toBe(GL.UNIFORM_BUFFER);
    expect(buffer.gl_buffer_pages.length).toBe(1);

    buffer.destroy();
    expect(buffer.gl_buffer_pages.length).toBe(0);
  });

  it('should setSubData correctly.', () => {
    const buffer = device.createBuffer({
      viewOrSize: new Float32Array([0, 0, 0, 0]),
      usage: BufferUsage.VERTEX,
    }) as Buffer_GL;

    buffer.setSubData(0, new Uint8Array(new Float32Array([1, 2, 3, 4]).buffer));
    buffer.setSubData(
      0,
      new Uint8Array(new Float32Array([1, 2, 3, 4]).buffer),
      4,
    );
    buffer.setSubData(
      0,
      new Uint8Array(new Float32Array([1, 2, 3, 4]).buffer),
      4,
      8,
    );
  });
});
