import { describe, expect, it } from 'vitest';
import { percentChange, powerFromVI } from '../server/analytics';

describe('PV research calculations', () => {
  it('calculates new measurement power from simultaneous V and I', () => {
    expect(powerFromVI(12.34, 0.321)).toBe(3.96114);
    expect(powerFromVI(0, 0.321)).toBe(0);
  });
  it('reproduces the documented bio-nano comparison from stored rounded means', () => {
    expect(percentChange(6.53, 5.63)).toBeCloseTo(15.98579, 4);
    expect(percentChange(6.11, 5.63)).toBeCloseTo(8.52575, 4);
  });
  it('keeps rounded-mean and document percentages distinguishable', () => {
    expect(Number(percentChange(5.79, 5.63)?.toFixed(1))).toBe(2.8);
  });
  it('does not report a percentage when control output is zero', () => {
    expect(percentChange(6.53, 0)).toBeNull();
  });
  it('rejects invalid numerical values', () => {
    expect(() => powerFromVI(-1, 0.2)).toThrow(RangeError);
    expect(() => powerFromVI(Number.NaN, 0.2)).toThrow(RangeError);
    expect(() => percentChange(Infinity, 5.63)).toThrow(RangeError);
  });
});
