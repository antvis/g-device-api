import _gl from 'gl';
import { ResourceType } from '../../src';
import { Device_GL } from '../../src/webgl/Device';
import { getWebGLDevice } from '../utils';
import { ComputePipeline_GL } from '../../src/webgl/ComputePipeline';
import { Program_GL } from '../../src/webgl/Program';

let device: Device_GL;
describe('ComputePipeline', () => {
  beforeAll(async () => {
    device = await getWebGLDevice();
  });

  afterAll(() => {
    device.destroy();
  });

  it('should create ComputePipeline and destroy correctly.', () => {
    const program = device.createProgram({
      compute: {
        wgsl: ``,
      },
    }) as Program_GL;

    const pipeline = device.createComputePipeline({
      inputLayout: null,
      program,
    }) as ComputePipeline_GL;
    expect(pipeline.type).toBe(ResourceType.ComputePipeline);

    pipeline.destroy();
  });
});
