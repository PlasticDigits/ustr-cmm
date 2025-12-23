//! Error types for the Treasury contract

use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized: only governance can perform this action")]
    Unauthorized,

    #[error("No pending governance proposal for address: {address}")]
    NoPendingGovernanceForAddress { address: String },

    #[error("Timelock not expired: {remaining_seconds} seconds remaining")]
    TimelockNotExpired { remaining_seconds: u64 },

    #[error("Insufficient balance: requested {requested}, available {available}")]
    InsufficientBalance { requested: String, available: String },

    #[error("CW20 token already in whitelist: {contract_addr}")]
    Cw20AlreadyWhitelisted { contract_addr: String },

    #[error("CW20 token not in whitelist: {contract_addr}")]
    Cw20NotWhitelisted { contract_addr: String },

    #[error("No pending withdrawal found for ID: {withdrawal_id}")]
    NoPendingWithdrawal { withdrawal_id: String },
}

