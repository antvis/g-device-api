import { assert, assertExists } from '../../../src';

describe('Assert', () => {
  it('should throw Error when assert failed.', () => {
    expect(() => assert(true)).not.toThrow();
    expect(() => assert(false)).toThrow();
    expect(() => assert(false, 'test')).toThrowError('Assert fail: test');
  });

  it('should assertExists correctly.', () => {
    expect(() => assertExists(true)).not.toThrow();
    expect(() => assertExists(null)).toThrowError('Missing object');
    expect(() => assertExists(undefined)).toThrowError('Missing object');
  });
});
