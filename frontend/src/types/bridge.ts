/**
 * BSC lock/unlock holdings shown on the treasury page.
 * These balances are not treasury assets and are not CR inputs.
 */

export interface BridgeTokenHolding {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  gradient: string;
  iconColor: string;
  /** Key into the display price map. Never passed to ratio math. */
  priceSymbol: string;
  /** Null when every public BSC endpoint failed for this token. */
  balance: bigint | null;
}

export interface BridgeHoldings {
  lockAddress: string;
  tokens: BridgeTokenHolding[];
}
