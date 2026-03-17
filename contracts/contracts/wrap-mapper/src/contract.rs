#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{
    from_json, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Order, Response,
    StdError, StdResult, Uint128, WasmMsg,
};
use cw2::{get_contract_version, set_contract_version};
use cw20::{Cw20ExecuteMsg, Cw20ReceiveMsg};

use crate::error::ContractError;
use crate::msg::{
    AllDenomMappingsResponse, ConfigResponse, Cw20HookMsg, DenomMappingEntry,
    DenomMappingResponse, ExecuteMsg, InstantiateMsg, MigrateMsg, PendingGovernanceResponse,
    QueryMsg, RateLimitResponse, TreasuryExecuteMsg,
};
use crate::state::{
    Config, RateLimitState, CONFIG, CONTRACT_NAME, CONTRACT_VERSION, CW20_TO_DENOM,
    DENOM_TO_CW20, GOVERNANCE_TIMELOCK, MAX_FEE_BPS, MIN_FEE_BPS, PENDING_GOVERNANCE,
    RATE_LIMITS, RATE_LIMIT_STATE,
};

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
    let treasury = deps.api.addr_validate(&msg.treasury)?;

    let fee_bps = msg.fee_bps.unwrap_or(50);
    if fee_bps > MAX_FEE_BPS {
        return Err(ContractError::FeeTooHigh {
            fee_bps,
            max_bps: MAX_FEE_BPS,
        });
    }
    if fee_bps < MIN_FEE_BPS {
        return Err(ContractError::FeeTooLow {
            fee_bps,
            min_bps: MIN_FEE_BPS,
        });
    }

    let config = Config {
        governance: governance.clone(),
        treasury: treasury.clone(),
        paused: false,
        fee_bps,
    };
    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("governance", governance)
        .add_attribute("treasury", treasury)
        .add_attribute("fee_bps", fee_bps.to_string()))
}

// ============ MIGRATE ============

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn migrate(deps: DepsMut, _env: Env, _msg: MigrateMsg) -> Result<Response, ContractError> {
    let ver = get_contract_version(deps.storage)?;
    if ver.contract != CONTRACT_NAME {
        return Err(ContractError::Std(StdError::generic_err(format!(
            "Cannot migrate from {}, expected {}",
            ver.contract, CONTRACT_NAME
        ))));
    }
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    Ok(Response::new()
        .add_attribute("action", "migrate")
        .add_attribute("from_version", ver.version)
        .add_attribute("to_version", CONTRACT_VERSION))
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
        ExecuteMsg::NotifyDeposit {
            depositor,
            denom,
            amount,
        } => execute_notify_deposit(deps, env, info, depositor, denom, amount),
        ExecuteMsg::Receive(cw20_msg) => execute_receive_cw20(deps, env, info, cw20_msg),
        ExecuteMsg::SetDenomMapping { denom, cw20_addr } => {
            execute_set_denom_mapping(deps, env, info, denom, cw20_addr)
        }
        ExecuteMsg::RemoveDenomMapping { denom } => {
            execute_remove_denom_mapping(deps, info, denom)
        }
        ExecuteMsg::SetRateLimit { denom, config } => {
            execute_set_rate_limit(deps, info, denom, config)
        }
        ExecuteMsg::RemoveRateLimit { denom } => execute_remove_rate_limit(deps, info, denom),
        ExecuteMsg::ProposeGovernanceTransfer { new_governance } => {
            execute_propose_governance_transfer(deps, env, info, new_governance)
        }
        ExecuteMsg::AcceptGovernanceTransfer {} => {
            execute_accept_governance_transfer(deps, env, info)
        }
        ExecuteMsg::CancelGovernanceTransfer {} => {
            execute_cancel_governance_transfer(deps, info)
        }
        ExecuteMsg::SetPaused { paused } => execute_set_paused(deps, info, paused),
        ExecuteMsg::SetFeeBps { fee_bps } => execute_set_fee_bps(deps, info, fee_bps),
    }
}

// ---- Wrap flow (treasury -> wrap-mapper -> CW20 mint) ----
//
// [LOW-3] Governance may also mint CW20 tokens directly on the CW20 contract
// (bypassing WrapDeposit) when the treasury already holds sufficient native
// backing from other sources (SwapDeposit, direct transfers, etc.). This
// avoids an extra tax event on Terra Classic. The treasury's bank balance
// check in InstantWithdraw ensures total CW20 supply can never exceed the
// actual native holdings.

fn execute_notify_deposit(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    depositor: String,
    denom: String,
    amount: Uint128,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    if info.sender != config.treasury {
        return Err(ContractError::Unauthorized);
    }
    if config.paused {
        return Err(ContractError::Paused);
    }
    if amount.is_zero() {
        return Err(ContractError::ZeroAmount);
    }

    let cw20_addr = DENOM_TO_CW20
        .may_load(deps.storage, &denom)?
        .ok_or(ContractError::NoDenomMapping {
            denom: denom.clone(),
        })?;

    check_rate_limit(deps.storage, &env, &denom, amount)?;

    let depositor_addr = deps.api.addr_validate(&depositor)?;

    let fee = calculate_fee(amount, config.fee_bps);
    let mint_amount = amount - fee;

    let mint_msg = WasmMsg::Execute {
        contract_addr: cw20_addr.to_string(),
        msg: to_json_binary(&Cw20ExecuteMsg::Mint {
            recipient: depositor_addr.to_string(),
            amount: mint_amount,
        })?,
        funds: vec![],
    };

    Ok(Response::new()
        .add_message(mint_msg)
        .add_attribute("action", "notify_deposit")
        .add_attribute("depositor", depositor_addr)
        .add_attribute("denom", denom)
        .add_attribute("gross_amount", amount)
        .add_attribute("fee", fee)
        .add_attribute("mint_amount", mint_amount))
}

// ---- Unwrap flow (user -> CW20 Send -> wrap-mapper -> burn + treasury.InstantWithdraw) ----

fn execute_receive_cw20(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    cw20_msg: Cw20ReceiveMsg,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    if config.paused {
        return Err(ContractError::Paused);
    }

    let cw20_contract = info.sender.clone();

    let denom = CW20_TO_DENOM
        .may_load(deps.storage, cw20_contract.as_str())?
        .ok_or(ContractError::NoCw20Mapping {
            address: cw20_contract.to_string(),
        })?;

    let hook_msg: Cw20HookMsg = from_json(&cw20_msg.msg)?;
    let Cw20HookMsg::Unwrap { recipient } = hook_msg;

    let amount = cw20_msg.amount;
    if amount.is_zero() {
        return Err(ContractError::ZeroAmount);
    }

    check_rate_limit(deps.storage, &env, &denom, amount)?;

    let recipient_addr = match recipient {
        Some(r) => deps.api.addr_validate(&r)?,
        None => deps.api.addr_validate(&cw20_msg.sender)?,
    };

    let fee = calculate_fee(amount, config.fee_bps);
    let withdraw_amount = amount - fee;

    let burn_msg = WasmMsg::Execute {
        contract_addr: cw20_contract.to_string(),
        msg: to_json_binary(&Cw20ExecuteMsg::Burn { amount })?,
        funds: vec![],
    };

    let withdraw_msg = WasmMsg::Execute {
        contract_addr: config.treasury.to_string(),
        msg: to_json_binary(&TreasuryExecuteMsg::InstantWithdraw {
            recipient: recipient_addr.to_string(),
            denom: denom.clone(),
            amount: withdraw_amount,
        })?,
        funds: vec![],
    };

    Ok(Response::new()
        .add_message(burn_msg)
        .add_message(withdraw_msg)
        .add_attribute("action", "unwrap")
        .add_attribute("cw20_contract", cw20_contract)
        .add_attribute("recipient", recipient_addr)
        .add_attribute("denom", denom)
        .add_attribute("gross_amount", amount)
        .add_attribute("fee", fee)
        .add_attribute("withdraw_amount", withdraw_amount))
}

// ---- Governance handlers ----

fn execute_set_denom_mapping(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    denom: String,
    cw20_addr: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.governance {
        return Err(ContractError::Unauthorized);
    }

    let cw20 = deps.api.addr_validate(&cw20_addr)?;

    verify_minter_access(&deps, &env, &cw20)?;

    // Clean up stale reverse mapping if this denom was previously mapped
    if let Some(old_cw20) = DENOM_TO_CW20.may_load(deps.storage, &denom)? {
        if old_cw20 != cw20 {
            CW20_TO_DENOM.remove(deps.storage, old_cw20.as_str());
        }
    }

    // Clean up stale forward mapping if this CW20 was previously mapped to a different denom
    if let Some(old_denom) = CW20_TO_DENOM.may_load(deps.storage, cw20.as_str())? {
        if old_denom != denom {
            DENOM_TO_CW20.remove(deps.storage, &old_denom);
        }
    }

    DENOM_TO_CW20.save(deps.storage, &denom, &cw20)?;
    CW20_TO_DENOM.save(deps.storage, cw20.as_str(), &denom)?;

    Ok(Response::new()
        .add_attribute("action", "set_denom_mapping")
        .add_attribute("denom", denom)
        .add_attribute("cw20_addr", cw20))
}

/// Verifies that this contract (wrap-mapper) is authorized to mint on the
/// CW20 token. Checks both the primary minter (standard CW20 `Minter` query)
/// and the extended minters list (cw20-mintable `Minters` query).
fn verify_minter_access(deps: &DepsMut, env: &Env, cw20: &cosmwasm_std::Addr) -> Result<(), ContractError> {
    let self_addr = env.contract.address.to_string();

    let primary: Option<cw20::MinterResponse> = deps
        .querier
        .query_wasm_smart(cw20, &cw20::Cw20QueryMsg::Minter {})
        .unwrap_or(None);

    if let Some(ref m) = primary {
        if m.minter == self_addr {
            return Ok(());
        }
    }

    #[derive(serde::Serialize, serde::Deserialize)]
    #[serde(rename_all = "snake_case")]
    enum MintableQueryMsg {
        Minters {
            start_after: Option<String>,
            limit: Option<u32>,
        },
    }

    #[derive(serde::Serialize, serde::Deserialize)]
    struct MintersResponse {
        pub minters: Vec<String>,
    }

    let minters_result: Result<MintersResponse, _> = deps.querier.query_wasm_smart(
        cw20,
        &MintableQueryMsg::Minters {
            start_after: None,
            limit: Some(30),
        },
    );

    if let Ok(resp) = minters_result {
        if resp.minters.iter().any(|m| m == &self_addr) {
            return Ok(());
        }
    }

    Err(ContractError::NotMinter {
        cw20_addr: cw20.to_string(),
    })
}

fn execute_remove_denom_mapping(
    deps: DepsMut,
    info: MessageInfo,
    denom: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.governance {
        return Err(ContractError::Unauthorized);
    }

    if let Some(cw20) = DENOM_TO_CW20.may_load(deps.storage, &denom)? {
        CW20_TO_DENOM.remove(deps.storage, cw20.as_str());
    }
    DENOM_TO_CW20.remove(deps.storage, &denom);

    Ok(Response::new()
        .add_attribute("action", "remove_denom_mapping")
        .add_attribute("denom", denom))
}

fn execute_set_rate_limit(
    deps: DepsMut,
    info: MessageInfo,
    denom: String,
    rate_config: crate::state::RateLimitConfig,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.governance {
        return Err(ContractError::Unauthorized);
    }

    RATE_LIMITS.save(deps.storage, &denom, &rate_config)?;

    Ok(Response::new()
        .add_attribute("action", "set_rate_limit")
        .add_attribute("denom", denom)
        .add_attribute("max_amount", rate_config.max_amount_per_window)
        .add_attribute("window_seconds", rate_config.window_seconds.to_string()))
}

fn execute_remove_rate_limit(
    deps: DepsMut,
    info: MessageInfo,
    denom: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.governance {
        return Err(ContractError::Unauthorized);
    }

    RATE_LIMITS.remove(deps.storage, &denom);
    RATE_LIMIT_STATE.remove(deps.storage, &denom);

    Ok(Response::new()
        .add_attribute("action", "remove_rate_limit")
        .add_attribute("denom", denom))
}

fn execute_propose_governance_transfer(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    new_governance: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.governance {
        return Err(ContractError::Unauthorized);
    }

    let new_address = deps.api.addr_validate(&new_governance)?;
    let pending = crate::state::PendingGovernance {
        new_address: new_address.clone(),
        execute_after: env.block.time.plus_seconds(GOVERNANCE_TIMELOCK),
    };
    PENDING_GOVERNANCE.save(deps.storage, &pending)?;

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
    let pending = PENDING_GOVERNANCE
        .may_load(deps.storage)?
        .ok_or(ContractError::NoPendingGovernance)?;

    if info.sender != pending.new_address {
        return Err(ContractError::Unauthorized);
    }

    if env.block.time < pending.execute_after {
        let remaining = pending.execute_after.seconds() - env.block.time.seconds();
        return Err(ContractError::TimelockNotExpired {
            remaining_seconds: remaining,
        });
    }

    let mut config = CONFIG.load(deps.storage)?;
    let old_governance = config.governance.clone();
    config.governance = pending.new_address.clone();
    CONFIG.save(deps.storage, &config)?;
    PENDING_GOVERNANCE.remove(deps.storage);

    Ok(Response::new()
        .add_attribute("action", "accept_governance_transfer")
        .add_attribute("old_governance", old_governance)
        .add_attribute("new_governance", config.governance))
}

fn execute_cancel_governance_transfer(
    deps: DepsMut,
    info: MessageInfo,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.governance {
        return Err(ContractError::Unauthorized);
    }

    if !PENDING_GOVERNANCE.may_load(deps.storage)?.is_some() {
        return Err(ContractError::NoPendingGovernance);
    }

    PENDING_GOVERNANCE.remove(deps.storage);

    Ok(Response::new().add_attribute("action", "cancel_governance_transfer"))
}

fn execute_set_paused(
    deps: DepsMut,
    info: MessageInfo,
    paused: bool,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;
    if info.sender != config.governance {
        return Err(ContractError::Unauthorized);
    }

    config.paused = paused;
    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("action", "set_paused")
        .add_attribute("paused", paused.to_string()))
}

