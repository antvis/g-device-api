import { Graph } from '@antv/graphlib';
import { DeviceContribution, BufferUsage } from '../../src';
import { convertGraphData2CSC } from '../utils/graph';

const simpleDataset = {
  nodes: [
    {
      id: 'A',
    },
    {
      id: 'B',
    },
    {
      id: 'C',
    },
    {
      id: 'D',
    },
    {
      id: 'E',
    },
    {
      id: 'F',
    },
    {
      id: 'G',
    },
    {
      id: 'H',
    },
    {
      id: 'I',
    },
    {
      id: 'J',
    },
    {
      id: 'K',
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'D',
      target: 'A',
    },
    {
      id: 'e2',
      source: 'D',
      target: 'B',
    },
    {
      id: 'e3',
      source: 'B',
      target: 'C',
    },
    {
      id: 'e4',
      source: 'C',
      target: 'B',
    },
    {
      id: 'e5',
      source: 'F',
      target: 'B',
    },
    {
      id: 'e6',
      source: 'F',
      target: 'E',
    },
    {
      id: 'e7',
      source: 'E',
      target: 'F',
    },
    {
      id: 'e8',
      source: 'E',
      target: 'D',
    },
    {
      id: 'e9',
      source: 'E',
      target: 'B',
    },
    {
      id: 'e10',
      source: 'K',
      target: 'E',
    },
    {
      id: 'e11',
      source: 'J',
      target: 'E',
    },
    {
      id: 'e12',
      source: 'I',
      target: 'E',
    },
    {
      id: 'e13',
      source: 'H',
      target: 'E',
    },
    {
      id: 'e14',
      source: 'G',
      target: 'E',
    },
    {
      id: 'e15',
      source: 'G',
      target: 'B',
    },
    {
      id: 'e16',
      source: 'H',
      target: 'B',
    },
    {
      id: 'e17',
      source: 'I',
      target: 'B',
    },
  ],
};

