#!/usr/bin/env bash
# Phase 3 one-shot: Treasury migrate + wrap-mapper wiring + CW20 spender (#5 / #6 / #7)
#
# Implements issue #5 steps A, B, C in one command (docs/DEPLOYMENT.md
# § "Treasury Migrate + CW20 Spender Wiring" + wrap wiring from the issue).
#
# Prerequisites:
#   - Optimized artifacts: contracts/artifacts/{treasury,wrap_mapper}.wasm (0.2.1)
#   - Keyring key cl8y2_admin = terra1xsecn4snv94ezcez0z3vq8an9j4h4kxxcydp8l
#     (treasury contract admin + governance)
#   - Funded LUNC for gas on that account
#
# Usage:
#   ./treasury-migrate-wrap-wire.sh              # A + B + C (mainnet, prompts)
#   ./treasury-migrate-wrap-wire.sh --dry-run    # gas-auto simulate, decline broadcast
#     (avoids broken terrad 3.5 --dry-run / keybase behavior)
#   ./treasury-migrate-wrap-wire.sh --step A     # only migrate
#   ./treasury-migrate-wrap-wire.sh --step B     # only wrap wiring (needs migrated treasury)
#   ./treasury-migrate-wrap-wire.sh --step C     # only SetCw20Spender
#
# Resume / overrides (env):
#   TREASURY_CODE_ID=…   WRAP_MAPPER_CODE_ID=…   # skip store when set
#   WRAP_MAPPER_ADDR=…   CLUNC_ADDR=…   CUSTC_ADDR=…
#   WINDOW_ADDR=…        TERRA_VFDUSD=…           # step C (defaults below)
#   VFDUSD_PULL_LIMIT_24H=10000000000            # 10_000 vFDUSD (6 decimals)
#   GAS_ADJUSTMENT=1.4   STORE_GAS_ADJUSTMENT=1.5
#   GAS_PRICES=28.325uluna
#   KEYRING_BACKEND=file KEY_NAME=cl8y2_admin
#
# Gas note (vs DEPLOYMENT.md fixed --fees 100000000uluna):
#   At gas-price 28.325uluna, 100 LUNC only covers ~3.53M gas. Wasm store of
#   treasury/wrap_mapper routinely exceeds that → out-of-gas. This script uses
#   --gas auto --gas-prices (same pattern as contracts/scripts/deploy.sh) and
#   STORE_GAS_ADJUSTMENT=1.5. Migrate/execute keep GAS_ADJUSTMENT=1.4.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-${SCRIPT_DIR}/../artifacts}"
OUT_DIR="${OUT_DIR:-${SCRIPT_DIR}}"

CHAIN_ID="${CHAIN_ID:-columbus-5}"
RPC="${RPC:-https://terra-classic-rpc.publicnode.com:443}"
LCD="${LCD:-https://terra-classic-lcd.publicnode.com}"

TREASURY="${TREASURY:-terra16j5u6ey7a84g40sr3gd94nzg5w5fm45046k9s2347qhfpwm5fr6sem3lr2}"
EXPECTED_ADMIN="${EXPECTED_ADMIN:-terra1xsecn4snv94ezcez0z3vq8an9j4h4kxxcydp8l}"
KEY_NAME="${KEY_NAME:-cl8y2_admin}"
KEYRING_BACKEND="${KEYRING_BACKEND:-file}"

CW20_CODE_ID="${CW20_CODE_ID:-10184}"
# Default 200 (2%): ~0.5% above post-#12223 burn tax 1.5%. Override if needed.
FEE_BPS="${FEE_BPS:-200}"

TERRA_VFDUSD="${TERRA_VFDUSD:-terra1mnl9azefrqpmu888ar2u6zrcwr80hxlt3avf4300r576cw5ar7esvxsvj3}"
WINDOW_ADDR="${WINDOW_ADDR:-terra1zxwpzpzpleatqn39r00grau4yt29sld8pw78s7ktvjafnj5nsaxq0h3rh2}"
VFDUSD_PULL_LIMIT_24H="${VFDUSD_PULL_LIMIT_24H:-10000000000}"

