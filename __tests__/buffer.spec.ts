import {
  Device,
  BufferUsage,
  ResourceType,
  WebGLDeviceContribution,
  GL,
} from '../src';
import _gl from 'gl';
import { Buffer_GL } from '../src/webgl/Buffer';

let device: Device;
describe('Buffer', () => {
  beforeAll(async () => {
    const deviceContribution = new WebGLDeviceContribution({
      targets: ['webgl1'],
    });

    const width = 100;
    const height = 100;
    const gl = _gl(width, height, {
      antialias: false,
      preserveDrawingBuffer: true,
      stencil: true,
    });
    const mockCanvas: HTMLCanvasElement = {
      width,
      height,
      // @ts-ignore
      getContext: () => {
        // @ts-ignore
        gl.canvas = mockCanvas;
        // 模拟 DOM API，返回小程序 context，它应当和 CanvasRenderingContext2D 一致
        // @see https://developer.mozilla.org/zh-CN/docs/Web/API/HTMLCanvasElement/getContext
        return gl;
      },
    };
    // create swap chain and get device
    const swapChain = await deviceContribution.createSwapChain(mockCanvas);
    swapChain.configureSwapChain(width, height);
    device = swapChain.getDevice();
  });

  afterAll(() => {
    device.destroy();
  });

  it('should create Vertex WebGLBuffer correctly.', () => {
    const buffer = device.createBuffer({
      viewOrSize: 8,
      usage: BufferUsage.VERTEX,
    }) as Buffer_GL;
    expect(buffer.type).toBe(ResourceType.Buffer);
    expect(buffer.byteSize).toBe(8);
    expect(buffer.gl_target).toBe(GL.ARRAY_BUFFER);
    expect(buffer.gl_buffer_pages.length).toBe(1);
  });
});
