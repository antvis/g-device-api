import {
  toMatchWebGLSnapshot,
  ToMatchWebGLSnapshotOptions,
} from './toMatchWebGLSnapshot';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toMatchWebGLSnapshot(
        dir: string,
        name: string,
        options?: ToMatchWebGLSnapshotOptions,
      ): Promise<R>;
    }
  }
}

expect.extend({
  toMatchWebGLSnapshot,
});
