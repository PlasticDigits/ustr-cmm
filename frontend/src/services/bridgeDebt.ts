/**
 * Columbus-5 bridge-debt markets for the treasury Bridge section and CR.
 *
 * The liability is the issuer's outstanding, and only when that equals the
 * debtor's debt-token balance. BSC lock balances are not an input here.
 * A failed or disagreed read is an uncertified market — never a zero.
 */

import { isTerraContractAddress } from '../utils/addresses';
import { BRIDGE, CONTRACTS, DEFAULT_NETWORK } from '../utils/constants';
import { isValidPositivePrice } from '../utils/decimals';
import type { BridgeDebtLiabilityInput } from '../utils/treasuryRatios';
import type { BridgeDebtMarket, BridgeDebtSnapshot } from '../types/bridge';
import { contractService } from './contract';

const PAGE_LIMIT = 30;
const MAX_PAGES = 20;

export interface WasmQuerier {
  query<T>(contract: string, msg: object): Promise<T>;
}

interface RawMarket {
  underlying?: unknown;
  debt_token?: unknown;
  debtor?: unknown;
  decimals?: unknown;
  outstanding?: unknown;
}

interface TokenInfo {
  symbol?: unknown;
  decimals?: unknown;
  total_supply?: unknown;
}

const defaultQuerier: WasmQuerier = {
  query: (contract, msg) => contractService.queryWasmData(contract, msg),
};

function parseUint(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function parseDecimals(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 18) {
    return null;
  }
  return value;
}

function parseSymbol(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asAddress(value: unknown): string | null {
  return typeof value === 'string' && isTerraContractAddress(value) ? value : null;
}

function parseIdentity(raw: RawMarket): {
  underlying: string;
  debtToken: string;
  debtor: string;
  decimals: number;
  outstandingRaw: bigint | null;
} | null {
  const underlying = asAddress(raw.underlying);
  const debtToken = asAddress(raw.debt_token);
  const debtor = asAddress(raw.debtor);
  const decimals = parseDecimals(raw.decimals);
  if (!underlying || !debtToken || !debtor || decimals === null) return null;
  return {
    underlying,
    debtToken,
    debtor,
    decimals,
    outstandingRaw: parseUint(raw.outstanding),
  };
}

async function listMarkets(querier: WasmQuerier, issuer: string): Promise<RawMarket[]> {
  const markets: RawMarket[] = [];
  const seen = new Set<string>();
  let startAfter: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await querier.query<{ markets?: unknown }>(issuer, {
      markets: { limit: PAGE_LIMIT, start_after: startAfter },
    });
    if (!Array.isArray(response.markets)) {
      throw new Error('bridge debt markets response is not a list');
    }
    const batch = response.markets as RawMarket[];
    for (const market of batch) {
      const underlying = asAddress(market.underlying);
      if (!underlying || seen.has(underlying)) {
        throw new Error('bridge debt market list is not readable');
      }
      seen.add(underlying);
      markets.push(market);
    }
    if (batch.length < PAGE_LIMIT) return markets;
    const last = asAddress(batch[batch.length - 1]?.underlying);
    if (!last || last === startAfter) {
      throw new Error('bridge debt market pagination stalled');
    }
    startAfter = last;
  }

  throw new Error('bridge debt market list exceeded the page cap');
}