export async function render(
  deviceContribution: DeviceContribution,
  $canvas: HTMLCanvasElement,
  useRAF = true,
) {
  // create swap chain and get device
  const swapChain = await deviceContribution.createSwapChain($canvas);
  swapChain.configureSwapChain($canvas.width, $canvas.height);
  const device = swapChain.getDevice();

  const tolerance = 1e-5;
  const alpha = 0.85;
  let maxIterations = 1000;

  const BLOCK_SIZE = 1;
  const BLOCKS = 256;

  // @ts-ignore
  const { V, From, To } = convertGraphData2CSC(new Graph(simpleDataset));

  const n = V.length;
  const graph = new Float32Array(new Array(n * n).fill((1 - alpha) / n));
  const r = new Float32Array(new Array(n).fill(1 / n));

  From.forEach((from, i) => {
    graph[To[i] * n + from] += alpha * 1.0;
  });

  for (let j = 0; j < n; j++) {
    let sum = 0.0;

    for (let i = 0; i < n; ++i) {
      sum += graph[i * n + j];
    }

    for (let i = 0; i < n; ++i) {
      if (sum != 0.0) {
        graph[i * n + j] /= sum;
      } else {
        graph[i * n + j] = 1 / n;
      }
    }
  }

  const rBuffer = device.createBuffer({
    usage: BufferUsage.STORAGE | BufferUsage.COPY_SRC,
    viewOrSize: new Float32Array(r),
  });
  const rLastBuffer = device.createBuffer({
    usage: BufferUsage.STORAGE | BufferUsage.COPY_SRC,
    viewOrSize: new Float32Array(n),
  });
  const graphBuffer = device.createBuffer({
    usage: BufferUsage.STORAGE,
    viewOrSize: new Float32Array(graph),
  });
  const readback = device.createReadback();

  const storeProgram = device.createProgram({
    compute: {
      wgsl: `
struct Buffer {
  data: array<f32>,
};

@group(2) @binding(0) var<storage, read> r : Buffer;
@group(2) @binding(1) var<storage, read_write> r_last : Buffer;

@compute @workgroup_size(${BLOCKS}, ${BLOCK_SIZE})
fn main(
  @builtin(global_invocation_id) global_id : vec3<u32>
) {
  var index = global_id.x;
  if (index < ${V.length}u) {
    r_last.data[index] = r.data[index];
  }
}
`,
    },
  });

  const matmulProgram = device.createProgram({
    compute: {
      wgsl: `
struct Buffer {
  data: array<f32>,
};

@group(2) @binding(0) var<storage, read> graph : Buffer;
@group(2) @binding(1) var<storage, read_write> r : Buffer;
@group(2) @binding(2) var<storage, read> r_last : Buffer;

@compute @workgroup_size(${BLOCKS}, ${BLOCK_SIZE})
fn main(
  @builtin(global_invocation_id) global_id : vec3<u32>
) {
  var index = global_id.x;
  if (index < ${V.length}u) {
    var sum = 0.0;
    for (var i = 0u; i < ${V.length}u; i = i + 1u) {
      sum = sum + r_last.data[i] * graph.data[index * ${V.length}u + i];
    }
    r.data[index] = sum;
  }
}  
  `,
    },
  });

  const rankDiffProgram = device.createProgram({
    compute: {
      wgsl: `
struct Buffer {
  data: array<f32>,
};

@group(2) @binding(0) var<storage, read> r : Buffer;
@group(2) @binding(1) var<storage, read_write> r_last : Buffer;

@compute @workgroup_size(${BLOCKS}, ${BLOCK_SIZE})
fn main(
  @builtin(global_invocation_id) global_id : vec3<u32>
) {
  var index = global_id.x;
  if (index < ${V.length}u) {
    r_last.data[index] = abs(r_last.data[index] - r.data[index]);
  }
}
  `,
    },
  });

  const storePipeline = device.createComputePipeline({
    inputLayout: null,
    program: storeProgram,
  });
  const matmulPipeline = device.createComputePipeline({
    inputLayout: null,
    program: matmulProgram,
  });
  const rankDiffPipeline = device.createComputePipeline({
    inputLayout: null,
    program: rankDiffProgram,
  });

  const storeBindings = device.createBindings({
    pipeline: storePipeline,
    storageBufferBindings: [
      {
        buffer: rBuffer,
      },
      {
        buffer: rLastBuffer,
      },
    ],
  });
  const matmulBindings = device.createBindings({
    pipeline: matmulPipeline,
    storageBufferBindings: [
      {
        buffer: graphBuffer,
      },
      {
        buffer: rBuffer,
      },
      {
        buffer: rLastBuffer,
      },
    ],
  });
  const rankDiffBindings = device.createBindings({
    pipeline: rankDiffPipeline,
    storageBufferBindings: [
      {
        buffer: rBuffer,
      },
      {
        buffer: rLastBuffer,
      },
    ],
  });

  const grids = Math.ceil(V.length / (BLOCKS * BLOCK_SIZE));

  const computePass = device.createComputePass();
  while (maxIterations--) {
    computePass.setPipeline(storePipeline);
    computePass.setBindings(storeBindings);
    computePass.dispatchWorkgroups(grids);

    computePass.setPipeline(matmulPipeline);
    computePass.setBindings(matmulBindings);
    computePass.dispatchWorkgroups(grids);

    computePass.setPipeline(rankDiffPipeline);
    computePass.setBindings(rankDiffBindings);
    computePass.dispatchWorkgroups(grids);

    const last = (await readback.readBuffer(
      rLastBuffer,
      0,
      new Float32Array(n),
    )) as Float32Array;
    const result = last.reduce((prev, cur) => prev + cur, 0);
    if (result < tolerance) {
      break;
    }
  }

  device.submitPass(computePass);

  const out = (await readback.readBuffer(
    rBuffer,
    0,
    new Float32Array(r),
  )) as Float32Array;
  console.log(out);

  return () => {
    storeProgram.destroy();
    storePipeline.destroy();
    matmulProgram.destroy();
    matmulPipeline.destroy();
    rankDiffProgram.destroy();
    rankDiffPipeline.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

render.params = {
  targets: ['webgpu'],
  default: 'webgpu',
};
