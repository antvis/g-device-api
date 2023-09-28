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

  const camera = new PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.02,
    20,
  );

  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial({ color: 0x00ff00 });
  const cube = new Mesh(geometry, material);
  cube.position.z = -4;
  scene.add(cube);

  const ambientLight = new AmbientLight(0xffffff, 1.0);
  scene.add(ambientLight);

  const controller = renderer.xr.getController(0);
  scene.add(controller);

  function onSelect() {}

  controller.addEventListener('select', onSelect);

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
  default: 'webgl1',
};
