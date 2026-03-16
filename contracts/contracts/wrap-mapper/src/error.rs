use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Contract is paused")]
    Paused,

    #[error("No CW20 mapping for denom: {denom}")]
    NoDenomMapping { denom: String },

    #[error("No denom mapping for CW20 contract: {address}")]
    NoCw20Mapping { address: String },

    #[error("Rate limit exceeded for denom: {denom}")]
    RateLimitExceeded { denom: String },

    #[error("Zero amount not allowed")]
    ZeroAmount,

    #[error("No pending governance transfer")]
    NoPendingGovernance,

    #[error("Timelock not expired: {remaining_seconds} seconds remaining")]
    TimelockNotExpired { remaining_seconds: u64 },

    #[error("Fee too high: {fee_bps} bps exceeds max {max_bps} bps")]
    FeeTooHigh { fee_bps: u16, max_bps: u16 },
}
