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

/**
 * One XXX-Bridge-Debt market. The receipt balance is the borrow record, not a
 * treasury asset. `outstandingRaw` is the issuer figure; it is usable for
 * ratios only when `agreed` and `debtorIsTreasury` are both true.
 */
export interface BridgeDebtMarket {
  underlying: string;
  /** CW20 symbol of the bridged token, used as the price-map key. */
  underlyingSymbol: string;
  debtToken: string;
  debtSymbol: string;
  debtor: string;
  decimals: number;
  /** Issuer market outstanding. Null when that field could not be read. */
  outstandingRaw: bigint | null;
  /** Debtor's debt-token balance. Null when that query failed. */
  debtorBalanceRaw: bigint | null;
  /**
   * Outstanding equals the debtor balance and the receipt's supply, decimals,
   * debtor, and sole minter (the issuer) all match. A false result is not $0.
   */
  agreed: boolean;
  /** Debtor on the market and on the receipt is the CMM treasury. */
  debtorIsTreasury: boolean;
  /** A required query threw or returned an unusable field. */
  queryFailed: boolean;
}

export interface BridgeDebtSnapshot {
  issuer: string;
  /** Null when the market list could not be read in full. */
  markets: BridgeDebtMarket[] | null;
}
