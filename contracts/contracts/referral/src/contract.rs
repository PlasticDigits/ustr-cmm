//! Referral contract implementation

#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{
    from_json, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
    Uint128, WasmMsg,
};
use cw2::set_contract_version;
use cw20::{Cw20ExecuteMsg, Cw20ReceiveMsg};

use crate::error::ContractError;
use crate::msg::{
    CodeInfoResponse, CodesResponse, ConfigResponse, ExecuteMsg, InstantiateMsg, QueryMsg,
    RegisterCodeMsg, ValidateResponse,
};
use crate::state::{
    Config, CODES, CONFIG, CONTRACT_NAME, CONTRACT_VERSION, MAX_CODES_PER_OWNER, MAX_CODE_LENGTH,
    MIN_CODE_LENGTH, OWNER_CODES, REGISTRATION_FEE,
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

    let ustr_token = deps.api.addr_validate(&msg.ustr_token)?;

    let config = Config { ustr_token: ustr_token.clone() };

    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("ustr_token", ustr_token))
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
        ExecuteMsg::Receive(cw20_msg) => execute_receive(deps, env, info, cw20_msg),
    }
}

/// Handle CW20 receive hook for code registration
fn execute_receive(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    cw20_msg: Cw20ReceiveMsg,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Only accept USTR token
    if info.sender != config.ustr_token {
        return Err(ContractError::UnauthorizedToken);
    }

    // Verify exact registration fee
    if cw20_msg.amount != Uint128::from(REGISTRATION_FEE) {
        return Err(ContractError::InvalidAmount);
    }

    // Parse the embedded message
    let register_msg: RegisterCodeMsg = from_json(&cw20_msg.msg)?;

    // Validate and normalize code
    let normalized_code = validate_and_normalize_code(&register_msg.code)?;

    // Check if code already exists
    if CODES.has(deps.storage, &normalized_code) {
        return Err(ContractError::CodeAlreadyRegistered);
    }

    // Get the sender (the user who called Send on the USTR token)
    let owner = deps.api.addr_validate(&cw20_msg.sender)?;

    // Store the code
    CODES.save(deps.storage, &normalized_code, &owner)?;

    // Update owner's code list (with max limit check)
    let mut owner_codes = OWNER_CODES
        .may_load(deps.storage, &owner)?
        .unwrap_or_default();

    if owner_codes.len() >= MAX_CODES_PER_OWNER {
        return Err(ContractError::MaxCodesPerOwnerReached);
    }

    owner_codes.push(normalized_code.clone());
    OWNER_CODES.save(deps.storage, &owner, &owner_codes)?;

    // Burn the USTR (send to the burn address by calling Burn on the token)
    let burn_msg = WasmMsg::Execute {
        contract_addr: config.ustr_token.to_string(),
        msg: to_json_binary(&Cw20ExecuteMsg::Burn {
            amount: Uint128::from(REGISTRATION_FEE),
        })?,
        funds: vec![],
    };

    Ok(Response::new()
        .add_message(burn_msg)
        .add_attribute("action", "register_code")
        .add_attribute("code", &normalized_code)
        .add_attribute("owner", owner)
        .add_attribute("burned", REGISTRATION_FEE.to_string()))
}

// ============ HELPERS ============

/// Validate code format and normalize to lowercase
fn validate_and_normalize_code(code: &str) -> Result<String, ContractError> {
    // Check for empty
    if code.is_empty() {
        return Err(ContractError::EmptyCode);
    }

    // Check length
    if code.len() < MIN_CODE_LENGTH || code.len() > MAX_CODE_LENGTH {
        return Err(ContractError::InvalidCodeLength);
    }

    // Normalize to lowercase
    let normalized = code.to_lowercase();

    // Validate characters: only a-z, 0-9, _, -
    for c in normalized.chars() {
        if !c.is_ascii_lowercase() && !c.is_ascii_digit() && c != '_' && c != '-' {
            return Err(ContractError::InvalidCodeCharacters);
        }
    }

    Ok(normalized)
}

/// Check if a code format is valid (without checking registration)
fn is_valid_code_format(code: &str) -> bool {
    if code.is_empty() || code.len() < MIN_CODE_LENGTH || code.len() > MAX_CODE_LENGTH {
        return false;
    }

    let normalized = code.to_lowercase();
    normalized
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
}

