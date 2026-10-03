import { describe, expect, it, vi } from 'vitest';
import { BRIDGE, CONTRACTS, DEFAULT_NETWORK } from '../utils/constants';
import { bridgeDebtLiabilities, fetchBridgeDebts, type WasmQuerier } from './bridgeDebt';

const TREASURY = CONTRACTS[DEFAULT_NETWORK].treasury;
const ISSUER = BRIDGE.debtIssuer;
const USDT = 'terra1z0xe7t5ymmltg4vju8tghkq0pewy4et548ta23nlu9zxtl950uyqkv8mv4';
const RECEIPT = 'terra1qrxch5xafa077952ds0gep8xm4rq4fuwa30xwc2m3flm4a4swz4qh42xm7';
const OUTSTANDING = '10000000000000000000000';

function terra(tag: string): string {
  const body = `${tag.replace(/[^a-z0-9]/g, 'q')}qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq`.slice(0, 38);
  return `terra1${body}`;
}

function market(partial: Record<string, unknown> = {}) {
  return {
    underlying: USDT,
    debt_token: RECEIPT,
    debtor: TREASURY,
    decimals: 18,
    outstanding: OUTSTANDING,
    ...partial,
  };
}

function querier(
  handler: (contract: string, msg: Record<string, unknown>) => unknown,
): WasmQuerier {
  return {
    query: <T,>(contract: string, msg: object) =>
      Promise.resolve(handler(contract, msg as Record<string, unknown>) as T),
  };
}

function happyHandler(overrides?: {
  balance?: string;
  minter?: string;
  minters?: string[];
  debtor?: string;
  supply?: string;
  symbol?: string;
}) {
  return (contract: string, msg: Record<string, unknown>) => {
    if ('markets' in msg) return { markets: [market()] };
    if ('balance' in msg) return { balance: overrides?.balance ?? OUTSTANDING };
    if ('token_info' in msg) {
      const debt = contract === RECEIPT;
      return {
        name: debt ? 'USDT-Bridge-Debt' : 'Tether USD',
        symbol: debt ? 'USDT-Bridge-Debt' : (overrides?.symbol ?? 'USDT'),
        decimals: 18,
        total_supply: debt ? (overrides?.supply ?? OUTSTANDING) : '1',
      };
    }
    if ('debtor' in msg) return { debtor: overrides?.debtor ?? TREASURY };
    if ('minter' in msg) return { minter: overrides?.minter ?? ISSUER, cap: null };
    if ('minters' in msg) return { minters: overrides?.minters ?? [] };
    throw new Error(`unexpected query ${contract} ${JSON.stringify(msg)}`);
  };
}

describe('fetchBridgeDebts', () => {
  it('certifies USDT when issuer outstanding matches the treasury receipt', async () => {
    const snapshot = await fetchBridgeDebts(querier(happyHandler()), {
      issuer: ISSUER,
      treasury: TREASURY,
    });
    expect(snapshot.markets).toHaveLength(1);
    const row = snapshot.markets?.[0];
    expect(row?.agreed).toBe(true);
    expect(row?.debtorIsTreasury).toBe(true);
    expect(row?.queryFailed).toBe(false);
    expect(row?.outstandingRaw).toBe(BigInt(OUTSTANDING));
    expect(row?.debtorBalanceRaw).toBe(BigInt(OUTSTANDING));
    expect(row?.underlyingSymbol).toBe('USDT');
    expect(row?.debtSymbol).toBe('USDT-Bridge-Debt');
    expect(row?.debtor).toBe(TREASURY);
    expect(row?.debtToken).toBe(RECEIPT);
  });

  it('does not treat a debtor-balance mismatch as zero', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const snapshot = await fetchBridgeDebts(
      querier(happyHandler({ balance: '1' })),
      { issuer: ISSUER, treasury: TREASURY },
    );
    const row = snapshot.markets?.[0];
    expect(snapshot.markets).not.toBeNull();
    expect(row?.agreed).toBe(false);
    expect(row?.debtorIsTreasury).toBe(false);
    expect(row?.queryFailed).toBe(false);
    expect(row?.outstandingRaw).toBe(BigInt(OUTSTANDING));
    expect(row?.debtorBalanceRaw).toBe(1n);
    error.mockRestore();
  });

  it('marks the market failed when the balance query throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const snapshot = await fetchBridgeDebts(
      querier((contract, msg) => {
        if ('balance' in msg) throw new Error('lcd down');
        return happyHandler()(contract, msg);
      }),
      { issuer: ISSUER, treasury: TREASURY },
    );
    const row = snapshot.markets?.[0];
    expect(row?.queryFailed).toBe(true);
    expect(row?.agreed).toBe(false);
    expect(row?.debtorBalanceRaw).toBeNull();
    expect(row?.outstandingRaw).toBe(BigInt(OUTSTANDING));
    error.mockRestore();
  });

  it('returns an unreadable list instead of an empty market set when markets fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const snapshot = await fetchBridgeDebts(
      querier(() => {
        throw new Error('lcd down');
      }),
      { issuer: ISSUER, treasury: TREASURY },
    );
    expect(snapshot.markets).toBeNull();
    error.mockRestore();
  });

  it('rejects an extra minter and a foreign debtor', async () => {
    const extra = await fetchBridgeDebts(
      querier(happyHandler({ minters: [terra('otherminter')] })),
      { issuer: ISSUER, treasury: TREASURY },
    );
    expect(extra.markets?.[0]?.agreed).toBe(false);

    const foreign = terra('nottreasurydebtorxxxxxxxx');
    const other = await fetchBridgeDebts(
      querier((contract, msg) => {
        if ('markets' in msg) {
          return { markets: [market({ debtor: foreign })] };
        }
        if ('balance' in msg) return { balance: OUTSTANDING };
        if ('debtor' in msg) return { debtor: foreign };
        return happyHandler()(contract, msg);
      }),
      { issuer: ISSUER, treasury: TREASURY },
    );
    expect(other.markets?.[0]?.agreed).toBe(true);
    expect(other.markets?.[0]?.debtorIsTreasury).toBe(false);
  });

  it('paginates markets and stops on a short page', async () => {
    const first = Array.from({ length: 30 }, (_, index) =>
      market({
        underlying: terra(`under${index}`),
        debt_token: terra(`debt${index}`),
        outstanding: '0',
      }),
    );
    const second = [
      market({
        underlying: terra('underlast'),
        debt_token: terra('debtlast'),
        outstanding: '0',
      }),
    ];
    const snapshot = await fetchBridgeDebts(
      querier((contract, msg) => {
        if ('markets' in msg) {
          const start = (msg.markets as { start_after?: string }).start_after;
          return { markets: start ? second : first };
        }
        if ('balance' in msg) return { balance: '0' };
        if ('token_info' in msg) {
          return {
            symbol: contract.startsWith(terra('debt').slice(0, 12)) ? 'X-Bridge-Debt' : `U${contract.slice(-2)}`,
            decimals: 18,
            total_supply: '0',
          };
        }
        if ('debtor' in msg) return { debtor: TREASURY };
        if ('minter' in msg) return { minter: ISSUER };
        if ('minters' in msg) return { minters: [] };
        throw new Error('unexpected');
      }),
      { issuer: ISSUER, treasury: TREASURY },
    );
    expect(snapshot.markets).toHaveLength(31);
    expect(snapshot.markets?.every((row) => row.agreed && row.debtorIsTreasury)).toBe(true);
  });
});

