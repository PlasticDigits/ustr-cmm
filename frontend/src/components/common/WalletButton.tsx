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
import type { WalletType } from '../../stores/wallet';

export function WalletButton() {
  const { 
    connected, 
    connecting, 
    address, 
    ustcBalance, 
    connect, 
    disconnect 
  } = useWallet();
  
  const [showModal, setShowModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const handleConnect = async (walletType: WalletType) => {
    try {
      await connect(walletType);
      setShowModal(false);
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };

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
        onClick={() => setShowModal(true)}
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

interface WalletModalProps {
  onClose: () => void;
  onSelect: (type: WalletType) => void;
}

function WalletModal({ onClose, onSelect }: WalletModalProps) {
  const wallets = [
    { 
      type: 'station' as const, 
      name: 'Terra Station', 
      description: 'Official Terra wallet',
      color: 'from-blue-500 to-indigo-600',
    },
    { 
      type: 'keplr' as const, 
      name: 'Keplr', 
      description: 'Cosmos ecosystem wallet',
      color: 'from-purple-500 to-pink-600',
    },
    { 
      type: 'walletconnect' as const, 
      name: 'WalletConnect', 
      description: 'Mobile wallet connection',
      color: 'from-cyan-500 to-blue-600',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative glass border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden animate-scale-in shadow-2xl" style={{ animationDuration: '0.3s' }}>
        {/* Header gradient */}
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-amber-500/10 to-transparent pointer-events-none" />
        
        <div className="relative p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-white">Connect Wallet</h3>
              <p className="text-sm text-gray-400">Choose your preferred wallet</p>
            </div>
            <button 
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-3">
            {wallets.map((wallet) => (
              <button
                key={wallet.type}
                onClick={() => onSelect(wallet.type)}
                className="w-full flex items-center gap-4 p-4 glass border border-white/5 hover:border-amber-500/30 rounded-xl transition-all hover:scale-[1.02] group"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${wallet.color} flex items-center justify-center text-white font-bold text-lg shadow-lg`}>
                  {wallet.name[0]}
                </div>
                <div className="text-left">
                  <span className="text-white font-semibold block group-hover:text-amber-400 transition-colors">
                    {wallet.name}
                  </span>
                  <span className="text-xs text-gray-500">{wallet.description}</span>
                </div>
                <svg className="w-5 h-5 text-gray-600 group-hover:text-amber-400 ml-auto transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
          
          <p className="text-xs text-gray-500 text-center mt-6">
            By connecting, you agree to the Terms of Service
          </p>
        </div>
      </div>
    </div>
  );
}
