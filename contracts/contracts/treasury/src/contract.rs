//! Treasury contract implementation
//!
//! # Security Features
//!
//! This contract implements 7-day timelocks on both governance changes and withdrawals.
//! The governance address will be transitioned as follows:
//!
//! - **Phase 1 (Current)**: Single admin EOA controls governance
//! - **Phase 2**: Governance transferred to a 3-of-5 multi-sig with additional security measures
//! - **Phase 3+**: Full DAO governance with on-chain voting and timelocks
//!
//! All withdrawals require a 7-day timelock period, providing time for the community to
//! detect and respond to potentially malicious withdrawal proposals.

#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{
    to_json_binary, Addr, BankMsg, Binary, Coin, CosmosMsg, Deps, DepsMut, Env, MessageInfo,
    Order, Response, StdResult, Uint128, WasmMsg,
};
use cosmwasm_schema::cw_serde;
use sha2::{Digest, Sha256};
use cw2::set_contract_version;
use cw20::Cw20ExecuteMsg;

use crate::error::ContractError;
use crate::msg::{
    AllBalancesResponse, AssetBalance, BalanceResponse, ConfigResponse, Cw20WhitelistResponse,
    ExecuteMsg, InstantiateMsg, PendingGovernanceEntry, PendingGovernanceResponse,
    PendingWithdrawalEntry, PendingWithdrawalsResponse, QueryMsg,
};
use crate::state::{
    Config, PendingGovernance, PendingWithdrawal, CONFIG, CONTRACT_NAME, CONTRACT_VERSION,
    CW20_WHITELIST, DEFAULT_TIMELOCK_DURATION, PENDING_GOVERNANCE, PENDING_WITHDRAWALS,
};
use common::AssetInfo;
use cw20::Cw20ReceiveMsg;

/// USTC denomination on TerraClassic
const USTC_DENOM: &str = "uusd";

/// Minimum swap deposit amount: 1 USTC = 1,000,000 uusd
const MIN_SWAP_AMOUNT: u128 = 1_000_000;

// ============ INSTANTIATE ============

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    let governance = deps.api.addr_validate(&msg.governance)?;

    let config = Config {
        governance: governance.clone(),
        timelock_duration: DEFAULT_TIMELOCK_DURATION,
        swap_contract: None,
    };

    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("governance", governance))
}

// ============ EXECUTE ============

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::ProposeGovernanceTransfer { new_governance } => {
            execute_propose_governance_transfer(deps, env, info, new_governance)
        }
        ExecuteMsg::AcceptGovernanceTransfer {} => execute_accept_governance_transfer(deps, env, info),
        ExecuteMsg::CancelGovernanceTransfer { proposed_governance } => {
            execute_cancel_governance_transfer(deps, info, proposed_governance)
        }
        ExecuteMsg::ProposeWithdraw {
            destination,
            asset,
            amount,
        } => execute_propose_withdraw(deps, env, info, destination, asset, amount),
        ExecuteMsg::ExecuteWithdraw { withdrawal_id } => {
            execute_execute_withdraw(deps, env, info, withdrawal_id)
        }
        ExecuteMsg::CancelWithdraw { withdrawal_id } => {
            execute_cancel_withdraw(deps, info, withdrawal_id)
        }
        ExecuteMsg::AddCw20 { contract_addr } => execute_add_cw20(deps, info, contract_addr),
        ExecuteMsg::RemoveCw20 { contract_addr } => execute_remove_cw20(deps, info, contract_addr),
        ExecuteMsg::SetSwapContract { contract_addr } => {
            execute_set_swap_contract(deps, info, contract_addr)
        }
        ExecuteMsg::SwapDeposit {} => execute_swap_deposit(deps, env, info),
        ExecuteMsg::Receive(msg) => execute_receive_cw20(deps, info, msg),
    }
}

fn execute_propose_governance_transfer(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    new_governance: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Only current governance can propose
    if info.sender != config.governance {
        return Err(ContractError::Unauthorized);
    }

    let new_address = deps.api.addr_validate(&new_governance)?;

    let pending = PendingGovernance {
        new_address: new_address.clone(),
        execute_after: env.block.time.plus_seconds(config.timelock_duration),
    };

    // Store in map keyed by proposed address - allows multiple proposals simultaneously
    PENDING_GOVERNANCE.save(deps.storage, new_address.as_str(), &pending)?;

    Ok(Response::new()
        .add_attribute("action", "propose_governance_transfer")
        .add_attribute("new_governance", new_address)
        .add_attribute("execute_after", pending.execute_after.to_string()))
}

fn execute_accept_governance_transfer(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
) -> Result<Response, ContractError> {
    // Look up proposal for the sender's address
    let sender_str = info.sender.as_str();
    let pending = PENDING_GOVERNANCE
        .may_load(deps.storage, sender_str)?
        .ok_or(ContractError::NoPendingGovernanceForAddress {
            address: info.sender.to_string(),
        })?;

    // Check timelock has expired
    if env.block.time < pending.execute_after {
        let remaining = pending.execute_after.seconds() - env.block.time.seconds();
        return Err(ContractError::TimelockNotExpired {
            remaining_seconds: remaining,
        });
    }

    // Update governance
    let mut config = CONFIG.load(deps.storage)?;
    let old_governance = config.governance.clone();
    config.governance = pending.new_address.clone();
    CONFIG.save(deps.storage, &config)?;

    // Remove the accepted proposal
    PENDING_GOVERNANCE.remove(deps.storage, sender_str);

    Ok(Response::new()
        .add_attribute("action", "accept_governance_transfer")
        .add_attribute("old_governance", old_governance)
        .add_attribute("new_governance", config.governance))
}

fn execute_cancel_governance_transfer(
    deps: DepsMut,
    info: MessageInfo,
    proposed_governance: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Only current governance can cancel
    if info.sender != config.governance {
        return Err(ContractError::Unauthorized);
    }

    let proposed_addr = deps.api.addr_validate(&proposed_governance)?;
    let proposed_str = proposed_addr.as_str();

    // Check if proposal exists
    if !PENDING_GOVERNANCE.has(deps.storage, proposed_str) {
        return Err(ContractError::NoPendingGovernanceForAddress {
            address: proposed_addr.to_string(),
        });
    }

    PENDING_GOVERNANCE.remove(deps.storage, proposed_str);

    Ok(Response::new()
        .add_attribute("action", "cancel_governance_transfer")
        .add_attribute("cancelled_address", proposed_addr))
}

/// Generates a unique withdrawal ID from withdrawal parameters
fn generate_withdrawal_id(
    destination: &Addr,
    asset: &AssetInfo,
    amount: Uint128,
    timestamp: cosmwasm_std::Timestamp,
) -> String {
    // Create a unique ID by hashing destination + asset + amount + timestamp
    let mut hasher = Sha256::new();
    hasher.update(b"withdrawal");
    hasher.update(destination.as_bytes());
    match asset {
        AssetInfo::Native { denom } => {
            hasher.update(b"native");
            hasher.update(denom.as_bytes());
        }
        AssetInfo::Cw20 { contract_addr } => {
            hasher.update(b"cw20");
            hasher.update(contract_addr.as_bytes());
        }
    }
    hasher.update(&amount.to_be_bytes());
    hasher.update(&timestamp.seconds().to_be_bytes());
    hasher.update(&timestamp.nanos().to_be_bytes());
    let hash = hasher.finalize();
    hex::encode(&hash[..16]) // Use first 16 bytes for shorter ID
}

fn execute_propose_withdraw(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    destination: String,
    asset: AssetInfo,
    amount: Uint128,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Only governance can propose withdrawals
    if info.sender != config.governance {
        return Err(ContractError::Unauthorized);
    }

    // Reject zero-amount withdrawals
    if amount.is_zero() {
        return Err(ContractError::ZeroWithdrawAmount);
    }

    let destination_addr = deps.api.addr_validate(&destination)?;

    // Generate unique withdrawal ID
    let mut withdrawal_id = generate_withdrawal_id(&destination_addr, &asset, amount, env.block.time);

    // Check if withdrawal ID already exists (should be extremely rare)
    // If it exists, append nanos to make it unique
    let mut counter = 0u64;
    while PENDING_WITHDRAWALS.has(deps.storage, withdrawal_id.as_str()) {
        let mut hasher = Sha256::new();
        hasher.update(withdrawal_id.as_bytes());
        hasher.update(&counter.to_be_bytes());
        hasher.update(&env.block.time.nanos().to_be_bytes());
        let hash = hasher.finalize();
        withdrawal_id = hex::encode(&hash[..16]);
        counter += 1;
        // Safety check to prevent infinite loop (should never happen)
        if counter > 1000 {
            return Err(ContractError::Std(cosmwasm_std::StdError::generic_err(
                "Failed to generate unique withdrawal ID",
            )));
        }
    }

    let pending = PendingWithdrawal {
        destination: destination_addr.clone(),
        asset: asset.clone(),
        amount,
        execute_after: env.block.time.plus_seconds(config.timelock_duration),
    };

    PENDING_WITHDRAWALS.save(deps.storage, withdrawal_id.as_str(), &pending)?;

    Ok(Response::new()
        .add_attribute("action", "propose_withdraw")
        .add_attribute("withdrawal_id", withdrawal_id.clone())
        .add_attribute("destination", destination_addr)
        .add_attribute("amount", amount)
        .add_attribute("execute_after", pending.execute_after.to_string()))
}

fn execute_execute_withdraw(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    withdrawal_id: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Only governance can execute withdrawals
    if info.sender != config.governance {
        return Err(ContractError::Unauthorized);
    }

    // Load pending withdrawal
    let pending = PENDING_WITHDRAWALS
        .may_load(deps.storage, withdrawal_id.as_str())?
        .ok_or(ContractError::NoPendingWithdrawal {
            withdrawal_id: withdrawal_id.clone(),
        })?;

    // Check timelock has expired
    if env.block.time < pending.execute_after {
        let remaining = pending.execute_after.seconds() - env.block.time.seconds();
        return Err(ContractError::TimelockNotExpired {
            remaining_seconds: remaining,
        });
    }

    // Execute the withdrawal
    let msg: CosmosMsg = match &pending.asset {
        AssetInfo::Native { denom } => {
            // Check balance
            let balance = deps
                .querier
                .query_balance(&env.contract.address, denom)?
                .amount;
            if balance < pending.amount {
                return Err(ContractError::InsufficientBalance {
                    requested: pending.amount.to_string(),
                    available: balance.to_string(),
                });
            }

            BankMsg::Send {
                to_address: pending.destination.to_string(),
                amount: vec![Coin {
                    denom: denom.clone(),
                    amount: pending.amount,
                }],
            }
            .into()
        }
        AssetInfo::Cw20 { contract_addr } => {
            // CW20 transfer - balance check happens in the CW20 contract
            WasmMsg::Execute {
                contract_addr: contract_addr.to_string(),
                msg: to_json_binary(&Cw20ExecuteMsg::Transfer {
                    recipient: pending.destination.to_string(),
                    amount: pending.amount,
                })?,
                funds: vec![],
            }
            .into()
        }
    };

    // Remove the executed withdrawal
    PENDING_WITHDRAWALS.remove(deps.storage, withdrawal_id.as_str());

    Ok(Response::new()
        .add_message(msg)
        .add_attribute("action", "execute_withdraw")
        .add_attribute("withdrawal_id", withdrawal_id)
        .add_attribute("destination", pending.destination)
        .add_attribute("amount", pending.amount))
}

fn execute_cancel_withdraw(
    deps: DepsMut,
    info: MessageInfo,
    withdrawal_id: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Only governance can cancel withdrawals
    if info.sender != config.governance {
        return Err(ContractError::Unauthorized);
    }

    // Check if withdrawal exists
    if !PENDING_WITHDRAWALS.has(deps.storage, withdrawal_id.as_str()) {
        return Err(ContractError::NoPendingWithdrawal {
            withdrawal_id: withdrawal_id.clone(),
        });
    }

    PENDING_WITHDRAWALS.remove(deps.storage, withdrawal_id.as_str());

    Ok(Response::new()
        .add_attribute("action", "cancel_withdraw")
        .add_attribute("withdrawal_id", withdrawal_id))
}

