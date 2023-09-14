import _gl from 'gl';
import {
  ResourceType,
  WrapMode,
  TexFilterMode,
  MipFilterMode,
  Format,
  TextureUsage,
} from '../src';
import { Device_GL } from '../src/webgl/Device';
import { Sampler_GL } from '../src/webgl/Sampler';
import { getWebGLDevice } from './utils';
import { RenderTarget_GL } from '../src/webgl/RenderTarget';

let device: Device_GL;
describe('RenderTarget', () => {
  beforeAll(async () => {
    device = await getWebGLDevice();
  });

  afterAll(() => {
    device.destroy();
  });

  it('should create RenderTarget correctly.', () => {
    const renderTarget = device.createRenderTarget({
      pixelFormat: Format.U8_RGBA_RT,
      width: 100,
      height: 100,
    }) as RenderTarget_GL;
    device.setResourceName(renderTarget, 'Main Render Target');
    expect(renderTarget.pixelFormat).toBe(Format.U8_RGBA_RT);
    expect(renderTarget.width).toBe(100);
    expect(renderTarget.height).toBe(100);
    expect(renderTarget.texture).toBeNull();

    renderTarget.destroy();
  });

  it('should create Depth RenderTarget correctly.', () => {
    let renderTarget = device.createRenderTargetFromTexture(
      device.createTexture({
        pixelFormat: Format.D32F,
        width: 100,
        height: 100,
        usage: TextureUsage.RENDER_TARGET,
      }),
    ) as RenderTarget_GL;
    expect(renderTarget.pixelFormat).toBe(Format.D32F);
    expect(renderTarget.width).toBe(100);
    expect(renderTarget.height).toBe(100);
    expect(renderTarget.texture).toBeNull();
    renderTarget.destroy();

    renderTarget = renderTarget = device.createRenderTargetFromTexture(
      device.createTexture({
        pixelFormat: Format.D24_S8,
        width: 100,
        height: 100,
        usage: TextureUsage.RENDER_TARGET,
      }),
    ) as RenderTarget_GL;
    expect(renderTarget.pixelFormat).toBe(Format.D24_S8);
    expect(renderTarget.width).toBe(100);
    expect(renderTarget.height).toBe(100);
    expect(renderTarget.texture).toBeNull();
    renderTarget.destroy();
  });
});
