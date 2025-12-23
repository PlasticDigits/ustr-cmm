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

    #[error("Invalid amount: withdrawal amount must be greater than zero")]
    ZeroWithdrawAmount,

    #[error("Swap contract not set")]
    SwapContractNotSet,

    #[error("Invalid funds: expected exactly USTC (uusd), received {received:?}")]
    InvalidSwapFunds { received: Vec<String> },

    #[error("Minimum swap deposit is 1 USTC (1,000,000 uusd), received {received}")]
    BelowMinimumSwap { received: String },
}

