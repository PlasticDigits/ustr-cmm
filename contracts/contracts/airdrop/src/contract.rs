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
    use cosmwasm_std::{from_json, Attribute};
    use cw2::get_contract_version;

    const ADMIN: &str = "admin";
    const TOKEN: &str = "token_addr";
    const USER: &str = "user";
    const RECIPIENT1: &str = "recipient1";
    const RECIPIENT2: &str = "recipient2";
    const RECIPIENT3: &str = "recipient3";

    fn setup_contract(deps: DepsMut) {
        let msg = InstantiateMsg {
            admin: ADMIN.to_string(),
        };
        let info = mock_info("creator", &[]);
        instantiate(deps, mock_env(), info, msg).unwrap();
    }

    // ============ INSTANTIATION TESTS ============

    #[test]
    fn test_instantiate() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.admin.as_str(), ADMIN);
    }

    #[test]
    fn test_instantiate_sets_contract_version() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let version = get_contract_version(&deps.storage).unwrap();
        assert_eq!(version.contract, CONTRACT_NAME);
        assert_eq!(version.version, CONTRACT_VERSION);
    }

    #[test]
    fn test_instantiate_response_attributes() {
        let mut deps = mock_dependencies();
        let msg = InstantiateMsg {
            admin: ADMIN.to_string(),
        };
        let info = mock_info("creator", &[]);
        let res = instantiate(deps.as_mut(), mock_env(), info, msg).unwrap();

        assert_eq!(res.attributes.len(), 2);
        assert!(res.attributes.contains(&Attribute::new("action", "instantiate")));
        assert!(res.attributes.contains(&Attribute::new("admin", ADMIN)));
    }

    #[test]
    fn test_instantiate_anyone_can_instantiate() {
        let mut deps = mock_dependencies();
        let msg = InstantiateMsg {
            admin: ADMIN.to_string(),
        };
        // Random user instantiates the contract
        let info = mock_info("random_user", &[]);
        let res = instantiate(deps.as_mut(), mock_env(), info, msg);

        assert!(res.is_ok());
    }

    // ============ AIRDROP SUCCESS TESTS ============

    #[test]
    fn test_airdrop_single_recipient() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let recipients = vec![Recipient {
            address: RECIPIENT1.to_string(),
            amount: Uint128::new(1_000_000),
        }];

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients,
        };

        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        assert_eq!(res.messages.len(), 1);
        assert_eq!(
            res.attributes
                .iter()
                .find(|a| a.key == "recipients_count")
                .unwrap()
                .value,
            "1"
        );
        assert_eq!(
            res.attributes
                .iter()
                .find(|a| a.key == "total_amount")
                .unwrap()
                .value,
            "1000000"
        );
    }

    #[test]
    fn test_airdrop_multiple_recipients() {
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
    fn test_airdrop_anyone_can_call() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let recipients = vec![Recipient {
            address: RECIPIENT1.to_string(),
            amount: Uint128::new(1_000_000),
        }];

        // Non-admin user should be able to call airdrop
        let info = mock_info("random_user", &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients,
        };

        let res = execute(deps.as_mut(), mock_env(), info, msg);
        assert!(res.is_ok());
    }

    #[test]
    fn test_airdrop_admin_can_call() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let recipients = vec![Recipient {
            address: RECIPIENT1.to_string(),
            amount: Uint128::new(1_000_000),
        }];

        // Admin should also be able to call airdrop
        let info = mock_info(ADMIN, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients,
        };

        let res = execute(deps.as_mut(), mock_env(), info, msg);
        assert!(res.is_ok());
    }

    #[test]
    fn test_airdrop_large_recipient_list() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Create 100 recipients
        let recipients: Vec<Recipient> = (0..100)
            .map(|i| Recipient {
                address: format!("recipient{}", i),
                amount: Uint128::new(1_000_000),
            })
            .collect();

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients,
        };

        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        assert_eq!(res.messages.len(), 100);
        assert_eq!(
            res.attributes
                .iter()
                .find(|a| a.key == "recipients_count")
                .unwrap()
                .value,
            "100"
        );
        assert_eq!(
            res.attributes
                .iter()
                .find(|a| a.key == "total_amount")
                .unwrap()
                .value,
            "100000000" // 100 * 1_000_000
        );
    }

    #[test]
    fn test_airdrop_varying_amounts() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let recipients = vec![
            Recipient {
                address: RECIPIENT1.to_string(),
                amount: Uint128::new(1),
            },
            Recipient {
                address: RECIPIENT2.to_string(),
                amount: Uint128::new(1_000_000_000_000), // 1 trillion
            },
            Recipient {
                address: RECIPIENT3.to_string(),
                amount: Uint128::new(500_000),
            },
        ];

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients,
        };

        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        assert_eq!(res.messages.len(), 3);
        assert_eq!(
            res.attributes
                .iter()
                .find(|a| a.key == "total_amount")
                .unwrap()
                .value,
            "1000000500001" // 1 + 1_000_000_000_000 + 500_000
        );
    }

    #[test]
    fn test_airdrop_response_attributes() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let recipients = vec![Recipient {
            address: RECIPIENT1.to_string(),
            amount: Uint128::new(1_000_000),
        }];

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients,
        };

        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        assert!(res.attributes.contains(&Attribute::new("action", "airdrop")));
        assert!(res.attributes.contains(&Attribute::new("sender", USER)));
        assert!(res.attributes.contains(&Attribute::new("token", TOKEN)));
        assert!(res
            .attributes
            .contains(&Attribute::new("recipients_count", "1")));
        assert!(res
            .attributes
            .contains(&Attribute::new("total_amount", "1000000")));
    }

    #[test]
    fn test_airdrop_transfer_message_format() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let recipients = vec![Recipient {
            address: RECIPIENT1.to_string(),
            amount: Uint128::new(1_000_000),
        }];

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients,
        };

        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Verify the message is a WasmMsg::Execute with TransferFrom
        let sub_msg = &res.messages[0];
        match &sub_msg.msg {
            CosmosMsg::Wasm(WasmMsg::Execute {
                contract_addr,
                msg,
                funds,
            }) => {
                assert_eq!(contract_addr, TOKEN);
                assert!(funds.is_empty());

                // Verify the inner message is TransferFrom
                let transfer_msg: Cw20ExecuteMsg = from_json(msg).unwrap();
                match transfer_msg {
                    Cw20ExecuteMsg::TransferFrom {
                        owner,
                        recipient,
                        amount,
                    } => {
                        assert_eq!(owner, USER);
                        assert_eq!(recipient, RECIPIENT1);
                        assert_eq!(amount, Uint128::new(1_000_000));
                    }
                    _ => panic!("Expected TransferFrom message"),
                }
            }
            _ => panic!("Expected WasmMsg::Execute"),
        }
    }

    #[test]
    fn test_airdrop_messages_ordered_correctly() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let recipients = vec![
            Recipient {
                address: RECIPIENT1.to_string(),
                amount: Uint128::new(100),
            },
            Recipient {
                address: RECIPIENT2.to_string(),
                amount: Uint128::new(200),
            },
            Recipient {
                address: RECIPIENT3.to_string(),
                amount: Uint128::new(300),
            },
        ];

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients,
        };

        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Verify messages are in order
        let expected_recipients = [RECIPIENT1, RECIPIENT2, RECIPIENT3];
        let expected_amounts = [100u128, 200, 300];

        for (i, sub_msg) in res.messages.iter().enumerate() {
            match &sub_msg.msg {
                CosmosMsg::Wasm(WasmMsg::Execute { msg, .. }) => {
                    let transfer_msg: Cw20ExecuteMsg = from_json(msg).unwrap();
                    match transfer_msg {
                        Cw20ExecuteMsg::TransferFrom {
                            recipient, amount, ..
                        } => {
                            assert_eq!(recipient, expected_recipients[i]);
                            assert_eq!(amount, Uint128::new(expected_amounts[i]));
                        }
                        _ => panic!("Expected TransferFrom message"),
                    }
                }
                _ => panic!("Expected WasmMsg::Execute"),
            }
        }
    }

    // ============ AIRDROP ERROR TESTS ============

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
            ContractError::DuplicateRecipient { address } => {
                assert_eq!(address, RECIPIENT1);
            }
            _ => panic!("Expected DuplicateRecipient error"),
        }
    }

    #[test]
    fn test_airdrop_duplicate_at_end_of_list() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let recipients = vec![
            Recipient {
                address: RECIPIENT1.to_string(),
                amount: Uint128::new(100),
            },
            Recipient {
                address: RECIPIENT2.to_string(),
                amount: Uint128::new(200),
            },
            Recipient {
                address: RECIPIENT3.to_string(),
                amount: Uint128::new(300),
            },
            Recipient {
                address: RECIPIENT1.to_string(), // Duplicate of first
                amount: Uint128::new(400),
            },
        ];

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients,
        };

        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::DuplicateRecipient { address } => {
                assert_eq!(address, RECIPIENT1);
            }
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
            ContractError::ZeroAmount { address } => {
                assert_eq!(address, RECIPIENT1);
            }
            _ => panic!("Expected ZeroAmount error"),
        }
    }

    #[test]
    fn test_airdrop_zero_amount_in_middle() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let recipients = vec![
            Recipient {
                address: RECIPIENT1.to_string(),
                amount: Uint128::new(1_000_000),
            },
            Recipient {
                address: RECIPIENT2.to_string(),
                amount: Uint128::zero(), // Zero in middle
            },
            Recipient {
                address: RECIPIENT3.to_string(),
                amount: Uint128::new(1_000_000),
            },
        ];

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients,
        };

        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::ZeroAmount { address } => {
                assert_eq!(address, RECIPIENT2);
            }
            _ => panic!("Expected ZeroAmount error"),
        }
    }

    #[test]
    fn test_airdrop_invalid_recipient_address() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let recipients = vec![Recipient {
            address: "".to_string(), // Empty address
            amount: Uint128::new(1_000_000),
        }];

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients,
        };

        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        match err {
            ContractError::InvalidRecipient { address } => {
                assert_eq!(address, "");
            }
            _ => panic!("Expected InvalidRecipient error"),
        }
    }

    #[test]
    fn test_airdrop_invalid_token_address() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let recipients = vec![Recipient {
            address: RECIPIENT1.to_string(),
            amount: Uint128::new(1_000_000),
        }];

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: "".to_string(), // Empty token address
            recipients,
        };

        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        // Invalid token address results in Std error from addr_validate
        match err {
            ContractError::Std(_) => {}
            _ => panic!("Expected Std error for invalid token address"),
        }
    }

    // ============ QUERY TESTS ============

    #[test]
    fn test_query_config() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let res = query(deps.as_ref(), mock_env(), QueryMsg::Config {}).unwrap();
        let config: ConfigResponse = from_json(res).unwrap();
        assert_eq!(config.admin.as_str(), ADMIN);
    }

    #[test]
    fn test_query_config_different_admin() {
        let mut deps = mock_dependencies();
        let msg = InstantiateMsg {
            admin: "different_admin".to_string(),
        };
        let info = mock_info("creator", &[]);
        instantiate(deps.as_mut(), mock_env(), info, msg).unwrap();

        let res = query(deps.as_ref(), mock_env(), QueryMsg::Config {}).unwrap();
        let config: ConfigResponse = from_json(res).unwrap();
        assert_eq!(config.admin.as_str(), "different_admin");
    }

    // ============ EDGE CASE TESTS ============

    #[test]
    fn test_airdrop_max_uint128_amount() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let recipients = vec![Recipient {
            address: RECIPIENT1.to_string(),
            amount: Uint128::MAX,
        }];

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients,
        };

        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        assert_eq!(res.messages.len(), 1);
        assert_eq!(
            res.attributes
                .iter()
                .find(|a| a.key == "total_amount")
                .unwrap()
                .value,
            Uint128::MAX.to_string()
        );
    }

    #[test]
    fn test_airdrop_minimum_amount() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let recipients = vec![Recipient {
            address: RECIPIENT1.to_string(),
            amount: Uint128::new(1), // Minimum non-zero amount
        }];

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients,
        };

        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        assert_eq!(res.messages.len(), 1);
        assert_eq!(
            res.attributes
                .iter()
                .find(|a| a.key == "total_amount")
                .unwrap()
                .value,
            "1"
        );
    }

    #[test]
    fn test_airdrop_uses_reply_on_never() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let recipients = vec![Recipient {
            address: RECIPIENT1.to_string(),
            amount: Uint128::new(1_000_000),
        }];

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients,
        };

        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Messages should use ReplyOn::Never (id = 0) for atomic execution
        for sub_msg in &res.messages {
            assert_eq!(sub_msg.id, 0);
            assert_eq!(sub_msg.reply_on, cosmwasm_std::ReplyOn::Never);
        }
    }

    #[test]
    fn test_airdrop_no_funds_attached_to_messages() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let recipients = vec![Recipient {
            address: RECIPIENT1.to_string(),
            amount: Uint128::new(1_000_000),
        }];

        let info = mock_info(USER, &[]);
        let msg = ExecuteMsg::Airdrop {
            token: TOKEN.to_string(),
            recipients,
        };

        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Verify no funds are attached to WasmMsg
        for sub_msg in &res.messages {
            match &sub_msg.msg {
                CosmosMsg::Wasm(WasmMsg::Execute { funds, .. }) => {
                    assert!(funds.is_empty());
                }
                _ => panic!("Expected WasmMsg::Execute"),
            }
        }
    }
}

