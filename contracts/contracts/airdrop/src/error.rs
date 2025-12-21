//! Error types for the Airdrop contract

use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("No recipients provided")]
    NoRecipients,

    #[error("Invalid recipient address: {address}")]
    InvalidRecipient { address: String },

    #[error("Zero amount not allowed for recipient: {address}")]
    ZeroAmount { address: String },

    #[error("Duplicate recipient address: {address}")]
    DuplicateRecipient { address: String },
}

