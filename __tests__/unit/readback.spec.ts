import _gl from 'gl';
import { BufferUsage, Format, TextureUsage } from '../../src';
import { Device_GL } from '../../src/webgl/Device';
import { Buffer_GL } from '../../src/webgl/Buffer';
import { getWebGLDevice } from '../utils';

let device: Device_GL;
describe('Readback', () => {
  beforeAll(async () => {
    device = await getWebGLDevice();
  });

  afterAll(() => {
    device.destroy();
  });

  it('should read buffer correctly.', async () => {
    const buffer = device.createBuffer({
      viewOrSize: 8,
      usage: BufferUsage.VERTEX,
    }) as Buffer_GL;

    const readback = device.createReadback();

    try {
      await readback.readBuffer(buffer);
    } catch (e) {}

    readback.destroy();
    buffer.destroy();
  });

  it('should read texture sync correctly.', () => {
    const texture = device.createTexture({
      format: Format.U8_RGBA_NORM,
      width: 1,
      height: 1,
      usage: TextureUsage.SAMPLED,
    });
    texture.setImageData([new Uint8Array([1, 2, 3, 4])]);

    const readback = device.createReadback();

    let output = new Uint8Array(4);
    // x/y 0/0
    readback.readTextureSync(texture, 0, 0, 1, 1, output);
    expect(output[0]).toBe(1);
    expect(output[1]).toBe(2);
    expect(output[2]).toBe(3);
    expect(output[3]).toBe(4);

    // x/y 1/1
    readback.readTextureSync(texture, 1, 1, 1, 1, output);
    expect(output[0]).toBe(0);
    expect(output[1]).toBe(0);
    expect(output[2]).toBe(0);
    expect(output[3]).toBe(0);

    output = new Uint8Array(8);
    readback.readTextureSync(texture, 0, 0, 1, 1, output, 4, 4);
    expect(output[0]).toBe(1);
    expect(output[1]).toBe(2);
    expect(output[2]).toBe(3);
    expect(output[3]).toBe(4);

    readback.destroy();
  });

  it('should read texture async correctly.', async () => {
    const texture = device.createTexture({
      format: Format.U8_RGBA_NORM,
      width: 1,
      height: 1,
      usage: TextureUsage.SAMPLED,
    });
    texture.setImageData([new Uint8Array([1, 2, 3, 4])]);

    const readback = device.createReadback();

    const output = new Uint8Array(4);
    await readback.readTexture(texture, 0, 0, 1, 1, output);
    expect(output[0]).toBe(1);
    expect(output[1]).toBe(2);
    expect(output[2]).toBe(3);
    expect(output[3]).toBe(4);

    readback.destroy();
  });
});
