//! USTC Swap contract implementation

#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{
    to_json_binary, BankMsg, Binary, Coin, CosmosMsg, Decimal, Deps, DepsMut, Env, MessageInfo,
    Response, StdResult, Timestamp, Uint128, WasmMsg,
};
use cw2::set_contract_version;
use cw20::Cw20ExecuteMsg;

use crate::error::ContractError;
use crate::msg::{
    ConfigResponse, ExecuteMsg, InstantiateMsg, PendingAdminResponse, QueryMsg, RateResponse,
    SimulationResponse, StatsResponse, StatusResponse,
};
use crate::state::{
    Config, PendingAdmin, Stats, ADMIN_TIMELOCK_DURATION, CONFIG, CONTRACT_NAME, CONTRACT_VERSION,
    MIN_SWAP_AMOUNT, PENDING_ADMIN, STATS, USTC_DENOM,
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

    let ustr_token = deps.api.addr_validate(&msg.ustr_token)?;
    let treasury = deps.api.addr_validate(&msg.treasury)?;
    let admin = deps.api.addr_validate(&msg.admin)?;

    let start_time = Timestamp::from_seconds(msg.start_time);
    let end_time = Timestamp::from_seconds(msg.start_time + msg.duration_seconds);

    let config = Config {
        ustr_token: ustr_token.clone(),
        treasury: treasury.clone(),
        start_time,
        end_time,
        start_rate: msg.start_rate,
        end_rate: msg.end_rate,
        admin: admin.clone(),
        paused: false,
    };

    let stats = Stats {
        total_ustc_received: Uint128::zero(),
        total_ustr_minted: Uint128::zero(),
    };

    CONFIG.save(deps.storage, &config)?;
    STATS.save(deps.storage, &stats)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("ustr_token", ustr_token)
        .add_attribute("treasury", treasury)
        .add_attribute("admin", admin)
        .add_attribute("start_time", start_time.to_string())
        .add_attribute("end_time", end_time.to_string()))
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
        ExecuteMsg::Swap {} => execute_swap(deps, env, info),
        ExecuteMsg::EmergencyPause {} => execute_emergency_pause(deps, info),
        ExecuteMsg::EmergencyResume {} => execute_emergency_resume(deps, info),
        ExecuteMsg::ProposeAdmin { new_admin } => execute_propose_admin(deps, env, info, new_admin),
        ExecuteMsg::AcceptAdmin {} => execute_accept_admin(deps, env, info),
        ExecuteMsg::CancelAdminProposal {} => execute_cancel_admin_proposal(deps, info),
        ExecuteMsg::RecoverAsset {
            asset,
            amount,
            recipient,
        } => execute_recover_asset(deps, env, info, asset, amount, recipient),
    }
}

fn execute_swap(deps: DepsMut, env: Env, info: MessageInfo) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Check if paused
    if config.paused {
        return Err(ContractError::SwapPaused);
    }

    // Check if swap period has started
    if env.block.time < config.start_time {
        return Err(ContractError::SwapNotStarted);
    }

    // Check if swap period has ended
    if env.block.time >= config.end_time {
        return Err(ContractError::SwapEnded);
    }

    // Validate funds - must be exactly USTC
    if info.funds.is_empty() {
        return Err(ContractError::NoFundsSent);
    }

    if info.funds.len() != 1 || info.funds[0].denom != USTC_DENOM {
        return Err(ContractError::InvalidFunds);
    }

    let ustc_amount = info.funds[0].amount;

    // Check minimum amount
    if ustc_amount < Uint128::from(MIN_SWAP_AMOUNT) {
        return Err(ContractError::BelowMinimumSwap);
    }

    // Calculate current rate
    let rate = calculate_current_rate(&config, env.block.time);

    // Calculate USTR amount: ustr_amount = floor(ustc_amount / current_rate)
    // Using Decimal for precision
    let ustc_decimal = Decimal::from_ratio(ustc_amount, 1u128);
    let ustr_decimal = ustc_decimal / rate;
    let ustr_amount = ustr_decimal * Uint128::one();

    // Update stats
    let mut stats = STATS.load(deps.storage)?;
    stats.total_ustc_received += ustc_amount;
    stats.total_ustr_minted += ustr_amount;
    STATS.save(deps.storage, &stats)?;

    // Transfer USTC to treasury
    let send_to_treasury = BankMsg::Send {
        to_address: config.treasury.to_string(),
        amount: vec![Coin {
            denom: USTC_DENOM.to_string(),
            amount: ustc_amount,
        }],
    };

    // Mint USTR to user
    let mint_ustr = WasmMsg::Execute {
        contract_addr: config.ustr_token.to_string(),
        msg: to_json_binary(&Cw20ExecuteMsg::Mint {
            recipient: info.sender.to_string(),
            amount: ustr_amount,
        })?,
        funds: vec![],
    };

    Ok(Response::new()
        .add_message(send_to_treasury)
        .add_message(mint_ustr)
        .add_attribute("action", "swap")
        .add_attribute("sender", info.sender)
        .add_attribute("ustc_amount", ustc_amount)
        .add_attribute("ustr_amount", ustr_amount)
        .add_attribute("rate", rate.to_string()))
}

