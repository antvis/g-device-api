import _gl from 'gl';
import {
  ResourceType,
  AddressMode,
  FilterMode,
  MipmapFilterMode,
} from '../../src';
import { Device_GL } from '../../src/webgl/Device';
import { Sampler_GL } from '../../src/webgl/Sampler';
import { getWebGLDevice } from '../utils';

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
      addressModeU: AddressMode.CLAMP_TO_EDGE,
      addressModeV: AddressMode.CLAMP_TO_EDGE,
      minFilter: FilterMode.POINT,
      magFilter: FilterMode.BILINEAR,
      mipmapFilter: MipmapFilterMode.LINEAR,
      lodMinClamp: 0,
      lodMaxClamp: 0,
    }) as Sampler_GL;
    expect(sampler.type).toBe(ResourceType.Sampler);
    expect(sampler.descriptor.addressModeU).toBe(AddressMode.CLAMP_TO_EDGE);
    expect(sampler.descriptor.addressModeV).toBe(AddressMode.CLAMP_TO_EDGE);
    expect(sampler.descriptor.addressModeW).toBeUndefined();
    expect(sampler.descriptor.minFilter).toBe(FilterMode.POINT);
    expect(sampler.descriptor.magFilter).toBe(FilterMode.BILINEAR);
    expect(sampler.descriptor.mipmapFilter).toBe(MipmapFilterMode.LINEAR);
    expect(sampler.descriptor.lodMinClamp).toBe(0);
    expect(sampler.descriptor.lodMaxClamp).toBe(0);

    sampler.destroy();
  });

  it('should setTextureParameters correctly.', () => {
    const sampler = device.createSampler({
      addressModeU: AddressMode.CLAMP_TO_EDGE,
      addressModeV: AddressMode.CLAMP_TO_EDGE,
      minFilter: FilterMode.BILINEAR,
      magFilter: FilterMode.BILINEAR,
      mipmapFilter: MipmapFilterMode.LINEAR,
      lodMinClamp: 0,
      lodMaxClamp: 0,
      maxAnisotropy: 2,
    }) as Sampler_GL;

    sampler.setTextureParameters(0, 3, 3);
    sampler.setTextureParameters(0, 4, 4);

    sampler.destroy();
  });
});
