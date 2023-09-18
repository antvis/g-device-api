import _gl from 'gl';
import getPixels from 'get-pixels';
import { getWebGLDeviceContributionAndCanvas } from '../utils';
import { render } from '../../examples/demos/textured-cube';
import '../useSnapshotMatchers';

describe('Textured Cube', () => {
  it('should render correctly.', async () => {
    // Load local image instead of fetching remote URL.
    // @see https://github.com/stackgl/headless-gl/pull/53/files#diff-55563b6c0b90b80aed19c83df1c51e80fd45d2fbdad6cc047ee86e98f65da3e9R83
    const src = await new Promise((resolve, reject) => {
      getPixels(__dirname + '/texture.png', function (err, image) {
        if (err) {
          reject('Bad image path');
        } else {
          image.width = image.shape[0];
          image.height = image.shape[1];
          resolve(image);
        }
      });
    });

    const [webGLDeviceContribution, $canvas] =
      getWebGLDeviceContributionAndCanvas();

    const disposeCallback = await render(
      webGLDeviceContribution,
      $canvas,
      false,
      // @ts-ignore
      src,
    );

    const dir = `${__dirname}/snapshots`;

    expect($canvas.getContext('webgl1')).toMatchWebGLSnapshot(
      dir,
      'textured-cube',
    );

    disposeCallback();
  });
});