// ============ QUERY ============

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&query_config(deps)?),
        QueryMsg::CodeInfo { code } => to_json_binary(&query_code_info(deps, code)?),
        QueryMsg::CodesByOwner { owner } => to_json_binary(&query_codes_by_owner(deps, owner)?),
        QueryMsg::ValidateCode { code } => to_json_binary(&query_validate_code(deps, code)?),
    }
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        ustr_token: config.ustr_token,
    })
}

fn query_code_info(deps: Deps, code: String) -> StdResult<Option<CodeInfoResponse>> {
    let normalized = code.to_lowercase();
    
    match CODES.may_load(deps.storage, &normalized)? {
        Some(owner) => Ok(Some(CodeInfoResponse {
            code: normalized,
            owner,
        })),
        None => Ok(None),
    }
}

fn query_codes_by_owner(deps: Deps, owner: String) -> StdResult<CodesResponse> {
    let owner_addr = deps.api.addr_validate(&owner)?;
    
    let codes = OWNER_CODES
        .may_load(deps.storage, &owner_addr)?
        .unwrap_or_default();
    
    Ok(CodesResponse { codes })
}

fn query_validate_code(deps: Deps, code: String) -> StdResult<ValidateResponse> {
    let is_valid_format = is_valid_code_format(&code);
    
    if !is_valid_format {
        return Ok(ValidateResponse {
            is_valid_format: false,
            is_registered: false,
            owner: None,
        });
    }

    let normalized = code.to_lowercase();
    let owner = CODES.may_load(deps.storage, &normalized)?;

    Ok(ValidateResponse {
        is_valid_format: true,
        is_registered: owner.is_some(),
        owner,
    })
}