fn execute_emergency_pause(deps: DepsMut, info: MessageInfo) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;

    if info.sender != config.admin {
        return Err(ContractError::Unauthorized);
    }

    config.paused = true;
    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("action", "emergency_pause")
        .add_attribute("admin", info.sender))
}

fn execute_emergency_resume(deps: DepsMut, info: MessageInfo) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;

    if info.sender != config.admin {
        return Err(ContractError::Unauthorized);
    }

    config.paused = false;
    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("action", "emergency_resume")
        .add_attribute("admin", info.sender))
}

fn execute_propose_admin(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    new_admin: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    if info.sender != config.admin {
        return Err(ContractError::Unauthorized);
    }

    let new_address = deps.api.addr_validate(&new_admin)?;

    let pending = PendingAdmin {
        new_address: new_address.clone(),
        execute_after: env.block.time.plus_seconds(ADMIN_TIMELOCK_DURATION),
    };

    PENDING_ADMIN.save(deps.storage, &pending)?;

    Ok(Response::new()
        .add_attribute("action", "propose_admin")
        .add_attribute("new_admin", new_address)
        .add_attribute("execute_after", pending.execute_after.to_string()))
}

fn execute_accept_admin(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
) -> Result<Response, ContractError> {
    let pending = PENDING_ADMIN
        .may_load(deps.storage)?
        .ok_or(ContractError::NoPendingAdmin)?;

    if info.sender != pending.new_address {
        return Err(ContractError::UnauthorizedPendingAdmin);
    }

    if env.block.time < pending.execute_after {
        let remaining = pending.execute_after.seconds() - env.block.time.seconds();
        return Err(ContractError::TimelockNotExpired {
            remaining_seconds: remaining,
        });
    }

    let mut config = CONFIG.load(deps.storage)?;
    let old_admin = config.admin.clone();
    config.admin = pending.new_address.clone();
    CONFIG.save(deps.storage, &config)?;

    PENDING_ADMIN.remove(deps.storage);

    Ok(Response::new()
        .add_attribute("action", "accept_admin")
        .add_attribute("old_admin", old_admin)
        .add_attribute("new_admin", config.admin))
}

fn execute_cancel_admin_proposal(
    deps: DepsMut,
    info: MessageInfo,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    if info.sender != config.admin {
        return Err(ContractError::Unauthorized);
    }

    let pending = PENDING_ADMIN
        .may_load(deps.storage)?
        .ok_or(ContractError::NoPendingAdmin)?;

    PENDING_ADMIN.remove(deps.storage);

    Ok(Response::new()
        .add_attribute("action", "cancel_admin_proposal")
        .add_attribute("cancelled_address", pending.new_address))
}

fn execute_recover_asset(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    asset: AssetInfo,
    amount: Uint128,
    recipient: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    if info.sender != config.admin {
        return Err(ContractError::Unauthorized);
    }

    // Only available after swap period ends
    if env.block.time < config.end_time {
        return Err(ContractError::RecoveryNotAvailable);
    }

    let recipient_addr = deps.api.addr_validate(&recipient)?;

    let msg: CosmosMsg = match &asset {
        AssetInfo::Native { denom } => BankMsg::Send {
            to_address: recipient_addr.to_string(),
            amount: vec![Coin {
                denom: denom.clone(),
                amount,
            }],
        }
        .into(),
        AssetInfo::Cw20 { contract_addr } => WasmMsg::Execute {
            contract_addr: contract_addr.to_string(),
            msg: to_json_binary(&Cw20ExecuteMsg::Transfer {
                recipient: recipient_addr.to_string(),
                amount,
            })?,
            funds: vec![],
        }
        .into(),
    };

    Ok(Response::new()
        .add_message(msg)
        .add_attribute("action", "recover_asset")
        .add_attribute("recipient", recipient_addr)
        .add_attribute("amount", amount))
}

