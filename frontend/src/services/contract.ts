/**
 * Contract Service
 * 
 * Handles all smart contract interactions for the USTR CMM frontend.
 * Provides type-safe methods for querying and executing contract messages.
 * 
 * In dev mode (VITE_DEV_MODE=true), certain methods return mock data
 * to simulate post-launch state for UX testing.
 */

import { NETWORKS, CONTRACTS, DEFAULT_NETWORK, REFERRAL_CODE, DECIMALS } from '../utils/constants';
import { executeCw20Send, executeContractWithCoins } from './wallet';
import type {
  SwapConfig,
  SwapRate,
  SwapSimulation,
  SwapStatus,
  SwapStats,
  TreasuryConfig,
  TreasuryAllBalances,
  Cw20Balance,
  Cw20TokenInfo,
  ReferralConfig,
  CodeInfo,
  CodesResponse,
  ValidateResponse,
  LeaderboardHint,
  ReferralLeaderboardResponse,
  ReferralCodeStats,
} from '../types/contracts';

/** Dev mode flag - enables mock responses for UX testing */
const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true';

type NetworkKey = keyof typeof NETWORKS;

class ContractService {
  private network: NetworkKey = DEFAULT_NETWORK;

  constructor() {
    console.log('ContractService initialized for:', NETWORKS[this.network].name);
  }

  setNetwork(network: NetworkKey) {
    this.network = network;
    console.log('ContractService switched to:', NETWORKS[this.network].name);
  }

  private getContracts() {
    return CONTRACTS[this.network];
  }

  private getLcdUrl() {
    return NETWORKS[this.network].lcd;
  }

