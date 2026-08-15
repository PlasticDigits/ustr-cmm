use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Timestamp, Uint128};
use cw_storage_plus::{Item, Map};

pub const CONTRACT_NAME: &str = "crates.io:wrap-mapper";
pub const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// 7 days in seconds
pub const GOVERNANCE_TIMELOCK: u64 = 604_800;

/// Default instantiate fee when `fee_*_bps` omitted (LocalTerra / tests).
pub const DEFAULT_FEE_BPS: u16 = 50;

/// # Invariants ([#9](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/9))
///
/// - Wrap and unwrap fees are independent. Wrap path is untaxed
///   (`NotifyDeposit`); unwrap path skims `fee_unwrap_bps` then treasury
///   `InstantWithdraw` → `BankMsg::Send` (receiver pays burn tax).
/// - **Solvency:** unwrap burns `A` CW20 and withdraws `A − fee_unwrap`.
///   User-paid tax does **not** erode `native ≥ supply`; surplus Δ ≈
///   `+fee_unwrap` per unwrap. Therefore **`fee_unwrap_bps` need not cover
///   burn tax** (no InstantWithdraw gross-up under this policy).
/// - Do not reintroduce a single `fee_bps` or a “fee ≥ tax” floor on unwrap.
#[cw_serde]
pub struct Config {
    pub governance: Addr,
    pub treasury: Addr,
    pub paused: bool,
    /// Fee in basis points charged on wrap / NotifyDeposit (e.g. 200 = 2%).
    /// Fee residual stays in treasury as native profit.
    pub fee_wrap_bps: u16,
    /// Fee in basis points charged on unwrap only. Tuned so
    /// `(1 - fee_unwrap) × (1 - burn_tax_rate) ≈ 0.98` (see DEPLOYMENT retune rule).
    pub fee_unwrap_bps: u16,
}

/// Pre-#9 on-disk config (single `fee_bps` for wrap and unwrap). Migrate only.
#[cw_serde]
pub struct ConfigLegacy {
    pub governance: Addr,
    pub treasury: Addr,
    pub paused: bool,
    pub fee_bps: u16,
}

pub const MAX_FEE_BPS: u16 = 1000; // 10% hard cap

/// Minimum fee in basis points for wrap **or** unwrap. Zero is rejected.
///
/// This is **not** a “must cover chain tax” floor. Under [#9](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/9)
/// tax incidence stays on the unwrap receiver; `fee_unwrap_bps` may be well
/// below `burn_tax_rate` (e.g. 51 vs 150 bps) without breaking `native ≥ supply`.
pub const MIN_FEE_BPS: u16 = 1;

#[cw_serde]
pub struct PendingGovernance {
    pub new_address: Addr,
    pub execute_after: Timestamp,
}

pub const CONFIG: Item<Config> = Item::new("config");
pub const PENDING_GOVERNANCE: Item<PendingGovernance> = Item::new("pending_governance");

/// Maps native denom (e.g. "uluna") to the CW20 contract address
pub const DENOM_TO_CW20: Map<&str, Addr> = Map::new("denom_to_cw20");

/// Reverse map: CW20 contract address -> native denom
pub const CW20_TO_DENOM: Map<&str, String> = Map::new("cw20_to_denom");

#[cw_serde]
pub struct RateLimitConfig {
    pub max_amount_per_window: Uint128,
    pub window_seconds: u64,
}

#[cw_serde]
pub struct RateLimitState {
    pub current_window_start: Timestamp,
    pub amount_used: Uint128,
}

/// Rate limit configuration per denom
pub const RATE_LIMITS: Map<&str, RateLimitConfig> = Map::new("rate_limits");

/// Current rate limit window state per denom
pub const RATE_LIMIT_STATE: Map<&str, RateLimitState> = Map::new("rate_limit_state");