async function loadMarket(
  querier: WasmQuerier,
  issuer: string,
  treasury: string,
  raw: RawMarket,
): Promise<BridgeDebtMarket> {
  const identity = parseIdentity(raw);
  if (!identity) {
    throw new Error('bridge debt market identity is not readable');
  }

  const blank: BridgeDebtMarket = {
    underlying: identity.underlying,
    underlyingSymbol: '',
    debtToken: identity.debtToken,
    debtSymbol: '',
    debtor: identity.debtor,
    decimals: identity.decimals,
    outstandingRaw: identity.outstandingRaw,
    debtorBalanceRaw: null,
    agreed: false,
    debtorIsTreasury: false,
    queryFailed: true,
  };
  if (identity.outstandingRaw === null) return blank;

  try {
    const balance = await querier.query<{ balance?: unknown }>(identity.debtToken, {
      balance: { address: identity.debtor },
    });
    const debtInfo = await querier.query<TokenInfo>(identity.debtToken, { token_info: {} });
    const debtorResp = await querier.query<{ debtor?: unknown }>(identity.debtToken, { debtor: {} });
    const minterResp = await querier.query<{ minter?: unknown }>(identity.debtToken, { minter: {} });
    const mintersResp = await querier.query<{ minters?: unknown }>(identity.debtToken, { minters: {} });
    const underlyingInfo = await querier.query<TokenInfo>(identity.underlying, { token_info: {} });

    const debtorBalanceRaw = parseUint(balance.balance);
    const supply = parseUint(debtInfo.total_supply);
    const debtDecimals = parseDecimals(debtInfo.decimals);
    const underlyingDecimals = parseDecimals(underlyingInfo.decimals);
    const underlyingSymbol = parseSymbol(underlyingInfo.symbol);
    const debtSymbol = parseSymbol(debtInfo.symbol);
    const receiptDebtor = typeof debtorResp.debtor === 'string' ? debtorResp.debtor : '';
    const minter = typeof minterResp.minter === 'string' ? minterResp.minter : '';
    const extraMinters = Array.isArray(mintersResp.minters) ? mintersResp.minters : null;

    const readable =
      debtorBalanceRaw !== null &&
      supply !== null &&
      debtDecimals !== null &&
      underlyingDecimals !== null &&
      underlyingSymbol.length > 0 &&
      debtSymbol.length > 0 &&
      isTerraContractAddress(receiptDebtor) &&
      isTerraContractAddress(minter) &&
      extraMinters !== null;

    if (!readable) {
      return {
        ...blank,
        underlyingSymbol,
        debtSymbol,
        debtorBalanceRaw,
        queryFailed: true,
      };
    }

    const agreed =
      debtorBalanceRaw === identity.outstandingRaw &&
      supply === identity.outstandingRaw &&
      debtDecimals === identity.decimals &&
      underlyingDecimals === identity.decimals &&
      receiptDebtor === identity.debtor &&
      minter === issuer &&
      extraMinters.length === 0;

    return {
      underlying: identity.underlying,
      underlyingSymbol,
      debtToken: identity.debtToken,
      debtSymbol,
      debtor: identity.debtor,
      decimals: identity.decimals,
      outstandingRaw: identity.outstandingRaw,
      debtorBalanceRaw,
      agreed,
      debtorIsTreasury: agreed && identity.debtor === treasury && receiptDebtor === treasury,
      queryFailed: false,
    };
  } catch (error) {
    console.error(`Failed to certify bridge debt ${identity.underlying}:`, error);
    return blank;
  }
}

export async function fetchBridgeDebts(
  querier: WasmQuerier = defaultQuerier,
  options?: { issuer?: string; treasury?: string },
): Promise<BridgeDebtSnapshot> {
  const issuer = options?.issuer ?? BRIDGE.debtIssuer;
  const treasury = options?.treasury ?? CONTRACTS[DEFAULT_NETWORK].treasury;
  if (!isTerraContractAddress(issuer) || !isTerraContractAddress(treasury)) {
    return { issuer, markets: null };
  }
  try {
    const raws = await listMarkets(querier, issuer);
    const markets: BridgeDebtMarket[] = [];
    for (const raw of raws) {
      markets.push(await loadMarket(querier, issuer, treasury, raw));
    }
    return { issuer, markets };
  } catch (error) {
    console.error('Failed to fetch bridge-debt markets:', error);
    return { issuer, markets: null };
  }
}

const UNCERTIFIED_BRIDGE_DEBT: BridgeDebtLiabilityInput = {
  label: 'Bridge-Debt',
  outstandingRaw: null,
  decimals: 18,
  usd: null,
  certified: false,
};

/**
 * Map a snapshot onto ratio inputs. Null snapshot or an unreadable market
 * list is one uncertified liability, not an empty (certified-zero) list.
 * Only a market whose outstanding matched the treasury's receipt is certified.
 * USD comes from the price map. A missing price stays null.
 */
export function bridgeDebtLiabilities(
  snapshot: BridgeDebtSnapshot | null,
  prices: Record<string, number>,
): BridgeDebtLiabilityInput[] {
  if (!snapshot || snapshot.markets === null) return [UNCERTIFIED_BRIDGE_DEBT];
  return snapshot.markets.map((market) => {
    const certified =
      market.agreed &&
      market.debtorIsTreasury &&
      !market.queryFailed &&
      market.outstandingRaw !== null;
    const unit = prices[market.underlyingSymbol];
    return {
      label: market.underlyingSymbol || 'Bridge-Debt',
      outstandingRaw: certified ? market.outstandingRaw : null,
      decimals: market.decimals,
      usd: isValidPositivePrice(unit) ? unit : null,
      certified,
    };
  });
}
