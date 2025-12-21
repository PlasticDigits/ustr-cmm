/**
 * Constants for USTR CMM Frontend
 */

// Network configuration
export const NETWORKS = {
  testnet: {
    chainId: 'rebel-2',
    name: 'TerraClassic Testnet',
    rpc: 'https://terra-classic-testnet-rpc.publicnode.com:443',
    lcd: 'https://terra-classic-testnet-lcd.publicnode.com',
    cw20CodeId: 1641,
  },
  mainnet: {
    chainId: 'columbus-5',
    name: 'TerraClassic Mainnet',
    rpc: 'https://terra-classic-rpc.publicnode.com:443',
    lcd: 'https://terra-classic-lcd.publicnode.com',
    cw20CodeId: 10184,
  },
} as const;

// Default to testnet during development
export const DEFAULT_NETWORK = 'testnet' as keyof typeof NETWORKS;

// Contract addresses (to be updated after deployment)
export const CONTRACTS = {
  testnet: {
    ustrToken: '',
    treasury: '',
    ustcSwap: '',
    airdrop: '',
  },
  mainnet: {
    ustrToken: '',
    treasury: '',
    ustcSwap: '',
    airdrop: '',
  },
} as const;

// Token decimals
export const DECIMALS = {
  USTC: 6,
  USTR: 6,
  UST1: 6,
} as const;

// Swap parameters
export const SWAP_CONFIG = {
  startRate: 1.5,
  endRate: 2.5,
  durationDays: 100,
  durationSeconds: 8640000,
} as const;

// UI constants
export const POLLING_INTERVAL = 10000; // 10 seconds
export const TOAST_DURATION = 5000; // 5 seconds

