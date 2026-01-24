/**
 * Referral Leaderboard Component
 * 
 * Displays the top 50 referral codes by rewards earned.
 * - Highlights codes owned by the connected wallet
 * - Shows user's codes not in top 50 at the bottom
 */

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../../hooks/useWallet';
import { contractService } from '../../services/contract';
import { Card, CardContent, CardHeader } from '../common/Card';
import { formatAddress, getAddressScannerUrl } from '../../utils/format';
import { DECIMALS } from '../../utils/constants';
import type { LeaderboardEntry, ReferralLeaderboardResponse, CodesResponse } from '../../types/contracts';

/**
 * Format USTR amount with fixed decimal places to avoid floating point precision issues.
 * Uses BigInt for precision and truncates (rounds down) to 2 decimal places.
 */
function formatUstrAmount(microAmount: string): string {
  // For very large numbers (18 decimals), we use BigInt for precision
  const amount = BigInt(microAmount);
  const divisor = BigInt(10 ** DECIMALS.USTR);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;
  
  // Truncate to first 2 decimal places (no rounding, just floor)
  // Multiply by 100, divide by full divisor to get 2 decimal digits
  const twoDecimalDivisor = BigInt(10 ** (DECIMALS.USTR - 2));
  const truncatedFraction = Number(fractionalPart / twoDecimalDivisor);
  
  // Format with thousand separators and 2 decimal places
  const formatted = integerPart.toLocaleString('en-US');
  const decimals = truncatedFraction.toString().padStart(2, '0');
  
  return `${formatted}.${decimals}`;
}

/** Dev mode flag - enables mock data for UX testing */
const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true';

/** Mock wallet address for dev mode (simulates connected wallet) */
const MOCK_WALLET_ADDRESS = 'terra1mock_user_wallet_address_for_testing_leaderboard';

/** Generate mock leaderboard data for dev mode */
function generateMockLeaderboard(): ReferralLeaderboardResponse {
  const mockCodes = [
    { code: 'cryptoking', rewards: '125000000000000000000000' }, // 125,000 USTR
    { code: 'moonshot', rewards: '98500000000000000000000' },    // 98,500 USTR
    { code: 'diamondhands', rewards: '75200000000000000000000' }, // 75,200 USTR
    { code: 'hodlgang', rewards: '62100000000000000000000' },    // 62,100 USTR
    { code: 'my-referral', rewards: '55800000000000000000000' }, // 55,800 USTR (user's code in top 50)
    { code: 'bullrun2024', rewards: '48300000000000000000000' },
    { code: 'satoshi_fan', rewards: '42100000000000000000000' },
    { code: 'whale_alert', rewards: '38500000000000000000000' },
    { code: 'defi-master', rewards: '35200000000000000000000' },
    { code: 'terra-luna', rewards: '32800000000000000000000' },
    { code: 'ustc_lover', rewards: '28900000000000000000000' },
    { code: 'blockchain_pro', rewards: '25100000000000000000000' },
    { code: 'crypto_ninja', rewards: '22500000000000000000000' },
    { code: 'web3wizard', rewards: '19800000000000000000000' },
    { code: 'nft_collector', rewards: '17200000000000000000000' },
    { code: 'token_trader', rewards: '15600000000000000000000' },
    { code: 'yield_farmer', rewards: '14100000000000000000000' },
    { code: 'stake_master', rewards: '12800000000000000000000' },
    { code: 'cosmos_hub', rewards: '11500000000000000000000' },
    { code: 'ibc_relay', rewards: '10200000000000000000000' },
  ];

  // Generate addresses for mock entries
  const entries: LeaderboardEntry[] = mockCodes.map((item, index) => ({
    code: item.code,
    owner: item.code === 'my-referral' 
      ? MOCK_WALLET_ADDRESS 
      : `terra1${item.code.replace(/[^a-z0-9]/g, '')}${index}owner`,
    total_rewards_earned: item.rewards,
    total_user_bonuses: (BigInt(item.rewards) / BigInt(2)).toString(), // Half for user bonuses
    total_swaps: Math.floor(Math.random() * 500) + 50,
    rank: index + 1,
  }));

  return { entries, has_more: false };
}

/** Generate mock user codes for dev mode */
function generateMockUserCodes(): CodesResponse {
  return {
    codes: ['my-referral', 'my-other-code', 'unused-code'],
  };
}

