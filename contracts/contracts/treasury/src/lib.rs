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
//!
//! # Security
//! - Governance changes require 7-day waiting period
//! - Current governance can cancel pending transfers
//! - All actions emit events for transparency

pub mod contract;
pub mod error;
pub mod msg;
pub mod state;

pub use crate::error::ContractError;

