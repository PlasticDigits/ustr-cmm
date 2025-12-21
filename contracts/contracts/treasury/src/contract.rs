//! Treasury contract implementation

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
    ExecuteMsg, InstantiateMsg, PendingGovernanceResponse, QueryMsg,
};
use crate::state::{
    Config, PendingGovernance, CONFIG, CONTRACT_NAME, CONTRACT_VERSION, CW20_WHITELIST,
    DEFAULT_TIMELOCK_DURATION, PENDING_GOVERNANCE,
};
use common::AssetInfo;

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
        ExecuteMsg::ProposeGovernance { new_governance } => {
            execute_propose_governance(deps, env, info, new_governance)
        }
        ExecuteMsg::AcceptGovernance {} => execute_accept_governance(deps, env, info),
        ExecuteMsg::CancelGovernanceProposal {} => {
            execute_cancel_governance_proposal(deps, env, info)
        }
        ExecuteMsg::Withdraw {
            destination,
            asset,
            amount,
        } => execute_withdraw(deps, env, info, destination, asset, amount),
        ExecuteMsg::AddCw20 { contract_addr } => execute_add_cw20(deps, info, contract_addr),
        ExecuteMsg::RemoveCw20 { contract_addr } => execute_remove_cw20(deps, info, contract_addr),
    }
}

fn execute_propose_governance(
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

    PENDING_GOVERNANCE.save(deps.storage, &pending)?;

    Ok(Response::new()
        .add_attribute("action", "propose_governance")
        .add_attribute("new_governance", new_address)
        .add_attribute("execute_after", pending.execute_after.to_string()))
}

fn execute_accept_governance(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
) -> Result<Response, ContractError> {
    let pending = PENDING_GOVERNANCE
        .may_load(deps.storage)?
        .ok_or(ContractError::NoPendingGovernance)?;

    // Only pending governance can accept
    if info.sender != pending.new_address {
        return Err(ContractError::UnauthorizedPendingGovernance);
    }

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

    // Remove pending proposal
    PENDING_GOVERNANCE.remove(deps.storage);

    Ok(Response::new()
        .add_attribute("action", "accept_governance")
        .add_attribute("old_governance", old_governance)
        .add_attribute("new_governance", config.governance))
}

fn execute_cancel_governance_proposal(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Only current governance can cancel
    if info.sender != config.governance {
        return Err(ContractError::Unauthorized);
    }

    let pending = PENDING_GOVERNANCE
        .may_load(deps.storage)?
        .ok_or(ContractError::NoPendingGovernance)?;

    PENDING_GOVERNANCE.remove(deps.storage);

    Ok(Response::new()
        .add_attribute("action", "cancel_governance_proposal")
        .add_attribute("cancelled_address", pending.new_address))
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

fn query_pending_governance(deps: Deps) -> StdResult<Option<PendingGovernanceResponse>> {
    let pending = PENDING_GOVERNANCE.may_load(deps.storage)?;
    Ok(pending.map(|p| PendingGovernanceResponse {
        new_address: p.new_address,
        execute_after: p.execute_after,
    }))
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
    use cosmwasm_std::Timestamp;

    const GOVERNANCE: &str = "governance_addr";
    const NEW_GOVERNANCE: &str = "new_governance_addr";

    fn setup_contract(deps: DepsMut) {
        let msg = InstantiateMsg {
            governance: GOVERNANCE.to_string(),
        };
        let info = mock_info("creator", &[]);
        instantiate(deps, mock_env(), info, msg).unwrap();
    }

    #[test]
    fn test_instantiate() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.governance.as_str(), GOVERNANCE);
        assert_eq!(config.timelock_duration, DEFAULT_TIMELOCK_DURATION);
    }

    #[test]
    fn test_propose_governance_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info("random_user", &[]);
        let msg = ExecuteMsg::ProposeGovernance {
            new_governance: NEW_GOVERNANCE.to_string(),
        };

        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_propose_governance_success() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernance {
            new_governance: NEW_GOVERNANCE.to_string(),
        };

        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();
        assert_eq!(res.attributes.len(), 3);

        let pending = PENDING_GOVERNANCE.load(&deps.storage).unwrap();
        assert_eq!(pending.new_address.as_str(), NEW_GOVERNANCE);
    }

    #[test]
    fn test_accept_governance_timelock_not_expired() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Propose governance change
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernance {
            new_governance: NEW_GOVERNANCE.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Try to accept before timelock expires
        let info = mock_info(NEW_GOVERNANCE, &[]);
        let msg = ExecuteMsg::AcceptGovernance {};

        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::TimelockNotExpired { .. } => {}
            _ => panic!("Expected TimelockNotExpired error"),
        }
    }

    #[test]
    fn test_accept_governance_success() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Propose governance change
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernance {
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
        let msg = ExecuteMsg::AcceptGovernance {};
        let res = execute(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.attributes.len(), 3);

        // Verify governance changed
        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.governance.as_str(), NEW_GOVERNANCE);

        // Verify pending is cleared
        assert!(PENDING_GOVERNANCE.may_load(&deps.storage).unwrap().is_none());
    }

    #[test]
    fn test_cancel_governance_proposal() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Propose governance change
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernance {
            new_governance: NEW_GOVERNANCE.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Cancel the proposal
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::CancelGovernanceProposal {};
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Verify pending is cleared
        assert!(PENDING_GOVERNANCE.may_load(&deps.storage).unwrap().is_none());
    }

    #[test]
    fn test_add_remove_cw20_whitelist() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let cw20_addr = "cw20_token_addr";

        // Add CW20
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::AddCw20 {
            contract_addr: cw20_addr.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Verify it's in whitelist
        assert!(CW20_WHITELIST.has(&deps.storage, cw20_addr));

        // Try to add again - should fail
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::AddCw20 {
            contract_addr: cw20_addr.to_string(),
        };
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::Cw20AlreadyWhitelisted { .. } => {}
            _ => panic!("Expected Cw20AlreadyWhitelisted error"),
        }

        // Remove CW20
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::RemoveCw20 {
            contract_addr: cw20_addr.to_string(),
        };
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Verify it's removed
        assert!(!CW20_WHITELIST.has(&deps.storage, cw20_addr));
    }
}

