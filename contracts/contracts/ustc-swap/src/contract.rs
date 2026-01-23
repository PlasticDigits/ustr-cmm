//! USTC Swap contract implementation

#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{
    to_json_binary, BankMsg, Binary, Coin, CosmosMsg, Decimal, Deps, DepsMut, Env, MessageInfo,
    QueryRequest, Response, StdError, StdResult, Timestamp, Uint128, WasmMsg, WasmQuery,
};
use cw2::{get_contract_version, set_contract_version};
use cw20::{Cw20ExecuteMsg, Cw20QueryMsg, TokenInfoResponse};

use crate::error::ContractError;
use crate::msg::{
    ConfigResponse, ExecuteMsg, InstantiateMsg, LeaderboardEntry, MigrateMsg, PendingAdminResponse,
    QueryMsg, RateResponse, ReferralCodeStatsResponse, ReferralLeaderboardResponse,
    SimulationResponse, StatsResponse, StatusResponse,
};
use crate::state::{
    Config, LeaderboardLink, PendingAdmin, ReferralCodeStats, Stats, ADMIN_TIMELOCK_DURATION,
    CONFIG, CONTRACT_NAME, CONTRACT_VERSION, DECIMAL_ADJUSTMENT, DEFAULT_LEADERBOARD_LIMIT,
    DEFAULT_SWAP_DURATION, LEADERBOARD_HEAD, LEADERBOARD_LINKS, LEADERBOARD_SIZE, LEADERBOARD_TAIL,
    MAX_LEADERBOARD_LIMIT, MAX_LEADERBOARD_SIZE, MIN_SWAP_AMOUNT, MINT_SAFETY_LIMIT_DENOMINATOR,
    MINT_SAFETY_LIMIT_NUMERATOR, PENDING_ADMIN, REFERRAL_BONUS_DENOMINATOR, REFERRAL_BONUS_NUMERATOR,
    REFERRAL_CODE_STATS, STATS, USTC_DENOM,
};
use common::AssetInfo;

/// Query message for the referral contract
#[cosmwasm_schema::cw_serde]
pub enum ReferralQueryMsg {
    ValidateCode { code: String },
}

/// Response from referral contract ValidateCode query
#[cosmwasm_schema::cw_serde]
pub struct ReferralValidateResponse {
    pub is_valid_format: bool,
    pub is_registered: bool,
    pub owner: Option<cosmwasm_std::Addr>,
}

/// Information about leaderboard changes for event emission
#[derive(Debug, Clone, PartialEq)]
pub struct LeaderboardChange {
    /// The action that occurred
    pub action: LeaderboardAction,
    /// The new position in the leaderboard (1-indexed), if code is in leaderboard
    pub position: Option<u32>,
}

/// Type of leaderboard change that occurred
#[derive(Debug, Clone, PartialEq)]
pub enum LeaderboardAction {
    /// Code was added to the leaderboard for the first time
    NewEntry,
    /// Code moved to a higher position in the leaderboard
    PositionUp,
    /// Code stayed in the same position (rewards increased but didn't pass prev)
    NoChange,
}

/// Expected USTR decimals (18 decimals like most ERC20-style tokens)
const EXPECTED_USTR_DECIMALS: u8 = 18;

/// Expected USTC decimals (6 decimals for Terra Classic native tokens)
/// Note: Native token decimals cannot be queried on-chain; this is a protocol constant.
/// USTC (uusd) on Terra Classic uses 6 decimals (1 USTC = 1,000,000 uusd).
#[allow(dead_code)]
const EXPECTED_USTC_DECIMALS: u8 = 6;

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
    let referral = deps.api.addr_validate(&msg.referral)?;
    let admin = deps.api.addr_validate(&msg.admin)?;

    // Validate USTR token decimals at deployment time
    // The contract's decimal adjustment assumes USTR has 18 decimals and USTC has 6 decimals
    // USTC decimals (6) are a Terra Classic protocol constant and cannot be queried on-chain
    let ustr_token_info: TokenInfoResponse = deps.querier.query(&QueryRequest::Wasm(WasmQuery::Smart {
        contract_addr: ustr_token.to_string(),
        msg: to_json_binary(&Cw20QueryMsg::TokenInfo {})?,
    }))?;

    if ustr_token_info.decimals != EXPECTED_USTR_DECIMALS {
        return Err(ContractError::InvalidUstrDecimals {
            expected: EXPECTED_USTR_DECIMALS,
            actual: ustr_token_info.decimals,
        });
    }

    let start_time = Timestamp::from_seconds(msg.start_time);
    let duration = msg.duration_seconds.unwrap_or(DEFAULT_SWAP_DURATION);
    let end_time = Timestamp::from_seconds(msg.start_time + duration);

    let config = Config {
        ustr_token: ustr_token.clone(),
        treasury: treasury.clone(),
        referral: referral.clone(),
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
        total_referral_bonus_minted: Uint128::zero(),
        total_referral_swaps: 0,
        unique_referral_codes_used: 0,
    };

    // Initialize leaderboard state
    LEADERBOARD_HEAD.save(deps.storage, &None)?;
    LEADERBOARD_TAIL.save(deps.storage, &None)?;
    LEADERBOARD_SIZE.save(deps.storage, &0)?;

    CONFIG.save(deps.storage, &config)?;
    STATS.save(deps.storage, &stats)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("ustr_token", ustr_token)
        .add_attribute("treasury", treasury)
        .add_attribute("referral", referral)
        .add_attribute("admin", admin)
        .add_attribute("start_time", start_time.to_string())
        .add_attribute("end_time", end_time.to_string()))
}