GAS_PRICES="${GAS_PRICES:-28.325uluna}"
GAS_ADJUSTMENT="${GAS_ADJUSTMENT:-1.4}"
STORE_GAS_ADJUSTMENT="${STORE_GAS_ADJUSTMENT:-1.5}"

DRY_RUN=0
STEP="all"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $*" >&2; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

usage() {
  sed -n '2,36p' "$0" | sed 's/^# \?//'
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --step) STEP="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) log_error "Unknown arg: $1"; usage ;;
  esac
done

case "$STEP" in
  all|A|B|C) ;;
  *) log_error "--step must be all|A|B|C"; exit 1 ;;
esac

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { log_error "Missing command: $1"; exit 1; }
}
need_cmd terrad
need_cmd jq
need_cmd curl

# Passphrase once (file keyring). Piped into each signing terrad invocation.
KEYRING_PASS=""
prompt_passphrase() {
  if [[ -n "${KEYRING_PASS:-}" ]]; then
    return 0
  fi
  if [[ -n "${TERRA_KEYRING_PASSWORD:-}" ]]; then
    KEYRING_PASS="$TERRA_KEYRING_PASSWORD"
    return 0
  fi
  read -r -s -p "Keyring passphrase for ${KEY_NAME} (${KEYRING_BACKEND}): " KEYRING_PASS
  echo >&2
  if [[ -z "$KEYRING_PASS" ]]; then
    log_error "Empty passphrase"
    exit 1
  fi
}

with_pass() {
  # shellcheck disable=SC2094
  printf '%s\n' "$KEYRING_PASS" | "$@"
}

KR=(--keyring-backend "$KEYRING_BACKEND")
NODE=(--node "$RPC" --chain-id "$CHAIN_ID")
# Bech32 address for --from (terrad --dry-run / simulate rejects key names).
KEY_ADDR=""

tx_flags() {
  local adj="${1:-$GAS_ADJUSTMENT}"
  echo --gas auto --gas-adjustment "$adj" --gas-prices "$GAS_PRICES" --broadcast-mode sync -y
}

# Support legacy (.logs[].events) and current (.events) terrad JSON.
get_event_attr() {
  local tx_json="$1" event_type="$2" attr_key="$3"
  echo "$tx_json" | jq -r --arg t "$event_type" --arg k "$attr_key" '
    def all_events: (.events // []) + ([.logs[]?.events // []] | add // []);
    all_events[] | select(.type == $t) | .attributes[] | select(.key == $k) | .value' \
    | head -n1
}

wait_for_tx() {
  local txhash="$1"
  local max_attempts="${2:-45}"
  local sleep_secs="${3:-2}"
  local attempt=1
  local tx_json=""

  while [[ "$attempt" -le "$max_attempts" ]]; do
    if tx_json=$(terrad query tx "$txhash" "${NODE[@]}" --output json 2>/dev/null); then
      if echo "$tx_json" | jq -e '.code == 0 or .code == "0" or (.code|tostring) == "0"' >/dev/null 2>&1; then
        # Some builds omit code on success; also accept missing code with events.
        echo "$tx_json"
        return 0
      fi
      # code null/absent often means success on older builds
      if echo "$tx_json" | jq -e '(.code // 0 | tonumber) == 0' >/dev/null 2>&1; then
        echo "$tx_json"
        return 0
      fi
      log_error "Tx $txhash failed on chain"
      echo "$tx_json" | jq -r '.raw_log // .logs // empty' >&2
      return 1
    fi
    log_info "Waiting for tx $txhash (attempt $attempt/$max_attempts)..."
    sleep "$sleep_secs"
    attempt=$((attempt + 1))
  done
  log_error "Tx $txhash not indexed after $max_attempts attempts"
  return 1
}

lcd_contract() {
  curl -sS "${LCD}/cosmwasm/wasm/v1/contract/${1}"
}

smart_query() {
  local addr="$1" msg="$2"
  terrad query wasm contract-state smart "$addr" "$msg" "${NODE[@]}" --output json
}

# Strip -y/--yes from argv (gas-estimate-then-decline path).
without_yes_argv() {
  local -a out=()
  local a
  for a in "$@"; do
    case "$a" in
      -y|--yes) continue ;;
      *) out+=("$a") ;;
    esac
  done
  printf '%s\0' "${out[@]}"
}

