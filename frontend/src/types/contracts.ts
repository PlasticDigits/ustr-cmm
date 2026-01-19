/**
 * Contract type definitions for USTR CMM
 * 
 * These types mirror the Rust contract message types for type-safe
 * interaction with the smart contracts from the frontend.
 */

// ============================================
// Common Types
// ============================================

export type AssetInfo =
  | { native: { denom: string } }
  | { cw20: { contract_addr: string } };

export interface Asset {
  info: AssetInfo;
  amount: string;
}

// ============================================
// USTR Token Types (CW20)
// ============================================

export interface Cw20TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  total_supply: string;
}

export interface Cw20Balance {
  balance: string;
}

export interface Cw20Minters {
  minters: string[];
}

// ============================================
// Treasury Contract Types
// ============================================

export interface TreasuryConfig {
  governance: string;
  timelock_duration: number;
}

export interface PendingGovernance {
  new_governance: string;
  execute_after: string;
  time_remaining: number;
}

export interface TreasuryBalance {
  asset: AssetInfo;
  amount: string;
}

export interface TreasuryAllBalances {
  native: Array<{ denom: string; amount: string }>;
  cw20: Array<{ contract_addr: string; amount: string }>;
}

// ============================================
// USTC-Swap Contract Types
// ============================================

export interface SwapConfig {
  ustr_token: string;
  treasury: string;
  start_time: string;
  end_time: string;
  start_rate: string;
  end_rate: string;
  admin: string;
  ustc_denom: string;
  paused: boolean;
}

export interface SwapRate {
  rate: string;
  timestamp: string;
}

export interface SwapSimulation {
  ustc_amount: string;
  ustr_amount: string;
  rate: string;
}

export interface SwapStatus {
  started: boolean;
  ended: boolean;
  paused: boolean;
  seconds_until_start: number;
  seconds_until_end: number;
  elapsed_seconds: number;
}

export interface SwapStats {
  total_ustc_received: string;
  total_ustr_minted: string;
  swap_count: number;
}

// ============================================
// Query Messages
// ============================================

export type TreasuryQueryMsg =
  | { config: Record<string, never> }
  | { pending_governance: Record<string, never> }
  | { balance: { asset: AssetInfo } }
  | { all_balances: Record<string, never> };

export type SwapQueryMsg =
  | { config: Record<string, never> }
  | { current_rate: Record<string, never> }
  | { swap_simulation: { ustc_amount: string } }
  | { status: Record<string, never> }
  | { stats: Record<string, never> };

// ============================================
// Execute Messages
// ============================================

export type TreasuryExecuteMsg =
  | { propose_governance: { new_governance: string } }
  | { accept_governance: Record<string, never> }
  | { cancel_governance_proposal: Record<string, never> }
  | { withdraw: { destination: string; asset: AssetInfo; amount: string } };

export type SwapExecuteMsg =
  | { swap: Record<string, never> }
  | { emergency_pause: Record<string, never> }
  | { emergency_resume: Record<string, never> }
  | { update_admin: { new_admin: string } };

// ============================================
// Referral Contract Types
// ============================================

export interface ReferralConfig {
  ustr_token: string;
}

export interface CodeInfo {
  code: string;
  owner: string;
}

export interface CodesResponse {
  codes: string[];
}

export interface ValidateResponse {
  is_valid_format: boolean;
  is_registered: boolean;
  owner: string | null;
}

// Query messages
export type ReferralQueryMsg =
  | { config: Record<string, never> }
  | { code_info: { code: string } }
  | { codes_by_owner: { owner: string } }
  | { validate_code: { code: string } };

// Execute message (embedded in CW20 Send)
export interface RegisterCodeMsg {
  code: string;
}