// ============ MIGRATE ============

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn migrate(deps: DepsMut, _env: Env, _msg: MigrateMsg) -> Result<Response, ContractError> {
    // Verify we're migrating from the same contract
    let ver = get_contract_version(deps.storage)?;
    if ver.contract != CONTRACT_NAME {
        return Err(ContractError::Std(StdError::generic_err(format!(
            "Cannot migrate from different contract: {} != {}",
            ver.contract, CONTRACT_NAME
        ))));
    }

    // Update contract version
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
        ExecuteMsg::Swap {
            referral_code,
            leaderboard_hint,
        } => execute_swap(deps, env, info, referral_code, leaderboard_hint),
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

/// Handle swap: user sends USTC, contract forwards to Treasury and mints USTR
/// Optional referral code grants +10% to user and +10% to referrer
fn execute_swap(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    referral_code: Option<String>,
    leaderboard_hint: Option<crate::msg::LeaderboardHint>,
) -> Result<Response, ContractError> {
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

    // Validate funds sent
    if info.funds.is_empty() {
        return Err(ContractError::NoFundsSent);
    }
    if info.funds.len() > 1 {
        return Err(ContractError::MultipleDenoms);
    }

    let ustc_coin = &info.funds[0];
    if ustc_coin.denom != USTC_DENOM {
        return Err(ContractError::WrongDenom);
    }

    let ustc_amount = ustc_coin.amount;
    if ustc_amount < Uint128::from(MIN_SWAP_AMOUNT) {
        return Err(ContractError::BelowMinimumSwap);
    }

    // Calculate current rate
    let rate = calculate_current_rate(&config, env.block.time);

    // Calculate base USTR amount with decimal adjustment
    // USTC has 6 decimals, USTR has 18 decimals, so we multiply by 10^12
    // base_ustr = floor((ustc_amount / current_rate) * 10^12)
    //
    // IMPORTANT: We divide first, then multiply by DECIMAL_ADJUSTMENT to avoid overflow.
    // The previous approach (multiply by 10^12 first, then use Decimal::from_ratio)
    // caused overflow because Decimal::from_ratio(n, 1) internally multiplies n by 10^18,
    // and (ustc * 10^12 * 10^18) overflows Uint128 for amounts as small as 340 USTC.
    let ustc_decimal = Decimal::from_ratio(ustc_amount, 1u128);
    let ustr_decimal = ustc_decimal / rate;
    let base_ustr_unscaled = ustr_decimal * Uint128::one();
    let base_ustr = base_ustr_unscaled
        .checked_mul(Uint128::from(DECIMAL_ADJUSTMENT))
        .map_err(|e| ContractError::Std(cosmwasm_std::StdError::generic_err(
            format!("Decimal adjustment overflow: {}", e)
        )))?;

    // Process referral code if provided
    let (user_bonus, referrer_bonus, referrer_addr) = if let Some(ref code) = referral_code {
        if code.is_empty() {
            // Empty code = no referral
            (Uint128::zero(), Uint128::zero(), None)
        } else {
            // Query referral contract to validate code
            let validate_response: ReferralValidateResponse = deps.querier.query(
                &QueryRequest::Wasm(WasmQuery::Smart {
                    contract_addr: config.referral.to_string(),
                    msg: to_json_binary(&ReferralQueryMsg::ValidateCode {
                        code: code.clone(),
                    })?,
                }),
            )?;

            if !validate_response.is_valid_format {
                return Err(ContractError::InvalidReferralCode { code: code.clone() });
            }
            if !validate_response.is_registered {
                return Err(ContractError::ReferralCodeNotRegistered { code: code.clone() });
            }

            // Calculate 10% bonus (numerator / denominator = 10 / 100 = 10%)
            // Use safe arithmetic - these constants are fixed and won't overflow
            let bonus = base_ustr
                .multiply_ratio(REFERRAL_BONUS_NUMERATOR, REFERRAL_BONUS_DENOMINATOR);

            (bonus, bonus, validate_response.owner)
        }
    } else {
        (Uint128::zero(), Uint128::zero(), None)
    };

    let total_ustr_to_user = base_ustr + user_bonus;
    let total_ustr_minted = total_ustr_to_user + referrer_bonus;

    // Safety check: ensure mint amount doesn't exceed 5% of total supply
    // This prevents catastrophic minting bugs from draining value
    let token_info: TokenInfoResponse = deps.querier.query(
        &QueryRequest::Wasm(WasmQuery::Smart {
            contract_addr: config.ustr_token.to_string(),
            msg: to_json_binary(&Cw20QueryMsg::TokenInfo {})?,
        }),
    )?;
    let max_safe_mint = token_info
        .total_supply
        .multiply_ratio(MINT_SAFETY_LIMIT_NUMERATOR, MINT_SAFETY_LIMIT_DENOMINATOR);
    if total_ustr_minted > max_safe_mint {
        return Err(ContractError::MintExceedsSafetyLimit {
            mint_amount: total_ustr_minted.to_string(),
            total_supply: token_info.total_supply.to_string(),
        });
    }

    // Update stats
    let mut stats = STATS.load(deps.storage)?;
    stats.total_ustc_received += ustc_amount;
    stats.total_ustr_minted += total_ustr_minted;
    
    // Track leaderboard changes for event emission
    let mut leaderboard_change: Option<LeaderboardChange> = None;
    
    if referrer_addr.is_some() {
        stats.total_referral_bonus_minted += user_bonus + referrer_bonus;
        stats.total_referral_swaps += 1;

        // Update per-code statistics and leaderboard
        if let Some(ref code) = referral_code {
            let normalized_code = code.to_lowercase();
            
            // Load or create per-code stats
            let (mut code_stats, is_new_code) =
                match REFERRAL_CODE_STATS.may_load(deps.storage, &normalized_code)? {
                    Some(existing) => (existing, false),
                    None => (
                        ReferralCodeStats {
                            total_rewards_earned: Uint128::zero(),
                            total_user_bonuses: Uint128::zero(),
                            total_swaps: 0,
                        },
                        true,
                    ),
                };

            // Update per-code stats
            code_stats.total_rewards_earned += referrer_bonus;
            code_stats.total_user_bonuses += user_bonus;
            code_stats.total_swaps += 1;

            REFERRAL_CODE_STATS.save(deps.storage, &normalized_code, &code_stats)?;

            // Update unique codes counter if this is a new code
            if is_new_code {
                stats.unique_referral_codes_used += 1;
            }

            // Update leaderboard linked list and capture the change for event emission
            leaderboard_change = update_leaderboard(
                deps.storage,
                &normalized_code,
                code_stats.total_rewards_earned,
                leaderboard_hint.as_ref(),
            )?;
        }
    }
    STATS.save(deps.storage, &stats)?;

    // Build response with messages
    let mut response = Response::new();

    // Forward USTC to Treasury (user pays 0.5% burn tax)
    let forward_ustc = BankMsg::Send {
        to_address: config.treasury.to_string(),
        amount: vec![Coin {
            denom: USTC_DENOM.to_string(),
            amount: ustc_amount,
        }],
    };
    response = response.add_message(forward_ustc);

    // Mint USTR to user
    let mint_to_user = WasmMsg::Execute {
        contract_addr: config.ustr_token.to_string(),
        msg: to_json_binary(&Cw20ExecuteMsg::Mint {
            recipient: info.sender.to_string(),
            amount: total_ustr_to_user,
        })?,
        funds: vec![],
    };
    response = response.add_message(mint_to_user);

    // Mint referrer bonus if applicable
    if let Some(ref referrer) = referrer_addr {
        if referrer_bonus > Uint128::zero() {
            let mint_to_referrer = WasmMsg::Execute {
                contract_addr: config.ustr_token.to_string(),
                msg: to_json_binary(&Cw20ExecuteMsg::Mint {
                    recipient: referrer.to_string(),
                    amount: referrer_bonus,
                })?,
                funds: vec![],
            };
            response = response.add_message(mint_to_referrer);
        }
    }

    response = response
        .add_attribute("action", "swap")
        .add_attribute("user", &info.sender)
        .add_attribute("ustc_amount", ustc_amount)
        .add_attribute("rate", rate.to_string())
        .add_attribute("base_ustr", base_ustr)
        .add_attribute("user_bonus", user_bonus)
        .add_attribute("total_ustr_to_user", total_ustr_to_user);

    if let Some(ref referrer) = referrer_addr {
        response = response
            .add_attribute("referrer", referrer)
            .add_attribute("referrer_bonus", referrer_bonus);
    }

    // Add leaderboard change events
    if let Some(change) = leaderboard_change {
        let action_str = match change.action {
            LeaderboardAction::NewEntry => "new_entry",
            LeaderboardAction::PositionUp => "position_up",
            LeaderboardAction::NoChange => "no_change",
        };
        response = response.add_attribute("leaderboard_action", action_str);
        
        if let Some(position) = change.position {
            response = response.add_attribute("leaderboard_position", position.to_string());
        }
    }

    Ok(response)
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

/// Update the top-50 leaderboard after a code's rewards change
/// The list is maintained in descending order by total_rewards_earned
/// Only the top 50 codes are tracked on-chain for gas efficiency
/// 
/// If a hint is provided, the contract validates it and uses it for O(1) insertion.
/// If the hint is wrong, it falls back to searching from the hint position
/// (up if hint was too low, down if hint was too high).
/// 
/// Returns information about the leaderboard change for event emission.
fn update_leaderboard(
    storage: &mut dyn cosmwasm_std::Storage,
    code: &str,
    new_rewards: Uint128,
    hint: Option<&crate::msg::LeaderboardHint>,
) -> Result<Option<LeaderboardChange>, ContractError> {
    // Step 1: Remove from leaderboard if already present
    // This unifies the logic - after removal, we always use the same insertion path
    let was_in_leaderboard = if let Some(link) = LEADERBOARD_LINKS.may_load(storage, code)? {
        // Check if we even need to move (optimization: skip remove+insert if position unchanged)
        let needs_move = match &link.prev {
            Some(prev) => {
                let prev_stats = REFERRAL_CODE_STATS.load(storage, prev)?;
                new_rewards > prev_stats.total_rewards_earned
            }
            None => false, // Already at head, no movement needed
        };

        if !needs_move {
            // Position unchanged - return early with current position
            let position = get_leaderboard_position(storage, code)?;
            return Ok(Some(LeaderboardChange {
                action: LeaderboardAction::NoChange,
                position,
            }));
        }

        // Remove from current position
        remove_from_leaderboard_internal(storage, code, &link)?;

        // Decrement size (will be incremented back during insertion)
        let size = LEADERBOARD_SIZE.load(storage)?;
        LEADERBOARD_SIZE.save(storage, &(size.saturating_sub(1)))?;

        true
    } else {
        false
    };

    // Step 2: Insert using hint (same logic for new entries and repositioning)
    // try_insert_into_leaderboard handles: room check, hint-based O(1) insertion, tail displacement
    let inserted = try_insert_into_leaderboard(storage, code, new_rewards, hint)?;

    // Step 3: Build result based on what happened
    if inserted {
        // Successfully inserted (possibly displacing someone from tail)
        let position = get_leaderboard_position(storage, code)?;
        Ok(Some(LeaderboardChange {
            action: if was_in_leaderboard {
                LeaderboardAction::PositionUp
            } else {
                LeaderboardAction::NewEntry
            },
            position,
        }))
    } else {
        // Didn't qualify for leaderboard
        // This should only happen for new entries when leaderboard is full
        // and rewards are below the tail. For repositioning (was_in_leaderboard=true),
        // this would be a logic error since rewards only increase.
        Ok(None)
    }
}

/// Get the position of a code in the leaderboard (1-indexed)
/// Returns None if the code is not in the leaderboard
fn get_leaderboard_position(
    storage: &dyn cosmwasm_std::Storage,
    target_code: &str,
) -> Result<Option<u32>, ContractError> {
    let head = LEADERBOARD_HEAD.load(storage)?;
    let mut current = head;
    let mut position = 1u32;

    while let Some(ref code) = current {
        if code == target_code {
            return Ok(Some(position));
        }
        let link = LEADERBOARD_LINKS.load(storage, code)?;
        current = link.next;
        position += 1;
    }

    Ok(None)
}

/// Try to insert a code into the top-50 leaderboard
/// Only inserts if the leaderboard has room or the code beats the current tail
/// 
/// If hint is provided:
/// - Validates the hint position
/// - If correct: O(1) insertion
/// - If wrong: searches up or down from hint position (still often faster than from tail)
/// 
/// Returns:
/// - true if inserted (possibly displacing tail when leaderboard is full)
/// - false if didn't qualify (leaderboard full and rewards below tail)
fn try_insert_into_leaderboard(
    storage: &mut dyn cosmwasm_std::Storage,
    code: &str,
    rewards: Uint128,
    hint: Option<&crate::msg::LeaderboardHint>,
) -> Result<bool, ContractError> {
    let size = LEADERBOARD_SIZE.load(storage)?;

    if size < MAX_LEADERBOARD_SIZE {
        // Room in leaderboard - insert at correct position
        insert_into_leaderboard_with_hint(storage, code, rewards, hint)?;
        LEADERBOARD_SIZE.save(storage, &(size + 1))?;
        Ok(true)
    } else {
        // Leaderboard is full - check if we beat the tail
        let tail = LEADERBOARD_TAIL.load(storage)?;
        if let Some(ref tail_code) = tail {
            let tail_stats = REFERRAL_CODE_STATS.load(storage, tail_code)?;
            if rewards > tail_stats.total_rewards_earned {
                // We beat the tail - remove tail and insert ourselves
                let tail_link = LEADERBOARD_LINKS.load(storage, tail_code)?;
                let tail_prev = tail_link.prev.clone();
                remove_from_leaderboard_internal(storage, tail_code, &tail_link)?;
                
                // Update tail pointer to the previous entry (new tail after removal)
                LEADERBOARD_TAIL.save(storage, &tail_prev)?;
                
                // If the hint points to the displaced tail, it's now invalid.
                // Use the tail's predecessor as a better starting point for insertion.
                let effective_hint = if hint.map(|h| h.insert_after.as_ref() == Some(tail_code)).unwrap_or(false) {
                    // Hint was the displaced tail - use predecessor instead
                    tail_prev.as_ref().map(|prev| crate::msg::LeaderboardHint {
                        insert_after: Some(prev.clone()),
                    })
                } else {
                    hint.cloned()
                };
                
                insert_into_leaderboard_with_hint(storage, code, rewards, effective_hint.as_ref())?;
                // Size stays the same (removed one, added one)
                Ok(true)
            } else {
                // We don't qualify
                Ok(false)
            }
        } else {
            Ok(false)
        }
    }
}

/// Insert into leaderboard using an optional hint for O(1) insertion
/// If hint is valid: O(1) insertion
/// If hint is wrong: falls back to searching from the hint position (bidirectional)
fn insert_into_leaderboard_with_hint(
    storage: &mut dyn cosmwasm_std::Storage,
    code: &str,
    rewards: Uint128,
    hint: Option<&crate::msg::LeaderboardHint>,
) -> Result<(), ContractError> {
    // If no hint provided, fall back to standard insertion
    let hint = match hint {
        Some(h) => h,
        None => return insert_into_leaderboard(storage, code, rewards),
    };

    // Validate and use the hint
    match &hint.insert_after {
        Some(after_code) => {
            // Hint claims we should insert after this code
            // First check if the hint code exists in leaderboard
            let after_link = match LEADERBOARD_LINKS.may_load(storage, after_code)? {
                Some(link) => link,
                None => {
                    // Hint code not in leaderboard - fall back to standard insertion
                    return insert_into_leaderboard(storage, code, rewards);
                }
            };

            let after_stats = REFERRAL_CODE_STATS.load(storage, after_code)?;

            if after_stats.total_rewards_earned >= rewards {
                // Hint code has higher or equal rewards - we should be after it
                // Now check if the next code (if any) has lower rewards
                if let Some(ref next_code) = after_link.next {
                    let next_stats = REFERRAL_CODE_STATS.load(storage, next_code)?;
                    if next_stats.total_rewards_earned >= rewards {
                        // Next code also has higher rewards - hint was too high
                        // Search DOWNWARD from next_code
                        return insert_searching_down(storage, code, rewards, next_code.clone());
                    }
                }
                // Hint is correct! Insert between after_code and after_link.next
                insert_at_position(storage, code, Some(after_code.clone()), after_link.next.clone())?;
            } else {
                // Hint code has lower rewards than us - hint was too low
                // Search UPWARD from after_code
                insert_into_leaderboard_from_position(storage, code, rewards, Some(after_code.clone()))?;
            }
        }
        None => {
            // Hint claims we should be the new head
            let head = LEADERBOARD_HEAD.load(storage)?;
            if let Some(ref head_code) = head {
                let head_stats = REFERRAL_CODE_STATS.load(storage, head_code)?;
                if head_stats.total_rewards_earned >= rewards {
                    // Current head has higher rewards - hint was wrong
                    // Search DOWNWARD from head
                    return insert_searching_down(storage, code, rewards, head_code.clone());
                }
            }
            // Hint is correct - we are the new head
            insert_at_position(storage, code, None, head)?;
        }
    }

    Ok(())
}

/// Insert by searching downward from a starting position
/// Used when hint was too high (we need to go toward tail)
fn insert_searching_down(
    storage: &mut dyn cosmwasm_std::Storage,
    code: &str,
    rewards: Uint128,
    start_from: String,
) -> Result<(), ContractError> {
    let mut current = Some(start_from);
    let mut insert_after: Option<String> = None;

    // Walk downward (toward tail) to find insertion point
    while let Some(ref curr) = current {
        let curr_stats = REFERRAL_CODE_STATS.load(storage, curr)?;
        if curr_stats.total_rewards_earned >= rewards {
            // This code has higher or equal rewards, so we insert after it
            insert_after = Some(curr.clone());
            let curr_link = LEADERBOARD_LINKS.load(storage, curr)?;
            
            // Check if next has lower rewards (or is None)
            if let Some(ref next_code) = curr_link.next {
                let next_stats = REFERRAL_CODE_STATS.load(storage, next_code)?;
                if next_stats.total_rewards_earned < rewards {
                    // Found the spot: insert between curr and next
                    break;
                }
                // Keep going down
                current = curr_link.next.clone();
            } else {
                // curr is the tail and we have lower rewards - we become new tail
                break;
            }
        } else {
            // This shouldn't happen if we're searching down correctly
            // but handle gracefully by inserting before curr
            break;
        }
    }

    // Get the next code after insert_after
    let insert_before = if let Some(ref after) = insert_after {
        let after_link = LEADERBOARD_LINKS.load(storage, after)?;
        after_link.next.clone()
    } else {
        LEADERBOARD_HEAD.load(storage)?
    };

    insert_at_position(storage, code, insert_after, insert_before)
}

/// Insert a code at a specific position (between prev and next)
/// This is the O(1) insertion once position is known
fn insert_at_position(
    storage: &mut dyn cosmwasm_std::Storage,
    code: &str,
    prev: Option<String>,
    next: Option<String>,
) -> Result<(), ContractError> {
    // Create our link
    let new_link = LeaderboardLink {
        prev: prev.clone(),
        next: next.clone(),
    };
    LEADERBOARD_LINKS.save(storage, code, &new_link)?;

    // Update prev's next pointer
    if let Some(ref prev_code) = prev {
        let mut prev_link = LEADERBOARD_LINKS.load(storage, prev_code)?;
        prev_link.next = Some(code.to_string());
        LEADERBOARD_LINKS.save(storage, prev_code, &prev_link)?;
    } else {
        // We're the new head
        LEADERBOARD_HEAD.save(storage, &Some(code.to_string()))?;
    }

    // Update next's prev pointer
    if let Some(ref next_code) = next {
        let mut next_link = LEADERBOARD_LINKS.load(storage, next_code)?;
        next_link.prev = Some(code.to_string());
        LEADERBOARD_LINKS.save(storage, next_code, &next_link)?;
    } else {
        // We're the new tail
        LEADERBOARD_TAIL.save(storage, &Some(code.to_string()))?;
    }

    Ok(())
}

/// Reposition a code that's already in the leaderboard after its rewards increased
/// Optimized to only walk upward from current position since rewards only increase
/// 
/// Returns true if the code moved to a higher position, false if it stayed in place
/// 
/// NOTE: This function is no longer used by update_leaderboard (which now uses
/// the unified remove-then-insert approach), but is kept for potential test usage.
#[allow(dead_code)]
fn reposition_in_leaderboard(
    storage: &mut dyn cosmwasm_std::Storage,
    code: &str,
    new_rewards: Uint128,
) -> Result<bool, ContractError> {
    let link = LEADERBOARD_LINKS.load(storage, code)?;

    // Check if we need to move at all
    let needs_move = if let Some(ref prev) = link.prev {
        let prev_stats = REFERRAL_CODE_STATS.load(storage, prev)?;
        new_rewards > prev_stats.total_rewards_earned
    } else {
        false // Already at head, no movement needed
    };

    if needs_move {
        // Remove from current position and reinsert
        // We track if we were the tail before removing
        let was_tail = link.next.is_none();

        remove_from_leaderboard_internal(storage, code, &link)?;
        insert_into_leaderboard_from_position(storage, code, new_rewards, link.prev.clone())?;

        // If we were the tail, we need to update the tail pointer
        // The new tail is our old prev (since we moved up)
        if was_tail {
            LEADERBOARD_TAIL.save(storage, &link.prev)?;
        }
    }

    Ok(needs_move)
}

/// Insert a code into the leaderboard at the correct sorted position
/// Walks from head to find insertion point (used for new entries)
fn insert_into_leaderboard(
    storage: &mut dyn cosmwasm_std::Storage,
    code: &str,
    rewards: Uint128,
) -> Result<(), ContractError> {
    let head = LEADERBOARD_HEAD.load(storage)?;

    match head {
        None => {
            // First entry in the leaderboard
            LEADERBOARD_HEAD.save(storage, &Some(code.to_string()))?;
            LEADERBOARD_TAIL.save(storage, &Some(code.to_string()))?;
            LEADERBOARD_LINKS.save(
                storage,
                code,
                &LeaderboardLink {
                    prev: None,
                    next: None,
                },
            )?;
        }
        Some(head_code) => {
            // Walk from tail upward to find insertion point
            // This is more efficient for new entries which typically enter near the bottom
            let tail = LEADERBOARD_TAIL.load(storage)?;
            let tail_code = tail.unwrap_or(head_code.clone());

            let tail_stats = REFERRAL_CODE_STATS.load(storage, &tail_code)?;
            if rewards <= tail_stats.total_rewards_earned {
                // Insert after tail (we become new tail)
                let mut tail_link = LEADERBOARD_LINKS.load(storage, &tail_code)?;
                tail_link.next = Some(code.to_string());
                LEADERBOARD_LINKS.save(storage, &tail_code, &tail_link)?;

                LEADERBOARD_LINKS.save(
                    storage,
                    code,
                    &LeaderboardLink {
                        prev: Some(tail_code),
                        next: None,
                    },
                )?;
                LEADERBOARD_TAIL.save(storage, &Some(code.to_string()))?;
            } else {
                // Walk up from tail to find correct position
                insert_into_leaderboard_from_position(storage, code, rewards, Some(tail_code))?;
            }
        }
    }

    Ok(())
}

/// Insert a code starting search from a given position (walking upward)
/// Used when we know the code should be inserted above a certain position
fn insert_into_leaderboard_from_position(
    storage: &mut dyn cosmwasm_std::Storage,
    code: &str,
    rewards: Uint128,
    start_from: Option<String>,
) -> Result<(), ContractError> {
    let mut current = start_from;
    let mut insert_after: Option<String> = None;

    // Walk upward (toward head) to find insertion point
    while let Some(ref curr) = current {
        let curr_stats = REFERRAL_CODE_STATS.load(storage, curr)?;
        if curr_stats.total_rewards_earned >= rewards {
            // Insert after this one
            insert_after = Some(curr.clone());
            break;
        }
        let curr_link = LEADERBOARD_LINKS.load(storage, curr)?;
        current = curr_link.prev.clone();
    }

    // Get the code that will be after us
    let insert_before = if let Some(ref after) = insert_after {
        let after_link = LEADERBOARD_LINKS.load(storage, after)?;
        after_link.next.clone()
    } else {
        // We're the new head
        LEADERBOARD_HEAD.load(storage)?
    };

    // Create our link
    let new_link = LeaderboardLink {
        prev: insert_after.clone(),
        next: insert_before.clone(),
    };
    LEADERBOARD_LINKS.save(storage, code, &new_link)?;

    // Update prev's next pointer
    if let Some(ref prev) = insert_after {
        let mut prev_link = LEADERBOARD_LINKS.load(storage, prev)?;
        prev_link.next = Some(code.to_string());
        LEADERBOARD_LINKS.save(storage, prev, &prev_link)?;
    } else {
        // We're the new head
        LEADERBOARD_HEAD.save(storage, &Some(code.to_string()))?;
    }

    // Update next's prev pointer
    if let Some(ref next) = insert_before {
        let mut next_link = LEADERBOARD_LINKS.load(storage, next)?;
        next_link.prev = Some(code.to_string());
        LEADERBOARD_LINKS.save(storage, next, &next_link)?;
    } else {
        // We're the new tail
        LEADERBOARD_TAIL.save(storage, &Some(code.to_string()))?;
    }

    Ok(())
}

/// Remove a code from the leaderboard linked list (public interface)
/// Used primarily in tests; production code uses try_insert_into_leaderboard
#[cfg(test)]
fn remove_from_leaderboard(
    storage: &mut dyn cosmwasm_std::Storage,
    code: &str,
) -> Result<(), ContractError> {
    let link = LEADERBOARD_LINKS.may_load(storage, code)?;

    if let Some(link) = link {
        remove_from_leaderboard_internal(storage, code, &link)?;

        // Update size
        let size = LEADERBOARD_SIZE.load(storage)?;
        if size > 0 {
            LEADERBOARD_SIZE.save(storage, &(size - 1))?;
        }
    }

    Ok(())
}

/// Remove a code from the leaderboard linked list (internal, doesn't update size)
fn remove_from_leaderboard_internal(
    storage: &mut dyn cosmwasm_std::Storage,
    code: &str,
    link: &LeaderboardLink,
) -> Result<(), ContractError> {
    // Update prev's next pointer
    if let Some(ref prev) = link.prev {
        let mut prev_link = LEADERBOARD_LINKS.load(storage, prev)?;
        prev_link.next = link.next.clone();
        LEADERBOARD_LINKS.save(storage, prev, &prev_link)?;
    } else {
        // We were the head, update head to our next
        LEADERBOARD_HEAD.save(storage, &link.next)?;
    }

    // Update next's prev pointer
    if let Some(ref next) = link.next {
        let mut next_link = LEADERBOARD_LINKS.load(storage, next)?;
        next_link.prev = link.prev.clone();
        LEADERBOARD_LINKS.save(storage, next, &next_link)?;
    } else {
        // We were the tail, update tail to our prev
        LEADERBOARD_TAIL.save(storage, &link.prev)?;
    }

    // Remove our link entry
    LEADERBOARD_LINKS.remove(storage, code);

    Ok(())
}

// ============ QUERY ============

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&query_config(deps)?),
        QueryMsg::CurrentRate {} => to_json_binary(&query_current_rate(deps, env)?),
        QueryMsg::SwapSimulation {
            ustc_amount,
            referral_code,
        } => to_json_binary(&query_swap_simulation(deps, env, ustc_amount, referral_code)?),
        QueryMsg::Status {} => to_json_binary(&query_status(deps, env)?),
        QueryMsg::Stats {} => to_json_binary(&query_stats(deps)?),
        QueryMsg::PendingAdmin {} => to_json_binary(&query_pending_admin(deps)?),
        QueryMsg::ReferralCodeStats { code } => {
            to_json_binary(&query_referral_code_stats(deps, code)?)
        }
        QueryMsg::ReferralLeaderboard { start_after, limit } => {
            to_json_binary(&query_referral_leaderboard(deps, start_after, limit)?)
        }
    }
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        ustr_token: config.ustr_token,
        treasury: config.treasury,
        referral: config.referral,
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