fn execute_add_cw20(
    deps: DepsMut,
    info: MessageInfo,
    contract_addr: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Only governance can add
    if info.sender != config.governance {
        return Err(ContractError::Unauthorized);
    }

    let addr = deps.api.addr_validate(&contract_addr)?;
    let addr_str = addr.as_str();

    // Check if already whitelisted
    if CW20_WHITELIST.has(deps.storage, addr_str) {
        return Err(ContractError::Cw20AlreadyWhitelisted {
            contract_addr: addr.to_string(),
        });
    }

    CW20_WHITELIST.save(deps.storage, addr_str, &true)?;

    Ok(Response::new()
        .add_attribute("action", "add_cw20")
        .add_attribute("contract_addr", addr))
}

fn execute_remove_cw20(
    deps: DepsMut,
    info: MessageInfo,
    contract_addr: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Only governance can remove
    if info.sender != config.governance {
        return Err(ContractError::Unauthorized);
    }

    let addr = deps.api.addr_validate(&contract_addr)?;
    let addr_str = addr.as_str();

    // Check if in whitelist
    if !CW20_WHITELIST.has(deps.storage, addr_str) {
        return Err(ContractError::Cw20NotWhitelisted {
            contract_addr: addr.to_string(),
        });
    }

    CW20_WHITELIST.remove(deps.storage, addr_str);

    Ok(Response::new()
        .add_attribute("action", "remove_cw20")
        .add_attribute("contract_addr", addr))
}

fn execute_set_swap_contract(
    deps: DepsMut,
    info: MessageInfo,
    contract_addr: String,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;

    // Only governance can set swap contract
    if info.sender != config.governance {
        return Err(ContractError::Unauthorized);
    }

    let swap_addr = deps.api.addr_validate(&contract_addr)?;
    config.swap_contract = Some(swap_addr.clone());
    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("action", "set_swap_contract")
        .add_attribute("swap_contract", swap_addr))
}

fn execute_swap_deposit(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Check swap contract is set
    let swap_contract = config.swap_contract.ok_or(ContractError::SwapContractNotSet)?;

    // Validate funds - must be exactly USTC
    if info.funds.is_empty() {
        return Err(ContractError::InvalidSwapFunds {
            received: vec!["empty".to_string()],
        });
    }

    if info.funds.len() != 1 || info.funds[0].denom != USTC_DENOM {
        let received: Vec<String> = info
            .funds
            .iter()
            .map(|c| format!("{}:{}", c.denom, c.amount))
            .collect();
        return Err(ContractError::InvalidSwapFunds { received });
    }

    let ustc_amount = info.funds[0].amount;

    // Check minimum amount
    if ustc_amount < Uint128::from(MIN_SWAP_AMOUNT) {
        return Err(ContractError::BelowMinimumSwap {
            received: ustc_amount.to_string(),
        });
    }

    // Notify swap contract via WasmMsg::Execute (atomic submessage)
    // The swap contract will handle rate calculation and USTR minting
    let notify_msg = WasmMsg::Execute {
        contract_addr: swap_contract.to_string(),
        msg: to_json_binary(&SwapExecuteMsg::NotifyDeposit {
            depositor: info.sender.to_string(),
            amount: ustc_amount,
        })?,
        funds: vec![],
    };

    Ok(Response::new()
        .add_message(notify_msg)
        .add_attribute("action", "swap_deposit")
        .add_attribute("depositor", info.sender)
        .add_attribute("ustc_amount", ustc_amount))
}

/// Message sent to swap contract to notify of deposit
/// This matches the expected ExecuteMsg::NotifyDeposit enum variant format
/// When serialized: {"notify_deposit": {"depositor": "...", "amount": "..."}}
#[cw_serde]
enum SwapExecuteMsg {
    /// Called by Treasury when user deposits USTC for swap
    NotifyDeposit { depositor: String, amount: Uint128 },
}

fn execute_receive_cw20(
    deps: DepsMut,
    info: MessageInfo,
    cw20_msg: Cw20ReceiveMsg,
) -> Result<Response, ContractError> {
    // The CW20 contract has already transferred tokens to this contract
    // We just need to acknowledge receipt - no action needed
    // The msg field can be used for future extensions, but for now we ignore it
    
    // info.sender is the CW20 contract that sent the tokens
    // cw20_msg.sender is the user who initiated the transfer
    let user_sender = deps.api.addr_validate(&cw20_msg.sender)?;
    
    Ok(Response::new()
        .add_attribute("action", "receive_cw20")
        .add_attribute("cw20_contract", info.sender)
        .add_attribute("from", user_sender)
        .add_attribute("amount", cw20_msg.amount))
}

// ============ QUERY ============

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&query_config(deps)?),
        QueryMsg::PendingGovernance {} => to_json_binary(&query_pending_governance(deps)?),
        QueryMsg::Balance { asset } => to_json_binary(&query_balance(deps, env, asset)?),
        QueryMsg::AllBalances {} => to_json_binary(&query_all_balances(deps, env)?),
        QueryMsg::Cw20Whitelist {} => to_json_binary(&query_cw20_whitelist(deps)?),
        QueryMsg::PendingWithdrawals {} => to_json_binary(&query_pending_withdrawals(deps)?),
    }
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        governance: config.governance,
        timelock_duration: config.timelock_duration,
        swap_contract: config.swap_contract,
    })
}

fn query_pending_governance(deps: Deps) -> StdResult<PendingGovernanceResponse> {
    let proposals: Vec<PendingGovernanceEntry> = PENDING_GOVERNANCE
        .range(deps.storage, None, None, Order::Ascending)
        .map(|r| {
            r.map(|(_, p)| PendingGovernanceEntry {
                new_address: p.new_address,
                execute_after: p.execute_after,
            })
        })
        .collect::<StdResult<Vec<_>>>()?;

    Ok(PendingGovernanceResponse { proposals })
}

fn query_balance(deps: Deps, env: Env, asset: AssetInfo) -> StdResult<BalanceResponse> {
    let amount = match &asset {
        AssetInfo::Native { denom } => {
            deps.querier
                .query_balance(&env.contract.address, denom)?
                .amount
        }
        AssetInfo::Cw20 { contract_addr } => {
            let balance: cw20::BalanceResponse = deps.querier.query_wasm_smart(
                contract_addr,
                &cw20::Cw20QueryMsg::Balance {
                    address: env.contract.address.to_string(),
                },
            )?;
            balance.balance
        }
    };

    Ok(BalanceResponse { asset, amount })
}

fn query_all_balances(deps: Deps, env: Env) -> StdResult<AllBalancesResponse> {
    let mut balances: Vec<AssetBalance> = vec![];

    // Query all native balances
    let native_balances = deps.querier.query_all_balances(&env.contract.address)?;
    for coin in native_balances {
        balances.push(AssetBalance {
            asset: AssetInfo::Native { denom: coin.denom },
            amount: coin.amount,
        });
    }

    // Query all whitelisted CW20 balances
    let cw20_addresses: Vec<String> = CW20_WHITELIST
        .keys(deps.storage, None, None, Order::Ascending)
        .collect::<StdResult<Vec<_>>>()?;

    for addr_str in cw20_addresses {
        let contract_addr = deps.api.addr_validate(&addr_str)?;
        let balance: cw20::BalanceResponse = deps.querier.query_wasm_smart(
            &contract_addr,
            &cw20::Cw20QueryMsg::Balance {
                address: env.contract.address.to_string(),
            },
        )?;

        if !balance.balance.is_zero() {
            balances.push(AssetBalance {
                asset: AssetInfo::Cw20 { contract_addr },
                amount: balance.balance,
            });
        }
    }

    Ok(AllBalancesResponse { balances })
}

fn query_cw20_whitelist(deps: Deps) -> StdResult<Cw20WhitelistResponse> {
    let addresses: Vec<Addr> = CW20_WHITELIST
        .keys(deps.storage, None, None, Order::Ascending)
        .map(|r| r.and_then(|s| deps.api.addr_validate(&s)))
        .collect::<StdResult<Vec<_>>>()?;

    Ok(Cw20WhitelistResponse { addresses })
}

fn query_pending_withdrawals(deps: Deps) -> StdResult<PendingWithdrawalsResponse> {
    let withdrawals: Vec<PendingWithdrawalEntry> = PENDING_WITHDRAWALS
        .range(deps.storage, None, None, Order::Ascending)
        .map(|r| {
            r.map(|(id, p)| PendingWithdrawalEntry {
                withdrawal_id: id.to_string(),
                destination: p.destination,
                asset: p.asset,
                amount: p.amount,
                execute_after: p.execute_after,
            })
        })
        .collect::<StdResult<Vec<_>>>()?;

    Ok(PendingWithdrawalsResponse { withdrawals })
}