fn execute_set_fee_bps(
    deps: DepsMut,
    info: MessageInfo,
    fee_bps: u16,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;
    if info.sender != config.governance {
        return Err(ContractError::Unauthorized);
    }

    if fee_bps > MAX_FEE_BPS {
        return Err(ContractError::FeeTooHigh {
            fee_bps,
            max_bps: MAX_FEE_BPS,
        });
    }
    if fee_bps < MIN_FEE_BPS {
        return Err(ContractError::FeeTooLow {
            fee_bps,
            min_bps: MIN_FEE_BPS,
        });
    }

    config.fee_bps = fee_bps;
    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("action", "set_fee_bps")
        .add_attribute("fee_bps", fee_bps.to_string()))
}

/// Truncating fee calculation: fee = amount * fee_bps / 10_000.
/// Any remainder favors the user (rounds down).
fn calculate_fee(amount: Uint128, fee_bps: u16) -> Uint128 {
    if fee_bps == 0 {
        return Uint128::zero();
    }
    amount.multiply_ratio(fee_bps as u128, 10_000u128)
}

// ---- Rate limiting ----
//
// Design notes:
//
// [LOW-1] Shared wrap/unwrap budget: both wrap and unwrap decrement the same
// per-denom rate-limit counter. This is intentional -- we want a single
// throughput cap on total volume regardless of direction.
//
// [LOW-2] Discrete (tumbling) window: the window resets entirely when it
// expires, allowing a theoretical 2x burst at the boundary. This is
// acceptable for reduced complexity; governance should set limits with
// the 2x burst factor in mind.

fn check_rate_limit(
    storage: &mut dyn cosmwasm_std::Storage,
    env: &Env,
    denom: &str,
    amount: Uint128,
) -> Result<(), ContractError> {
    let rate_config = match RATE_LIMITS.may_load(storage, denom)? {
        Some(c) => c,
        None => return Ok(()),
    };

    let now = env.block.time;
    let mut state = RATE_LIMIT_STATE
        .may_load(storage, denom)?
        .unwrap_or(RateLimitState {
            current_window_start: now,
            amount_used: Uint128::zero(),
        });

    let window_elapsed = now.seconds().saturating_sub(state.current_window_start.seconds());
    if window_elapsed >= rate_config.window_seconds {
        state.current_window_start = now;
        state.amount_used = Uint128::zero();
    }

    let new_usage = state
        .amount_used
        .checked_add(amount)
        .map_err(|_| ContractError::RateLimitOverflow)?;
    if new_usage > rate_config.max_amount_per_window {
        return Err(ContractError::RateLimitExceeded {
            denom: denom.to_string(),
        });
    }

    state.amount_used = new_usage;
    RATE_LIMIT_STATE.save(storage, denom, &state)?;

    Ok(())
}

// ============ QUERY ============

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&query_config(deps)?),
        QueryMsg::DenomMapping { denom } => to_json_binary(&query_denom_mapping(deps, denom)?),
        QueryMsg::AllDenomMappings {} => to_json_binary(&query_all_denom_mappings(deps)?),
        QueryMsg::RateLimit { denom } => to_json_binary(&query_rate_limit(deps, denom)?),
        QueryMsg::PendingGovernance {} => to_json_binary(&query_pending_governance(deps)?),
    }
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        governance: config.governance,
        treasury: config.treasury,
        paused: config.paused,
        fee_bps: config.fee_bps,
    })
}

fn query_denom_mapping(deps: Deps, denom: String) -> StdResult<DenomMappingResponse> {
    let cw20_addr = DENOM_TO_CW20.load(deps.storage, &denom)?;
    Ok(DenomMappingResponse { denom, cw20_addr })
}

fn query_all_denom_mappings(deps: Deps) -> StdResult<AllDenomMappingsResponse> {
    let mappings: Vec<DenomMappingEntry> = DENOM_TO_CW20
        .range(deps.storage, None, None, Order::Ascending)
        .map(|r| {
            r.map(|(denom, addr)| DenomMappingEntry {
                denom: denom.to_string(),
                cw20_addr: addr,
            })
        })
        .collect::<StdResult<Vec<_>>>()?;

    Ok(AllDenomMappingsResponse { mappings })
}

fn query_rate_limit(deps: Deps, denom: String) -> StdResult<RateLimitResponse> {
    let config = RATE_LIMITS.may_load(deps.storage, &denom)?;
    let state = RATE_LIMIT_STATE.may_load(deps.storage, &denom)?;

    Ok(RateLimitResponse {
        config,
        current_window_start: state.as_ref().map(|s| s.current_window_start),
        amount_used: state.map(|s| s.amount_used).unwrap_or(Uint128::zero()),
    })
}

fn query_pending_governance(deps: Deps) -> StdResult<PendingGovernanceResponse> {
    let pending = PENDING_GOVERNANCE.may_load(deps.storage)?;
    Ok(PendingGovernanceResponse {
        new_governance: pending.as_ref().map(|p| p.new_address.clone()),
        execute_after: pending.as_ref().map(|p| p.execute_after),
    })
}

