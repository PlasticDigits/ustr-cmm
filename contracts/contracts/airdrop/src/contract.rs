//! Airdrop contract implementation

#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{
    to_json_binary, Binary, CosmosMsg, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
    Uint128, WasmMsg,
};
use cw2::set_contract_version;
use cw20::Cw20ExecuteMsg;
use std::collections::HashSet;

use crate::error::ContractError;
use crate::msg::{ConfigResponse, ExecuteMsg, InstantiateMsg, QueryMsg, Recipient};
use crate::state::{Config, CONFIG, CONTRACT_NAME, CONTRACT_VERSION};

// ============ INSTANTIATE ============

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    let admin = deps.api.addr_validate(&msg.admin)?;

    let config = Config {
        admin: admin.clone(),
    };

    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("admin", admin))
}

// ============ EXECUTE ============

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::Airdrop { token, recipients } => {
            execute_airdrop(deps, info, token, recipients)
        }
    }
}

fn execute_airdrop(
    deps: DepsMut,
    info: MessageInfo,
    token: String,
    recipients: Vec<Recipient>,
) -> Result<Response, ContractError> {
    // Validate we have recipients
    if recipients.is_empty() {
        return Err(ContractError::NoRecipients);
    }

    let token_addr = deps.api.addr_validate(&token)?;

    // Track seen addresses to detect duplicates
    let mut seen_addresses: HashSet<String> = HashSet::new();

    // Calculate total amount and validate recipients
    let mut total_amount = Uint128::zero();
    let mut messages: Vec<CosmosMsg> = Vec::with_capacity(recipients.len());

    for recipient in &recipients {
        // Validate address
        let recipient_addr = deps
            .api
            .addr_validate(&recipient.address)
            .map_err(|_| ContractError::InvalidRecipient {
                address: recipient.address.clone(),
            })?;

        // Check for duplicates
        if !seen_addresses.insert(recipient_addr.to_string()) {
            return Err(ContractError::DuplicateRecipient {
                address: recipient.address.clone(),
            });
        }

        // Check for zero amount
        if recipient.amount.is_zero() {
            return Err(ContractError::ZeroAmount {
                address: recipient.address.clone(),
            });
        }

        total_amount += recipient.amount;

        // Create transfer message using TransferFrom (uses allowance)
        let transfer_msg = WasmMsg::Execute {
            contract_addr: token_addr.to_string(),
            msg: to_json_binary(&Cw20ExecuteMsg::TransferFrom {
                owner: info.sender.to_string(),
                recipient: recipient_addr.to_string(),
                amount: recipient.amount,
            })?,
            funds: vec![],
        };

        messages.push(transfer_msg.into());
    }

    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("action", "airdrop")
        .add_attribute("sender", info.sender)
        .add_attribute("token", token_addr)
        .add_attribute("recipients_count", recipients.len().to_string())
        .add_attribute("total_amount", total_amount))
}

// ============ QUERY ============

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&query_config(deps)?),
    }
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        admin: config.admin,
    })
}

// ============ TESTS ============

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::from_json;

    const ADMIN: &str = "admin";
    const TOKEN: &str = "token_addr";
    const USER: &str = "user";
    const RECIPIENT1: &str = "recipient1";
    const RECIPIENT2: &str = "recipient2";

    fn setup_contract(deps: DepsMut) {
        let msg = InstantiateMsg {
            admin: ADMIN.to_string(),
        };
        let info = mock_info("creator", &[]);
        instantiate(deps, mock_env(), info, msg).unwrap();
    }

    #[test]
    fn test_instantiate() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.admin.as_str(), ADMIN);
    }

    #[test]
    fn test_airdrop_success() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let recipients = vec![
            Recipient {
                address: RECIPIENT1.to_string(),
                amount: Uint128::new(1_000_000),
            },
            Recipient {
                address: RECIPIENT2.to_string(),
                amount: Uint128::new(2_000_000),
            },
        ];

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients,
        };

        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Should have 2 transfer messages
        assert_eq!(res.messages.len(), 2);

        // Check attributes
        assert_eq!(
            res.attributes
                .iter()
                .find(|a| a.key == "recipients_count")
                .unwrap()
                .value,
            "2"
        );
        assert_eq!(
            res.attributes
                .iter()
                .find(|a| a.key == "total_amount")
                .unwrap()
                .value,
            "3000000"
        );
    }

    #[test]
    fn test_airdrop_no_recipients() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients: vec![],
        };

        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::NoRecipients);
    }

    #[test]
    fn test_airdrop_duplicate_recipient() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let recipients = vec![
            Recipient {
                address: RECIPIENT1.to_string(),
                amount: Uint128::new(1_000_000),
            },
            Recipient {
                address: RECIPIENT1.to_string(), // Duplicate
                amount: Uint128::new(2_000_000),
            },
        ];

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients,
        };

        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::DuplicateRecipient { .. } => {}
            _ => panic!("Expected DuplicateRecipient error"),
        }
    }

    #[test]
    fn test_airdrop_zero_amount() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let recipients = vec![Recipient {
            address: RECIPIENT1.to_string(),
            amount: Uint128::zero(),
        }];

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients,
        };

        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::ZeroAmount { .. } => {}
            _ => panic!("Expected ZeroAmount error"),
        }
    }

    #[test]
    fn test_query_config() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let res = query(deps.as_ref(), mock_env(), QueryMsg::Config {}).unwrap();
        let config: ConfigResponse = from_json(res).unwrap();
        assert_eq!(config.admin.as_str(), ADMIN);
    }
}

