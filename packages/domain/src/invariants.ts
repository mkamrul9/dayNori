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
