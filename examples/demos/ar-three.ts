import * as THREE from 'three';
import { initExample } from './utils';
import { DeviceContribution } from '../../src';

export async function render(
  deviceContribution: DeviceContribution,
  $canvas: HTMLCanvasElement,
) {
  // create swap chain and get device
  const swapChain = await deviceContribution.createSwapChain($canvas);

  const device = swapChain.getDevice();
  const gl = device['gl'];

  const activateXR = async () => {
    const scene = new THREE.Scene();

    // The cube will have a different color on each side.
    const materials = [
      new THREE.MeshBasicMaterial({ color: 0xff0000 }),
      new THREE.MeshBasicMaterial({ color: 0x0000ff }),
      new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
      new THREE.MeshBasicMaterial({ color: 0xff00ff }),
      new THREE.MeshBasicMaterial({ color: 0x00ffff }),
      new THREE.MeshBasicMaterial({ color: 0xffff00 }),
    ];

    // Create the cube and add it to the demo scene.
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.2),
      materials,
    );
    cube.position.set(1, 1, 1);
    scene.add(cube);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      preserveDrawingBuffer: true,
      canvas: $canvas,
      context: gl,
    });
    renderer.autoClear = false;

    // The API directly updates the camera matrices.
    // Disable matrix auto updates so three.js doesn't attempt
    // to handle the matrices independently.
    const camera = new THREE.PerspectiveCamera();
    camera.matrixAutoUpdate = false;

    // Initialize a WebXR session using "immersive-ar".
    const session = await navigator.xr!.requestSession('immersive-ar');
    session.updateRenderState({
      baseLayer: new XRWebGLLayer(session, gl),
    });

    // A 'local' reference space has a native origin that is located
    // near the viewer's position at the time the session was created.
    const referenceSpace = await session.requestReferenceSpace('local');

    const onXRFrame: XRFrameRequestCallback = (time, frame) => {
      // Queue up the next draw request.
      session.requestAnimationFrame(onXRFrame);

      // Assumed to be a XRWebGLLayer for now.
      let layer = session.renderState.baseLayer;
      if (!layer) {
        layer = session.renderState.layers![0] as XRWebGLLayer;
      } else {
        // Bind the graphics framebuffer to the baseLayer's framebuffer.
        // Only baseLayer has framebuffer and we need to bind it, even if it is null (for inline sessions).
        gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
      }

      // Retrieve the pose of the device.
      // XRFrame.getViewerPose can return null while the session attempts to establish tracking.
      const pose = frame.getViewerPose(referenceSpace);
      if (pose) {
        // In mobile AR, we only have one view.
        const view = pose.views[0];

        const viewport = session.renderState.baseLayer!.getViewport(view)!;

        // Use the view's transform matrix and projection matrix to configure the THREE.camera.
        camera.matrix.fromArray(view.transform.matrix);
        camera.projectionMatrix.fromArray(view.projectionMatrix);
        camera.updateMatrixWorld(true);

        // Render the scene with THREE.WebGLRenderer.
        renderer.render(scene, camera);
      }
    };
    session.requestAnimationFrame(onXRFrame);
  };

  // Starting an immersive WebXR session requires user interaction.
  // We start this one with a simple button.
  const $button = document.createElement('button');
  $button.innerHTML = 'Start Hello WebXR';
  $button.onclick = activateXR;
  $canvas.parentElement?.appendChild($button);

  return () => {};
}

export async function ARThree($container: HTMLDivElement) {
  return initExample($container, render, {
    targets: ['webgl1', 'webgl2'],
    xrCompatible: true,
    default: 'webgl2',
  });
}
