/**
 * Wallet Button Component
 * 
 * Handles wallet connection UI with:
 * - Multiple wallet type support
 * - Glass morphism modal
 * - Animated hover states
 */

import { useState } from 'react';
import { useWallet } from '../../hooks/useWallet';
import { formatAddress, formatAmount } from '../../utils/format';

export function WalletButton() {
  const { 
    connected, 
    address, 
    ustcBalance, 
    disconnect 
  } = useWallet();
  
  const [showDropdown, setShowDropdown] = useState(false);

  if (connected && address) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 glass border border-white/10 hover:border-amber-500/30 rounded-xl transition-all group"
        >
          <div className="text-right hidden sm:block">
            <p className="text-sm font-mono-numbers font-medium text-white">
              {formatAmount(ustcBalance)} <span className="text-gray-400">USTC</span>
            </p>
            <p className="text-xs text-gray-500">
              {formatAddress(address, 6)}
            </p>
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 group-hover:shadow-lg group-hover:shadow-amber-500/20 transition-shadow" />
        </button>

        {showDropdown && (
          <>
            {/* Click outside to close */}
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setShowDropdown(false)} 
            />
            <div className="absolute right-0 mt-2 w-48 glass border border-white/10 rounded-xl shadow-xl overflow-hidden z-50 animate-fade-in-up" style={{ animationDuration: '0.2s' }}>
              <div className="p-2">
                <div className="px-3 py-2 sm:hidden">
                  <p className="text-sm font-mono-numbers text-white">{formatAmount(ustcBalance)} USTC</p>
                  <p className="text-xs text-gray-500">{formatAddress(address, 8)}</p>
                </div>
                <button
                  onClick={() => {
                    disconnect();
                    setShowDropdown(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-300 hover:bg-white/5 hover:text-red-400 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Disconnect
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        disabled={true}
        className="px-4 sm:px-5 py-2 sm:py-2.5 bg-gray-700 text-gray-500 text-sm sm:text-base font-semibold rounded-xl transition-all cursor-not-allowed opacity-60"
      >
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
          </svg>
          <span className="hidden sm:inline">Connect Wallet</span>
          <span className="sm:hidden">Connect</span>
        </span>
      </button>
    </>
  );
}
