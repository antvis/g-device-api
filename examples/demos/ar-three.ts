import { ARButton } from 'three/examples/jsm/webxr/ARButton';
import { DeviceContribution } from '../../src';
import {
  AmbientLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  MeshBasicMaterial,
  BoxGeometry,
} from 'three';

/**
 * @see https://immersiveweb.dev/#three.js
 */

export async function render(
  deviceContribution: DeviceContribution,
  $canvas: HTMLCanvasElement,
) {
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    canvas: $canvas,
  });
  renderer.xr.enabled = true;

  const $button = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
  });
  $canvas.parentElement?.appendChild($button);

  const scene = new Scene();

  // Make a camera. note that far is set to 100, which is better for realworld sized environments
  let camera = new PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(0, 1.6, 3);
  scene.add(camera);

  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial({ color: 0x00ff00 });
  const cube = new Mesh(geometry, material);
  // cube.position.set(0, 0, 0);
  cube.position.set(0, 0, -3);
  scene.add(cube);

  const ambientLight = new AmbientLight(0xffffff, 1.0);
  scene.add(ambientLight);

  const renderLoop = (timestamp: any, frame?: XRFrame) => {
    cube.rotation.y += 0.01;
    cube.rotation.x += 0.01;

    if (renderer.xr.isPresenting) {
      renderer.render(scene, camera);
    }
  };

  renderer.setAnimationLoop(renderLoop);
  return () => {};
}

render.params = {
  targets: ['webgl1', 'webgl2'],
  xrCompatible: true,
  default: 'webgl2',
};
