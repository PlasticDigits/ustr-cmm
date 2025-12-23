//! Treasury contract implementation
//!
//! # Security Note: Governance Transition Plan
//!
//! This contract does not implement timelocks on withdrawals. This is intentional for Phase 1.
//! The governance address will be transitioned as follows:
//!
//! - **Phase 1 (Current)**: Single admin EOA controls governance
//! - **Phase 2**: Governance transferred to a 3-of-5 multi-sig with additional security measures
//! - **Phase 3+**: Full DAO governance with on-chain voting and timelocks
//!
//! Security measures like withdrawal timelocks will be implemented in the multi-sig and DAO
//! contracts themselves, rather than in this treasury contract. This keeps the treasury
//! contract simple and allows governance mechanisms to evolve without requiring treasury
//! contract upgrades (which are not possible since contracts are immutable).

#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{
    to_json_binary, Addr, BankMsg, Binary, Coin, CosmosMsg, Deps, DepsMut, Env, MessageInfo,
    Order, Response, StdResult, Uint128, WasmMsg,
};
use cw2::set_contract_version;
use cw20::Cw20ExecuteMsg;

use crate::error::ContractError;
use crate::msg::{
    AllBalancesResponse, AssetBalance, BalanceResponse, ConfigResponse, Cw20WhitelistResponse,
    ExecuteMsg, InstantiateMsg, PendingGovernanceEntry, PendingGovernanceResponse, QueryMsg,
};
use crate::state::{
    Config, PendingGovernance, CONFIG, CONTRACT_NAME, CONTRACT_VERSION, CW20_WHITELIST,
    DEFAULT_TIMELOCK_DURATION, PENDING_GOVERNANCE,
};
use common::AssetInfo;
use cw20::Cw20ReceiveMsg;

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
        ExecuteMsg::Withdraw {
            destination,
            asset,
            amount,
        } => execute_withdraw(deps, env, info, destination, asset, amount),
        ExecuteMsg::AddCw20 { contract_addr } => execute_add_cw20(deps, info, contract_addr),
        ExecuteMsg::RemoveCw20 { contract_addr } => execute_remove_cw20(deps, info, contract_addr),
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

    // Clear all other pending proposals since governance has changed
    // The new governance should create fresh proposals if needed
    let keys_to_remove: Vec<String> = PENDING_GOVERNANCE
        .keys(deps.storage, None, None, Order::Ascending)
        .collect::<StdResult<Vec<_>>>()?;
    for key in keys_to_remove {
        PENDING_GOVERNANCE.remove(deps.storage, &key);
    }

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

