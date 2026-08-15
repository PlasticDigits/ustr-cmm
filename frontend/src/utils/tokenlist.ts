/**
 * Shared tokenlist.json fetch (one cache for treasury + prices).
 */

import { TOKEN_LIST_URL } from './constants';
import type { TokenList } from '../types/tokenlist';

let tokenListCache: TokenList | null = null;

export async function fetchTokenList(): Promise<TokenList> {
  if (tokenListCache) {
    return tokenListCache;
  }

  const response = await fetch(TOKEN_LIST_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch token list: ${response.status}`);
  }

  tokenListCache = (await response.json()) as TokenList;
  return tokenListCache;
}

/** Test-only: drop the module cache. */
export function resetTokenListCache(): void {
  tokenListCache = null;
}