// ============ INTEGRATION TESTS ============

#[cfg(test)]
mod integration_tests {
    use super::*;
    use cosmwasm_std::{Addr, Empty};
    use cw_multi_test::{App, ContractWrapper, Executor};

    fn airdrop_contract() -> Box<dyn cw_multi_test::Contract<Empty>> {
        let contract = ContractWrapper::new(execute, instantiate, query);
        Box::new(contract)
    }

    fn mock_cw20_contract() -> Box<dyn cw_multi_test::Contract<Empty>> {
        // Minimal CW20-like contract that just accepts TransferFrom messages
        let contract = ContractWrapper::new(
            |_deps, _env, _info, _msg: cw20::Cw20ExecuteMsg| -> Result<Response, ContractError> {
                Ok(Response::new())
            },
            |deps, _env, _info, _msg: Empty| -> Result<Response, ContractError> {
                cw2::set_contract_version(deps.storage, "mock_cw20", "1.0.0")?;
                Ok(Response::new())
            },
            |_deps, _env, _msg: Empty| -> StdResult<Binary> { to_json_binary(&Empty {}) },
        );
        Box::new(contract)
    }

    fn setup_test_env() -> (App, Addr, Addr) {
        let mut app = App::default();

        // Store and instantiate mock CW20
        let cw20_code_id = app.store_code(mock_cw20_contract());
        let cw20_addr = app
            .instantiate_contract(
                cw20_code_id,
                Addr::unchecked("owner"),
                &Empty {},
                &[],
                "mock_cw20",
                None,
            )
            .unwrap();

        // Store and instantiate airdrop contract
        let airdrop_code_id = app.store_code(airdrop_contract());
        let airdrop_addr = app
            .instantiate_contract(
                airdrop_code_id,
                Addr::unchecked("admin"),
                &InstantiateMsg {
                    admin: "admin".to_string(),
                },
                &[],
                "airdrop",
                None,
            )
            .unwrap();

        (app, airdrop_addr, cw20_addr)
    }

