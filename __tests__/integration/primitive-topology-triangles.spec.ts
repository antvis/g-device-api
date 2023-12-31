import _gl from 'gl';
import { getWebGLDeviceContributionAndCanvas } from '../utils';
import { render } from '../../examples/demos/primitive-topology-triangles';
import '../useSnapshotMatchers';

describe('Primitive Topology Triangles', () => {
  it('should render correctly.', async () => {
    const [webGLDeviceContribution, $canvas] =
      getWebGLDeviceContributionAndCanvas();

    const disposeCallback = await render(
      webGLDeviceContribution,
      $canvas,
      false,
    );

    const dir = `${__dirname}/snapshots`;

    expect($canvas.getContext('webgl1')).toMatchWebGLSnapshot(
      dir,
      'primitive-topology-triangles',
    );

    disposeCallback();
  });
});
