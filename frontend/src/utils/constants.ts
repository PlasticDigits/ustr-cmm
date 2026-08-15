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
    scanner: 'https://finder.terraclassic.community/rebel-2',
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
    scanner: 'https://finder.terraclassic.community/columbus-5',
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
    vfdusd: '',
    ust1Oracle: '',
    ust1Token: '',
    cLunc: '',
    cUstc: '',
    ust1Window: '',
  },
  mainnet: {
    ustrToken: 'terra1vy3kc0swag2rhn7jz6n72jp0l2ns0p6r6ez5grxq5uhj2rvs97fqfsetxv',
    treasury: 'terra16j5u6ey7a84g40sr3gd94nzg5w5fm45046k9s2347qhfpwm5fr6sem3lr2',
    ustcSwap: 'terra16ytnkhw53elefz2rhulcr4vq8fs83nd97ht3wt05wtcq7ypcmpqqv37lel',
    referral: 'terra1lxv5m2n72l4zujf0rrgek9k6m8kfky62yvm8qvlnjqgjmmlmywzqt4j0z2',
    // Pins: issues #10 / #11 — do not invent replacements
    vfdusd: 'terra1mnl9azefrqpmu888ar2u6zrcwr80hxlt3avf4300r576cw5ar7esvxsvj3',
    ust1Oracle: 'terra1fmht0t6svq3n24zx03nkfja0m40zhfyyxkdcvlrkl6u7gfe6aagq4gch8n',
    ust1Token: 'terra1f0eqgy9w7e5e7up97vjudqwx38tesf8ylx75x2lv3nwm0clry0pqmgfy72',
    cLunc: 'terra1437qslye72t7qmmahn4t5chz50r8a62g45phwkquwpyu2l62u6ksqssgdg',
    cUstc: 'terra1nap4dxh9tv35v0ynd9m4k6zt6c0dq6weszc4j5m564kjls56hu7qcr56ch',
    ust1Window: 'terra1zxwpzpzpleatqn39r00grau4yt29sld8pw78s7ktvjafnj5nsaxq0h3rh2',
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

// CW20 enumerable pagination (for holder/account enumeration)
export const CW20_ENUM = {
  MAX_LIMIT: 30,
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

// Price API: prefer Binance spot for LUNC/USTC; CryptoCompare fills gaps (Binance can fail in-browser via CORS/451).
export const PRICE_API = {
  cryptocompare:
    'https://min-api.cryptocompare.com/data/pricemulti?fsyms=LUNC,USTC&tsyms=USD',
  binance: 'https://api.binance.com/api/v3/ticker/price',
  symbols: ['LUNCUSDT', 'USTCUSDT'],
} as const;

// Price cache configuration
export const PRICE_CACHE = {
  // Cache durations in milliseconds
  basePrices: 60000,    // 60 seconds for CEX prices
  dexRates: 120000,     // 120 seconds for DEX rates
  staleTime: 30000,     // 30 seconds before considered stale
  /** sessionStorage key for vFDUSD oracle USD (schema version in value, not key suffix) */
  vfdusdSessionKey: 'ustr-cmm:vfdusd-oracle:v1',
} as const;

/**
 * ust1-oracle Venus-normalized rate: on-chain field is `rate` (issue text calls it R).
 * usd = (rate / 1e18) * FDUSD_USD. FDUSD is treated as $1.00 — no second CEX poll.
 * Sanity band rejects LCD MITM / garbage R. Outside the band → no USD (never assume $1/vFDUSD).
 */
export const VFDUSD_ORACLE = {
  rateScale: 1e18,
  minFdusdPerVfdusd: 0.5,
  maxFdusdPerVfdusd: 10,
  fdusdUsd: 1,
  sessionSchemaVersion: 1,
} as const;

/** Symbols/addresses that are liabilities or wrap receipts — never treasury CR holdings. */
export const TREASURY_HOLDING_SKIP_SYMBOLS = ['USTR', 'UST1', 'CLUNC', 'CUSTC'] as const;

/** ECONOMICS.md CR color tiers (percent). */
export const CR_TIERS = {
  redBelow: 95,
  yellowBelow: 110,
  greenAtMost: 190,
} as const;

/**
 * CL8Y Legal clickwrap (#12). Production property is the site hostname.
 * Override only via VITE_LEGAL_PROPERTY for staging. Never default to cl8y.com / dex.cl8y.com.
 */
export const LEGAL_CLICKWRAP = {
  defaultProperty: 'ust1cmm.com',
  redirectAllowlist: ['https://ust1cmm.com'] as readonly string[],
  termsPortal: 'https://terms.cl8y.com',
  termsApi: 'https://api.terms.cl8y.com',
  appName: 'USTR CMM',
  network: 'TerraClassic' as const,
} as const;