import _gl from 'gl';
import { Device_GL } from '../src/webgl/Device';
import { WebGLDeviceContribution } from '../src';

export async function getWebGLDevice() {
  const deviceContribution = new WebGLDeviceContribution({
    targets: ['webgl1'],
  });

  const width = 100;
  const height = 100;
  let gl = _gl(width, height, {
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
  return swapChain.getDevice() as Device_GL;
}