// ============ HELPERS ============

/// Calculate the current exchange rate based on elapsed time
fn calculate_current_rate(config: &Config, current_time: Timestamp) -> Decimal {
    let total_seconds = config.end_time.seconds() - config.start_time.seconds();
    let elapsed_seconds = current_time.seconds().saturating_sub(config.start_time.seconds());

    // Clamp elapsed to total (shouldn't happen if called correctly, but be safe)
    let elapsed_seconds = elapsed_seconds.min(total_seconds);

    // rate(t) = start_rate + ((end_rate - start_rate) * elapsed_seconds / total_seconds)
    let rate_diff = config.end_rate - config.start_rate;
    let progress = Decimal::from_ratio(elapsed_seconds, total_seconds);
    
    config.start_rate + rate_diff * progress
}

// ============ QUERY ============

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&query_config(deps)?),
        QueryMsg::CurrentRate {} => to_json_binary(&query_current_rate(deps, env)?),
        QueryMsg::SwapSimulation { ustc_amount } => {
            to_json_binary(&query_swap_simulation(deps, env, ustc_amount)?)
        }
        QueryMsg::Status {} => to_json_binary(&query_status(deps, env)?),
        QueryMsg::Stats {} => to_json_binary(&query_stats(deps)?),
        QueryMsg::PendingAdmin {} => to_json_binary(&query_pending_admin(deps)?),
    }
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        ustr_token: config.ustr_token,
        treasury: config.treasury,
        start_time: config.start_time,
        end_time: config.end_time,
        start_rate: config.start_rate,
        end_rate: config.end_rate,
        admin: config.admin,
        paused: config.paused,
    })
}

fn query_current_rate(deps: Deps, env: Env) -> StdResult<RateResponse> {
    let config = CONFIG.load(deps.storage)?;
    let total_seconds = config.end_time.seconds() - config.start_time.seconds();
    let elapsed_seconds = env
        .block
        .time
        .seconds()
        .saturating_sub(config.start_time.seconds())
        .min(total_seconds);

    let rate = calculate_current_rate(&config, env.block.time);

    Ok(RateResponse {
        rate,
        elapsed_seconds,
        total_seconds,
    })
}

fn query_swap_simulation(deps: Deps, env: Env, ustc_amount: Uint128) -> StdResult<SimulationResponse> {
    let config = CONFIG.load(deps.storage)?;
    let rate = calculate_current_rate(&config, env.block.time);

    let ustc_decimal = Decimal::from_ratio(ustc_amount, 1u128);
    let ustr_decimal = ustc_decimal / rate;
    let ustr_amount = ustr_decimal * Uint128::one();

    Ok(SimulationResponse {
        ustc_amount,
        ustr_amount,
        rate,
    })
}

fn query_status(deps: Deps, env: Env) -> StdResult<StatusResponse> {
    let config = CONFIG.load(deps.storage)?;

    let has_started = env.block.time >= config.start_time;
    let has_ended = env.block.time >= config.end_time;
    let is_active = has_started && !has_ended && !config.paused;

    let seconds_remaining = if has_ended {
        0
    } else {
        config.end_time.seconds() - env.block.time.seconds()
    };

    let seconds_until_start = if has_started {
        0
    } else {
        config.start_time.seconds() - env.block.time.seconds()
    };

    Ok(StatusResponse {
        is_active,
        has_started,
        has_ended,
        is_paused: config.paused,
        seconds_remaining,
        seconds_until_start,
    })
}

fn query_stats(deps: Deps) -> StdResult<StatsResponse> {
    let stats = STATS.load(deps.storage)?;
    Ok(StatsResponse {
        total_ustc_received: stats.total_ustc_received,
        total_ustr_minted: stats.total_ustr_minted,
    })
}

