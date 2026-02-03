/**
 * SwapCard Component
 * 
 * Main swap interface for exchanging USTC to USTR.
 * Features:
 * - Glass morphism design
 * - Animated gradient border
 * - Token icons
 * - Pulsing arrow animation
 * - Optional referral code input (can be locked for referral links)
 * - Optional countdown timer in overlay
 */

import { useEffect, useState } from 'react';
import { useSwap } from '../../hooks/useSwap';
import { useWallet } from '../../hooks/useWallet';
import { useLaunchStatus } from '../../hooks/useLaunchStatus';
import { useTickingRate } from '../../hooks/useTickingRate';
import { Card, CardContent } from '../common/Card';
import { Button } from '../common/Button';
import { formatAmount, formatRate, formatDuration } from '../../utils/format';

/** Launch date for countdown timer */
const LAUNCH_DATE = new Date('2026-01-22T13:00:00Z');

/** Format countdown values with leading zeros */
function padNumber(num: number): string {
  return num.toString().padStart(2, '0');
}

interface SwapCardProps {
  /** Pre-filled referral code (from URL parameter) */
  referralCode?: string;
  /** Whether the referral code field is locked (read-only) */
  referralLocked?: boolean;
  /** Whether to show countdown timer in the overlay */
  showCountdown?: boolean;
}

export function SwapCard({ referralCode: initialReferralCode, referralLocked = false, showCountdown = false }: SwapCardProps) {
  const isLaunched = useLaunchStatus();
  const { connected, ustcBalance, setShowWalletModal } = useWallet();
  const {
    inputAmount,
    setInputAmount,
    referralCode,
    setReferralCode,
    simulation,
    currentRate,
    swapStatus,
    isSwapping,
    executeSwap,
    canSwap,
    isActive,
    timeRemaining,
    exceedsMax,
    maxUstcPerSwap,
  } = useSwap();

  // Smooth ticking rate that updates 20x per second (based on fixed launch time)
  const { tickingRate, isLaunched: tickingLaunched } = useTickingRate({
    enabled: isActive,
  });

  // Countdown timer state
  const [countdown, setCountdown] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  // Update countdown every second when not launched
  useEffect(() => {
    if (isLaunched) {
      setCountdown(null);
      return;
    }

    const calculateCountdown = () => {
      const now = new Date().getTime();
      const target = LAUNCH_DATE.getTime();
      const diff = target - now;

      if (diff <= 0) {
        setCountdown(null);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown({ days, hours, minutes, seconds });
    };

    // Calculate immediately
    calculateCountdown();

    // Update every second
    const interval = setInterval(calculateCountdown, 1000);

    return () => clearInterval(interval);
  }, [isLaunched]);

  // Set initial referral code from props
  useEffect(() => {
    if (initialReferralCode && !referralCode) {
      setReferralCode(initialReferralCode);
    }
  }, [initialReferralCode, referralCode, setReferralCode]);

  const handleMaxClick = () => {
    if (ustcBalance) {
      const balance = parseFloat(ustcBalance) / 1_000_000;
      // Cap at maxUstcPerSwap due to contract limitations
      const cappedAmount = Math.min(balance, maxUstcPerSwap);
      setInputAmount(cappedAmount.toString());
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
              {/* Countdown Timer */}
              {countdown && (
                <div className="flex items-center justify-center gap-2 mb-3">
                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-mono-numbers font-bold text-amber-400">{padNumber(countdown.days)}</span>
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">days</span>
                  </div>
                  <span className="text-xl font-bold text-gray-600 -mt-4">:</span>
                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-mono-numbers font-bold text-amber-400">{padNumber(countdown.hours)}</span>
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">hrs</span>
                  </div>
                  <span className="text-xl font-bold text-gray-600 -mt-4">:</span>
                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-mono-numbers font-bold text-amber-400">{padNumber(countdown.minutes)}</span>
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">min</span>
                  </div>
                  <span className="text-xl font-bold text-gray-600 -mt-4">:</span>
                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-mono-numbers font-bold text-amber-400">{padNumber(countdown.seconds)}</span>
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">sec</span>
                  </div>
                </div>
              )}
              <p className="text-sm text-gray-400">
                Opens January 22, 2026 at 13:00 UTC
              </p>
              {showCountdown && referralCode && (
                <p className="text-xs text-emerald-400 mt-3">
                  Referral code "{referralCode}" will be applied
                </p>
              )}
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
                {tickingLaunched ? `${formatRate(tickingRate, 8)} USTC` : currentRate ? `${formatRate(currentRate.rate)} USTC` : '—'}
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
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">You Receive</label>
              <span className="text-xs text-gray-500">USTR Token</span>
            </div>
            <div className="px-4 py-4 bg-surface-800/30 border border-white/5 rounded-xl flex items-center justify-between">
              <span className="text-lg font-mono-numbers text-white font-medium">
                {simulation 
                  ? formatAmount(simulation.ustr_amount, 18)
                  : '0.00'
                }
              </span>
              <div className="flex items-center gap-1.5 text-gray-300">
                <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] font-bold text-amber-400">U</div>
                <span className="font-medium text-sm">USTR</span>
              </div>
            </div>
            {/* Referral bonus indicator */}
            {referralCode && simulation && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Includes 10% referral bonus
              </div>
            )}
          </div>

          {/* Referral Code Input */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">Referral Code</label>
              <span className="text-xs text-gray-500">
                {referralLocked ? (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Locked
                  </span>
                ) : (
                  'Optional'
                )}
              </span>
            </div>
            <div className="relative group">
              {!referralLocked && (
                <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
              )}
              <div className={`relative bg-surface-800 border rounded-xl overflow-hidden transition-colors ${
                referralLocked 
                  ? 'border-emerald-500/30 bg-emerald-500/5' 
                  : 'border-white/10 group-focus-within:border-emerald-500/50'
              }`}>
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => !referralLocked && setReferralCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder="Enter referral code"
                  readOnly={referralLocked}
                  className={`w-full px-4 py-3 bg-transparent text-sm font-mono focus:outline-none placeholder:text-gray-600 ${
                    referralLocked 
                      ? 'text-emerald-400 cursor-not-allowed' 
                      : 'text-white'
                  }`}
                />
                {referralLocked && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                )}
                {!referralLocked && referralCode && (
                  <button
                    onClick={() => setReferralCode('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {referralCode 
                ? 'You and the referrer each earn +10% bonus USTR'
                : 'Enter a code to earn 10% bonus on your swap'
              }
            </p>
          </div>

          {/* Status Messages */}
          {exceedsMax && (
            <div className="flex items-center justify-center gap-2 text-red-400 text-sm mb-4 p-3 bg-red-500/10 rounded-lg">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Maximum {maxUstcPerSwap} USTC per swap
            </div>
          )}
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
            disabled={connected && !canSwap}
            loading={isSwapping}
            onClick={() => {
              if (!connected) {
                setShowWalletModal(true);
              } else {
                executeSwap();
              }
            }}
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
            Min: 1 USTC • Max: {maxUstcPerSwap} USTC • Rate increases daily
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
