/**
 * Protocol-LP holding + CR-leg rules (#14, revised by #16).
 *
 * Invariants:
 * - Raw UST1 / USTR / cLUNC / cUSTC are never treasury holdings (exact symbol or pinned address).
 * - `type: "lp"` is never skipped by symbol substring (UST1-USTR is not UST1).
 * - Wrap / protocol haircut applies only to pinned addresses — not a lookalike symbol.
 * - CR-eligible LP legs are `other` only. ust1 / ustr / wrap / unknown are out of `crUsd`.
 * - UST1 LP leg display unit is $1 (liability), never a DEX print — not a CR asset (#16).
 */

import {
  CONTRACTS,
  DEFAULT_NETWORK,
  SUPPORTED_LP_DEXES,
  TREASURY_HOLDING_SKIP_SYMBOLS,
  UST1_LIABILITY_USD,
} from './constants';
import { isValidPositivePrice } from './decimals';
import { isTerraContractAddress } from './addresses';
import type { TokenListEntry } from '../types/tokenlist';
import { isLpTokenListEntry } from '../types/tokenlist';

export type LpLegKind = 'ust1' | 'ustr' | 'wrap' | 'other' | 'unknown';

const SKIP_HOLDING = new Set<string>(TREASURY_HOLDING_SKIP_SYMBOLS);

export function protocolPins(network: keyof typeof CONTRACTS = DEFAULT_NETWORK) {
  const c = CONTRACTS[network];
  return {
    ust1: c.ust1Token,
    ustr: c.ustrToken,
    cLunc: c.cLunc,
    cUstc: c.cUstc,
    vfdusd: c.vfdusd,
  };
}

export function isExactSkipHoldingSymbol(symbol: string): boolean {
  return SKIP_HOLDING.has(symbol.toUpperCase());
}

function sameAddr(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a === b;
}

/** Raw protocol tokens only — LP rows must pass. */
export function isRawProtocolHolding(token: TokenListEntry): boolean {
  if (isLpTokenListEntry(token)) return false;
  if (isExactSkipHoldingSymbol(token.symbol)) return true;
  const pins = protocolPins();
  const addr = token.address;
  if (!addr) return false;
  return (
    sameAddr(addr, pins.ust1) ||
    sameAddr(addr, pins.ustr) ||
    sameAddr(addr, pins.cLunc) ||
    sameAddr(addr, pins.cUstc)
  );
}

export function isSupportedLpDex(dex: string): boolean {
  return (SUPPORTED_LP_DEXES as readonly string[]).includes(dex.toLowerCase());
}

export function classifyLpLeg(
  leg: { symbol: string; address?: string; denom?: string },
  knownCw20Addresses: ReadonlySet<string>
): LpLegKind {
  const pins = protocolPins();
  const addr = leg.address;
  if (sameAddr(addr, pins.ust1)) return 'ust1';
  if (sameAddr(addr, pins.ustr)) return 'ustr';
  if (sameAddr(addr, pins.cLunc) || sameAddr(addr, pins.cUstc)) return 'wrap';
  if (leg.denom === 'uluna' || leg.denom === 'uusd') return 'other';
  if (addr && knownCw20Addresses.has(addr)) return 'other';
  return 'unknown';
}

export function isCrEligibleLeg(kind: LpLegKind): boolean {
  return kind === 'other';
}

export function isProtocolHaircutLeg(kind: LpLegKind): boolean {
  return kind === 'ust1' || kind === 'ustr' || kind === 'wrap';
}

/**
 * USD for one LP leg (display NAV). UST1 is always $1. Wraps use native LUNC/USTC prints.
 * vFDUSD / USTR / others come from the price map — never invented.
 * UST1 $1 is **not** a CR numerator input (#16).
 */
export function resolveLpLegUsd(
  kind: LpLegKind,
  symbol: string,
  prices: Record<string, number>
): number | null {
  if (kind === 'ust1') {
    return UST1_LIABILITY_USD;
  }
  if (kind === 'wrap') {
    const native = symbol.toUpperCase() === 'CLUNC' ? 'LUNC' : 'USTC';
    const px = prices[native];
    return isValidPositivePrice(px) ? px : null;
  }
  const px = prices[symbol];
  return isValidPositivePrice(px) ? px : null;
}

export function knownSpotCw20Addresses(tokens: TokenListEntry[]): Set<string> {
  const pins = protocolPins();
  const skip = new Set<string>(
    [pins.ust1, pins.ustr, pins.cLunc, pins.cUstc]
      .map((a) => String(a))
      .filter((a) => isTerraContractAddress(a))
  );
  const out = new Set<string>();
  for (const token of tokens) {
    if (token.type !== 'cw20' || !token.address) continue;
    if (skip.has(token.address)) continue;
    out.add(token.address);
  }
  return out;
}
