/**
 * Domain logic, exact money arithmetic, currencies, and refund invariants for Phase 39 (Expense Tracking Domain).
 * Invariant: Never use IEEE-754 floating-point arithmetic for financial calculations.
 * Invariant: All amounts are stored as non-negative integer minor units (BigInt).
 * Invariant: Different currencies are never silently combined.
 */

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  exponent: number; // 0, 2, or 3
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyInfo> = {
  // 0 decimal places
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', exponent: 0 },
  KRW: { code: 'KRW', name: 'South Korean Won', symbol: '₩', exponent: 0 },
  VND: { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', exponent: 0 },
  CLP: { code: 'CLP', name: 'Chilean Peso', symbol: '$', exponent: 0 },

  // 2 decimal places
  USD: { code: 'USD', name: 'United States Dollar', symbol: '$', exponent: 2 },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', exponent: 2 },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', exponent: 2 },
  BDT: { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', exponent: 2 },
  CAD: { code: 'CAD', name: 'Canadian Dollar', symbol: '$', exponent: 2 },
  AUD: { code: 'AUD', name: 'Australian Dollar', symbol: '$', exponent: 2 },
  INR: { code: 'INR', name: 'Indian Rupee', symbol: '₹', exponent: 2 },
  SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: '$', exponent: 2 },
  CHF: { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', exponent: 2 },
  CNY: { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', exponent: 2 },

  // 3 decimal places
  KWD: { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KD', exponent: 3 },
  BHD: { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BD', exponent: 3 },
  OMR: { code: 'OMR', name: 'Omani Rial', symbol: 'OMR', exponent: 3 },
  JOD: { code: 'JOD', name: 'Jordanian Dinar', symbol: 'JD', exponent: 3 },
  TND: { code: 'TND', name: 'Tunisian Dinar', symbol: 'DT', exponent: 3 },
};

// Maximum value for PostgreSQL 64-bit signed integer (BIGINT)
export const MAX_BIGINT_MINOR_UNITS = 9_223_372_036_854_775_807n;

export class CurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CurrencyError';
  }
}

export class MoneyPrecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyPrecisionError';
  }
}

export class RefundInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RefundInvariantError';
  }
}

/**
 * Validates and retrieves currency configuration by ISO 4217 code.
 */
export function getCurrencyInfo(currencyCode: string): CurrencyInfo {
  if (!currencyCode || typeof currencyCode !== 'string') {
    throw new CurrencyError('Currency code must be a non-empty string');
  }
  const normalized = currencyCode.trim().toUpperCase();
  const info = SUPPORTED_CURRENCIES[normalized];
  if (!info) {
    throw new CurrencyError(
      `Unsupported currency code '${currencyCode}'. Supported codes: ${Object.keys(
        SUPPORTED_CURRENCIES
      ).join(', ')}`
    );
  }
  return info;
}

export function isSupportedCurrency(currencyCode: string): boolean {
  if (!currencyCode || typeof currencyCode !== 'string') return false;
  return Boolean(SUPPORTED_CURRENCIES[currencyCode.trim().toUpperCase()]);
}

/**
 * Parses a decimal string (e.g. "12.50", "100", "0.05") or raw minor units into exact integer minor units (BigInt).
 * Enforces non-negative values and strictly rejects fractional digits exceeding currency exponent.
 */
