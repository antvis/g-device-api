import {
  colorNewCopy,
  colorCopy,
  colorEqual,
  colorNewFromRGBA,
} from '../../../src';

describe('Assert', () => {
  it('should colorNewCopy correctly.', () => {
    expect(
      colorNewCopy({
        r: 0,
        g: 0,
        b: 0,
        a: 0,
      }),
    ).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 0,
    });
  });

  it('should colorNewFromRGBA correctly.', () => {
    expect(colorNewFromRGBA(255, 0, 0)).toEqual({
      r: 255,
      g: 0,
      b: 0,
      a: 1,
    });
    expect(colorNewFromRGBA(255, 0, 0, 0.5)).toEqual({
      r: 255,
      g: 0,
      b: 0,
      a: 0.5,
    });
  });

  it('should colorCopy correctly.', () => {
    const dst = {
      r: 0,
      g: 0,
      b: 0,
      a: 0,
    };
    colorCopy(dst, {
      r: 10,
      g: 10,
      b: 10,
      a: 10,
    });
    expect(dst).toEqual({
      r: 10,
      g: 10,
      b: 10,
      a: 10,
    });
  });

  it('should colorEqual correctly.', () => {
    const a = {
      r: 0,
      g: 0,
      b: 0,
      a: 0,
    };
    const b = {
      r: 0,
      g: 0,
      b: 0,
      a: 0,
    };
    expect(colorEqual(a, b)).toBeTruthy();
  });
});