print_fee_bands() {
  local gas="$1"
  python3 - "$gas" "$GAS_PRICES" "$GAS_ADJUSTMENT" "$STORE_GAS_ADJUSTMENT" <<'PY' >&2
import sys
gas=int(sys.argv[1]); price=float(sys.argv[2].replace("uluna",""))
print(f"[INFO] gas estimate: {gas}")
for label, adj in (("execute/migrate", float(sys.argv[3])), ("store", float(sys.argv[4]))):
    est=int(gas*adj)
    print(f"[INFO]  {label} adj={adj} → gas_limit~{est} fee~{est*price/1e6:.2f} LUNC @ {price}uluna")
fixed=100_000_000
print(f"[INFO]  DEPLOYMENT.md fixed --fees 100000000uluna covers ≤{int(fixed/price):,} gas")
PY
}

# terrad 3.5 --dry-run is broken here (bech32-from / ".info: key not found").
# Instead: --gas auto WITHOUT -y, feed passphrase + "n" to simulate then decline.
estimate_tx_gas() {
  local -a cmd=()
  local arg
  while IFS= read -r -d '' arg; do
    cmd+=("$arg")
  done < <(without_yes_argv "$@")

  local out
  set +e
  out=$(printf '%s\nn\n' "$KEYRING_PASS" | "${cmd[@]}" 2>&1)
  local rc=$?
  set -e

  local gas
  gas=$(echo "$out" | sed -n 's/.*gas estimate:[[:space:]]*\([0-9][0-9]*\).*/\1/p' | tail -n1)
  if [[ -z "$gas" ]]; then
    log_error "Could not parse gas estimate (terrad rc=$rc)"
    echo "$out" | tail -n 40 >&2
    return 1
  fi
  print_fee_bands "$gas"
  return 0
}

broadcast_tx() {
  # Args: description, then full terrad tx ... command (without passphrase)
  local desc="$1"; shift
  log_info "$desc"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log_warn "DRY-RUN: gas-auto simulate as $KEY_NAME, then decline broadcast"
    estimate_tx_gas "$@"
    return $?
  fi

  local result txhash tx_json
  result=$(with_pass "$@" --output json)
  txhash=$(echo "$result" | jq -r '.txhash // empty')
  if [[ -z "$txhash" || "$txhash" == "null" ]]; then
    log_error "No txhash in broadcast response"
    echo "$result" | jq . >&2 || echo "$result" >&2
    return 1
  fi
  log_info "Tx hash: $txhash"
  tx_json=$(wait_for_tx "$txhash")
  echo "$tx_json"
}

store_wasm() {
  local wasm="$1" label="$2" adj="${3:-$STORE_GAS_ADJUSTMENT}"
  [[ -f "$wasm" ]] || { log_error "Missing wasm: $wasm"; exit 1; }
  local bytes
  bytes=$(wc -c <"$wasm" | tr -d ' ')
  log_info "Storing $label ($bytes bytes) gas-adj=$adj gas-prices=$GAS_PRICES"
  # Rough fee ceiling hint (not a hard limit)
  python3 - "$bytes" "$GAS_PRICES" <<'PY' >&2
import sys
size=int(sys.argv[1]); price=float(sys.argv[2].replace('uluna',''))
# empirical band for classic store
for gas in (3_000_000, 5_000_000, 8_000_000):
    print(f"[INFO]  if store gas≈{gas:,} → fee≈{gas*price/1e6:.1f} LUNC (DEPLOYMENT fixed 100 LUNC covers ≤{int(100e6/price):,} gas)")
PY

  local tx_json
  if ! tx_json=$(broadcast_tx "wasm store $label" \
    terrad tx wasm store "$wasm" \
      --from "$KEY_NAME" "${KR[@]}" "${NODE[@]}" \
      $(tx_flags "$adj")); then
    return 1
  fi
  [[ "$DRY_RUN" -eq 1 ]] && { echo ""; return 0; }

  local code_id
  code_id=$(get_event_attr "$tx_json" "store_code" "code_id")
  [[ -n "$code_id" && "$code_id" != "null" ]] || { log_error "No code_id from store"; exit 1; }
  log_info "$label code_id=$code_id"
  echo "$code_id"
}

