/**
 * Load allowlisted protocol LP positions for the treasury (#14).
 *
 * Only `tokenlist.json` `type: "lp"` rows are queried. Factory discovery is not CR input.
 */

import { contractService } from './contract';
import { isTerraContractAddress } from '../utils/addresses';
import {
  classifyLpLeg,
  isRawProtocolHolding,
  isSupportedLpDex,
  knownSpotCw20Addresses,
  protocolPins,
} from '../utils/lpEligibility';
import { protocolTokenIdFromLeg, type ProtocolTokenId } from '../utils/availableSupply';
import { parseDexPoolState, type ParsedPoolReserve } from '../utils/lpPoolParse';
import type { TokenList, TokenListEntry, TokenListPoolAsset } from '../types/tokenlist';
import { isLpTokenListEntry } from '../types/tokenlist';
import type { LpLegKind } from '../utils/lpEligibility';

export interface LpChainLeg {
  symbol: string;
  address?: string;
  denom?: string;
  amountRaw: bigint;
  decimals: number;
  kind: LpLegKind;
}

export interface LpChainPosition {
  symbol: string;
  displayName: string;
  pairLabel: string;
  pairSymbols?: [string, string];
  lpAddress: string;
  pairAddress: string;
  dex: string;
  gradient: string;
  iconColor: string;
  lpBalance: bigint;
  lpDecimals: number;
  totalShare: bigint | null;
  legs: LpChainLeg[] | null;
  queryFailed: boolean;
  /** True when the LP CW20 balance query itself failed (cannot certify CMM-owned). */
  balanceUnknown: boolean;
  /** Protocol tokens declared on the tokenlist pin (for CMM-owned fail-closed). */
  declaredProtocolIds: ProtocolTokenId[];
}

function reserveKey(r: { address?: string; denom?: string }): string | null {
  if (r.address) return `cw20:${r.address}`;
  if (r.denom) return `native:${r.denom}`;
  return null;
}

function matchDeclaredToReserves(
  declared: TokenListPoolAsset[],
  reserves: ParsedPoolReserve[]
): Array<TokenListPoolAsset & ParsedPoolReserve> | null {
  if (declared.length !== 2 || reserves.length !== 2) return null;
  const used = new Set<number>();
  const matched: Array<TokenListPoolAsset & ParsedPoolReserve> = [];
  for (const dec of declared) {
    const want = reserveKey(dec);
    if (!want) return null;
    const idx = reserves.findIndex((r, i) => !used.has(i) && reserveKey(r) === want);
    if (idx < 0) return null;
    used.add(idx);
    matched.push({ ...dec, ...reserves[idx] });
  }
  return matched;
}

function decimalsForLeg(
  leg: TokenListPoolAsset & ParsedPoolReserve,
  tokens: TokenListEntry[]
): number | null {
  if (leg.denom === 'uluna' || leg.denom === 'uusd') return 6;
  const pins = protocolPins();
  if (leg.address === pins.ust1 || leg.address === pins.cLunc || leg.address === pins.cUstc) return 6;
  if (leg.address === pins.ustr) return 18;
  const spot = tokens.find((t) => t.type === 'cw20' && t.address && t.address === leg.address);
  if (spot && Number.isInteger(spot.decimals)) return spot.decimals;
  return null;
}

function nativeSymbol(denom: string | undefined): string | null {
  if (denom === 'uluna') return 'LUNC';
  if (denom === 'uusd') return 'USTC';
  return null;
}

function declaredProtocolIds(
  declared: TokenListPoolAsset[] | undefined,
  knownCw20: ReadonlySet<string>
): ProtocolTokenId[] {
  if (!declared) return [];
  const ids = new Set<ProtocolTokenId>();
  for (const asset of declared) {
    const kind = classifyLpLeg(
      { symbol: asset.symbol, address: asset.address, denom: asset.denom },
      knownCw20
    );
    const id = protocolTokenIdFromLeg(kind, asset.address);
    if (id) ids.add(id);
  }
  return [...ids];
}

