/**
 * useWallet Hook
 * 
 * Provides wallet connection and state management functionality.
 * Wraps the wallet store with additional utilities.
 */

import { useCallback, useEffect, useState } from 'react';
import { useWalletStore, checkWalletAvailability, WalletName, WalletType } from '../stores/wallet';
import { contractService } from '../services/contract';

export { WalletName, WalletType };

export function useWallet() {
  const {
    connected,
    connecting,
    address,
    walletType,
    connectionType,
    chainId,
    ustcBalance,
    ustrBalance,
    luncBalance,
    connectingWallet,
    showWalletModal,
    connect: storeConnect,
    disconnect: storeDisconnect,
    setBalances,
    setConnecting,
    cancelConnection,
    setShowWalletModal,
  } = useWalletStore();

  // Track wallet availability
  const [walletAvailability, setWalletAvailability] = useState(checkWalletAvailability);

  // Check wallet availability on mount and periodically
  useEffect(() => {
    const check = () => setWalletAvailability(checkWalletAvailability());
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, []);

  // Refresh balances from chain
  const refreshBalances = useCallback(async () => {
    if (!address) return;

    try {
      // Get USTR token address from referral contract config
      const ustrTokenAddress = await contractService.getUstrTokenAddress();
      
      // Fetch all balances in parallel
      const [ustc, ustr, lunc] = await Promise.all([
        contractService.getNativeBalance(address, 'uusd'),
        ustrTokenAddress 
          ? contractService.getTokenBalance(ustrTokenAddress, address).then(b => b.balance)
          : Promise.resolve('0'),
        contractService.getNativeBalance(address, 'uluna'),
      ]);

      console.log('Balances fetched:', { ustc, ustr, lunc });
      setBalances({ ustc, ustr, lunc });
    } catch (error) {
      console.error('Failed to refresh balances:', error);
    }
  }, [address, setBalances]);

  // Connect to wallet
  const connect = useCallback(async (
    walletName: WalletName = WalletName.STATION,
    walletTypeParam: WalletType = WalletType.EXTENSION
  ) => {
    try {
      await storeConnect(walletName, walletTypeParam);
      // Refresh balances after connection
      await refreshBalances();
    } catch (error) {
      console.error('Connection failed:', error);
      throw error;
    }
  }, [storeConnect, refreshBalances]);

  // Disconnect wallet
  const disconnect = useCallback(async () => {
    await storeDisconnect();
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
    connectionType,
    chainId,
    connectingWallet,
    showWalletModal,
    
    // Balances
    ustcBalance,
    ustrBalance,
    luncBalance,
    
    // Wallet availability
    isStationAvailable: walletAvailability.station,
    isKeplrAvailable: walletAvailability.keplr,
    isLeapAvailable: walletAvailability.leap,
    isCosmostationAvailable: walletAvailability.cosmostation,
    
    // Actions
    connect,
    disconnect,
    refreshBalances,
    setConnecting,
    cancelConnection,
    setShowWalletModal,
  };
}
