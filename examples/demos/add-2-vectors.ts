import { DeviceContribution, BufferUsage } from '../../src';

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

  const program = device.createProgram({
    compute: {
      wgsl: `
      @binding(0) @group(2) var<storage, read_write> input : array<i32>;
      @binding(1) @group(2) var<storage, read_write> output : array<i32>;
      
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

  device.beginFrame();
  const computePass = device.createComputePass();
  computePass.setPipeline(pipeline);
  computePass.setBindings(bindings);
  computePass.dispatchWorkgroups(1);
  device.submitPass(computePass);
  device.endFrame();

  const readback = device.createReadback();
  const output = (await readback.readBuffer(
    outputBuffer,
    0,
    new Int32Array(4),
  )) as Int32Array;
  console.log(output);

  return () => {
    program.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

render.params = {
  targets: ['webgpu'],
  default: 'webgpu',
};
