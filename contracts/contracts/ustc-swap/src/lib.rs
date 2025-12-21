//! USTC Swap Contract - Time-Decaying USTC→USTR Exchange
//!
//! This contract implements a one-way swap mechanism that allows users to
//! convert USTC into USTR at a rate that increases over 100 days.
//!
//! # Economic Model
//! - Start rate: 1.5 USTC per 1 USTR
//! - End rate: 2.5 USTC per 1 USTR
//! - Duration: 100 days (8,640,000 seconds)
//! - Rate updates continuously per-second
//!
//! # Flow
//! 1. User sends USTC with Swap message
//! 2. Contract calculates current rate based on elapsed time
//! 3. USTC is transferred to treasury
//! 4. USTR is minted to user
//!
//! # Post-Duration
//! After 100 days, no further USTR can be issued through this contract.

pub mod contract;
pub mod error;
pub mod msg;
pub mod state;

pub use crate::error::ContractError;

