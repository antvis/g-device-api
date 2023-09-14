import _gl from 'gl';
import { ResourceType, WrapMode, TexFilterMode, MipFilterMode } from '../src';
import { Device_GL } from '../src/webgl/Device';
import { Sampler_GL } from '../src/webgl/Sampler';
import { getWebGLDevice } from './utils';

let device: Device_GL;
describe('Sampler', () => {
  beforeAll(async () => {
    device = await getWebGLDevice();
  });

  afterAll(() => {
    device.destroy();
  });

  it('should create sampler correctly.', () => {
    const sampler = device.createSampler({
      wrapS: WrapMode.CLAMP,
      wrapT: WrapMode.CLAMP,
      minFilter: TexFilterMode.POINT,
      magFilter: TexFilterMode.BILINEAR,
      mipFilter: MipFilterMode.LINEAR,
      minLOD: 0,
      maxLOD: 0,
    }) as Sampler_GL;
    expect(sampler.type).toBe(ResourceType.Sampler);
    expect(sampler.descriptor.wrapS).toBe(WrapMode.CLAMP);
    expect(sampler.descriptor.wrapT).toBe(WrapMode.CLAMP);
    expect(sampler.descriptor.wrapQ).toBeUndefined();
    expect(sampler.descriptor.minFilter).toBe(TexFilterMode.POINT);
    expect(sampler.descriptor.magFilter).toBe(TexFilterMode.BILINEAR);
    expect(sampler.descriptor.mipFilter).toBe(MipFilterMode.LINEAR);
    expect(sampler.descriptor.minLOD).toBe(0);
    expect(sampler.descriptor.maxLOD).toBe(0);

    sampler.destroy();
  });

  it('should setTextureParameters correctly.', () => {
    const sampler = device.createSampler({
      wrapS: WrapMode.CLAMP,
      wrapT: WrapMode.CLAMP,
      minFilter: TexFilterMode.BILINEAR,
      magFilter: TexFilterMode.BILINEAR,
      mipFilter: MipFilterMode.LINEAR,
      minLOD: 0,
      maxLOD: 0,
      maxAnisotropy: 2,
    }) as Sampler_GL;

    sampler.setTextureParameters(0, 3, 3);
    sampler.setTextureParameters(0, 4, 4);

    sampler.destroy();
  });
});
