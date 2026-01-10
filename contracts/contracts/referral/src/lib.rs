//! # Referral Contract
//!
//! This contract manages referral code registration for the USTR CMM system.
//!
//! ## Features
//!
//! - Users can register unique referral codes by burning 10 USTR
//! - Codes are 1-20 characters, alphanumeric with underscore and hyphen (a-z0-9_-)
//! - Case-insensitive (stored as lowercase)
//! - No admin, no configurable parameters
//! - Queried by the Swap contract to validate codes and get owner addresses
//!
//! ## Registration Flow
//!
//! 1. User calls USTR token: `Send { contract: referral_addr, amount: 10 USTR, msg: RegisterCode { code } }`
//! 2. Contract validates code format and uniqueness
//! 3. Burns the 10 USTR
//! 4. Stores code → owner mapping
//!
//! ## Economic Rationale
//!
//! - 10 USTR cost prevents spam/squatting
//! - Burns USTR supply (deflationary)
//! - Enables +10% bonus to referrer and +10% to user during swaps

pub mod contract;
pub mod error;
pub mod msg;
pub mod state;

pub use crate::error::ContractError;