// Coverage gaps that cannot be tested with mock_dependencies / cw-multi-test:
//
// - addr_validate failures: mock_dependencies accepts all bech32-shaped strings;
//   real chain validation covers this path.
// - Storage I/O errors (CONFIG.load, DENOM_TO_CW20.save, etc.): infrastructure-level
//   StdError paths; CosmWasm test tooling does not support mocking storage failures.
// - to_json_binary / from_json failures: well-typed struct serialization does not fail
//   in practice; malformed CW20 hook messages are rejected by the CW20 contract before
//   reaching wrap-mapper's Receive handler.
// - Uint128 overflow in check_rate_limit (amount_used + amount): would require amounts
//   near u128::MAX; multiply_ratio uses Uint256 internally and is safe; the addition
//   would panic (not error), and is bounded by rate limit config in practice.

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{from_json, CosmosMsg, Timestamp, Uint128};
    use crate::state::RateLimitConfig;

    const GOVERNANCE: &str = "governance_addr";
    const TREASURY: &str = "treasury_addr";
    const USER: &str = "user_addr";
    const CW20_LUNC: &str = "cw20_lunc_addr";
    const CW20_USTC: &str = "cw20_ustc_addr";
    const DENOM_LUNC: &str = "uluna";
    const DENOM_USTC: &str = "uusd";

    const DEFAULT_FEE_BPS: u16 = 50; // 0.5%

    fn setup_contract(deps: DepsMut) {
        let msg = InstantiateMsg {
            governance: GOVERNANCE.to_string(),
            treasury: TREASURY.to_string(),
            fee_bps: Some(DEFAULT_FEE_BPS),
        };
        let info = mock_info("creator", &[]);
        instantiate(deps, mock_env(), info, msg).unwrap();
    }

    fn setup_with_mapping(mut deps: DepsMut) {
        let msg = InstantiateMsg {
            governance: GOVERNANCE.to_string(),
            treasury: TREASURY.to_string(),
            fee_bps: Some(DEFAULT_FEE_BPS),
        };
        let info = mock_info("creator", &[]);
        instantiate(deps.branch(), mock_env(), info, msg).unwrap();
        add_mapping(deps, DENOM_LUNC, CW20_LUNC);
    }

    /// Writes a denom<->CW20 mapping directly to storage with the same
    /// stale-entry cleanup logic as `execute_set_denom_mapping`, but
    /// without the CW20 minter query (which requires a real contract).
    /// Minter verification is tested in integration tests.
    fn add_mapping(deps: DepsMut, denom: &str, cw20: &str) {
        use crate::state::{CW20_TO_DENOM, DENOM_TO_CW20};
        let cw20_addr = cosmwasm_std::Addr::unchecked(cw20);
        if let Some(old_cw20) = DENOM_TO_CW20.may_load(deps.storage, denom).unwrap() {
            if old_cw20 != cw20_addr {
                CW20_TO_DENOM.remove(deps.storage, old_cw20.as_str());
            }
        }
        if let Some(old_denom) = CW20_TO_DENOM.may_load(deps.storage, cw20).unwrap() {
            if old_denom != denom {
                DENOM_TO_CW20.remove(deps.storage, &old_denom);
            }
        }
        DENOM_TO_CW20.save(deps.storage, denom, &cw20_addr).unwrap();
        CW20_TO_DENOM.save(deps.storage, cw20, &denom.to_string()).unwrap();
    }

    // ============ B1: INSTANTIATE ============

    #[test]
    fn test_instantiate() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.governance.as_str(), GOVERNANCE);
        assert_eq!(config.treasury.as_str(), TREASURY);
        assert!(!config.paused);
        assert_eq!(config.fee_bps, DEFAULT_FEE_BPS);
    }

    #[test]
    fn test_instantiate_default_fee() {
        let mut deps = mock_dependencies();
        let msg = InstantiateMsg {
            governance: GOVERNANCE.to_string(),
            treasury: TREASURY.to_string(),
            fee_bps: None,
        };
        let info = mock_info("creator", &[]);
        instantiate(deps.as_mut(), mock_env(), info, msg).unwrap();

        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.fee_bps, 50);
    }

    #[test]
    fn test_instantiate_fee_too_high() {
        let mut deps = mock_dependencies();
        let msg = InstantiateMsg {
            governance: GOVERNANCE.to_string(),
            treasury: TREASURY.to_string(),
            fee_bps: Some(1500),
        };
        let info = mock_info("creator", &[]);
        let err = instantiate(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(
            err,
            ContractError::FeeTooHigh {
                fee_bps: 1500,
                max_bps: 1000,
            }
        );
    }

    // ============ B2-B4: DENOM MAPPING ============

    #[test]
    fn test_set_denom_mapping() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        add_mapping(deps.as_mut(), DENOM_LUNC, CW20_LUNC);

        let forward = DENOM_TO_CW20.load(&deps.storage, DENOM_LUNC).unwrap();
        assert_eq!(forward.as_str(), CW20_LUNC);

        let reverse = CW20_TO_DENOM.load(&deps.storage, CW20_LUNC).unwrap();
        assert_eq!(reverse, DENOM_LUNC);
    }

    #[test]
    fn test_set_denom_mapping_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::SetDenomMapping {
            denom: DENOM_LUNC.to_string(),
            cw20_addr: CW20_LUNC.to_string(),
        };
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_remove_denom_mapping() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::RemoveDenomMapping {
            denom: DENOM_LUNC.to_string(),
        };
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();
        assert_eq!(res.attributes[0].value, "remove_denom_mapping");

        assert!(DENOM_TO_CW20.may_load(&deps.storage, DENOM_LUNC).unwrap().is_none());
        assert!(CW20_TO_DENOM.may_load(&deps.storage, CW20_LUNC).unwrap().is_none());
    }

    // ============ B5-B7: NOTIFY DEPOSIT (WRAP) ============

    #[test]
    fn test_notify_deposit_mints_cw20_with_fee() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(TREASURY, &[]);
        let gross = 1_000_000u128;
        let fee = gross * 50 / 10_000; // 0.5% = 5_000
        let expected_mint = gross - fee; // 995_000
        let msg = ExecuteMsg::NotifyDeposit {
            depositor: USER.to_string(),
            denom: DENOM_LUNC.to_string(),
            amount: Uint128::new(gross),
        };
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        assert_eq!(res.attributes[0].value, "notify_deposit");
        assert_eq!(res.messages.len(), 1);

        match &res.messages[0].msg {
            CosmosMsg::Wasm(WasmMsg::Execute { contract_addr, msg, funds }) => {
                assert_eq!(contract_addr, CW20_LUNC);
                assert!(funds.is_empty());
                let parsed: Cw20ExecuteMsg = from_json(msg).unwrap();
                match parsed {
                    Cw20ExecuteMsg::Mint { recipient, amount } => {
                        assert_eq!(recipient, USER);
                        assert_eq!(amount, Uint128::new(expected_mint));
                    }
                    _ => panic!("Expected Cw20ExecuteMsg::Mint"),
                }
            }
            _ => panic!("Expected WasmMsg::Execute"),
        }

        // Verify fee attribute
        let fee_attr = res.attributes.iter().find(|a| a.key == "fee").unwrap();
        assert_eq!(fee_attr.value, fee.to_string());
    }

    #[test]
    fn test_notify_deposit_unauthorized() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::NotifyDeposit {
            depositor: USER.to_string(),
            denom: DENOM_LUNC.to_string(),
            amount: Uint128::new(1_000_000),
        };
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_notify_deposit_unknown_denom() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(TREASURY, &[]);
        let msg = ExecuteMsg::NotifyDeposit {
            depositor: USER.to_string(),
            denom: "unknown".to_string(),
            amount: Uint128::new(1_000_000),
        };
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(
            err,
            ContractError::NoDenomMapping {
                denom: "unknown".to_string()
            }
        );
    }

    // ============ B8-B11: UNWRAP ============

    fn make_cw20_receive(sender: &str, amount: u128, hook: &Cw20HookMsg) -> ExecuteMsg {
        ExecuteMsg::Receive(Cw20ReceiveMsg {
            sender: sender.to_string(),
            amount: Uint128::new(amount),
            msg: to_json_binary(hook).unwrap(),
        })
    }

    #[test]
    fn test_unwrap_burns_and_withdraws_with_fee() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let gross = 500_000u128;
        let fee = gross * 50 / 10_000; // 0.5% = 2_500
        let expected_withdraw = gross - fee; // 497_500

        let info = mock_info(CW20_LUNC, &[]);
        let msg = make_cw20_receive(USER, gross, &Cw20HookMsg::Unwrap { recipient: None });
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        assert_eq!(res.attributes[0].value, "unwrap");
        assert_eq!(res.messages.len(), 2);

        // First message: burn full CW20 amount
        match &res.messages[0].msg {
            CosmosMsg::Wasm(WasmMsg::Execute { contract_addr, msg, .. }) => {
                assert_eq!(contract_addr, CW20_LUNC);
                let parsed: Cw20ExecuteMsg = from_json(msg).unwrap();
                match parsed {
                    Cw20ExecuteMsg::Burn { amount } => {
                        assert_eq!(amount, Uint128::new(gross));
                    }
                    _ => panic!("Expected Cw20ExecuteMsg::Burn"),
                }
            }
            _ => panic!("Expected WasmMsg::Execute for burn"),
        }

        // Second message: InstantWithdraw with fee deducted
        match &res.messages[1].msg {
            CosmosMsg::Wasm(WasmMsg::Execute { contract_addr, msg, .. }) => {
                assert_eq!(contract_addr, TREASURY);
                let parsed: TreasuryExecuteMsg = from_json(msg).unwrap();
                match parsed {
                    TreasuryExecuteMsg::InstantWithdraw {
                        recipient,
                        denom,
                        amount,
                    } => {
                        assert_eq!(recipient, USER);
                        assert_eq!(denom, DENOM_LUNC);
                        assert_eq!(amount, Uint128::new(expected_withdraw));
                    }
                }
            }
            _ => panic!("Expected WasmMsg::Execute for withdraw"),
        }

        let fee_attr = res.attributes.iter().find(|a| a.key == "fee").unwrap();
        assert_eq!(fee_attr.value, fee.to_string());
    }

    #[test]
    fn test_unwrap_unknown_cw20() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info("unknown_cw20", &[]);
        let msg = make_cw20_receive(USER, 100, &Cw20HookMsg::Unwrap { recipient: None });
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(
            err,
            ContractError::NoCw20Mapping {
                address: "unknown_cw20".to_string()
            }
        );
    }

    #[test]
    fn test_unwrap_with_recipient() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let other_user = "other_user_addr";
        let info = mock_info(CW20_LUNC, &[]);
        let msg = make_cw20_receive(
            USER,
            500_000,
            &Cw20HookMsg::Unwrap {
                recipient: Some(other_user.to_string()),
            },
        );
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        match &res.messages[1].msg {
            CosmosMsg::Wasm(WasmMsg::Execute { msg, .. }) => {
                let parsed: TreasuryExecuteMsg = from_json(msg).unwrap();
                match parsed {
                    TreasuryExecuteMsg::InstantWithdraw { recipient, amount, .. } => {
                        assert_eq!(recipient, other_user);
                        assert_eq!(amount, Uint128::new(497_500)); // 500k - 0.5% fee
                    }
                }
            }
            _ => panic!("Expected WasmMsg::Execute"),
        }
    }

    #[test]
    fn test_unwrap_default_recipient() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(CW20_LUNC, &[]);
        let msg = make_cw20_receive(USER, 500_000, &Cw20HookMsg::Unwrap { recipient: None });
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        match &res.messages[1].msg {
            CosmosMsg::Wasm(WasmMsg::Execute { msg, .. }) => {
                let parsed: TreasuryExecuteMsg = from_json(msg).unwrap();
                match parsed {
                    TreasuryExecuteMsg::InstantWithdraw { recipient, amount, .. } => {
                        assert_eq!(recipient, USER);
                        assert_eq!(amount, Uint128::new(497_500)); // 500k - 0.5% fee
                    }
                }
            }
            _ => panic!("Expected WasmMsg::Execute"),
        }
    }

    // ============ FEE CONFIGURATION ============

    #[test]
    fn test_set_fee_bps() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::SetFeeBps { fee_bps: 100 };
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();
        assert_eq!(res.attributes[0].value, "set_fee_bps");

        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.fee_bps, 100);
    }

    #[test]
    fn test_set_fee_bps_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::SetFeeBps { fee_bps: 100 };
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_set_fee_bps_too_high() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::SetFeeBps { fee_bps: 1500 };
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(
            err,
            ContractError::FeeTooHigh {
                fee_bps: 1500,
                max_bps: 1000,
            }
        );
    }

    #[test]
    fn test_set_fee_bps_zero_rejected() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetFeeBps { fee_bps: 0 },
        )
        .unwrap_err();

        assert_eq!(
            err,
            ContractError::FeeTooLow {
                fee_bps: 0,
                min_bps: crate::state::MIN_FEE_BPS,
            }
        );
    }

    #[test]
    fn test_set_fee_bps_at_minimum() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetFeeBps {
                fee_bps: crate::state::MIN_FEE_BPS,
            },
        )
        .unwrap();

        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.fee_bps, crate::state::MIN_FEE_BPS);
    }

    #[test]
    fn test_min_fee_deduction() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetFeeBps {
                fee_bps: crate::state::MIN_FEE_BPS,
            },
        )
        .unwrap();

        let gross = 1_000_000u128;
        let fee = gross * crate::state::MIN_FEE_BPS as u128 / 10_000;
        let expected_mint = gross - fee;

        let info = mock_info(TREASURY, &[]);
        let msg = ExecuteMsg::NotifyDeposit {
            depositor: USER.to_string(),
            denom: DENOM_LUNC.to_string(),
            amount: Uint128::new(gross),
        };
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        match &res.messages[0].msg {
            CosmosMsg::Wasm(WasmMsg::Execute { msg, .. }) => {
                let parsed: Cw20ExecuteMsg = from_json(msg).unwrap();
                match parsed {
                    Cw20ExecuteMsg::Mint { amount, .. } => {
                        assert_eq!(amount, Uint128::new(expected_mint));
                    }
                    _ => panic!("Expected Cw20ExecuteMsg::Mint"),
                }
            }
            _ => panic!("Expected WasmMsg::Execute"),
        }
    }

    #[test]
    fn test_instantiate_fee_too_low() {
        let mut deps = mock_dependencies();
        let msg = InstantiateMsg {
            governance: GOVERNANCE.to_string(),
            treasury: TREASURY.to_string(),
            fee_bps: Some(0),
        };
        let info = mock_info("creator", &[]);
        let err = instantiate(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(
            err,
            ContractError::FeeTooLow {
                fee_bps: 0,
                min_bps: crate::state::MIN_FEE_BPS,
            }
        );
    }

    // ============ B12-B15: RATE LIMITS ============

    #[test]
    fn test_rate_limit_wrap() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetRateLimit {
                denom: DENOM_LUNC.to_string(),
                config: RateLimitConfig {
                    max_amount_per_window: Uint128::new(1_000_000),
                    window_seconds: 3600,
                },
            },
        )
        .unwrap();

        // First deposit within limit succeeds
        let info = mock_info(TREASURY, &[]);
        let msg = ExecuteMsg::NotifyDeposit {
            depositor: USER.to_string(),
            denom: DENOM_LUNC.to_string(),
            amount: Uint128::new(900_000),
        };
        execute(deps.as_mut(), mock_env(), info.clone(), msg).unwrap();

        // Second deposit exceeds limit
        let msg = ExecuteMsg::NotifyDeposit {
            depositor: USER.to_string(),
            denom: DENOM_LUNC.to_string(),
            amount: Uint128::new(200_000),
        };
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(
            err,
            ContractError::RateLimitExceeded {
                denom: DENOM_LUNC.to_string()
            }
        );
    }

    #[test]
    fn test_rate_limit_unwrap() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetRateLimit {
                denom: DENOM_LUNC.to_string(),
                config: RateLimitConfig {
                    max_amount_per_window: Uint128::new(500_000),
                    window_seconds: 3600,
                },
            },
        )
        .unwrap();

        let info = mock_info(CW20_LUNC, &[]);
        let msg = make_cw20_receive(USER, 400_000, &Cw20HookMsg::Unwrap { recipient: None });
        execute(deps.as_mut(), mock_env(), info.clone(), msg).unwrap();

        let msg = make_cw20_receive(USER, 200_000, &Cw20HookMsg::Unwrap { recipient: None });
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(
            err,
            ContractError::RateLimitExceeded {
                denom: DENOM_LUNC.to_string()
            }
        );
    }

    #[test]
    fn test_rate_limit_window_reset() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetRateLimit {
                denom: DENOM_LUNC.to_string(),
                config: RateLimitConfig {
                    max_amount_per_window: Uint128::new(1_000_000),
                    window_seconds: 3600,
                },
            },
        )
        .unwrap();

        let mut env = mock_env();

        // Use up the limit
        let info = mock_info(TREASURY, &[]);
        let msg = ExecuteMsg::NotifyDeposit {
            depositor: USER.to_string(),
            denom: DENOM_LUNC.to_string(),
            amount: Uint128::new(1_000_000),
        };
        execute(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();

        // Should fail now
        let msg = ExecuteMsg::NotifyDeposit {
            depositor: USER.to_string(),
            denom: DENOM_LUNC.to_string(),
            amount: Uint128::new(1),
        };
        let err = execute(deps.as_mut(), env.clone(), info.clone(), msg).unwrap_err();
        assert_eq!(
            err,
            ContractError::RateLimitExceeded {
                denom: DENOM_LUNC.to_string()
            }
        );

        // Advance time past the window
        env.block.time = Timestamp::from_seconds(env.block.time.seconds() + 3601);

        let msg = ExecuteMsg::NotifyDeposit {
            depositor: USER.to_string(),
            denom: DENOM_LUNC.to_string(),
            amount: Uint128::new(1_000_000),
        };
        execute(deps.as_mut(), env, info, msg).unwrap();
    }

    #[test]
    fn test_rate_limit_separate_denoms() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        add_mapping(deps.as_mut(), DENOM_USTC, CW20_USTC);

        // Set rate limits for both denoms
        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info.clone(),
            ExecuteMsg::SetRateLimit {
                denom: DENOM_LUNC.to_string(),
                config: RateLimitConfig {
                    max_amount_per_window: Uint128::new(100),
                    window_seconds: 3600,
                },
            },
        )
        .unwrap();
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetRateLimit {
                denom: DENOM_USTC.to_string(),
                config: RateLimitConfig {
                    max_amount_per_window: Uint128::new(200),
                    window_seconds: 3600,
                },
            },
        )
        .unwrap();

        // Use up LUNC limit
        let info = mock_info(TREASURY, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info.clone(),
            ExecuteMsg::NotifyDeposit {
                depositor: USER.to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::new(100),
            },
        )
        .unwrap();

        // LUNC should fail
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info.clone(),
            ExecuteMsg::NotifyDeposit {
                depositor: USER.to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::new(1),
            },
        )
        .unwrap_err();
        assert_eq!(
            err,
            ContractError::RateLimitExceeded {
                denom: DENOM_LUNC.to_string()
            }
        );

        // USTC should still work (independent limit)
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::NotifyDeposit {
                depositor: USER.to_string(),
                denom: DENOM_USTC.to_string(),
                amount: Uint128::new(200),
            },
        )
        .unwrap();
    }

    // ============ B16-B18: PAUSE ============

    #[test]
    fn test_pause_blocks_wrap() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetPaused { paused: true },
        )
        .unwrap();

        let info = mock_info(TREASURY, &[]);
        let msg = ExecuteMsg::NotifyDeposit {
            depositor: USER.to_string(),
            denom: DENOM_LUNC.to_string(),
            amount: Uint128::new(1_000),
        };
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::Paused);
    }

    #[test]
    fn test_pause_blocks_unwrap() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetPaused { paused: true },
        )
        .unwrap();

        let info = mock_info(CW20_LUNC, &[]);
        let msg = make_cw20_receive(USER, 1_000, &Cw20HookMsg::Unwrap { recipient: None });
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::Paused);
    }

    #[test]
    fn test_unpause_resumes() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info.clone(),
            ExecuteMsg::SetPaused { paused: true },
        )
        .unwrap();

        // Verify paused
        let treasury_info = mock_info(TREASURY, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            treasury_info.clone(),
            ExecuteMsg::NotifyDeposit {
                depositor: USER.to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::new(1_000),
            },
        )
        .unwrap_err();
        assert_eq!(err, ContractError::Paused);

        // Unpause
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetPaused { paused: false },
        )
        .unwrap();

        // Should work now
        execute(
            deps.as_mut(),
            mock_env(),
            treasury_info,
            ExecuteMsg::NotifyDeposit {
                depositor: USER.to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::new(1_000),
            },
        )
        .unwrap();
    }

    // ============ B19: GOVERNANCE TRANSFER WITH TIMELOCK ============

    #[test]
    fn test_propose_governance_transfer() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let new_gov = "new_governance";
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: new_gov.to_string(),
        };
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();
        assert_eq!(res.attributes[0].value, "propose_governance_transfer");

        // Governance unchanged until accepted
        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.governance.as_str(), GOVERNANCE);

        // Pending proposal exists
        let pending = PENDING_GOVERNANCE.load(&deps.storage).unwrap();
        assert_eq!(pending.new_address.as_str(), new_gov);
    }

    #[test]
    fn test_propose_governance_transfer_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::ProposeGovernanceTransfer {
            new_governance: "new_gov".to_string(),
        };
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_accept_governance_transfer() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let new_gov = "new_governance";
        let mut env = mock_env();

        // Propose
        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            env.clone(),
            info,
            ExecuteMsg::ProposeGovernanceTransfer {
                new_governance: new_gov.to_string(),
            },
        )
        .unwrap();

        // Attempt to accept before timelock
        let info = mock_info(new_gov, &[]);
        let err = execute(
            deps.as_mut(),
            env.clone(),
            info.clone(),
            ExecuteMsg::AcceptGovernanceTransfer {},
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::TimelockNotExpired { .. }));

        // Advance past timelock (7 days + 1 second)
        env.block.time = env.block.time.plus_seconds(604_801);

        // Accept
        let res = execute(
            deps.as_mut(),
            env,
            info,
            ExecuteMsg::AcceptGovernanceTransfer {},
        )
        .unwrap();
        assert_eq!(res.attributes[0].value, "accept_governance_transfer");

        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.governance.as_str(), new_gov);

        // Old governance can no longer act
        let info = mock_info(GOVERNANCE, &[]);
        let msg = ExecuteMsg::SetPaused { paused: true };
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_accept_governance_wrong_sender() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let new_gov = "new_governance";
        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::ProposeGovernanceTransfer {
                new_governance: new_gov.to_string(),
            },
        )
        .unwrap();

        // Random user can't accept
        let info = mock_info(USER, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::AcceptGovernanceTransfer {},
        )
        .unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_cancel_governance_transfer() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let new_gov = "new_governance";
        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info.clone(),
            ExecuteMsg::ProposeGovernanceTransfer {
                new_governance: new_gov.to_string(),
            },
        )
        .unwrap();

        // Cancel
        let res = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::CancelGovernanceTransfer {},
        )
        .unwrap();
        assert_eq!(res.attributes[0].value, "cancel_governance_transfer");

        assert!(PENDING_GOVERNANCE.may_load(&deps.storage).unwrap().is_none());

        // Accept now fails
        let mut env = mock_env();
        env.block.time = env.block.time.plus_seconds(604_801);
        let info = mock_info(new_gov, &[]);
        let err = execute(
            deps.as_mut(),
            env,
            info,
            ExecuteMsg::AcceptGovernanceTransfer {},
        )
        .unwrap_err();
        assert_eq!(err, ContractError::NoPendingGovernance);
    }

    // ============ B20-B23: QUERIES ============

    #[test]
    fn test_query_config() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let res = query(deps.as_ref(), mock_env(), QueryMsg::Config {}).unwrap();
        let response: ConfigResponse = from_json(res).unwrap();
        assert_eq!(response.governance.as_str(), GOVERNANCE);
        assert_eq!(response.treasury.as_str(), TREASURY);
        assert!(!response.paused);
        assert_eq!(response.fee_bps, DEFAULT_FEE_BPS);
    }

    #[test]
    fn test_query_denom_mapping() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::DenomMapping {
                denom: DENOM_LUNC.to_string(),
            },
        )
        .unwrap();
        let response: DenomMappingResponse = from_json(res).unwrap();
        assert_eq!(response.denom, DENOM_LUNC);
        assert_eq!(response.cw20_addr.as_str(), CW20_LUNC);
    }

    #[test]
    fn test_query_all_denom_mappings() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        add_mapping(deps.as_mut(), DENOM_USTC, CW20_USTC);

        let res = query(deps.as_ref(), mock_env(), QueryMsg::AllDenomMappings {}).unwrap();
        let response: AllDenomMappingsResponse = from_json(res).unwrap();
        assert_eq!(response.mappings.len(), 2);
    }

    #[test]
    fn test_query_rate_limit() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        // No rate limit set
        let res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::RateLimit {
                denom: DENOM_LUNC.to_string(),
            },
        )
        .unwrap();
        let response: RateLimitResponse = from_json(res).unwrap();
        assert!(response.config.is_none());
        assert_eq!(response.amount_used, Uint128::zero());

        // Set rate limit
        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetRateLimit {
                denom: DENOM_LUNC.to_string(),
                config: RateLimitConfig {
                    max_amount_per_window: Uint128::new(1_000_000),
                    window_seconds: 3600,
                },
            },
        )
        .unwrap();

        // Use some of the limit
        let info = mock_info(TREASURY, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::NotifyDeposit {
                depositor: USER.to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::new(250_000),
            },
        )
        .unwrap();

        let res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::RateLimit {
                denom: DENOM_LUNC.to_string(),
            },
        )
        .unwrap();
        let response: RateLimitResponse = from_json(res).unwrap();
        assert!(response.config.is_some());
        assert_eq!(response.amount_used, Uint128::new(250_000));
    }

    // ============ A1: ZERO-COVERAGE FUNCTIONS ============

    #[test]
    fn test_remove_rate_limit_success() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info.clone(),
            ExecuteMsg::SetRateLimit {
                denom: DENOM_LUNC.to_string(),
                config: RateLimitConfig {
                    max_amount_per_window: Uint128::new(1_000_000),
                    window_seconds: 3600,
                },
            },
        )
        .unwrap();

        // Use some of the limit to create state
        let treasury_info = mock_info(TREASURY, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            treasury_info,
            ExecuteMsg::NotifyDeposit {
                depositor: USER.to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::new(100),
            },
        )
        .unwrap();

        let res = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::RemoveRateLimit {
                denom: DENOM_LUNC.to_string(),
            },
        )
        .unwrap();
        assert_eq!(res.attributes[0].value, "remove_rate_limit");

        assert!(RATE_LIMITS.may_load(&deps.storage, DENOM_LUNC).unwrap().is_none());
        assert!(RATE_LIMIT_STATE.may_load(&deps.storage, DENOM_LUNC).unwrap().is_none());
    }

    #[test]
    fn test_remove_rate_limit_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(USER, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::RemoveRateLimit {
                denom: DENOM_LUNC.to_string(),
            },
        )
        .unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_remove_rate_limit_nonexistent() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        let res = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::RemoveRateLimit {
                denom: "nonexistent".to_string(),
            },
        )
        .unwrap();
        assert_eq!(res.attributes[0].value, "remove_rate_limit");
    }

    #[test]
    fn test_query_pending_governance_none() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let res = query(deps.as_ref(), mock_env(), QueryMsg::PendingGovernance {}).unwrap();
        let response: PendingGovernanceResponse = from_json(res).unwrap();
        assert!(response.new_governance.is_none());
        assert!(response.execute_after.is_none());
    }

    #[test]
    fn test_query_pending_governance_some() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();
        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            env.clone(),
            info,
            ExecuteMsg::ProposeGovernanceTransfer {
                new_governance: "new_gov".to_string(),
            },
        )
        .unwrap();

        let res = query(deps.as_ref(), mock_env(), QueryMsg::PendingGovernance {}).unwrap();
        let response: PendingGovernanceResponse = from_json(res).unwrap();
        assert_eq!(response.new_governance.unwrap().as_str(), "new_gov");
        assert!(response.execute_after.is_some());
    }

    // ============ A2: MISSING ERROR-PATH TESTS ============

    #[test]
    fn test_notify_deposit_zero_amount() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(TREASURY, &[]);
        let msg = ExecuteMsg::NotifyDeposit {
            depositor: USER.to_string(),
            denom: DENOM_LUNC.to_string(),
            amount: Uint128::zero(),
        };
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::ZeroAmount);
    }

    #[test]
    fn test_unwrap_zero_amount() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(CW20_LUNC, &[]);
        let msg = make_cw20_receive(USER, 0, &Cw20HookMsg::Unwrap { recipient: None });
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::ZeroAmount);
    }

    #[test]
    fn test_remove_denom_mapping_unauthorized() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::RemoveDenomMapping {
            denom: DENOM_LUNC.to_string(),
        };
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_cancel_governance_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Propose first so there is a pending transfer
        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::ProposeGovernanceTransfer {
                new_governance: "new_gov".to_string(),
            },
        )
        .unwrap();

        let info = mock_info(USER, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::CancelGovernanceTransfer {},
        )
        .unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_cancel_governance_no_pending() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::CancelGovernanceTransfer {},
        )
        .unwrap_err();
        assert_eq!(err, ContractError::NoPendingGovernance);
    }

    #[test]
    fn test_accept_governance_no_pending() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let mut env = mock_env();
        env.block.time = env.block.time.plus_seconds(700_000);

        let info = mock_info("anyone", &[]);
        let err = execute(
            deps.as_mut(),
            env,
            info,
            ExecuteMsg::AcceptGovernanceTransfer {},
        )
        .unwrap_err();
        assert_eq!(err, ContractError::NoPendingGovernance);
    }

    #[test]
    fn test_set_paused_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(USER, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetPaused { paused: true },
        )
        .unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_set_rate_limit_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(USER, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetRateLimit {
                denom: DENOM_LUNC.to_string(),
                config: RateLimitConfig {
                    max_amount_per_window: Uint128::new(100),
                    window_seconds: 60,
                },
            },
        )
        .unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    // ============ A3: BOUNDARY AND FUZZING TESTS ============

    #[test]
    fn test_fee_rounding_small_amounts() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(TREASURY, &[]);

        // At 50 bps, fee = amount * 50 / 10000. Truncates to 0 for amount < 200.
        for (amount, expected_fee) in [
            (1u128, 0u128),
            (99, 0),
            (100, 0),
            (199, 0),
            (200, 1),
            (201, 1),
            (399, 1),
            (400, 2),
        ] {
            let msg = ExecuteMsg::NotifyDeposit {
                depositor: USER.to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::new(amount),
            };
            let res = execute(deps.as_mut(), mock_env(), info.clone(), msg).unwrap();
            let fee_attr = res.attributes.iter().find(|a| a.key == "fee").unwrap();
            assert_eq!(
                fee_attr.value,
                expected_fee.to_string(),
                "amount={amount} expected fee={expected_fee}"
            );
            let mint_attr = res.attributes.iter().find(|a| a.key == "mint_amount").unwrap();
            assert_eq!(
                mint_attr.value,
                (amount - expected_fee).to_string(),
                "amount={amount} expected mint={}",
                amount - expected_fee
            );
        }
    }

    #[test]
    fn test_fee_at_max_bps() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        // Set fee to max (10%)
        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetFeeBps { fee_bps: 1000 },
        )
        .unwrap();

        let info = mock_info(TREASURY, &[]);
        let msg = ExecuteMsg::NotifyDeposit {
            depositor: USER.to_string(),
            denom: DENOM_LUNC.to_string(),
            amount: Uint128::new(1_000_000),
        };
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        let fee_attr = res.attributes.iter().find(|a| a.key == "fee").unwrap();
        assert_eq!(fee_attr.value, "100000"); // 10% of 1M
        let mint_attr = res.attributes.iter().find(|a| a.key == "mint_amount").unwrap();
        assert_eq!(mint_attr.value, "900000"); // 90% of 1M
    }

    #[test]
    fn test_fee_exact_boundary_bps() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);

        // Exactly at MAX_FEE_BPS (1000) should succeed
        execute(
            deps.as_mut(),
            mock_env(),
            info.clone(),
            ExecuteMsg::SetFeeBps { fee_bps: 1000 },
        )
        .unwrap();
        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.fee_bps, 1000);

        // One over should fail
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetFeeBps { fee_bps: 1001 },
        )
        .unwrap_err();
        assert_eq!(
            err,
            ContractError::FeeTooHigh {
                fee_bps: 1001,
                max_bps: 1000,
            }
        );
    }

    #[test]
    fn test_rate_limit_exact_boundary() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetRateLimit {
                denom: DENOM_LUNC.to_string(),
                config: RateLimitConfig {
                    max_amount_per_window: Uint128::new(1000),
                    window_seconds: 3600,
                },
            },
        )
        .unwrap();

        // Exactly at max should succeed (check uses `>`, not `>=`)
        let info = mock_info(TREASURY, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::NotifyDeposit {
                depositor: USER.to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::new(1000),
            },
        )
        .unwrap();
    }

    #[test]
    fn test_rate_limit_one_over() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetRateLimit {
                denom: DENOM_LUNC.to_string(),
                config: RateLimitConfig {
                    max_amount_per_window: Uint128::new(1000),
                    window_seconds: 3600,
                },
            },
        )
        .unwrap();

        let info = mock_info(TREASURY, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::NotifyDeposit {
                depositor: USER.to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::new(1001),
            },
        )
        .unwrap_err();
        assert_eq!(
            err,
            ContractError::RateLimitExceeded {
                denom: DENOM_LUNC.to_string(),
            }
        );
    }

    #[test]
    fn test_rate_limit_window_boundary_burst() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetRateLimit {
                denom: DENOM_LUNC.to_string(),
                config: RateLimitConfig {
                    max_amount_per_window: Uint128::new(1_000_000),
                    window_seconds: 3600,
                },
            },
        )
        .unwrap();

        let mut env = mock_env();
        let info = mock_info(TREASURY, &[]);

        // T=0: fill the entire window
        execute(
            deps.as_mut(),
            env.clone(),
            info.clone(),
            ExecuteMsg::NotifyDeposit {
                depositor: USER.to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::new(1_000_000),
            },
        )
        .unwrap();

        // T+3600: window just expired, resets and allows full limit again
        env.block.time = Timestamp::from_seconds(env.block.time.seconds() + 3600);
        execute(
            deps.as_mut(),
            env,
            info,
            ExecuteMsg::NotifyDeposit {
                depositor: USER.to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::new(1_000_000),
            },
        )
        .unwrap();
        // 2M moved across a single window boundary -- demonstrates the tumbling window burst
    }

    #[test]
    fn test_calculate_fee_with_zero_amount_deposit() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        // Zero amount triggers ZeroAmount error before fee calculation matters
        let info = mock_info(TREASURY, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::NotifyDeposit {
                depositor: USER.to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::zero(),
            },
        )
        .unwrap_err();
        assert_eq!(err, ContractError::ZeroAmount);
    }

    #[test]
    fn test_wrap_very_large_amount() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        // Near-max u128 amount -- multiply_ratio uses Uint256 internally so no overflow
        let large_amount = Uint128::new(u128::MAX / 2);
        let info = mock_info(TREASURY, &[]);
        let msg = ExecuteMsg::NotifyDeposit {
            depositor: USER.to_string(),
            denom: DENOM_LUNC.to_string(),
            amount: large_amount,
        };
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        let fee_attr = res.attributes.iter().find(|a| a.key == "fee").unwrap();
        let mint_attr = res.attributes.iter().find(|a| a.key == "mint_amount").unwrap();
        let fee: u128 = fee_attr.value.parse().unwrap();
        let mint: u128 = mint_attr.value.parse().unwrap();
        assert_eq!(fee + mint, large_amount.u128());
    }

    // ============ A4: MAPPING OVERWRITE CORRECTNESS ============

    #[test]
    fn test_set_denom_mapping_overwrite_cleans_stale_reverse() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        add_mapping(deps.as_mut(), DENOM_LUNC, "cw20_old");
        assert!(CW20_TO_DENOM.may_load(&deps.storage, "cw20_old").unwrap().is_some());

        add_mapping(deps.as_mut(), DENOM_LUNC, "cw20_new");

        // Old reverse mapping removed
        assert!(CW20_TO_DENOM.may_load(&deps.storage, "cw20_old").unwrap().is_none());
        assert_eq!(
            DENOM_TO_CW20.load(&deps.storage, DENOM_LUNC).unwrap().as_str(),
            "cw20_new"
        );
        assert_eq!(
            CW20_TO_DENOM.load(&deps.storage, "cw20_new").unwrap(),
            DENOM_LUNC
        );
    }

    #[test]
    fn test_set_denom_mapping_overwrite_cleans_stale_forward() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        add_mapping(deps.as_mut(), DENOM_LUNC, CW20_LUNC);
        add_mapping(deps.as_mut(), DENOM_USTC, CW20_LUNC);

        // Old forward mapping (denom_A) should be removed
        assert!(DENOM_TO_CW20.may_load(&deps.storage, DENOM_LUNC).unwrap().is_none());
        assert_eq!(
            DENOM_TO_CW20.load(&deps.storage, DENOM_USTC).unwrap().as_str(),
            CW20_LUNC
        );
        assert_eq!(
            CW20_TO_DENOM.load(&deps.storage, CW20_LUNC).unwrap(),
            DENOM_USTC
        );
    }

    #[test]
    fn test_set_denom_mapping_same_values_noop() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        add_mapping(deps.as_mut(), DENOM_LUNC, CW20_LUNC);

        assert_eq!(
            DENOM_TO_CW20.load(&deps.storage, DENOM_LUNC).unwrap().as_str(),
            CW20_LUNC
        );
        assert_eq!(
            CW20_TO_DENOM.load(&deps.storage, CW20_LUNC).unwrap(),
            DENOM_LUNC
        );
    }

    // ============ A5: MULTI-USER UNIT TEST ============

    #[test]
    fn test_rate_limit_shared_across_users() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetRateLimit {
                denom: DENOM_LUNC.to_string(),
                config: RateLimitConfig {
                    max_amount_per_window: Uint128::new(1000),
                    window_seconds: 3600,
                },
            },
        )
        .unwrap();

        let info = mock_info(TREASURY, &[]);

        // User 1 deposits 600
        execute(
            deps.as_mut(),
            mock_env(),
            info.clone(),
            ExecuteMsg::NotifyDeposit {
                depositor: "user_a".to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::new(600),
            },
        )
        .unwrap();

        // User 2 deposits 400 -- exactly at limit, should succeed
        execute(
            deps.as_mut(),
            mock_env(),
            info.clone(),
            ExecuteMsg::NotifyDeposit {
                depositor: "user_b".to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::new(400),
            },
        )
        .unwrap();

        // User 3 deposits 1 -- over limit, should fail
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::NotifyDeposit {
                depositor: "user_c".to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::new(1),
            },
        )
        .unwrap_err();
        assert_eq!(
            err,
            ContractError::RateLimitExceeded {
                denom: DENOM_LUNC.to_string(),
            }
        );
    }

    // ============ T-1: MIGRATION TESTS ============

    #[test]
    fn test_migrate_success() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let res = migrate(deps.as_mut(), mock_env(), MigrateMsg {}).unwrap();
        assert_eq!(res.attributes[0].value, "migrate");

        let ver = cw2::get_contract_version(&deps.storage).unwrap();
        assert_eq!(ver.contract, crate::state::CONTRACT_NAME);
        assert_eq!(ver.version, crate::state::CONTRACT_VERSION);
    }

    #[test]
    fn test_migrate_wrong_contract_name() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        cw2::set_contract_version(&mut deps.storage, "wrong-contract", "0.1.0").unwrap();
        let err = migrate(deps.as_mut(), mock_env(), MigrateMsg {}).unwrap_err();
        match err {
            ContractError::Std(_) => {}
            other => panic!("Expected ContractError::Std, got {:?}", other),
        }
    }

    #[test]
    fn test_migrate_preserves_state() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetFeeBps { fee_bps: 100 },
        )
        .unwrap();

        migrate(deps.as_mut(), mock_env(), MigrateMsg {}).unwrap();

        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.fee_bps, 100);
        assert_eq!(config.governance.as_str(), GOVERNANCE);
        assert_eq!(config.treasury.as_str(), TREASURY);

        let mapping = DENOM_TO_CW20.load(&deps.storage, DENOM_LUNC).unwrap();
        assert_eq!(mapping.as_str(), CW20_LUNC);
    }

    // ============ T-4: RATE LIMIT ZERO WINDOW ============

    #[test]
    fn test_rate_limit_zero_window_seconds() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetRateLimit {
                denom: DENOM_LUNC.to_string(),
                config: RateLimitConfig {
                    max_amount_per_window: Uint128::new(1_000_000),
                    window_seconds: 0,
                },
            },
        )
        .unwrap();

        let info = mock_info(TREASURY, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info.clone(),
            ExecuteMsg::NotifyDeposit {
                depositor: USER.to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::new(500_000),
            },
        )
        .unwrap();

        // With window_seconds=0, every call resets the window (elapsed >= 0 is always true),
        // so a second deposit should also succeed regardless of prior usage.
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::NotifyDeposit {
                depositor: USER.to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::new(500_000),
            },
        )
        .unwrap();
    }

    #[test]
    fn test_rate_limit_zero_window_still_enforces_per_call_limit() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetRateLimit {
                denom: DENOM_LUNC.to_string(),
                config: RateLimitConfig {
                    max_amount_per_window: Uint128::new(1_000_000),
                    window_seconds: 0,
                },
            },
        )
        .unwrap();

        // A single call exceeding the limit should still fail
        let info = mock_info(TREASURY, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::NotifyDeposit {
                depositor: USER.to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::new(1_000_001),
            },
        )
        .unwrap_err();
        assert_eq!(
            err,
            ContractError::RateLimitExceeded {
                denom: DENOM_LUNC.to_string(),
            }
        );
    }

    // ============ SEC-4: RATE LIMIT OVERFLOW ============

    #[test]
    fn test_rate_limit_overflow_returns_error() {
        let mut deps = mock_dependencies();
        setup_with_mapping(deps.as_mut());

        let info = mock_info(GOVERNANCE, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetRateLimit {
                denom: DENOM_LUNC.to_string(),
                config: RateLimitConfig {
                    max_amount_per_window: Uint128::MAX,
                    window_seconds: 3600,
                },
            },
        )
        .unwrap();

        let info = mock_info(TREASURY, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info.clone(),
            ExecuteMsg::NotifyDeposit {
                depositor: USER.to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::MAX,
            },
        )
        .unwrap();

        // Second deposit should trigger checked_add overflow, not panic
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::NotifyDeposit {
                depositor: USER.to_string(),
                denom: DENOM_LUNC.to_string(),
                amount: Uint128::new(1),
            },
        )
        .unwrap_err();
        assert_eq!(err, ContractError::RateLimitOverflow);
    }
}