  /**
   * Fetch data from LCD endpoint
   */
  private async fetchLcd<T>(path: string): Promise<T> {
    const url = `${this.getLcdUrl()}${path}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`LCD request failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Query a smart contract
   */
  private async queryContract<T>(contractAddress: string, query: object): Promise<T> {
    const queryBase64 = btoa(JSON.stringify(query));
    return this.fetchLcd<T>(`/cosmwasm/wasm/v1/contract/${contractAddress}/smart/${queryBase64}`);
  }

  // ============================================
  // Swap Contract Queries
  // ============================================

  async getSwapConfig(): Promise<SwapConfig> {
    const contracts = this.getContracts();
    
    if (!contracts.ustcSwap) {
      console.warn('Swap contract address not configured');
      return {
        ustr_token: contracts.ustrToken || '',
        treasury: contracts.treasury || '',
        start_time: '0',
        end_time: '0',
        start_rate: '1.5',
        end_rate: '2.5',
        admin: '',
        ustc_denom: 'uusd',
        paused: false,
      };
    }
    
    try {
      // Contract returns ConfigResponse with these fields
      interface ContractConfigResponse {
        ustr_token: string;
        treasury: string;
        referral: string;
        start_time: string; // Timestamp as nanoseconds string
        end_time: string;   // Timestamp as nanoseconds string
        start_rate: string; // Decimal as string
        end_rate: string;   // Decimal as string
        admin: string;
        paused: boolean;
      }
      
      const result = await this.queryContract<{ data: ContractConfigResponse }>(
        contracts.ustcSwap,
        { config: {} }
      );
      
      const data = result.data;
      
      // Convert nanosecond timestamps to seconds for frontend
      // CosmWasm Timestamp is stored as nanoseconds
      const startTimeNanos = BigInt(data.start_time);
      const endTimeNanos = BigInt(data.end_time);
      const startTimeSecs = (startTimeNanos / BigInt(1_000_000_000)).toString();
      const endTimeSecs = (endTimeNanos / BigInt(1_000_000_000)).toString();
      
      return {
        ustr_token: data.ustr_token,
        treasury: data.treasury,
        start_time: startTimeSecs,
        end_time: endTimeSecs,
        start_rate: data.start_rate,
        end_rate: data.end_rate,
        admin: data.admin,
        ustc_denom: 'uusd', // Native USTC denom on Terra Classic
        paused: data.paused,
      };
    } catch (error) {
      console.error('Failed to get swap config:', error);
      return {
        ustr_token: contracts.ustrToken || '',
        treasury: contracts.treasury || '',
        start_time: '0',
        end_time: '0',
        start_rate: '1.5',
        end_rate: '2.5',
        admin: '',
        ustc_denom: 'uusd',
        paused: false,
      };
    }
  }

  async getCurrentRate(): Promise<SwapRate> {
    const contracts = this.getContracts();
    
    if (!contracts.ustcSwap) {
      console.warn('Swap contract address not configured');
      return {
        rate: '1.5',
        timestamp: Date.now().toString(),
      };
    }
    
    try {
      // Contract returns RateResponse with these fields
      interface ContractRateResponse {
        rate: string;         // Decimal as string
        elapsed_seconds: number;
        total_seconds: number;
      }
      
      const result = await this.queryContract<{ data: ContractRateResponse }>(
        contracts.ustcSwap,
        { current_rate: {} }
      );
      
      const data = result.data;
      
      return {
        rate: data.rate,
        timestamp: Date.now().toString(),
      };
    } catch (error) {
      console.error('Failed to get current rate:', error);
      return {
        rate: '1.5',
        timestamp: Date.now().toString(),
      };
    }
  }

  async simulateSwap(ustcAmount: string, referralCode?: string): Promise<SwapSimulation> {
    const contracts = this.getContracts();
    
    if (!contracts.ustcSwap) {
      console.warn('Swap contract address not configured, using client-side simulation');
      return this.simulateSwapClientSide(ustcAmount, referralCode);
    }
    
    try {
      // Contract returns SimulationResponse with these fields
      interface ContractSimulationResponse {
        ustc_amount: string;
        base_ustr_amount: string;
        user_bonus: string;
        referrer_bonus: string;
        total_ustr_to_user: string;
        rate: string;
        referral_valid: boolean;
      }
      
      // Build query with optional referral code
      const query: { swap_simulation: { ustc_amount: string; referral_code?: string } } = {
        swap_simulation: { ustc_amount: ustcAmount }
      };
      if (referralCode) {
        query.swap_simulation.referral_code = referralCode;
      }
      
      const result = await this.queryContract<{ data: ContractSimulationResponse }>(
        contracts.ustcSwap,
        query
      );
      
      const data = result.data;
      
      return {
        ustc_amount: data.ustc_amount,
        ustr_amount: data.total_ustr_to_user,
        rate: data.rate,
        referral_code: referralCode,
        bonus_amount: data.referral_valid ? data.user_bonus : undefined,
      };
    } catch (error) {
      console.error('Failed to simulate swap from contract, using client-side:', error);
      return this.simulateSwapClientSide(ustcAmount, referralCode);
    }
  }

  /**
   * Client-side swap simulation fallback when contract query fails
   */
  private simulateSwapClientSide(ustcAmount: string, referralCode?: string): SwapSimulation {
    const rate = 1.5;
    const ustc = parseFloat(ustcAmount);
    const baseUstr = ustc / rate;
    
    // Apply 10% bonus if referral code is provided
    const bonus = referralCode ? baseUstr * 0.1 : 0;
    const totalUstr = baseUstr + bonus;
    
    // Convert from USTC decimals (6) to USTR decimals (18)
    // Multiply by 10^12 to adjust for the decimal difference
    const decimalAdjustment = Math.pow(10, DECIMALS.USTR - DECIMALS.USTC);
    const ustrAmount = Math.floor(totalUstr * decimalAdjustment);
    const bonusAmount = Math.floor(bonus * decimalAdjustment);
    
    return {
      ustc_amount: ustcAmount,
      ustr_amount: ustrAmount.toString(),
      rate: rate.toString(),
      referral_code: referralCode,
      bonus_amount: referralCode ? bonusAmount.toString() : undefined,
    };
  }

  async getSwapStatus(): Promise<SwapStatus> {
    // In dev mode, return active status for UX testing
    if (DEV_MODE) {
      return {
        started: true,
        ended: false,
        paused: false,
        seconds_until_start: 0,
        seconds_until_end: 8640000, // 100 days
        elapsed_seconds: 0,
      };
    }

    const contracts = this.getContracts();
    
    if (!contracts.ustcSwap) {
      console.warn('Swap contract address not configured');
      return {
        started: false,
        ended: false,
        paused: false,
        seconds_until_start: 0,
        seconds_until_end: 0,
        elapsed_seconds: 0,
      };
    }
    
    try {
      // Contract returns StatusResponse with different field names
      interface ContractStatusResponse {
        is_active: boolean;
        has_started: boolean;
        has_ended: boolean;
        is_paused: boolean;
        seconds_remaining: number;
        seconds_until_start: number;
      }
      
      const result = await this.queryContract<{ data: ContractStatusResponse }>(
        contracts.ustcSwap,
        { status: {} }
      );
      
      const data = result.data;
      
      // Map contract response to frontend SwapStatus type
      // elapsed_seconds can be derived from config if needed, or estimated
      return {
        started: data.has_started,
        ended: data.has_ended,
        paused: data.is_paused,
        seconds_until_start: data.seconds_until_start,
        seconds_until_end: data.seconds_remaining,
        elapsed_seconds: 0, // Not directly available from status query
      };
    } catch (error) {
      console.error('Failed to get swap status:', error);
      return {
        started: false,
        ended: false,
        paused: false,
        seconds_until_start: 0,
        seconds_until_end: 0,
        elapsed_seconds: 0,
      };
    }
  }

  async getSwapStats(): Promise<SwapStats> {
    const contracts = this.getContracts();
    
    if (!contracts.ustcSwap) {
      console.warn('Swap contract address not configured');
      return {
        total_ustc_received: '0',
        total_ustr_minted: '0',
        swap_count: 0,
      };
    }
    
    try {
      // Contract returns StatsResponse
      interface ContractStatsResponse {
        total_ustc_received: string;
        total_ustr_minted: string;
        total_referral_bonus_minted: string;
        total_referral_swaps: number;
        unique_referral_codes_used: number;
      }
      
      const result = await this.queryContract<{ data: ContractStatsResponse }>(
        contracts.ustcSwap,
        { stats: {} }
      );
      
      const data = result.data;
      
      // Map contract response to frontend SwapStats type
      // Note: contract doesn't track total swap count, only referral swaps
      return {
        total_ustc_received: data.total_ustc_received,
        total_ustr_minted: data.total_ustr_minted,
        swap_count: data.total_referral_swaps, // Using referral swaps as approximation
      };
    } catch (error) {
      console.error('Failed to get swap stats:', error);
      return {
        total_ustc_received: '0',
        total_ustr_minted: '0',
        swap_count: 0,
      };
    }
  }

  /**
   * Query referral leaderboard for hint computation
   */
  async getReferralLeaderboard(startAfter?: string, limit: number = 50): Promise<ReferralLeaderboardResponse> {
    const contracts = this.getContracts();
    
    if (!contracts.ustcSwap) {
      console.warn('Swap contract address not configured');
      return { entries: [], has_more: false };
    }
    
    try {
      interface ContractLeaderboardEntry {
        code: string;
        owner: string;
        total_rewards_earned: string;
        total_user_bonuses: string;
        total_swaps: number;
        rank: number;
      }
      
      interface ContractLeaderboardResponse {
        entries: ContractLeaderboardEntry[];
        has_more: boolean;
      }
      
      const query: { referral_leaderboard: { start_after?: string; limit?: number } } = {
        referral_leaderboard: { limit }
      };
      if (startAfter) {
        query.referral_leaderboard.start_after = startAfter;
      }
      
      const result = await this.queryContract<{ data: ContractLeaderboardResponse }>(
        contracts.ustcSwap,
        query
      );
      
      return {
        entries: result.data.entries.map(e => ({
          code: e.code,
          owner: e.owner,
          total_rewards_earned: e.total_rewards_earned,
          total_user_bonuses: e.total_user_bonuses,
          total_swaps: e.total_swaps,
          rank: e.rank,
        })),
        has_more: result.data.has_more,
      };
    } catch (error) {
      console.error('Failed to get referral leaderboard:', error);
      return { entries: [], has_more: false };
    }
  }

  /**
   * Get referral code stats from the ustc-swap contract.
   * Returns rewards and swap count for a specific code.
   * Works for all codes, not just those in the top 50 leaderboard.
   */
  async getReferralCodeStats(code: string): Promise<ReferralCodeStats | null> {
    const contracts = this.getContracts();
    
    if (!contracts.ustcSwap) {
      console.warn('Swap contract address not configured');
      return null;
    }
    
    try {
      interface ContractStatsResponse {
        code: string;
        owner: string;
        total_rewards_earned: string;
        total_user_bonuses: string;
        total_swaps: number;
      }
      
      const result = await this.queryContract<{ data: ContractStatsResponse }>(
        contracts.ustcSwap,
        { referral_code_stats: { code: code.toLowerCase() } }
      );
      
      return {
        code: result.data.code,
        owner: result.data.owner,
        total_rewards_earned: result.data.total_rewards_earned,
        total_user_bonuses: result.data.total_user_bonuses,
        total_swaps: result.data.total_swaps,
      };
    } catch (error) {
      // Code may not exist in stats (never used in a swap)
      console.log(`No stats found for code "${code}":`, error);
      return null;
    }
  }

  /**
   * Compute leaderboard hint for O(1) insertion
   * 
   * Given a referral code and its new total rewards after a swap,
   * this finds the correct position and returns the hint.
   * 
   * @param code - The referral code being used
   * @param newTotalRewards - The code's total rewards AFTER the swap completes
   * @returns LeaderboardHint for O(1) insertion, or undefined if not computable
   */
  async computeLeaderboardHint(code: string, additionalRewards: string): Promise<LeaderboardHint | undefined> {
    try {
      // Fetch the full leaderboard in batches (LCD gas limit prevents fetching 50 at once)
      const BATCH_SIZE = 25;
      const MAX_ENTRIES = 50;
      const allEntries: Array<{
        code: string;
        owner: string;
        total_rewards_earned: string;
        total_user_bonuses: string;
        total_swaps: number;
        rank: number;
      }> = [];
      
      let startAfter: string | undefined = undefined;
      let hasMore = true;
      
      while (hasMore && allEntries.length < MAX_ENTRIES) {
        const batch = await this.getReferralLeaderboard(startAfter, BATCH_SIZE);
        
        if (batch.entries.length === 0) {
          break;
        }
        
        allEntries.push(...batch.entries);
        hasMore = batch.has_more;
        
        if (batch.entries.length > 0) {
          startAfter = batch.entries[batch.entries.length - 1].code;
        }
      }
      
      if (allEntries.length === 0) {
        // Empty leaderboard - we'll be the new head
        return { insert_after: undefined };
      }
      
      // Find if this code is already in the leaderboard
      const existingEntry = allEntries.find(e => e.code.toLowerCase() === code.toLowerCase());
      
      // Calculate new total rewards
      const currentRewards = existingEntry ? BigInt(existingEntry.total_rewards_earned) : BigInt(0);
      const newTotalRewards = currentRewards + BigInt(additionalRewards);
      
      // Find where we should be inserted (position after the first code with >= our rewards)
      // Leaderboard is sorted descending by rewards
      let insertAfter: string | undefined = undefined;
      
      for (const entry of allEntries) {
        // Skip ourselves if we're already in the leaderboard
        if (entry.code.toLowerCase() === code.toLowerCase()) {
          continue;
        }
        
        const entryRewards = BigInt(entry.total_rewards_earned);
        
        if (entryRewards >= newTotalRewards) {
          // This entry has more or equal rewards, we should be after them
          insertAfter = entry.code;
        } else {
          // We found our position - we have more rewards than this entry
          break;
        }
      }
      
      return { insert_after: insertAfter };
    } catch (error) {
      console.error('Failed to compute leaderboard hint:', error);
      // Return undefined to fall back to O(n) search on-chain
      return undefined;
    }
  }

  // ============================================
  // Treasury Contract Queries
  // ============================================

  async getTreasuryConfig(): Promise<TreasuryConfig> {
    const contracts = this.getContracts();
    
    if (!contracts.treasury) {
      console.warn('Treasury contract address not configured');
      return {
        governance: '',
        timelock_duration: 604800, // 7 days default
      };
    }
    
    try {
      // Contract returns ConfigResponse with these fields
      interface ContractConfigResponse {
        governance: string;
        timelock_duration: number;
        swap_contract: string | null;
      }
      
      const result = await this.queryContract<{ data: ContractConfigResponse }>(
        contracts.treasury,
        { config: {} }
      );
      
      const data = result.data;
      
      return {
        governance: data.governance,
        timelock_duration: data.timelock_duration,
      };
    } catch (error) {
      console.error('Failed to get treasury config:', error);
      return {
        governance: '',
        timelock_duration: 604800,
      };
    }
  }

  async getTreasuryBalances(): Promise<TreasuryAllBalances> {
    const contracts = this.getContracts();
    
    if (!contracts.treasury) {
      console.warn('Treasury contract address not configured');
      return {
        native: [],
        cw20: [],
      };
    }
    
    try {
      // Contract returns AllBalancesResponse with AssetBalance entries
      interface AssetBalance {
        asset: { native: { denom: string } } | { cw20: { contract_addr: string } };
        amount: string;
      }
      
      interface ContractAllBalancesResponse {
        balances: AssetBalance[];
      }
      
      const result = await this.queryContract<{ data: ContractAllBalancesResponse }>(
        contracts.treasury,
        { all_balances: {} }
      );
      
      const data = result.data;
      
      // Separate native and CW20 balances
      const native: Array<{ denom: string; amount: string }> = [];
      const cw20: Array<{ contract_addr: string; amount: string }> = [];
      
      for (const balance of data.balances) {
        if ('native' in balance.asset) {
          native.push({
            denom: balance.asset.native.denom,
            amount: balance.amount,
          });
        } else if ('cw20' in balance.asset) {
          cw20.push({
            contract_addr: balance.asset.cw20.contract_addr,
            amount: balance.amount,
          });
        }
      }
      
      return { native, cw20 };
    } catch (error) {
      console.error('Failed to get treasury balances:', error);
      return {
        native: [],
        cw20: [],
      };
    }
  }

  // ============================================
  // Token Queries
  // ============================================

  async getTokenInfo(tokenAddress: string): Promise<Cw20TokenInfo> {
    if (!tokenAddress) {
      return { name: 'USTR', symbol: 'USTR', decimals: DECIMALS.USTR, total_supply: '0' };
    }
    
    try {
      const result = await this.queryContract<{ data: Cw20TokenInfo }>(
        tokenAddress,
        { token_info: {} }
      );
      return result.data;
    } catch (error) {
      console.error('Failed to get token info:', error);
      return { name: 'USTR', symbol: 'USTR', decimals: DECIMALS.USTR, total_supply: '0' };
    }
  }

  async getTokenBalance(tokenAddress: string, walletAddress: string): Promise<Cw20Balance> {
    if (!tokenAddress) {
      console.warn('Token address not configured, returning 0 balance');
      return { balance: '0' };
    }
    
    try {
      const result = await this.queryContract<{ data: Cw20Balance }>(
        tokenAddress,
        { balance: { address: walletAddress } }
      );
      return result.data;
    } catch (error) {
      console.error('Failed to get token balance:', error);
      return { balance: '0' };
    }
  }

  async getNativeBalance(walletAddress: string, denom: string): Promise<string> {
    try {
      interface BankBalanceResponse {
        balance: {
          denom: string;
          amount: string;
        };
      }
      
      const result = await this.fetchLcd<BankBalanceResponse>(
        `/cosmos/bank/v1beta1/balances/${walletAddress}/by_denom?denom=${denom}`
      );
      
      return result.balance?.amount || '0';
    } catch (error) {
      console.error('Failed to get native balance:', error);
      return '0';
    }
  }

  /**
   * Get all native balances for a wallet
   */
  async getAllNativeBalances(walletAddress: string): Promise<Array<{ denom: string; amount: string }>> {
    try {
      interface BankBalancesResponse {
        balances: Array<{ denom: string; amount: string }>;
      }
      
      const result = await this.fetchLcd<BankBalancesResponse>(
        `/cosmos/bank/v1beta1/balances/${walletAddress}`
      );
      
      return result.balances || [];
    } catch (error) {
      console.error('Failed to get all native balances:', error);
      return [];
    }
  }

  // ============================================
  // Execute Messages
  // ============================================

  async executeSwap(
    senderAddress: string,
    ustcAmount: string,
    referralCode?: string,
    leaderboardHint?: LeaderboardHint
  ): Promise<string> {
    const contracts = this.getContracts();
    
    if (!contracts.ustcSwap) {
      throw new Error('Swap contract address not configured');
    }

    // Build the swap message matching the contract's ExecuteMsg::Swap
    // Use Record<string, unknown> to match the working preregister pattern
    // IMPORTANT: Don't include null values - omit the fields entirely for Option<T> = None
    // The cosmes library's removeNull() strips nulls AFTER signing which causes signature mismatches
    const swapInner: Record<string, unknown> = {};
    
    // Only include referral_code if provided (Option<String> in Rust)
    if (referralCode) {
      swapInner.referral_code = referralCode;
    }
    
    // Include leaderboard_hint for O(1) insertion ONLY if we have a valid insert_after value
    // If insert_after is undefined (meaning "insert at head"), we OMIT the entire hint
    // and let the contract fall back to O(n) search. This avoids the cosmes removeNull()
    // issue where null values get stripped after signing, causing signature mismatches.
    if (leaderboardHint && leaderboardHint.insert_after !== undefined) {
      swapInner.leaderboard_hint = {
        insert_after: leaderboardHint.insert_after,
      };
    }
    // NOTE: When insert_after is undefined (new head position), we intentionally omit
    // leaderboard_hint entirely. The contract will use O(n) fallback which is fine
    // since the leaderboard is small. This is safer than risking signature mismatches.
    
    const swapMsg: Record<string, unknown> = {
      swap: swapInner,
    };

    // USTC is the native uusd denom on Terra Classic
    const ustcDenom = 'uusd';
    
    // Coins to send with the transaction (matching preregister pattern)
    const coins = [
      {
        denom: ustcDenom,
        amount: ustcAmount,
      },
    ];
    
    // Log full transaction details for verification
    console.group('🔄 USTC Swap Transaction');
    console.log('📋 Transaction Details:');
    console.log('  Sender:', senderAddress);
    console.log('  Contract:', contracts.ustcSwap);
    console.log('  USTC Amount (micro):', ustcAmount);
    console.log('  USTC Amount (display):', (parseFloat(ustcAmount) / 1_000_000).toFixed(6), 'USTC');
    console.log('  Referral Code:', referralCode || '(none)');
    console.log('  Leaderboard Hint:', leaderboardHint 
      ? (leaderboardHint.insert_after !== undefined 
          ? `after "${leaderboardHint.insert_after}"` 
          : '(new head - omitted to avoid null serialization issue)')
      : '(none - O(n) fallback)');
    console.log('');
    console.log('📤 Execute Message:');
    console.log(JSON.stringify(swapMsg, null, 2));
    console.log('');
    console.log('💰 Funds Attached:');
    console.log(JSON.stringify(coins, null, 2));
    console.groupEnd();

    // Execute the swap transaction (using same pattern as preregister)
    const result = await executeContractWithCoins(
      contracts.ustcSwap,
      swapMsg,
      coins
    );
    
    console.log('✅ Swap transaction submitted:', result.txHash);
    
    return result.txHash;
  }

  async executeAirdrop(
    _senderAddress: string,
    _tokenAddress: string,
    _recipients: Array<{ address: string; amount: string }>
  ): Promise<string> {
    // Airdrop functionality requires a dedicated airdrop contract or
    // batch transfer capability which is not currently implemented.
    // CW20 tokens require individual transfer messages, making batch
    // airdrops gas-intensive. Consider using an airdrop contract like
    // cw20-merkle-airdrop for efficient large-scale distributions.
    throw new Error(
      'Airdrop functionality not implemented. ' +
      'For batch token distributions, deploy a dedicated airdrop contract.'
    );
  }

  // ============================================
  // Referral Contract Queries
  // ============================================

  async getReferralConfig(): Promise<ReferralConfig> {
    const contracts = this.getContracts();
    
    if (!contracts.referral) {
      console.warn('Referral contract address not configured');
      return { ustr_token: '' };
    }
    
    try {
      const result = await this.queryContract<{ data: { ustr_token: string } }>(
        contracts.referral,
        { config: {} }
      );
      return { ustr_token: result.data.ustr_token };
    } catch (error) {
      console.error('Failed to get referral config:', error);
      return { ustr_token: '' };
    }
  }

  /**
   * Get USTR token address from referral contract config (cached)
   */
  private ustrTokenAddress: string | null = null;
  
  async getUstrTokenAddress(): Promise<string> {
    if (this.ustrTokenAddress) {
      return this.ustrTokenAddress;
    }
    
    const config = await this.getReferralConfig();
    this.ustrTokenAddress = config.ustr_token;
    return this.ustrTokenAddress;
  }

  async getCodeInfo(code: string): Promise<CodeInfo | null> {
    const contracts = this.getContracts();
    
    if (!contracts.referral) {
      console.warn('Referral contract address not configured');
      return null;
    }
    
    try {
      const result = await this.queryContract<{ data: CodeInfo | null }>(
        contracts.referral,
        { code_info: { code: code.toLowerCase() } }
      );
      return result.data;
    } catch (error) {
      console.error('Failed to get code info:', error);
      return null;
    }
  }

  async getCodesByOwner(owner: string): Promise<CodesResponse> {
    const contracts = this.getContracts();
    
    if (!contracts.referral) {
      console.warn('Referral contract address not configured');
      return { codes: [] };
    }
    
    try {
      const result = await this.queryContract<{ data: CodesResponse }>(
        contracts.referral,
        { codes_by_owner: { owner } }
      );
      return result.data;
    } catch (error) {
      console.error('Failed to get codes by owner:', error);
      return { codes: [] };
    }
  }

  async validateCode(code: string): Promise<ValidateResponse> {
    const contracts = this.getContracts();
    
    if (!contracts.referral) {
      // Fallback to client-side validation only
      const normalizedCode = code.toLowerCase();
      const isValidFormat = 
        normalizedCode.length >= 1 && 
        normalizedCode.length <= 20 &&
        /^[a-z0-9_-]+$/.test(normalizedCode);
      
      return {
        is_valid_format: isValidFormat,
        is_registered: false,
        owner: null,
      };
    }
    
    try {
      const result = await this.queryContract<{ data: ValidateResponse }>(
        contracts.referral,
        { validate_code: { code: code.toLowerCase() } }
      );
      return result.data;
    } catch (error) {
      console.error('Failed to validate code:', error);
      // Fallback to client-side validation
      const normalizedCode = code.toLowerCase();
      const isValidFormat = 
        normalizedCode.length >= 1 && 
        normalizedCode.length <= 20 &&
        /^[a-z0-9_-]+$/.test(normalizedCode);
      
      return {
        is_valid_format: isValidFormat,
        is_registered: false,
        owner: null,
      };
    }
  }

  // ============================================
  // Referral Contract Execute
  // ============================================

  async registerReferralCode(
    senderAddress: string,
    code: string
  ): Promise<string> {
    const contracts = this.getContracts();
    
    if (!contracts.referral) {
      throw new Error('Referral contract address not configured');
    }
    
    // Get USTR token address
    const ustrTokenAddress = await this.getUstrTokenAddress();
    if (!ustrTokenAddress) {
      throw new Error('USTR token address not found');
    }
    
    console.log('Registering referral code:', { 
      sender: senderAddress, 
      code,
      referralContract: contracts.referral,
      ustrToken: ustrTokenAddress,
      fee: REFERRAL_CODE.registrationFee,
    });
    
    // Create the RegisterCodeMsg to embed in the CW20 Send
    // The contract expects just { "code": "..." } as per msg.rs RegisterCodeMsg struct
    const registerCodeMsg = {
      code: code.toLowerCase(), // Normalize to lowercase
    };
    
    // Execute CW20 Send with embedded message
    const result = await executeCw20Send(
      ustrTokenAddress,
      contracts.referral,
      REFERRAL_CODE.registrationFee,
      registerCodeMsg
    );
    
    return result.txHash;
  }
}

// Export singleton instance
export const contractService = new ContractService();

// Export class for testing
export { ContractService };