    #[test]
    fn test_integration_full_airdrop_flow() {
        let (mut app, airdrop_addr, cw20_addr) = setup_test_env();

        let recipients = vec![
            Recipient {
                address: "recipient1".to_string(),
                amount: Uint128::new(1_000_000),
            },
            Recipient {
                address: "recipient2".to_string(),
                amount: Uint128::new(2_000_000),
            },
        ];

        let msg = ExecuteMsg::Airdrop {
            token: cw20_addr.to_string(),
            recipients,
        };

        let res = app.execute_contract(Addr::unchecked("user"), airdrop_addr.clone(), &msg, &[]);

        assert!(res.is_ok());
    }

    #[test]
    fn test_integration_query_config() {
        let (app, airdrop_addr, _) = setup_test_env();

        let config: ConfigResponse = app
            .wrap()
            .query_wasm_smart(airdrop_addr, &QueryMsg::Config {})
            .unwrap();

        assert_eq!(config.admin.as_str(), "admin");
    }

    #[test]
    fn test_integration_airdrop_empty_recipients_fails() {
        let (mut app, airdrop_addr, cw20_addr) = setup_test_env();

        let msg = ExecuteMsg::Airdrop {
            token: cw20_addr.to_string(),
            recipients: vec![],
        };

        let res = app.execute_contract(Addr::unchecked("user"), airdrop_addr.clone(), &msg, &[]);

        assert!(res.is_err());
        assert!(res.unwrap_err().root_cause().to_string().contains("No recipients"));
    }