export function parseDecimalToMinorUnits(
  amountInput: string | number | bigint,
  currencyCode: string
): bigint {
  const currency = getCurrencyInfo(currencyCode);

  if (typeof amountInput === 'bigint') {
    if (amountInput < 0n) {
      throw new MoneyPrecisionError('Amount minor units cannot be negative');
    }
    if (amountInput > MAX_BIGINT_MINOR_UNITS) {
      throw new MoneyPrecisionError('Amount exceeds maximum allowable 64-bit integer limit');
    }
    return amountInput;
  }

  const rawStr = String(amountInput).trim();
  if (!rawStr) {
    throw new MoneyPrecisionError('Amount cannot be empty');
  }

  // Reject negative signs
  if (rawStr.startsWith('-')) {
    throw new MoneyPrecisionError('Negative amounts are prohibited. Use refund kind for refunds.');
  }

  // Validate decimal pattern (digits with optional single decimal point)
  if (!/^\d+(\.\d+)?$/.test(rawStr)) {
    throw new MoneyPrecisionError(`Malformed decimal amount string: '${rawStr}'`);
  }

  const parts = rawStr.split('.');
  const wholePart = parts[0] || '0';
  const fracPart = parts[1] || '';

  if (fracPart.length > currency.exponent) {
    throw new MoneyPrecisionError(
      `Currency '${currency.code}' supports at most ${currency.exponent} decimal places; received ${fracPart.length}`
    );
  }

  // Pad fraction with trailing zeros up to exponent
  const paddedFrac = fracPart.padEnd(currency.exponent, '0');
  const combined = wholePart + paddedFrac;

  // Remove leading zeros while preserving at least one digit
  const normalizedDigits = combined.replace(/^0+(?=\d)/, '');
  const result = BigInt(normalizedDigits || '0');

  if (result > MAX_BIGINT_MINOR_UNITS) {
    throw new MoneyPrecisionError('Amount exceeds maximum allowable 64-bit integer limit');
  }

  return result;
}

/**
 * Formats integer minor units into an exact decimal string for presentation and API serialization.
 * Example for USD (exponent 2): 1050n -> "10.50", 5n -> "0.05", 0n -> "0.00".
 * Example for JPY (exponent 0): 1000n -> "1000".
 * Example for KWD (exponent 3): 12345n -> "12.345".
 */
export function formatMinorUnitsToDecimal(
  minorUnits: bigint | string | number,
  currencyCode: string
): string {
  const currency = getCurrencyInfo(currencyCode);
  const units = typeof minorUnits === 'bigint' ? minorUnits : BigInt(String(minorUnits));

  if (units < 0n) {
    throw new MoneyPrecisionError('Minor units cannot be negative');
  }

  if (currency.exponent === 0) {
    return units.toString();
  }

  const unitsStr = units.toString();
  const minLength = currency.exponent + 1;
  const padded = unitsStr.padStart(minLength, '0');

  const whole = padded.slice(0, padded.length - currency.exponent);
  const frac = padded.slice(padded.length - currency.exponent);

  return `${whole}.${frac}`;
}

export type ExpenseKind = 'expense' | 'income' | 'refund';

export interface RefundValidationResult {
  valid: boolean;
  cumulativeRefundMinorUnits: bigint;
  remainingRefundableMinorUnits: bigint;
}

/**
 * Validates that a new or edited refund does not cause cumulative active refunds to exceed
 * the original expense amount.
 */
export function validateRefundBounds(
  originalExpenseAmount: bigint,
  existingActiveRefunds: bigint,
  refundDelta: bigint
): RefundValidationResult {
  if (originalExpenseAmount < 0n) {
    throw new RefundInvariantError('Original expense amount cannot be negative');
  }
  if (existingActiveRefunds < 0n) {
    throw new RefundInvariantError('Existing active refunds cannot be negative');
  }
  if (refundDelta < 0n) {
    throw new RefundInvariantError('Refund amount cannot be negative');
  }

  const newTotal = existingActiveRefunds + refundDelta;
  if (newTotal > originalExpenseAmount) {
    throw new RefundInvariantError(
      `Cumulative refunds (${newTotal.toString()}) cannot exceed original expense amount (${originalExpenseAmount.toString()})`
    );
  }

  return {
    valid: true,
    cumulativeRefundMinorUnits: newTotal,
    remainingRefundableMinorUnits: originalExpenseAmount - newTotal,
  };
}

/**
 * Calculates net category spending: expenses minus active refunds.
 * Note: A refund in a subsequent month may produce negative net spending for that month,
 * which is mathematically correct and preserved.
 */
export function calculateNetSpending(
  grossExpenseMinorUnits: bigint,
  refundMinorUnits: bigint
): bigint {
  return grossExpenseMinorUnits - refundMinorUnits;
}

/**
 * Calculates net savings: income minus net spending.
 */
export function calculateNetSavings(
  grossIncomeMinorUnits: bigint,
  netExpenseMinorUnits: bigint
): bigint {
  return grossIncomeMinorUnits - netExpenseMinorUnits;
}

/**
 * Helper to get the number of days in a specific calendar month.
 * Handles leap years automatically in UTC.
 */
