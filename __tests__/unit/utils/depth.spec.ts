import { mat4 } from 'gl-matrix';
import {
  reverseDepthForPerspectiveProjectionMatrix,
  reverseDepthForOrthographicProjectionMatrix,
  reverseDepthForCompareFunction,
  reverseDepthForClearValue,
  reverseDepthForDepthOffset,
  compareDepthValues,
  CompareFunction,
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

  it('should reverseDepthForCompareFunction.', () => {
    expect(reverseDepthForCompareFunction(CompareFunction.ALWAYS, false)).toBe(
      CompareFunction.ALWAYS,
    );

    expect(reverseDepthForCompareFunction(CompareFunction.ALWAYS)).toBe(
      CompareFunction.ALWAYS,
    );
    expect(reverseDepthForCompareFunction(CompareFunction.LESS)).toBe(
      CompareFunction.GREATER,
    );
    expect(reverseDepthForCompareFunction(CompareFunction.LEQUAL)).toBe(
      CompareFunction.GEQUAL,
    );
    expect(reverseDepthForCompareFunction(CompareFunction.GEQUAL)).toBe(
      CompareFunction.LEQUAL,
    );
    expect(reverseDepthForCompareFunction(CompareFunction.GREATER)).toBe(
      CompareFunction.LESS,
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
    expect(compareDepthValues(0, 1, CompareFunction.LESS)).toBeFalsy();
    expect(compareDepthValues(0, 1, CompareFunction.LEQUAL)).toBeFalsy();
    expect(compareDepthValues(0, 1, CompareFunction.GREATER)).toBeTruthy();
    expect(compareDepthValues(0, 1, CompareFunction.GEQUAL)).toBeTruthy();
    expect(() => compareDepthValues(0, 1, CompareFunction.ALWAYS)).toThrow();
  });
});
