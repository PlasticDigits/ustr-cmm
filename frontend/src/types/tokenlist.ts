/**
 * tokenlist.json shapes (#14 LP entries + existing spot tokens).
 *
 * `type: "lp"` is an allowlisted pair share — never a spot simulate-swap target.
 */

export type TokenListType = 'native' | 'cw20' | 'lp';

export interface TokenListPoolAsset {
  symbol: string;
  address?: string;
  denom?: string;
}

export interface TokenListPool {
  address: string;
  dex: string;
  name?: string;
  /** Spot-price quote for CW20 (simulate-swap, or CL8Y reserve ratio). Not LP NAV. */
  quoteAsset?: string;
  /** Declared legs for `type: "lp"` — must match on-chain reserves. */
  assets?: TokenListPoolAsset[];
}

export interface TokenListEntry {
  symbol: string;
  name: string;
  denom?: string;
  address?: string;
  type: TokenListType;
  decimals: number;
  gradient: string;
  iconColor: string;
  website?: string;
  /** Published CL8Y DEX catalog image (GitLab raw). Local UI still serves `/assets/tokens/`. */
  logoURI?: string;
  pool?: TokenListPool;
}

export interface TokenList {
  name: string;
  version: string;
  tokens: TokenListEntry[];
}

export function isLpTokenListEntry(token: TokenListEntry): boolean {
  return token.type === 'lp';
}