export function getDaysInMonth(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

/**
 * Validates that a string is a real calendar date in YYYY-MM-DD format.
 */
export function isValidCalendarDate(dateStr: string): boolean {
  if (typeof dateStr !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return false;
  const year = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10);
  const day = parseInt(match[3]!, 10);
  if (year < 1900 || year > 2200) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  return day <= getDaysInMonth(year, month);
}


export interface RecurringSchedule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval?: number; // e.g. 1 = every month, 2 = every 2 months
  dayOfMonth?: number; // 1-31
  dayOfWeek?: number; // 0-6 (0 = Sunday)
}

/**
 * Calculates the next occurrence date (YYYY-MM-DD) for a recurring expense template.
 * Explicitly preserves the recurrence anchor across months with varying lengths (28, 29, 30, 31 days)
 * and supports leap years without permanently clamping to 28.
 */
export function getNextOccurrenceDate(
  schedule: RecurringSchedule,
  startDateStr: string,
  afterDateStr?: string,
  endDateStr?: string
): string | null {
  const startMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDateStr);
  if (!startMatch) {
    throw new Error(`Invalid startDateStr: ${startDateStr}`);
  }
  const startYear = parseInt(startMatch[1]!, 10);
  const startMonth = parseInt(startMatch[2]!, 10);
  const startDay = parseInt(startMatch[3]!, 10);

  const anchorDay = schedule.dayOfMonth !== undefined ? schedule.dayOfMonth : startDay;
  const interval = Math.max(1, schedule.interval || 1);

  let candidateStr: string;

  if (!afterDateStr) {
    if (schedule.frequency === 'monthly') {
      const maxDays = getDaysInMonth(startYear, startMonth);
      const targetDay = Math.min(anchorDay, maxDays);
      const targetDate = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
      if (targetDate >= startDateStr) {
        candidateStr = targetDate;
      } else {
        // Advance 1 interval
        const totalMonths = startYear * 12 + (startMonth - 1) + interval;
        const nextYear = Math.floor(totalMonths / 12);
        const nextMonth = (totalMonths % 12) + 1;
        const nextMax = getDaysInMonth(nextYear, nextMonth);
        const nextDay = Math.min(anchorDay, nextMax);
        candidateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
      }
    } else if (schedule.frequency === 'weekly' && schedule.dayOfWeek !== undefined) {
      const s = new Date(startDateStr + 'T00:00:00Z');
      const currentDow = s.getUTCDay();
      let diff = schedule.dayOfWeek - currentDow;
      if (diff < 0) diff += 7;
      s.setUTCDate(s.getUTCDate() + diff);
      candidateStr = s.toISOString().split('T')[0]!;
    } else {
      candidateStr = startDateStr;
    }
  } else {
    const afterMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(afterDateStr);
    if (!afterMatch) {
      throw new Error(`Invalid afterDateStr: ${afterDateStr}`);
    }
    const afterYear = parseInt(afterMatch[1]!, 10);
    const afterMonth = parseInt(afterMatch[2]!, 10);

    switch (schedule.frequency) {
      case 'daily': {
        const cur = new Date(afterDateStr + 'T00:00:00Z');
        cur.setUTCDate(cur.getUTCDate() + interval);
        candidateStr = cur.toISOString().split('T')[0]!;
        break;
      }
      case 'weekly': {
        const cur = new Date(afterDateStr + 'T00:00:00Z');
        cur.setUTCDate(cur.getUTCDate() + 7 * interval);
        candidateStr = cur.toISOString().split('T')[0]!;
        break;
      }
      case 'monthly': {
        const totalMonths = afterYear * 12 + (afterMonth - 1) + interval;
        const targetYear = Math.floor(totalMonths / 12);
        const targetMonth = (totalMonths % 12) + 1;
        const maxDays = getDaysInMonth(targetYear, targetMonth);
        const targetDay = Math.min(anchorDay, maxDays);
        candidateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
        break;
      }
      case 'yearly': {
        const targetYear = afterYear + interval;
        const targetMonth = startMonth;
        const maxDays = getDaysInMonth(targetYear, targetMonth);
        const targetDay = Math.min(anchorDay, maxDays);
        candidateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
        break;
      }
    }
  }

  if (candidateStr < startDateStr) {
    candidateStr = startDateStr;
  }

  if (endDateStr && candidateStr > endDateStr) {
    return null;
  }

  return candidateStr;
}