fn query_pending_admin(deps: Deps) -> StdResult<Option<PendingAdminResponse>> {
    let pending = PENDING_ADMIN.may_load(deps.storage)?;
    Ok(pending.map(|p| PendingAdminResponse {
        new_address: p.new_address,
        execute_after: p.execute_after,
    }))
}

// ============ TESTS ============

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{coins, Decimal};

    const ADMIN: &str = "admin_addr";
    const USTR_TOKEN: &str = "ustr_token_addr";
    const TREASURY: &str = "treasury_addr";

    fn setup_contract(deps: DepsMut, start_time: u64) {
        let msg = InstantiateMsg {
            ustr_token: USTR_TOKEN.to_string(),
            treasury: TREASURY.to_string(),
            start_time,
            start_rate: Decimal::from_ratio(15u128, 10u128), // 1.5
            end_rate: Decimal::from_ratio(25u128, 10u128),   // 2.5
            duration_seconds: 8_640_000,                      // 100 days
            admin: ADMIN.to_string(),
        };
        let info = mock_info("creator", &[]);
        instantiate(deps, mock_env(), info, msg).unwrap();
    }

    #[test]
    fn test_instantiate() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.ustr_token.as_str(), USTR_TOKEN);
        assert_eq!(config.treasury.as_str(), TREASURY);
        assert_eq!(config.admin.as_str(), ADMIN);
        assert!(!config.paused);
    }

    #[test]
    fn test_swap_before_start() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        // Set start time in the future
        setup_contract(deps.as_mut(), env.block.time.seconds() + 1000);

        let info = mock_info("user", &coins(1_000_000, USTC_DENOM));
        let msg = ExecuteMsg::Swap {};

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::SwapNotStarted);
    }

    #[test]
    fn test_swap_after_end() {
        let mut deps = mock_dependencies();
        let mut env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Advance time past end
        env.block.time = Timestamp::from_seconds(env.block.time.seconds() + 8_640_001);

        let info = mock_info("user", &coins(1_000_000, USTC_DENOM));
        let msg = ExecuteMsg::Swap {};

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::SwapEnded);
    }

    #[test]
    fn test_swap_below_minimum() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let info = mock_info("user", &coins(999_999, USTC_DENOM)); // Below 1 USTC
        let msg = ExecuteMsg::Swap {};

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::BelowMinimumSwap);
    }

    #[test]
    fn test_swap_wrong_denom() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let info = mock_info("user", &coins(1_000_000, "uluna")); // Wrong denom
        let msg = ExecuteMsg::Swap {};

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::InvalidFunds);
    }

    #[test]
    fn test_emergency_pause_resume() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Pause
        let info = mock_info(ADMIN, &[]);
        let msg = ExecuteMsg::EmergencyPause {};
        execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        let config = CONFIG.load(&deps.storage).unwrap();
        assert!(config.paused);

        // Try to swap while paused
        let info = mock_info("user", &coins(1_000_000, USTC_DENOM));
        let msg = ExecuteMsg::Swap {};
        let err = execute(deps.as_mut(), env.clone(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::SwapPaused);

        // Resume
        let info = mock_info(ADMIN, &[]);
        let msg = ExecuteMsg::EmergencyResume {};
        execute(deps.as_mut(), env, info, msg).unwrap();

        let config = CONFIG.load(&deps.storage).unwrap();
        assert!(!config.paused);
    }

    #[test]
    fn test_rate_calculation() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let start_time = env.block.time.seconds();
        setup_contract(deps.as_mut(), start_time);

        let config = CONFIG.load(&deps.storage).unwrap();

        // At start
        let rate = calculate_current_rate(&config, Timestamp::from_seconds(start_time));
        assert_eq!(rate, Decimal::from_ratio(15u128, 10u128)); // 1.5

        // At 50% (day 50)
        let rate = calculate_current_rate(
            &config,
            Timestamp::from_seconds(start_time + 4_320_000), // 50 days
        );
        assert_eq!(rate, Decimal::from_ratio(20u128, 10u128)); // 2.0

        // At end
        let rate = calculate_current_rate(
            &config,
            Timestamp::from_seconds(start_time + 8_640_000), // 100 days
        );
        assert_eq!(rate, Decimal::from_ratio(25u128, 10u128)); // 2.5
    }
}

