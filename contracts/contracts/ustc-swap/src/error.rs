//! Error types for the USTC Swap contract

use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

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

    #[error("Invalid funds: expected exactly USTC (uusd)")]
    InvalidFunds,

    #[error("Minimum swap amount is 1 USTC (1,000,000 uusd)")]
    BelowMinimumSwap,

    #[error("No funds sent")]
    NoFundsSent,

    #[error("Asset recovery only available after swap period ends")]
    RecoveryNotAvailable,

    #[error("Invalid address: {reason}")]
    InvalidAddress { reason: String },
}

