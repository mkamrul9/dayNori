import { describe, expect, it } from 'vitest';
import {
  parseDecimalToMinorUnits,
  formatMinorUnitsToDecimal,
  MoneyPrecisionError,
  isSupportedCurrency,
} from '@daynori/domain';

describe('Phase 76 — expense money readiness', () => {
  it('keeps exact decimal boundary parsing without floating-point shortcuts', () => {
    expect(formatMinorUnitsToDecimal(parseDecimalToMinorUnits('0', 'USD'), 'USD')).toBe('0.00');
    expect(formatMinorUnitsToDecimal(parseDecimalToMinorUnits('0.01', 'USD'), 'USD')).toBe('0.01');
    expect(formatMinorUnitsToDecimal(parseDecimalToMinorUnits('1', 'JPY'), 'JPY')).toBe('1');
    expect(isSupportedCurrency('KWD') || isSupportedCurrency('BHD')).toBe(true);
    const threeDecimal = isSupportedCurrency('KWD') ? 'KWD' : 'BHD';
    expect(
      formatMinorUnitsToDecimal(parseDecimalToMinorUnits('12.345', threeDecimal), threeDecimal)
    ).toBe('12.345');
    expect(() => parseDecimalToMinorUnits('1.234', 'USD')).toThrow(MoneyPrecisionError);
    expect(() => parseDecimalToMinorUnits('-1', 'USD')).toThrow(MoneyPrecisionError);
    expect(() => parseDecimalToMinorUnits('not-a-number', 'USD')).toThrow(MoneyPrecisionError);
    // Beyond Number.MAX_SAFE_INTEGER exact integer range — still exact as BigInt
    const huge = parseDecimalToMinorUnits('9007199254740993', 'JPY');
    expect(huge > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(formatMinorUnitsToDecimal(huge, 'JPY')).toBe('9007199254740993');
  });
});