fn query_swap_simulation(
    deps: Deps,
    env: Env,
    ustc_amount: Uint128,
    referral_code: Option<String>,
) -> StdResult<SimulationResponse> {
    let config = CONFIG.load(deps.storage)?;
    let rate = calculate_current_rate(&config, env.block.time);

    // Calculate base USTR amount with decimal adjustment
    // USTC has 6 decimals, USTR has 18 decimals, so we multiply by 10^12
    // base_ustr = floor((ustc_amount / current_rate) * 10^12)
    //
    // IMPORTANT: We divide first, then multiply by DECIMAL_ADJUSTMENT to avoid overflow.
    // The previous approach (multiply by 10^12 first, then use Decimal::from_ratio)
    // caused overflow because Decimal::from_ratio(n, 1) internally multiplies n by 10^18,
    // and (ustc * 10^12 * 10^18) overflows Uint128 for amounts as small as 340 USTC.
    let ustc_decimal = Decimal::from_ratio(ustc_amount, 1u128);
    let ustr_decimal = ustc_decimal / rate;
    let base_ustr_unscaled = ustr_decimal * Uint128::one();
    let base_ustr_amount = base_ustr_unscaled
        .checked_mul(Uint128::from(DECIMAL_ADJUSTMENT))?;

    // Check if referral code is valid
    let (referral_valid, user_bonus, referrer_bonus) = if let Some(ref code) = referral_code {
        if code.is_empty() {
            (false, Uint128::zero(), Uint128::zero())
        } else {
            // Query referral contract
            let validate_response: Result<ReferralValidateResponse, _> = deps.querier.query(
                &QueryRequest::Wasm(WasmQuery::Smart {
                    contract_addr: config.referral.to_string(),
                    msg: to_json_binary(&ReferralQueryMsg::ValidateCode {
                        code: code.clone(),
                    })?,
                }),
            );

            match validate_response {
                Ok(resp) if resp.is_valid_format && resp.is_registered => {
                    let bonus = base_ustr_amount
                        .checked_mul(Uint128::from(REFERRAL_BONUS_NUMERATOR))
                        .unwrap_or(Uint128::zero())
                        .checked_div(Uint128::from(REFERRAL_BONUS_DENOMINATOR))
                        .unwrap_or(Uint128::zero());
                    (true, bonus, bonus)
                }
                _ => (false, Uint128::zero(), Uint128::zero()),
            }
        }
    } else {
        (false, Uint128::zero(), Uint128::zero())
    };

    let total_ustr_to_user = base_ustr_amount + user_bonus;

    Ok(SimulationResponse {
        ustc_amount,
        base_ustr_amount,
        user_bonus,
        referrer_bonus,
        total_ustr_to_user,
        rate,
        referral_valid,
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
        total_referral_bonus_minted: stats.total_referral_bonus_minted,
        total_referral_swaps: stats.total_referral_swaps,
        unique_referral_codes_used: stats.unique_referral_codes_used,
    })
}

fn query_pending_admin(deps: Deps) -> StdResult<Option<PendingAdminResponse>> {
    let pending = PENDING_ADMIN.may_load(deps.storage)?;
    Ok(pending.map(|p| PendingAdminResponse {
        new_address: p.new_address,
        execute_after: p.execute_after,
    }))
}

fn query_referral_code_stats(deps: Deps, code: String) -> StdResult<ReferralCodeStatsResponse> {
    let config = CONFIG.load(deps.storage)?;
    let normalized_code = code.to_lowercase();

    // Query the referral contract to get the owner
    let validate_response: ReferralValidateResponse = deps.querier.query(
        &QueryRequest::Wasm(WasmQuery::Smart {
            contract_addr: config.referral.to_string(),
            msg: to_json_binary(&ReferralQueryMsg::ValidateCode {
                code: normalized_code.clone(),
            })?,
        }),
    )?;

    // If code is not registered, return error
    if !validate_response.is_registered {
        return Err(cosmwasm_std::StdError::generic_err(format!(
            "Referral code '{}' is not registered",
            code
        )));
    }

    let owner = validate_response
        .owner
        .ok_or_else(|| cosmwasm_std::StdError::generic_err("Code owner not found"))?;

    // Load per-code stats (may not exist if code was never used in a swap)
    let code_stats = REFERRAL_CODE_STATS
        .may_load(deps.storage, &normalized_code)?
        .unwrap_or(ReferralCodeStats {
            total_rewards_earned: Uint128::zero(),
            total_user_bonuses: Uint128::zero(),
            total_swaps: 0,
        });

    Ok(ReferralCodeStatsResponse {
        code: normalized_code,
        owner,
        total_rewards_earned: code_stats.total_rewards_earned,
        total_user_bonuses: code_stats.total_user_bonuses,
        total_swaps: code_stats.total_swaps,
    })
}

fn query_referral_leaderboard(
    deps: Deps,
    start_after: Option<String>,
    limit: Option<u32>,
) -> StdResult<ReferralLeaderboardResponse> {
    let config = CONFIG.load(deps.storage)?;
    let limit = limit.unwrap_or(DEFAULT_LEADERBOARD_LIMIT).min(MAX_LEADERBOARD_LIMIT);

    let mut entries: Vec<LeaderboardEntry> = Vec::new();
    let mut rank: u32 = 1;

    // Find starting position
    let start_code = if let Some(ref after) = start_after {
        let normalized = after.to_lowercase();
        // Start from the code after the given one
        let link = LEADERBOARD_LINKS.may_load(deps.storage, &normalized)?;
        if let Some(link) = link {
            // Count ranks up to this code
            let mut current = LEADERBOARD_HEAD.load(deps.storage)?;
            while let Some(ref curr) = current {
                if curr == &normalized {
                    break;
                }
                rank += 1;
                let curr_link = LEADERBOARD_LINKS.load(deps.storage, curr)?;
                current = curr_link.next;
            }
            rank += 1; // Move past the start_after code
            link.next
        } else {
            // Code not found, start from head
            LEADERBOARD_HEAD.load(deps.storage)?
        }
    } else {
        LEADERBOARD_HEAD.load(deps.storage)?
    };

    let mut current = start_code;
    let mut count = 0u32;

    while let Some(ref code) = current {
        if count >= limit {
            break;
        }

        // Load code stats
        let code_stats = REFERRAL_CODE_STATS.load(deps.storage, code)?;

        // Query owner from referral contract
        let validate_response: Result<ReferralValidateResponse, _> = deps.querier.query(
            &QueryRequest::Wasm(WasmQuery::Smart {
                contract_addr: config.referral.to_string(),
                msg: to_json_binary(&ReferralQueryMsg::ValidateCode { code: code.clone() })?,
            }),
        );

        let owner = match validate_response {
            Ok(resp) => resp.owner.unwrap_or_else(|| {
                cosmwasm_std::Addr::unchecked("unknown")
            }),
            Err(_) => cosmwasm_std::Addr::unchecked("unknown"),
        };

        entries.push(LeaderboardEntry {
            code: code.clone(),
            owner,
            total_rewards_earned: code_stats.total_rewards_earned,
            total_user_bonuses: code_stats.total_user_bonuses,
            total_swaps: code_stats.total_swaps,
            rank,
        });

        // Move to next
        let link = LEADERBOARD_LINKS.load(deps.storage, code)?;
        current = link.next;
        rank += 1;
        count += 1;
    }

    // Check if there are more entries
    let has_more = current.is_some();

    Ok(ReferralLeaderboardResponse { entries, has_more })
}