// ============ TESTS ============

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{from_json, Addr};

    const USTR_TOKEN: &str = "ustr_token_addr";

    fn setup_contract(deps: DepsMut) {
        let msg = InstantiateMsg {
            ustr_token: USTR_TOKEN.to_string(),
        };
        let info = mock_info("creator", &[]);
        instantiate(deps, mock_env(), info, msg).unwrap();
    }

    #[test]
    fn test_instantiate() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.ustr_token.as_str(), USTR_TOKEN);
    }

    #[test]
    fn test_validate_code_format() {
        // Valid codes
        assert!(is_valid_code_format("abc123"));
        assert!(is_valid_code_format("my-code_1"));
        assert!(is_valid_code_format("a"));
        assert!(is_valid_code_format("12345678901234567890")); // 20 chars
        assert!(is_valid_code_format("ABC")); // Uppercase is valid (normalized to lowercase)

        // Invalid codes
        assert!(!is_valid_code_format("")); // Empty
        assert!(!is_valid_code_format("123456789012345678901")); // 21 chars
        assert!(!is_valid_code_format("my code")); // Space
        assert!(!is_valid_code_format("my@code")); // Special char
    }

    #[test]
    fn test_validate_and_normalize() {
        // Valid with normalization
        assert_eq!(
            validate_and_normalize_code("MyCode123").unwrap(),
            "mycode123"
        );
        assert_eq!(
            validate_and_normalize_code("MY-CODE_1").unwrap(),
            "my-code_1"
        );

        // Invalid - empty
        assert!(matches!(
            validate_and_normalize_code(""),
            Err(ContractError::EmptyCode)
        ));

        // Invalid - too long (21 characters)
        assert!(matches!(
            validate_and_normalize_code("123456789012345678901"),
            Err(ContractError::InvalidCodeLength)
        ));

        // Invalid - invalid characters
        assert!(matches!(
            validate_and_normalize_code("my code"),
            Err(ContractError::InvalidCodeCharacters)
        ));
        assert!(matches!(
            validate_and_normalize_code("my@code"),
            Err(ContractError::InvalidCodeCharacters)
        ));
    }

    #[test]
    fn test_register_code_unauthorized_token() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut());

        // Try to register from wrong token
        let info = mock_info("wrong_token", &[]);
        let msg = ExecuteMsg::Receive(Cw20ReceiveMsg {
            sender: "user".to_string(),
            amount: Uint128::from(REGISTRATION_FEE),
            msg: to_json_binary(&RegisterCodeMsg {
                code: "mycode".to_string(),
            })
            .unwrap(),
        });

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::UnauthorizedToken);
    }

    #[test]
    fn test_register_code_invalid_amount() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut());

        // Try with wrong amount
        let info = mock_info(USTR_TOKEN, &[]);
        let msg = ExecuteMsg::Receive(Cw20ReceiveMsg {
            sender: "user".to_string(),
            amount: Uint128::from(5_000_000_000_000_000_000u128), // 5 USTR instead of 10
            msg: to_json_binary(&RegisterCodeMsg {
                code: "mycode".to_string(),
            })
            .unwrap(),
        });

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::InvalidAmount);
    }

    #[test]
    fn test_register_code_success() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut());

        let info = mock_info(USTR_TOKEN, &[]);
        let msg = ExecuteMsg::Receive(Cw20ReceiveMsg {
            sender: "user".to_string(),
            amount: Uint128::from(REGISTRATION_FEE),
            msg: to_json_binary(&RegisterCodeMsg {
                code: "MyCode123".to_string(),
            })
            .unwrap(),
        });

        let res = execute(deps.as_mut(), env, info, msg).unwrap();

        // Check attributes
        assert_eq!(res.attributes[0].value, "register_code");
        assert_eq!(res.attributes[1].value, "mycode123"); // Normalized
        assert_eq!(res.attributes[2].value, "user");

        // Check burn message is present
        assert_eq!(res.messages.len(), 1);

        // Verify code is stored
        let owner = CODES.load(&deps.storage, "mycode123").unwrap();
        assert_eq!(owner, Addr::unchecked("user"));

        // Verify owner's codes list
        let codes = OWNER_CODES.load(&deps.storage, &Addr::unchecked("user")).unwrap();
        assert_eq!(codes, vec!["mycode123".to_string()]);
    }

    #[test]
    fn test_register_code_already_exists() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut());

        // Register first code
        let info = mock_info(USTR_TOKEN, &[]);
        let msg = ExecuteMsg::Receive(Cw20ReceiveMsg {
            sender: "user1".to_string(),
            amount: Uint128::from(REGISTRATION_FEE),
            msg: to_json_binary(&RegisterCodeMsg {
                code: "mycode".to_string(),
            })
            .unwrap(),
        });
        execute(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();

        // Try to register same code (different case)
        let msg = ExecuteMsg::Receive(Cw20ReceiveMsg {
            sender: "user2".to_string(),
            amount: Uint128::from(REGISTRATION_FEE),
            msg: to_json_binary(&RegisterCodeMsg {
                code: "MYCODE".to_string(), // Same code, different case
            })
            .unwrap(),
        });

        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::CodeAlreadyRegistered);
    }

    #[test]
    fn test_query_config() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut());

        let res = query(deps.as_ref(), env, QueryMsg::Config {}).unwrap();
        let config: ConfigResponse = from_json(res).unwrap();

        assert_eq!(config.ustr_token.as_str(), USTR_TOKEN);
    }

    #[test]
    fn test_query_code_info() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut());

        // Register a code
        let info = mock_info(USTR_TOKEN, &[]);
        let msg = ExecuteMsg::Receive(Cw20ReceiveMsg {
            sender: "user".to_string(),
            amount: Uint128::from(REGISTRATION_FEE),
            msg: to_json_binary(&RegisterCodeMsg {
                code: "mycode".to_string(),
            })
            .unwrap(),
        });
        execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Query existing code (case-insensitive)
        let res = query(
            deps.as_ref(),
            env.clone(),
            QueryMsg::CodeInfo {
                code: "MYCODE".to_string(),
            },
        )
        .unwrap();
        let code_info: Option<CodeInfoResponse> = from_json(res).unwrap();
        assert!(code_info.is_some());
        let info = code_info.unwrap();
        assert_eq!(info.code, "mycode");
        assert_eq!(info.owner, Addr::unchecked("user"));

        // Query non-existent code
        let res = query(
            deps.as_ref(),
            env,
            QueryMsg::CodeInfo {
                code: "nonexistent".to_string(),
            },
        )
        .unwrap();
        let code_info: Option<CodeInfoResponse> = from_json(res).unwrap();
        assert!(code_info.is_none());
    }

    #[test]
    fn test_query_codes_by_owner() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut());

        // Register two codes for same user
        let info = mock_info(USTR_TOKEN, &[]);
        
        let msg = ExecuteMsg::Receive(Cw20ReceiveMsg {
            sender: "user".to_string(),
            amount: Uint128::from(REGISTRATION_FEE),
            msg: to_json_binary(&RegisterCodeMsg {
                code: "code1".to_string(),
            })
            .unwrap(),
        });
        execute(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();

        let msg = ExecuteMsg::Receive(Cw20ReceiveMsg {
            sender: "user".to_string(),
            amount: Uint128::from(REGISTRATION_FEE),
            msg: to_json_binary(&RegisterCodeMsg {
                code: "code2".to_string(),
            })
            .unwrap(),
        });
        execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Query
        let res = query(
            deps.as_ref(),
            env,
            QueryMsg::CodesByOwner {
                owner: "user".to_string(),
            },
        )
        .unwrap();
        let codes: CodesResponse = from_json(res).unwrap();
        assert_eq!(codes.codes, vec!["code1".to_string(), "code2".to_string()]);
    }

    #[test]
    fn test_query_validate_code() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut());

        // Register a code
        let info = mock_info(USTR_TOKEN, &[]);
        let msg = ExecuteMsg::Receive(Cw20ReceiveMsg {
            sender: "user".to_string(),
            amount: Uint128::from(REGISTRATION_FEE),
            msg: to_json_binary(&RegisterCodeMsg {
                code: "mycode".to_string(),
            })
            .unwrap(),
        });
        execute(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Valid and registered
        let res = query(
            deps.as_ref(),
            env.clone(),
            QueryMsg::ValidateCode {
                code: "mycode".to_string(),
            },
        )
        .unwrap();
        let validate: ValidateResponse = from_json(res).unwrap();
        assert!(validate.is_valid_format);
        assert!(validate.is_registered);
        assert_eq!(validate.owner, Some(Addr::unchecked("user")));

        // Valid format but not registered
        let res = query(
            deps.as_ref(),
            env.clone(),
            QueryMsg::ValidateCode {
                code: "other".to_string(),
            },
        )
        .unwrap();
        let validate: ValidateResponse = from_json(res).unwrap();
        assert!(validate.is_valid_format);
        assert!(!validate.is_registered);
        assert!(validate.owner.is_none());

        // Invalid format
        let res = query(
            deps.as_ref(),
            env,
            QueryMsg::ValidateCode {
                code: "invalid code!".to_string(),
            },
        )
        .unwrap();
        let validate: ValidateResponse = from_json(res).unwrap();
        assert!(!validate.is_valid_format);
        assert!(!validate.is_registered);
        assert!(validate.owner.is_none());
    }

    #[test]
    fn test_max_codes_per_owner() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(deps.as_mut());

        let info = mock_info(USTR_TOKEN, &[]);

        // Register 10 codes (the maximum)
        for i in 0..10 {
            let msg = ExecuteMsg::Receive(Cw20ReceiveMsg {
                sender: "user".to_string(),
                amount: Uint128::from(REGISTRATION_FEE),
                msg: to_json_binary(&RegisterCodeMsg {
                    code: format!("code{}", i),
                })
                .unwrap(),
            });
            execute(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();
        }

        // Verify 10 codes registered
        let codes = OWNER_CODES.load(&deps.storage, &Addr::unchecked("user")).unwrap();
        assert_eq!(codes.len(), 10);

        // Try to register 11th code - should fail
        let msg = ExecuteMsg::Receive(Cw20ReceiveMsg {
            sender: "user".to_string(),
            amount: Uint128::from(REGISTRATION_FEE),
            msg: to_json_binary(&RegisterCodeMsg {
                code: "code10".to_string(),
            })
            .unwrap(),
        });

        let err = execute(deps.as_mut(), env.clone(), info.clone(), msg).unwrap_err();
        assert_eq!(err, ContractError::MaxCodesPerOwnerReached);

        // Different user should still be able to register
        let msg = ExecuteMsg::Receive(Cw20ReceiveMsg {
            sender: "user2".to_string(),
            amount: Uint128::from(REGISTRATION_FEE),
            msg: to_json_binary(&RegisterCodeMsg {
                code: "user2code".to_string(),
            })
            .unwrap(),
        });
        execute(deps.as_mut(), env, info, msg).unwrap();

        let codes = OWNER_CODES.load(&deps.storage, &Addr::unchecked("user2")).unwrap();
        assert_eq!(codes.len(), 1);
    }
}
