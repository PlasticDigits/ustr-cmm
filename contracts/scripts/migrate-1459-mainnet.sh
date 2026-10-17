#!/usr/bin/env bash
# One-shot, idempotent mainnet migration for DEX #1459 direct wrapper floors.
#   treasury 0.2.2 (code 11667) -> 0.3.0
#   wrap-mapper 0.3.0 (code 11574) -> 0.4.0
#
# Agent-prepared. The human only supplies the terrad keyring passphrase.
# Re-running is safe: wasm is stored once (matched by data_hash) and a contract
# already on the new code is not migrated again.
#
#   Run:  ./contracts/scripts/migrate-1459-mainnet.sh
#   Dry:  DRY_RUN=1 ./contracts/scripts/migrate-1459-mainnet.sh
#
# Rollback (2-of-3, same script): migrate each address back to its old code id.
set -euo pipefail

# ---------------------------------------------------------------- configuration
REPO="${REPO:-$HOME/repos/ustr-cmm}"
DEX="${DEX:-$HOME/repos/cl8y-dex-terraclassic}"
source "$DEX/scripts/lib/terrad-host.sh"

TREASURY=terra16j5u6ey7a84g40sr3gd94nzg5w5fm45046k9s2347qhfpwm5fr6sem3lr2
MAPPER=terra1xuuuhpmyd5t29ry7mydg7ra2q2phrwhx7j28nx7x9sjw6zznkumsz0nmd2
FLOOR_MSIG=terra1zlmv2xydxcusurtr6rl78wsvytdc6mfex6hep7

TREASURY_CODE_OLD=11667
MAPPER_CODE_OLD=11574

# Attested optimized artifacts (cosmwasm/workspace-optimizer:0.16.1).
TREASURY_WASM="$REPO/contracts/artifacts/treasury.wasm"
MAPPER_WASM="$REPO/contracts/artifacts/wrap_mapper.wasm"
TREASURY_SHA256=709b2b1a7026342518bbbe58713690a2e35dfd6127582a12fc9c205fcd33da76
MAPPER_SHA256=b9fc56bafe0b0c8066ed3f47ce64cc8936c92648352e91304f1632a9fb84c966

STORER=cl8ydeploy                     # funded EOA for permissionless wasm store
MSIG_SCRIPT="$DEX/scripts/multisig-2of3-host-tx.sh"

export TERRAD_HOST_CHAIN_ID=columbus-5
export TERRAD_HOST_NODE="${TERRAD_HOST_NODE:-https://terra-classic-rpc.publicnode.com:443}"
LCD="${LCD:-https://terra-classic-lcd.publicnode.com}"
RECEIPT="$REPO/contracts/scripts/migrate-1459-$(date -u +%Y%m%dT%H%M%SZ).json"

log() { printf '\n== %s ==\n' "$*" >&2; }

# ------------------------------------------------------------------- preflight
log "preflight: artifact checksums"
( cd "$(dirname "$TREASURY_WASM")" && printf '%s  %s\n' "$TREASURY_SHA256" "$(basename "$TREASURY_WASM")" | sha256sum -c - >&2 )
( cd "$(dirname "$MAPPER_WASM")"   && printf '%s  %s\n' "$MAPPER_SHA256"   "$(basename "$MAPPER_WASM")"   | sha256sum -c - >&2 )

admin_of() { curl -fsS "$LCD/cosmwasm/wasm/v1/contract/$1" | jq -r .contract_info.admin; }
code_of()  { curl -fsS "$LCD/cosmwasm/wasm/v1/contract/$1" | jq -r .contract_info.code_id; }
[[ "$(admin_of "$TREASURY")" == "$FLOOR_MSIG" ]] || { echo "FATAL: treasury admin is not the 2-of-3" >&2; exit 1; }
[[ "$(admin_of "$MAPPER")"   == "$FLOOR_MSIG" ]] || { echo "FATAL: mapper admin is not the 2-of-3" >&2; exit 1; }

TREASURY_CODE_CUR="$(code_of "$TREASURY")"
MAPPER_CODE_CUR="$(code_of "$MAPPER")"
log "live: treasury=$TREASURY_CODE_CUR mapper=$MAPPER_CODE_CUR"

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "DRY RUN: preflight passed; would store both artifacts if absent," >&2
  echo "         then 2-of-3 migrate mapper=$MAPPER ($MAPPER_CODE_CUR) and treasury=$TREASURY ($TREASURY_CODE_CUR)." >&2
  exit 0
fi

# --------------------------------------------------------------------- helpers
find_code_by_hash() {  # $1 = lowercase sha256
  local h; h="$(printf '%s' "$1" | tr 'a-f' 'A-F')"
  terrad query wasm list-code --node "$TERRAD_HOST_NODE" --reverse --limit 50 --output json 2>/dev/null \
    | jq -r --arg h "$h" '.code_infos[] | select((.data_hash | ascii_upcase) == $h) | .code_id' | head -1
}