#[cfg(test)]
mod integration_tests {
    use cosmwasm_std::{Addr, Coin, Empty, Uint128};
    use cw20::{Cw20Coin, Cw20ExecuteMsg, MinterResponse};
    use cw_multi_test::{App, ContractWrapper, Executor};

    const GOVERNANCE: &str = "governance";
    const USER: &str = "user";
    const USER2: &str = "user2";
    const DENOM_LUNC: &str = "uluna";
    const DENOM_USTC: &str = "uusd";

    fn treasury_contract() -> Box<dyn cw_multi_test::Contract<Empty>> {
        let contract = ContractWrapper::new(
            treasury::contract::execute,
            treasury::contract::instantiate,
            treasury::contract::query,
        )
        .with_migrate(treasury::contract::migrate);
        Box::new(contract)
    }

    fn wrap_mapper_contract() -> Box<dyn cw_multi_test::Contract<Empty>> {
        let contract = ContractWrapper::new(
            crate::contract::execute,
            crate::contract::instantiate,
            crate::contract::query,
        );
        Box::new(contract)
    }

    fn cw20_contract() -> Box<dyn cw_multi_test::Contract<Empty>> {
        let contract = ContractWrapper::new(
            cw20_mintable::contract::execute,
            cw20_mintable::contract::instantiate,
            cw20_mintable::contract::query,
        )
        .with_migrate(cw20_mintable::contract::migrate);
        Box::new(contract)
    }

