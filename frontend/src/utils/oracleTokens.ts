/**
 * Which CW20s use the session-once oracle path vs the DEX simulate loop (#10).
 *
 * Invariant: vFDUSD is skipped from DEX by **symbol and address**, even if someone
 * later adds a `pool` to tokenlist.json (would burn LCD quota and return null).
 */

import { CONTRACTS, DEFAULT_NETWORK } from './constants';

const ORACLE_SYMBOLS = new Set(['VFDUSD']);

export function isVfdusdToken(symbol: string, address?: string): boolean {
  if (ORACLE_SYMBOLS.has(symbol.toUpperCase())) return true;
  const pinned = CONTRACTS[DEFAULT_NETWORK].vfdusd;
  return !!address && !!pinned && address === pinned;
}
