/**
 * Wallet Button Component
 * 
 * Handles wallet connection UI with support for multiple wallet types.
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
          className="flex items-center gap-3 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl transition-colors"
        >
          <div className="text-right">
            <p className="text-sm font-medium text-white">
              {formatAmount(ustcBalance)} USTC
            </p>
            <p className="text-xs text-gray-400">
              {formatAddress(address, 6)}
            </p>
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600" />
        </button>

        {showDropdown && (
          <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden">
            <button
              onClick={() => {
                disconnect();
                setShowDropdown(false);
              }}
              className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={connecting}
        className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {connecting ? 'Connecting...' : 'Connect Wallet'}
      </button>

      {showModal && (
        <WalletModal 
          onClose={() => setShowModal(false)}
          onSelect={handleConnect}
        />
      )}
    </>
  );
}

interface WalletModalProps {
  onClose: () => void;
  onSelect: (type: WalletType) => void;
}

function WalletModal({ onClose, onSelect }: WalletModalProps) {
  const wallets = [
    { type: 'station' as const, name: 'Terra Station', icon: '🌍' },
    { type: 'keplr' as const, name: 'Keplr', icon: '🔮' },
    { type: 'walletconnect' as const, name: 'WalletConnect', icon: '🔗' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">Connect Wallet</h3>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3">
            {wallets.map((wallet) => (
              <button
                key={wallet.type}
                onClick={() => onSelect(wallet.type)}
                className="w-full flex items-center gap-4 p-4 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-xl transition-colors"
              >
                <span className="text-2xl">{wallet.icon}</span>
                <span className="text-white font-medium">{wallet.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