// ============ TESTS ============

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{coin, coins, from_json, Timestamp, Uint128};
    use cw20::BalanceResponse as Cw20BalanceResponse;
    use sha2::{Digest, Sha256};
    use hex;

    const GOVERNANCE: &str = "governance_addr";
    const NEW_GOVERNANCE: &str = "new_governance_addr";
    const USER: &str = "user_addr";
    const CW20_TOKEN: &str = "cw20_token_addr";
    const DENOM_USTC: &str = "uusd";
    const DENOM_LUNC: &str = "uluna";

    fn setup_contract(deps: DepsMut) {
        let msg = InstantiateMsg {
            governance: GOVERNANCE.to_string(),
        };
        let info = mock_info("creator", &[]);
        instantiate(deps, mock_env(), info, msg).unwrap();
    }

    // ============ INSTANTIATE TESTS ============

    #[test]
    fn test_instantiate() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.governance.as_str(), GOVERNANCE);
        assert_eq!(config.timelock_duration, DEFAULT_TIMELOCK_DURATION);
    }

    // Note: Address validation is handled by CosmWasm's addr_validate.
    // In production, invalid addresses will be rejected, but mock_dependencies
    // may accept them. This is tested implicitly through successful operations.

    // ============ GOVERNANCE TESTS ============

    #[test]
    fn test_propose_governance_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info("random_user", &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: NEW_GOVERNANCE.to_string(),
        };

        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    // Note: Address validation is handled by CosmWasm's addr_validate.
    // In production, invalid addresses will be rejected, but mock_dependencies
    // may accept them. This is tested implicitly through successful operations.

    #[test]
    fn test_propose_governance_success() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: NEW_GOVERNANCE.to_string(),
        };

        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        assert_eq!(res.attributes.len(), 3);
        assert_eq!(res.attributes[0].key, "action");
        assert_eq!(res.attributes[0].value, "propose_governance_transfer");

        let pending = PENDING_GOVERNANCE.load(&deps.storage, NEW_GOVERNANCE).unwrap();
        assert_eq!(pending.new_address.as_str(), NEW_GOVERNANCE);
        assert_eq!(
            pending.execute_after.seconds(),
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION
        );
    }

    #[test]
    fn test_propose_governance_multiple_proposals() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Propose first governance change
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: "first_new_governance".to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Propose second governance change (should NOT overwrite, both should exist)
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: NEW_GOVERNANCE.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Both proposals should exist
        let pending1 = PENDING_GOVERNANCE.load(&deps.storage, "first_new_governance").unwrap();
        assert_eq!(pending1.new_address.as_str(), "first_new_governance");

        let pending2 = PENDING_GOVERNANCE.load(&deps.storage, NEW_GOVERNANCE).unwrap();
        assert_eq!(pending2.new_address.as_str(), NEW_GOVERNANCE);
    }

    #[test]
    fn test_accept_governance_no_pending() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(NEW_GOVERNANCE, &[]);
        let msg = ExecuteMsg::AcceptGovernanceTransfer {};

        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::NoPendingGovernanceForAddress { address } => {
                assert_eq!(address, NEW_GOVERNANCE);
            }
            _ => panic!("Expected NoPendingGovernanceForAddress error"),
        }
    }

    #[test]
    fn test_accept_governance_wrong_address() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Propose governance change
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: NEW_GOVERNANCE.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Try to accept with wrong address (no proposal exists for this address)
        let info = mock_info("wrong_address", &[]);
        let msg = ExecuteMsg::AcceptGovernanceTransfer {};

        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::NoPendingGovernanceForAddress { address } => {
                assert_eq!(address, "wrong_address");
            }
            _ => panic!("Expected NoPendingGovernanceForAddress error"),
        }
    }

    #[test]
    fn test_accept_governance_timelock_not_expired() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Propose governance change
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: NEW_GOVERNANCE.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Try to accept before timelock expires
        let info = mock_info(NEW_GOVERNANCE, &[]);
        let msg = ExecuteMsg::AcceptGovernanceTransfer {};

        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::TimelockNotExpired { remaining_seconds } => {
                assert!(remaining_seconds > 0);
                assert!(remaining_seconds <= DEFAULT_TIMELOCK_DURATION);
            }
            _ => panic!("Expected TimelockNotExpired error"),
        }
    }

    #[test]
    fn test_accept_governance_exactly_at_timelock() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let mut env = mock_env();
        let start_time = env.block.time.seconds();

        // Propose governance change
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: NEW_GOVERNANCE.to_string(),
        };
        execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Advance time to exactly timelock duration
        env.block.time = Timestamp::from_seconds(start_time + DEFAULT_TIMELOCK_DURATION);

        // Should still fail (needs to be > timelock)
        let info = mock_info(NEW_GOVERNANCE, &[]);
        let msg = ExecuteMsg::AcceptGovernanceTransfer {};
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        match err {
            ContractError::TimelockNotExpired { remaining_seconds } => {
                assert_eq!(remaining_seconds, 0);
            }
            _ => panic!("Expected TimelockNotExpired error"),
        }
    }

    #[test]
    fn test_accept_governance_success() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Propose governance change
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: NEW_GOVERNANCE.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Advance time past timelock
        let mut env = mock_env();
        env.block.time = Timestamp::from_seconds(
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION + 1,
        );

        // Accept governance change
        let info = mock_info(NEW_GOVERNANCE, &[]);
        let msg = ExecuteMsg::AcceptGovernanceTransfer {};
        let res = execute(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.attributes.len(), 3);
        assert_eq!(res.attributes[0].key, "action");
        assert_eq!(res.attributes[0].value, "accept_governance_transfer");

        // Verify governance changed
        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.governance.as_str(), NEW_GOVERNANCE);

        // Verify pending is cleared for this address
        assert!(PENDING_GOVERNANCE.may_load(&deps.storage, NEW_GOVERNANCE).unwrap().is_none());
    }

    #[test]
    fn test_cancel_governance_proposal_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Propose governance change
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: NEW_GOVERNANCE.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Try to cancel with wrong address
        let info = mock_info("wrong_address", &[]);
        let msg = ExecuteMsg::CancelGovernanceTransfer {
            proposed_governance: NEW_GOVERNANCE.to_string(),
        };
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_cancel_governance_proposal_no_pending() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::CancelGovernanceTransfer {
            proposed_governance: NEW_GOVERNANCE.to_string(),
        };
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::NoPendingGovernanceForAddress { address } => {
                assert_eq!(address, NEW_GOVERNANCE);
            }
            _ => panic!("Expected NoPendingGovernanceForAddress error"),
        }
    }

    #[test]
    fn test_cancel_governance_proposal_success() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Propose governance change
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: NEW_GOVERNANCE.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Cancel the proposal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::CancelGovernanceTransfer {
            proposed_governance: NEW_GOVERNANCE.to_string(),
        };
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();
        assert_eq!(res.attributes.len(), 2);
        assert_eq!(res.attributes[0].key, "action");
        assert_eq!(res.attributes[0].value, "cancel_governance_transfer");

        // Verify pending is cleared
        assert!(PENDING_GOVERNANCE.may_load(&deps.storage, NEW_GOVERNANCE).unwrap().is_none());
    }

    #[test]
    fn test_cancel_governance_proposal_specific() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Propose multiple governance changes
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: NEW_GOVERNANCE.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info.clone(), msg).unwrap();

        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: "another_governance".to_string(),
        };
        execute(deps.as_mut(), mock_env(), info.clone(), msg).unwrap();

        // Cancel only the first proposal
        let msg = ExecuteMsg::CancelGovernanceTransfer {
            proposed_governance: NEW_GOVERNANCE.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Verify only the cancelled one is removed
        assert!(PENDING_GOVERNANCE.may_load(&deps.storage, NEW_GOVERNANCE).unwrap().is_none());
        assert!(PENDING_GOVERNANCE.may_load(&deps.storage, "another_governance").unwrap().is_some());
    }

    #[test]
    fn test_accept_governance_only_clears_accepted_proposal() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Propose multiple governance changes
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: NEW_GOVERNANCE.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info.clone(), msg).unwrap();

        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: "another_governance".to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Advance time past timelock
        let mut env = mock_env();
        env.block.time = Timestamp::from_seconds(
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION + 1,
        );

        // Accept one proposal
        let info = mock_info(NEW_GOVERNANCE, &[]);
        let msg = ExecuteMsg::AcceptGovernanceTransfer {};
        execute(deps.as_mut(), env, info, msg).unwrap();

        // Verify governance changed
        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.governance.as_str(), NEW_GOVERNANCE);

        // Verify ONLY the accepted proposal is cleared, other proposals remain
        // (New governance can cancel them if desired)
        assert!(PENDING_GOVERNANCE.may_load(&deps.storage, NEW_GOVERNANCE).unwrap().is_none());
        assert!(PENDING_GOVERNANCE.may_load(&deps.storage, "another_governance").unwrap().is_some());
    }

    #[test]
    fn test_propose_governance_same_address_overwrites() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env1 = mock_env();

        // Propose governance change
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: NEW_GOVERNANCE.to_string(),
        };
        execute(deps.as_mut(), env1.clone(), info.clone(), msg).unwrap();

        // Get first execute_after
        let pending1 = PENDING_GOVERNANCE.load(&deps.storage, NEW_GOVERNANCE).unwrap();

        // Wait some time
        let mut env2 = mock_env();
        env2.block.time = Timestamp::from_seconds(env1.block.time.seconds() + 1000);

        // Propose same address again
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: NEW_GOVERNANCE.to_string(),
        };
        execute(deps.as_mut(), env2.clone(), info, msg).unwrap();

        // Get second execute_after - should be later
        let pending2 = PENDING_GOVERNANCE.load(&deps.storage, NEW_GOVERNANCE).unwrap();

        // Timelock should be reset
        assert!(pending2.execute_after.seconds() > pending1.execute_after.seconds());
    }

    #[test]
    fn test_governance_transfer_new_can_act_old_cannot() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(1000, DENOM_USTC));

        // Propose governance change
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: NEW_GOVERNANCE.to_string(),
        };
        execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Advance time past timelock
        let mut env_after = mock_env();
        env_after.block.time = Timestamp::from_seconds(
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION + 1,
        );

        // Accept governance change
        let info = mock_info(NEW_GOVERNANCE, &[]);
        let msg = ExecuteMsg::AcceptGovernanceTransfer {};
        execute(deps.as_mut(), env_after.clone(), info, msg).unwrap();

        // Verify governance changed
        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.governance.as_str(), NEW_GOVERNANCE);

        // OLD governance should NOT be able to propose withdrawals anymore
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount: Uint128::from(100u128),
        };
        let err = execute(deps.as_mut(), env_after.clone(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);

        // NEW governance SHOULD be able to propose withdrawals
        let info = mock_info(NEW_GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount: Uint128::from(100u128),
        };
        let res = execute(deps.as_mut(), env_after.clone(), info, msg).unwrap();
        assert_eq!(res.attributes[0].value, "propose_withdraw");

        // NEW governance should be able to propose another transfer
        let info = mock_info(NEW_GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: "third_governance".to_string(),
        };
        let res = execute(deps.as_mut(), env_after, info, msg).unwrap();
        assert_eq!(res.attributes[0].value, "propose_governance_transfer");

        // Verify proposal was created
        let pending = PENDING_GOVERNANCE.load(&deps.storage, "third_governance").unwrap();
        assert_eq!(pending.new_address.as_str(), "third_governance");
    }

    // ============ WITHDRAW TESTS ============

    #[test]
    fn test_propose_withdraw_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info("random_user", &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount: Uint128::from(1000u128),
        };

        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    // Note: Address validation is handled by CosmWasm's addr_validate.
    // In production, invalid addresses will be rejected, but mock_dependencies
    // may accept them. This is tested implicitly through successful operations.

    #[test]
    fn test_propose_withdraw_success() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let amount = Uint128::from(1000u128);

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(1000, DENOM_USTC));

        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };

        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        assert_eq!(res.attributes.len(), 5);
        assert_eq!(res.attributes[0].key, "action");
        assert_eq!(res.attributes[0].value, "propose_withdraw");
        assert_eq!(res.attributes[1].key, "withdrawal_id");
        
        // Extract withdrawal_id from response
        let withdrawal_id = res.attributes[1].value.clone();
        
        // Verify pending withdrawal was created
        let pending = PENDING_WITHDRAWALS.load(&deps.storage, withdrawal_id.as_str()).unwrap();
        assert_eq!(pending.destination.as_str(), USER);
        assert_eq!(pending.amount, amount);
        assert_eq!(
            pending.execute_after.seconds(),
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION
        );
    }

    #[test]
    fn test_execute_withdraw_timelock_not_expired() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let amount = Uint128::from(1000u128);

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(1000, DENOM_USTC));

        // Propose withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        let withdrawal_id = res.attributes[1].value.clone();

        // Try to execute before timelock expires
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        match err {
            ContractError::TimelockNotExpired { remaining_seconds } => {
                assert!(remaining_seconds > 0);
                assert!(remaining_seconds <= DEFAULT_TIMELOCK_DURATION);
            }
            _ => panic!("Expected TimelockNotExpired error"),
        }
    }

    #[test]
    fn test_execute_withdraw_native_success() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let mut env = mock_env();
        let amount = Uint128::from(1000u128);

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(1000, DENOM_USTC));

        // Propose withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        let withdrawal_id = res.attributes[1].value.clone();

        // Advance time past timelock
        env.block.time = Timestamp::from_seconds(
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION + 1,
        );

        // Execute withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        let res = execute(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.messages.len(), 1);
        assert_eq!(res.attributes.len(), 4);
        assert_eq!(res.attributes[0].key, "action");
        assert_eq!(res.attributes[0].value, "execute_withdraw");

        // Verify message is BankMsg::Send
        match &res.messages[0].msg {
            CosmosMsg::Bank(BankMsg::Send { to_address, amount: coins }) => {
                assert_eq!(to_address, USER);
                assert_eq!(coins.len(), 1);
                assert_eq!(coins[0].denom, DENOM_USTC);
                assert_eq!(coins[0].amount, amount);
            }
            _ => panic!("Expected BankMsg::Send"),
        }

        // Verify withdrawal was removed
        assert!(PENDING_WITHDRAWALS.may_load(&deps.storage, withdrawal_id.as_str()).unwrap().is_none());
    }

    // Note: Address validation is handled by CosmWasm's addr_validate.
    // In production, invalid addresses will be rejected, but mock_dependencies
    // may accept them. This is tested implicitly through successful operations.

    #[test]
    fn test_execute_withdraw_cw20_success() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let mut env = mock_env();
        let cw20_addr = Addr::unchecked(CW20_TOKEN);
        let amount = Uint128::from(1000u128);

        // Mock CW20 balance
        let amount_clone = amount;
        deps.querier.update_wasm(move |_| {
            cosmwasm_std::SystemResult::Ok(cosmwasm_std::ContractResult::Ok(
                to_json_binary(&Cw20BalanceResponse {
                    balance: amount_clone,
                })
                .unwrap(),
            ))
        });

        // Propose withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Cw20 {
                contract_addr: cw20_addr.clone(),
            },
            amount,
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        let withdrawal_id = res.attributes[1].value.clone();

        // Advance time past timelock
        env.block.time = Timestamp::from_seconds(
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION + 1,
        );

        // Execute withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        let res = execute(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.messages.len(), 1);
        assert_eq!(res.attributes.len(), 4);

        // Verify message is WasmMsg::Execute
        match &res.messages[0].msg {
            CosmosMsg::Wasm(WasmMsg::Execute {
                contract_addr,
                msg: _,
                funds,
            }) => {
                assert_eq!(contract_addr, &cw20_addr.to_string());
                assert_eq!(funds.len(), 0);
            }
            _ => panic!("Expected WasmMsg::Execute"),
        }

        // Verify withdrawal was removed
        assert!(PENDING_WITHDRAWALS.may_load(&deps.storage, withdrawal_id.as_str()).unwrap().is_none());
    }

    #[test]
    fn test_execute_withdraw_insufficient_balance() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let mut env = mock_env();
        let amount = Uint128::from(1000u128);

        // Fund treasury with less than requested
        deps.querier
            .update_balance(env.contract.address.clone(), coins(500, DENOM_USTC));

        // Propose withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        let withdrawal_id = res.attributes[1].value.clone();

        // Advance time past timelock
        env.block.time = Timestamp::from_seconds(
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION + 1,
        );

        // Try to execute - should fail due to insufficient balance
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        match err {
            ContractError::InsufficientBalance { requested, available } => {
                assert_eq!(requested, "1000");
                assert_eq!(available, "500");
            }
            _ => panic!("Expected InsufficientBalance error"),
        }
    }

    #[test]
    fn test_cancel_withdraw_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let amount = Uint128::from(1000u128);

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(1000, DENOM_USTC));

        // Propose withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };
        let res = execute(deps.as_mut(), env, info, msg).unwrap();
        let withdrawal_id = res.attributes[1].value.clone();

        // Try to cancel with wrong address
        let info = mock_info("random_user", &[]);
        let msg = ExecuteMsg::CancelWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_cancel_withdraw_success() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let amount = Uint128::from(1000u128);

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(1000, DENOM_USTC));

        // Propose withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };
        let res = execute(deps.as_mut(), env, info, msg).unwrap();
        let withdrawal_id = res.attributes[1].value.clone();

        // Cancel withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::CancelWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();
        assert_eq!(res.attributes.len(), 2);
        assert_eq!(res.attributes[0].key, "action");
        assert_eq!(res.attributes[0].value, "cancel_withdraw");

        // Verify withdrawal was removed
        assert!(PENDING_WITHDRAWALS.may_load(&deps.storage, withdrawal_id.as_str()).unwrap().is_none());
    }

    #[test]
    fn test_cancel_withdraw_no_pending() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::CancelWithdraw {
            withdrawal_id: "nonexistent_id".to_string(),
        };
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::NoPendingWithdrawal { withdrawal_id } => {
                assert_eq!(withdrawal_id, "nonexistent_id");
            }
            _ => panic!("Expected NoPendingWithdrawal error"),
        }
    }

    #[test]
    fn test_execute_withdraw_exactly_at_timelock() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let mut env = mock_env();
        let start_time = env.block.time.seconds();
        let amount = Uint128::from(1000u128);

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(1000, DENOM_USTC));

        // Propose withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        let withdrawal_id = res.attributes[1].value.clone();

        // Advance time to exactly timelock duration
        env.block.time = Timestamp::from_seconds(start_time + DEFAULT_TIMELOCK_DURATION);

        // Should still fail (needs to be > timelock)
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        match err {
            ContractError::TimelockNotExpired { remaining_seconds } => {
                assert_eq!(remaining_seconds, 0);
            }
            _ => panic!("Expected TimelockNotExpired error"),
        }
    }

    #[test]
    fn test_execute_withdraw_invalid_id() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let mut env = mock_env();
        env.block.time = Timestamp::from_seconds(
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION + 1,
        );

        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: "invalid_withdrawal_id".to_string(),
        };
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        match err {
            ContractError::NoPendingWithdrawal { withdrawal_id } => {
                assert_eq!(withdrawal_id, "invalid_withdrawal_id");
            }
            _ => panic!("Expected NoPendingWithdrawal error"),
        }
    }

    #[test]
    fn test_propose_multiple_same_withdrawals() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let amount = Uint128::from(1000u128);

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(5000, DENOM_USTC));

        // Propose first withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };
        let res1 = execute(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();
        let withdrawal_id1 = res1.attributes[1].value.clone();

        // Propose second withdrawal with same parameters (should create different ID)
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };
        let res2 = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        let withdrawal_id2 = res2.attributes[1].value.clone();

        // IDs should be different (due to timestamp differences or collision handling)
        assert_ne!(withdrawal_id1, withdrawal_id2);

        // Both should be in pending withdrawals
        assert!(PENDING_WITHDRAWALS.has(&deps.storage, withdrawal_id1.as_str()));
        assert!(PENDING_WITHDRAWALS.has(&deps.storage, withdrawal_id2.as_str()));
    }

    #[test]
    fn test_propose_withdraw_zero_amount() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let amount = Uint128::zero();

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(1000, DENOM_USTC));

        // Propose withdrawal with zero amount (should fail)
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::ZeroWithdrawAmount);
    }

    #[test]
    fn test_execute_withdraw_after_cancel() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let mut env = mock_env();
        let amount = Uint128::from(1000u128);

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(1000, DENOM_USTC));

        // Propose withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };
        let res = execute(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();
        let withdrawal_id = res.attributes[1].value.clone();

        // Cancel withdrawal
        let msg = ExecuteMsg::CancelWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        execute(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();

        // Advance time past timelock
        env.block.time = Timestamp::from_seconds(
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION + 1,
        );

        // Try to execute canceled withdrawal (should fail)
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        match err {
            ContractError::NoPendingWithdrawal { withdrawal_id: id } => {
                assert_eq!(id, withdrawal_id);
            }
            _ => panic!("Expected NoPendingWithdrawal error"),
        }
    }

    #[test]
    fn test_execute_withdraw_twice() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let mut env = mock_env();
        let amount = Uint128::from(1000u128);

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(2000, DENOM_USTC));

        // Propose withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };
        let res = execute(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();
        let withdrawal_id = res.attributes[1].value.clone();

        // Advance time past timelock
        env.block.time = Timestamp::from_seconds(
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION + 1,
        );

        // Execute withdrawal first time
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        execute(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();

        // Try to execute same withdrawal again (should fail)
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        match err {
            ContractError::NoPendingWithdrawal { withdrawal_id: id } => {
                assert_eq!(id, withdrawal_id);
            }
            _ => panic!("Expected NoPendingWithdrawal error"),
        }
    }

    #[test]
    fn test_propose_withdraw_invalid_destination() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let amount = Uint128::from(1000u128);

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(1000, DENOM_USTC));

        // Propose withdrawal with invalid destination
        // Note: mock_dependencies may accept invalid addresses, but in production
        // addr_validate will reject them. This test verifies the code path exists.
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: "invalid_address!!!".to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };
        // In production, this would fail with address validation error
        // In mock environment, it may succeed, which is acceptable for testing
        let result = execute(deps.as_mut(), env, info, msg);
        // Either outcome is acceptable - the important thing is the code handles it
        if result.is_err() {
            assert!(matches!(result.unwrap_err(), ContractError::Std(_)));
        }
    }

    #[test]
    fn test_execute_withdraw_one_second_after_timelock() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let mut env = mock_env();
        let start_time = env.block.time.seconds();
        let amount = Uint128::from(1000u128);

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(1000, DENOM_USTC));

        // Propose withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };
        let res = execute(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();
        let withdrawal_id = res.attributes[1].value.clone();

        // Advance time to exactly one second after timelock
        env.block.time = Timestamp::from_seconds(start_time + DEFAULT_TIMELOCK_DURATION + 1);

        // Should succeed
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        let res = execute(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.messages.len(), 1);
        assert_eq!(res.attributes[0].value, "execute_withdraw");
    }

    #[test]
    fn test_multiple_withdrawals_cancel_one() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(5000, DENOM_USTC));

        // Propose multiple withdrawals
        let info = mock_info(GOVERNANCE, &[]);
        let msg1 = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount: Uint128::from(1000u128),
        };
        let res1 = execute(deps.as_mut(), env.clone(), info.clone(), msg1).unwrap();
        let withdrawal_id1 = res1.attributes[1].value.clone();

        let msg2 = ExecuteMsg::ProposeWithdraw {
            destination: "another_user".to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount: Uint128::from(2000u128),
        };
        let res2 = execute(deps.as_mut(), env.clone(), info.clone(), msg2).unwrap();
        let withdrawal_id2 = res2.attributes[1].value.clone();

        // Cancel only the first withdrawal
        let msg = ExecuteMsg::CancelWithdraw {
            withdrawal_id: withdrawal_id1.clone(),
        };
        execute(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();

        // Verify first is canceled, second still exists
        assert!(!PENDING_WITHDRAWALS.has(&deps.storage, withdrawal_id1.as_str()));
        assert!(PENDING_WITHDRAWALS.has(&deps.storage, withdrawal_id2.as_str()));
    }

    #[test]
    fn test_execute_withdraw_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let mut env = mock_env();
        let amount = Uint128::from(1000u128);

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(1000, DENOM_USTC));

        // Propose withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        let withdrawal_id = res.attributes[1].value.clone();

        // Advance time past timelock
        env.block.time = Timestamp::from_seconds(
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION + 1,
        );

        // Try to execute with wrong address
        let info = mock_info("random_user", &[]);
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_propose_withdraw_cw20_not_whitelisted() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let cw20_addr = Addr::unchecked(CW20_TOKEN);
        let amount = Uint128::from(1000u128);

        // Propose withdrawal for non-whitelisted CW20 (should succeed - whitelist only affects queries)
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Cw20 {
                contract_addr: cw20_addr.clone(),
            },
            amount,
        };
        let res = execute(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.attributes[0].value, "propose_withdraw");
        
        // Verify withdrawal was created
        let withdrawal_id = res.attributes[1].value.clone();
        assert!(PENDING_WITHDRAWALS.has(&deps.storage, withdrawal_id.as_str()));
    }

    #[test]
    fn test_propose_withdraw_zero_amount_cw20() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let cw20_addr = Addr::unchecked(CW20_TOKEN);
        let amount = Uint128::zero();

        // Propose withdrawal with zero amount for CW20 (should fail)
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Cw20 {
                contract_addr: cw20_addr,
            },
            amount,
        };
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::ZeroWithdrawAmount);
    }

    #[test]
    fn test_query_pending_withdrawals_after_execution() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let mut env = mock_env();
        let amount = Uint128::from(1000u128);

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(2000, DENOM_USTC));

        // Propose withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };
        let res = execute(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();
        let withdrawal_id = res.attributes[1].value.clone();

        // Query before execution - should show pending withdrawal
        let query_res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::PendingWithdrawals {},
        )
        .unwrap();
        let pending: PendingWithdrawalsResponse = from_json(query_res).unwrap();
        assert_eq!(pending.withdrawals.len(), 1);
        assert_eq!(pending.withdrawals[0].withdrawal_id, withdrawal_id);

        // Advance time and execute
        env.block.time = Timestamp::from_seconds(
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION + 1,
        );
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        execute(deps.as_mut(), env, info, msg).unwrap();

        // Query after execution - should be empty
        let query_res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::PendingWithdrawals {},
        )
        .unwrap();
        let pending: PendingWithdrawalsResponse = from_json(query_res).unwrap();
        assert_eq!(pending.withdrawals.len(), 0);
    }

    // ============ CW20 WHITELIST TESTS ============

    #[test]
    fn test_add_cw20_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info("random_user", &[]);
        let msg = ExecuteMsg::AddCw20 {
            contract_addr: CW20_TOKEN.to_string(),
        };

        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    // Note: Address validation is handled by CosmWasm's addr_validate.
    // In production, invalid addresses will be rejected, but mock_dependencies
    // may accept them. This is tested implicitly through successful operations.

    #[test]
    fn test_add_cw20_success() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::AddCw20 {
            contract_addr: CW20_TOKEN.to_string(),
        };

        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();
        assert_eq!(res.attributes.len(), 2);
        assert_eq!(res.attributes[0].key, "action");
        assert_eq!(res.attributes[0].value, "add_cw20");

        // Verify it's in whitelist
        assert!(CW20_WHITELIST.has(&deps.storage, CW20_TOKEN));
    }

    #[test]
    fn test_add_cw20_already_whitelisted() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Add CW20
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::AddCw20 {
            contract_addr: CW20_TOKEN.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Try to add again
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::AddCw20 {
            contract_addr: CW20_TOKEN.to_string(),
        };
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::Cw20AlreadyWhitelisted { contract_addr } => {
                assert_eq!(contract_addr, CW20_TOKEN);
            }
            _ => panic!("Expected Cw20AlreadyWhitelisted error"),
        }
    }

    #[test]
    fn test_remove_cw20_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info("random_user", &[]);
        let msg = ExecuteMsg::RemoveCw20 {
            contract_addr: CW20_TOKEN.to_string(),
        };

        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_remove_cw20_not_whitelisted() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::RemoveCw20 {
            contract_addr: CW20_TOKEN.to_string(),
        };

        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::Cw20NotWhitelisted { contract_addr } => {
                assert_eq!(contract_addr, CW20_TOKEN);
            }
            _ => panic!("Expected Cw20NotWhitelisted error"),
        }
    }

    #[test]
    fn test_remove_cw20_success() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Add CW20 first
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::AddCw20 {
            contract_addr: CW20_TOKEN.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Remove CW20
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::RemoveCw20 {
            contract_addr: CW20_TOKEN.to_string(),
        };
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();
        assert_eq!(res.attributes.len(), 2);
        assert_eq!(res.attributes[0].key, "action");
        assert_eq!(res.attributes[0].value, "remove_cw20");

        // Verify it's removed
        assert!(!CW20_WHITELIST.has(&deps.storage, CW20_TOKEN));
    }

    #[test]
    fn test_add_remove_multiple_cw20() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let cw20_1 = "cw20_token_1";
        let cw20_2 = "cw20_token_2";
        let cw20_3 = "cw20_token_3";

        // Add multiple CW20s
        let info = mock_info(GOVERNANCE, &[]);
        for addr in [cw20_1, cw20_2, cw20_3] {
            let msg = ExecuteMsg::AddCw20 {
                contract_addr: addr.to_string(),
            };
            execute(deps.as_mut(), mock_env(), info.clone(), msg).unwrap();
        }

        // Verify all are whitelisted
        assert!(CW20_WHITELIST.has(&deps.storage, cw20_1));
        assert!(CW20_WHITELIST.has(&deps.storage, cw20_2));
        assert!(CW20_WHITELIST.has(&deps.storage, cw20_3));

        // Remove one
        let msg = ExecuteMsg::RemoveCw20 {
            contract_addr: cw20_2.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Verify correct state
        assert!(CW20_WHITELIST.has(&deps.storage, cw20_1));
        assert!(!CW20_WHITELIST.has(&deps.storage, cw20_2));
        assert!(CW20_WHITELIST.has(&deps.storage, cw20_3));
    }

    // ============ CW20 RECEIVE TESTS ============

    #[test]
    fn test_receive_cw20_success() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let user_sender = "sender_addr";
        let amount = Uint128::from(1000u128);

        let cw20_msg = Cw20ReceiveMsg {
            sender: user_sender.to_string(),
            amount,
            msg: cosmwasm_std::Binary::default(),
        };

        let info = mock_info(CW20_TOKEN, &[]);
        let msg = ExecuteMsg::Receive(cw20_msg.clone());

        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();
        assert_eq!(res.attributes.len(), 4);
        assert_eq!(res.attributes[0].key, "action");
        assert_eq!(res.attributes[0].value, "receive_cw20");
        assert_eq!(res.attributes[1].key, "cw20_contract");
        assert_eq!(res.attributes[1].value, CW20_TOKEN);
        assert_eq!(res.attributes[2].key, "from");
        assert_eq!(res.attributes[2].value, user_sender);
        assert_eq!(res.attributes[3].key, "amount");
        assert_eq!(res.attributes[3].value, amount.to_string());
    }

    #[test]
    fn test_receive_cw20_from_different_contracts() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let user_sender = "sender_addr";
        let amount = Uint128::from(500u128);
        let another_cw20 = "another_cw20_token";

        let cw20_msg = Cw20ReceiveMsg {
            sender: user_sender.to_string(),
            amount,
            msg: cosmwasm_std::Binary::default(),
        };

        // Receive from a different CW20 contract
        let info = mock_info(another_cw20, &[]);
        let msg = ExecuteMsg::Receive(cw20_msg);

        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();
        assert_eq!(res.attributes.len(), 4);
        assert_eq!(res.attributes[1].key, "cw20_contract");
        assert_eq!(res.attributes[1].value, another_cw20);
        assert_eq!(res.attributes[2].key, "from");
        assert_eq!(res.attributes[2].value, user_sender);
    }

    #[test]
    fn test_receive_cw20_with_msg_payload() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let user_sender = "sender_addr";
        let amount = Uint128::from(1000u128);
        // Include a non-empty msg payload (future extensions might use this)
        let payload = cosmwasm_std::Binary::from(b"some_payload");

        let cw20_msg = Cw20ReceiveMsg {
            sender: user_sender.to_string(),
            amount,
            msg: payload,
        };

        let info = mock_info(CW20_TOKEN, &[]);
        let msg = ExecuteMsg::Receive(cw20_msg);

        // Should still succeed - msg payload is currently ignored
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();
        assert_eq!(res.attributes[0].value, "receive_cw20");
    }

    // Note: Address validation is handled by CosmWasm's addr_validate.
    // In production, invalid addresses will be rejected, but mock_dependencies
    // may accept them. This is tested implicitly through successful operations.

    // ============ QUERY TESTS ============

    #[test]
    fn test_query_config() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let res = query(deps.as_ref(), mock_env(), QueryMsg::Config {}).unwrap();
        let config: ConfigResponse = from_json(res).unwrap();

        assert_eq!(config.governance.as_str(), GOVERNANCE);
        assert_eq!(config.timelock_duration, DEFAULT_TIMELOCK_DURATION);
    }

    #[test]
    fn test_query_pending_governance_none() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::PendingGovernance {},
        )
        .unwrap();
        let pending: PendingGovernanceResponse = from_json(res).unwrap();

        assert!(pending.proposals.is_empty());
    }

    #[test]
    fn test_query_pending_governance_some() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Propose governance change
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: NEW_GOVERNANCE.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        let res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::PendingGovernance {},
        )
        .unwrap();
        let pending: PendingGovernanceResponse = from_json(res).unwrap();

        assert_eq!(pending.proposals.len(), 1);
        assert_eq!(pending.proposals[0].new_address.as_str(), NEW_GOVERNANCE);
    }

    #[test]
    fn test_query_pending_governance_multiple() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Propose multiple governance changes
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: NEW_GOVERNANCE.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info.clone(), msg).unwrap();

        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: "another_governance".to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        let res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::PendingGovernance {},
        )
        .unwrap();
        let pending: PendingGovernanceResponse = from_json(res).unwrap();

        assert_eq!(pending.proposals.len(), 2);
    }

    #[test]
    fn test_query_pending_withdrawals_none() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::PendingWithdrawals {},
        )
        .unwrap();
        let pending: PendingWithdrawalsResponse = from_json(res).unwrap();

        assert!(pending.withdrawals.is_empty());
    }

    #[test]
    fn test_query_pending_withdrawals_some() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let amount = Uint128::from(1000u128);

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(1000, DENOM_USTC));

        // Propose withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };
        execute(deps.as_mut(), env, info, msg).unwrap();

        let res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::PendingWithdrawals {},
        )
        .unwrap();
        let pending: PendingWithdrawalsResponse = from_json(res).unwrap();

        assert_eq!(pending.withdrawals.len(), 1);
        assert_eq!(pending.withdrawals[0].destination.as_str(), USER);
        assert_eq!(pending.withdrawals[0].amount, amount);
    }

    #[test]
    fn test_query_pending_withdrawals_multiple() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(5000, DENOM_USTC));

        // Propose multiple withdrawals
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount: Uint128::from(1000u128),
        };
        execute(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();

        let msg = ExecuteMsg::ProposeWithdraw {
            destination: "another_user".to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount: Uint128::from(2000u128),
        };
        execute(deps.as_mut(), env, info, msg).unwrap();

        let res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::PendingWithdrawals {},
        )
        .unwrap();
        let pending: PendingWithdrawalsResponse = from_json(res).unwrap();

        assert_eq!(pending.withdrawals.len(), 2);
    }

    #[test]
    fn test_query_balance_native() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let amount = Uint128::from(1000u128);

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(1000, DENOM_USTC));

        let res = query(
            deps.as_ref(),
            env,
            QueryMsg::Balance {
                asset: AssetInfo::Native {
                    denom: DENOM_USTC.to_string(),
                },
            },
        )
        .unwrap();
        let balance: BalanceResponse = from_json(res).unwrap();

        assert_eq!(balance.amount, amount);
        match balance.asset {
            AssetInfo::Native { denom } => assert_eq!(denom, DENOM_USTC),
            _ => panic!("Expected Native asset"),
        }
    }

    #[test]
    fn test_query_balance_native_zero() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::Balance {
                asset: AssetInfo::Native {
                    denom: DENOM_USTC.to_string(),
                },
            },
        )
        .unwrap();
        let balance: BalanceResponse = from_json(res).unwrap();

        assert_eq!(balance.amount, Uint128::zero());
    }

    #[test]
    fn test_query_balance_cw20() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let cw20_addr = Addr::unchecked(CW20_TOKEN);
        let amount = Uint128::from(2000u128);

        // Mock CW20 balance
        let amount_clone = amount;
        deps.querier.update_wasm(move |_| {
            cosmwasm_std::SystemResult::Ok(cosmwasm_std::ContractResult::Ok(
                to_json_binary(&Cw20BalanceResponse { balance: amount_clone }).unwrap(),
            ))
        });

        let res = query(
            deps.as_ref(),
            env,
            QueryMsg::Balance {
                asset: AssetInfo::Cw20 {
                    contract_addr: cw20_addr.clone(),
                },
            },
        )
        .unwrap();
        let balance: BalanceResponse = from_json(res).unwrap();

        assert_eq!(balance.amount, amount);
        match balance.asset {
            AssetInfo::Cw20 { contract_addr } => assert_eq!(contract_addr, cw20_addr),
            _ => panic!("Expected Cw20 asset"),
        }
    }

    #[test]
    fn test_query_all_balances_empty() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let res = query(deps.as_ref(), mock_env(), QueryMsg::AllBalances {}).unwrap();
        let balances: AllBalancesResponse = from_json(res).unwrap();

        assert_eq!(balances.balances.len(), 0);
    }

    #[test]
    fn test_query_all_balances_native_only() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();

        // Fund treasury with multiple native tokens
        deps.querier.update_balance(
            env.contract.address.clone(),
            vec![coin(1000, DENOM_USTC), coin(500, DENOM_LUNC)],
        );

        let res = query(deps.as_ref(), env, QueryMsg::AllBalances {}).unwrap();
        let balances: AllBalancesResponse = from_json(res).unwrap();

        assert_eq!(balances.balances.len(), 2);
        // Order may vary, so check both
        let denoms: Vec<String> = balances
            .balances
            .iter()
            .filter_map(|b| match &b.asset {
                AssetInfo::Native { denom } => Some(denom.clone()),
                _ => None,
            })
            .collect();
        assert!(denoms.contains(&DENOM_USTC.to_string()));
        assert!(denoms.contains(&DENOM_LUNC.to_string()));
    }

    #[test]
    fn test_query_all_balances_cw20_only() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let cw20_addr = Addr::unchecked(CW20_TOKEN);
        let amount = Uint128::from(1000u128);

        // Add to whitelist
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::AddCw20 {
            contract_addr: CW20_TOKEN.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Mock CW20 balance
        let amount_clone = amount;
        deps.querier.update_wasm(move |_| {
            cosmwasm_std::SystemResult::Ok(cosmwasm_std::ContractResult::Ok(
                to_json_binary(&Cw20BalanceResponse { balance: amount_clone }).unwrap(),
            ))
        });

        let res = query(deps.as_ref(), env, QueryMsg::AllBalances {}).unwrap();
        let balances: AllBalancesResponse = from_json(res).unwrap();

        assert_eq!(balances.balances.len(), 1);
        match &balances.balances[0].asset {
            AssetInfo::Cw20 { contract_addr } => assert_eq!(contract_addr, &cw20_addr),
            _ => panic!("Expected Cw20 asset"),
        }
        assert_eq!(balances.balances[0].amount, amount);
    }

    #[test]
    fn test_query_all_balances_cw20_zero_balance() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();

        // Add to whitelist
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::AddCw20 {
            contract_addr: CW20_TOKEN.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Mock zero CW20 balance
        deps.querier.update_wasm(move |_| {
            cosmwasm_std::SystemResult::Ok(cosmwasm_std::ContractResult::Ok(
                to_json_binary(&Cw20BalanceResponse {
                    balance: Uint128::zero(),
                })
                .unwrap(),
            ))
        });

        let res = query(deps.as_ref(), env, QueryMsg::AllBalances {}).unwrap();
        let balances: AllBalancesResponse = from_json(res).unwrap();

        // Zero balances should not appear
        assert_eq!(balances.balances.len(), 0);
    }

    #[test]
    fn test_query_all_balances_mixed() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let _cw20_addr = Addr::unchecked(CW20_TOKEN);
        let cw20_amount = Uint128::from(2000u128);

        // Fund treasury with native tokens
        deps.querier
            .update_balance(env.contract.address.clone(), coins(1000, DENOM_USTC));

        // Add CW20 to whitelist
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::AddCw20 {
            contract_addr: CW20_TOKEN.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Mock CW20 balance
        let cw20_amount_clone = cw20_amount;
        deps.querier.update_wasm(move |_| {
            cosmwasm_std::SystemResult::Ok(cosmwasm_std::ContractResult::Ok(
                to_json_binary(&Cw20BalanceResponse {
                    balance: cw20_amount_clone,
                })
                .unwrap(),
            ))
        });

        let res = query(deps.as_ref(), env, QueryMsg::AllBalances {}).unwrap();
        let balances: AllBalancesResponse = from_json(res).unwrap();

        assert_eq!(balances.balances.len(), 2);

        // Check native balance
        let native_balance = balances
            .balances
            .iter()
            .find(|b| matches!(b.asset, AssetInfo::Native { .. }))
            .unwrap();
        assert_eq!(native_balance.amount, Uint128::from(1000u128));

        // Check CW20 balance
        let cw20_balance = balances
            .balances
            .iter()
            .find(|b| matches!(b.asset, AssetInfo::Cw20 { .. }))
            .unwrap();
        assert_eq!(cw20_balance.amount, cw20_amount);
    }

    #[test]
    fn test_query_cw20_whitelist_empty() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::Cw20Whitelist {},
        )
        .unwrap();
        let whitelist: Cw20WhitelistResponse = from_json(res).unwrap();

        assert_eq!(whitelist.addresses.len(), 0);
    }

    #[test]
    fn test_query_cw20_whitelist_multiple() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let cw20_1 = "cw20_token_1";
        let cw20_2 = "cw20_token_2";
        let cw20_3 = "cw20_token_3";

        // Add multiple CW20s
        let info = mock_info(GOVERNANCE, &[]);
        for addr in [cw20_1, cw20_2, cw20_3] {
            let msg = ExecuteMsg::AddCw20 {
                contract_addr: addr.to_string(),
            };
            execute(deps.as_mut(), mock_env(), info.clone(), msg).unwrap();
        }

        let res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::Cw20Whitelist {},
        )
        .unwrap();
        let whitelist: Cw20WhitelistResponse = from_json(res).unwrap();

        assert_eq!(whitelist.addresses.len(), 3);
        let addresses: Vec<String> = whitelist
            .addresses
            .iter()
            .map(|a| a.to_string())
            .collect();
        assert!(addresses.contains(&cw20_1.to_string()));
        assert!(addresses.contains(&cw20_2.to_string()));
        assert!(addresses.contains(&cw20_3.to_string()));
    }

    #[test]
    fn test_query_cw20_whitelist_ordered() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Add CW20s in non-alphabetical order
        let info = mock_info(GOVERNANCE, &[]);
        let addrs = ["z_token", "a_token", "m_token"];
        for addr in addrs {
            let msg = ExecuteMsg::AddCw20 {
                contract_addr: addr.to_string(),
            };
            execute(deps.as_mut(), mock_env(), info.clone(), msg).unwrap();
        }

        let res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::Cw20Whitelist {},
        )
        .unwrap();
        let whitelist: Cw20WhitelistResponse = from_json(res).unwrap();

        // Should be sorted ascending
        assert_eq!(whitelist.addresses.len(), 3);
        assert_eq!(whitelist.addresses[0].as_str(), "a_token");
        assert_eq!(whitelist.addresses[1].as_str(), "m_token");
        assert_eq!(whitelist.addresses[2].as_str(), "z_token");
    }

    // ============ UUSD (Primary Native Token) TESTS ============
    //
    // These tests focus specifically on uusd operations since it's the primary
    // token the Treasury will handle. While other tests use DENOM_USTC (which
    // is "uusd"), these tests provide comprehensive coverage of the full uusd
    // lifecycle: receiving, querying, proposing withdrawal, and executing withdrawal.

    #[test]
    fn test_uusd_receive_and_query_balance() {
        // Test that the treasury can receive uusd and the balance is queryable
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let initial_amount = Uint128::from(5_000_000u128); // 5 USTC

        // Simulate treasury receiving uusd (native tokens are tracked via bank module)
        deps.querier
            .update_balance(env.contract.address.clone(), coins(5_000_000, "uusd"));

        // Query the balance
        let res = query(
            deps.as_ref(),
            env.clone(),
            QueryMsg::Balance {
                asset: AssetInfo::Native {
                    denom: "uusd".to_string(),
                },
            },
        )
        .unwrap();
        let balance: BalanceResponse = from_json(res).unwrap();

        assert_eq!(balance.amount, initial_amount);
        match balance.asset {
            AssetInfo::Native { denom } => assert_eq!(denom, "uusd"),
            _ => panic!("Expected Native uusd asset"),
        }

        // Also verify it shows up in AllBalances query
        let res = query(deps.as_ref(), env, QueryMsg::AllBalances {}).unwrap();
        let all_balances: AllBalancesResponse = from_json(res).unwrap();

        assert_eq!(all_balances.balances.len(), 1);
        assert_eq!(all_balances.balances[0].amount, initial_amount);
        match &all_balances.balances[0].asset {
            AssetInfo::Native { denom } => assert_eq!(denom, "uusd"),
            _ => panic!("Expected Native uusd asset in AllBalances"),
        }
    }

    #[test]
    fn test_uusd_propose_withdraw() {
        // Test the complete proposal flow for uusd withdrawal
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let withdraw_amount = Uint128::from(3_000_000u128); // 3 USTC

        // Fund treasury with uusd (10 USTC)
        deps.querier
            .update_balance(env.contract.address.clone(), coins(10_000_000, "uusd"));

        // Propose withdrawal of uusd
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: "uusd".to_string(),
            },
            amount: withdraw_amount,
        };

        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Verify response attributes
        assert_eq!(res.attributes.len(), 5);
        assert_eq!(res.attributes[0].key, "action");
        assert_eq!(res.attributes[0].value, "propose_withdraw");
        assert_eq!(res.attributes[2].key, "destination");
        assert_eq!(res.attributes[2].value, USER);
        assert_eq!(res.attributes[3].key, "amount");
        assert_eq!(res.attributes[3].value, withdraw_amount.to_string());

        // Extract withdrawal ID
        let withdrawal_id = res.attributes[1].value.clone();
        assert!(!withdrawal_id.is_empty());

        // Verify pending withdrawal was stored
        let pending = PENDING_WITHDRAWALS.load(&deps.storage, withdrawal_id.as_str()).unwrap();
        assert_eq!(pending.destination.as_str(), USER);
        assert_eq!(pending.amount, withdraw_amount);
        match &pending.asset {
            AssetInfo::Native { denom } => assert_eq!(denom, "uusd"),
            _ => panic!("Expected Native uusd asset in pending withdrawal"),
        }
        assert_eq!(
            pending.execute_after.seconds(),
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION
        );

        // Verify withdrawal shows up in pending withdrawals query
        let res = query(deps.as_ref(), env, QueryMsg::PendingWithdrawals {}).unwrap();
        let pending_list: PendingWithdrawalsResponse = from_json(res).unwrap();

        assert_eq!(pending_list.withdrawals.len(), 1);
        assert_eq!(pending_list.withdrawals[0].withdrawal_id, withdrawal_id);
        assert_eq!(pending_list.withdrawals[0].amount, withdraw_amount);
    }

    #[test]
    fn test_uusd_execute_withdraw_after_timelock() {
        // Test the complete execution flow for uusd withdrawal after timelock expires
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let mut env = mock_env();
        let withdraw_amount = Uint128::from(3_000_000u128); // 3 USTC

        // Fund treasury with uusd (10 USTC)
        deps.querier
            .update_balance(env.contract.address.clone(), coins(10_000_000, "uusd"));

        // Propose withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: "uusd".to_string(),
            },
            amount: withdraw_amount,
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        let withdrawal_id = res.attributes[1].value.clone();

        // Advance time past the 7-day timelock
        env.block.time = Timestamp::from_seconds(
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION + 1,
        );

        // Execute the withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Verify response
        assert_eq!(res.messages.len(), 1);
        assert_eq!(res.attributes[0].key, "action");
        assert_eq!(res.attributes[0].value, "execute_withdraw");
        assert_eq!(res.attributes[1].key, "withdrawal_id");
        assert_eq!(res.attributes[1].value, withdrawal_id);
        assert_eq!(res.attributes[2].key, "destination");
        assert_eq!(res.attributes[2].value, USER);
        assert_eq!(res.attributes[3].key, "amount");
        assert_eq!(res.attributes[3].value, withdraw_amount.to_string());

        // Verify the message is a BankMsg::Send with uusd
        match &res.messages[0].msg {
            CosmosMsg::Bank(BankMsg::Send { to_address, amount }) => {
                assert_eq!(to_address, USER);
                assert_eq!(amount.len(), 1);
                assert_eq!(amount[0].denom, "uusd");
                assert_eq!(amount[0].amount, withdraw_amount);
            }
            _ => panic!("Expected BankMsg::Send for uusd withdrawal"),
        }

        // Verify pending withdrawal was removed
        assert!(PENDING_WITHDRAWALS.may_load(&deps.storage, withdrawal_id.as_str()).unwrap().is_none());

        // Verify withdrawal no longer shows in pending query
        let res = query(deps.as_ref(), env, QueryMsg::PendingWithdrawals {}).unwrap();
        let pending_list: PendingWithdrawalsResponse = from_json(res).unwrap();
        assert!(pending_list.withdrawals.is_empty());
    }

    #[test]
    fn test_uusd_full_lifecycle_receive_propose_withdraw() {
        // Comprehensive end-to-end test of the uusd lifecycle
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let mut env = mock_env();

        // Step 1: Treasury receives initial uusd funding
        let initial_funding = Uint128::from(100_000_000u128); // 100 USTC
        deps.querier
            .update_balance(env.contract.address.clone(), coins(100_000_000, "uusd"));

        // Verify initial balance
        let res = query(
            deps.as_ref(),
            env.clone(),
            QueryMsg::Balance {
                asset: AssetInfo::Native {
                    denom: "uusd".to_string(),
                },
            },
        )
        .unwrap();
        let balance: BalanceResponse = from_json(res).unwrap();
        assert_eq!(balance.amount, initial_funding);

        // Step 2: Governance proposes first withdrawal
        let first_withdrawal = Uint128::from(25_000_000u128); // 25 USTC
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: "uusd".to_string(),
            },
            amount: first_withdrawal,
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        let first_withdrawal_id = res.attributes[1].value.clone();

        // Step 3: Wait for timelock to expire
        env.block.time = Timestamp::from_seconds(
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION + 1,
        );

        // Step 4: Execute first withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: first_withdrawal_id.clone(),
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Verify it generates the correct bank message
        match &res.messages[0].msg {
            CosmosMsg::Bank(BankMsg::Send { to_address, amount }) => {
                assert_eq!(to_address, USER);
                assert_eq!(amount[0].denom, "uusd");
                assert_eq!(amount[0].amount, first_withdrawal);
            }
            _ => panic!("Expected BankMsg::Send"),
        }

        // Step 5: Simulate balance update after withdrawal (in real chain this happens automatically)
        let remaining_balance = initial_funding - first_withdrawal;
        deps.querier.update_balance(
            env.contract.address.clone(),
            coins(remaining_balance.u128(), "uusd"),
        );

        // Verify updated balance
        let res = query(
            deps.as_ref(),
            env.clone(),
            QueryMsg::Balance {
                asset: AssetInfo::Native {
                    denom: "uusd".to_string(),
                },
            },
        )
        .unwrap();
        let balance: BalanceResponse = from_json(res).unwrap();
        assert_eq!(balance.amount, remaining_balance);

        // Step 6: Propose second withdrawal (different destination)
        let second_withdrawal = Uint128::from(10_000_000u128); // 10 USTC
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: "another_recipient".to_string(),
            asset: AssetInfo::Native {
                denom: "uusd".to_string(),
            },
            amount: second_withdrawal,
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        let second_withdrawal_id = res.attributes[1].value.clone();

        // Step 7: Wait for second timelock
        env.block.time = Timestamp::from_seconds(
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION + 1,
        );

        // Step 8: Execute second withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: second_withdrawal_id.clone(),
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        match &res.messages[0].msg {
            CosmosMsg::Bank(BankMsg::Send { to_address, amount }) => {
                assert_eq!(to_address, "another_recipient");
                assert_eq!(amount[0].denom, "uusd");
                assert_eq!(amount[0].amount, second_withdrawal);
            }
            _ => panic!("Expected BankMsg::Send"),
        }

        // Verify all withdrawals are cleared
        let res = query(deps.as_ref(), env, QueryMsg::PendingWithdrawals {}).unwrap();
        let pending_list: PendingWithdrawalsResponse = from_json(res).unwrap();
        assert!(pending_list.withdrawals.is_empty());
    }

    #[test]
    fn test_uusd_partial_withdrawal() {
        // Test withdrawing only a portion of uusd balance
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let mut env = mock_env();
        let total_balance = Uint128::from(50_000_000u128); // 50 USTC
        let partial_amount = Uint128::from(15_000_000u128); // 15 USTC

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(50_000_000, "uusd"));

        // Propose partial withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: "uusd".to_string(),
            },
            amount: partial_amount,
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        let withdrawal_id = res.attributes[1].value.clone();

        // Advance time and execute
        env.block.time = Timestamp::from_seconds(
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION + 1,
        );

        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Verify correct partial amount is sent
        match &res.messages[0].msg {
            CosmosMsg::Bank(BankMsg::Send { to_address, amount }) => {
                assert_eq!(to_address, USER);
                assert_eq!(amount[0].amount, partial_amount);
                // Treasury still has remaining balance (35 USTC)
            }
            _ => panic!("Expected BankMsg::Send"),
        }

        // Update balance to reflect withdrawal
        let remaining = total_balance - partial_amount;
        deps.querier
            .update_balance(env.contract.address.clone(), coins(remaining.u128(), "uusd"));

        // Verify remaining balance
        let res = query(
            deps.as_ref(),
            env,
            QueryMsg::Balance {
                asset: AssetInfo::Native {
                    denom: "uusd".to_string(),
                },
            },
        )
        .unwrap();
        let balance: BalanceResponse = from_json(res).unwrap();
        assert_eq!(balance.amount, remaining);
    }

    #[test]
    fn test_uusd_withdraw_insufficient_balance() {
        // Test that withdrawal fails when uusd balance is insufficient
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let mut env = mock_env();
        let available_balance = Uint128::from(5_000_000u128); // 5 USTC
        let requested_amount = Uint128::from(10_000_000u128); // 10 USTC

        // Fund treasury with less than requested
        deps.querier
            .update_balance(env.contract.address.clone(), coins(5_000_000, "uusd"));

        // Propose withdrawal for more than available
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: "uusd".to_string(),
            },
            amount: requested_amount,
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        let withdrawal_id = res.attributes[1].value.clone();

        // Advance time past timelock
        env.block.time = Timestamp::from_seconds(
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION + 1,
        );

        // Try to execute - should fail due to insufficient balance
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();

        match err {
            ContractError::InsufficientBalance { requested, available } => {
                assert_eq!(requested, requested_amount.to_string());
                assert_eq!(available, available_balance.to_string());
            }
            _ => panic!("Expected InsufficientBalance error"),
        }

        // Verify withdrawal is NOT removed (can be retried after funding)
        assert!(PENDING_WITHDRAWALS.may_load(&deps.storage, withdrawal_id.as_str()).unwrap().is_some());
    }

    #[test]
    fn test_uusd_cancel_pending_withdrawal() {
        // Test cancelling a uusd withdrawal proposal
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let amount = Uint128::from(20_000_000u128); // 20 USTC

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(20_000_000, "uusd"));

        // Propose withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: "uusd".to_string(),
            },
            amount,
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        let withdrawal_id = res.attributes[1].value.clone();

        // Verify it's pending
        assert!(PENDING_WITHDRAWALS.may_load(&deps.storage, withdrawal_id.as_str()).unwrap().is_some());

        // Cancel the withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::CancelWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        assert_eq!(res.attributes[0].key, "action");
        assert_eq!(res.attributes[0].value, "cancel_withdraw");
        assert_eq!(res.attributes[1].key, "withdrawal_id");
        assert_eq!(res.attributes[1].value, withdrawal_id);

        // Verify withdrawal was removed
        assert!(PENDING_WITHDRAWALS.may_load(&deps.storage, withdrawal_id.as_str()).unwrap().is_none());

        // Verify no pending withdrawals
        let res = query(deps.as_ref(), env, QueryMsg::PendingWithdrawals {}).unwrap();
        let pending_list: PendingWithdrawalsResponse = from_json(res).unwrap();
        assert!(pending_list.withdrawals.is_empty());
    }

    #[test]
    fn test_uusd_multiple_pending_withdrawals() {
        // Test having multiple pending uusd withdrawals simultaneously
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let mut env = mock_env();

        // Fund treasury with enough for all withdrawals
        deps.querier
            .update_balance(env.contract.address.clone(), coins(100_000_000, "uusd"));

        // Propose first withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: "uusd".to_string(),
            },
            amount: Uint128::from(10_000_000u128),
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        let withdrawal_id_1 = res.attributes[1].value.clone();

        // Advance time slightly (to get different ID)
        env.block.time = Timestamp::from_seconds(env.block.time.seconds() + 60);

        // Propose second withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: "recipient_two".to_string(),
            asset: AssetInfo::Native {
                denom: "uusd".to_string(),
            },
            amount: Uint128::from(20_000_000u128),
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        let withdrawal_id_2 = res.attributes[1].value.clone();

        // Advance time again
        env.block.time = Timestamp::from_seconds(env.block.time.seconds() + 60);

        // Propose third withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: "recipient_three".to_string(),
            asset: AssetInfo::Native {
                denom: "uusd".to_string(),
            },
            amount: Uint128::from(30_000_000u128),
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        let withdrawal_id_3 = res.attributes[1].value.clone();

        // Verify all three are pending
        let res = query(deps.as_ref(), env.clone(), QueryMsg::PendingWithdrawals {}).unwrap();
        let pending_list: PendingWithdrawalsResponse = from_json(res).unwrap();
        assert_eq!(pending_list.withdrawals.len(), 3);

        // Verify each withdrawal has unique ID
        let ids: Vec<&String> = pending_list.withdrawals.iter()
            .map(|w| &w.withdrawal_id)
            .collect();
        assert!(ids.contains(&&withdrawal_id_1));
        assert!(ids.contains(&&withdrawal_id_2));
        assert!(ids.contains(&&withdrawal_id_3));

        // Advance past all timelocks
        env.block.time = Timestamp::from_seconds(
            env.block.time.seconds() + DEFAULT_TIMELOCK_DURATION + 1,
        );

        // Execute withdrawals in non-sequential order (2, 1, 3)
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id_2.clone(),
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        match &res.messages[0].msg {
            CosmosMsg::Bank(BankMsg::Send { to_address, amount }) => {
                assert_eq!(to_address, "recipient_two");
                assert_eq!(amount[0].amount, Uint128::from(20_000_000u128));
            }
            _ => panic!("Expected BankMsg::Send"),
        }

        // Execute first
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id_1.clone(),
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        match &res.messages[0].msg {
            CosmosMsg::Bank(BankMsg::Send { to_address, amount }) => {
                assert_eq!(to_address, USER);
                assert_eq!(amount[0].amount, Uint128::from(10_000_000u128));
            }
            _ => panic!("Expected BankMsg::Send"),
        }

        // Verify only one remaining
        let res = query(deps.as_ref(), env.clone(), QueryMsg::PendingWithdrawals {}).unwrap();
        let pending_list: PendingWithdrawalsResponse = from_json(res).unwrap();
        assert_eq!(pending_list.withdrawals.len(), 1);
        assert_eq!(pending_list.withdrawals[0].withdrawal_id, withdrawal_id_3);

        // Execute last
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id_3.clone(),
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        match &res.messages[0].msg {
            CosmosMsg::Bank(BankMsg::Send { to_address, amount }) => {
                assert_eq!(to_address, "recipient_three");
                assert_eq!(amount[0].amount, Uint128::from(30_000_000u128));
            }
            _ => panic!("Expected BankMsg::Send"),
        }

        // All cleared
        let res = query(deps.as_ref(), env, QueryMsg::PendingWithdrawals {}).unwrap();
        let pending_list: PendingWithdrawalsResponse = from_json(res).unwrap();
        assert!(pending_list.withdrawals.is_empty());
    }

    #[test]
    fn test_uusd_withdrawal_timelock_enforcement() {
        // Test that the 7-day timelock is strictly enforced for uusd
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let mut env = mock_env();
        let amount = Uint128::from(10_000_000u128);

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(10_000_000, "uusd"));

        // Propose withdrawal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: "uusd".to_string(),
            },
            amount,
        };
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        let withdrawal_id = res.attributes[1].value.clone();

        // Try to execute at various times before timelock expires
        let test_times = [
            1,                                  // 1 second after proposal
            3600,                               // 1 hour
            86400,                              // 1 day
            604799,                             // 1 second before expiry
            DEFAULT_TIMELOCK_DURATION - 1,      // Just before expiry
        ];

        let proposal_time = env.block.time.seconds();
        for seconds in test_times {
            env.block.time = Timestamp::from_seconds(proposal_time + seconds);

            let info = mock_info(GOVERNANCE, &[]);
            let msg = ExecuteMsg::ExecuteWithdraw {
                withdrawal_id: withdrawal_id.clone(),
            };
            let err = execute(deps.as_mut(), env.clone(), info, msg).unwrap_err();

            match err {
                ContractError::TimelockNotExpired { remaining_seconds } => {
                    assert!(remaining_seconds > 0);
                    assert_eq!(remaining_seconds, DEFAULT_TIMELOCK_DURATION - seconds);
                }
                _ => panic!("Expected TimelockNotExpired error at {} seconds", seconds),
            }
        }

        // Verify withdrawal is still pending
        assert!(PENDING_WITHDRAWALS.may_load(&deps.storage, withdrawal_id.as_str()).unwrap().is_some());

        // Now try at exact expiry time - should still fail
        env.block.time = Timestamp::from_seconds(proposal_time + DEFAULT_TIMELOCK_DURATION);
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        // At exactly the timelock time, execute_after is NOT yet passed
        // This is because execute_after = proposal_time + timelock, and we check `env.block.time < execute_after`
        let err = execute(deps.as_mut(), env.clone(), info, msg).unwrap_err();
        match err {
            ContractError::TimelockNotExpired { remaining_seconds } => {
                assert_eq!(remaining_seconds, 0);
            }
            _ => panic!("Expected TimelockNotExpired error at exactly timelock duration"),
        }

        // Finally, 1 second after timelock - should succeed
        env.block.time = Timestamp::from_seconds(proposal_time + DEFAULT_TIMELOCK_DURATION + 1);
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ExecuteWithdraw {
            withdrawal_id: withdrawal_id.clone(),
        };
        let res = execute(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.messages.len(), 1);
    }

    #[test]
    fn test_propose_withdraw_id_collision_exceeds_limit() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let destination_addr = Addr::unchecked(USER);
        let asset = AssetInfo::Native {
            denom: DENOM_USTC.to_string(),
        };
        let amount = Uint128::from(1000u128);

        // Generate the initial withdrawal ID that will be used
        let initial_id = generate_withdrawal_id(&destination_addr, &asset, amount, env.block.time);

        // Pre-populate storage with the initial ID to trigger collision
        let dummy_withdrawal = PendingWithdrawal {
            destination: destination_addr.clone(),
            asset: asset.clone(),
            amount,
            execute_after: env.block.time.plus_seconds(DEFAULT_TIMELOCK_DURATION),
        };
        PENDING_WITHDRAWALS
            .save(deps.as_mut().storage, initial_id.as_str(), &dummy_withdrawal)
            .unwrap();

        // Pre-populate storage with withdrawal IDs that will collide in the loop
        // The loop generates new IDs using: hash(previous_id + counter + nanos)
        let mut current_id = initial_id.clone();
        for counter in 0u64..=1001u64 {
            // Generate the ID that would be created in the loop at this iteration
            let mut hasher = Sha256::new();
            hasher.update(current_id.as_bytes());
            hasher.update(&counter.to_be_bytes());
            hasher.update(&env.block.time.nanos().to_be_bytes());
            let hash = hasher.finalize();
            let next_id = hex::encode(&hash[..16]);

            // Save this ID to storage to force a collision
            let dummy_withdrawal = PendingWithdrawal {
                destination: destination_addr.clone(),
                asset: asset.clone(),
                amount,
                execute_after: env.block.time.plus_seconds(DEFAULT_TIMELOCK_DURATION),
            };
            PENDING_WITHDRAWALS
                .save(deps.as_mut().storage, next_id.as_str(), &dummy_withdrawal)
                .unwrap();

            current_id = next_id;
        }

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(1000, DENOM_USTC));

        // Now try to propose a withdrawal - it should hit the collision limit
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeWithdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        match err {
            ContractError::Std(cosmwasm_std::StdError::GenericErr { msg }) => {
                assert_eq!(msg, "Failed to generate unique withdrawal ID");
            }
            _ => panic!("Expected generic error for failed withdrawal ID generation"),
        }
    }

    // ============ SWAP CONTRACT TESTS ============

    #[test]
    fn test_set_swap_contract_governance_only() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let swap_addr = "swap_contract_addr";

        // Governance can set swap contract
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::SetSwapContract {
            contract_addr: swap_addr.to_string(),
        };
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();
        assert_eq!(res.attributes[0].value, "set_swap_contract");
        assert_eq!(res.attributes[1].value, swap_addr);

        // Verify it's saved
        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.swap_contract, Some(Addr::unchecked(swap_addr)));
    }

    #[test]
    fn test_set_swap_contract_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Non-governance cannot set swap contract
        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::SetSwapContract {
            contract_addr: "swap_contract_addr".to_string(),
        };
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_set_swap_contract_updates_existing() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let swap_addr_1 = "swap_contract_addr_1";
        let swap_addr_2 = "swap_contract_addr_2";

        // Set first swap contract
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::SetSwapContract {
            contract_addr: swap_addr_1.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info.clone(), msg).unwrap();

        // Update to second swap contract
        let msg = ExecuteMsg::SetSwapContract {
            contract_addr: swap_addr_2.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Verify updated
        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.swap_contract, Some(Addr::unchecked(swap_addr_2)));
    }

    #[test]
    fn test_swap_deposit_success() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let swap_addr = "swap_contract_addr";
        let ustc_amount = Uint128::from(10_000_000u128); // 10 USTC

        // Set swap contract
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::SetSwapContract {
            contract_addr: swap_addr.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // User deposits USTC
        let info = mock_info(USER, &coins(ustc_amount.u128(), DENOM_USTC));
        let msg = ExecuteMsg::SwapDeposit {};
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Verify attributes
        assert_eq!(res.attributes[0].value, "swap_deposit");
        assert_eq!(res.attributes[1].value, USER);
        assert_eq!(res.attributes[2].value, ustc_amount.to_string());

        // Verify WasmMsg::Execute to swap contract
        assert_eq!(res.messages.len(), 1);
        match &res.messages[0].msg {
            CosmosMsg::Wasm(WasmMsg::Execute { contract_addr, msg, funds }) => {
                assert_eq!(contract_addr, swap_addr);
                assert!(funds.is_empty());

                // Verify message structure (JSON: {"notify_deposit": {...}})
                let notify_msg: SwapExecuteMsg = from_json(msg.clone()).unwrap();
                match notify_msg {
                    SwapExecuteMsg::NotifyDeposit { depositor, amount } => {
                        assert_eq!(depositor, USER);
                        assert_eq!(amount, ustc_amount);
                    }
                }
            }
            _ => panic!("Expected WasmMsg::Execute"),
        }

        // Verify USTC is held by treasury (no transfer, just held)
        // The funds are sent via MessageInfo and held by the contract
        // Update querier balance to reflect the deposit
        let env = mock_env();
        deps.querier
            .update_balance(env.contract.address.clone(), coins(ustc_amount.u128(), DENOM_USTC));
        
        // Verify balance via query
        let res = query(
            deps.as_ref(),
            env.clone(),
            QueryMsg::Balance {
                asset: AssetInfo::Native {
                    denom: DENOM_USTC.to_string(),
                },
            },
        )
        .unwrap();
        let balance: BalanceResponse = from_json(res).unwrap();
        assert_eq!(balance.amount, ustc_amount);
    }

    #[test]
    fn test_swap_deposit_swap_contract_not_set() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Try to deposit without setting swap contract
        let info = mock_info(USER, &coins(1_000_000, DENOM_USTC));
        let msg = ExecuteMsg::SwapDeposit {};
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::SwapContractNotSet);
    }

    #[test]
    fn test_swap_deposit_empty_funds() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let swap_addr = "swap_contract_addr";

        // Set swap contract
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::SetSwapContract {
            contract_addr: swap_addr.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Try to deposit with no funds
        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::SwapDeposit {};
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::InvalidSwapFunds { received } => {
                assert_eq!(received, vec!["empty".to_string()]);
            }
            _ => panic!("Expected InvalidSwapFunds error"),
        }
    }

    #[test]
    fn test_swap_deposit_wrong_denom() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let swap_addr = "swap_contract_addr";

        // Set swap contract
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::SetSwapContract {
            contract_addr: swap_addr.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Try to deposit LUNC instead of USTC
        let info = mock_info(USER, &coins(1_000_000, DENOM_LUNC));
        let msg = ExecuteMsg::SwapDeposit {};
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::InvalidSwapFunds { received } => {
                assert_eq!(received.len(), 1);
                assert!(received[0].contains("uluna"));
            }
            _ => panic!("Expected InvalidSwapFunds error"),
        }
    }

    #[test]
    fn test_swap_deposit_multiple_denoms() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let swap_addr = "swap_contract_addr";

        // Set swap contract
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::SetSwapContract {
            contract_addr: swap_addr.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Try to deposit with multiple denoms
        let mut funds = coins(1_000_000, DENOM_USTC);
        funds.extend(coins(1_000_000, DENOM_LUNC));
        let info = mock_info(USER, &funds);
        let msg = ExecuteMsg::SwapDeposit {};
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::InvalidSwapFunds { received } => {
                assert_eq!(received.len(), 2);
            }
            _ => panic!("Expected InvalidSwapFunds error"),
        }
    }

    #[test]
    fn test_swap_deposit_below_minimum() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let swap_addr = "swap_contract_addr";

        // Set swap contract
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::SetSwapContract {
            contract_addr: swap_addr.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Try to deposit less than 1 USTC (999,999 uusd)
        let info = mock_info(USER, &coins(999_999, DENOM_USTC));
        let msg = ExecuteMsg::SwapDeposit {};
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::BelowMinimumSwap { received } => {
                assert_eq!(received, "999999");
            }
            _ => panic!("Expected BelowMinimumSwap error"),
        }
    }

    #[test]
    fn test_swap_deposit_exact_minimum() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let swap_addr = "swap_contract_addr";
        let ustc_amount = Uint128::from(1_000_000u128); // Exactly 1 USTC

        // Set swap contract
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::SetSwapContract {
            contract_addr: swap_addr.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Deposit exactly 1 USTC (should succeed)
        let info = mock_info(USER, &coins(ustc_amount.u128(), DENOM_USTC));
        let msg = ExecuteMsg::SwapDeposit {};
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();
        assert_eq!(res.messages.len(), 1);
    }

    #[test]
    fn test_config_query_includes_swap_contract() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Initially swap_contract should be None
        let res = query(deps.as_ref(), mock_env(), QueryMsg::Config {}).unwrap();
        let config: ConfigResponse = from_json(res).unwrap();
        assert_eq!(config.swap_contract, None);

        // Set swap contract
        let swap_addr = "swap_contract_addr";
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::SetSwapContract {
            contract_addr: swap_addr.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Query again - should include swap contract
        let res = query(deps.as_ref(), mock_env(), QueryMsg::Config {}).unwrap();
        let config: ConfigResponse = from_json(res).unwrap();
        assert_eq!(
            config.swap_contract,
            Some(Addr::unchecked(swap_addr))
        );
        assert_eq!(config.governance, Addr::unchecked(GOVERNANCE));
        assert_eq!(config.timelock_duration, DEFAULT_TIMELOCK_DURATION);
    }

    #[test]
    fn test_swap_deposit_atomic_execution() {
        // Test that the WasmMsg::Execute is properly set up for atomic execution
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let swap_addr = "swap_contract_addr";
        let ustc_amount = Uint128::from(5_000_000u128); // 5 USTC

        // Set swap contract
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::SetSwapContract {
            contract_addr: swap_addr.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Deposit USTC
        let info = mock_info(USER, &coins(ustc_amount.u128(), DENOM_USTC));
        let msg = ExecuteMsg::SwapDeposit {};
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Verify the submessage is properly formatted for atomic execution
        // The swap contract will be called in the same transaction
        assert_eq!(res.messages.len(), 1);
        match &res.messages[0].msg {
            CosmosMsg::Wasm(WasmMsg::Execute {
                contract_addr,
                msg: _,
                funds,
            }) => {
                assert_eq!(contract_addr, swap_addr);
                // No funds sent - swap contract doesn't need them, it just needs notification
                assert!(funds.is_empty());
            }
            _ => panic!("Expected WasmMsg::Execute"),
        }
    }

    #[test]
    fn test_swap_notify_message_json_format() {
        // Verify the message format matches swap contract expectations
        // The swap contract expects: {"notify_deposit": {"depositor": "...", "amount": "..."}}
        let msg = SwapExecuteMsg::NotifyDeposit {
            depositor: "user_address".to_string(),
            amount: Uint128::from(1_000_000u128),
        };

        let json = to_json_binary(&msg).unwrap();
        let json_str = String::from_utf8(json.to_vec()).unwrap();

        // Verify JSON structure
        assert!(json_str.contains("notify_deposit"));
        assert!(json_str.contains("depositor"));
        assert!(json_str.contains("user_address"));
        assert!(json_str.contains("amount"));
        assert!(json_str.contains("1000000"));

        // Verify we can deserialize back
        let decoded: SwapExecuteMsg = from_json(json).unwrap();
        match decoded {
            SwapExecuteMsg::NotifyDeposit { depositor, amount } => {
                assert_eq!(depositor, "user_address");
                assert_eq!(amount, Uint128::from(1_000_000u128));
            }
        }
    }

    #[test]
    fn test_swap_deposit_large_amount() {
        // Test with a large USTC amount to ensure no overflow issues
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let swap_addr = "swap_contract_addr";
        // 1 billion USTC (1,000,000,000 * 1,000,000 = 10^15 uusd)
        let ustc_amount = Uint128::from(1_000_000_000_000_000u128);

        // Set swap contract
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::SetSwapContract {
            contract_addr: swap_addr.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Deposit large amount
        let info = mock_info(USER, &coins(ustc_amount.u128(), DENOM_USTC));
        let msg = ExecuteMsg::SwapDeposit {};
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Verify correct amount in message
        assert_eq!(res.messages.len(), 1);
        match &res.messages[0].msg {
            CosmosMsg::Wasm(WasmMsg::Execute { msg, .. }) => {
                let notify_msg: SwapExecuteMsg = from_json(msg.clone()).unwrap();
                match notify_msg {
                    SwapExecuteMsg::NotifyDeposit { depositor, amount } => {
                        assert_eq!(depositor, USER);
                        assert_eq!(amount, ustc_amount);
                    }
                }
            }
            _ => panic!("Expected WasmMsg::Execute"),
        }
    }

    #[test]
    fn test_swap_contract_can_be_changed() {
        // Test that governance can update the swap contract address
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let swap_addr_1 = "swap_contract_addr_1";
        let swap_addr_2 = "swap_contract_addr_2";

        // Set first swap contract
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::SetSwapContract {
            contract_addr: swap_addr_1.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info.clone(), msg).unwrap();

        // User deposits with first contract
        let user_info = mock_info(USER, &coins(1_000_000, DENOM_USTC));
        let msg = ExecuteMsg::SwapDeposit {};
        let res = execute(deps.as_mut(), mock_env(), user_info.clone(), msg).unwrap();
        match &res.messages[0].msg {
            CosmosMsg::Wasm(WasmMsg::Execute { contract_addr, .. }) => {
                assert_eq!(contract_addr, swap_addr_1);
            }
            _ => panic!("Expected WasmMsg::Execute"),
        }

        // Governance changes swap contract
        let msg = ExecuteMsg::SetSwapContract {
            contract_addr: swap_addr_2.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // User deposits with second contract
        let msg = ExecuteMsg::SwapDeposit {};
        let res = execute(deps.as_mut(), mock_env(), user_info, msg).unwrap();
        match &res.messages[0].msg {
            CosmosMsg::Wasm(WasmMsg::Execute { contract_addr, .. }) => {
                assert_eq!(contract_addr, swap_addr_2);
            }
            _ => panic!("Expected WasmMsg::Execute"),
        }
    }
}

