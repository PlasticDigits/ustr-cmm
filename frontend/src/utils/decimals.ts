/**
 * Decimal-safe conversions for CW20 / native amounts.
 *
 * Invariant: never `Number(bigint)` on raw on-chain integers (precision dies above 2^53).
 * Split whole/fraction first (same approach as formatAmount), then parse the decimal string.
 * Values whose whole part exceeds Number.MAX_SAFE_INTEGER are treated as unusable (NaN).
 */

export function rawToWholeNumber(raw: bigint, decimals: number): number {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    return Number.NaN;
  }
  if (raw < 0n) {
    return Number.NaN;
  }

  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;

  if (whole > BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number.NaN;
  }

  const fracStr = frac.toString().padStart(decimals, '0');
  const parsed = decimals === 0 ? Number(whole.toString()) : Number(`${whole.toString()}.${fracStr}`);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function isValidPositivePrice(price: number | null | undefined): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price > 0;
}
