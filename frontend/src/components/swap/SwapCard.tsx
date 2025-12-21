/**
 * SwapCard Component
 * 
 * Main swap interface for exchanging USTC to USTR.
 */

import { useSwap } from '../../hooks/useSwap';
import { useWallet } from '../../hooks/useWallet';
import { Card, CardContent } from '../common/Card';
import { Button } from '../common/Button';
import { formatAmount, formatRate, formatDuration } from '../../utils/format';

export function SwapCard() {
  const { connected, ustcBalance } = useWallet();
  const {
    inputAmount,
    setInputAmount,
    simulation,
    currentRate,
    swapStatus,
    isLoading,
    isSwapping,
    executeSwap,
    canSwap,
    isActive,
    timeRemaining,
  } = useSwap();

  const handleMaxClick = () => {
    if (ustcBalance) {
      // Convert from micro to human readable
      const balance = parseFloat(ustcBalance) / 1_000_000;
      setInputAmount(balance.toString());
    }
  };

  return (
    <Card variant="highlight" className="w-full max-w-md mx-auto">
      <CardContent>
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white">Swap USTC → USTR</h2>
          <p className="text-sm text-gray-400 mt-1">
            Exchange your USTC for USTR at the current rate
          </p>
        </div>

        {/* Rate Display */}
        <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-xl mb-4">
          <div>
            <p className="text-xs text-gray-500">Current Rate</p>
            <p className="text-lg font-semibold text-white">
              {currentRate ? `${formatRate(currentRate.rate)} USTC / USTR` : '—'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Time Remaining</p>
            <p className="text-lg font-semibold text-amber-500">
              {swapStatus ? formatDuration(timeRemaining) : '—'}
            </p>
          </div>
        </div>

        {/* Input */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400">You Send</label>
            <span className="text-xs text-gray-500">
              Balance: {formatAmount(ustcBalance)} USTC
            </span>
          </div>
          <div className="relative">
            <input
              type="number"
              value={inputAmount}
              onChange={(e) => setInputAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-4 bg-gray-900 border border-gray-700 rounded-xl text-white text-lg focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                onClick={handleMaxClick}
                className="px-2 py-1 text-xs bg-amber-500/20 text-amber-500 rounded hover:bg-amber-500/30 transition-colors"
              >
                MAX
              </button>
              <span className="text-gray-400 font-medium">USTC</span>
            </div>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex justify-center my-2">
          <div className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">
            <span className="text-gray-400">↓</span>
          </div>
        </div>

        {/* Output */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400">You Receive</label>
            <span className="text-xs text-gray-500">USTR Token</span>
          </div>
          <div className="px-4 py-4 bg-gray-900/50 border border-gray-700 rounded-xl">
            <span className="text-lg text-white font-medium">
              {simulation 
                ? formatAmount(simulation.ustr_amount)
                : '0.00'
              }
            </span>
            <span className="text-gray-400 ml-2">USTR</span>
          </div>
        </div>

        {/* Status Messages */}
        {!connected && (
          <p className="text-center text-amber-500 text-sm mb-4">
            Connect your wallet to swap
          </p>
        )}
        {connected && !isActive && swapStatus?.ended && (
          <p className="text-center text-red-500 text-sm mb-4">
            Swap period has ended
          </p>
        )}
        {connected && !isActive && !swapStatus?.started && (
          <p className="text-center text-amber-500 text-sm mb-4">
            Swap period has not started yet
          </p>
        )}
        {connected && swapStatus?.paused && (
          <p className="text-center text-red-500 text-sm mb-4">
            Swap is currently paused
          </p>
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
            : 'Swap'
          }
        </Button>

        {/* Info */}
        <p className="text-xs text-gray-500 text-center mt-4">
          Minimum swap: 1 USTC. Rate increases over time.
        </p>
      </CardContent>
    </Card>
  );
}

