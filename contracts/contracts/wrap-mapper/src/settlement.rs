//! Version 1 direct wrapper floors measure the recipient's actual balance delta.
//! The lock spans mint/burn/withdraw callbacks; errors revert the entire transaction.
use crate::error::ContractError;
use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Deps, DepsMut, Reply, Response, StdError, Storage, SubMsg, Uint128};
use cw_storage_plus::Item;

const SETTLEMENT_REPLY_ID: u64 = 1459;
const PENDING: Item<Pending> = Item::new("direct_floor_settlement_v1");

#[cw_serde]
pub(crate) enum ReceiveAsset {
    Native(String),
    Cw20(Addr),
}
#[cw_serde]
struct Pending {
    recipient: Addr,
    asset: ReceiveAsset,
    before: Uint128,
    minimum: Uint128,
}

fn balance(deps: Deps, recipient: &Addr, asset: &ReceiveAsset) -> Result<Uint128, ContractError> {
    Ok(match asset {
        ReceiveAsset::Native(denom) => deps.querier.query_balance(recipient, denom)?.amount,
        ReceiveAsset::Cw20(token) => {
            let response: cw20::BalanceResponse = deps.querier.query_wasm_smart(
                token,
                &cw20::Cw20QueryMsg::Balance {
                    address: recipient.to_string(),
                },
            )?;
            response.balance
        }
    })
}
pub(crate) fn ensure_idle(storage: &dyn Storage) -> Result<(), ContractError> {
    if PENDING.may_load(storage)?.is_some() {
        return Err(ContractError::SettlementInProgress);
    }
    Ok(())
}
pub(crate) fn protect(
    deps: DepsMut,
    mut response: Response,
    recipient: Addr,
    asset: ReceiveAsset,
    minimum: Uint128,
) -> Result<Response, ContractError> {
    ensure_idle(deps.storage)?;
    if minimum.is_zero() {
        return Err(ContractError::ZeroAmount);
    }
    let before = balance(deps.as_ref(), &recipient, &asset)?;
    let final_message = response
        .messages
        .last_mut()
        .ok_or_else(|| StdError::generic_err("Missing wrapper settlement message"))?;
    *final_message = SubMsg::reply_on_success(final_message.msg.clone(), SETTLEMENT_REPLY_ID);
    PENDING.save(
        deps.storage,
        &Pending {
            recipient,
            asset,
            before,
            minimum,
        },
    )?;
    Ok(response)
}
pub(crate) fn settle(deps: DepsMut, msg: Reply) -> Result<Response, ContractError> {
    if msg.id != SETTLEMENT_REPLY_ID || msg.result.is_err() {
        return Err(StdError::generic_err("Invalid wrapper settlement reply").into());
    }
    let pending = PENDING.load(deps.storage)?;
    let after = balance(deps.as_ref(), &pending.recipient, &pending.asset)?;
    let received = after
        .checked_sub(pending.before)
        .map_err(StdError::overflow)?;
    if received < pending.minimum {
        return Err(ContractError::MinimumReceive {
            received: received.to_string(),
            required: pending.minimum.to_string(),
        });
    }
    PENDING.remove(deps.storage);
    Ok(Response::new()
        .add_attribute("action", "direct_floor_settled")
        .add_attribute("received", received)
        .add_attribute("minimum_receive", pending.minimum))
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::mock_dependencies;
    use cosmwasm_std::{coin, BankMsg, SubMsgResponse, SubMsgResult};
    #[test]
    fn actual_native_delta_after_tax_ignores_inventory_and_keeps_lock_until_floor_passes() {
        let mut deps = mock_dependencies();
        let recipient = Addr::unchecked("recipient");
        deps.querier
            .update_balance(&recipient, vec![coin(1_000_000, "uluna")]);
        let response = Response::new().add_message(BankMsg::Send {
            to_address: recipient.to_string(),
            amount: vec![coin(9800, "uluna")],
        });
        protect(
            deps.as_mut(),
            response,
            recipient.clone(),
            ReceiveAsset::Native("uluna".into()),
            Uint128::new(9654),
        )
        .unwrap();
        assert_eq!(
            ensure_idle(&deps.storage),
            Err(ContractError::SettlementInProgress)
        );
        // Delivered delta is 9653 after the actual bank deduction, despite nominal 9800.
        deps.querier
            .update_balance(&recipient, vec![coin(1_009_653, "uluna")]);
        let reply = || Reply {
            id: SETTLEMENT_REPLY_ID,
            result: SubMsgResult::Ok(SubMsgResponse {
                events: vec![],
                data: None,
            }),
        };
        assert_eq!(
            settle(deps.as_mut(), reply()),
            Err(ContractError::MinimumReceive {
                received: "9653".into(),
                required: "9654".into()
            })
        );
        assert_eq!(
            ensure_idle(&deps.storage),
            Err(ContractError::SettlementInProgress)
        );
        deps.querier
            .update_balance(&recipient, vec![coin(1_009_654, "uluna")]);
        settle(deps.as_mut(), reply()).unwrap();
        ensure_idle(&deps.storage).unwrap();
    }
}

#[cfg(test)]
mod reply_guard_tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{coin, BankMsg, SubMsgResponse, SubMsgResult};

    #[test]
    fn unknown_reply_cannot_clear_lock_and_execute_cannot_reenter() {
        let mut deps = mock_dependencies();
        let recipient = Addr::unchecked("recipient");
        deps.querier
            .update_balance(&recipient, vec![coin(10, "uluna")]);
        protect(
            deps.as_mut(),
            Response::new().add_message(BankMsg::Send {
                to_address: recipient.to_string(),
                amount: vec![coin(1, "uluna")],
            }),
            recipient,
            ReceiveAsset::Native("uluna".into()),
            Uint128::one(),
        )
        .unwrap();
        let msg = Reply {
            id: SETTLEMENT_REPLY_ID + 1,
            result: SubMsgResult::Ok(SubMsgResponse {
                events: vec![],
                data: None,
            }),
        };
        assert!(settle(deps.as_mut(), msg).is_err());
        assert_eq!(
            crate::contract::execute(
                deps.as_mut(),
                mock_env(),
                mock_info("governance", &[]),
                crate::msg::ExecuteMsg::SetPaused { paused: false }
            ),
            Err(ContractError::SettlementInProgress)
        );
        assert_eq!(
            ensure_idle(&deps.storage),
            Err(ContractError::SettlementInProgress)
        );
    }
}
