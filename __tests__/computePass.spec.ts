import _gl from 'gl';
import { BufferUsage, ResourceType } from '../src';
import { Device_GL } from '../src/webgl/Device';
import { getWebGLDevice } from './utils';
import { ComputePipeline_GL } from '../src/webgl/ComputePipeline';
import { Program_GL } from '../src/webgl/Program';
import { Buffer_GL } from '../src/webgl/Buffer';
import { Bindings_GL } from '../src/webgl/Bindings';

let device: Device_GL;
describe('ComputePass', () => {
  beforeAll(async () => {
    device = await getWebGLDevice();
  });

  afterAll(() => {
    device.destroy();
  });

  it('should create ComputePass and destroy correctly.', () => {
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

    const bindings = device.createBindings({
      pipeline,
    }) as Bindings_GL;

    const computePass = device.createComputePass();
    computePass.setBindings(bindings);
    computePass.setBindings(bindings, [0]);
    computePass.setPipeline(pipeline);
    computePass.dispatchWorkgroups(1, 1, 1);
    const buffer = device.createBuffer({
      viewOrSize: 8,
      usage: BufferUsage.VERTEX,
    }) as Buffer_GL;
    computePass.dispatchWorkgroupsIndirect(buffer, 0);

    computePass.pushDebugGroup('test');
    computePass.popDebugGroup();
    computePass.insertDebugMarker('test');

    pipeline.destroy();
  });
});