describe('bridgeDebtLiabilities', () => {
  it('certifies a treasury borrow at the price-map USD and not at an invented $1', () => {
    const rows = bridgeDebtLiabilities(
      {
        issuer: ISSUER,
        markets: [
          {
            underlying: USDT,
            underlyingSymbol: 'USDT',
            debtToken: RECEIPT,
            debtSymbol: 'USDT-Bridge-Debt',
            debtor: TREASURY,
            decimals: 18,
            outstandingRaw: BigInt(OUTSTANDING),
            debtorBalanceRaw: BigInt(OUTSTANDING),
            agreed: true,
            debtorIsTreasury: true,
            queryFailed: false,
          },
        ],
      },
      { USDT: 1.01 },
    );
    expect(rows).toEqual([
      {
        label: 'USDT',
        outstandingRaw: BigInt(OUTSTANDING),
        decimals: 18,
        usd: 1.01,
        certified: true,
      },
    ]);

    const unpriced = bridgeDebtLiabilities(
      {
        issuer: ISSUER,
        markets: [
          {
            underlying: USDT,
            underlyingSymbol: 'USDT',
            debtToken: RECEIPT,
            debtSymbol: 'USDT-Bridge-Debt',
            debtor: TREASURY,
            decimals: 18,
            outstandingRaw: BigInt(OUTSTANDING),
            debtorBalanceRaw: BigInt(OUTSTANDING),
            agreed: true,
            debtorIsTreasury: true,
            queryFailed: false,
          },
        ],
      },
      {},
    );
    expect(unpriced[0]?.certified).toBe(true);
    expect(unpriced[0]?.usd).toBeNull();
  });

  it('turns a missing list, a mismatch, or a foreign debtor into an uncertified liability', () => {
    expect(bridgeDebtLiabilities(null, { USDT: 1 })).toEqual([
      { label: 'Bridge-Debt', outstandingRaw: null, decimals: 18, usd: null, certified: false },
    ]);
    expect(bridgeDebtLiabilities({ issuer: ISSUER, markets: null }, {})).toEqual([
      { label: 'Bridge-Debt', outstandingRaw: null, decimals: 18, usd: null, certified: false },
    ]);
    expect(bridgeDebtLiabilities({ issuer: ISSUER, markets: [] }, {})).toEqual([]);

    const mismatched = bridgeDebtLiabilities(
      {
        issuer: ISSUER,
        markets: [
          {
            underlying: USDT,
            underlyingSymbol: 'USDT',
            debtToken: RECEIPT,
            debtSymbol: 'USDT-Bridge-Debt',
            debtor: TREASURY,
            decimals: 18,
            outstandingRaw: BigInt(OUTSTANDING),
            debtorBalanceRaw: 1n,
            agreed: false,
            debtorIsTreasury: false,
            queryFailed: false,
          },
        ],
      },
      { USDT: 1 },
    );
    expect(mismatched[0]?.certified).toBe(false);
    expect(mismatched[0]?.outstandingRaw).toBeNull();
  });
});