    #[test]
    fn test_integration_multiple_airdrops() {
        let (mut app, airdrop_addr, cw20_addr) = setup_test_env();

        // First airdrop
        let msg1 = ExecuteMsg::Airdrop {
            token: cw20_addr.to_string(),
            recipients: vec![Recipient {
                address: "recipient1".to_string(),
                amount: Uint128::new(1_000_000),
            }],
        };

        let res1 = app.execute_contract(Addr::unchecked("user1"), airdrop_addr.clone(), &msg1, &[]);
        assert!(res1.is_ok());

        // Second airdrop by different user
        let msg2 = ExecuteMsg::Airdrop {
            token: cw20_addr.to_string(),
            recipients: vec![Recipient {
                address: "recipient2".to_string(),
                amount: Uint128::new(2_000_000),
            }],
        };

        let res2 = app.execute_contract(Addr::unchecked("user2"), airdrop_addr.clone(), &msg2, &[]);
        assert!(res2.is_ok());
    }

    #[test]
    fn test_integration_large_airdrop() {
        let (mut app, airdrop_addr, cw20_addr) = setup_test_env();

        // Create 50 recipients
        let recipients: Vec<Recipient> = (0..50)
            .map(|i| Recipient {
                address: format!("recipient{}", i),
                amount: Uint128::new(1_000_000),
            })
            .collect();

        let msg = ExecuteMsg::Airdrop {
            token: cw20_addr.to_string(),
            recipients,
        };

        let res = app.execute_contract(Addr::unchecked("user"), airdrop_addr.clone(), &msg, &[]);
        assert!(res.is_ok());
    }
}