    struct TestEnv {
        app: App,
        treasury_addr: Addr,
        wrapper_addr: Addr,
        cw20_lunc_addr: Addr,
        cw20_ustc_addr: Addr,
    }

    fn setup_full_env() -> TestEnv {
        let mut app = App::new(|router, _api, storage| {
            router
                .bank
                .init_balance(
                    storage,
                    &Addr::unchecked(USER),
                    vec![
                        Coin::new(10_000_000u128, DENOM_LUNC),
                        Coin::new(10_000_000u128, DENOM_USTC),
                    ],
                )
                .unwrap();
            router
                .bank
                .init_balance(
                    storage,
                    &Addr::unchecked(USER2),
                    vec![
                        Coin::new(5_000_000u128, DENOM_LUNC),
                        Coin::new(5_000_000u128, DENOM_USTC),
                    ],
                )
                .unwrap();
        });

        // Deploy treasury
        let treasury_code = app.store_code(treasury_contract());
        let treasury_addr = app
            .instantiate_contract(
                treasury_code,
                Addr::unchecked(GOVERNANCE),
                &treasury::msg::InstantiateMsg {
                    governance: GOVERNANCE.to_string(),
                },
                &[],
                "treasury",
                Some(GOVERNANCE.to_string()),
            )
            .unwrap();

        // Deploy wrap-mapper
        let wrapper_code = app.store_code(wrap_mapper_contract());
        let wrapper_addr = app
            .instantiate_contract(
                wrapper_code,
                Addr::unchecked(GOVERNANCE),
                &crate::msg::InstantiateMsg {
                    governance: GOVERNANCE.to_string(),
                    treasury: treasury_addr.to_string(),
                    fee_bps: Some(50), // 0.5%
                },
                &[],
                "wrap-mapper",
                None,
            )
            .unwrap();

        // Deploy CW20 LUNC-C
        let cw20_code = app.store_code(cw20_contract());
        let cw20_lunc_addr = app
            .instantiate_contract(
                cw20_code,
                Addr::unchecked(GOVERNANCE),
                &cw20_mintable::msg::InstantiateMsg {
                    name: "LUNC-C".to_string(),
                    symbol: "LUNC-C".to_string(),
                    decimals: 6,
                    initial_balances: vec![],
                    mint: Some(MinterResponse {
                        minter: GOVERNANCE.to_string(),
                        cap: None,
                    }),
                    marketing: None,
                },
                &[],
                "cw20-lunc-c",
                None,
            )
            .unwrap();

        // Deploy CW20 USTC-C
        let cw20_code2 = app.store_code(cw20_contract());
        let cw20_ustc_addr = app
            .instantiate_contract(
                cw20_code2,
                Addr::unchecked(GOVERNANCE),
                &cw20_mintable::msg::InstantiateMsg {
                    name: "USTC-C".to_string(),
                    symbol: "USTC-C".to_string(),
                    decimals: 6,
                    initial_balances: vec![],
                    mint: Some(MinterResponse {
                        minter: GOVERNANCE.to_string(),
                        cap: None,
                    }),
                    marketing: None,
                },
                &[],
                "cw20-ustc-c",
                None,
            )
            .unwrap();

        // Add wrap-mapper as minter on both CW20s
        app.execute_contract(
            Addr::unchecked(GOVERNANCE),
            cw20_lunc_addr.clone(),
            &cw20_mintable::msg::ExecuteMsg::AddMinter {
                minter: wrapper_addr.to_string(),
            },
            &[],
        )
        .unwrap();
        app.execute_contract(
            Addr::unchecked(GOVERNANCE),
            cw20_ustc_addr.clone(),
            &cw20_mintable::msg::ExecuteMsg::AddMinter {
                minter: wrapper_addr.to_string(),
            },
            &[],
        )
        .unwrap();

        // Register denom mappings on wrap-mapper
        app.execute_contract(
            Addr::unchecked(GOVERNANCE),
            wrapper_addr.clone(),
            &crate::msg::ExecuteMsg::SetDenomMapping {
                denom: DENOM_LUNC.to_string(),
                cw20_addr: cw20_lunc_addr.to_string(),
            },
            &[],
        )
        .unwrap();
        app.execute_contract(
            Addr::unchecked(GOVERNANCE),
            wrapper_addr.clone(),
            &crate::msg::ExecuteMsg::SetDenomMapping {
                denom: DENOM_USTC.to_string(),
                cw20_addr: cw20_ustc_addr.to_string(),
            },
            &[],
        )
        .unwrap();

        // Register wrap-mapper as denom wrapper on treasury
        app.execute_contract(
            Addr::unchecked(GOVERNANCE),
            treasury_addr.clone(),
            &treasury::msg::ExecuteMsg::SetDenomWrapper {
                denom: DENOM_LUNC.to_string(),
                wrapper: wrapper_addr.to_string(),
            },
            &[],
        )
        .unwrap();
        app.execute_contract(
            Addr::unchecked(GOVERNANCE),
            treasury_addr.clone(),
            &treasury::msg::ExecuteMsg::SetDenomWrapper {
                denom: DENOM_USTC.to_string(),
                wrapper: wrapper_addr.to_string(),
            },
            &[],
        )
        .unwrap();

        TestEnv {
            app,
            treasury_addr,
            wrapper_addr,
            cw20_lunc_addr,
            cw20_ustc_addr,
        }
    }

    fn query_cw20_balance(app: &App, cw20_addr: &Addr, address: &str) -> Uint128 {
        let res: cw20::BalanceResponse = app
            .wrap()
            .query_wasm_smart(
                cw20_addr,
                &cw20_mintable::msg::QueryMsg::Balance {
                    address: address.to_string(),
                },
            )
            .unwrap();
        res.balance
    }

    fn query_cw20_supply(app: &App, cw20_addr: &Addr) -> Uint128 {
        let res: cw20::TokenInfoResponse = app
            .wrap()
            .query_wasm_smart(cw20_addr, &cw20_mintable::msg::QueryMsg::TokenInfo {})
            .unwrap();
        res.total_supply
    }

    // ============ C1: FULL WRAP FLOW ============

