import {
  DeviceContribution,
  VertexStepMode,
  Format,
  TransparentWhite,
  Buffer,
  Bindings,
  BufferUsage,
} from '../../src';
import { initExample } from './utils';

/**
 * Use Compute Shader with WebGPU
 * @see https://webgpu.github.io/webgpu-samples/samples/computeBoids#main.ts
 */

export async function render(
  deviceContribution: DeviceContribution,
  $canvas: HTMLCanvasElement,
  useRAF = true,
) {
  // create swap chain and get device
  const swapChain = await deviceContribution.createSwapChain($canvas);
  swapChain.configureSwapChain($canvas.width, $canvas.height);
  const device = swapChain.getDevice();

  const computeProgram = device.createProgram({
    compute: {
      wgsl: `
`,
    },
  });

  const program = device.createProgram({
    compute: {
      wgsl: `
      @binding(0) @group(0) var<storage, read_write> input : array<i32>;
      @binding(1) @group(0) var<storage, read_write> output : array<i32>;
      
      @compute @workgroup_size(8, 8)
      fn main(
        @builtin(global_invocation_id) global_id : vec3<u32>
      ) {
        var index = global_id.x;
        output[index] = input[index] + output[index];
      }
      `,
    },
  });

  const inputBuffer = device.createBuffer({
    usage: BufferUsage.STORAGE | BufferUsage.COPY_SRC,
    viewOrSize: new Int32Array([1, 2, 3, 4]),
  });
  const outputBuffer = device.createBuffer({
    usage: BufferUsage.STORAGE | BufferUsage.COPY_SRC,
    viewOrSize: new Int32Array([1, 2, 3, 4]),
  });

  const pipeline = device.createComputePipeline({
    inputLayout: null,
    program,
  });
  const bindings = device.createBindings({
    pipeline,
    storageBufferBindings: [
      {
        binding: 0,
        buffer: inputBuffer,
      },
      {
        binding: 1,
        buffer: outputBuffer,
      },
    ],
  });

  const computePass = device.createComputePass();
  computePass.setPipeline(pipeline);
  computePass.setBindings(bindings);
  computePass.dispatchWorkgroups(1);
  device.submitPass(computePass);

  const readback = device.createReadback();
  const output = await readback.readBuffer(outputBuffer);
  console.log(output);

  return () => {
    program.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

export async function Add2Vectors($container: HTMLDivElement) {
  return initExample($container, render, {
    targets: ['webgpu'],
    default: 'webgpu',
  });
}
