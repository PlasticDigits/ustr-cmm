//! Error types for the Referral contract

use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized: only USTR token can call this")]
    UnauthorizedToken,

    #[error("Invalid amount: exactly 10 USTR required for registration")]
    InvalidAmount,

    #[error("Code already registered")]
    CodeAlreadyRegistered,

    #[error("Invalid code: must be 1-20 characters")]
    InvalidCodeLength,

    #[error("Invalid code: only lowercase letters, numbers, underscore, and hyphen allowed (a-z0-9_-)")]
    InvalidCodeCharacters,

    #[error("Code cannot be empty")]
    EmptyCode,

    #[error("Maximum codes per owner reached (limit: 10)")]
    MaxCodesPerOwnerReached,
}
