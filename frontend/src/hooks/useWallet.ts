/**
 * useWallet Hook
 * 
 * Provides wallet connection and state management functionality.
 * Wraps the wallet store with additional utilities.
 */

import { useCallback, useEffect } from 'react';
import { useWalletStore, WalletType } from '../stores/wallet';
import { contractService } from '../services/contract';
import { CONTRACTS, DEFAULT_NETWORK } from '../utils/constants';

export function useWallet() {
  const {
    connected,
    connecting,
    address,
    walletType,
    chainId,
    ustcBalance,
    ustrBalance,
    luncBalance,
    connect: storeConnect,
    disconnect: storeDisconnect,
    setBalances,
    setConnecting,
  } = useWalletStore();

  // Refresh balances from chain
  const refreshBalances = useCallback(async () => {
    if (!address) return;

    try {
      const contracts = CONTRACTS[DEFAULT_NETWORK];
      
      // Fetch all balances in parallel
      const [ustc, ustr, lunc] = await Promise.all([
        contractService.getNativeBalance(address, 'uusd'),
        contracts.ustrToken 
          ? contractService.getTokenBalance(contracts.ustrToken, address).then(b => b.balance)
          : Promise.resolve('0'),
        contractService.getNativeBalance(address, 'uluna'),
      ]);

      setBalances({ ustc, ustr, lunc });
    } catch (error) {
      console.error('Failed to refresh balances:', error);
    }
  }, [address, setBalances]);

  // Connect to wallet
  const connect = useCallback(async (type: WalletType) => {
    try {
      await storeConnect(type);
      // Refresh balances after connection
      await refreshBalances();
    } catch (error) {
      console.error('Connection failed:', error);
      throw error;
    }
  }, [storeConnect, refreshBalances]);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    storeDisconnect();
  }, [storeDisconnect]);

  // Auto-refresh balances when connected
  useEffect(() => {
    if (connected && address) {
      refreshBalances();
      
      // Set up periodic refresh
      const interval = setInterval(refreshBalances, 30000); // 30 seconds
      return () => clearInterval(interval);
    }
  }, [connected, address, refreshBalances]);

  return {
    // State
    connected,
    connecting,
    address,
    walletType,
    chainId,
    
    // Balances
    ustcBalance,
    ustrBalance,
    luncBalance,
    
    // Actions
    connect,
    disconnect,
    refreshBalances,
    setConnecting,
  };
}

