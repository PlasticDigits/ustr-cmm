//! Error types for the USTC Swap contract

use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("USTR token has {actual} decimals, expected {expected}")]
    InvalidUstrDecimals { expected: u8, actual: u8 },

    #[error("Unauthorized: only admin can perform this action")]
    Unauthorized,

    #[error("Unauthorized: only pending admin can accept")]
    UnauthorizedPendingAdmin,

    #[error("No pending admin change")]
    NoPendingAdmin,

    #[error("Timelock not expired: {remaining_seconds} seconds remaining")]
    TimelockNotExpired { remaining_seconds: u64 },

    #[error("Swap is paused")]
    SwapPaused,

    #[error("Swap period has not started yet")]
    SwapNotStarted,

    #[error("Swap period has ended")]
    SwapEnded,

    #[error("Minimum swap amount is 1 USTC (1,000,000 uusd)")]
    BelowMinimumSwap,

    #[error("Asset recovery only available after swap period ends")]
    RecoveryNotAvailable,

    #[error("Invalid address: {reason}")]
    InvalidAddress { reason: String },

    #[error("No USTC funds sent")]
    NoFundsSent,

    #[error("Only USTC (uusd) is accepted")]
    WrongDenom,

    #[error("Multiple denominations sent, only USTC (uusd) is accepted")]
    MultipleDenoms,

    #[error("Invalid referral code: {code}")]
    InvalidReferralCode { code: String },

    #[error("Referral code not registered: {code}")]
    ReferralCodeNotRegistered { code: String },

    #[error("Mint amount {mint_amount} exceeds 5% safety limit of total supply {total_supply}")]
    MintExceedsSafetyLimit {
        mint_amount: String,
        total_supply: String,
    },
}

