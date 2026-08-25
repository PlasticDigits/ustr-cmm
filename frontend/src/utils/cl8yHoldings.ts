/**
 * CL8Y indexer catalog vs tokenlist LP pins (#18).
 *
 * Invariants:
 * - Indexer `/api/v1/pairs` is a **catalog** for discovery / pin-diff only.
 * - Never feed indexer reserves, prices, or trader positions into CR.
 * - Never auto-pin a factory / indexer pair. Pin only after LCD shows the
 *   treasury holds that LP CW20 (and governance `AddCw20` for AllBalances).
 * - LCD is source of truth for balances and `{ pool: {} }` reserves.
 * - `GET /api/v1/traders/{treasury}/positions` may be `[]` while the treasury
 *   still holds LP shares — do not treat it as a hold signal.
 * - Fail closed: missing pair_address / lp_token → skip that catalog row.
 *
 * @see ../../skills/frontend-treasury-cl8y-holdings/SKILL.md
 * @see ../../skills/frontend-treasury-lp-nav/SKILL.md
 */

import { isTerraContractAddress } from './addresses';
import type { TokenListEntry } from '../types/tokenlist';
import { isLpTokenListEntry } from '../types/tokenlist';

export interface Cl8yIndexerAsset {
  symbol: string;
  contract_addr: string | null;
  denom: string | null;
  decimals: number;
}

export interface Cl8yIndexerPair {
  pair_address: string;
  lp_token: string;
  asset_0: Cl8yIndexerAsset;
  asset_1: Cl8yIndexerAsset;
  is_active?: boolean;
}

export interface Cl8yPairsPage {
  items: Cl8yIndexerPair[];
  total: number;
  limit: number;
  offset: number;
}

export interface TokenlistLpPin {
  symbol: string;
  pairAddress: string;
  lpAddress: string;
  dex: string;
}

export type CatalogRowStatus = 'pinned' | 'unpinned' | 'invalid';

export interface CatalogRow {
  pairAddress: string;
  lpAddress: string;
  label: string;
  status: CatalogRowStatus;
  pinSymbol?: string;
}

export interface CatalogDiff {
  pinned: CatalogRow[];
  unpinned: CatalogRow[];
  invalid: CatalogRow[];
  /** tokenlist `type: "lp"` cl8y pins with no matching catalog row */
  pinsMissingFromCatalog: TokenlistLpPin[];
}

function pairLabel(pair: Cl8yIndexerPair): string {
  const a = pair.asset_0?.symbol || '?';
  const b = pair.asset_1?.symbol || '?';
  return `${a}/${b}`;
}

export function tokenlistCl8yPins(tokens: TokenListEntry[]): TokenlistLpPin[] {
  const out: TokenlistLpPin[] = [];
  for (const token of tokens) {
    if (!isLpTokenListEntry(token)) continue;
    const dex = token.pool?.dex?.toLowerCase() ?? '';
    if (dex !== 'cl8y') continue;
    const pairAddress = token.pool?.address ?? '';
    const lpAddress = token.address ?? '';
    if (!isTerraContractAddress(pairAddress) || !isTerraContractAddress(lpAddress)) continue;
    out.push({
      symbol: token.symbol,
      pairAddress,
      lpAddress,
      dex,
    });
  }
  return out;
}

export function parseCl8yPairsPage(raw: unknown): Cl8yPairsPage | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (!Array.isArray(rec.items)) return null;
  const items: Cl8yIndexerPair[] = [];
  for (const item of rec.items) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.pair_address !== 'string' || typeof row.lp_token !== 'string') continue;
    const a0 = row.asset_0;
    const a1 = row.asset_1;
    if (a0 === null || typeof a0 !== 'object' || a1 === null || typeof a1 !== 'object') continue;
    items.push({
      pair_address: row.pair_address,
      lp_token: row.lp_token,
      asset_0: a0 as Cl8yIndexerAsset,
      asset_1: a1 as Cl8yIndexerAsset,
      is_active: typeof row.is_active === 'boolean' ? row.is_active : undefined,
    });
  }
  const total = typeof rec.total === 'number' && Number.isFinite(rec.total) ? rec.total : items.length;
  const limit = typeof rec.limit === 'number' && Number.isFinite(rec.limit) ? rec.limit : items.length;
  const offset = typeof rec.offset === 'number' && Number.isFinite(rec.offset) ? rec.offset : 0;
  return { items, total, limit, offset };
}

/**
 * Diff indexer catalog against tokenlist CL8Y pins.
 * Does **not** decide whether treasury holds a pair — that is LCD only.
 */
export function diffCl8yCatalog(
  pairs: Cl8yIndexerPair[],
  pins: TokenlistLpPin[]
): CatalogDiff {
  const pinByPair = new Map(pins.map((p) => [p.pairAddress, p]));
  const pinByLp = new Map(pins.map((p) => [p.lpAddress, p]));
  const seenPins = new Set<string>();

  const pinned: CatalogRow[] = [];
  const unpinned: CatalogRow[] = [];
  const invalid: CatalogRow[] = [];

  for (const pair of pairs) {
    const pairAddress = pair.pair_address;
    const lpAddress = pair.lp_token;
    const label = pairLabel(pair);
    if (!isTerraContractAddress(pairAddress) || !isTerraContractAddress(lpAddress)) {
      invalid.push({ pairAddress, lpAddress, label, status: 'invalid' });
      continue;
    }
    const pin = pinByPair.get(pairAddress);
    if (pin && pin.lpAddress === lpAddress) {
      seenPins.add(pin.symbol);
      pinned.push({ pairAddress, lpAddress, label, status: 'pinned', pinSymbol: pin.symbol });
      continue;
    }
    const lpPin = pinByLp.get(lpAddress);
    if (lpPin && lpPin.pairAddress !== pairAddress) {
      invalid.push({
        pairAddress,
        lpAddress,
        label,
        status: 'invalid',
        pinSymbol: lpPin.symbol,
      });
      continue;
    }
    unpinned.push({ pairAddress, lpAddress, label, status: 'unpinned' });
  }

  return {
    pinned,
    unpinned,
    invalid,
    pinsMissingFromCatalog: pins.filter((p) => !seenPins.has(p.symbol)),
  };
}

/**
 * Held-but-unpinned rows that **may** be pin candidates.
 * Caller must pass LCD-confirmed LP balances; never indexer positions.
 */
export function heldUnpinnedPins(
  unpinned: CatalogRow[],
  lcdLpBalances: ReadonlyMap<string, bigint>
): CatalogRow[] {
  return unpinned.filter((row) => {
    const bal = lcdLpBalances.get(row.lpAddress);
    return bal !== undefined && bal > 0n;
  });
}
