/**
 * Contract Service
 * 
 * Handles all smart contract interactions for the USTR CMM frontend.
 * Provides type-safe methods for querying and executing contract messages.
 * 
 * In dev mode (VITE_DEV_MODE=true), certain methods return mock data
 * to simulate post-launch state for UX testing.
 */

import { NETWORKS, CONTRACTS, DEFAULT_NETWORK, REFERRAL_CODE } from '../utils/constants';
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
    // TODO: Implement actual query
    console.log('Querying swap config from:', contracts.ustcSwap);
    
    // Placeholder response
    return {
      ustr_token: contracts.ustrToken,
      treasury: contracts.treasury,
      start_time: '0',
      end_time: '0',
      start_rate: '1.5',
      end_rate: '2.5',
      admin: '',
      ustc_denom: 'uusd',
      paused: false,
    };
  }

  async getCurrentRate(): Promise<SwapRate> {
    // TODO: Implement actual query
    return {
      rate: '1.5',
      timestamp: Date.now().toString(),
    };
  }

  async simulateSwap(ustcAmount: string, referralCode?: string): Promise<SwapSimulation> {
    // TODO: Implement actual contract query
    const rate = 1.5;
    const ustc = parseFloat(ustcAmount);
    const baseUstr = ustc / rate;
    
    // Apply 10% bonus if referral code is provided
    const bonus = referralCode ? baseUstr * 0.1 : 0;
    const totalUstr = baseUstr + bonus;
    
    return {
      ustc_amount: ustcAmount,
      ustr_amount: Math.floor(totalUstr).toString(),
      rate: rate.toString(),
      referral_code: referralCode,
      bonus_amount: referralCode ? Math.floor(bonus).toString() : undefined,
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

    // TODO: Implement actual query
    return {
      started: false,
      ended: false,
      paused: false,
      seconds_until_start: 0,
      seconds_until_end: 8640000,
      elapsed_seconds: 0,
    };
  }

  async getSwapStats(): Promise<SwapStats> {
    // TODO: Implement actual query
    return {
      total_ustc_received: '0',
      total_ustr_minted: '0',
      swap_count: 0,
    };
  }

  // ============================================
  // Treasury Contract Queries
  // ============================================

  async getTreasuryConfig(): Promise<TreasuryConfig> {
    // TODO: Implement actual query
    return {
      governance: '',
      timelock_duration: 604800,
    };
  }

  async getTreasuryBalances(): Promise<TreasuryAllBalances> {
    // TODO: Implement actual query
    return {
      native: [],
      cw20: [],
    };
  }

  // ============================================
  // Token Queries
  // ============================================

  async getTokenInfo(tokenAddress: string): Promise<Cw20TokenInfo> {
    if (!tokenAddress) {
      return { name: 'USTR', symbol: 'USTR', decimals: 6, total_supply: '0' };
    }
    
    try {
      const result = await this.queryContract<{ data: Cw20TokenInfo }>(
        tokenAddress,
        { token_info: {} }
      );
      return result.data;
    } catch (error) {
      console.error('Failed to get token info:', error);
      return { name: 'USTR', symbol: 'USTR', decimals: 6, total_supply: '0' };
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

  async executeSwap(senderAddress: string, ustcAmount: string, referralCode?: string): Promise<string> {
    const contracts = this.getContracts();
    
    if (!contracts.ustcSwap) {
      throw new Error('Swap contract address not configured');
    }

    // Build the swap message matching the contract's ExecuteMsg::Swap
    // Use Record<string, unknown> to match the working preregister pattern
    // IMPORTANT: Don't include null values - omit the fields entirely for Option<T> = None
    // The cosmes library's removeNull() strips nulls which can cause signature mismatches
    const swapInner: Record<string, unknown> = {};
    
    // Only include referral_code if provided (Option<String> in Rust)
    if (referralCode) {
      swapInner.referral_code = referralCode;
    }
    // leaderboard_hint is omitted when None (TODO: implement hints for O(1) insertion)
    
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
    senderAddress: string,
    tokenAddress: string,
    recipients: Array<{ address: string; amount: string }>
  ): Promise<string> {
    // TODO: Implement actual execution
    console.log('Executing airdrop:', { 
      sender: senderAddress, 
      token: tokenAddress, 
      recipientCount: recipients.length 
    });
    
    return 'placeholder_tx_hash';
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

