# USTR CMM — Collateralized Stablecoin System

A collateralized CW20 stablecoin system for TerraClassic, introducing USTR and UST1 tokens with secure treasury management.

## Overview

USTR CMM creates a pathway for USTC holders to participate in a new collateralized stablecoin ecosystem. See the full [Proposal](./PROPOSAL.md) for detailed specifications.

- **USTR**: Utility/governance token acquired through time-limited USTC swap
- **UST1**: Live collateralized unstablecoin (CW20); circulating supply and CR on the Treasury page
- **Treasury**: Secure, governance-controlled asset custody with 7-day timelock

## Deployments

### Columbus-5 (TerraClassic Mainnet)

| Contract | Code ID | Address |
|----------|---------|---------|
| USTR Token | `10184` | `terra1vy3kc0swag2rhn7jz6n72jp0l2ns0p6r6ez5grxq5uhj2rvs97fqfsetxv` |
| Treasury | `11564` | `terra16j5u6ey7a84g40sr3gd94nzg5w5fm45046k9s2347qhfpwm5fr6sem3lr2` |
| wrap-mapper | `11574` | `terra1xuuuhpmyd5t29ry7mydg7ra2q2phrwhx7j28nx7x9sjw6zznkumsz0nmd2` |
| cLUNC | `10184` | `terra1437qslye72t7qmmahn4t5chz50r8a62g45phwkquwpyu2l62u6ksqssgdg` |
| cUSTC | `10184` | `terra1nap4dxh9tv35v0ynd9m4k6zt6c0dq6weszc4j5m564kjls56hu7qcr56ch` |
| USTC-Swap | `10838` | `terra16ytnkhw53elefz2rhulcr4vq8fs83nd97ht3wt05wtcq7ypcmpqqv37lel` |
| Referral | `10700` | `terra1lxv5m2n72l4zujf0rrgek9k6m8kfky62yvm8qvlnjqgjmmlmywzqt4j0z2` |
| Airdrop | `10700` | `terra1m758wqc6grg7ttg8cmrp72hf6a5cej5zq0w59d9d6wr5r22tulwqk3ga5r` |
| UST1 | `10184` | `terra1f0eqgy9w7e5e7up97vjudqwx38tesf8ylx75x2lv3nwm0clry0pqmgfy72` |
| vFDUSD | `10184` | `terra1mnl9azefrqpmu888ar2u6zrcwr80hxlt3avf4300r576cw5ar7esvxsvj3` |
| ust1-oracle | — | `terra1fmht0t6svq3n24zx03nkfja0m40zhfyyxkdcvlrkl6u7gfe6aagq4gch8n` |
| ust1-window | `11566` | `terra1zxwpzpzpleatqn39r00grau4yt29sld8pw78s7ktvjafnj5nsaxq0h3rh2` |

See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for wrap/spender wiring, the 2026-08-08 treasury migrate record, and the 2026-08-15 wrap-mapper `11574` / `SetFees` 200/51 record. Frontend Treasury + Legal + wallets: [skills/frontend-vfdusd-oracle](./skills/frontend-vfdusd-oracle/SKILL.md), [skills/frontend-ust1-ratios](./skills/frontend-ust1-ratios/SKILL.md), [skills/frontend-treasury-lp-nav](./skills/frontend-treasury-lp-nav/SKILL.md), [skills/frontend-treasury-available-supply](./skills/frontend-treasury-available-supply/SKILL.md), [skills/frontend-treasury-cl8y-holdings](./skills/frontend-treasury-cl8y-holdings/SKILL.md), [skills/frontend-legal-clickwrap](./skills/frontend-legal-clickwrap/SKILL.md), [skills/frontend-keplr-compatible-wallets](./skills/frontend-keplr-compatible-wallets/SKILL.md) ([docs/WALLETS.md](./docs/WALLETS.md), [#4](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/4), [#18](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/18), [#20](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/20)).

## Project Structure

```
ustr-cmm/
├── contracts/           # CosmWasm smart contracts (Rust)
│   ├── contracts/
│   │   ├── airdrop/     # USTR airdrop distribution
│   │   ├── treasury/    # Asset custody with governance timelock
│   │   └── ustc-swap/   # Time-decaying USTC→USTR swap
│   ├── external/
│   │   ├── cw20-mintable/        # Git submodule: PlasticDigits/cw20-mintable
│   │   └── cmm-ustc-preregister/ # Git submodule: PlasticDigits/cmm-ustc-preregister
│   ├── packages/
│   │   └── common/      # Shared types and utilities
│   └── scripts/         # Deployment scripts
│
├── frontend/            # React/TypeScript web application
│   └── src/
│       ├── components/
│       ├── hooks/
│       ├── services/
│       └── ...
│
├── docs/                # Additional documentation
│
└── PROPOSAL.md          # Full project proposal
```

## Key Features

### USTC→USTR Swap
- **100-day swap period** with time-decaying exchange rate
- **1.5 USTC per USTR** at start → **2.5 USTC per USTR** at end
- Early participants receive more favorable rates
- All USTC flows directly to treasury

### Treasury Contract
- Holds all protocol assets (native and CW20 tokens)
- **7-day timelock** on governance address changes
- Supports withdrawal of any asset type
- Future DAO governance ready

### Token Standards
- Based on [PlasticDigits/cw20-mintable](https://github.com/PlasticDigits/cw20-mintable)
- TerraClassic compatible (columbus-5 mainnet, rebel-2 testnet)
- Standard CW20 interface with mintable extension

## Networks

| Network | Chain ID | CW20 Mintable Code ID |
|---------|----------|----------------------|
| Mainnet | columbus-5 | 10184 |
| Testnet | rebel-2 | 1641 |

## Development

### Prerequisites

- Rust 1.44.1+ with `wasm32-unknown-unknown` target
- Node.js (see `.nvmrc` for version)
- Docker (recommended for contract builds)

### Smart Contracts

```bash
cd contracts

# Initialize submodules (first time only)
git submodule update --init --recursive

# Run tests
cargo test

# Build optimized contracts (Docker)
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/code/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/rust-optimizer:0.16.0
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build
```

### Reference Examples

The `contracts/external/` submodules contain reference implementations for TerraClassic development:

- **cw20-mintable** — CosmWasm contract patterns (state, messages, error handling)
- **cmm-ustc-preregister** — Full-stack examples including:
  - `smartcontracts-terraclassic/` — Contract structure and testing
  - `frontend-dapp/` — React wallet integration, contract interaction, UI components

See [Architecture → External Dependencies](./docs/ARCHITECTURE.md#external-dependencies--reference-code) for details.

## Documentation

| Document | Description |
|----------|-------------|
| [PROPOSAL.md](./PROPOSAL.md) | Full project proposal and technical specifications |
| [Architecture](./docs/ARCHITECTURE.md) | System architecture and design details |
| [Contracts](./docs/CONTRACTS.md) | Smart contract interface documentation |
| [Deployment](./docs/DEPLOYMENT.md) | Deployment procedures and configuration |
| [Economics](./docs/ECONOMICS.md) | Economic theory behind design |\

## License

GPL-3.0 (consistent with cw20-mintable dependency)

## Contributing

Contributions welcome. Please review the proposal document and open issues for discussion before submitting PRs.