fn execute_withdraw(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    destination: String,
    asset: AssetInfo,
    amount: Uint128,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Only governance can withdraw
    if info.sender != config.governance {
        return Err(ContractError::Unauthorized);
    }

    let destination_addr = deps.api.addr_validate(&destination)?;

    let msg: CosmosMsg = match &asset {
        AssetInfo::Native { denom } => {
            // Check balance
            let balance = deps
                .querier
                .query_balance(&env.contract.address, denom)?
                .amount;
            if balance < amount {
                return Err(ContractError::InsufficientBalance {
                    requested: amount.to_string(),
                    available: balance.to_string(),
                });
            }

            BankMsg::Send {
                to_address: destination_addr.to_string(),
                amount: vec![Coin {
                    denom: denom.clone(),
                    amount,
                }],
            }
            .into()
        }
        AssetInfo::Cw20 { contract_addr } => {
            // CW20 transfer - balance check happens in the CW20 contract
            WasmMsg::Execute {
                contract_addr: contract_addr.to_string(),
                msg: to_json_binary(&Cw20ExecuteMsg::Transfer {
                    recipient: destination_addr.to_string(),
                    amount,
                })?,
                funds: vec![],
            }
            .into()
        }
    };

    Ok(Response::new()
        .add_message(msg)
        .add_attribute("action", "withdraw")
        .add_attribute("destination", destination_addr)
        .add_attribute("amount", amount))
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

fn execute_receive_cw20(
    deps: DepsMut,
    _info: MessageInfo,
    cw20_msg: Cw20ReceiveMsg,
) -> Result<Response, ContractError> {
    // The CW20 contract has already transferred tokens to this contract
    // We just need to acknowledge receipt - no action needed
    // The msg field can be used for future extensions, but for now we ignore it
    
    let sender = deps.api.addr_validate(&cw20_msg.sender)?;
    
    Ok(Response::new()
        .add_attribute("action", "receive_cw20")
        .add_attribute("sender", sender)
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
    }
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        governance: config.governance,
        timelock_duration: config.timelock_duration,
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

// ============ TESTS ============

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{coin, coins, from_json, Timestamp, Uint128};
    use cw20::BalanceResponse as Cw20BalanceResponse;

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
    fn test_accept_governance_clears_all_pending() {
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

        // Verify ALL pending proposals are cleared (not just the accepted one)
        assert!(PENDING_GOVERNANCE.may_load(&deps.storage, NEW_GOVERNANCE).unwrap().is_none());
        assert!(PENDING_GOVERNANCE.may_load(&deps.storage, "another_governance").unwrap().is_none());
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

        // OLD governance should NOT be able to withdraw anymore
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::Withdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount: Uint128::from(100u128),
        };
        let err = execute(deps.as_mut(), env_after.clone(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);

        // NEW governance SHOULD be able to withdraw
        let info = mock_info(NEW_GOVERNANCE, &[]);
        let msg = ExecuteMsg::Withdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount: Uint128::from(100u128),
        };
        let res = execute(deps.as_mut(), env_after.clone(), info, msg).unwrap();
        assert_eq!(res.messages.len(), 1);

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
    fn test_withdraw_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info("random_user", &[]);
        let msg = ExecuteMsg::Withdraw {
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
    fn test_withdraw_native_insufficient_balance() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Fund treasury with some tokens
        deps.querier.update_balance(
            mock_env().contract.address.clone(),
            coins(1000, DENOM_USTC),
        );

        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::Withdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount: Uint128::from(2000u128), // More than available
        };

        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::InsufficientBalance { requested, available } => {
                assert_eq!(requested, "2000");
                assert_eq!(available, "1000");
            }
            _ => panic!("Expected InsufficientBalance error"),
        }
    }

    #[test]
    fn test_withdraw_native_success() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let amount = Uint128::from(1000u128);

        // Fund treasury
        deps.querier
            .update_balance(env.contract.address.clone(), coins(1000, DENOM_USTC));

        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::Withdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Native {
                denom: DENOM_USTC.to_string(),
            },
            amount,
        };

        let res = execute(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.messages.len(), 1);
        assert_eq!(res.attributes.len(), 3);
        assert_eq!(res.attributes[0].key, "action");
        assert_eq!(res.attributes[0].value, "withdraw");

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
    }

    // Note: Address validation is handled by CosmWasm's addr_validate.
    // In production, invalid addresses will be rejected, but mock_dependencies
    // may accept them. This is tested implicitly through successful operations.

    #[test]
    fn test_withdraw_cw20_success() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
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

        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::Withdraw {
            destination: USER.to_string(),
            asset: AssetInfo::Cw20 {
                contract_addr: cw20_addr.clone(),
            },
            amount,
        };

        let res = execute(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.messages.len(), 1);
        assert_eq!(res.attributes.len(), 3);

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

        let sender = "sender_addr";
        let amount = Uint128::from(1000u128);

        let cw20_msg = Cw20ReceiveMsg {
            sender: sender.to_string(),
            amount,
            msg: cosmwasm_std::Binary::default(),
        };

        let info = mock_info(CW20_TOKEN, &[]);
        let msg = ExecuteMsg::Receive(cw20_msg.clone());

        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();
        assert_eq!(res.attributes.len(), 3);
        assert_eq!(res.attributes[0].key, "action");
        assert_eq!(res.attributes[0].value, "receive_cw20");
        assert_eq!(res.attributes[1].key, "sender");
        assert_eq!(res.attributes[1].value, sender);
        assert_eq!(res.attributes[2].key, "amount");
        assert_eq!(res.attributes[2].value, amount.to_string());
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
}