preflight() {
  log_info "=== Preflight ==="
  log_info "chain=$CHAIN_ID rpc=$RPC"
  log_info "treasury=$TREASURY"
  log_info "expected admin/gov=$EXPECTED_ADMIN key=$KEY_NAME"

  local info admin code_id
  info=$(lcd_contract "$TREASURY")
  admin=$(echo "$info" | jq -r '.contract_info.admin')
  code_id=$(echo "$info" | jq -r '.contract_info.code_id')
  log_info "on-chain treasury admin=$admin code_id=$code_id"

  if [[ "$admin" != "$EXPECTED_ADMIN" ]]; then
    log_error "Treasury admin mismatch: got $admin want $EXPECTED_ADMIN"
    exit 1
  fi

  prompt_passphrase
  KEY_ADDR=$(with_pass terrad keys show "$KEY_NAME" -a "${KR[@]}")
  log_info "keyring $KEY_NAME → $KEY_ADDR"
  if [[ "$KEY_ADDR" != "$EXPECTED_ADMIN" ]]; then
    log_error "Key $KEY_NAME address $KEY_ADDR != expected $EXPECTED_ADMIN"
    exit 1
  fi

  local cfg
  cfg=$(smart_query "$TREASURY" '{"config":{}}')
  log_info "pre-migrate config: $(echo "$cfg" | jq -c '.data // .')"

  local bal
  bal=$(terrad query bank balances "$KEY_ADDR" "${NODE[@]}" --output json \
    | jq -r '[.balances[]? | select(.denom=="uluna") | .amount] | first // "0"')
  log_info "signer uluna balance: $bal"
  if [[ "${bal:-0}" -lt 200000000 ]]; then
    log_warn "Low LUNC balance (<200 LUNC). Wasm store may need 100–250 LUNC each."
  fi

  # Gas sanity vs DEPLOYMENT.md fixed fee
  python3 - <<'PY' >&2
price=28.325
fixed=100_000_000
print(f"[INFO] DEPLOYMENT.md --fees 100000000uluna covers ≤{int(fixed/price):,} gas @ {price}uluna")
print("[INFO] Script uses --gas auto --gas-prices instead (required for store).")
PY
}

