/**
 * Normalize Garuda / Terraswap / Terraport `{ pool: {} }` into reserves + LP share (#14).
 *
 * Garuda: asset1/asset2 + reserve1/reserve2 + total_supply + liquidity_token (LP ≠ pair).
 * Terraswap/Terraport: assets[] + total_share (pair is usually the LP mint).
 */

import { isSupportedLpDex } from './lpEligibility';

export interface ParsedPoolReserve {
  address?: string;
  denom?: string;
  amountRaw: bigint;
}

export interface ParsedPoolState {
  reserves: ParsedPoolReserve[];
  totalShare: bigint;
  /** Garuda (and some forks) expose a separate LP CW20. */
  liquidityToken?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseAmount(value: unknown): bigint | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    try {
      const n = BigInt(value);
      return n >= 0n ? n : null;
    } catch {
      return null;
    }
  }
  return null;
}

function parseGarudaAsset(value: unknown): Pick<ParsedPoolReserve, 'address' | 'denom'> | null {
  const rec = asRecord(value);
  if (!rec) return null;
  if (typeof rec.cw20 === 'string') return { address: rec.cw20 };
  if (typeof rec.native === 'string') return { denom: rec.native };
  return null;
}

function parseTerraswapAssetInfo(info: unknown): Pick<ParsedPoolReserve, 'address' | 'denom'> | null {
  const rec = asRecord(info);
  if (!rec) return null;
  const token = asRecord(rec.token);
  if (token && typeof token.contract_addr === 'string') {
    return { address: token.contract_addr };
  }
  const native = asRecord(rec.native_token);
  if (native && typeof native.denom === 'string') {
    return { denom: native.denom };
  }
  return null;
}

function parseGarudaPool(data: Record<string, unknown>): ParsedPoolState | null {
  const a1 = parseGarudaAsset(data.asset1);
  const a2 = parseGarudaAsset(data.asset2);
  const r1 = parseAmount(data.reserve1);
  const r2 = parseAmount(data.reserve2);
  const share = parseAmount(data.total_supply);
  if (!a1 || !a2 || r1 === null || r2 === null || share === null) return null;
  const liquidityToken = typeof data.liquidity_token === 'string' ? data.liquidity_token : undefined;
  return {
    reserves: [
      { ...a1, amountRaw: r1 },
      { ...a2, amountRaw: r2 },
    ],
    totalShare: share,
    liquidityToken,
  };
}

function parseTerraswapPool(data: Record<string, unknown>): ParsedPoolState | null {
  if (!Array.isArray(data.assets) || data.assets.length !== 2) return null;
  const reserves: ParsedPoolReserve[] = [];
  for (const item of data.assets) {
    const rec = asRecord(item);
    if (!rec) return null;
    const info = parseTerraswapAssetInfo(rec.info);
    const amount = parseAmount(rec.amount);
    if (!info || amount === null) return null;
    reserves.push({ ...info, amountRaw: amount });
  }
  const share = parseAmount(data.total_share);
  if (share === null) return null;
  return { reserves, totalShare: share };
}

export function parseDexPoolState(dex: string, raw: unknown): ParsedPoolState | null {
  if (!isSupportedLpDex(dex)) return null;
  const data = asRecord(raw);
  if (!data) return null;
  const d = dex.toLowerCase();
  if (d === 'garuda') return parseGarudaPool(data);
  return parseTerraswapPool(data);
}
