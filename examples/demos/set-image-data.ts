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

  // const luminance = device.createTexture({
  //   format: Format.U8_LUMINANCE,
  //   width: 1,
  //   height: 1,
  //   usage: TextureUsage.SAMPLED,
  //   pixelStore: {
  //     unpackFlipY: false,
  //     packAlignment: 1,
  //   },
  //   mipLevelCount: 0,
  // });
  // luminance.setImageData([new Uint8Array([10])]);

  const floatR = device.createTexture({
    format: Format.F32_R,
    width: 1,
    height: 1,
    usage: TextureUsage.SAMPLED,
    pixelStore: {
      unpackFlipY: false,
      packAlignment: 1,
    },
    mipLevelCount: 1,
  });
  floatR.setImageData([new Float32Array([10.25])]);

  const u8RGBA = device.createTexture({
    format: Format.U8_RGBA_RT,
    width: 1,
    height: 1,
    usage: TextureUsage.SAMPLED,
    mipLevelCount: 1,
  });
  u8RGBA.setImageData([new Uint8Array([1, 1, 1, 1])]);

  // const floatRGB = device.createTexture({
  //   format: Format.F32_RGB,
  //   width: 1,
  //   height: 1,
  //   usage: TextureUsage.SAMPLED,
  //   pixelStore: {
  //     unpackFlipY: false,
  //     packAlignment: 4,
  //   },
  //   mipLevelCount: 0,
  // });
  // floatRGB.setImageData([new Float32Array([10, 20, 30])]);

  return () => {
    // luminance.destroy();
    // floatRGB.destroy();
    floatR.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

render.params = {
  targets: ['webgl1', 'webgl2', 'webgpu'],
  default: 'webgpu',
  width,
  height,
};
