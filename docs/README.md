# USTR CMM Documentation

Welcome to the USTR CMM documentation. This directory contains comprehensive documentation for the Collateralized Unstablecoin System built on TerraClassic.

## Documentation Overview

### [ARCHITECTURE.md](./ARCHITECTURE.md)

**System architecture and design patterns**

This document provides a high-level overview of the USTR CMM system architecture, including:
- Contract relationships and interactions
- Data flow diagrams
- State management patterns
- Security model and access control
- Upgrade path and governance evolution
- Frontend dashboard architecture

**Best for**: Developers understanding system design, architects reviewing the overall structure, and anyone wanting to understand how contracts interact.

---

### [CONTRACTS.md](./CONTRACTS.md)

**Smart contract interfaces and source code links**

This document serves as a navigation guide to all smart contracts in the codebase:
- Links to source code files for each contract
- Brief descriptions of contract functionality
- Key development decisions and design choices
- Execute and Query message overviews
- Testing and deployment information

**Best for**: Developers working with the contracts, auditors reviewing code, and anyone needing to navigate the codebase.

---

### [DEPLOYMENT.md](./DEPLOYMENT.md)

**Deployment procedures and network configuration**

This guide covers everything needed to deploy USTR CMM contracts:
- Prerequisites and development environment setup
- Network configuration (testnet and mainnet)
- Build procedures (Docker and local)
- Deployment order and verification steps
- Post-deployment configuration
- Troubleshooting common issues

**Best for**: DevOps engineers, deployers, and anyone responsible for deploying contracts to TerraClassic.

---

### [ECONOMICS.md](./ECONOMICS.md)

**Economic theory and design rationale**

A comprehensive guide to the economics of the CMM system:
- Why algorithmic stablecoins fail and how unstablecoins solve these problems
- Core economic concepts (functions of money, credit chains, monetary trilemma)
- USTR token distribution economics and Schelling point mechanisms
- UST1 unstablecoin collateralization ratio tiers and their rationale
- Auction mechanism design and bidding incentives
- 5-year rolling distribution pools and counter-cyclical monetary policy
- Risk analysis and comparisons with other stablecoin systems
- Academic references and bibliography

**Best for**: Investors, economists, community members, and anyone seeking deep understanding of the economic design decisions.

---

### [WALLETS.md](./WALLETS.md)

**Connecting Terra Classic wallets (Keplr, Trust Wallet, Station)**

Trust Wallet and other mobile Cosmos browsers share the Keplr inject path (`window.keplr` or `window.trustwallet.cosmos`). There is no separate Trust controller.

**Best for**: Users connecting from Trust Wallet’s in-app browser, and frontend agents changing the connect modal ([#4](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/4) / [skills/frontend-keplr-compatible-wallets](../skills/frontend-keplr-compatible-wallets/SKILL.md)).

---

## Quick Start Guide

**New to USTR CMM?** Start here:

1. **Understanding the System**: Read [ARCHITECTURE.md](./ARCHITECTURE.md) to understand how the system works
2. **Exploring Contracts**: Check [CONTRACTS.md](./CONTRACTS.md) to see what contracts exist and where the code is
3. **Economic Understanding**: Review [ECONOMICS.md](./ECONOMICS.md) to understand the economic model
4. **Deployment**: Follow [DEPLOYMENT.md](./DEPLOYMENT.md) when ready to deploy

**For Developers**:
- Start with [ARCHITECTURE.md](./ARCHITECTURE.md) for system overview
- Use [CONTRACTS.md](./CONTRACTS.md) to navigate to specific contract code
- Reference [DEPLOYMENT.md](./DEPLOYMENT.md) for build and deployment procedures

**For Investors/Economists**:
- Focus on [ECONOMICS.md](./ECONOMICS.md) for economic theory and rationale
- Review [ARCHITECTURE.md](./ARCHITECTURE.md) for system mechanics
- Check [CONTRACTS.md](./CONTRACTS.md) for implementation details

**For Deployers**:
- Follow [DEPLOYMENT.md](./DEPLOYMENT.md) step-by-step
- Reference [CONTRACTS.md](./CONTRACTS.md) for contract addresses and verification
- Review [ARCHITECTURE.md](./ARCHITECTURE.md) for deployment order understanding

---

## Additional Resources

### Main Proposal Document

For the complete project proposal including specifications, development phases, and roadmap, see [PROPOSAL.md](../PROPOSAL.md) in the repository root.

### External References

- **TerraClassic Documentation**: [docs.terra-classic.io](https://docs.terra-classic.io)
- **CW20 Mintable**: [PlasticDigits/cw20-mintable](https://github.com/PlasticDigits/cw20-mintable)
- **Pre-registration System**: [cmm-ustc-preregister](https://github.com/PlasticDigits/cmm-ustc-preregister)

---

## Document Maintenance

These documents are maintained alongside the codebase. If you find discrepancies or have suggestions for improvement, please open an issue or submit a pull request.

**Last Updated**: August 2026

Agent playbooks (invariants + pins): [skills/README.md](../skills/README.md) — including Keplr-compatible / Trust Wallet connect ([#4](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/4)), frontend vFDUSD oracle ([#10](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/10)), UST1 CR ([#11](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/11)), Legal clickwrap ([#12](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/12)), and protocol LP NAV ([#14](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/14)).

