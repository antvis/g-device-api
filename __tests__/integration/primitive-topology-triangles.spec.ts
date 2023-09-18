import _gl from 'gl';
import { getWebGLDeviceContributionAndCanvas } from '../utils';
import { render } from '../../test/demos/primitive-topology-triangles';
import '../useSnapshotMatchers';

describe('Primitive topology triangles', () => {
  it('should render triangles correctly.', async () => {
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