store_if_needed() {  # $1=wasm $2=sha $3=label -> prints code id
  local wasm="$1" sha="$2" label="$3" id txhash
  id="$(find_code_by_hash "$sha" || true)"
  if [[ -n "$id" ]]; then
    log "$label already stored as code $id (data_hash match)"
    printf '%s' "$id"; return 0
  fi
  log "storing $label"
  TERRAD_HOST_KEY="$STORER" TERRAD_HOST_GAS_ADJUSTMENT=1.5 \
    terrad_host_tx wasm store "$wasm" | tee "/tmp/store-$label.json" >/dev/null
  txhash="$(jq -r '.txhash // empty' "/tmp/store-$label.json")"
  [[ -n "$txhash" ]] || { echo "FATAL: $label store produced no txhash" >&2; exit 1; }
  terrad_host_wait_tx_inclusion "$txhash"
  id="$(terrad_host_code_id_from_store_tx "$txhash")"
  [[ -n "$id" ]] || { echo "FATAL: no code id for $label" >&2; exit 1; }
  printf '%s' "$id"
}

# ----------------------------------------------------------------------- store
TREASURY_CODE_NEW="$(store_if_needed "$TREASURY_WASM" "$TREASURY_SHA256" treasury)"
MAPPER_CODE_NEW="$(store_if_needed   "$MAPPER_WASM"   "$MAPPER_SHA256"   wrap_mapper)"
log "target: treasury=$TREASURY_CODE_NEW mapper=$MAPPER_CODE_NEW"

# --------------------------------------------------------------------- migrate
MIG_MAPPER_TX=""; MIG_TREASURY_TX=""
# Mapper first: legacy wrap/unwrap keep working; only the new protected
# variants fail closed until the treasury catches up.
if [[ -z "$TREASURY_CODE_NEW" || -z "$MAPPER_CODE_NEW" ]]; then
  echo "FATAL: unresolved target code ids (treasury='$TREASURY_CODE_NEW' mapper='$MAPPER_CODE_NEW')" >&2
  exit 1
fi
if [[ "$MAPPER_CODE_CUR" != "$MAPPER_CODE_NEW" ]]; then
  log "migrating mapper $MAPPER_CODE_CUR -> $MAPPER_CODE_NEW (2-of-3)"
  out="$(MSIG_TX_DIR="$HOME/.msig-1459" "$MSIG_SCRIPT" wasm migrate "$MAPPER" "$MAPPER_CODE_NEW" '{}')"
  printf '%s\n' "$out" >&2
  MIG_MAPPER_TX="$(printf '%s' "$out" | grep -oE '[0-9A-F]{64}' | tail -1)"
else
  log "mapper already on target code"
fi

if [[ "$TREASURY_CODE_CUR" != "$TREASURY_CODE_NEW" ]]; then
  log "migrating treasury $TREASURY_CODE_CUR -> $TREASURY_CODE_NEW (2-of-3)"
  out="$(MSIG_TX_DIR="$HOME/.msig-1459" "$MSIG_SCRIPT" wasm migrate "$TREASURY" "$TREASURY_CODE_NEW" '{}')"
  printf '%s\n' "$out" >&2
  MIG_TREASURY_TX="$(printf '%s' "$out" | grep -oE '[0-9A-F]{64}' | tail -1)"
else
  log "treasury already on target code"
fi

# ------------------------------------------------------------------- readback
caps() { curl -fsS "$LCD/cosmwasm/wasm/v1/contract/$1/smart/$(printf '{"execution_capabilities":{}}' | base64 -w0)" | jq -c '.data'; }
MAPPER_CAP="$(caps "$MAPPER")"
TREASURY_CAP="$(caps "$TREASURY")"
log "capabilities"
echo "mapper:   $MAPPER_CAP"
echo "treasury: $TREASURY_CAP"
[[ "$MAPPER_CAP"   == '{"direct_wrapper_floor_version":1}' ]] || echo "WARN: mapper capability not v1" >&2
[[ "$TREASURY_CAP" == '{"direct_wrapper_floor_version":1}' ]] || echo "WARN: treasury capability not v1" >&2

# -------------------------------------------------------------------- receipt
jq -n \
  --arg time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg chain "$TERRAD_HOST_CHAIN_ID" \
  --arg treasury "$TREASURY" --arg mapper "$MAPPER" \
  --arg treasury_code_old "$TREASURY_CODE_CUR" --arg treasury_code_new "$TREASURY_CODE_NEW" \
  --arg mapper_code_old "$MAPPER_CODE_CUR" --arg mapper_code_new "$MAPPER_CODE_NEW" \
  --arg treasury_sha "$TREASURY_SHA256" --arg mapper_sha "$MAPPER_SHA256" \
  --arg mapper_tx "$MIG_MAPPER_TX" --arg treasury_tx "$MIG_TREASURY_TX" \
  --arg mapper_cap "$MAPPER_CAP" --arg treasury_cap "$TREASURY_CAP" \
  '{time_utc:$time, chain:$chain,
    treasury:{address:$treasury, code_old:$treasury_code_old, code_new:$treasury_code_new, migrate_tx:$treasury_tx, capability:$treasury_cap},
    mapper:{address:$mapper, code_old:$mapper_code_old, code_new:$mapper_code_new, migrate_tx:$mapper_tx, capability:$mapper_cap},
    artifacts:{treasury_sha256:$treasury_sha, mapper_sha256:$mapper_sha}}' > "$RECEIPT"
log "receipt: $RECEIPT"
echo "OK"
