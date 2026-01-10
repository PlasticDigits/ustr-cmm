/**
 * SwapCard Component
 * 
 * Main swap interface for exchanging USTC to USTR.
 * Features:
 * - Glass morphism design
 * - Animated gradient border
 * - Token icons
 * - Pulsing arrow animation
 */

import { useSwap } from '../../hooks/useSwap';
import { useWallet } from '../../hooks/useWallet';
import { useLaunchStatus } from '../../hooks/useLaunchStatus';
import { Card, CardContent } from '../common/Card';
import { Button } from '../common/Button';
import { formatAmount, formatRate, formatDuration } from '../../utils/format';

export function SwapCard() {
  const isLaunched = useLaunchStatus();
  const { connected, ustcBalance } = useWallet();
  const {
    inputAmount,
    setInputAmount,
    simulation,
    currentRate,
    swapStatus,
    isSwapping,
    executeSwap,
    canSwap,
    isActive,
    timeRemaining,
  } = useSwap();

  const handleMaxClick = () => {
    if (ustcBalance) {
      const balance = parseFloat(ustcBalance) / 1_000_000;
      setInputAmount(balance.toString());
    }
  };

  return (
    <div className="relative animate-fade-in-up stagger-2">
      {/* Glow effect behind card */}
      <div className={`absolute -inset-2 bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-amber-500/20 rounded-3xl blur-xl transition-opacity duration-500 ${isLaunched ? 'opacity-100' : 'opacity-30'}`} />
      
      <Card variant="highlight" className={`w-full max-w-md mx-auto relative ${!isLaunched ? 'opacity-60 saturate-50' : ''}`}>
        {/* Overlay when not launched */}
        {!isLaunched && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-900/90 backdrop-blur-sm rounded-2xl">
            <div className="text-center px-6">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-white mb-2">
                Swap Not Available Yet
              </p>
              <p className="text-sm text-gray-400">
                Opens January 22, 2026 at 13:00 UTC
              </p>
            </div>
          </div>
        )}
        
        <CardContent>
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-sm font-bold text-white">↔</span>
              Swap USTC → USTR
            </h2>
            <p className="text-sm text-gray-400 mt-1 ml-10">
              Exchange at the current rate
            </p>
          </div>

          {/* Rate Display */}
          <div className="flex items-center justify-between p-4 bg-surface-800/50 border border-white/5 rounded-xl mb-5">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Current Rate</p>
              <p className="text-lg font-mono-numbers font-semibold text-white">
                {currentRate ? `${formatRate(currentRate.rate)} USTC` : '—'}
              </p>
              <p className="text-xs text-gray-500">per USTR</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-0.5">Time Remaining</p>
              <p className="text-lg font-mono-numbers font-semibold text-amber-400">
                {swapStatus ? formatDuration(timeRemaining) : '—'}
              </p>
            </div>
          </div>

          {/* Input */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">You Send</label>
              <span className="text-xs text-gray-500">
                Balance: <span className="font-mono-numbers text-gray-400">{formatAmount(ustcBalance)}</span> USTC
              </span>
            </div>
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
              <div className="relative bg-surface-800 border border-white/10 rounded-xl overflow-hidden group-focus-within:border-amber-500/50 transition-colors">
                <input
                  type="number"
                  value={inputAmount}
                  onChange={(e) => setInputAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-4 bg-transparent text-white text-lg font-mono-numbers focus:outline-none placeholder:text-gray-600"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <button
                    onClick={handleMaxClick}
                    className="px-2.5 py-1 text-xs font-semibold bg-amber-500/20 text-amber-400 rounded-md hover:bg-amber-500/30 transition-colors"
                  >
                    MAX
                  </button>
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] font-bold text-blue-400">U</div>
                    <span className="font-medium text-sm">USTC</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center my-3">
            <div className="w-10 h-10 rounded-full bg-surface-700 border border-white/10 flex items-center justify-center group hover:border-amber-500/30 transition-colors cursor-default">
              <svg 
                className="w-5 h-5 text-amber-500 animate-bounce" 
                style={{ animationDuration: '2s' }}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
          </div>

          {/* Output */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">You Receive</label>
              <span className="text-xs text-gray-500">USTR Token</span>
            </div>
            <div className="px-4 py-4 bg-surface-800/30 border border-white/5 rounded-xl flex items-center justify-between">
              <span className="text-lg font-mono-numbers text-white font-medium">
                {simulation 
                  ? formatAmount(simulation.ustr_amount)
                  : '0.00'
                }
              </span>
              <div className="flex items-center gap-1.5 text-gray-300">
                <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] font-bold text-amber-400">U</div>
                <span className="font-medium text-sm">USTR</span>
              </div>
            </div>
          </div>

          {/* Status Messages */}
          {!connected && (
            <div className="flex items-center justify-center gap-2 text-amber-400 text-sm mb-4 p-3 bg-amber-500/10 rounded-lg">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Connect your wallet to swap
            </div>
          )}
          {connected && !isActive && swapStatus?.ended && (
            <div className="flex items-center justify-center gap-2 text-red-400 text-sm mb-4 p-3 bg-red-500/10 rounded-lg">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Swap period has ended
            </div>
          )}
          {connected && !isActive && !swapStatus?.started && (
            <div className="flex items-center justify-center gap-2 text-amber-400 text-sm mb-4 p-3 bg-amber-500/10 rounded-lg">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Swap period has not started yet
            </div>
          )}
          {connected && swapStatus?.paused && (
            <div className="flex items-center justify-center gap-2 text-red-400 text-sm mb-4 p-3 bg-red-500/10 rounded-lg">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Swap is currently paused
            </div>
          )}

          {/* Swap Button */}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!canSwap}
            loading={isSwapping}
            onClick={executeSwap}
          >
            {!connected 
              ? 'Connect Wallet'
              : !isActive
              ? 'Swap Unavailable'
              : 'Swap Now'
            }
          </Button>

          {/* Info */}
          <p className="text-xs text-gray-500 text-center mt-4">
            Minimum swap: 1 USTC • Rate increases daily
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
