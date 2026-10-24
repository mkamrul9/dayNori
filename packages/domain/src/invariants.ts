/**
 * Core domain invariants and validations
 */

/**
 * Validates monetary amounts stored as integer minor units (e.g. cents).
 * Disallows NaN, infinite, or fractional numbers.
 */
export function validateMinorUnitAmount(amount: number): void {
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`Invalid minor unit money amount: ${amount} must be a safe integer`);
  }
}

/**
 * Validates human calendar date-only format (YYYY-MM-DD).
 * Never infer calendar occurrence dates by truncating UTC timestamps.
 */
const DATE_ONLY_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

export function isValidDateOnly(dateString: string): boolean {
  if (!DATE_ONLY_REGEX.test(dateString)) {
    return false;
  }
  const [yearStr, monthStr, dayStr] = dateString.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function parseDateOnly(dateString: string): string {
  if (!isValidDateOnly(dateString)) {
    throw new Error(`Invalid date-only format: "${dateString}" (expected YYYY-MM-DD)`);
  }
  return dateString;
}

/**
 * Validates IANA Time Zone identifiers using the standard Intl API.
 */
export function isValidIanaTimeZone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') {
    return false;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function validateIanaTimeZone(timeZone: string): void {
  if (!isValidIanaTimeZone(timeZone)) {
    throw new Error(`Invalid IANA time zone identifier: "${timeZone}"`);
  }
}

/**
 * Validates BCP-47 locale tags using the standard Intl API.
 */
export function isValidLocale(locale: string): boolean {
  if (!locale || typeof locale !== 'string') {
    return false;
  }
  try {
    const parsed = new Intl.Locale(locale);
    return Boolean(parsed.language);
  } catch {
    return false;
  }
}

export function validateLocale(locale: string): void {
  if (!isValidLocale(locale)) {
    throw new Error(`Invalid locale identifier: "${locale}"`);
  }
}

/**
 * Supported first day of the week settings.
 */
export const VALID_WEEK_STARTS = ['monday', 'sunday', 'saturday'] as const;
export type WeekStart = (typeof VALID_WEEK_STARTS)[number];

export function isValidWeekStart(val: string): val is WeekStart {
  return (VALID_WEEK_STARTS as readonly string[]).includes(val);
}

export function validateWeekStart(val: string): asserts val is WeekStart {
  if (!isValidWeekStart(val)) {
    throw new Error(`Invalid week start day: "${val}" (must be monday, sunday, or saturday)`);
  }
}
