import { DeviceContribution, Format, TextureUsage } from '../../src';

const width = 1000;
const height = 1000;

export async function render(
  deviceContribution: DeviceContribution,
  $canvas: HTMLCanvasElement,
  useRAF = true,
) {
  // create swap chain and get device
  const swapChain = (await deviceContribution.createSwapChain($canvas))!;
  swapChain.configureSwapChain($canvas.width, $canvas.height);
  const device = swapChain.getDevice();

  const floatR = device.createTexture({
    format: Format.F32_R,
    width: 1,
    height: 1,
    usage: TextureUsage.SAMPLED,
  });
  floatR.setImageData([new Float32Array([10.25])]);

  const floatRG = device.createTexture({
    format: Format.F32_RG,
    width: 1,
    height: 1,
    usage: TextureUsage.SAMPLED,
  });
  floatRG.setImageData([new Float32Array([10, 20])]);

  const floatRGB = device.createTexture({
    format: Format.F32_RGB,
    width: 1,
    height: 1,
    usage: TextureUsage.SAMPLED,
  });
  floatRGB.setImageData([new Float32Array([10, 20, 30])]);

  const floatRGBA = device.createTexture({
    format: Format.F32_RGBA,
    width: 1,
    height: 1,
    usage: TextureUsage.SAMPLED,
  });
  floatRGBA.setImageData([new Float32Array([10, 20, 30, 40])]);

  const floatR2x2 = device.createTexture({
    format: Format.F32_R,
    width: 2,
    height: 2,
    usage: TextureUsage.SAMPLED,
  });
  floatR2x2.setImageData([new Float32Array([10, 20, 30, 40])]);

  const floatRGBA2x2 = device.createTexture({
    format: Format.F32_RGBA,
    width: 2,
    height: 2,
    usage: TextureUsage.SAMPLED,
  });
  floatRGBA2x2.setImageData([
    new Float32Array([
      10, 20, 30, 40, 10, 20, 30, 40, 10, 20, 30, 40, 10, 20, 30, 40,
    ]),
  ]);

  const u8RGBA = device.createTexture({
    format: Format.U8_RGBA_RT,
    width: 1,
    height: 1,
    usage: TextureUsage.SAMPLED,
  });
  u8RGBA.setImageData([new Uint8Array([1, 1, 1, 1])]);

  return () => {
    floatR.destroy();
    floatRG.destroy();
    floatRGB.destroy();
    floatRGBA.destroy();
    floatR2x2.destroy();
    floatRGBA2x2.destroy();
    u8RGBA.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

render.params = {
  targets: ['webgl1', 'webgl2', 'webgpu'],
  default: 'webgl2',
  width,
  height,
};