export async function fetchTreasuryLpPositions(
  tokenList: TokenList,
  treasuryAddress: string
): Promise<LpChainPosition[]> {
  if (!isTerraContractAddress(treasuryAddress)) return [];

  const knownCw20 = knownSpotCw20Addresses(tokenList.tokens);
  const out: LpChainPosition[] = [];

  for (const token of tokenList.tokens) {
    if (!isLpTokenListEntry(token)) continue;
    if (isRawProtocolHolding(token)) continue;

    const pairAddress = token.pool?.address;
    const lpAddress = token.address;
    const dex = token.pool?.dex ?? '';
    const declared = token.pool?.assets;

    const base = {
      symbol: token.symbol,
      displayName: token.symbol,
      pairLabel: token.pool?.name || token.name || token.symbol,
      pairSymbols:
        declared && declared.length === 2 && declared[0].symbol && declared[1].symbol
          ? ([declared[0].symbol, declared[1].symbol] as [string, string])
          : undefined,
      lpAddress: lpAddress ?? '',
      pairAddress: pairAddress ?? '',
      dex,
      gradient: token.gradient,
      iconColor: token.iconColor,
      lpDecimals: token.decimals,
      declaredProtocolIds: declaredProtocolIds(declared, knownCw20),
      balanceUnknown: false,
    };

    if (
      !isTerraContractAddress(lpAddress) ||
      !isTerraContractAddress(pairAddress) ||
      !isSupportedLpDex(dex) ||
      !declared ||
      declared.length !== 2
    ) {
      out.push({
        ...base,
        lpBalance: 0n,
        totalShare: null,
        legs: null,
        queryFailed: true,
      });
      continue;
    }

    let lpBalance = 0n;
    try {
      const bal = await contractService.getTokenBalanceStrict(lpAddress, treasuryAddress);
      lpBalance = BigInt(bal.balance || '0');
    } catch (error) {
      console.error(`Failed to fetch LP balance ${token.symbol}:`, error);
      out.push({
        ...base,
        lpBalance: 0n,
        totalShare: null,
        legs: null,
        queryFailed: true,
        balanceUnknown: true,
      });
      continue;
    }

    if (lpBalance === 0n) {
      continue;
    }

    try {
      const raw = await contractService.getDexPoolRaw(pairAddress, dex);
      const parsed = raw ? parseDexPoolState(dex, raw) : null;
      if (!parsed) {
        out.push({ ...base, lpBalance, totalShare: null, legs: null, queryFailed: true });
        continue;
      }
      if (parsed.liquidityToken && parsed.liquidityToken !== lpAddress) {
        console.error(`LP token mismatch for ${token.symbol}: tokenlist ${lpAddress} vs pool ${parsed.liquidityToken}`);
        out.push({ ...base, lpBalance, totalShare: null, legs: null, queryFailed: true });
        continue;
      }

      const matched = matchDeclaredToReserves(declared, parsed.reserves);
      if (!matched) {
        out.push({ ...base, lpBalance, totalShare: parsed.totalShare, legs: null, queryFailed: true });
        continue;
      }

      const legs: LpChainLeg[] = [];
      let decOk = true;
      for (const row of matched) {
        const decimals = decimalsForLeg(row, tokenList.tokens);
        if (decimals === null) {
          decOk = false;
          break;
        }
        const symbol = row.symbol || nativeSymbol(row.denom) || 'UNKNOWN';
        legs.push({
          symbol,
          address: row.address,
          denom: row.denom,
          amountRaw: row.amountRaw,
          decimals,
          kind: classifyLpLeg({ symbol, address: row.address, denom: row.denom }, knownCw20),
        });
      }
      if (!decOk) {
        out.push({ ...base, lpBalance, totalShare: parsed.totalShare, legs: null, queryFailed: true });
        continue;
      }

      out.push({
        ...base,
        pairSymbols:
          legs.length === 2 ? [legs[0].symbol, legs[1].symbol] : base.pairSymbols,
        lpBalance,
        totalShare: parsed.totalShare,
        legs,
        queryFailed: false,
      });
    } catch (error) {
      console.error(`Failed to query LP pool ${token.symbol}:`, error);
      out.push({ ...base, lpBalance, totalShare: null, legs: null, queryFailed: true });
    }
  }

  return out;
}