interface UserCode {
  code: string;
  rewards: string;
  inTop50: boolean;
}

/** Batch size for pagination (limited by LCD gas constraints - 25 works, 50 exceeds gas) */
const BATCH_SIZE = 25;
/** Maximum entries to fetch (top 50) */
const MAX_ENTRIES = 50;

export function Leaderboard() {
  const { connected, address } = useWallet();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [userCodes, setUserCodes] = useState<UserCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Fetch leaderboard in batches and user's codes
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setLoadingProgress('Loading...');

    try {
      // In dev mode, use mock data
      if (DEV_MODE) {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const leaderboard = generateMockLeaderboard();
        setEntries(leaderboard.entries);

        // Simulate user codes
        const mockUserCodes = generateMockUserCodes();
        const top50Codes = new Set(leaderboard.entries.map(e => e.code.toLowerCase()));
        
        const userCodeDetails: UserCode[] = mockUserCodes.codes.map(code => {
          const normalizedCode = code.toLowerCase();
          const inTop50 = top50Codes.has(normalizedCode);
          const entry = leaderboard.entries.find(e => e.code.toLowerCase() === normalizedCode);
          
          return {
            code,
            rewards: inTop50 ? (entry?.total_rewards_earned || '0') : '1500000000000000000', // 1.5 USTR for codes not in top 50
            inTop50,
          };
        });
        
        setUserCodes(userCodeDetails);
        setIsLoading(false);
        return;
      }

      // Fetch top 50 leaderboard in batches of 10 (LCD gas limit prevents fetching 50 at once)
      const allEntries: LeaderboardEntry[] = [];
      let startAfter: string | undefined = undefined;
      let hasMore = true;
      let batchNum = 0;

      while (hasMore && allEntries.length < MAX_ENTRIES) {
        batchNum++;
        setLoadingProgress(`Loading batch ${batchNum}...`);
        
        const batch = await contractService.getReferralLeaderboard(startAfter, BATCH_SIZE);
        
        if (batch.entries.length === 0) {
          break;
        }
        
        allEntries.push(...batch.entries);
        hasMore = batch.has_more;
        
        // Set cursor for next batch (last code in current batch)
        if (batch.entries.length > 0) {
          startAfter = batch.entries[batch.entries.length - 1].code;
        }
        
        // Update entries progressively so user sees results as they load
        setEntries([...allEntries]);
      }

      // If wallet connected, get user's codes and check which are not in top 50
      if (connected && address) {
        setLoadingProgress('Loading your codes...');
        const codesResponse = await contractService.getCodesByOwner(address);
        const userOwnedCodes = codesResponse.codes;

        // Find which of user's codes are in top 50
        const top50Codes = new Set(allEntries.map(e => e.code.toLowerCase()));
        
        // For codes not in top 50, we need to get their rewards
        const userCodeDetails: UserCode[] = [];
        
        for (const code of userOwnedCodes) {
          const normalizedCode = code.toLowerCase();
          const inTop50 = top50Codes.has(normalizedCode);
          
          if (inTop50) {
            // Already in leaderboard, get rewards from there
            const entry = allEntries.find(e => e.code.toLowerCase() === normalizedCode);
            userCodeDetails.push({
              code,
              rewards: entry?.total_rewards_earned || '0',
              inTop50: true,
            });
          } else {
            // Not in top 50, query the code's stats from the contract
            const stats = await contractService.getReferralCodeStats(code);
            userCodeDetails.push({
              code,
              rewards: stats?.total_rewards_earned || '0',
              inTop50: false,
            });
          }
        }
        
        setUserCodes(userCodeDetails);
      } else {
        setUserCodes([]);
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
      setError('Failed to load leaderboard. Please try again.');
    } finally {
      setIsLoading(false);
      setLoadingProgress('');
    }
  }, [connected, address]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Check if a code belongs to connected wallet (or mock wallet in dev mode)
  const isOwnCode = useCallback((owner: string) => {
    if (DEV_MODE) {
      return owner.toLowerCase() === MOCK_WALLET_ADDRESS.toLowerCase();
    }
    if (!connected || !address) return false;
    return owner.toLowerCase() === address.toLowerCase();
  }, [connected, address]);

  // Get user codes not in top 50
  const userCodesOutsideTop50 = userCodes.filter(c => !c.inTop50);
  
  // In dev mode, always show user codes section
  const showUserCodesSection = DEV_MODE || connected;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </span>
            <div>
              <h2 className="text-xl font-bold text-white">Leaderboard Top 50</h2>
              <p className="text-sm text-gray-400">Top referral codes by rewards earned</p>
            </div>
          </div>
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="p-2 rounded-lg bg-surface-700/50 hover:bg-surface-700 transition-colors text-gray-400 hover:text-white disabled:opacity-50"
            title="Refresh"
          >
            <svg 
              className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Error state */}
        {error && (
          <div className="p-5 md:p-6">
            <div className="flex items-center gap-2 text-red-400 text-sm p-3 bg-red-500/10 rounded-lg">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              {error}
            </div>
          </div>
        )}

        {/* Loading state - only show full loading overlay when no entries yet */}
        {isLoading && !error && entries.length === 0 && (
          <div className="p-5 md:p-6">
            <div className="flex items-center justify-center gap-3 py-8">
              <svg className="w-5 h-5 animate-spin text-amber-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-gray-400">{loadingProgress || 'Loading leaderboard...'}</span>
            </div>
          </div>
        )}

        {/* Empty state - only show if no entries AND no user codes */}
        {!isLoading && !error && entries.length === 0 && userCodesOutsideTop50.length === 0 && (
          <div className="p-5 md:p-6">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-surface-700 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-gray-400 text-sm">No referral activity yet</p>
              <p className="text-gray-500 text-xs mt-1">Be the first to earn referral rewards!</p>
            </div>
          </div>
        )}

        {/* Leaderboard table */}
        {!isLoading && !error && entries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-5 md:px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Rewards (USTR)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {entries.map((entry, index) => {
                  const isOwn = isOwnCode(entry.owner);
                  const rank = entry.rank || index + 1;
                  
                  return (
                    <tr 
                      key={entry.code}
                      className={`transition-colors ${
                        isOwn 
                          ? 'bg-amber-500/10 hover:bg-amber-500/15' 
                          : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <td className="px-5 md:px-6 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {rank <= 3 ? (
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              rank === 1 
                                ? 'bg-yellow-500/20 text-yellow-400' 
                                : rank === 2 
                                  ? 'bg-gray-400/20 text-gray-300' 
                                  : 'bg-orange-600/20 text-orange-400'
                            }`}>
                              {rank}
                            </span>
                          ) : (
                            <span className="w-6 h-6 flex items-center justify-center text-sm text-gray-500">
                              {rank}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-medium ${
                            isOwn ? 'text-amber-400' : 'text-white'
                          }`}>
                            {entry.code}
                          </span>
                          {isOwn && (
                            <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded">
                              You
                            </span>
                          )}
                        </div>
                        <a
                          href={getAddressScannerUrl(entry.owner)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-500 hover:text-gray-400 font-mono mt-0.5 block"
                        >
                          {formatAddress(entry.owner, 6)}
                        </a>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right">
                        <span className={`font-mono font-medium ${
                          isOwn ? 'text-amber-400' : 'text-green-400'
                        }`}>
                          {formatUstrAmount(entry.total_rewards_earned)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

          </div>
        )}

        {/* User codes outside top 50 - shown even if leaderboard is empty */}
        {!isLoading && !error && showUserCodesSection && userCodesOutsideTop50.length > 0 && (
          <div className="overflow-x-auto">
            {entries.length > 0 && (
              <div className="border-t border-white/10 mx-5 md:mx-6" />
            )}
            <div className="px-5 md:px-6 py-3">
              <p className="text-xs text-gray-500 mb-2">
                {entries.length === 0 ? 'Your registered codes:' : 'Your other codes (not in top 50):'}
              </p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-5 md:px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Rewards (USTR)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {userCodesOutsideTop50.map((userCode) => (
                  <tr 
                    key={userCode.code}
                    className="bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
                  >
                    <td className="px-5 md:px-6 py-3 whitespace-nowrap">
                      <span className="w-6 h-6 flex items-center justify-center text-sm text-gray-500">
                        {entries.length === 0 ? '-' : '>50'}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-amber-400">
                          {userCode.code}
                        </span>
                        <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded">
                          You
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-right">
                      <span className="font-mono font-medium text-amber-400">
                        {formatUstrAmount(userCode.rewards)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
