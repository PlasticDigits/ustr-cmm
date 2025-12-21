/**
 * Wallet State Management
 * 
 * Uses Zustand for lightweight, hook-based state management.
 * Handles wallet connection state for Terra Station, WalletConnect, and Keplr.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type WalletType = 'station' | 'walletconnect' | 'keplr' | null;

export interface WalletState {
  // Connection state
  connected: boolean;
  connecting: boolean;
  address: string | null;
  walletType: WalletType;
  
  // Network state
  chainId: string | null;
  
  // Balances (micro units)
  ustcBalance: string;
  ustrBalance: string;
  luncBalance: string;
  
  // Actions
  connect: (walletType: WalletType) => Promise<void>;
  disconnect: () => void;
  setBalances: (balances: { ustc?: string; ustr?: string; lunc?: string }) => void;
  setConnecting: (connecting: boolean) => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, _get) => ({
      // Initial state
      connected: false,
      connecting: false,
      address: null,
      walletType: null,
      chainId: null,
      ustcBalance: '0',
      ustrBalance: '0',
      luncBalance: '0',

      // Connect to wallet
      connect: async (walletType: WalletType) => {
        set({ connecting: true });
        
        try {
          // TODO: Implement actual wallet connection logic
          // This will be implemented with terra.js / cosmos-kit
          
          switch (walletType) {
            case 'station':
              // Terra Station wallet connection
              console.log('Connecting to Terra Station...');
              break;
            case 'walletconnect':
              // WalletConnect connection
              console.log('Connecting via WalletConnect...');
              break;
            case 'keplr':
              // Keplr wallet connection
              console.log('Connecting to Keplr...');
              break;
            default:
              throw new Error('Invalid wallet type');
          }
          
          // Placeholder - will be replaced with actual connection
          set({
            connected: true,
            connecting: false,
            walletType,
            // address will be set by the actual connection
          });
        } catch (error) {
          console.error('Wallet connection failed:', error);
          set({ connecting: false });
          throw error;
        }
      },

      // Disconnect wallet
      disconnect: () => {
        set({
          connected: false,
          connecting: false,
          address: null,
          walletType: null,
          chainId: null,
          ustcBalance: '0',
          ustrBalance: '0',
          luncBalance: '0',
        });
      },

      // Update balances
      setBalances: (balances) => {
        set((state) => ({
          ustcBalance: balances.ustc ?? state.ustcBalance,
          ustrBalance: balances.ustr ?? state.ustrBalance,
          luncBalance: balances.lunc ?? state.luncBalance,
        }));
      },

      // Set connecting state
      setConnecting: (connecting) => {
        set({ connecting });
      },
    }),
    {
      name: 'ustr-wallet-storage',
      partialize: (state) => ({
        walletType: state.walletType,
        // Don't persist sensitive data
      }),
    }
  )
);