    #[test]
    fn test_full_wrap_flow() {
        let mut env = setup_full_env();

        let wrap_amount = Uint128::new(1_000_000);
        let expected_cw20 = Uint128::new(995_000); // 1M - 0.5% fee
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(wrap_amount.u128(), DENOM_LUNC)],
            )
            .unwrap();

        let balance = query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER);
        assert_eq!(balance, expected_cw20);

        // Full native amount stays in treasury (fee portion is profit)
        let treasury_balance = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_LUNC)
            .unwrap();
        assert_eq!(treasury_balance.amount, wrap_amount);
    }

    // ============ C2: FULL UNWRAP FLOW ============

    #[test]
    fn test_full_unwrap_flow() {
        let mut env = setup_full_env();

        let wrap_amount = Uint128::new(1_000_000);
        let cw20_received = Uint128::new(995_000); // after 0.5% wrap fee
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(wrap_amount.u128(), DENOM_LUNC)],
            )
            .unwrap();

        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER),
            cw20_received,
        );

        // Unwrap all CW20. Unwrap fee = 995_000 * 50/10000 = 4_975
        let unwrap_fee = Uint128::new(4_975);
        let expected_native_back = cw20_received - unwrap_fee; // 990_025

        let hook_msg = crate::msg::Cw20HookMsg::Unwrap { recipient: None };
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_lunc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: cw20_received,
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();

        let cw20_balance = query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER);
        assert_eq!(cw20_balance, Uint128::zero());

        // User started with 10M, deposited 1M, got back 990_025
        let user_native = env.app.wrap().query_balance(USER, DENOM_LUNC).unwrap();
        assert_eq!(
            user_native.amount,
            Uint128::new(10_000_000) - wrap_amount + expected_native_back,
        );

        // Total fees captured: 5_000 (wrap) + 4_975 (unwrap) = 9_975 remain in treasury
        let treasury_balance = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_LUNC)
            .unwrap();
        assert_eq!(treasury_balance.amount, Uint128::new(9_975));
    }

    // ============ C3: WRAP/UNWRAP ROUNDTRIP ============

    #[test]
    fn test_wrap_unwrap_roundtrip() {
        let mut env = setup_full_env();

        let initial_user_balance = env.app.wrap().query_balance(USER, DENOM_LUNC).unwrap().amount;
        let wrap_amount = Uint128::new(2_000_000);
        let wrap_fee = Uint128::new(10_000); // 0.5% of 2M
        let cw20_minted = wrap_amount - wrap_fee; // 1_990_000

        // Wrap
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(wrap_amount.u128(), DENOM_LUNC)],
            )
            .unwrap();

        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER),
            cw20_minted,
        );
        assert_eq!(
            env.app.wrap().query_balance(USER, DENOM_LUNC).unwrap().amount,
            initial_user_balance - wrap_amount,
        );

        // Unwrap all CW20
        let unwrap_fee = Uint128::new(9_950); // 0.5% of 1_990_000
        let hook_msg = crate::msg::Cw20HookMsg::Unwrap { recipient: None };
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_lunc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: cw20_minted,
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();

        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER),
            Uint128::zero(),
        );

        // User loses wrap_fee + unwrap_fee on the roundtrip
        let total_fees = wrap_fee + unwrap_fee;
        assert_eq!(
            env.app.wrap().query_balance(USER, DENOM_LUNC).unwrap().amount,
            initial_user_balance - total_fees,
        );

        let supply = query_cw20_supply(&env.app, &env.cw20_lunc_addr);
        assert_eq!(supply, Uint128::zero());

        // Fees remain in treasury
        let treasury_balance = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_LUNC)
            .unwrap();
        assert_eq!(treasury_balance.amount, total_fees);
    }

    // ============ C4: MULTIPLE DENOMS ============

    #[test]
    fn test_multiple_denoms() {
        let mut env = setup_full_env();

        // Wrap LUNC (1M -> 995k CW20 after 0.5% fee)
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, DENOM_LUNC)],
            )
            .unwrap();

        // Wrap USTC (500k -> 497_500 CW20 after 0.5% fee)
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(500_000u128, DENOM_USTC)],
            )
            .unwrap();

        let lunc_cw20 = Uint128::new(995_000);
        let ustc_cw20 = Uint128::new(497_500);

        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER),
            lunc_cw20,
        );
        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_ustc_addr, USER),
            ustc_cw20,
        );

        // Unwrap LUNC
        let hook_msg = crate::msg::Cw20HookMsg::Unwrap { recipient: None };
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_lunc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: lunc_cw20,
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();

        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER),
            Uint128::zero(),
        );
        // USTC CW20 still intact
        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_ustc_addr, USER),
            ustc_cw20,
        );
    }

    // ============ C5: RATE LIMIT END-TO-END ============

    #[test]
    fn test_rate_limit_end_to_end() {
        let mut env = setup_full_env();

        // Set rate limit
        env.app
            .execute_contract(
                Addr::unchecked(GOVERNANCE),
                env.wrapper_addr.clone(),
                &crate::msg::ExecuteMsg::SetRateLimit {
                    denom: DENOM_LUNC.to_string(),
                    config: crate::state::RateLimitConfig {
                        max_amount_per_window: Uint128::new(1_500_000),
                        window_seconds: 3600,
                    },
                },
                &[],
            )
            .unwrap();

        // First wrap within limit
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, DENOM_LUNC)],
            )
            .unwrap();

        // Second wrap exceeds limit
        let err = env
            .app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, DENOM_LUNC)],
            )
            .unwrap_err();
        assert!(err.root_cause().to_string().contains("Rate limit exceeded"));
    }

    // ============ C6: TREASURY INVARIANT ============

    #[test]
    fn test_treasury_invariant() {
        let mut env = setup_full_env();

        // Multiple wraps (fees mean CW20 supply < native deposited)
        // USER wraps 3M -> 2_985_000 CW20 (fee: 15_000)
        // USER2 wraps 2M -> 1_990_000 CW20 (fee: 10_000)
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(3_000_000u128, DENOM_LUNC)],
            )
            .unwrap();
        env.app
            .execute_contract(
                Addr::unchecked(USER2),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(2_000_000u128, DENOM_LUNC)],
            )
            .unwrap();

        let user_cw20 = query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER);
        assert_eq!(user_cw20, Uint128::new(2_985_000));

        // Partial unwrap: USER unwraps 1M CW20 -> gets 995_000 native (fee: 5_000)
        let hook_msg = crate::msg::Cw20HookMsg::Unwrap { recipient: None };
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_lunc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: Uint128::new(1_000_000),
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();

        // With fees, treasury balance > CW20 supply (fee profit stays in treasury)
        let treasury_balance = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_LUNC)
            .unwrap();
        let cw20_supply = query_cw20_supply(&env.app, &env.cw20_lunc_addr);

        // CW20 supply: 2_985_000 + 1_990_000 - 1_000_000 = 3_975_000
        assert_eq!(cw20_supply, Uint128::new(3_975_000));
        // Treasury: 5_000_000 deposited - 995_000 withdrawn = 4_005_000
        assert_eq!(treasury_balance.amount, Uint128::new(4_005_000));
        // Accumulated fees: 15_000 + 10_000 + 5_000 = 30_000
        assert_eq!(
            treasury_balance.amount - cw20_supply,
            Uint128::new(30_000),
        );
    }

    // ============ C7: CONCURRENT USERS ============

    #[test]
    fn test_concurrent_users() {
        let mut env = setup_full_env();

        // USER wraps 2M -> 1_990_000 CW20, USER2 wraps 3M -> 2_985_000 CW20
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(2_000_000u128, DENOM_LUNC)],
            )
            .unwrap();
        env.app
            .execute_contract(
                Addr::unchecked(USER2),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(3_000_000u128, DENOM_LUNC)],
            )
            .unwrap();

        let user_cw20 = Uint128::new(1_990_000);
        let user2_cw20 = Uint128::new(2_985_000);
        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER),
            user_cw20,
        );
        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER2),
            user2_cw20,
        );

        // User unwraps 1M CW20, User2 unwraps all
        let hook_msg = crate::msg::Cw20HookMsg::Unwrap { recipient: None };
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_lunc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: Uint128::new(1_000_000),
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();
        env.app
            .execute_contract(
                Addr::unchecked(USER2),
                env.cw20_lunc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: user2_cw20,
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();

        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER),
            Uint128::new(990_000),
        );
        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER2),
            Uint128::zero(),
        );

        // With fees, treasury > CW20 supply
        let treasury_balance = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_LUNC)
            .unwrap();
        let cw20_supply = query_cw20_supply(&env.app, &env.cw20_lunc_addr);
        assert_eq!(cw20_supply, Uint128::new(990_000));
        assert!(treasury_balance.amount > cw20_supply);
    }

    // ============ C8: PAUSE BLOCKS FULL FLOW ============

    #[test]
    fn test_pause_blocks_full_flow() {
        let mut env = setup_full_env();

        // Pause
        env.app
            .execute_contract(
                Addr::unchecked(GOVERNANCE),
                env.wrapper_addr.clone(),
                &crate::msg::ExecuteMsg::SetPaused { paused: true },
                &[],
            )
            .unwrap();

        // Wrap should fail
        let err = env
            .app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, DENOM_LUNC)],
            )
            .unwrap_err();
        assert!(err.root_cause().to_string().contains("paused"));
    }

    // ============ SECURITY TESTS D1-D8 ============

    #[test]
    fn test_fake_notify_deposit() {
        let mut env = setup_full_env();

        // Non-treasury caller tries to call NotifyDeposit
        let err = env
            .app
            .execute_contract(
                Addr::unchecked(USER),
                env.wrapper_addr.clone(),
                &crate::msg::ExecuteMsg::NotifyDeposit {
                    depositor: USER.to_string(),
                    denom: DENOM_LUNC.to_string(),
                    amount: Uint128::new(1_000_000),
                },
                &[],
            )
            .unwrap_err();
        assert!(err.root_cause().to_string().contains("Unauthorized"));
    }

    #[test]
    fn test_fake_instant_withdraw() {
        let mut env = setup_full_env();

        // Fund treasury
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, DENOM_LUNC)],
            )
            .unwrap();

        // Non-wrapper tries to call InstantWithdraw on treasury
        let err = env
            .app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::InstantWithdraw {
                    recipient: USER.to_string(),
                    denom: DENOM_LUNC.to_string(),
                    amount: Uint128::new(1_000_000),
                },
                &[],
            )
            .unwrap_err();
        assert!(err.root_cause().to_string().contains("registered wrapper"));
    }

    #[test]
    fn test_wrap_unsupported_denom() {
        let mut app = App::new(|router, _api, storage| {
            router
                .bank
                .init_balance(
                    storage,
                    &Addr::unchecked(USER),
                    vec![Coin::new(10_000_000u128, "unsupported")],
                )
                .unwrap();
        });

        let treasury_code = app.store_code(treasury_contract());
        let treasury_addr = app
            .instantiate_contract(
                treasury_code,
                Addr::unchecked(GOVERNANCE),
                &treasury::msg::InstantiateMsg {
                    governance: GOVERNANCE.to_string(),
                },
                &[],
                "treasury",
                Some(GOVERNANCE.to_string()),
            )
            .unwrap();

        let err = app
            .execute_contract(
                Addr::unchecked(USER),
                treasury_addr,
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, "unsupported")],
            )
            .unwrap_err();
        assert!(err.root_cause().to_string().contains("No wrapper registered for denom"));
    }

    #[test]
    fn test_unwrap_unregistered_cw20() {
        let mut env = setup_full_env();

        // Deploy a rogue CW20 with USER as minter
        let rogue_cw20_code = env.app.store_code(cw20_contract());
        let rogue_cw20 = env
            .app
            .instantiate_contract(
                rogue_cw20_code,
                Addr::unchecked(USER),
                &cw20_mintable::msg::InstantiateMsg {
                    name: "Rogue".to_string(),
                    symbol: "ROGUE".to_string(),
                    decimals: 6,
                    initial_balances: vec![Cw20Coin {
                        address: USER.to_string(),
                        amount: Uint128::new(1_000_000),
                    }],
                    mint: Some(MinterResponse {
                        minter: USER.to_string(),
                        cap: None,
                    }),
                    marketing: None,
                },
                &[],
                "rogue-cw20",
                None,
            )
            .unwrap();

        // Try to send the unregistered CW20 to wrap-mapper
        let hook_msg = crate::msg::Cw20HookMsg::Unwrap { recipient: None };
        let err = env
            .app
            .execute_contract(
                Addr::unchecked(USER),
                rogue_cw20,
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: Uint128::new(1_000_000),
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap_err();
        assert!(err.root_cause().to_string().contains("No denom mapping"));
    }

    #[test]
    fn test_rate_limit_sybil() {
        let mut env = setup_full_env();

        // Set tight global rate limit
        env.app
            .execute_contract(
                Addr::unchecked(GOVERNANCE),
                env.wrapper_addr.clone(),
                &crate::msg::ExecuteMsg::SetRateLimit {
                    denom: DENOM_LUNC.to_string(),
                    config: crate::state::RateLimitConfig {
                        max_amount_per_window: Uint128::new(1_000_000),
                        window_seconds: 3600,
                    },
                },
                &[],
            )
            .unwrap();

        // User1 wraps 700k
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(700_000u128, DENOM_LUNC)],
            )
            .unwrap();

        // User2 wraps 400k -- exceeds global limit even though User2 hasn't wrapped before
        let err = env
            .app
            .execute_contract(
                Addr::unchecked(USER2),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(400_000u128, DENOM_LUNC)],
            )
            .unwrap_err();
        assert!(err.root_cause().to_string().contains("Rate limit exceeded"));
    }

    #[test]
    fn test_governance_only_config_changes() {
        let mut env = setup_full_env();

        // Non-governance can't SetDenomMapping
        let err = env
            .app
            .execute_contract(
                Addr::unchecked(USER),
                env.wrapper_addr.clone(),
                &crate::msg::ExecuteMsg::SetDenomMapping {
                    denom: "fake".to_string(),
                    cw20_addr: "fake_cw20".to_string(),
                },
                &[],
            )
            .unwrap_err();
        assert!(err.root_cause().to_string().contains("Unauthorized"));

        // Non-governance can't SetRateLimit
        let err = env
            .app
            .execute_contract(
                Addr::unchecked(USER),
                env.wrapper_addr.clone(),
                &crate::msg::ExecuteMsg::SetRateLimit {
                    denom: DENOM_LUNC.to_string(),
                    config: crate::state::RateLimitConfig {
                        max_amount_per_window: Uint128::new(1),
                        window_seconds: 1,
                    },
                },
                &[],
            )
            .unwrap_err();
        assert!(err.root_cause().to_string().contains("Unauthorized"));

        // Non-governance can't SetPaused
        let err = env
            .app
            .execute_contract(
                Addr::unchecked(USER),
                env.wrapper_addr.clone(),
                &crate::msg::ExecuteMsg::SetPaused { paused: true },
                &[],
            )
            .unwrap_err();
        assert!(err.root_cause().to_string().contains("Unauthorized"));
    }

    #[test]
    fn test_paused_state_persists() {
        let mut env = setup_full_env();

        // Pause
        env.app
            .execute_contract(
                Addr::unchecked(GOVERNANCE),
                env.wrapper_addr.clone(),
                &crate::msg::ExecuteMsg::SetPaused { paused: true },
                &[],
            )
            .unwrap();

        // Advance blocks to simulate time passing
        env.app.update_block(|b| {
            b.height += 100;
            b.time = b.time.plus_seconds(600);
        });

        // Still paused after blocks advance
        let config: crate::msg::ConfigResponse = env
            .app
            .wrap()
            .query_wasm_smart(&env.wrapper_addr, &crate::msg::QueryMsg::Config {})
            .unwrap();
        assert!(config.paused);

        // Operations still blocked
        let err = env
            .app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, DENOM_LUNC)],
            )
            .unwrap_err();
        assert!(err.root_cause().to_string().contains("paused"));
    }

    #[test]
    fn test_treasury_balance_never_negative() {
        let mut env = setup_full_env();

        // Wrap 1M LUNC -> 995_000 CW20 (treasury holds 1M native)
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, DENOM_LUNC)],
            )
            .unwrap();

        // Manually mint more CW20 than treasury holds (governance as minter)
        env.app
            .execute_contract(
                Addr::unchecked(GOVERNANCE),
                env.cw20_lunc_addr.clone(),
                &cw20_mintable::msg::ExecuteMsg::Mint {
                    recipient: USER.to_string(),
                    amount: Uint128::new(5_000_000),
                },
                &[],
            )
            .unwrap();

        // User now has 5_995_000 CW20 but treasury only has 1M native.
        // Try to unwrap more than treasury holds (even with fee deducted).
        // 5_995_000 * 0.995 = 5_965_025 > 1M => must fail
        let hook_msg = crate::msg::Cw20HookMsg::Unwrap { recipient: None };
        let total_cw20 = query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER);
        let err = env
            .app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_lunc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: total_cw20,
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap_err();
        assert!(
            err.root_cause().to_string().contains("Insufficient")
                || err.root_cause().to_string().contains("insufficient")
        );
    }

    // ============ E: PRE-EXISTING TREASURY BALANCE TESTS ============

    fn setup_env_with_preexisting_funds() -> TestEnv {
        let mut env = setup_full_env();

        // Simulate pre-existing treasury funds from SwapDeposit and other operations.
        // Governance may intentionally mint CW20 backed by these funds (to avoid
        // re-taxation), but the total CW20 supply must never exceed actual holdings.
        env.app
            .send_tokens(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &[
                    Coin::new(5_000_000u128, DENOM_USTC),
                    Coin::new(3_000_000u128, DENOM_LUNC),
                ],
            )
            .unwrap();

        env
    }

    #[test]
    fn test_preexisting_funds_wrap_unwrap_roundtrip() {
        let mut env = setup_env_with_preexisting_funds();

        let treasury_ustc_before = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_USTC)
            .unwrap()
            .amount;
        let treasury_lunc_before = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_LUNC)
            .unwrap()
            .amount;
        assert_eq!(treasury_ustc_before, Uint128::new(5_000_000));
        assert_eq!(treasury_lunc_before, Uint128::new(3_000_000));

        // User wraps 1M USTC -> gets 995_000 CW20 (0.5% fee)
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, DENOM_USTC)],
            )
            .unwrap();

        // Treasury now has 6M USTC (5M pre-existing + 1M wrapped)
        let treasury_ustc = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_USTC)
            .unwrap()
            .amount;
        assert_eq!(treasury_ustc, Uint128::new(6_000_000));
        let cw20_minted = Uint128::new(995_000);
        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_ustc_addr, USER),
            cw20_minted,
        );

        // User unwraps all CW20 -> gets 995_000 - 0.5% = 990_025 native
        let hook_msg = crate::msg::Cw20HookMsg::Unwrap { recipient: None };
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_ustc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: cw20_minted,
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();

        // Pre-existing 5M + fees remain in treasury
        let treasury_ustc = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_USTC)
            .unwrap()
            .amount;
        // wrap fee (5_000) + unwrap fee (4_975) = 9_975 fees captured
        assert_eq!(treasury_ustc, Uint128::new(5_009_975));

        // CW20 supply back to zero
        assert_eq!(
            query_cw20_supply(&env.app, &env.cw20_ustc_addr),
            Uint128::zero(),
        );
    }

    #[test]
    fn test_governance_minted_cw20_can_unwrap_if_treasury_has_funds() {
        let mut env = setup_env_with_preexisting_funds();

        // Treasury has 5M USTC pre-existing. Governance mints 3M CW20
        // directly (backed by the pre-existing funds, avoiding re-tax).
        env.app
            .execute_contract(
                Addr::unchecked(GOVERNANCE),
                env.cw20_ustc_addr.clone(),
                &cw20_mintable::msg::ExecuteMsg::Mint {
                    recipient: USER.to_string(),
                    amount: Uint128::new(3_000_000),
                },
                &[],
            )
            .unwrap();

        // Unwrapping 3M CW20, unwrap fee = 3M * 0.5% = 15_000
        let hook_msg = crate::msg::Cw20HookMsg::Unwrap { recipient: None };
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_ustc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: Uint128::new(3_000_000),
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();

        // Treasury: 5M - 2_985_000 withdrawn = 2_015_000 (15_000 fee stays)
        let treasury_ustc = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_USTC)
            .unwrap()
            .amount;
        assert_eq!(treasury_ustc, Uint128::new(2_015_000));
    }

    #[test]
    fn test_cw20_beyond_treasury_balance_fails() {
        let mut env = setup_env_with_preexisting_funds();

        // Treasury has 5M USTC. Governance mints 8M CW20 (exceeds treasury balance).
        env.app
            .execute_contract(
                Addr::unchecked(GOVERNANCE),
                env.cw20_ustc_addr.clone(),
                &cw20_mintable::msg::ExecuteMsg::Mint {
                    recipient: USER.to_string(),
                    amount: Uint128::new(8_000_000),
                },
                &[],
            )
            .unwrap();

        // Trying to unwrap 8M must fail. Even with fee, withdraw_amount = 7_960_000 > 5M.
        let hook_msg = crate::msg::Cw20HookMsg::Unwrap { recipient: None };
        let err = env
            .app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_ustc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: Uint128::new(8_000_000),
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap_err();
        assert!(
            err.root_cause().to_string().contains("Insufficient")
                || err.root_cause().to_string().contains("insufficient"),
        );

        // Treasury untouched (tx reverted atomically)
        let treasury_ustc = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_USTC)
            .unwrap()
            .amount;
        assert_eq!(treasury_ustc, Uint128::new(5_000_000));

        // Unwrapping 5M CW20 -> withdraw 4_975_000 (0.5% fee) should succeed
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_ustc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: Uint128::new(5_000_000),
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();

        // Fee of 25_000 remains in treasury
        let treasury_ustc = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_USTC)
            .unwrap()
            .amount;
        assert_eq!(treasury_ustc, Uint128::new(25_000));
    }

    #[test]
    fn test_preexisting_lunc_protected_during_ustc_operations() {
        let mut env = setup_env_with_preexisting_funds();

        // Treasury has 3M LUNC and 5M USTC pre-existing.

        // Wrap 1M LUNC -> 995_000 CW20
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, DENOM_LUNC)],
            )
            .unwrap();

        let lunc_cw20 = query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER);
        assert_eq!(lunc_cw20, Uint128::new(995_000));

        // Wrap 500k USTC -> 497_500 CW20
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(500_000u128, DENOM_USTC)],
            )
            .unwrap();

        let ustc_cw20 = query_cw20_balance(&env.app, &env.cw20_ustc_addr, USER);
        assert_eq!(ustc_cw20, Uint128::new(497_500));

        // Unwrap all LUNC CW20
        let hook_msg = crate::msg::Cw20HookMsg::Unwrap { recipient: None };
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_lunc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: lunc_cw20,
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();

        // Pre-existing LUNC (3M) + fees stay in treasury
        let treasury_lunc = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_LUNC)
            .unwrap()
            .amount;
        // wrap fee 5_000 + unwrap fee 4_975 = 9_975 profit on top of 3M
        assert_eq!(treasury_lunc, Uint128::new(3_009_975));

        // Pre-existing USTC (5M) + wrapped USTC (500k) still in treasury
        let treasury_ustc = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_USTC)
            .unwrap()
            .amount;
        assert_eq!(treasury_ustc, Uint128::new(5_500_000));

        // Unwrap all USTC CW20
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_ustc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: ustc_cw20,
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();

        // Pre-existing USTC (5M) + fees remain
        let treasury_ustc = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_USTC)
            .unwrap()
            .amount;
        // wrap fee 2_500 + unwrap fee 2_487 = 4_987 profit on top of 5M
        assert_eq!(treasury_ustc, Uint128::new(5_004_987));
    }

    #[test]
    fn test_preexisting_funds_multi_user_wrap_unwrap() {
        let mut env = setup_env_with_preexisting_funds();

        // USER wraps 1M LUNC -> 995_000 CW20
        // USER2 wraps 2M LUNC -> 1_990_000 CW20
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, DENOM_LUNC)],
            )
            .unwrap();
        env.app
            .execute_contract(
                Addr::unchecked(USER2),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(2_000_000u128, DENOM_LUNC)],
            )
            .unwrap();

        let user_cw20 = query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER);
        let user2_cw20 = query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER2);
        assert_eq!(user_cw20, Uint128::new(995_000));
        assert_eq!(user2_cw20, Uint128::new(1_990_000));

        // Treasury has 3M pre-existing + 3M wrapped = 6M LUNC
        let treasury_lunc = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_LUNC)
            .unwrap()
            .amount;
        assert_eq!(treasury_lunc, Uint128::new(6_000_000));

        // Both unwrap all their CW20
        let hook_msg = crate::msg::Cw20HookMsg::Unwrap { recipient: None };
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_lunc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: user_cw20,
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();
        env.app
            .execute_contract(
                Addr::unchecked(USER2),
                env.cw20_lunc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: user2_cw20,
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();

        // Pre-existing 3M + all fees remain in treasury
        let treasury_lunc = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_LUNC)
            .unwrap()
            .amount;
        // Wrap fees: 5_000 + 10_000 = 15_000
        // Unwrap fees: 995_000*50/10000 = 4_975, 1_990_000*50/10000 = 9_950 -> 14_925
        // Total fees: 29_925
        assert_eq!(treasury_lunc, Uint128::new(3_029_925));

        // CW20 supply is zero
        assert_eq!(
            query_cw20_supply(&env.app, &env.cw20_lunc_addr),
            Uint128::zero(),
        );
    }

    #[test]
    fn test_preexisting_funds_invariant_across_operations() {
        let mut env = setup_env_with_preexisting_funds();

        let preexisting_ustc = Uint128::new(5_000_000);
        let preexisting_lunc = Uint128::new(3_000_000);

        // USER wraps 2M USTC -> 1_990_000 CW20 (fee: 10_000)
        // USER2 wraps 1M USTC -> 995_000 CW20 (fee: 5_000)
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(2_000_000u128, DENOM_USTC)],
            )
            .unwrap();
        env.app
            .execute_contract(
                Addr::unchecked(USER2),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, DENOM_USTC)],
            )
            .unwrap();

        // Partial unwrap by USER: 500_000 CW20, fee = 2_500
        let hook_msg = crate::msg::Cw20HookMsg::Unwrap { recipient: None };
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_ustc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: Uint128::new(500_000),
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();

        // With fees, treasury > preexisting + cw20_supply
        let treasury_ustc = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_USTC)
            .unwrap()
            .amount;
        let cw20_supply = query_cw20_supply(&env.app, &env.cw20_ustc_addr);

        // CW20 supply: 1_990_000 + 995_000 - 500_000 = 2_485_000
        assert_eq!(cw20_supply, Uint128::new(2_485_000));
        // Treasury: 5M + 3M deposited - 497_500 withdrawn = 7_502_500
        assert_eq!(treasury_ustc, Uint128::new(7_502_500));
        // Accumulated fees: 10_000 + 5_000 + 2_500 = 17_500
        assert_eq!(
            treasury_ustc - preexisting_ustc - cw20_supply,
            Uint128::new(17_500),
        );

        // LUNC pre-existing funds untouched
        let treasury_lunc = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_LUNC)
            .unwrap()
            .amount;
        assert_eq!(treasury_lunc, preexisting_lunc);
    }

    // ============ B: ADDITIONAL INTEGRATION TESTS ============

    #[test]
    fn test_unwrap_custom_recipient_e2e() {
        let mut env = setup_full_env();

        // Wrap 1M LUNC -> 995_000 CW20
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, DENOM_LUNC)],
            )
            .unwrap();

        let user2_native_before = env.app.wrap().query_balance(USER2, DENOM_LUNC).unwrap().amount;

        // Unwrap to USER2
        let hook_msg = crate::msg::Cw20HookMsg::Unwrap {
            recipient: Some(USER2.to_string()),
        };
        let cw20_balance = query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER);
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_lunc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: cw20_balance,
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();

        // USER has no CW20 left
        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER),
            Uint128::zero(),
        );

        // USER2 received the native tokens (995_000 - 0.5% unwrap fee = 990_025)
        let user2_native_after = env.app.wrap().query_balance(USER2, DENOM_LUNC).unwrap().amount;
        assert_eq!(user2_native_after - user2_native_before, Uint128::new(990_025));
    }

    #[test]
    fn test_fee_change_mid_session() {
        let mut env = setup_full_env();

        // Wrap 1M at 50 bps -> 995_000 CW20 (fee = 5_000)
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, DENOM_LUNC)],
            )
            .unwrap();

        let cw20_after_wrap = query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER);
        assert_eq!(cw20_after_wrap, Uint128::new(995_000));

        // Governance changes fee to 100 bps (1%)
        env.app
            .execute_contract(
                Addr::unchecked(GOVERNANCE),
                env.wrapper_addr.clone(),
                &crate::msg::ExecuteMsg::SetFeeBps { fee_bps: 100 },
                &[],
            )
            .unwrap();

        // Unwrap all at new fee: 995_000 * 100/10000 = 9_950 fee, withdraw = 985_050
        let hook_msg = crate::msg::Cw20HookMsg::Unwrap { recipient: None };
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_lunc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: cw20_after_wrap,
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();

        // User started with 10M, deposited 1M, got back 985_050
        let user_native = env.app.wrap().query_balance(USER, DENOM_LUNC).unwrap().amount;
        assert_eq!(
            user_native,
            Uint128::new(10_000_000 - 1_000_000 + 985_050),
        );

        // Treasury retains wrap fee (5_000) + unwrap fee (9_950) = 14_950
        let treasury_balance = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_LUNC)
            .unwrap()
            .amount;
        assert_eq!(treasury_balance, Uint128::new(14_950));
    }

    #[test]
    fn test_remove_wrapper_blocks_unwrap_reregister_restores() {
        let mut env = setup_full_env();

        // Wrap 1M LUNC
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, DENOM_LUNC)],
            )
            .unwrap();

        let cw20_balance = query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER);
        assert_eq!(cw20_balance, Uint128::new(995_000));

        // Remove the treasury's denom wrapper
        env.app
            .execute_contract(
                Addr::unchecked(GOVERNANCE),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::RemoveDenomWrapper {
                    denom: DENOM_LUNC.to_string(),
                },
                &[],
            )
            .unwrap();

        // Unwrap should fail
        let hook_msg = crate::msg::Cw20HookMsg::Unwrap { recipient: None };
        let err = env
            .app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_lunc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: cw20_balance,
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap_err();
        assert!(err.root_cause().to_string().contains("registered wrapper"));

        // CW20 balance unchanged (tx reverted)
        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER),
            cw20_balance,
        );

        // Re-register the wrapper
        env.app
            .execute_contract(
                Addr::unchecked(GOVERNANCE),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::SetDenomWrapper {
                    denom: DENOM_LUNC.to_string(),
                    wrapper: env.wrapper_addr.to_string(),
                },
                &[],
            )
            .unwrap();

        // Unwrap should succeed now
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_lunc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: cw20_balance,
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();

        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER),
            Uint128::zero(),
        );
    }

    #[test]
    fn test_rate_limit_window_boundary_burst_e2e() {
        let mut env = setup_full_env();

        // Set tight rate limit: 1M per 3600s
        env.app
            .execute_contract(
                Addr::unchecked(GOVERNANCE),
                env.wrapper_addr.clone(),
                &crate::msg::ExecuteMsg::SetRateLimit {
                    denom: DENOM_LUNC.to_string(),
                    config: crate::state::RateLimitConfig {
                        max_amount_per_window: Uint128::new(1_000_000),
                        window_seconds: 3600,
                    },
                },
                &[],
            )
            .unwrap();

        // Fill the entire window
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, DENOM_LUNC)],
            )
            .unwrap();

        // Can't wrap more in same window
        let err = env
            .app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1u128, DENOM_LUNC)],
            )
            .unwrap_err();
        assert!(err.root_cause().to_string().contains("Rate limit exceeded"));

        // Advance past window
        env.app.update_block(|b| {
            b.height += 600;
            b.time = b.time.plus_seconds(3600);
        });

        // Full limit available again
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, DENOM_LUNC)],
            )
            .unwrap();
    }

    #[test]
    fn test_multi_user_interleaved_wrap_unwrap() {
        let mut env = setup_full_env();

        // USER wraps 2M, USER2 wraps 1M
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(2_000_000u128, DENOM_LUNC)],
            )
            .unwrap();
        env.app
            .execute_contract(
                Addr::unchecked(USER2),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, DENOM_LUNC)],
            )
            .unwrap();

        let user_cw20 = query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER);
        let user2_cw20 = query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER2);
        assert_eq!(user_cw20, Uint128::new(1_990_000));
        assert_eq!(user2_cw20, Uint128::new(995_000));

        let hook_msg = crate::msg::Cw20HookMsg::Unwrap { recipient: None };

        // USER unwraps partial (500k CW20)
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_lunc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: Uint128::new(500_000),
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();

        // USER2 unwraps all
        env.app
            .execute_contract(
                Addr::unchecked(USER2),
                env.cw20_lunc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: user2_cw20,
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();

        // CW20 supply = USER's remaining balance
        let remaining_user_cw20 = query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER);
        assert_eq!(remaining_user_cw20, Uint128::new(1_490_000));
        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER2),
            Uint128::zero(),
        );

        let supply = query_cw20_supply(&env.app, &env.cw20_lunc_addr);
        assert_eq!(supply, remaining_user_cw20);

        // Treasury balance > CW20 supply (fee profit)
        let treasury_balance = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_LUNC)
            .unwrap()
            .amount;
        assert!(treasury_balance > supply);
    }

    #[test]
    fn test_wrap_one_unit() {
        let mut env = setup_full_env();

        // Wrap exactly 1 unit -- fee should be 0 (1 * 50 / 10000 = 0)
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1u128, DENOM_LUNC)],
            )
            .unwrap();

        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER),
            Uint128::new(1),
        );

        let treasury_balance = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_LUNC)
            .unwrap()
            .amount;
        assert_eq!(treasury_balance, Uint128::new(1));
    }

    #[test]
    fn test_unwrap_one_unit() {
        let mut env = setup_full_env();

        // Wrap 1 unit to get 1 CW20
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1u128, DENOM_LUNC)],
            )
            .unwrap();

        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER),
            Uint128::new(1),
        );

        // Unwrap 1 CW20 -- fee = 0 (1 * 50 / 10000 = 0), withdraw = 1
        let hook_msg = crate::msg::Cw20HookMsg::Unwrap { recipient: None };
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_lunc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: Uint128::new(1),
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap();

        assert_eq!(
            query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER),
            Uint128::zero(),
        );

        // Treasury should be empty (1 deposited, 1 withdrawn, 0 fee)
        let treasury_balance = env
            .app
            .wrap()
            .query_balance(&env.treasury_addr, DENOM_LUNC)
            .unwrap()
            .amount;
        assert_eq!(treasury_balance, Uint128::zero());
    }

    // ============ T-2: DENOM MAPPING CHANGE WITH OUTSTANDING CW20 ============

    #[test]
    fn test_mapping_change_strands_old_cw20_holders() {
        let mut env = setup_full_env();

        // User wraps 1M LUNC -> gets CW20 LUNC-C
        let wrap_amount = Uint128::new(1_000_000);
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(wrap_amount.u128(), DENOM_LUNC)],
            )
            .unwrap();

        let cw20_balance = query_cw20_balance(&env.app, &env.cw20_lunc_addr, USER);
        assert!(cw20_balance > Uint128::zero());

        // Deploy a new CW20 token for the replacement mapping
        let cw20_code = env.app.store_code(cw20_contract());
        let new_cw20_addr = env
            .app
            .instantiate_contract(
                cw20_code,
                Addr::unchecked(GOVERNANCE),
                &cw20_mintable::msg::InstantiateMsg {
                    name: "LUNC-C-V2".to_string(),
                    symbol: "LUNC-C2".to_string(),
                    decimals: 6,
                    initial_balances: vec![],
                    mint: Some(MinterResponse {
                        minter: GOVERNANCE.to_string(),
                        cap: None,
                    }),
                    marketing: None,
                },
                &[],
                "cw20-lunc-c-v2",
                None,
            )
            .unwrap();

        // Add wrap-mapper as minter on new token
        env.app
            .execute_contract(
                Addr::unchecked(GOVERNANCE),
                new_cw20_addr.clone(),
                &cw20_mintable::msg::ExecuteMsg::AddMinter {
                    minter: env.wrapper_addr.to_string(),
                },
                &[],
            )
            .unwrap();

        // Governance changes the mapping: uluna -> new_cw20
        env.app
            .execute_contract(
                Addr::unchecked(GOVERNANCE),
                env.wrapper_addr.clone(),
                &crate::msg::ExecuteMsg::SetDenomMapping {
                    denom: DENOM_LUNC.to_string(),
                    cw20_addr: new_cw20_addr.to_string(),
                },
                &[],
            )
            .unwrap();

        // Old CW20 holders cannot unwrap -- the reverse mapping for old CW20 is gone
        let hook_msg = crate::msg::Cw20HookMsg::Unwrap { recipient: None };
        let err = env
            .app
            .execute_contract(
                Addr::unchecked(USER),
                env.cw20_lunc_addr.clone(),
                &Cw20ExecuteMsg::Send {
                    contract: env.wrapper_addr.to_string(),
                    amount: cw20_balance,
                    msg: cosmwasm_std::to_json_binary(&hook_msg).unwrap(),
                },
                &[],
            )
            .unwrap_err();
        assert!(err.root_cause().to_string().contains("No denom mapping"));
    }

    #[test]
    fn test_mapping_change_new_token_works() {
        let mut env = setup_full_env();

        // Deploy a new CW20 token
        let cw20_code = env.app.store_code(cw20_contract());
        let new_cw20_addr = env
            .app
            .instantiate_contract(
                cw20_code,
                Addr::unchecked(GOVERNANCE),
                &cw20_mintable::msg::InstantiateMsg {
                    name: "LUNC-C-V2".to_string(),
                    symbol: "LUNC-C2".to_string(),
                    decimals: 6,
                    initial_balances: vec![],
                    mint: Some(MinterResponse {
                        minter: GOVERNANCE.to_string(),
                        cap: None,
                    }),
                    marketing: None,
                },
                &[],
                "cw20-lunc-c-v2",
                None,
            )
            .unwrap();

        env.app
            .execute_contract(
                Addr::unchecked(GOVERNANCE),
                new_cw20_addr.clone(),
                &cw20_mintable::msg::ExecuteMsg::AddMinter {
                    minter: env.wrapper_addr.to_string(),
                },
                &[],
            )
            .unwrap();

        // Change mapping
        env.app
            .execute_contract(
                Addr::unchecked(GOVERNANCE),
                env.wrapper_addr.clone(),
                &crate::msg::ExecuteMsg::SetDenomMapping {
                    denom: DENOM_LUNC.to_string(),
                    cw20_addr: new_cw20_addr.to_string(),
                },
                &[],
            )
            .unwrap();

        // Wrapping via the new token works
        let wrap_amount = Uint128::new(1_000_000);
        env.app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(wrap_amount.u128(), DENOM_LUNC)],
            )
            .unwrap();

        let new_balance = query_cw20_balance(&env.app, &new_cw20_addr, USER);
        assert!(new_balance > Uint128::zero());
    }

    // ============ T-3: MINTER ROLE REVOKED ============

    #[test]
    fn test_wrap_fails_after_minter_revoked() {
        let mut env = setup_full_env();

        // Revoke wrap-mapper's minter role on LUNC-C CW20
        env.app
            .execute_contract(
                Addr::unchecked(GOVERNANCE),
                env.cw20_lunc_addr.clone(),
                &cw20_mintable::msg::ExecuteMsg::RemoveMinter {
                    minter: env.wrapper_addr.to_string(),
                },
                &[],
            )
            .unwrap();

        // Wrapping should fail because wrap-mapper can no longer mint
        let err = env
            .app
            .execute_contract(
                Addr::unchecked(USER),
                env.treasury_addr.clone(),
                &treasury::msg::ExecuteMsg::WrapDeposit {},
                &[Coin::new(1_000_000u128, DENOM_LUNC)],
            )
            .unwrap_err();

        // The error comes from the CW20 contract rejecting the mint
        assert!(err.root_cause().to_string().to_lowercase().contains("unauthorized")
            || err.root_cause().to_string().to_lowercase().contains("minter"));
    }

    #[test]
    fn test_set_denom_mapping_rejects_non_minter() {
        let mut env = setup_full_env();

        // Deploy a CW20 where wrap-mapper is NOT a minter
        let cw20_code = env.app.store_code(cw20_contract());
        let foreign_cw20 = env
            .app
            .instantiate_contract(
                cw20_code,
                Addr::unchecked(GOVERNANCE),
                &cw20_mintable::msg::InstantiateMsg {
                    name: "FOREIGN".to_string(),
                    symbol: "FRN".to_string(),
                    decimals: 6,
                    initial_balances: vec![],
                    mint: Some(MinterResponse {
                        minter: GOVERNANCE.to_string(),
                        cap: None,
                    }),
                    marketing: None,
                },
                &[],
                "cw20-foreign",
                None,
            )
            .unwrap();

        // SetDenomMapping should fail because wrap-mapper is not a minter
        let err = env
            .app
            .execute_contract(
                Addr::unchecked(GOVERNANCE),
                env.wrapper_addr.clone(),
                &crate::msg::ExecuteMsg::SetDenomMapping {
                    denom: "uforeign".to_string(),
                    cw20_addr: foreign_cw20.to_string(),
                },
                &[],
            )
            .unwrap_err();

        assert!(err.root_cause().to_string().contains("not a minter"));
    }
}