// ============ TESTS ============

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_env, mock_info, MockApi, MockQuerier, MockStorage};
    use cosmwasm_std::{from_json, Addr, Coin, Decimal, Empty, OwnedDeps, Querier, QuerierResult, SystemResult, ContractResult, SystemError};

    const ADMIN: &str = "admin_addr";
    const USTR_TOKEN: &str = "ustr_token_addr";
    const TREASURY: &str = "treasury_addr";
    const REFERRAL: &str = "referral_addr";
    
    // USTR has 18 decimals, USTC has 6 decimals
    // 1 USTR = 10^18 atomic units, 1 USTC = 10^6 atomic units
    // When swapping 15 USTC at rate 1.5: 15 / 1.5 = 10 USTR = 10 * 10^18 atomic units
    const TEN_USTR: u128 = 10_000_000_000_000_000_000; // 10 USTR in 18-decimal
    const ONE_USTR: u128 = 1_000_000_000_000_000_000;  // 1 USTR in 18-decimal (10% bonus)
    
    // Default total supply for USTR token in tests
    const DEFAULT_USTR_TOTAL_SUPPLY_BASIC: u128 = 1_000_000_000_000_000_000_000_000_000;

    /// Simple mock querier that handles USTR TokenInfo queries
    /// Used for tests that don't need referral mocking
    struct UstrMockQuerier {
        base: MockQuerier<Empty>,
    }

    impl UstrMockQuerier {
        fn new() -> Self {
            Self {
                base: MockQuerier::new(&[]),
            }
        }
    }

    impl Querier for UstrMockQuerier {
        fn raw_query(&self, bin_request: &[u8]) -> QuerierResult {
            let request: QueryRequest<Empty> = match cosmwasm_std::from_json(bin_request) {
                Ok(v) => v,
                Err(e) => {
                    return SystemResult::Err(SystemError::InvalidRequest {
                        error: format!("Parsing query request: {}", e),
                        request: bin_request.into(),
                    })
                }
            };

            match request {
                QueryRequest::Wasm(WasmQuery::Smart { contract_addr, msg }) => {
                    // Handle USTR token queries
                    if contract_addr == USTR_TOKEN {
                        let query_msg: Result<Cw20QueryMsg, _> = cosmwasm_std::from_json(&msg);
                        if let Ok(Cw20QueryMsg::TokenInfo {}) = query_msg {
                            let response = TokenInfoResponse {
                                name: "USTR Token".to_string(),
                                symbol: "USTR".to_string(),
                                decimals: 18,
                                total_supply: Uint128::from(DEFAULT_USTR_TOTAL_SUPPLY_BASIC),
                            };
                            return SystemResult::Ok(ContractResult::Ok(
                                to_json_binary(&response).unwrap(),
                            ));
                        }
                    }
                    self.base.raw_query(bin_request)
                }
                _ => self.base.raw_query(bin_request),
            }
        }
    }

    /// Create mock dependencies with USTR token info support
    fn mock_dependencies() -> OwnedDeps<MockStorage, MockApi, UstrMockQuerier, Empty> {
        OwnedDeps {
            storage: MockStorage::default(),
            api: MockApi::default(),
            querier: UstrMockQuerier::new(),
            custom_query_type: std::marker::PhantomData,
        }
    }

    fn setup_contract(deps: DepsMut, start_time: u64) {
        let msg = InstantiateMsg {
            ustr_token: USTR_TOKEN.to_string(),
            treasury: TREASURY.to_string(),
            referral: REFERRAL.to_string(),
            start_time,
            start_rate: Decimal::from_ratio(15u128, 10u128), // 1.5
            end_rate: Decimal::from_ratio(25u128, 10u128),   // 2.5
            duration_seconds: None, // Uses DEFAULT_SWAP_DURATION (100 days)
            admin: ADMIN.to_string(),
        };
        let info = mock_info("creator", &[]);
        instantiate(deps, mock_env(), info, msg).unwrap();
    }

    fn ustc_coins(amount: u128) -> Vec<Coin> {
        vec![Coin {
            denom: USTC_DENOM.to_string(),
            amount: Uint128::from(amount),
        }]
    }

    #[test]
    fn test_instantiate() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.ustr_token.as_str(), USTR_TOKEN);
        assert_eq!(config.treasury.as_str(), TREASURY);
        assert_eq!(config.referral.as_str(), REFERRAL);
        assert_eq!(config.admin.as_str(), ADMIN);
        assert!(!config.paused);

        let stats = STATS.load(&deps.storage).unwrap();
        assert_eq!(stats.total_ustc_received, Uint128::zero());
        assert_eq!(stats.total_ustr_minted, Uint128::zero());
        assert_eq!(stats.total_referral_bonus_minted, Uint128::zero());
        assert_eq!(stats.total_referral_swaps, 0);
        assert_eq!(stats.unique_referral_codes_used, 0);

        // Verify leaderboard head is initialized to None
        let head = LEADERBOARD_HEAD.load(&deps.storage).unwrap();
        assert!(head.is_none());
    }

    #[test]
    fn test_instantiate_rejects_wrong_ustr_decimals() {
        // Mock querier that returns wrong decimals for USTR
        struct WrongDecimalsMockQuerier {
            base: MockQuerier<Empty>,
            decimals: u8,
        }

        impl Querier for WrongDecimalsMockQuerier {
            fn raw_query(&self, bin_request: &[u8]) -> QuerierResult {
                let request: QueryRequest<Empty> = match cosmwasm_std::from_json(bin_request) {
                    Ok(v) => v,
                    Err(e) => {
                        return SystemResult::Err(SystemError::InvalidRequest {
                            error: format!("Parsing query request: {}", e),
                            request: bin_request.into(),
                        })
                    }
                };

                match request {
                    QueryRequest::Wasm(WasmQuery::Smart { contract_addr, msg }) => {
                        if contract_addr == USTR_TOKEN {
                            let query_msg: Result<Cw20QueryMsg, _> = cosmwasm_std::from_json(&msg);
                            if let Ok(Cw20QueryMsg::TokenInfo {}) = query_msg {
                                let response = TokenInfoResponse {
                                    name: "USTR Token".to_string(),
                                    symbol: "USTR".to_string(),
                                    decimals: self.decimals, // Wrong decimals!
                                    total_supply: Uint128::from(1_000_000_000u128),
                                };
                                return SystemResult::Ok(ContractResult::Ok(
                                    to_json_binary(&response).unwrap(),
                                ));
                            }
                        }
                        self.base.raw_query(bin_request)
                    }
                    _ => self.base.raw_query(bin_request),
                }
            }
        }

        // Test with 6 decimals (like USTC) - should fail
        let deps_6_decimals = OwnedDeps {
            storage: MockStorage::default(),
            api: MockApi::default(),
            querier: WrongDecimalsMockQuerier {
                base: MockQuerier::new(&[]),
                decimals: 6,
            },
            custom_query_type: std::marker::PhantomData,
        };
        let mut deps = deps_6_decimals;
        let env = mock_env();

        let msg = InstantiateMsg {
            ustr_token: USTR_TOKEN.to_string(),
            treasury: TREASURY.to_string(),
            referral: REFERRAL.to_string(),
            start_time: env.block.time.seconds(),
            start_rate: Decimal::from_ratio(15u128, 10u128),
            end_rate: Decimal::from_ratio(25u128, 10u128),
            duration_seconds: None,
            admin: ADMIN.to_string(),
        };
        let info = mock_info("creator", &[]);

        let err = instantiate(deps.as_mut(), env.clone(), info.clone(), msg.clone()).unwrap_err();
        assert_eq!(
            err,
            ContractError::InvalidUstrDecimals {
                expected: 18,
                actual: 6
            }
        );

        // Test with 8 decimals - should also fail
        let deps_8_decimals = OwnedDeps {
            storage: MockStorage::default(),
            api: MockApi::default(),
            querier: WrongDecimalsMockQuerier {
                base: MockQuerier::new(&[]),
                decimals: 8,
            },
            custom_query_type: std::marker::PhantomData,
        };
        let mut deps = deps_8_decimals;

        let err = instantiate(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(
            err,
            ContractError::InvalidUstrDecimals {
                expected: 18,
                actual: 8
            }
        );
    }

    #[test]
    fn test_swap_no_funds() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // No funds sent
        let info = mock_info("user", &[]);
        let msg = ExecuteMsg::Swap {
            referral_code: None,
            leaderboard_hint: None,
        };

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::NoFundsSent);
    }

    #[test]
    fn test_swap_wrong_denom() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Wrong denom
        let info = mock_info(
            "user",
            &[Coin {
                denom: "uluna".to_string(),
                amount: Uint128::from(1_000_000u128),
            }],
        );
        let msg = ExecuteMsg::Swap {
            referral_code: None,
            leaderboard_hint: None,
        };

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::WrongDenom);
    }

    #[test]
    fn test_swap_before_start() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        // Set start time in the future
        setup_contract(deps.as_mut(), env.block.time.seconds() + 1000);

        let info = mock_info("user", &ustc_coins(1_000_000));
        let msg = ExecuteMsg::Swap {
            referral_code: None,
            leaderboard_hint: None,
        };

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

        let info = mock_info("user", &ustc_coins(1_000_000));
        let msg = ExecuteMsg::Swap {
            referral_code: None,
            leaderboard_hint: None,
        };

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::SwapEnded);
    }

    #[test]
    fn test_swap_below_minimum() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let info = mock_info("user", &ustc_coins(999_999)); // Below 1 USTC
        let msg = ExecuteMsg::Swap {
            referral_code: None,
            leaderboard_hint: None,
        };

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::BelowMinimumSwap);
    }

    #[test]
    fn test_swap_success_no_referral() {
        let mut deps = mock_deps_with_referral(vec![]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        let ustc_amount = 15_000_000u128; // 15 USTC
        let info = mock_info("user", &ustc_coins(ustc_amount));
        let msg = ExecuteMsg::Swap {
            referral_code: None,
            leaderboard_hint: None,
        };

        let res = execute(deps.as_mut(), env, info, msg).unwrap();

        // Should have 2 messages: forward USTC to treasury, mint USTR to user
        assert_eq!(res.messages.len(), 2);

        // Check attributes
        assert_eq!(res.attributes[0].value, "swap");
        assert_eq!(res.attributes[1].value, "user");
        assert_eq!(res.attributes[2].value, ustc_amount.to_string());

        // At day 0, rate = 1.5, so 15 USTC / 1.5 = 10 USTR (in 18-decimal)
        // base_ustr = 10 * 10^18, user_bonus = 0 (no referral)
        assert_eq!(res.attributes[4].value, TEN_USTR.to_string()); // base_ustr
        assert_eq!(res.attributes[5].value, "0"); // user_bonus
        assert_eq!(res.attributes[6].value, TEN_USTR.to_string()); // total_ustr_to_user

        // Verify stats updated
        let stats = STATS.load(&deps.storage).unwrap();
        assert_eq!(stats.total_ustc_received, Uint128::from(ustc_amount));
        assert_eq!(stats.total_ustr_minted, Uint128::from(TEN_USTR));
        assert_eq!(stats.total_referral_bonus_minted, Uint128::zero());
        assert_eq!(stats.total_referral_swaps, 0);
        assert_eq!(stats.unique_referral_codes_used, 0);
    }

    #[test]
    fn test_swap_with_empty_referral_code() {
        let mut deps = mock_deps_with_referral(vec![]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        let ustc_amount = 15_000_000u128;
        let info = mock_info("user", &ustc_coins(ustc_amount));
        let msg = ExecuteMsg::Swap {
            referral_code: Some("".to_string()),
            leaderboard_hint: None,
        };

        // Empty code should be treated as no referral
        let res = execute(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.messages.len(), 2); // forward + mint to user only
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
        let info = mock_info("user", &ustc_coins(1_000_000));
        let msg = ExecuteMsg::Swap {
            referral_code: None,
            leaderboard_hint: None,
        };
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

    // ============ ADMIN TRANSFER TESTS ============

    #[test]
    fn test_propose_admin_success() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let new_admin = "new_admin_addr";
        let info = mock_info(ADMIN, &[]);
        let msg = ExecuteMsg::ProposeAdmin {
            new_admin: new_admin.to_string(),
        };

        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        assert_eq!(res.attributes[0].value, "propose_admin");
        assert_eq!(res.attributes[1].value, new_admin);

        // Verify pending admin stored
        let pending = PENDING_ADMIN.load(&deps.storage).unwrap();
        assert_eq!(pending.new_address.as_str(), new_admin);
        assert_eq!(
            pending.execute_after.seconds(),
            env.block.time.seconds() + ADMIN_TIMELOCK_DURATION
        );
    }

    #[test]
    fn test_propose_admin_unauthorized() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let info = mock_info("random_user", &[]);
        let msg = ExecuteMsg::ProposeAdmin {
            new_admin: "new_admin".to_string(),
        };

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_accept_admin_success() {
        let mut deps = mock_dependencies();
        let mut env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let new_admin = "new_admin_addr";

        // Propose admin change
        let info = mock_info(ADMIN, &[]);
        let msg = ExecuteMsg::ProposeAdmin {
            new_admin: new_admin.to_string(),
        };
        execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Advance time past timelock
        env.block.time = Timestamp::from_seconds(
            env.block.time.seconds() + ADMIN_TIMELOCK_DURATION + 1,
        );

        // Accept as new admin
        let info = mock_info(new_admin, &[]);
        let msg = ExecuteMsg::AcceptAdmin {};
        let res = execute(deps.as_mut(), env, info, msg).unwrap();

        assert_eq!(res.attributes[0].value, "accept_admin");
        assert_eq!(res.attributes[1].value, ADMIN);
        assert_eq!(res.attributes[2].value, new_admin);

        // Verify admin updated
        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.admin.as_str(), new_admin);

        // Verify pending cleared
        assert!(PENDING_ADMIN.may_load(&deps.storage).unwrap().is_none());
    }

    #[test]
    fn test_accept_admin_no_pending() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let info = mock_info("new_admin", &[]);
        let msg = ExecuteMsg::AcceptAdmin {};

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::NoPendingAdmin);
    }

    #[test]
    fn test_accept_admin_wrong_address() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Propose admin change
        let info = mock_info(ADMIN, &[]);
        let msg = ExecuteMsg::ProposeAdmin {
            new_admin: "new_admin".to_string(),
        };
        execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Try to accept as wrong address
        let info = mock_info("wrong_address", &[]);
        let msg = ExecuteMsg::AcceptAdmin {};

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::UnauthorizedPendingAdmin);
    }

    #[test]
    fn test_accept_admin_timelock_not_expired() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let new_admin = "new_admin";

        // Propose admin change
        let info = mock_info(ADMIN, &[]);
        let msg = ExecuteMsg::ProposeAdmin {
            new_admin: new_admin.to_string(),
        };
        execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Try to accept before timelock expires
        let info = mock_info(new_admin, &[]);
        let msg = ExecuteMsg::AcceptAdmin {};

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        match err {
            ContractError::TimelockNotExpired { remaining_seconds } => {
                assert!(remaining_seconds > 0);
            }
            _ => panic!("Expected TimelockNotExpired error"),
        }
    }

    #[test]
    fn test_cancel_admin_proposal_success() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Propose admin change
        let info = mock_info(ADMIN, &[]);
        let msg = ExecuteMsg::ProposeAdmin {
            new_admin: "new_admin".to_string(),
        };
        execute(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();

        // Cancel
        let msg = ExecuteMsg::CancelAdminProposal {};
        let res = execute(deps.as_mut(), env, info, msg).unwrap();

        assert_eq!(res.attributes[0].value, "cancel_admin_proposal");

        // Verify pending cleared
        assert!(PENDING_ADMIN.may_load(&deps.storage).unwrap().is_none());
    }

    #[test]
    fn test_cancel_admin_proposal_unauthorized() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Propose admin change
        let info = mock_info(ADMIN, &[]);
        let msg = ExecuteMsg::ProposeAdmin {
            new_admin: "new_admin".to_string(),
        };
        execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Try to cancel as non-admin
        let info = mock_info("random_user", &[]);
        let msg = ExecuteMsg::CancelAdminProposal {};

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_cancel_admin_proposal_no_pending() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let info = mock_info(ADMIN, &[]);
        let msg = ExecuteMsg::CancelAdminProposal {};

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::NoPendingAdmin);
    }

    // ============ EMERGENCY PAUSE/RESUME UNAUTHORIZED TESTS ============

    #[test]
    fn test_emergency_pause_unauthorized() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let info = mock_info("random_user", &[]);
        let msg = ExecuteMsg::EmergencyPause {};

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_emergency_resume_unauthorized() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // First pause
        let info = mock_info(ADMIN, &[]);
        let msg = ExecuteMsg::EmergencyPause {};
        execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Try to resume as non-admin
        let info = mock_info("random_user", &[]);
        let msg = ExecuteMsg::EmergencyResume {};

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    // ============ RECOVER ASSET TESTS ============

    #[test]
    fn test_recover_asset_native_success() {
        let mut deps = mock_dependencies();
        let mut env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Advance past swap period end
        env.block.time = Timestamp::from_seconds(env.block.time.seconds() + 8_640_001);

        let info = mock_info(ADMIN, &[]);
        let msg = ExecuteMsg::RecoverAsset {
            asset: AssetInfo::Native {
                denom: "uusd".to_string(),
            },
            amount: Uint128::from(1_000_000u128),
            recipient: "recipient_addr".to_string(),
        };

        let res = execute(deps.as_mut(), env, info, msg).unwrap();

        assert_eq!(res.attributes[0].value, "recover_asset");
        assert_eq!(res.attributes[1].value, "recipient_addr");
        assert_eq!(res.messages.len(), 1);
    }

    #[test]
    fn test_recover_asset_cw20_success() {
        let mut deps = mock_dependencies();
        let mut env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Advance past swap period end
        env.block.time = Timestamp::from_seconds(env.block.time.seconds() + 8_640_001);

        let cw20_addr = Addr::unchecked("cw20_token");

        let info = mock_info(ADMIN, &[]);
        let msg = ExecuteMsg::RecoverAsset {
            asset: AssetInfo::Cw20 {
                contract_addr: cw20_addr,
            },
            amount: Uint128::from(1_000_000u128),
            recipient: "recipient_addr".to_string(),
        };

        let res = execute(deps.as_mut(), env, info, msg).unwrap();

        assert_eq!(res.attributes[0].value, "recover_asset");
        assert_eq!(res.messages.len(), 1);
    }

    #[test]
    fn test_recover_asset_unauthorized() {
        let mut deps = mock_dependencies();
        let mut env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Advance past swap period end
        env.block.time = Timestamp::from_seconds(env.block.time.seconds() + 8_640_001);

        let info = mock_info("random_user", &[]);
        let msg = ExecuteMsg::RecoverAsset {
            asset: AssetInfo::Native {
                denom: "uusd".to_string(),
            },
            amount: Uint128::from(1_000_000u128),
            recipient: "recipient".to_string(),
        };

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    #[test]
    fn test_recover_asset_before_end() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Try to recover before swap period ends
        let info = mock_info(ADMIN, &[]);
        let msg = ExecuteMsg::RecoverAsset {
            asset: AssetInfo::Native {
                denom: "uusd".to_string(),
            },
            amount: Uint128::from(1_000_000u128),
            recipient: "recipient".to_string(),
        };

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::RecoveryNotAvailable);
    }

    // ============ QUERY TESTS ============

    #[test]
    fn test_query_config() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let start_time = env.block.time.seconds();
        setup_contract(deps.as_mut(), start_time);

        let res = query(deps.as_ref(), env, QueryMsg::Config {}).unwrap();
        let config: ConfigResponse = from_json(res).unwrap();

        assert_eq!(config.ustr_token.as_str(), USTR_TOKEN);
        assert_eq!(config.treasury.as_str(), TREASURY);
        assert_eq!(config.admin.as_str(), ADMIN);
        assert!(!config.paused);
        assert_eq!(config.start_rate, Decimal::from_ratio(15u128, 10u128));
        assert_eq!(config.end_rate, Decimal::from_ratio(25u128, 10u128));
    }

    #[test]
    fn test_query_current_rate() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let start_time = env.block.time.seconds();
        setup_contract(deps.as_mut(), start_time);

        let res = query(deps.as_ref(), env, QueryMsg::CurrentRate {}).unwrap();
        let rate: RateResponse = from_json(res).unwrap();

        assert_eq!(rate.rate, Decimal::from_ratio(15u128, 10u128)); // 1.5 at start
        assert_eq!(rate.elapsed_seconds, 0);
        assert_eq!(rate.total_seconds, 8_640_000);
    }

    #[test]
    fn test_query_swap_simulation() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let ustc_amount = Uint128::from(15_000_000u128); // 15 USTC
        let res = query(
            deps.as_ref(),
            env,
            QueryMsg::SwapSimulation {
                ustc_amount,
                referral_code: None,
            },
        )
        .unwrap();
        let sim: SimulationResponse = from_json(res).unwrap();

        assert_eq!(sim.ustc_amount, ustc_amount);
        // At rate 1.5: 15 USTC / 1.5 = 10 USTR (in 18-decimal)
        assert_eq!(sim.base_ustr_amount, Uint128::from(TEN_USTR));
        assert_eq!(sim.user_bonus, Uint128::zero());
        assert_eq!(sim.referrer_bonus, Uint128::zero());
        assert_eq!(sim.total_ustr_to_user, Uint128::from(TEN_USTR));
        assert_eq!(sim.rate, Decimal::from_ratio(15u128, 10u128));
        assert!(!sim.referral_valid);
    }

    #[test]
    fn test_query_status_before_start() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        // Set start time in the future
        setup_contract(deps.as_mut(), env.block.time.seconds() + 1000);

        let res = query(deps.as_ref(), env, QueryMsg::Status {}).unwrap();
        let status: StatusResponse = from_json(res).unwrap();

        assert!(!status.is_active);
        assert!(!status.has_started);
        assert!(!status.has_ended);
        assert!(!status.is_paused);
        assert_eq!(status.seconds_until_start, 1000);
    }

    #[test]
    fn test_query_status_active() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let res = query(deps.as_ref(), env, QueryMsg::Status {}).unwrap();
        let status: StatusResponse = from_json(res).unwrap();

        assert!(status.is_active);
        assert!(status.has_started);
        assert!(!status.has_ended);
        assert!(!status.is_paused);
        assert_eq!(status.seconds_until_start, 0);
        assert_eq!(status.seconds_remaining, 8_640_000);
    }

    #[test]
    fn test_query_status_ended() {
        let mut deps = mock_dependencies();
        let mut env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Advance past end
        env.block.time = Timestamp::from_seconds(env.block.time.seconds() + 8_640_001);

        let res = query(deps.as_ref(), env, QueryMsg::Status {}).unwrap();
        let status: StatusResponse = from_json(res).unwrap();

        assert!(!status.is_active);
        assert!(status.has_started);
        assert!(status.has_ended);
        assert!(!status.is_paused);
        assert_eq!(status.seconds_remaining, 0);
    }

    #[test]
    fn test_query_status_paused() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Pause
        let info = mock_info(ADMIN, &[]);
        let msg = ExecuteMsg::EmergencyPause {};
        execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        let res = query(deps.as_ref(), env, QueryMsg::Status {}).unwrap();
        let status: StatusResponse = from_json(res).unwrap();

        assert!(!status.is_active); // Not active when paused
        assert!(status.is_paused);
    }

    #[test]
    fn test_query_stats() {
        let mut deps = mock_deps_with_referral(vec![]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        // Initial stats should be zero
        let res = query(deps.as_ref(), env.clone(), QueryMsg::Stats {}).unwrap();
        let stats: StatsResponse = from_json(res).unwrap();
        assert_eq!(stats.total_ustc_received, Uint128::zero());
        assert_eq!(stats.total_ustr_minted, Uint128::zero());
        assert_eq!(stats.total_referral_bonus_minted, Uint128::zero());
        assert_eq!(stats.total_referral_swaps, 0);
        assert_eq!(stats.unique_referral_codes_used, 0);

        // Do a swap (without referral)
        let info = mock_info("user", &ustc_coins(15_000_000));
        let msg = ExecuteMsg::Swap {
            referral_code: None,
            leaderboard_hint: None,
        };
        execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Check updated stats
        let res = query(deps.as_ref(), env, QueryMsg::Stats {}).unwrap();
        let stats: StatsResponse = from_json(res).unwrap();
        assert_eq!(stats.total_ustc_received, Uint128::from(15_000_000u128));
        assert_eq!(stats.total_ustr_minted, Uint128::from(TEN_USTR));
        assert_eq!(stats.total_referral_bonus_minted, Uint128::zero()); // No referral used
        assert_eq!(stats.total_referral_swaps, 0);
        assert_eq!(stats.unique_referral_codes_used, 0);
    }

    #[test]
    fn test_query_pending_admin_none() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let res = query(deps.as_ref(), env, QueryMsg::PendingAdmin {}).unwrap();
        let pending: Option<PendingAdminResponse> = from_json(res).unwrap();
        assert!(pending.is_none());
    }

    #[test]
    fn test_query_pending_admin_some() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Propose admin change
        let info = mock_info(ADMIN, &[]);
        let msg = ExecuteMsg::ProposeAdmin {
            new_admin: "new_admin".to_string(),
        };
        execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        let res = query(deps.as_ref(), env, QueryMsg::PendingAdmin {}).unwrap();
        let pending: Option<PendingAdminResponse> = from_json(res).unwrap();
        assert!(pending.is_some());
        let pending = pending.unwrap();
        assert_eq!(pending.new_address.as_str(), "new_admin");
    }

    // ============ LEADERBOARD TESTS ============

    #[test]
    fn test_leaderboard_head_initialized() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Leaderboard head should be None initially
        let head = LEADERBOARD_HEAD.load(&deps.storage).unwrap();
        assert!(head.is_none());

        // Tail should also be None
        let tail = LEADERBOARD_TAIL.load(&deps.storage).unwrap();
        assert!(tail.is_none());

        // Size should be 0
        let size = LEADERBOARD_SIZE.load(&deps.storage).unwrap();
        assert_eq!(size, 0);
    }

    #[test]
    fn test_leaderboard_insert_single() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Manually insert a code into leaderboard to test the structure
        let code = "testcode";
        let code_stats = ReferralCodeStats {
            total_rewards_earned: Uint128::from(100u128),
            total_user_bonuses: Uint128::from(100u128),
            total_swaps: 1,
        };
        REFERRAL_CODE_STATS
            .save(&mut deps.storage, code, &code_stats)
            .unwrap();

        // Insert into leaderboard using try_insert (respects size tracking)
        try_insert_into_leaderboard(&mut deps.storage, code, Uint128::from(100u128), None).unwrap();

        // Verify head is set
        let head = LEADERBOARD_HEAD.load(&deps.storage).unwrap();
        assert_eq!(head, Some("testcode".to_string()));

        // Verify tail is set (same as head for single entry)
        let tail = LEADERBOARD_TAIL.load(&deps.storage).unwrap();
        assert_eq!(tail, Some("testcode".to_string()));

        // Verify size is 1
        let size = LEADERBOARD_SIZE.load(&deps.storage).unwrap();
        assert_eq!(size, 1);

        // Verify link structure
        let link = LEADERBOARD_LINKS.load(&deps.storage, code).unwrap();
        assert!(link.prev.is_none());
        assert!(link.next.is_none());
    }

    #[test]
    fn test_leaderboard_insert_multiple_sorted() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Insert three codes with different rewards
        // alpha: 100, beta: 200, gamma: 50
        let codes = vec![
            ("alpha", Uint128::from(100u128)),
            ("beta", Uint128::from(200u128)),
            ("gamma", Uint128::from(50u128)),
        ];

        for (code, rewards) in &codes {
            let code_stats = ReferralCodeStats {
                total_rewards_earned: *rewards,
                total_user_bonuses: *rewards,
                total_swaps: 1,
            };
            REFERRAL_CODE_STATS
                .save(&mut deps.storage, code, &code_stats)
                .unwrap();
            try_insert_into_leaderboard(&mut deps.storage, code, *rewards, None).unwrap();
        }

        // Verify sorted order: beta (200) -> alpha (100) -> gamma (50)
        let head = LEADERBOARD_HEAD.load(&deps.storage).unwrap();
        assert_eq!(head, Some("beta".to_string()));

        // Verify tail is gamma (lowest)
        let tail = LEADERBOARD_TAIL.load(&deps.storage).unwrap();
        assert_eq!(tail, Some("gamma".to_string()));

        // Verify size is 3
        let size = LEADERBOARD_SIZE.load(&deps.storage).unwrap();
        assert_eq!(size, 3);

        let beta_link = LEADERBOARD_LINKS.load(&deps.storage, "beta").unwrap();
        assert!(beta_link.prev.is_none());
        assert_eq!(beta_link.next, Some("alpha".to_string()));

        let alpha_link = LEADERBOARD_LINKS.load(&deps.storage, "alpha").unwrap();
        assert_eq!(alpha_link.prev, Some("beta".to_string()));
        assert_eq!(alpha_link.next, Some("gamma".to_string()));

        let gamma_link = LEADERBOARD_LINKS.load(&deps.storage, "gamma").unwrap();
        assert_eq!(gamma_link.prev, Some("alpha".to_string()));
        assert!(gamma_link.next.is_none());
    }

    #[test]
    fn test_leaderboard_remove_middle() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Insert three codes
        let codes = vec![
            ("alpha", Uint128::from(100u128)),
            ("beta", Uint128::from(200u128)),
            ("gamma", Uint128::from(50u128)),
        ];

        for (code, rewards) in &codes {
            let code_stats = ReferralCodeStats {
                total_rewards_earned: *rewards,
                total_user_bonuses: *rewards,
                total_swaps: 1,
            };
            REFERRAL_CODE_STATS
                .save(&mut deps.storage, code, &code_stats)
                .unwrap();
            try_insert_into_leaderboard(&mut deps.storage, code, *rewards, None).unwrap();
        }

        // Remove alpha (middle element)
        remove_from_leaderboard(&mut deps.storage, "alpha").unwrap();

        // Verify structure: beta (200) -> gamma (50)
        let head = LEADERBOARD_HEAD.load(&deps.storage).unwrap();
        assert_eq!(head, Some("beta".to_string()));

        // Verify tail is still gamma
        let tail = LEADERBOARD_TAIL.load(&deps.storage).unwrap();
        assert_eq!(tail, Some("gamma".to_string()));

        // Verify size decreased
        let size = LEADERBOARD_SIZE.load(&deps.storage).unwrap();
        assert_eq!(size, 2);

        let beta_link = LEADERBOARD_LINKS.load(&deps.storage, "beta").unwrap();
        assert!(beta_link.prev.is_none());
        assert_eq!(beta_link.next, Some("gamma".to_string()));

        let gamma_link = LEADERBOARD_LINKS.load(&deps.storage, "gamma").unwrap();
        assert_eq!(gamma_link.prev, Some("beta".to_string()));
        assert!(gamma_link.next.is_none());

        // Verify alpha is removed
        assert!(LEADERBOARD_LINKS.may_load(&deps.storage, "alpha").unwrap().is_none());
    }

    #[test]
    fn test_leaderboard_remove_head() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Insert two codes
        let codes = vec![
            ("alpha", Uint128::from(100u128)),
            ("beta", Uint128::from(200u128)),
        ];

        for (code, rewards) in &codes {
            let code_stats = ReferralCodeStats {
                total_rewards_earned: *rewards,
                total_user_bonuses: *rewards,
                total_swaps: 1,
            };
            REFERRAL_CODE_STATS
                .save(&mut deps.storage, code, &code_stats)
                .unwrap();
            try_insert_into_leaderboard(&mut deps.storage, code, *rewards, None).unwrap();
        }

        // Remove beta (head)
        remove_from_leaderboard(&mut deps.storage, "beta").unwrap();

        // Verify structure: alpha is now head and tail
        let head = LEADERBOARD_HEAD.load(&deps.storage).unwrap();
        assert_eq!(head, Some("alpha".to_string()));

        let tail = LEADERBOARD_TAIL.load(&deps.storage).unwrap();
        assert_eq!(tail, Some("alpha".to_string()));

        let size = LEADERBOARD_SIZE.load(&deps.storage).unwrap();
        assert_eq!(size, 1);

        let alpha_link = LEADERBOARD_LINKS.load(&deps.storage, "alpha").unwrap();
        assert!(alpha_link.prev.is_none());
        assert!(alpha_link.next.is_none());
    }

    #[test]
    fn test_leaderboard_top_50_cap() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Insert 50 codes (the max)
        for i in 0..50 {
            let code = format!("code{:02}", i);
            let rewards = Uint128::from((50 - i) as u128 * 100); // Higher rewards for lower i
            let code_stats = ReferralCodeStats {
                total_rewards_earned: rewards,
                total_user_bonuses: rewards,
                total_swaps: 1,
            };
            REFERRAL_CODE_STATS
                .save(&mut deps.storage, &code, &code_stats)
                .unwrap();
            try_insert_into_leaderboard(&mut deps.storage, &code, rewards, None).unwrap();
        }

        // Verify size is 50
        let size = LEADERBOARD_SIZE.load(&deps.storage).unwrap();
        assert_eq!(size, 50);

        // Verify head is code00 (highest rewards: 5000)
        let head = LEADERBOARD_HEAD.load(&deps.storage).unwrap();
        assert_eq!(head, Some("code00".to_string()));

        // Verify tail is code49 (lowest rewards: 100)
        let tail = LEADERBOARD_TAIL.load(&deps.storage).unwrap();
        assert_eq!(tail, Some("code49".to_string()));

        // Try to insert a code with rewards lower than tail - should not enter
        let low_code = "lowcode";
        let low_rewards = Uint128::from(50u128); // Less than tail's 100
        let code_stats = ReferralCodeStats {
            total_rewards_earned: low_rewards,
            total_user_bonuses: low_rewards,
            total_swaps: 1,
        };
        REFERRAL_CODE_STATS
            .save(&mut deps.storage, low_code, &code_stats)
            .unwrap();
        try_insert_into_leaderboard(&mut deps.storage, low_code, low_rewards, None).unwrap();

        // Size should still be 50
        let size = LEADERBOARD_SIZE.load(&deps.storage).unwrap();
        assert_eq!(size, 50);

        // lowcode should not be in leaderboard
        assert!(LEADERBOARD_LINKS.may_load(&deps.storage, low_code).unwrap().is_none());

        // Try to insert a code with rewards higher than tail - should enter
        let high_code = "highcode";
        let high_rewards = Uint128::from(150u128); // More than tail's 100
        let code_stats = ReferralCodeStats {
            total_rewards_earned: high_rewards,
            total_user_bonuses: high_rewards,
            total_swaps: 1,
        };
        REFERRAL_CODE_STATS
            .save(&mut deps.storage, high_code, &code_stats)
            .unwrap();
        try_insert_into_leaderboard(&mut deps.storage, high_code, high_rewards, None).unwrap();

        // Size should still be 50 (replaced tail)
        let size = LEADERBOARD_SIZE.load(&deps.storage).unwrap();
        assert_eq!(size, 50);

        // highcode should be in leaderboard
        assert!(LEADERBOARD_LINKS.may_load(&deps.storage, high_code).unwrap().is_some());

        // code49 (old tail with 100 rewards) should be removed
        assert!(LEADERBOARD_LINKS.may_load(&deps.storage, "code49").unwrap().is_none());

        // New tail should be highcode (150) since it's less than code48 (200)
        let tail = LEADERBOARD_TAIL.load(&deps.storage).unwrap();
        assert_eq!(tail, Some("highcode".to_string()));

        // Verify highcode is correctly positioned (after code48)
        let highcode_link = LEADERBOARD_LINKS.load(&deps.storage, "highcode").unwrap();
        assert_eq!(highcode_link.prev, Some("code48".to_string()));
        assert!(highcode_link.next.is_none()); // It's the tail
    }

    #[test]
    fn test_query_referral_leaderboard_empty() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let res = query(
            deps.as_ref(),
            env,
            QueryMsg::ReferralLeaderboard {
                start_after: None,
                limit: None,
            },
        )
        .unwrap();
        let leaderboard: ReferralLeaderboardResponse = from_json(res).unwrap();

        assert!(leaderboard.entries.is_empty());
        assert!(!leaderboard.has_more);
    }

    // ============ HINT-BASED INSERTION TESTS ============

    #[test]
    fn test_leaderboard_hint_correct() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Insert three codes: alpha (300), beta (200), gamma (100)
        let codes = vec![
            ("alpha", Uint128::from(300u128)),
            ("beta", Uint128::from(200u128)),
            ("gamma", Uint128::from(100u128)),
        ];

        for (code, rewards) in &codes {
            let code_stats = ReferralCodeStats {
                total_rewards_earned: *rewards,
                total_user_bonuses: *rewards,
                total_swaps: 1,
            };
            REFERRAL_CODE_STATS
                .save(&mut deps.storage, code, &code_stats)
                .unwrap();
            try_insert_into_leaderboard(&mut deps.storage, code, *rewards, None).unwrap();
        }

        // Now insert "delta" with 150 rewards, with correct hint (after beta)
        let delta_rewards = Uint128::from(150u128);
        let code_stats = ReferralCodeStats {
            total_rewards_earned: delta_rewards,
            total_user_bonuses: delta_rewards,
            total_swaps: 1,
        };
        REFERRAL_CODE_STATS
            .save(&mut deps.storage, "delta", &code_stats)
            .unwrap();

        let hint = crate::msg::LeaderboardHint {
            insert_after: Some("beta".to_string()),
        };
        try_insert_into_leaderboard(&mut deps.storage, "delta", delta_rewards, Some(&hint)).unwrap();

        // Verify order: alpha (300) -> beta (200) -> delta (150) -> gamma (100)
        let delta_link = LEADERBOARD_LINKS.load(&deps.storage, "delta").unwrap();
        assert_eq!(delta_link.prev, Some("beta".to_string()));
        assert_eq!(delta_link.next, Some("gamma".to_string()));
    }

    #[test]
    fn test_leaderboard_hint_too_high_fallback_down() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Insert: alpha (400), beta (300), gamma (200), epsilon (100)
        let codes = vec![
            ("alpha", Uint128::from(400u128)),
            ("beta", Uint128::from(300u128)),
            ("gamma", Uint128::from(200u128)),
            ("epsilon", Uint128::from(100u128)),
        ];

        for (code, rewards) in &codes {
            let code_stats = ReferralCodeStats {
                total_rewards_earned: *rewards,
                total_user_bonuses: *rewards,
                total_swaps: 1,
            };
            REFERRAL_CODE_STATS
                .save(&mut deps.storage, code, &code_stats)
                .unwrap();
            try_insert_into_leaderboard(&mut deps.storage, code, *rewards, None).unwrap();
        }

        // Insert "delta" with 150 rewards, but hint says after alpha (wrong - too high)
        let delta_rewards = Uint128::from(150u128);
        let code_stats = ReferralCodeStats {
            total_rewards_earned: delta_rewards,
            total_user_bonuses: delta_rewards,
            total_swaps: 1,
        };
        REFERRAL_CODE_STATS
            .save(&mut deps.storage, "delta", &code_stats)
            .unwrap();

        let hint = crate::msg::LeaderboardHint {
            insert_after: Some("alpha".to_string()), // Wrong! Should be after gamma
        };
        try_insert_into_leaderboard(&mut deps.storage, "delta", delta_rewards, Some(&hint)).unwrap();

        // Should fall back and find correct position: after gamma (200), before epsilon (100)
        let delta_link = LEADERBOARD_LINKS.load(&deps.storage, "delta").unwrap();
        assert_eq!(delta_link.prev, Some("gamma".to_string()));
        assert_eq!(delta_link.next, Some("epsilon".to_string()));
    }

    #[test]
    fn test_leaderboard_hint_too_low_fallback_up() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Insert: alpha (400), beta (300), gamma (200), epsilon (100)
        let codes = vec![
            ("alpha", Uint128::from(400u128)),
            ("beta", Uint128::from(300u128)),
            ("gamma", Uint128::from(200u128)),
            ("epsilon", Uint128::from(100u128)),
        ];

        for (code, rewards) in &codes {
            let code_stats = ReferralCodeStats {
                total_rewards_earned: *rewards,
                total_user_bonuses: *rewards,
                total_swaps: 1,
            };
            REFERRAL_CODE_STATS
                .save(&mut deps.storage, code, &code_stats)
                .unwrap();
            try_insert_into_leaderboard(&mut deps.storage, code, *rewards, None).unwrap();
        }

        // Insert "delta" with 350 rewards, but hint says after gamma (wrong - too low)
        let delta_rewards = Uint128::from(350u128);
        let code_stats = ReferralCodeStats {
            total_rewards_earned: delta_rewards,
            total_user_bonuses: delta_rewards,
            total_swaps: 1,
        };
        REFERRAL_CODE_STATS
            .save(&mut deps.storage, "delta", &code_stats)
            .unwrap();

        let hint = crate::msg::LeaderboardHint {
            insert_after: Some("gamma".to_string()), // Wrong! Should be after alpha
        };
        try_insert_into_leaderboard(&mut deps.storage, "delta", delta_rewards, Some(&hint)).unwrap();

        // Should fall back and find correct position: after alpha (400), before beta (300)
        let delta_link = LEADERBOARD_LINKS.load(&deps.storage, "delta").unwrap();
        assert_eq!(delta_link.prev, Some("alpha".to_string()));
        assert_eq!(delta_link.next, Some("beta".to_string()));
    }

    #[test]
    fn test_leaderboard_hint_new_head() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Insert: alpha (300), beta (200)
        let codes = vec![
            ("alpha", Uint128::from(300u128)),
            ("beta", Uint128::from(200u128)),
        ];

        for (code, rewards) in &codes {
            let code_stats = ReferralCodeStats {
                total_rewards_earned: *rewards,
                total_user_bonuses: *rewards,
                total_swaps: 1,
            };
            REFERRAL_CODE_STATS
                .save(&mut deps.storage, code, &code_stats)
                .unwrap();
            try_insert_into_leaderboard(&mut deps.storage, code, *rewards, None).unwrap();
        }

        // Insert "delta" with 500 rewards, hint says new head (insert_after: None)
        let delta_rewards = Uint128::from(500u128);
        let code_stats = ReferralCodeStats {
            total_rewards_earned: delta_rewards,
            total_user_bonuses: delta_rewards,
            total_swaps: 1,
        };
        REFERRAL_CODE_STATS
            .save(&mut deps.storage, "delta", &code_stats)
            .unwrap();

        let hint = crate::msg::LeaderboardHint {
            insert_after: None, // We claim to be new head
        };
        try_insert_into_leaderboard(&mut deps.storage, "delta", delta_rewards, Some(&hint)).unwrap();

        // Verify delta is the new head
        let head = LEADERBOARD_HEAD.load(&deps.storage).unwrap();
        assert_eq!(head, Some("delta".to_string()));

        let delta_link = LEADERBOARD_LINKS.load(&deps.storage, "delta").unwrap();
        assert!(delta_link.prev.is_none());
        assert_eq!(delta_link.next, Some("alpha".to_string()));
    }

    #[test]
    fn test_leaderboard_hint_invalid_code_fallback() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Insert: alpha (300), beta (200)
        let codes = vec![
            ("alpha", Uint128::from(300u128)),
            ("beta", Uint128::from(200u128)),
        ];

        for (code, rewards) in &codes {
            let code_stats = ReferralCodeStats {
                total_rewards_earned: *rewards,
                total_user_bonuses: *rewards,
                total_swaps: 1,
            };
            REFERRAL_CODE_STATS
                .save(&mut deps.storage, code, &code_stats)
                .unwrap();
            try_insert_into_leaderboard(&mut deps.storage, code, *rewards, None).unwrap();
        }

        // Insert "delta" with 150 rewards, hint points to non-existent code
        let delta_rewards = Uint128::from(150u128);
        let code_stats = ReferralCodeStats {
            total_rewards_earned: delta_rewards,
            total_user_bonuses: delta_rewards,
            total_swaps: 1,
        };
        REFERRAL_CODE_STATS
            .save(&mut deps.storage, "delta", &code_stats)
            .unwrap();

        let hint = crate::msg::LeaderboardHint {
            insert_after: Some("nonexistent".to_string()), // Invalid hint
        };
        try_insert_into_leaderboard(&mut deps.storage, "delta", delta_rewards, Some(&hint)).unwrap();

        // Should fall back to standard insertion and find correct position
        let delta_link = LEADERBOARD_LINKS.load(&deps.storage, "delta").unwrap();
        assert_eq!(delta_link.prev, Some("beta".to_string()));
        assert!(delta_link.next.is_none()); // Delta is the new tail
    }

    #[test]
    fn test_leaderboard_hint_points_to_displaced_tail() {
        // Regression test: when the hint points to the tail that gets displaced,
        // the insertion should still work correctly using the tail's predecessor
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Fill leaderboard to capacity (50 entries)
        // code00 has highest rewards (5000), code49 has lowest (100)
        for i in 0..50 {
            let code = format!("code{:02}", i);
            let rewards = Uint128::from((50 - i) as u128 * 100);
            let code_stats = ReferralCodeStats {
                total_rewards_earned: rewards,
                total_user_bonuses: rewards,
                total_swaps: 1,
            };
            REFERRAL_CODE_STATS
                .save(&mut deps.storage, &code, &code_stats)
                .unwrap();
            try_insert_into_leaderboard(&mut deps.storage, &code, rewards, None).unwrap();
        }

        // Verify initial state
        let size = LEADERBOARD_SIZE.load(&deps.storage).unwrap();
        assert_eq!(size, 50);
        let tail = LEADERBOARD_TAIL.load(&deps.storage).unwrap();
        assert_eq!(tail, Some("code49".to_string())); // tail has 100 rewards

        // Now insert "newcode" with 150 rewards, but with a hint pointing to the tail
        // This simulates a stale hint where the frontend computed insert_after = tail
        // before the tail was displaced
        let new_rewards = Uint128::from(150u128);
        let code_stats = ReferralCodeStats {
            total_rewards_earned: new_rewards,
            total_user_bonuses: new_rewards,
            total_swaps: 1,
        };
        REFERRAL_CODE_STATS
            .save(&mut deps.storage, "newcode", &code_stats)
            .unwrap();

        // Hint points to tail (code49) which will be displaced
        let hint = crate::msg::LeaderboardHint {
            insert_after: Some("code49".to_string()),
        };
        let inserted = try_insert_into_leaderboard(
            &mut deps.storage,
            "newcode",
            new_rewards,
            Some(&hint),
        )
        .unwrap();

        // Should successfully insert
        assert!(inserted);

        // Size should still be 50
        let size = LEADERBOARD_SIZE.load(&deps.storage).unwrap();
        assert_eq!(size, 50);

        // code49 should be displaced (no longer in leaderboard)
        assert!(LEADERBOARD_LINKS
            .may_load(&deps.storage, "code49")
            .unwrap()
            .is_none());

        // newcode should be in leaderboard
        let newcode_link = LEADERBOARD_LINKS.load(&deps.storage, "newcode").unwrap();
        
        // newcode (150) should be after code48 (200) and be the new tail
        assert_eq!(newcode_link.prev, Some("code48".to_string()));
        assert!(newcode_link.next.is_none());

        // Tail pointer should be updated to newcode
        let new_tail = LEADERBOARD_TAIL.load(&deps.storage).unwrap();
        assert_eq!(new_tail, Some("newcode".to_string()));
    }

    // ============ LEADERBOARD EVENT EMISSION TESTS ============

    #[test]
    fn test_leaderboard_event_new_entry() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Setup code stats
        let code = "testcode";
        let rewards = Uint128::from(100u128);
        let code_stats = ReferralCodeStats {
            total_rewards_earned: rewards,
            total_user_bonuses: rewards,
            total_swaps: 1,
        };
        REFERRAL_CODE_STATS
            .save(&mut deps.storage, code, &code_stats)
            .unwrap();

        // Call update_leaderboard for a new entry
        let change = update_leaderboard(
            &mut deps.storage,
            code,
            rewards,
            None,
        )
        .unwrap();

        // Verify the change info
        assert!(change.is_some());
        let change = change.unwrap();
        assert_eq!(change.action, LeaderboardAction::NewEntry);
        assert_eq!(change.position, Some(1)); // First entry is position 1
    }

    #[test]
    fn test_leaderboard_event_position_up() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Setup two codes - alpha at 100, beta at 200
        let codes = vec![
            ("alpha", Uint128::from(100u128)),
            ("beta", Uint128::from(200u128)),
        ];

        for (code, rewards) in &codes {
            let code_stats = ReferralCodeStats {
                total_rewards_earned: *rewards,
                total_user_bonuses: *rewards,
                total_swaps: 1,
            };
            REFERRAL_CODE_STATS
                .save(&mut deps.storage, code, &code_stats)
                .unwrap();
            try_insert_into_leaderboard(&mut deps.storage, code, *rewards, None).unwrap();
        }

        // Verify initial order: beta (200) -> alpha (100)
        let head = LEADERBOARD_HEAD.load(&deps.storage).unwrap();
        assert_eq!(head, Some("beta".to_string()));

        // Now alpha earns more rewards and should move up
        let new_alpha_rewards = Uint128::from(300u128);
        let alpha_stats = ReferralCodeStats {
            total_rewards_earned: new_alpha_rewards,
            total_user_bonuses: new_alpha_rewards,
            total_swaps: 2,
        };
        REFERRAL_CODE_STATS
            .save(&mut deps.storage, "alpha", &alpha_stats)
            .unwrap();

        let change = update_leaderboard(
            &mut deps.storage,
            "alpha",
            new_alpha_rewards,
            None,
        )
        .unwrap();

        // Verify the change info
        assert!(change.is_some());
        let change = change.unwrap();
        assert_eq!(change.action, LeaderboardAction::PositionUp);
        assert_eq!(change.position, Some(1)); // Alpha is now #1

        // Verify new order: alpha (300) -> beta (200)
        let head = LEADERBOARD_HEAD.load(&deps.storage).unwrap();
        assert_eq!(head, Some("alpha".to_string()));
    }

    #[test]
    fn test_leaderboard_event_no_change() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Setup two codes - alpha at 100, beta at 200
        let codes = vec![
            ("alpha", Uint128::from(100u128)),
            ("beta", Uint128::from(200u128)),
        ];

        for (code, rewards) in &codes {
            let code_stats = ReferralCodeStats {
                total_rewards_earned: *rewards,
                total_user_bonuses: *rewards,
                total_swaps: 1,
            };
            REFERRAL_CODE_STATS
                .save(&mut deps.storage, code, &code_stats)
                .unwrap();
            try_insert_into_leaderboard(&mut deps.storage, code, *rewards, None).unwrap();
        }

        // Alpha earns a bit more but not enough to pass beta
        let new_alpha_rewards = Uint128::from(150u128);
        let alpha_stats = ReferralCodeStats {
            total_rewards_earned: new_alpha_rewards,
            total_user_bonuses: new_alpha_rewards,
            total_swaps: 2,
        };
        REFERRAL_CODE_STATS
            .save(&mut deps.storage, "alpha", &alpha_stats)
            .unwrap();

        let change = update_leaderboard(
            &mut deps.storage,
            "alpha",
            new_alpha_rewards,
            None,
        )
        .unwrap();

        // Verify the change info
        assert!(change.is_some());
        let change = change.unwrap();
        assert_eq!(change.action, LeaderboardAction::NoChange);
        assert_eq!(change.position, Some(2)); // Alpha stays at #2

        // Verify order unchanged: beta (200) -> alpha (150)
        let head = LEADERBOARD_HEAD.load(&deps.storage).unwrap();
        assert_eq!(head, Some("beta".to_string()));
    }

    #[test]
    fn test_leaderboard_event_new_entry_with_displacement() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Fill leaderboard to capacity (50 entries)
        for i in 0..50 {
            let code = format!("code{}", i);
            let rewards = Uint128::from((100 + i) as u128);
            let code_stats = ReferralCodeStats {
                total_rewards_earned: rewards,
                total_user_bonuses: rewards,
                total_swaps: 1,
            };
            REFERRAL_CODE_STATS
                .save(&mut deps.storage, &code, &code_stats)
                .unwrap();
            try_insert_into_leaderboard(&mut deps.storage, &code, rewards, None).unwrap();
        }

        // Verify leaderboard is full
        let size = LEADERBOARD_SIZE.load(&deps.storage).unwrap();
        assert_eq!(size, 50);

        // Get the current tail (lowest rewards - code0 with 100)
        let tail = LEADERBOARD_TAIL.load(&deps.storage).unwrap();
        assert_eq!(tail, Some("code0".to_string()));

        // Add a new code with higher rewards than the tail
        let new_code = "newcode";
        let new_rewards = Uint128::from(105u128); // Higher than code0 (100) but lower than code1 (101)
        let new_stats = ReferralCodeStats {
            total_rewards_earned: new_rewards,
            total_user_bonuses: new_rewards,
            total_swaps: 1,
        };
        REFERRAL_CODE_STATS
            .save(&mut deps.storage, new_code, &new_stats)
            .unwrap();

        let change = update_leaderboard(
            &mut deps.storage,
            new_code,
            new_rewards,
            None,
        )
        .unwrap();

        // Verify the change info
        assert!(change.is_some());
        let change = change.unwrap();
        assert_eq!(change.action, LeaderboardAction::NewEntry);
        assert!(change.position.is_some());

        // Verify code0 was displaced (no longer in leaderboard)
        assert!(LEADERBOARD_LINKS
            .may_load(&deps.storage, "code0")
            .unwrap()
            .is_none());

        // Verify newcode is in leaderboard
        assert!(LEADERBOARD_LINKS
            .may_load(&deps.storage, new_code)
            .unwrap()
            .is_some());

        // Size should still be 50
        let size = LEADERBOARD_SIZE.load(&deps.storage).unwrap();
        assert_eq!(size, 50);
    }

    #[test]
    fn test_leaderboard_event_no_qualification() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Fill leaderboard to capacity (50 entries)
        for i in 0..50 {
            let code = format!("code{}", i);
            let rewards = Uint128::from((100 + i) as u128);
            let code_stats = ReferralCodeStats {
                total_rewards_earned: rewards,
                total_user_bonuses: rewards,
                total_swaps: 1,
            };
            REFERRAL_CODE_STATS
                .save(&mut deps.storage, &code, &code_stats)
                .unwrap();
            try_insert_into_leaderboard(&mut deps.storage, &code, rewards, None).unwrap();
        }

        // Add a new code with LOWER rewards than the tail
        let new_code = "lowcode";
        let new_rewards = Uint128::from(50u128); // Lower than code0 (100)
        let new_stats = ReferralCodeStats {
            total_rewards_earned: new_rewards,
            total_user_bonuses: new_rewards,
            total_swaps: 1,
        };
        REFERRAL_CODE_STATS
            .save(&mut deps.storage, new_code, &new_stats)
            .unwrap();

        let change = update_leaderboard(
            &mut deps.storage,
            new_code,
            new_rewards,
            None,
        )
        .unwrap();

        // Should return None - code didn't qualify
        assert!(change.is_none());

        // Verify lowcode is NOT in leaderboard
        assert!(LEADERBOARD_LINKS
            .may_load(&deps.storage, new_code)
            .unwrap()
            .is_none());
    }

    #[test]
    fn test_leaderboard_event_position_attribute_correct() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Insert three codes in specific order
        // beta: 300, alpha: 200, gamma: 100
        let codes = vec![
            ("alpha", Uint128::from(200u128)),
            ("beta", Uint128::from(300u128)),
            ("gamma", Uint128::from(100u128)),
        ];

        for (code, rewards) in &codes {
            let code_stats = ReferralCodeStats {
                total_rewards_earned: *rewards,
                total_user_bonuses: *rewards,
                total_swaps: 1,
            };
            REFERRAL_CODE_STATS
                .save(&mut deps.storage, code, &code_stats)
                .unwrap();
            try_insert_into_leaderboard(&mut deps.storage, code, *rewards, None).unwrap();
        }

        // Add delta at position 3 (150 - between alpha and gamma)
        let delta_rewards = Uint128::from(150u128);
        let delta_stats = ReferralCodeStats {
            total_rewards_earned: delta_rewards,
            total_user_bonuses: delta_rewards,
            total_swaps: 1,
        };
        REFERRAL_CODE_STATS
            .save(&mut deps.storage, "delta", &delta_stats)
            .unwrap();

        let change = update_leaderboard(
            &mut deps.storage,
            "delta",
            delta_rewards,
            None,
        )
        .unwrap();

        // Verify position is 3 (beta=1, alpha=2, delta=3, gamma=4)
        assert!(change.is_some());
        let change = change.unwrap();
        assert_eq!(change.action, LeaderboardAction::NewEntry);
        assert_eq!(change.position, Some(3));
    }

    // ============ REFERRAL CODE TESTS WITH MOCK QUERIER ============

    use std::collections::HashMap;

    /// Default USTR total supply for tests (1 billion USTR in 18-decimal)
    const DEFAULT_USTR_TOTAL_SUPPLY: u128 = 1_000_000_000_000_000_000_000_000_000;

    /// Custom mock querier that handles referral and USTR token queries
    struct ReferralMockQuerier {
        base: MockQuerier<Empty>,
        referral_codes: HashMap<String, (bool, bool, Option<String>)>, // (is_valid_format, is_registered, owner)
        ustr_total_supply: Uint128,
    }

    impl ReferralMockQuerier {
        fn new() -> Self {
            Self {
                base: MockQuerier::new(&[]),
                referral_codes: HashMap::new(),
                ustr_total_supply: Uint128::from(DEFAULT_USTR_TOTAL_SUPPLY),
            }
        }

        fn with_referral_code(
            mut self,
            code: &str,
            is_valid_format: bool,
            is_registered: bool,
            owner: Option<&str>,
        ) -> Self {
            self.referral_codes.insert(
                code.to_lowercase(),
                (is_valid_format, is_registered, owner.map(|s| s.to_string())),
            );
            self
        }

        fn with_ustr_total_supply(mut self, supply: Uint128) -> Self {
            self.ustr_total_supply = supply;
            self
        }
    }

    impl Querier for ReferralMockQuerier {
        fn raw_query(&self, bin_request: &[u8]) -> QuerierResult {
            let request: QueryRequest<Empty> = match from_json(bin_request) {
                Ok(v) => v,
                Err(e) => {
                    return SystemResult::Err(SystemError::InvalidRequest {
                        error: format!("Parsing query request: {}", e),
                        request: bin_request.into(),
                    })
                }
            };

            match request {
                QueryRequest::Wasm(WasmQuery::Smart { contract_addr, msg }) => {
                    // Check if this is a USTR token query
                    if contract_addr == USTR_TOKEN {
                        // Try to parse as CW20 query
                        let query_msg: Result<Cw20QueryMsg, _> = from_json(&msg);
                        if let Ok(Cw20QueryMsg::TokenInfo {}) = query_msg {
                            let response = TokenInfoResponse {
                                name: "USTR Token".to_string(),
                                symbol: "USTR".to_string(),
                                decimals: 18,
                                total_supply: self.ustr_total_supply,
                            };
                            return SystemResult::Ok(ContractResult::Ok(
                                to_json_binary(&response).unwrap(),
                            ));
                        }
                        self.base.raw_query(bin_request)
                    }
                    // Check if this is a referral contract query
                    else if contract_addr == REFERRAL {
                        let query_msg: ReferralQueryMsg = match from_json(&msg) {
                            Ok(v) => v,
                            Err(e) => {
                                return SystemResult::Err(SystemError::InvalidRequest {
                                    error: format!("Parsing referral query: {}", e),
                                    request: msg.into(),
                                })
                            }
                        };

                        match query_msg {
                            ReferralQueryMsg::ValidateCode { code } => {
                                let normalized = code.to_lowercase();
                                let (is_valid_format, is_registered, owner) = self
                                    .referral_codes
                                    .get(&normalized)
                                    .cloned()
                                    .unwrap_or((false, false, None));

                                let response = ReferralValidateResponse {
                                    is_valid_format,
                                    is_registered,
                                    owner: owner.map(|o| Addr::unchecked(o)),
                                };

                                SystemResult::Ok(ContractResult::Ok(
                                    to_json_binary(&response).unwrap(),
                                ))
                            }
                        }
                    } else {
                        self.base.raw_query(bin_request)
                    }
                }
                _ => self.base.raw_query(bin_request),
            }
        }
    }

    fn mock_deps_with_referral(
        codes: Vec<(&str, bool, bool, Option<&str>)>,
    ) -> OwnedDeps<MockStorage, MockApi, ReferralMockQuerier, Empty> {
        let mut querier = ReferralMockQuerier::new();
        for (code, is_valid_format, is_registered, owner) in codes {
            querier = querier.with_referral_code(code, is_valid_format, is_registered, owner);
        }
        OwnedDeps {
            storage: MockStorage::default(),
            api: MockApi::default(),
            querier,
            custom_query_type: std::marker::PhantomData,
        }
    }


    fn setup_contract_with_querier(
        deps: DepsMut<Empty>,
        start_time: u64,
    ) {
        let msg = InstantiateMsg {
            ustr_token: USTR_TOKEN.to_string(),
            treasury: TREASURY.to_string(),
            referral: REFERRAL.to_string(),
            start_time,
            start_rate: Decimal::from_ratio(15u128, 10u128),
            end_rate: Decimal::from_ratio(25u128, 10u128),
            duration_seconds: None,
            admin: ADMIN.to_string(),
        };
        let info = mock_info("creator", &[]);
        instantiate(deps, mock_env(), info, msg).unwrap();
    }

    #[test]
    fn test_swap_with_valid_referral_code() {
        // Setup with a valid, registered referral code
        let mut deps = mock_deps_with_referral(vec![
            ("TESTCODE", true, true, Some("referrer_addr")),
        ]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        let ustc_amount = 15_000_000u128; // 15 USTC
        let info = mock_info("user", &ustc_coins(ustc_amount));
        let msg = ExecuteMsg::Swap {
            referral_code: Some("TESTCODE".to_string()),
            leaderboard_hint: None,
        };

        let res = execute(deps.as_mut(), env, info, msg).unwrap();

        // Should have 3 messages: forward USTC, mint to user, mint to referrer
        assert_eq!(res.messages.len(), 3);

        // Check attributes
        assert_eq!(res.attributes[0].value, "swap");
        assert_eq!(res.attributes[1].value, "user");

        // At day 0, rate = 1.5, so 15 USTC / 1.5 = 10 USTR base (in 18-decimal)
        // user_bonus = 10% of 10 USTR = 1 USTR
        // referrer_bonus = 10% of 10 USTR = 1 USTR
        let base_ustr = TEN_USTR;
        let bonus = ONE_USTR; // 10% of TEN_USTR

        assert_eq!(res.attributes[4].value, base_ustr.to_string()); // base_ustr
        assert_eq!(res.attributes[5].value, bonus.to_string()); // user_bonus
        assert_eq!(
            res.attributes[6].value,
            (base_ustr + bonus).to_string()
        ); // total_ustr_to_user

        // Check referrer attributes
        assert_eq!(res.attributes[7].value, "referrer_addr");
        assert_eq!(res.attributes[8].value, bonus.to_string()); // referrer_bonus

        // Verify stats updated
        let stats = STATS.load(&deps.storage).unwrap();
        assert_eq!(stats.total_ustc_received, Uint128::from(ustc_amount));
        assert_eq!(
            stats.total_ustr_minted,
            Uint128::from(base_ustr + bonus + bonus)
        );
        assert_eq!(
            stats.total_referral_bonus_minted,
            Uint128::from(bonus + bonus)
        );
        assert_eq!(stats.total_referral_swaps, 1);
        assert_eq!(stats.unique_referral_codes_used, 1);

        // Verify per-code stats created
        let code_stats = REFERRAL_CODE_STATS
            .load(&deps.storage, "testcode")
            .unwrap();
        assert_eq!(code_stats.total_rewards_earned, Uint128::from(bonus));
        assert_eq!(code_stats.total_user_bonuses, Uint128::from(bonus));
        assert_eq!(code_stats.total_swaps, 1);

        // Verify leaderboard updated
        let head = LEADERBOARD_HEAD.load(&deps.storage).unwrap();
        assert_eq!(head, Some("testcode".to_string()));
    }

    #[test]
    fn test_swap_with_invalid_format_referral_code() {
        // Setup with an invalid format code
        let mut deps = mock_deps_with_referral(vec![
            ("BAD!", false, false, None),
        ]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        let info = mock_info("user", &ustc_coins(15_000_000));
        let msg = ExecuteMsg::Swap {
            referral_code: Some("BAD!".to_string()),
            leaderboard_hint: None,
        };

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        match err {
            ContractError::InvalidReferralCode { code } => {
                assert_eq!(code, "BAD!");
            }
            _ => panic!("Expected InvalidReferralCode error, got: {:?}", err),
        }
    }

    #[test]
    fn test_swap_with_unregistered_referral_code() {
        // Setup with a valid format but unregistered code
        let mut deps = mock_deps_with_referral(vec![
            ("NOTREGISTERED", true, false, None),
        ]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        let info = mock_info("user", &ustc_coins(15_000_000));
        let msg = ExecuteMsg::Swap {
            referral_code: Some("NOTREGISTERED".to_string()),
            leaderboard_hint: None,
        };

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        match err {
            ContractError::ReferralCodeNotRegistered { code } => {
                assert_eq!(code, "NOTREGISTERED");
            }
            _ => panic!("Expected ReferralCodeNotRegistered error, got: {:?}", err),
        }
    }

    #[test]
    fn test_swap_multiple_denoms() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Send multiple denominations
        let info = mock_info(
            "user",
            &[
                Coin {
                    denom: USTC_DENOM.to_string(),
                    amount: Uint128::from(1_000_000u128),
                },
                Coin {
                    denom: "uluna".to_string(),
                    amount: Uint128::from(1_000_000u128),
                },
            ],
        );
        let msg = ExecuteMsg::Swap {
            referral_code: None,
            leaderboard_hint: None,
        };

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::MultipleDenoms);
    }

    #[test]
    fn test_multiple_swaps_same_referral_code() {
        // Setup with a valid referral code
        let mut deps = mock_deps_with_referral(vec![
            ("MYCODE", true, true, Some("referrer_addr")),
        ]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        // First swap
        let ustc_amount = 15_000_000u128;
        let info = mock_info("user1", &ustc_coins(ustc_amount));
        let msg = ExecuteMsg::Swap {
            referral_code: Some("MYCODE".to_string()),
            leaderboard_hint: None,
        };
        execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Second swap with same code, different user
        let info = mock_info("user2", &ustc_coins(ustc_amount));
        let msg = ExecuteMsg::Swap {
            referral_code: Some("mycode".to_string()), // Test case-insensitivity
            leaderboard_hint: None,
        };
        execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Verify aggregated stats
        let stats = STATS.load(&deps.storage).unwrap();
        assert_eq!(stats.total_referral_swaps, 2);
        assert_eq!(stats.unique_referral_codes_used, 1); // Same code, only counted once

        // Verify per-code stats aggregated
        let code_stats = REFERRAL_CODE_STATS.load(&deps.storage, "mycode").unwrap();
        assert_eq!(code_stats.total_swaps, 2);

        // Each swap: base=10 USTR (10 * 10^18), bonus=1 USTR (10^18)
        // Total rewards = 2 USTR (1 USTR per swap)
        assert_eq!(
            code_stats.total_rewards_earned,
            Uint128::from(ONE_USTR * 2)
        );
        assert_eq!(
            code_stats.total_user_bonuses,
            Uint128::from(ONE_USTR * 2)
        );
    }

    #[test]
    fn test_swap_referral_updates_leaderboard_with_events() {
        // Setup with a valid referral code
        let mut deps = mock_deps_with_referral(vec![
            ("CODE1", true, true, Some("referrer1")),
        ]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        let info = mock_info("user", &ustc_coins(15_000_000));
        let msg = ExecuteMsg::Swap {
            referral_code: Some("CODE1".to_string()),
            leaderboard_hint: None,
        };

        let res = execute(deps.as_mut(), env, info, msg).unwrap();

        // Find leaderboard_action attribute
        let leaderboard_action = res
            .attributes
            .iter()
            .find(|a| a.key == "leaderboard_action")
            .map(|a| a.value.as_str());
        assert_eq!(leaderboard_action, Some("new_entry"));

        // Find leaderboard_position attribute
        let leaderboard_position = res
            .attributes
            .iter()
            .find(|a| a.key == "leaderboard_position")
            .map(|a| a.value.as_str());
        assert_eq!(leaderboard_position, Some("1"));
    }

    #[test]
    fn test_query_referral_code_stats_with_usage() {
        // Setup with a valid referral code
        let mut deps = mock_deps_with_referral(vec![
            ("STATCODE", true, true, Some("owner_addr")),
        ]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        // Do a swap with the code
        let info = mock_info("user", &ustc_coins(15_000_000));
        let msg = ExecuteMsg::Swap {
            referral_code: Some("STATCODE".to_string()),
            leaderboard_hint: None,
        };
        execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Query the stats
        let query_msg = QueryMsg::ReferralCodeStats {
            code: "STATCODE".to_string(),
        };
        let res = query(deps.as_ref(), env, query_msg).unwrap();
        let stats: ReferralCodeStatsResponse = from_json(res).unwrap();

        assert_eq!(stats.code, "statcode");
        assert_eq!(stats.owner.as_str(), "owner_addr");
        assert_eq!(stats.total_swaps, 1);
        // 15 USTC / 1.5 = 10 USTR base, 10% bonus = 1 USTR (in 18-decimal)
        assert_eq!(stats.total_rewards_earned, Uint128::from(ONE_USTR));
        assert_eq!(stats.total_user_bonuses, Uint128::from(ONE_USTR));
    }

    #[test]
    fn test_query_referral_code_stats_never_used() {
        // Setup with a valid, registered code that was never used in a swap
        let mut deps = mock_deps_with_referral(vec![
            ("UNUSEDCODE", true, true, Some("owner_addr")),
        ]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        // Query the stats without doing any swaps
        let query_msg = QueryMsg::ReferralCodeStats {
            code: "UNUSEDCODE".to_string(),
        };
        let res = query(deps.as_ref(), env, query_msg).unwrap();
        let stats: ReferralCodeStatsResponse = from_json(res).unwrap();

        assert_eq!(stats.code, "unusedcode");
        assert_eq!(stats.owner.as_str(), "owner_addr");
        assert_eq!(stats.total_swaps, 0);
        assert_eq!(stats.total_rewards_earned, Uint128::zero());
        assert_eq!(stats.total_user_bonuses, Uint128::zero());
    }

    #[test]
    fn test_query_referral_leaderboard_pagination() {
        let mut deps = mock_deps_with_referral(vec![
            ("code1", true, true, Some("owner1")),
            ("code2", true, true, Some("owner2")),
            ("code3", true, true, Some("owner3")),
        ]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        // Insert codes directly into leaderboard with different rewards
        // code3: 300, code2: 200, code1: 100
        for (code, rewards) in [("code1", 100u128), ("code2", 200u128), ("code3", 300u128)] {
            let code_stats = ReferralCodeStats {
                total_rewards_earned: Uint128::from(rewards),
                total_user_bonuses: Uint128::from(rewards),
                total_swaps: 1,
            };
            REFERRAL_CODE_STATS
                .save(&mut deps.storage, code, &code_stats)
                .unwrap();
            try_insert_into_leaderboard(&mut deps.storage, code, Uint128::from(rewards), None)
                .unwrap();
        }

        // Query first page with limit 2
        let query_msg = QueryMsg::ReferralLeaderboard {
            start_after: None,
            limit: Some(2),
        };
        let res = query(deps.as_ref(), env.clone(), query_msg).unwrap();
        let leaderboard: ReferralLeaderboardResponse = from_json(res).unwrap();

        assert_eq!(leaderboard.entries.len(), 2);
        assert!(leaderboard.has_more);
        assert_eq!(leaderboard.entries[0].code, "code3");
        assert_eq!(leaderboard.entries[0].rank, 1);
        assert_eq!(leaderboard.entries[1].code, "code2");
        assert_eq!(leaderboard.entries[1].rank, 2);

        // Query second page
        let query_msg = QueryMsg::ReferralLeaderboard {
            start_after: Some("code2".to_string()),
            limit: Some(2),
        };
        let res = query(deps.as_ref(), env, query_msg).unwrap();
        let leaderboard: ReferralLeaderboardResponse = from_json(res).unwrap();

        assert_eq!(leaderboard.entries.len(), 1);
        assert!(!leaderboard.has_more);
        assert_eq!(leaderboard.entries[0].code, "code1");
        assert_eq!(leaderboard.entries[0].rank, 3);
    }

    #[test]
    fn test_query_swap_simulation_with_valid_referral() {
        let mut deps = mock_deps_with_referral(vec![
            ("VALIDCODE", true, true, Some("owner_addr")),
        ]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        let query_msg = QueryMsg::SwapSimulation {
            ustc_amount: Uint128::from(15_000_000u128),
            referral_code: Some("VALIDCODE".to_string()),
        };
        let res = query(deps.as_ref(), env, query_msg).unwrap();
        let sim: SimulationResponse = from_json(res).unwrap();

        assert!(sim.referral_valid);
        assert_eq!(sim.base_ustr_amount, Uint128::from(TEN_USTR));
        assert_eq!(sim.user_bonus, Uint128::from(ONE_USTR));
        assert_eq!(sim.referrer_bonus, Uint128::from(ONE_USTR));
        assert_eq!(sim.total_ustr_to_user, Uint128::from(TEN_USTR + ONE_USTR));
    }

    #[test]
    fn test_query_swap_simulation_with_invalid_referral() {
        let mut deps = mock_deps_with_referral(vec![
            ("BADCODE", false, false, None),
        ]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        let query_msg = QueryMsg::SwapSimulation {
            ustc_amount: Uint128::from(15_000_000u128),
            referral_code: Some("BADCODE".to_string()),
        };
        let res = query(deps.as_ref(), env, query_msg).unwrap();
        let sim: SimulationResponse = from_json(res).unwrap();

        assert!(!sim.referral_valid);
        assert_eq!(sim.user_bonus, Uint128::zero());
        assert_eq!(sim.referrer_bonus, Uint128::zero());
        assert_eq!(sim.total_ustr_to_user, Uint128::from(TEN_USTR));
    }

    #[test]
    fn test_query_swap_simulation_with_empty_referral() {
        let mut deps = mock_deps_with_referral(vec![]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        let query_msg = QueryMsg::SwapSimulation {
            ustc_amount: Uint128::from(15_000_000u128),
            referral_code: Some("".to_string()),
        };
        let res = query(deps.as_ref(), env, query_msg).unwrap();
        let sim: SimulationResponse = from_json(res).unwrap();

        assert!(!sim.referral_valid);
        assert_eq!(sim.user_bonus, Uint128::zero());
    }

    #[test]
    fn test_referral_code_case_insensitive() {
        // Setup with a lowercase code
        let mut deps = mock_deps_with_referral(vec![
            ("mycode", true, true, Some("referrer")),
        ]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        // Use uppercase version
        let info = mock_info("user", &ustc_coins(15_000_000));
        let msg = ExecuteMsg::Swap {
            referral_code: Some("MYCODE".to_string()),
            leaderboard_hint: None,
        };

        let res = execute(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.messages.len(), 3); // Should succeed with referral bonus

        // Stats should be saved with lowercase
        let code_stats = REFERRAL_CODE_STATS.load(&deps.storage, "mycode").unwrap();
        assert_eq!(code_stats.total_swaps, 1);
    }

    #[test]
    fn test_swap_referral_mints_to_correct_addresses() {
        let mut deps = mock_deps_with_referral(vec![
            ("CODE", true, true, Some("referrer_wallet")),
        ]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        let info = mock_info("swapper", &ustc_coins(15_000_000));
        let msg = ExecuteMsg::Swap {
            referral_code: Some("CODE".to_string()),
            leaderboard_hint: None,
        };

        let res = execute(deps.as_mut(), env, info, msg).unwrap();

        // Message 0: Forward USTC to treasury
        // Message 1: Mint USTR to user (swapper)
        // Message 2: Mint USTR to referrer

        // Verify user mint message
        if let CosmosMsg::Wasm(WasmMsg::Execute { msg, .. }) = &res.messages[1].msg {
            let mint_msg: Cw20ExecuteMsg = from_json(msg).unwrap();
            match mint_msg {
                Cw20ExecuteMsg::Mint { recipient, amount } => {
                    assert_eq!(recipient, "swapper");
                    assert_eq!(amount, Uint128::from(TEN_USTR + ONE_USTR)); // base + bonus
                }
                _ => panic!("Expected Mint message"),
            }
        }

        // Verify referrer mint message
        if let CosmosMsg::Wasm(WasmMsg::Execute { msg, .. }) = &res.messages[2].msg {
            let mint_msg: Cw20ExecuteMsg = from_json(msg).unwrap();
            match mint_msg {
                Cw20ExecuteMsg::Mint { recipient, amount } => {
                    assert_eq!(recipient, "referrer_wallet");
                    assert_eq!(amount, Uint128::from(ONE_USTR)); // referrer bonus
                }
                _ => panic!("Expected Mint message"),
            }
        }
    }

    // ============ DECIMAL HANDLING TESTS ============
    // These tests verify correct handling of USTC (6 decimals) to USTR (18 decimals) conversion

    #[test]
    fn test_decimal_conversion_1_ustc() {
        // 1 USTC = 1,000,000 uusd (6 decimals)
        // At rate 1.5, 1 USTC should give 1/1.5 = 0.666... USTR
        //
        // Note: Due to order of operations (divide first, then multiply by 10^12),
        // we lose some precision. This is acceptable as it results in slightly less
        // USTR minted (conservative direction).
        // Calculation: floor(1_000_000 / 1.5) * 10^12 = 666_666 * 10^12
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let ustc_amount = Uint128::from(1_000_000u128); // 1 USTC
        let res = query(
            deps.as_ref(),
            env,
            QueryMsg::SwapSimulation {
                ustc_amount,
                referral_code: None,
            },
        )
        .unwrap();
        let sim: SimulationResponse = from_json(res).unwrap();

        // 1 USTC / 1.5 = 0.666666 USTR (with precision loss from divide-first approach)
        let expected = Uint128::from(666_666_000_000_000_000u128);
        assert_eq!(sim.base_ustr_amount, expected);
        assert_eq!(sim.total_ustr_to_user, expected);
    }

    #[test]
    fn test_decimal_conversion_100_ustc() {
        // 100 USTC = 100,000,000 uusd
        // At rate 1.5: 100 / 1.5 = 66.666... USTR
        //
        // Note: Due to order of operations (divide first, then multiply by 10^12),
        // we lose some precision. This is acceptable as it results in slightly less
        // USTR minted (conservative direction).
        // Calculation: floor(100_000_000 / 1.5) * 10^12 = 66_666_666 * 10^12
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let ustc_amount = Uint128::from(100_000_000u128); // 100 USTC
        let res = query(
            deps.as_ref(),
            env,
            QueryMsg::SwapSimulation {
                ustc_amount,
                referral_code: None,
            },
        )
        .unwrap();
        let sim: SimulationResponse = from_json(res).unwrap();

        // 100 USTC / 1.5 = 66.666666 USTR (with precision loss from divide-first approach)
        let expected = Uint128::from(66_666_666_000_000_000_000u128);
        assert_eq!(sim.base_ustr_amount, expected);
    }

    #[test]
    fn test_decimal_conversion_at_rate_2() {
        // At midpoint (rate = 2.0), 10 USTC should give 5 USTR
        let mut deps = mock_dependencies();
        let mut env = mock_env();
        
        // Set start time so we're at 50% progress (rate = 2.0)
        let start_time = env.block.time.seconds();
        setup_contract(deps.as_mut(), start_time);
        
        // Advance to midpoint (rate goes from 1.5 to 2.0 at 50%)
        env.block.time = Timestamp::from_seconds(start_time + DEFAULT_SWAP_DURATION / 2);

        let ustc_amount = Uint128::from(10_000_000u128); // 10 USTC
        let res = query(
            deps.as_ref(),
            env,
            QueryMsg::SwapSimulation {
                ustc_amount,
                referral_code: None,
            },
        )
        .unwrap();
        let sim: SimulationResponse = from_json(res).unwrap();

        // 10 USTC / 2.0 = 5 USTR = 5 * 10^18 atomic units
        let expected = Uint128::from(5_000_000_000_000_000_000u128);
        assert_eq!(sim.base_ustr_amount, expected);
        assert_eq!(sim.rate, Decimal::from_ratio(20u128, 10u128)); // 2.0
    }

    #[test]
    fn test_decimal_conversion_at_end_rate() {
        // At end (rate = 2.5), 25 USTC should give 10 USTR
        let mut deps = mock_dependencies();
        let mut env = mock_env();
        
        let start_time = env.block.time.seconds();
        setup_contract(deps.as_mut(), start_time);
        
        // Advance to end (rate = 2.5)
        env.block.time = Timestamp::from_seconds(start_time + DEFAULT_SWAP_DURATION);

        let ustc_amount = Uint128::from(25_000_000u128); // 25 USTC
        let res = query(
            deps.as_ref(),
            env,
            QueryMsg::SwapSimulation {
                ustc_amount,
                referral_code: None,
            },
        )
        .unwrap();
        let sim: SimulationResponse = from_json(res).unwrap();

        // 25 USTC / 2.5 = 10 USTR = 10 * 10^18 atomic units
        assert_eq!(sim.base_ustr_amount, Uint128::from(TEN_USTR));
        assert_eq!(sim.rate, Decimal::from_ratio(25u128, 10u128)); // 2.5
    }

    #[test]
    fn test_decimal_precision_small_amount() {
        // Test minimum swap amount: 1 USTC at rate 1.5
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Minimum: 1 USTC = 1,000,000 uusd
        let ustc_amount = Uint128::from(MIN_SWAP_AMOUNT);
        let res = query(
            deps.as_ref(),
            env,
            QueryMsg::SwapSimulation {
                ustc_amount,
                referral_code: None,
            },
        )
        .unwrap();
        let sim: SimulationResponse = from_json(res).unwrap();

        // 1 USTC / 1.5 ≈ 0.666... USTR
        // Verify it's in the expected 18-decimal range (not 6-decimal)
        assert!(sim.base_ustr_amount > Uint128::from(600_000_000_000_000_000u128)); // > 0.6 USTR
        assert!(sim.base_ustr_amount < Uint128::from(700_000_000_000_000_000u128)); // < 0.7 USTR
    }

    #[test]
    fn test_decimal_conversion_larger_amount() {
        // Test a moderately large swap: 150 USTC
        // This verifies correct scaling for amounts larger than typical test values
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // 150 USTC = 150,000,000 uusd
        let ustc_amount = Uint128::from(150_000_000u128);
        let res = query(
            deps.as_ref(),
            env,
            QueryMsg::SwapSimulation {
                ustc_amount,
                referral_code: None,
            },
        )
        .unwrap();
        let sim: SimulationResponse = from_json(res).unwrap();

        // 150 USTC / 1.5 = 100 USTR exactly
        // In 18-decimal: 100 * 10^18 = 100,000,000,000,000,000,000 atomic units
        let expected = Uint128::from(100_000_000_000_000_000_000u128);
        assert_eq!(sim.base_ustr_amount, expected);
    }

    #[test]
    fn test_no_overflow_for_large_amounts() {
        // Test amounts that would have caused overflow with the old approach
        // (multiply by 10^12 first, then Decimal::from_ratio which multiplies by 10^18)
        // The old approach overflowed for amounts >= 340 USTC
        // The new approach (divide first, then multiply) avoids this overflow
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        // Test 555 USTC (one of the failing tx amounts from mainnet)
        let ustc_amount = Uint128::from(555_000_000u128); // 555 USTC
        let res = query(
            deps.as_ref(),
            env.clone(),
            QueryMsg::SwapSimulation {
                ustc_amount,
                referral_code: None,
            },
        );
        assert!(res.is_ok(), "555 USTC should not overflow");
        let sim: SimulationResponse = from_json(res.unwrap()).unwrap();
        // 555 USTC / 1.5 = 370 USTR
        let expected = Uint128::from(370_000_000_000_000_000_000u128);
        assert_eq!(sim.base_ustr_amount, expected);

        // Test 1000 USTC (another failing tx amount)
        let ustc_amount = Uint128::from(1_000_000_000u128); // 1000 USTC
        let res = query(
            deps.as_ref(),
            env.clone(),
            QueryMsg::SwapSimulation {
                ustc_amount,
                referral_code: None,
            },
        );
        assert!(res.is_ok(), "1000 USTC should not overflow");
        let sim: SimulationResponse = from_json(res.unwrap()).unwrap();
        // 1000 USTC / 1.5 = 666.666... USTR (with precision loss)
        let expected = Uint128::from(666_666_666_000_000_000_000u128);
        assert_eq!(sim.base_ustr_amount, expected);

        // Test 3487 USTC (largest failing tx amount from mainnet)
        let ustc_amount = Uint128::from(3_487_415_669u128); // ~3487.42 USTC
        let res = query(
            deps.as_ref(),
            env.clone(),
            QueryMsg::SwapSimulation {
                ustc_amount,
                referral_code: None,
            },
        );
        assert!(res.is_ok(), "3487 USTC should not overflow");

        // Test 1 million USTC (extreme case)
        let ustc_amount = Uint128::from(1_000_000_000_000u128); // 1,000,000 USTC
        let res = query(
            deps.as_ref(),
            env,
            QueryMsg::SwapSimulation {
                ustc_amount,
                referral_code: None,
            },
        );
        assert!(res.is_ok(), "1 million USTC should not overflow");
    }

    #[test]
    fn test_decimal_adjustment_constant() {
        // Verify the decimal adjustment constant is correct
        // USTR has 18 decimals, USTC has 6, so adjustment should be 10^12
        assert_eq!(DECIMAL_ADJUSTMENT, 1_000_000_000_000u128);
        assert_eq!(DECIMAL_ADJUSTMENT, 10u128.pow(12));
    }

    #[test]
    fn test_referral_bonus_decimal_handling() {
        // Verify referral bonus calculation preserves 18-decimal precision
        let mut deps = mock_deps_with_referral(vec![
            ("BONUSCODE", true, true, Some("referrer")),
        ]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        // 15 USTC at rate 1.5 = 10 USTR base
        let ustc_amount = Uint128::from(15_000_000u128);
        let res = query(
            deps.as_ref(),
            env,
            QueryMsg::SwapSimulation {
                ustc_amount,
                referral_code: Some("BONUSCODE".to_string()),
            },
        )
        .unwrap();
        let sim: SimulationResponse = from_json(res).unwrap();

        // Base: 10 USTR = 10 * 10^18
        // Bonus: 10% of 10 USTR = 1 USTR = 1 * 10^18
        assert_eq!(sim.base_ustr_amount, Uint128::from(TEN_USTR));
        assert_eq!(sim.user_bonus, Uint128::from(ONE_USTR));
        assert_eq!(sim.referrer_bonus, Uint128::from(ONE_USTR));
        assert_eq!(sim.total_ustr_to_user, Uint128::from(TEN_USTR + ONE_USTR));
    }

    #[test]
    fn test_swap_execution_decimal_handling() {
        // Verify actual swap execution mints correct 18-decimal amounts
        let mut deps = mock_deps_with_referral(vec![]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        let ustc_amount = 15_000_000u128; // 15 USTC
        let info = mock_info("user", &ustc_coins(ustc_amount));
        let msg = ExecuteMsg::Swap {
            referral_code: None,
            leaderboard_hint: None,
        };

        let res = execute(deps.as_mut(), env, info, msg).unwrap();

        // Verify the mint message has correct 18-decimal amount
        if let CosmosMsg::Wasm(WasmMsg::Execute { msg, .. }) = &res.messages[1].msg {
            let mint_msg: Cw20ExecuteMsg = from_json(msg).unwrap();
            match mint_msg {
                Cw20ExecuteMsg::Mint { amount, .. } => {
                    // 15 USTC / 1.5 = 10 USTR = 10 * 10^18 atomic units
                    assert_eq!(amount, Uint128::from(TEN_USTR));
                }
                _ => panic!("Expected Mint message"),
            }
        }
    }

    #[test]
    fn test_fractional_ustc_decimal_handling() {
        // Test with a non-round number of USTC: 1.5 USTC = 1,500,000 uusd
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut(), env.block.time.seconds());

        let ustc_amount = Uint128::from(1_500_000u128); // 1.5 USTC
        let res = query(
            deps.as_ref(),
            env,
            QueryMsg::SwapSimulation {
                ustc_amount,
                referral_code: None,
            },
        )
        .unwrap();
        let sim: SimulationResponse = from_json(res).unwrap();

        // 1.5 USTC / 1.5 = 1 USTR = 1 * 10^18 atomic units
        assert_eq!(sim.base_ustr_amount, Uint128::from(ONE_USTR));
    }

    // ============ MINT SAFETY LIMIT TESTS ============

    #[test]
    fn test_mint_safety_limit_passes_under_threshold() {
        // With default supply of 1 billion USTR, 5% = 50 million USTR
        // Minting 10 USTR should pass easily
        let mut deps = mock_deps_with_referral(vec![]);
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        let info = mock_info("user", &ustc_coins(15_000_000)); // 15 USTC = 10 USTR
        let msg = ExecuteMsg::Swap {
            referral_code: None,
            leaderboard_hint: None,
        };

        // Should succeed - 10 USTR is way under 5% of 1 billion
        let res = execute(deps.as_mut(), env, info, msg);
        assert!(res.is_ok());
    }

    #[test]
    fn test_mint_safety_limit_rejects_over_threshold() {
        // Create a low total supply where 10 USTR exceeds 5%
        // If total supply is 100 USTR, 5% = 5 USTR
        // Minting 10 USTR should fail
        let small_supply = Uint128::from(100_000_000_000_000_000_000u128); // 100 USTR
        let querier = ReferralMockQuerier::new().with_ustr_total_supply(small_supply);
        let mut deps = OwnedDeps {
            storage: MockStorage::default(),
            api: MockApi::default(),
            querier,
            custom_query_type: std::marker::PhantomData,
        };
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        let info = mock_info("user", &ustc_coins(15_000_000)); // 15 USTC = 10 USTR
        let msg = ExecuteMsg::Swap {
            referral_code: None,
            leaderboard_hint: None,
        };

        // Should fail - 10 USTR > 5% of 100 USTR (which is 5 USTR)
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        match err {
            ContractError::MintExceedsSafetyLimit { .. } => {}
            _ => panic!("Expected MintExceedsSafetyLimit error, got: {:?}", err),
        }
    }

    #[test]
    fn test_mint_safety_limit_at_exactly_5_percent() {
        // Create a total supply where 10 USTR is exactly 5%
        // 10 USTR = 5% of X, so X = 200 USTR
        let exact_supply = Uint128::from(200_000_000_000_000_000_000u128); // 200 USTR
        let querier = ReferralMockQuerier::new().with_ustr_total_supply(exact_supply);
        let mut deps = OwnedDeps {
            storage: MockStorage::default(),
            api: MockApi::default(),
            querier,
            custom_query_type: std::marker::PhantomData,
        };
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        let info = mock_info("user", &ustc_coins(15_000_000)); // 15 USTC = 10 USTR
        let msg = ExecuteMsg::Swap {
            referral_code: None,
            leaderboard_hint: None,
        };

        // Should succeed - 10 USTR = 5% of 200 USTR (equal is allowed)
        let res = execute(deps.as_mut(), env, info, msg);
        assert!(res.is_ok());
    }

    #[test]
    fn test_mint_safety_limit_with_referral_bonus() {
        // Referral bonus adds 20% extra minting (10% to user + 10% to referrer)
        // With referral: 10 USTR base + 1 USTR user bonus + 1 USTR referrer = 12 USTR total minted
        // Create supply where 12 USTR exceeds 5%
        // 12 USTR > 5% of X means X < 240 USTR
        let small_supply = Uint128::from(200_000_000_000_000_000_000u128); // 200 USTR
        let querier = ReferralMockQuerier::new()
            .with_ustr_total_supply(small_supply)
            .with_referral_code("TESTCODE", true, true, Some("referrer"));
        let mut deps = OwnedDeps {
            storage: MockStorage::default(),
            api: MockApi::default(),
            querier,
            custom_query_type: std::marker::PhantomData,
        };
        let env = mock_env();
        setup_contract_with_querier(deps.as_mut(), env.block.time.seconds());

        let info = mock_info("user", &ustc_coins(15_000_000)); // 15 USTC = 10 USTR + referral bonus
        let msg = ExecuteMsg::Swap {
            referral_code: Some("TESTCODE".to_string()),
            leaderboard_hint: None,
        };

        // Should fail - 12 USTR > 5% of 200 USTR (10 USTR)
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        match err {
            ContractError::MintExceedsSafetyLimit { .. } => {}
            _ => panic!("Expected MintExceedsSafetyLimit error, got: {:?}", err),
        }
    }
}

