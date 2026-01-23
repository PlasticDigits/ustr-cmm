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
    scanner: 'https://finder.terraclassic.community/testnet',
  },
  mainnet: {
    chainId: 'columbus-5',
    name: 'TerraClassic Mainnet',
    rpc: 'https://terra-classic-rpc.publicnode.com:443',
    lcd: 'https://terra-classic-lcd.publicnode.com',
    cw20CodeId: 10184,
    scanner: 'https://finder.terraclassic.community/mainnet',
  },
} as const;

// Default to mainnet for production (referral contract deployed on mainnet)
export const DEFAULT_NETWORK = 'mainnet' as keyof typeof NETWORKS;

// Contract addresses (to be updated after deployment)
export const CONTRACTS = {
  testnet: {
    ustrToken: '',
    treasury: '',
    ustcSwap: '',
    referral: '',
  },
  mainnet: {
    ustrToken: 'terra1vy3kc0swag2rhn7jz6n72jp0l2ns0p6r6ez5grxq5uhj2rvs97fqfsetxv',
    treasury: 'terra16j5u6ey7a84g40sr3gd94nzg5w5fm45046k9s2347qhfpwm5fr6sem3lr2',
    ustcSwap: 'terra16ytnkhw53elefz2rhulcr4vq8fs83nd97ht3wt05wtcq7ypcmpqqv37lel',
    referral: 'terra1lxv5m2n72l4zujf0rrgek9k6m8kfky62yvm8qvlnjqgjmmlmywzqt4j0z2',
  },
} as const;

// Referral code validation rules
export const REFERRAL_CODE = {
  minLength: 1,
  maxLength: 20,
  // Only lowercase letters, numbers, underscore, and hyphen allowed
  validPattern: /^[a-z0-9_-]+$/,
  registrationFee: '10000000000000000000', // 10 USTR (18 decimals)
  registrationFeeDisplay: '10', // Human readable
  maxCodesPerOwner: 10,
} as const;

// Token decimals
export const DECIMALS = {
  USTC: 6,
  LUNC: 6,
  USTR: 18, // USTR CW20 token has 18 decimals
  UST1: 6,
} as const;

// CW20 enumerable pagination (for holder/account enumeration)
export const CW20_ENUM = {
  MAX_LIMIT: 30,
  DEFAULT_LIMIT: 10,
  PAGINATION_DELAY: 150,
} as const;

// Swap parameters
export const SWAP_CONFIG = {
  startRate: 1.5,
  endRate: 2.5,
  durationDays: 100,
  durationSeconds: 8640000,
  // Max swap amount per transaction (effectively unlimited)
  maxUstcPerSwap: 1000000000,
} as const;

// UI constants
export const POLLING_INTERVAL = 10000; // 10 seconds
export const TOAST_DURATION = 5000; // 5 seconds

