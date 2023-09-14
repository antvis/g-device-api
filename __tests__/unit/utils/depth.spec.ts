import { mat4 } from 'gl-matrix';
import {
  reverseDepthForPerspectiveProjectionMatrix,
  reverseDepthForOrthographicProjectionMatrix,
  reverseDepthForCompareMode,
  reverseDepthForClearValue,
  reverseDepthForDepthOffset,
  compareDepthValues,
  CompareMode,
} from '../../../src';

describe('Depth', () => {
  it('should reverseDepthForPerspectiveProjectionMatrix.', () => {
    const m = mat4.perspective(mat4.create(), 0.5, 1, 0.1, 100);
    reverseDepthForPerspectiveProjectionMatrix(m);
    reverseDepthForPerspectiveProjectionMatrix(m, false);
  });

  it('should reverseDepthForOrthographicProjectionMatrix.', () => {
    const m = mat4.ortho(mat4.create(), 0, 0, 0, 0, 0.1, 100);
    reverseDepthForOrthographicProjectionMatrix(m);
    reverseDepthForOrthographicProjectionMatrix(m, false);
  });

  it('should reverseDepthForCompareMode.', () => {
    expect(reverseDepthForCompareMode(CompareMode.ALWAYS, false)).toBe(
      CompareMode.ALWAYS,
    );

    expect(reverseDepthForCompareMode(CompareMode.ALWAYS)).toBe(
      CompareMode.ALWAYS,
    );
    expect(reverseDepthForCompareMode(CompareMode.LESS)).toBe(
      CompareMode.GREATER,
    );
    expect(reverseDepthForCompareMode(CompareMode.LEQUAL)).toBe(
      CompareMode.GEQUAL,
    );
    expect(reverseDepthForCompareMode(CompareMode.GEQUAL)).toBe(
      CompareMode.LEQUAL,
    );
    expect(reverseDepthForCompareMode(CompareMode.GREATER)).toBe(
      CompareMode.LESS,
    );
  });

  it('should reverseDepthForClearValue.', () => {
    expect(reverseDepthForClearValue(0)).toBe(1);
    expect(reverseDepthForClearValue(0, false)).toBe(0);
  });

  it('should reverseDepthForDepthOffset.', () => {
    expect(reverseDepthForDepthOffset(1)).toBe(-1);
    expect(reverseDepthForDepthOffset(1, false)).toBe(1);
  });

  it('should compareDepthValues.', () => {
    expect(compareDepthValues(0, 1, CompareMode.LESS)).toBeFalsy();
    expect(compareDepthValues(0, 1, CompareMode.LEQUAL)).toBeFalsy();
    expect(compareDepthValues(0, 1, CompareMode.GREATER)).toBeTruthy();
    expect(compareDepthValues(0, 1, CompareMode.GEQUAL)).toBeTruthy();
    expect(() => compareDepthValues(0, 1, CompareMode.ALWAYS)).toThrow();
  });
});
