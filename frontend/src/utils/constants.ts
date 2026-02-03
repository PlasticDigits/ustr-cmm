/**
 * Constants for USTR CMM Frontend
 */

// Network configuration
// Endpoints from official docs: https://docs.terra-classic.io
export const NETWORKS = {
  testnet: {
    chainId: 'rebel-2',
    name: 'TerraClassic Testnet',
    rpc: 'https://rpc.luncblaze.com',
    lcd: 'https://lcd.luncblaze.com',
    // Fallback LCD endpoints (tried in order)
    lcdFallbacks: [
      'https://lcd.luncblaze.com',
      'https://lcd.terra-classic.hexxagon.dev',
    ],
    cw20CodeId: 1641,
    scanner: 'https://finder.terraclassic.community/testnet',
  },
  mainnet: {
    chainId: 'columbus-5',
    name: 'TerraClassic Mainnet',
    rpc: 'https://terra-classic-rpc.publicnode.com',
    lcd: 'https://terra-classic-lcd.publicnode.com',
    // Fallback LCD endpoints (tried in order)
    lcdFallbacks: [
      'https://terra-classic-lcd.publicnode.com',
      'https://api-lunc-lcd.binodes.com',
      'https://lcd.terra-classic.hexxagon.io',
    ],
    cw20CodeId: 10184,
    scanner: 'https://finder.terraclassic.community/mainnet',
  },
} as const;

// LCD request configuration
export const LCD_CONFIG = {
  // Rate limiting: minimum ms between requests to the same endpoint
  minRequestInterval: 500,
  // Cache TTL for successful responses (ms)
  cacheTtl: 10000,
  // How long to keep stale cache if all endpoints fail (ms)
  staleCacheTtl: 60000,
  // Request timeout (ms)
  requestTimeout: 8000,
  // How long to mark an endpoint as unhealthy after failure (ms)
  endpointCooldown: 30000,
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

// Token list URL - contains token metadata (decimals, addresses, etc.)
export const TOKEN_LIST_URL = '/assets/tokenlist.json';

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

// DEX router configurations
export const DEX_ROUTERS = {
  // Priority order for price fallback: custom -> garuda -> terraswap
  custom: null, // Placeholder for future USTR DEX
  garuda: {
    factory: 'terra1ypwj6sw25g0qcykv7mzmcvsndvx56r3yrgkaw3fds7yzwl7fwwcsnxkeh7',
    router: 'terra1frvfffkpdluzdj8lel4nyyjl2u0p6zuenhfeveulrlg6r2w4tdqqx2zr68',
  },
  terraswap: {
    factory: null,
    router: 'terra1g3zc8lwwmkrm0cz9wkgl849pdqaw6cq8lh7872',
  },
} as const;

// Price API configuration
export const PRICE_API = {
  binance: 'https://api.binance.com/api/v3/ticker/price',
  // Symbols to fetch from Binance
  symbols: ['LUNCUSDT', 'USTCUSDT'],
} as const;

// Price cache configuration
export const PRICE_CACHE = {
  // Cache durations in milliseconds
  basePrices: 60000,    // 60 seconds for CEX prices
  dexRates: 120000,     // 120 seconds for DEX rates
  staleTime: 30000,     // 30 seconds before considered stale
} as const;