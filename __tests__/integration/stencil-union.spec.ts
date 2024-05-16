import _gl from 'gl';
import { getWebGLDeviceContributionAndCanvas } from '../utils';
import { render } from '../../examples/demos/stencil-union';
import '../useSnapshotMatchers';

describe('Stencil Union Operation', () => {
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
      'stencil-union',
    );

    disposeCallback();
  });
});
