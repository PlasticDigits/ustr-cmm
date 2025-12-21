//! Message types for the Airdrop contract

use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Uint128};

/// A recipient with their allocated amount
#[cw_serde]
pub struct Recipient {
    /// Recipient address
    pub address: String,
    /// Amount to send
    pub amount: Uint128,
}

/// Instantiate message
#[cw_serde]
pub struct InstantiateMsg {
    /// Admin address
    pub admin: String,
}

/// Execute messages
#[cw_serde]
pub enum ExecuteMsg {
    /// Distributes CW20 tokens to multiple recipients
    /// Requires sender to have approved sufficient allowance
    Airdrop {
        /// CW20 token contract address
        token: String,
        /// List of recipients and amounts
        recipients: Vec<Recipient>,
    },
}

/// Query messages
#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    /// Returns contract configuration
    #[returns(ConfigResponse)]
    Config {},
}

/// Response for Config query
#[cw_serde]
pub struct ConfigResponse {
    pub admin: Addr,
}