step_a() {
  log_info "=== A. One-shot treasury migrate ==="

  local treasury_wasm="${ARTIFACTS_DIR}/treasury.wasm"
  local new_code="${TREASURY_CODE_ID:-}"

  if [[ -z "$new_code" ]]; then
    new_code=$(store_wasm "$treasury_wasm" "treasury" "$STORE_GAS_ADJUSTMENT")
    [[ "$DRY_RUN" -eq 1 ]] && new_code="${TREASURY_CODE_ID:-<dry-run>}"
  else
    log_info "Skipping treasury store; TREASURY_CODE_ID=$new_code"
  fi

  if [[ "$DRY_RUN" -eq 0 ]]; then
    broadcast_tx "migrate treasury → code $new_code" \
      terrad tx wasm migrate "$TREASURY" "$new_code" '{}' \
        --from "$KEY_NAME" "${KR[@]}" "${NODE[@]}" \
        $(tx_flags "$GAS_ADJUSTMENT") >/dev/null

    log_info "Verifying post-migrate queries..."
    smart_query "$TREASURY" '{"config":{}}' | jq .
    smart_query "$TREASURY" '{"denom_wrappers":{}}' | jq .
    smart_query "$TREASURY" '{"cw20_spenders":{}}' | jq .
    # pair query OK even if empty / unset
    smart_query "$TREASURY" \
      "{\"cw20_spender_limit\":{\"token\":\"$TERRA_VFDUSD\",\"spender\":\"$WINDOW_ADDR\"}}" \
      | jq . || log_warn "cw20_spender_limit empty (expected until step C)"

    local cfg
    cfg=$(smart_query "$TREASURY" '{"config":{}}')
    echo "$cfg" | jq -e '
      (.data // .) as $c
      | ($c.swap_contract == null)
        and (($c.cw20_instant_withdraw_paused // false) == false)
    ' >/dev/null \
      || { log_error "config check failed (want swap_contract=null, cw20_iw not paused)"; exit 1; }
    log_info "A OK — treasury migrated (code_id was → $new_code)"
    TREASURY_CODE_ID="$new_code"
  else
    log_warn "DRY-RUN: would migrate $TREASURY → new treasury code_id (after store)"
    if [[ -n "${TREASURY_CODE_ID:-}" ]]; then
      broadcast_tx "simulate migrate → $TREASURY_CODE_ID" \
        terrad tx wasm migrate "$TREASURY" "$TREASURY_CODE_ID" '{}' \
          --from "$KEY_NAME" "${KR[@]}" "${NODE[@]}" \
          $(tx_flags "$GAS_ADJUSTMENT")
    else
      log_warn "DRY-RUN: skip migrate gas sim (set TREASURY_CODE_ID to estimate migrate)"
    fi
  fi
}

step_b() {
  log_info "=== B. Phase 3 wrap wiring ==="

  local wrap_wasm="${ARTIFACTS_DIR}/wrap_mapper.wasm"
  local wrap_code="${WRAP_MAPPER_CODE_ID:-}"
  local wrap_addr="${WRAP_MAPPER_ADDR:-}"
  local clunc="${CLUNC_ADDR:-}"
  local custc="${CUSTC_ADDR:-}"

  if [[ -z "$wrap_code" ]]; then
    wrap_code=$(store_wasm "$wrap_wasm" "wrap_mapper" "$STORE_GAS_ADJUSTMENT")
    [[ "$DRY_RUN" -eq 1 ]] && wrap_code="${WRAP_MAPPER_CODE_ID:-<dry-run>}"
  else
    log_info "Skipping wrap-mapper store; WRAP_MAPPER_CODE_ID=$wrap_code"
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log_warn "DRY-RUN: skipping instantiate/execute for B (stores simulated above)"
    return 0
  fi

  if [[ -z "$wrap_addr" ]]; then
    local init
    init=$(jq -nc \
      --arg g "$EXPECTED_ADMIN" \
      --arg t "$TREASURY" \
      --argjson f "$FEE_BPS" \
      '{governance:$g, treasury:$t, fee_bps:$f}')
    local tx_json
    tx_json=$(broadcast_tx "instantiate wrap-mapper fee_bps=$FEE_BPS" \
      terrad tx wasm instantiate "$wrap_code" "$init" \
        --label "cmm-wrap-mapper" \
        --admin "$EXPECTED_ADMIN" \
        --from "$KEY_NAME" "${KR[@]}" "${NODE[@]}" \
        $(tx_flags "$GAS_ADJUSTMENT"))
    wrap_addr=$(get_event_attr "$tx_json" "instantiate" "_contract_address")
    [[ -n "$wrap_addr" ]] || { log_error "No wrap-mapper address"; exit 1; }
    log_info "wrap-mapper=$wrap_addr"
  else
    log_info "Using WRAP_MAPPER_ADDR=$wrap_addr"
  fi

  # Verify fee_bps
  local wcfg
  wcfg=$(smart_query "$wrap_addr" '{"config":{}}')
  echo "$wcfg" | jq .
  echo "$wcfg" | jq -e --argjson f "$FEE_BPS" '((.data // .).fee_bps | tonumber) == $f' >/dev/null \
    || { log_error "wrap-mapper fee_bps != $FEE_BPS"; exit 1; }

  instantiate_cw20() {
    local name="$1" symbol="$2"
    local msg
    msg=$(jq -nc \
      --arg n "$name" --arg s "$symbol" --arg m "$EXPECTED_ADMIN" \
      '{name:$n, symbol:$s, decimals:6, initial_balances:[], mint:{minter:$m, cap:null}, marketing:null}')
    local tx_json addr
    tx_json=$(broadcast_tx "instantiate $symbol" \
      terrad tx wasm instantiate "$CW20_CODE_ID" "$msg" \
        --label "$symbol" \
        --admin "$EXPECTED_ADMIN" \
        --from "$KEY_NAME" "${KR[@]}" "${NODE[@]}" \
        $(tx_flags "$GAS_ADJUSTMENT"))
    addr=$(get_event_attr "$tx_json" "instantiate" "_contract_address")
    [[ -n "$addr" ]] || { log_error "No address for $symbol"; exit 1; }
    echo "$addr"
  }

  if [[ -z "$clunc" ]]; then
    clunc=$(instantiate_cw20 "Wrapped LUNC" "cLUNC")
  fi
  if [[ -z "$custc" ]]; then
    custc=$(instantiate_cw20 "Wrapped USTC" "cUSTC")
  fi
  log_info "cLUNC=$clunc"
  log_info "cUSTC=$custc"

  broadcast_tx "cLUNC add_minter wrap-mapper" \
    terrad tx wasm execute "$clunc" \
      "$(jq -nc --arg m "$wrap_addr" '{add_minter:{minter:$m}}')" \
      --from "$KEY_NAME" "${KR[@]}" "${NODE[@]}" \
      $(tx_flags "$GAS_ADJUSTMENT") >/dev/null

  broadcast_tx "cUSTC add_minter wrap-mapper" \
    terrad tx wasm execute "$custc" \
      "$(jq -nc --arg m "$wrap_addr" '{add_minter:{minter:$m}}')" \
      --from "$KEY_NAME" "${KR[@]}" "${NODE[@]}" \
      $(tx_flags "$GAS_ADJUSTMENT") >/dev/null

  broadcast_tx "SetDenomMapping uluna→cLUNC" \
    terrad tx wasm execute "$wrap_addr" \
      "$(jq -nc --arg c "$clunc" '{set_denom_mapping:{denom:"uluna",cw20_addr:$c}}')" \
      --from "$KEY_NAME" "${KR[@]}" "${NODE[@]}" \
      $(tx_flags "$GAS_ADJUSTMENT") >/dev/null

  broadcast_tx "SetDenomMapping uusd→cUSTC" \
    terrad tx wasm execute "$wrap_addr" \
      "$(jq -nc --arg c "$custc" '{set_denom_mapping:{denom:"uusd",cw20_addr:$c}}')" \
      --from "$KEY_NAME" "${KR[@]}" "${NODE[@]}" \
      $(tx_flags "$GAS_ADJUSTMENT") >/dev/null

  broadcast_tx "treasury SetDenomWrapper uluna→wrap-mapper" \
    terrad tx wasm execute "$TREASURY" \
      "$(jq -nc --arg w "$wrap_addr" '{set_denom_wrapper:{denom:"uluna",wrapper:$w}}')" \
      --from "$KEY_NAME" "${KR[@]}" "${NODE[@]}" \
      $(tx_flags "$GAS_ADJUSTMENT") >/dev/null

  broadcast_tx "treasury SetDenomWrapper uusd→wrap-mapper" \
    terrad tx wasm execute "$TREASURY" \
      "$(jq -nc --arg w "$wrap_addr" '{set_denom_wrapper:{denom:"uusd",wrapper:$w}}')" \
      --from "$KEY_NAME" "${KR[@]}" "${NODE[@]}" \
      $(tx_flags "$GAS_ADJUSTMENT") >/dev/null

  log_info "Post-wire queries:"
  smart_query "$TREASURY" '{"denom_wrappers":{}}' | jq .
  smart_query "$wrap_addr" '{"all_denom_mappings":{}}' | jq .
  smart_query "$clunc" '{"minters":{}}' | jq . || true
  smart_query "$custc" '{"minters":{}}' | jq . || true

  WRAP_MAPPER_CODE_ID="$wrap_code"
  WRAP_MAPPER_ADDR="$wrap_addr"
  CLUNC_ADDR="$clunc"
  CUSTC_ADDR="$custc"
  log_info "B OK — wrap wiring complete (smoke wrap/unwrap is manual)"
}

step_c() {
  log_info "=== C. CW20 InstantWithdraw spender (vFDUSD → ust1-window) ==="
  log_info "token=$TERRA_VFDUSD spender=$WINDOW_ADDR limit_24h=$VFDUSD_PULL_LIMIT_24H"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    # Live code 10673 has no set_cw20_spender — sim always fails until step A migrates.
    log_warn "DRY-RUN: skip SetCw20Spender gas sim (treasury still pre-migrate; msg unknown until A)"
    log_info "Post-migrate execute gas is typically ~100k–400k → fee ~5–15 LUNC @ 28.325uluna (adj 1.4)"
    return 0
  fi

  # Confirm window still admin'd by expected gov (sanity)
  local wadmin
  wadmin=$(lcd_contract "$WINDOW_ADDR" | jq -r '.contract_info.admin')
  if [[ "$wadmin" != "$EXPECTED_ADMIN" ]]; then
    log_warn "ust1-window admin is $wadmin (expected $EXPECTED_ADMIN) — continuing"
  fi

  broadcast_tx "SetCw20Spender + limit_24h (fail-closed)" \
    terrad tx wasm execute "$TREASURY" \
      "$(jq -nc --arg t "$TERRA_VFDUSD" --arg s "$WINDOW_ADDR" --arg l "$VFDUSD_PULL_LIMIT_24H" \
        '{set_cw20_spender:{token:$t,spender:$s,limit_24h:$l}}')" \
      --from "$KEY_NAME" "${KR[@]}" "${NODE[@]}" \
      $(tx_flags "$GAS_ADJUSTMENT") >/dev/null

  smart_query "$TREASURY" '{"cw20_spenders":{}}' | jq .
  smart_query "$TREASURY" \
    "{\"cw20_spender_limit\":{\"token\":\"$TERRA_VFDUSD\",\"spender\":\"$WINDOW_ADDR\"}}" \
    | jq .

  log_info "C OK — spender registered with 24h limit (redeem smoke is manual)"
}

write_summary() {
  local out="${OUT_DIR}/treasury-migrate-wrap-$(date +%Y%m%d-%H%M%S).json"
  jq -nc \
    --arg network "$CHAIN_ID" \
    --arg treasury "$TREASURY" \
    --arg admin "$EXPECTED_ADMIN" \
    --arg tcode "${TREASURY_CODE_ID:-}" \
    --arg wcode "${WRAP_MAPPER_CODE_ID:-}" \
    --arg waddr "${WRAP_MAPPER_ADDR:-}" \
    --arg clunc "${CLUNC_ADDR:-}" \
    --arg custc "${CUSTC_ADDR:-}" \
    --arg vfdusd "$TERRA_VFDUSD" \
    --arg window "$WINDOW_ADDR" \
    --arg limit "$VFDUSD_PULL_LIMIT_24H" \
    --argjson fee "$FEE_BPS" \
    '{
      network:$network,
      treasury:$treasury,
      admin:$admin,
      fee_bps:$fee,
      code_ids:{treasury:$tcode, wrap_mapper:$wcode, cw20_mintable:"'"$CW20_CODE_ID"'"},
      contracts:{wrap_mapper:$waddr, cLUNC:$clunc, cUSTC:$custc, vFDUSD:$vfdusd, window:$window},
      cw20_spender:{token:$vfdusd, spender:$window, limit_24h:$limit},
      gas:{gas_prices:"'"$GAS_PRICES"'", gas_adjustment:"'"$GAS_ADJUSTMENT"'", store_gas_adjustment:"'"$STORE_GAS_ADJUSTMENT"'"}
    }' >"$out"
  log_info "Wrote $out"
}

main() {
  if [[ "$CHAIN_ID" == "columbus-5" && "$DRY_RUN" -eq 0 ]]; then
    log_warn "MAINNET columbus-5 — this will store/migrate/execute live txs"
    read -r -p "Type 'yes' to continue: " confirm
    [[ "$confirm" == "yes" ]] || { log_info "Cancelled"; exit 0; }
  fi

  preflight

  case "$STEP" in
    all) step_a; step_b; step_c ;;
    A) step_a ;;
    B) step_b ;;
    C) step_c ;;
  esac

  if [[ "$DRY_RUN" -eq 0 ]]; then
    write_summary
  fi

  log_info "Done (step=$STEP dry_run=$DRY_RUN)."
  log_info "Manual follow-ups: small wrap/unwrap smoke both denoms; window redeem smoke; update docs/CONTRACTS.md addresses."
}

main
