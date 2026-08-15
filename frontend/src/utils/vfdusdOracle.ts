/**
 * vFDUSD oracle parse + session cache (#10).
 *
 * Invariants:
 * - USD = (rate / 1e18) * $1 FDUSD. Never invent $1 per vFDUSD on failure.
 * - Accept on-chain `rate` (live ust1-oracle field) or `R` (issue wording).
 * - Reject non-finite, <= 0, paused, or out-of-band rates (0.5 … 10 FDUSD per vFDUSD).
 * - sessionStorage is untrusted: validate schema/version + sanity band on every read.
 * - After a validated success OR a recorded hard failure, do not hit LCD again this tab session.
 */

import { PRICE_CACHE, VFDUSD_ORACLE } from './constants';

export const VFDUSD_SESSION_SCHEMA = VFDUSD_ORACLE.sessionSchemaVersion;

export type VfdusdSessionRecord =
  | {
      v: typeof VFDUSD_SESSION_SCHEMA;
      status: 'ok';
      usd: number;
      rate: string;
      fetchedAt: number;
    }
  | {
      v: typeof VFDUSD_SESSION_SCHEMA;
      status: 'unavailable';
      reason: VfdusdUnavailableReason;
      fetchedAt: number;
    };

export type VfdusdUnavailableReason = 'paused' | 'invalid' | 'network';

export type VfdusdSessionRead =
  | { status: 'ok'; usd: number; rate: string }
  | { status: 'unavailable'; reason: VfdusdUnavailableReason }
  | { status: 'miss' };

export interface Ust1OracleState {
  rate?: string;
  R?: string;
  paused?: boolean;
}

export function extractOracleRateString(state: Ust1OracleState | null | undefined): string | null {
  if (!state || typeof state !== 'object') return null;
  if (typeof state.rate === 'string' && state.rate.length > 0) return state.rate;
  if (typeof state.R === 'string' && state.R.length > 0) return state.R;
  return null;
}

/**
 * Convert Venus-normalized rate (1e18 scale) to FDUSD-per-vFDUSD, then USD at $1 FDUSD.
 * Returns null when the rate must not be shown.
 */
export function vfdusdUsdFromOracleState(state: Ust1OracleState | null | undefined): number | null {
  if (!state || state.paused === true) {
    return null;
  }
  const raw = extractOracleRateString(state);
  if (!raw) return null;
  return vfdusdUsdFromRateString(raw);
}

export function vfdusdUsdFromRateString(raw: string): number | null {
  if (!/^[0-9]+$/.test(raw)) {
    return null;
  }
  let rate: bigint;
  try {
    rate = BigInt(raw);
  } catch {
    return null;
  }
  if (rate <= 0n) return null;

  // rate is 1e18-scaled; Number(1.22e18) is not safe-integer. Split first.
  const scale = 10n ** 18n;
  const whole = rate / scale;
  const frac = rate % scale;
  if (whole > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const usd = Number(`${whole.toString()}.${frac.toString().padStart(18, '0')}`) * VFDUSD_ORACLE.fdusdUsd;
  return sanitizeVfdusdUsd(usd);
}

export function sanitizeVfdusdUsd(usd: number): number | null {
  if (!Number.isFinite(usd) || usd <= 0) return null;
  if (usd < VFDUSD_ORACLE.minFdusdPerVfdusd || usd > VFDUSD_ORACLE.maxFdusdPerVfdusd) {
    return null;
  }
  return usd;
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readVfdusdSessionPrice(
  storage: Storage | null = getSessionStorage(),
  key: string = PRICE_CACHE.vfdusdSessionKey
): VfdusdSessionRead {
  if (!storage) return { status: 'miss' };
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { status: 'miss' };
  }
  if (!raw) return { status: 'miss' };

  try {
    const parsed = JSON.parse(raw) as Partial<VfdusdSessionRecord>;
    if (parsed.v !== VFDUSD_SESSION_SCHEMA) return { status: 'miss' };
    if (parsed.status === 'ok') {
      const usd = sanitizeVfdusdUsd(parsed.usd as number);
      if (usd === null || typeof parsed.rate !== 'string') return { status: 'miss' };
      return { status: 'ok', usd, rate: parsed.rate };
    }
    if (parsed.status === 'unavailable') {
      if (parsed.reason === 'paused' || parsed.reason === 'invalid' || parsed.reason === 'network') {
        return { status: 'unavailable', reason: parsed.reason };
      }
    }
    return { status: 'miss' };
  } catch {
    return { status: 'miss' };
  }
}

export function writeVfdusdSessionPrice(
  record: VfdusdSessionRecord,
  storage: Storage | null = getSessionStorage(),
  key: string = PRICE_CACHE.vfdusdSessionKey
): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(record));
  } catch {
    // Quota / private mode — in-flight module cache still covers this tab.
  }
}
