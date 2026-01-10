//! Message types for the Referral contract

use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::Addr;
use cw20::Cw20ReceiveMsg;

/// Instantiate message
#[cw_serde]
pub struct InstantiateMsg {
    /// USTR token contract address
    pub ustr_token: String,
}

/// Execute messages
#[cw_serde]
pub enum ExecuteMsg {
    /// CW20 receive hook - handles USTR deposits for code registration
    /// The embedded message should be RegisterCodeMsg
    Receive(Cw20ReceiveMsg),
}

/// Message embedded in CW20 Send for code registration
#[cw_serde]
pub struct RegisterCodeMsg {
    /// The referral code to register (1-20 chars, a-z0-9_- only)
    pub code: String,
}

/// Query messages
#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    /// Returns contract configuration
    #[returns(ConfigResponse)]
    Config {},

    /// Returns owner address if code exists (case-insensitive lookup)
    #[returns(Option<CodeInfoResponse>)]
    CodeInfo { code: String },

    /// Returns all codes owned by an address
    #[returns(CodesResponse)]
    CodesByOwner { owner: String },

    /// Returns whether code format is valid and if it's registered
    #[returns(ValidateResponse)]
    ValidateCode { code: String },
}

/// Response for Config query
#[cw_serde]
pub struct ConfigResponse {
    pub ustr_token: Addr,
}

/// Response for CodeInfo query
#[cw_serde]
pub struct CodeInfoResponse {
    /// The normalized (lowercase) code
    pub code: String,
    /// Owner address
    pub owner: Addr,
}

/// Response for CodesByOwner query
#[cw_serde]
pub struct CodesResponse {
    /// List of codes owned by the address
    pub codes: Vec<String>,
}

/// Response for ValidateCode query
#[cw_serde]
pub struct ValidateResponse {
    /// Whether the code format is valid (correct length and characters)
    pub is_valid_format: bool,
    /// Whether the code is registered
    pub is_registered: bool,
    /// Owner address if registered
    pub owner: Option<Addr>,
}
