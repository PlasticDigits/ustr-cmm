//! State definitions for the Airdrop contract

use cosmwasm_schema::cw_serde;
use cosmwasm_std::Addr;
use cw_storage_plus::Item;

/// Contract configuration
#[cw_serde]
pub struct Config {
    /// Admin address (for potential future extensions)
    pub admin: Addr,
}

/// Contract name for cw2 migration info
pub const CONTRACT_NAME: &str = "crates.io:airdrop";
/// Contract version for cw2 migration info
pub const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Primary config storage
pub const CONFIG: Item<Config> = Item::new("config");

