//! State definitions for the Referral contract

use cosmwasm_schema::cw_serde;
use cosmwasm_std::Addr;
use cw_storage_plus::{Item, Map};

/// Contract configuration
#[cw_serde]
pub struct Config {
    /// Address of the USTR CW20 contract
    pub ustr_token: Addr,
}

/// Contract name for cw2 migration info
pub const CONTRACT_NAME: &str = "crates.io:referral";
/// Contract version for cw2 migration info
pub const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Registration fee: 10 USTR (with 18 decimals)
pub const REGISTRATION_FEE: u128 = 10_000_000_000_000_000_000;

/// Minimum code length
pub const MIN_CODE_LENGTH: usize = 1;
/// Maximum code length
pub const MAX_CODE_LENGTH: usize = 20;

/// Primary config storage
pub const CONFIG: Item<Config> = Item::new("config");

/// Map of normalized (lowercase) codes to owner addresses
pub const CODES: Map<&str, Addr> = Map::new("codes");

/// Map of owner addresses to their registered codes
pub const OWNER_CODES: Map<&Addr, Vec<String>> = Map::new("owner_codes");
