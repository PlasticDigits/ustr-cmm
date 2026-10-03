import { describe, expect, it, vi } from 'vitest';
import { BRIDGE } from '../utils/constants';
import { fetchBridgeHoldings } from './bridgeHoldings';

describe('BRIDGE', () => {
  it('is excluded from CMM ratios and pins the lock address tokens', () => {
    expect(BRIDGE.countedInCmmRatios).toBe(false);
    expect(BRIDGE.lockAddress).toBe('0xD7b3Bf05987052009c350874E810Df98dA95D258');
    expect(BRIDGE.debtIssuer).toBe('terra12c6hyez8fvvcrfhvq04xc8t63y7kmmdrkktlwefx4txrgf6peuxqk5x6rq');
    expect(BRIDGE.tokens.map((token) => [token.symbol, token.address, token.decimals])).toEqual([
      ['USDT', '0x55d398326f99059ff775485246999027b3197955', 18],
      ['CL8Y', '0x8f452a1fdd388a45e1080992eff051b4dd9048d2', 18],
    ]);
  });
});

describe('fetchBridgeHoldings', () => {
  it('reads USDT and CL8Y at the lock address and does not attach ratio fields', async () => {
    const calls: Array<[string, string]> = [];
    const holdings = await fetchBridgeHoldings({
      erc20Balance: async (token, holder) => {
        calls.push([token, holder]);
        return token.startsWith('0x55') ? 1_000n : 2_000n;
      },
    });
    expect(calls).toEqual([
      [BRIDGE.tokens[0].address, BRIDGE.lockAddress],
      [BRIDGE.tokens[1].address, BRIDGE.lockAddress],
    ]);
    expect(holdings.lockAddress).toBe(BRIDGE.lockAddress);
    expect(holdings.tokens.map((token) => token.balance)).toEqual([1_000n, 2_000n]);
    for (const token of holdings.tokens) {
      expect(token).not.toHaveProperty('crUsd');
      expect(token).not.toHaveProperty('displayUsd');
    }
  });

  it('keeps a null balance when one token query fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const holdings = await fetchBridgeHoldings({
      erc20Balance: async (token) => {
        if (token === BRIDGE.tokens[1].address) throw new Error('rpc down');
        return 5n;
      },
    });
    expect(holdings.tokens[0].balance).toBe(5n);
    expect(holdings.tokens[1].balance).toBeNull();
    expect(holdings.tokens[1].symbol).toBe('CL8Y');
    error.mockRestore();
  });
});
