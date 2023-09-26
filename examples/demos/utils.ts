import * as lil from 'lil-gui';
import {
  WebGLDeviceContribution,
  WebGPUDeviceContribution,
  DeviceContribution,
} from '../../src';

export async function initExample(
  $container: HTMLDivElement,
  render: (
    deviceContribution: DeviceContribution,
    $canvas: HTMLCanvasElement,
    useRAF?: boolean,
  ) => Promise<() => void>,
  params: {
    targets: ('webgl1' | 'webgl2' | 'webgpu')[];
    xrCompatible?: boolean;
    default: 'webgl1' | 'webgl2' | 'webgpu';
  },
) {
  const deviceContributionWebGL1 = new WebGLDeviceContribution({
    targets: ['webgl1'],
    xrCompatible: params.xrCompatible,
    onContextCreationError: () => {},
    onContextLost: () => {},
    onContextRestored(e) {},
  });
  const deviceContributionWebGL2 = new WebGLDeviceContribution({
    targets: ['webgl2', 'webgl1'],
    xrCompatible: params.xrCompatible,
    onContextCreationError: () => {},
    onContextLost: () => {},
    onContextRestored(e) {},
  });
  const deviceContributionWebGPU = new WebGPUDeviceContribution({
    shaderCompilerPath: '/glsl_wgsl_compiler_bg.wasm',
  });

  let disposeCallback;

  const rerender = async (
    deviceContribution: DeviceContribution,
    $container: HTMLDivElement,
  ) => {
    let $canvasContainer = document.getElementById('canvas')!;
    if ($canvasContainer) {
      $canvasContainer.remove();
    }
    $canvasContainer = document.createElement('div');
    $canvasContainer.id = 'canvas';
    $container.appendChild($canvasContainer);

    $canvasContainer.innerHTML = '';
    const $canvas = document.createElement('canvas');
    $canvas.width = 1000;
    $canvas.height = 1000;
    $canvas.style.width = '500px';
    $canvas.style.height = '500px';
    $canvasContainer.appendChild($canvas);

    disposeCallback = await render(deviceContribution, $canvas);
  };

  if (params.default === 'webgl1') {
    await rerender(deviceContributionWebGL1, $container);
  } else if (params.default === 'webgl2') {
    await rerender(deviceContributionWebGL2, $container);
  } else if (params.default === 'webgpu') {
    // @ts-ignore
    await rerender(deviceContributionWebGPU, $container);
  }

  // GUI
  const gui = new lil.GUI({ autoPlace: false });
  $container.appendChild(gui.domElement);
  const rendererFolder = gui.addFolder('renderer');
  const rendererConfig = {
    renderer: params.default,
  };
  rendererFolder
    .add(rendererConfig, 'renderer', params.targets)
    .onChange(async (renderer: 'webgl1' | 'webgl2' | 'webgpu') => {
      if (disposeCallback) {
        disposeCallback();
        // @ts-ignore
        disposeCallback = undefined;
      }

      if (renderer === 'webgl1') {
        disposeCallback = await rerender(deviceContributionWebGL1, $container);
      } else if (renderer === 'webgl2') {
        disposeCallback = await rerender(deviceContributionWebGL2, $container);
      } else if (renderer === 'webgpu') {
        // @ts-ignore
        disposeCallback = await rerender(deviceContributionWebGPU, $container);
      }
    });
  rendererFolder.open();

  return disposeCallback;
}

export async function loadImage(
  url: string,
): Promise<HTMLImageElement | ImageBitmap> {
  if (!!window.createImageBitmap) {
    const response = await fetch(url);
    const imageBitmap = await createImageBitmap(await response.blob());
    return imageBitmap;
  } else {
    const image = new window.Image();
    return new Promise((res) => {
      image.onload = () => res(image);
      image.src = url;
      image.crossOrigin = 'Anonymous';
    });
  }
}
