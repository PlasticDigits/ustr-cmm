//! Airdrop Contract - Batch CW20 Token Distribution
//!
//! This contract enables batch distribution of CW20 tokens to multiple
//! recipients in a single transaction, similar to disperse.app.
//!
//! # Features
//! - Distribute any CW20 token to multiple recipients
//! - Atomic execution: entire airdrop fails if any transfer fails
//! - No maximum recipients (limited only by block gas limit)
//!
//! # Usage
//! 1. Approve this contract to spend your CW20 tokens
//! 2. Call Airdrop with token address and recipient list
//! 3. All transfers happen in a single atomic transaction

pub mod contract;
pub mod error;
pub mod msg;
pub mod state;

pub use crate::error::ContractError;

