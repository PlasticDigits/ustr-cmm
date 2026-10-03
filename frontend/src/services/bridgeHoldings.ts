/**
 * BSC lock/unlock balances for the treasury Bridge section.
 * Display only — do not pass the result into computeTreasuryRatios.
 */

import { BRIDGE } from '../utils/constants';
import type { BridgeHoldings, BridgeTokenHolding } from '../types/bridge';
import { bscRpcClient, type BscRpcClient } from './bscRpc';

export async function fetchBridgeHoldings(
  reader: Pick<BscRpcClient, 'erc20Balance'> = bscRpcClient,
): Promise<BridgeHoldings> {
  const tokens: BridgeTokenHolding[] = [];
  for (const token of BRIDGE.tokens) {
    try {
      const balance = await reader.erc20Balance(token.address, BRIDGE.lockAddress);
      tokens.push({
        symbol: token.symbol,
        name: token.name,
        address: token.address,
        decimals: token.decimals,
        gradient: token.gradient,
        iconColor: token.iconColor,
        priceSymbol: token.priceSymbol,
        balance,
      });
    } catch (error) {
      console.error(`Failed to fetch bridge ${token.symbol} balance:`, error);
      tokens.push({
        symbol: token.symbol,
        name: token.name,
        address: token.address,
        decimals: token.decimals,
        gradient: token.gradient,
        iconColor: token.iconColor,
        priceSymbol: token.priceSymbol,
        balance: null,
      });
    }
  }
  return { lockAddress: BRIDGE.lockAddress, tokens };
}
