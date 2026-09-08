/**
 * Protocol-issued tokens held by CMM (spot + LP) — Total vs CR haircut.
 *
 * Total CMM Assets includes these at market/liability USD. CR CMM Assets omits
 * them (treasury stock / wrap receipts). Native LUNC/USTC still count as CR.
 *
 * USTR USD is not a CEX print: use the price map if present, otherwise the
 * UST1/USTR pool reserve ratio (UST1 = $1). Never invent $1 for USTR.
 */

import { CONTRACTS, DEFAULT_NETWORK, UST1_LIABILITY_USD } from './constants';
import { isValidPositivePrice, rawToWholeNumber } from './decimals';
import { applyImpliedLpLegUsd, type LpNavLegInput } from './lpNav';
import type { ProtocolTokenId } from './availableSupply';

export interface ProtocolHoldingMeta {
  id: ProtocolTokenId;
  displayName: string;
  decimals: number;
  gradient: string;
  iconColor: string;
  address: string;
}

const pins = CONTRACTS[DEFAULT_NETWORK];

export const PROTOCOL_HOLDING_META: Record<ProtocolTokenId, ProtocolHoldingMeta> = {
  ust1: {
    id: 'ust1',
    displayName: 'UST1',
    decimals: 6,
    gradient: 'from-emerald-500 to-teal-500',
    iconColor: 'text-emerald-400',
    address: pins.ust1Token,
  },
  ustr: {
    id: 'ustr',
    displayName: 'USTR',
    decimals: 18,
    gradient: 'from-amber-500 to-orange-500',
    iconColor: 'text-amber-400',
    address: pins.ustrToken,
  },
  cLunc: {
    id: 'cLunc',
    displayName: 'cLUNC',
    decimals: 6,
    gradient: 'from-yellow-500 to-orange-500',
    iconColor: 'text-yellow-400',
    address: pins.cLunc,
  },
  cUstc: {
    id: 'cUstc',
    displayName: 'cUSTC',
    decimals: 6,
    gradient: 'from-blue-500 to-cyan-500',
    iconColor: 'text-blue-400',
    address: pins.cUstc,
  },
};

export function resolveUstrUsd(
  prices: Record<string, number>,
  lpLegs: readonly LpNavLegInput[][]
): number | null {
  const mapped = prices.USTR;
  if (isValidPositivePrice(mapped)) return mapped;
  for (const legs of lpLegs) {
    if (!legs.some((leg) => leg.kind === 'ustr')) continue;
    const priced = applyImpliedLpLegUsd(legs);
    const ustr = priced.find((leg) => leg.kind === 'ustr');
    if (ustr && isValidPositivePrice(ustr.usd)) return ustr.usd;
  }
  return null;
}

/** Unit USD for a protocol token: UST1 = $1, wraps = native, USTR = map or LP implied. */
export function protocolTokenUnitUsd(
  id: ProtocolTokenId,
  prices: Record<string, number>,
  ustrUsd: number | null
): number | null {
  if (id === 'ust1') return UST1_LIABILITY_USD;
  if (id === 'ustr') return isValidPositivePrice(ustrUsd) ? ustrUsd : null;
  if (id === 'cLunc') {
    const px = prices.LUNC;
    return isValidPositivePrice(px) ? px : null;
  }
  const px = prices.USTC;
  return isValidPositivePrice(px) ? px : null;
}

export function protocolHoldingUsd(
  id: ProtocolTokenId,
  balanceRaw: bigint | null,
  prices: Record<string, number>,
  ustrUsd: number | null
): number | null {
  if (balanceRaw === null || balanceRaw < 0n) return null;
  if (balanceRaw === 0n) return 0;
  const unit = protocolTokenUnitUsd(id, prices, ustrUsd);
  if (!isValidPositivePrice(unit)) return null;
  const meta = PROTOCOL_HOLDING_META[id];
  const whole = rawToWholeNumber(balanceRaw, meta.decimals);
  if (!Number.isFinite(whole) || whole < 0) return null;
  const usd = whole * unit;
  return Number.isFinite(usd) && usd >= 0 ? usd : null;
}
