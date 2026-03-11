/**
 * Swap Page Component
 * 
 * Dedicated swap page for referral links at /swap/:code
 * Features:
 * - Extracts referral code from URL parameter
 * - Saves referral code to local storage for persistence
 * - Displays swap card with locked referral code
 * - Shows countdown timer below overlay when not launched
 * - Referral bonus info banner
 */

import { useParams } from 'react-router-dom';
import { SwapCard } from '../components/swap';
import { useLaunchStatus } from '../hooks/useLaunchStatus';
import { useReferralStorage } from '../hooks/useReferralStorage';
import { CountdownTimer } from '../components/common';

export function SwapPage() {
  const { code: urlCode } = useParams<{ code: string }>();
  const isLaunched = useLaunchStatus();
  
  // Use referral storage - URL code gets saved and takes priority
  const { referralCode, isLocked } = useReferralStorage(urlCode);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Referral Banner */}
      {referralCode && (
        <div className="mb-6 animate-fade-in-up">
          <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-teal-500/10 border border-emerald-500/20 rounded-xl">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-400">
                +10% Referral Bonus Applied
              </p>
              <p className="text-sm text-emerald-400/80 mt-1">
                Using referral code <span className="font-mono font-semibold">"{referralCode}"</span> — you'll receive 10% bonus USTR on your swap!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Swap Card with referral code locked */}
      <SwapCard 
        referralCode={referralCode ?? undefined} 
        referralLocked={isLocked}
        showCountdown={!isLaunched}
      />

      {/* Countdown Timer - shown below card when not launched */}
      {!isLaunched && (
        <div className="mt-8 animate-fade-in-up stagger-2">
          <CountdownTimer />
        </div>
      )}

      {/* Info Section */}
      <div className="mt-8 text-center animate-fade-in-up stagger-3">
        <p className="text-gray-400 text-sm max-w-md mx-auto">
          Swap your USTC for USTR at favorable rates. Early participants receive better exchange rates as the system builds its treasury reserves.
        </p>
        {referralCode && (
          <p className="text-gray-500 text-xs mt-3">
            Both you and the referrer earn a 10% bonus when using a referral code.
          </p>
        )}
      </div>
    </div>
  );
}
