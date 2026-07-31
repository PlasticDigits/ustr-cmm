//! Treasury Contract - Asset Custody for USTR CMM
//!
//! This contract serves as the secure custodian for all protocol assets including
//! USTC received from swaps and future collateral basket assets.
//!
//! # Features
//! - Holds native tokens (USTC, LUNC, etc.) and CW20 tokens
//! - Governance address with 7-day timelock on changes
//! - Two-step governance transfer (propose → accept)
//! - Unified withdrawal interface for all asset types
//! - Native wrap path (`WrapDeposit` / `InstantWithdraw`) via denom wrappers
//! - CW20 InstantWithdraw path for registered spenders (e.g. ust1-window / vFDUSD)
//!
//! # Security
//! - Governance changes require 7-day waiting period
//! - Current governance can cancel pending transfers
//! - All actions emit events for transparency
//! - CW20 InstantWithdraw requires explicit gov-registered spender per token;
//!   pause is independent of native wrapping pause (see `skills/treasury-cw20-instant-withdraw/`)

pub mod contract;
pub mod error;
pub mod msg;
pub mod state;

pub use crate::error::ContractError;

