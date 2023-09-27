import { ARButton } from 'three/examples/jsm/webxr/ARButton';
import { initExample } from './utils';
import { DeviceContribution } from '../../src';
import {
  AmbientLight,
  Mesh,
  Object3D,
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

  const materials = [
    new MeshBasicMaterial({ color: 0xff0000 }),
    new MeshBasicMaterial({ color: 0x0000ff }),
    new MeshBasicMaterial({ color: 0x00ff00 }),
    new MeshBasicMaterial({ color: 0xff00ff }),
    new MeshBasicMaterial({ color: 0x00ffff }),
    new MeshBasicMaterial({ color: 0xffff00 }),
  ];

  // Create the cube and add it to the demo scene.
  const cube = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), materials);
  cube.position.set(1, 1, 1);
  scene.add(cube);

  const camera = new PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.02,
    20,
  );
  const ambientLight = new AmbientLight(0xffffff, 1.0);
  scene.add(ambientLight);

  const controller = renderer.xr.getController(0);
  scene.add(controller);

  function onSelect() {}

  controller.addEventListener('select', onSelect);

  const renderLoop = (timestamp: any, frame?: XRFrame) => {
    if (renderer.xr.isPresenting) {
      // if (frame) {
      //   handleXRHitTest(
      //     renderer,
      //     frame,
      //     onHitTestResultReady,
      //     onHitTestResultEmpty,
      //   );
      // }

      renderer.render(scene, camera);
    }
  };

  renderer.setAnimationLoop(renderLoop);
  return () => {};
}

export async function ARThree($container: HTMLDivElement) {
  return initExample($container, render, {
    targets: ['webgl1', 'webgl2'],
    xrCompatible: true,
    default: 'webgl1',
  });
}
