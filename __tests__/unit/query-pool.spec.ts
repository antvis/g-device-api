import _gl from 'gl';
import { QueryPoolType } from '../../src';
import { Device_GL } from '../../src/webgl/Device';
import { getWebGLDevice } from '../utils';
import { QueryPool_GL } from '../../src/webgl/QueryPool';

let device: Device_GL;
describe('QueryPool', () => {
  beforeAll(async () => {
    device = await getWebGLDevice();
  });

  afterAll(() => {
    device.destroy();
  });

  it('should create QueryPool correctly.', () => {
    const queryPool = device.createQueryPool(
      QueryPoolType.OcclusionConservative,
      0,
    ) as QueryPool_GL;

    expect(queryPool.queryResultOcclusion(0)).toBeNull();
    queryPool.destroy();
  });
});
