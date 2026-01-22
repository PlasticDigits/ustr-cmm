/**
 * Referral Page
 * 
 * Manage referral codes:
 * - Register new codes (10 USTR fee, burned)
 * - Look up code info by code
 * - Look up codes by owner address
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { contractService } from '../services/contract';
import { Card, CardContent, CardHeader } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { CharacterParticles } from '../components/common/CharacterParticles';
import { Leaderboard } from '../components/referral/Leaderboard';
import { formatAddress, getAddressScannerUrl, getTxScannerUrl } from '../utils/format';
import { REFERRAL_CODE, CONTRACTS, DEFAULT_NETWORK, DECIMALS } from '../utils/constants';
import type { CodeInfo, ValidateResponse, LeaderboardEntry } from '../types/contracts';

// ============================================
// USTR Formatting Helper
// ============================================

/**
 * Format USTR amount with fixed decimal places using BigInt for precision.
 * Truncates (rounds down) to 2 decimal places.
 */
function formatUstrAmount(microAmount: string): string {
  if (!microAmount || microAmount === '0') return '0.00';
  
  const amount = BigInt(microAmount);
  const divisor = BigInt(10 ** DECIMALS.USTR);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;
  
  // Truncate to first 2 decimal places (no rounding, just floor)
  const twoDecimalDivisor = BigInt(10 ** (DECIMALS.USTR - 2));
  const truncatedFraction = Number(fractionalPart / twoDecimalDivisor);
  
  // Format with thousand separators and 2 decimal places
  const formatted = integerPart.toLocaleString('en-US');
  const decimals = truncatedFraction.toString().padStart(2, '0');
  
  return `${formatted}.${decimals}`;
}

/**
 * Get rewards for a specific code from the leaderboard.
 * Returns '0' if code is not in the leaderboard.
 */
async function getCodeRewards(code: string): Promise<string> {
  try {
    const leaderboard = await contractService.getReferralLeaderboard(undefined, 50);
    const entry = leaderboard.entries.find(
      (e: LeaderboardEntry) => e.code.toLowerCase() === code.toLowerCase()
    );
    return entry?.total_rewards_earned || '0';
  } catch (error) {
    console.error('Failed to get code rewards:', error);
    return '0';
  }
}

/**
 * Get rewards for multiple codes from the leaderboard.
 * Returns a map of code -> rewards.
 */
async function getCodesRewards(codes: string[]): Promise<Map<string, string>> {
  const rewardsMap = new Map<string, string>();
  
  // Initialize all codes with 0 rewards
  codes.forEach(code => rewardsMap.set(code.toLowerCase(), '0'));
  
  try {
    const leaderboard = await contractService.getReferralLeaderboard(undefined, 50);
    
    // Match codes from leaderboard
    for (const entry of leaderboard.entries) {
      const normalizedCode = entry.code.toLowerCase();
      if (codes.some(c => c.toLowerCase() === normalizedCode)) {
        rewardsMap.set(normalizedCode, entry.total_rewards_earned);
      }
    }
  } catch (error) {
    console.error('Failed to get codes rewards:', error);
  }
  
  return rewardsMap;
}

// ============================================
// Referral URL Helper
// ============================================

function getReferralSwapUrl(code: string): string {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  return `${baseUrl}/swap/${code}`;
}

// ============================================
// Copy to Clipboard Component
// ============================================

interface CopyLinkProps {
  code: string;
  className?: string;
}

function CopyReferralLink({ code, className = '' }: CopyLinkProps) {
  const [copied, setCopied] = useState(false);
  const url = getReferralSwapUrl(code);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [url]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 min-w-0 px-3 py-2 bg-surface-800/80 border border-white/10 rounded-lg overflow-hidden">
        <p className="text-sm font-mono text-amber-400 truncate">{url}</p>
      </div>
      <button
        onClick={handleCopy}
        className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
          copied 
            ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
        }`}
      >
        {copied ? (
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Copied!
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy
          </span>
        )}
      </button>
    </div>
  );
}

// ============================================
// Code Validation Helper
// ============================================

interface ValidationResult {
  isValid: boolean;
  error: string | null;
  normalizedCode: string;
}

function validateCodeFormat(code: string): ValidationResult {
  const trimmed = code.trim();
  
  if (!trimmed) {
    return { isValid: false, error: 'Code cannot be empty', normalizedCode: '' };
  }
  
  if (trimmed.length < REFERRAL_CODE.minLength) {
    return { isValid: false, error: `Code must be at least ${REFERRAL_CODE.minLength} character`, normalizedCode: '' };
  }
  
  if (trimmed.length > REFERRAL_CODE.maxLength) {
    return { isValid: false, error: `Code cannot exceed ${REFERRAL_CODE.maxLength} characters`, normalizedCode: '' };
  }
  
  const normalized = trimmed.toLowerCase();
  
  if (!REFERRAL_CODE.validPattern.test(normalized)) {
    return { isValid: false, error: 'Only letters (a-z), numbers (0-9), underscore (_), and hyphen (-) are allowed', normalizedCode: '' };
  }
  
  return { isValid: true, error: null, normalizedCode: normalized };
}

// ============================================
// Register Code Section
// ============================================

function RegisterCodeSection() {
  const { connected, address, ustrBalance } = useWallet();
  const [code, setCode] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [validationState, setValidationState] = useState<ValidateResponse | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; txHash?: string; registeredCode?: string } | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  
  // Client-side validation
  const clientValidation = useMemo(() => validateCodeFormat(code), [code]);
  
  // Handle input change with character restriction
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow valid characters (case-insensitive)
    const filtered = value.replace(/[^a-zA-Z0-9_-]/g, '');
    // Enforce max length
    const limited = filtered.slice(0, REFERRAL_CODE.maxLength);
    setCode(limited);
    setValidationState(null);
    setError(null);
    setSuccess(null);
  };
  
  // Validate code against contract
  const handleValidate = useCallback(async () => {
    if (!clientValidation.isValid) {
      setError(clientValidation.error);
      return;
    }
    
    setIsValidating(true);
    setError(null);
    
    try {
      const result = await contractService.validateCode(clientValidation.normalizedCode);
      setValidationState(result);
      
      if (result.is_registered) {
        setError(`Code "${clientValidation.normalizedCode}" is already registered by ${formatAddress(result.owner || '', 8)}`);
      }
    } catch (err) {
      setError('Failed to validate code. Please try again.');
      console.error('Validation error:', err);
    } finally {
      setIsValidating(false);
    }
  }, [clientValidation]);
  
  // Check if user has enough USTR
  const hasEnoughUstr = useMemo(() => {
    if (!ustrBalance) return false;
    return BigInt(ustrBalance) >= BigInt(REFERRAL_CODE.registrationFee);
  }, [ustrBalance]);
  
  // Handle registration
  const handleRegister = useCallback(async () => {
    if (!address || !clientValidation.isValid) return;
    
    setIsRegistering(true);
    setError(null);
    setSuccess(null);
    
    const codeToRegister = clientValidation.normalizedCode;
    
    try {
      const txHash = await contractService.registerReferralCode(address, codeToRegister);
      setSuccess({
        message: `Code "${codeToRegister}" registered successfully!`,
        txHash,
        registeredCode: codeToRegister,
      });
      setCode('');
      setValidationState(null);
      setShowConfirmation(false);
    } catch (err) {
      setError('Failed to register code. Please try again.');
      console.error('Registration error:', err);
    } finally {
      setIsRegistering(false);
    }
  }, [address, clientValidation]);
  
  const canValidate = clientValidation.isValid && !isValidating;
  
  return (
    <Card variant="highlight" className="w-full">
      <CardHeader>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-sm">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </span>
          Register Referral Code
        </h2>
        <p className="text-sm text-gray-400 mt-1 ml-10">
          Claim your unique referral code
        </p>
      </CardHeader>
      <CardContent>
        {/* Warning Banner */}
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl mb-6">
          <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-400">Registration is Permanent</p>
            <p className="text-sm text-amber-400/80 mt-1">
              Once registered, referral codes <strong>cannot be deleted or transferred</strong>. 
              The {REFERRAL_CODE.registrationFeeDisplay} USTR fee is burned. 
              Each wallet can register up to {REFERRAL_CODE.maxCodesPerOwner} codes. Choose carefully!
            </p>
          </div>
        </div>
        
        {/* Code Input */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300">Your Referral Code</label>
            <span className="text-xs text-gray-500">
              {code.length}/{REFERRAL_CODE.maxLength} characters
            </span>
          </div>
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
            <div className="relative bg-surface-800 border border-white/10 rounded-xl overflow-hidden group-focus-within:border-amber-500/50 transition-colors">
              <input
                type="text"
                value={code}
                onChange={handleInputChange}
                placeholder="my-code-123"
                className="w-full px-4 py-4 bg-transparent text-white text-lg font-mono focus:outline-none placeholder:text-gray-600"
                disabled={isRegistering}
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Letters (a-z), numbers (0-9), underscore (_), and hyphen (-) only. Case-insensitive.
          </p>
        </div>
        
        {/* Client validation feedback */}
        {code && !clientValidation.isValid && (
          <div className="flex items-center gap-2 text-red-400 text-sm mb-4 p-3 bg-red-500/10 rounded-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {clientValidation.error}
          </div>
        )}
        
        {/* Validation result */}
        {validationState && !validationState.is_registered && validationState.is_valid_format && (
          <div className="flex items-center gap-2 text-green-400 text-sm mb-4 p-3 bg-green-500/10 rounded-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Code "{clientValidation.normalizedCode}" is available!
          </div>
        )}
        
        {/* Error display */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm mb-4 p-3 bg-red-500/10 rounded-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {error}
          </div>
        )}
        
        {/* Success display */}
        {success && (
          <div className="mb-4 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
            <div className="flex items-center gap-2 text-green-400 text-sm mb-3">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>
                {success.message}
                {success.txHash && (
                  <>
                    {' '}Tx:{' '}
                    <a
                      href={getTxScannerUrl(success.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono hover:text-green-300 underline underline-offset-2"
                    >
                      {formatAddress(success.txHash, 8)}
                    </a>
                  </>
                )}
              </span>
            </div>
            {success.registeredCode && (
              <div>
                <p className="text-xs text-gray-400 mb-2">Share your referral link:</p>
                <CopyReferralLink code={success.registeredCode} />
              </div>
            )}
          </div>
        )}
        
        {/* Not connected warning */}
        {!connected && (
          <div className="flex items-center justify-center gap-2 text-amber-400 text-sm mb-4 p-3 bg-amber-500/10 rounded-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Connect your wallet to register a code
          </div>
        )}
        
        {/* Insufficient USTR warning */}
        {connected && !hasEnoughUstr && (
          <div className="flex items-center justify-center gap-2 text-red-400 text-sm mb-4 p-3 bg-red-500/10 rounded-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Insufficient USTR. You need {REFERRAL_CODE.registrationFeeDisplay} USTR to register a code.
          </div>
        )}
        
        {/* Confirmation Dialog */}
        {showConfirmation && (
          <div className="mb-4 p-4 bg-surface-800 border border-amber-500/30 rounded-xl">
            <p className="text-sm text-gray-300 mb-3">
              Are you sure you want to register <strong className="text-white">"{clientValidation.normalizedCode}"</strong>?
            </p>
            <p className="text-xs text-amber-400 mb-4">
              This action is irreversible and will burn {REFERRAL_CODE.registrationFeeDisplay} USTR.
            </p>
            <div className="flex gap-3">
              <Button
                variant="primary"
                size="md"
                className="flex-1"
                loading={isRegistering}
                onClick={handleRegister}
              >
                Confirm Registration
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShowConfirmation(false)}
                disabled={isRegistering}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        
        {/* Action Buttons */}
        {!showConfirmation && (
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              disabled={!canValidate}
              loading={isValidating}
              onClick={handleValidate}
            >
              Check Availability
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={() => {
                // Show helpful message if conditions aren't met
                if (!connected) {
                  setError('Please connect your wallet first.');
                } else if (!clientValidation.isValid) {
                  setError('Please enter a valid referral code.');
                } else if (!validationState) {
                  setError('Please check availability first before registering.');
                } else if (validationState.is_registered) {
                  setError('This code is already registered. Please choose a different code.');
                } else if (!hasEnoughUstr) {
                  setError(`Insufficient USTR. You need ${REFERRAL_CODE.registrationFeeDisplay} USTR to register a code.`);
                } else {
                  setError(null);
                  setShowConfirmation(true);
                }
              }}
            >
              Register ({REFERRAL_CODE.registrationFeeDisplay} USTR)
            </Button>
          </div>
        )}
        
        {/* Fee info */}
        <p className="text-xs text-gray-500 text-center mt-4">
          Registration fee: {REFERRAL_CODE.registrationFeeDisplay} USTR (burned) • Max {REFERRAL_CODE.maxCodesPerOwner} codes per wallet
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================
// Lookup Code Section
// ============================================

function LookupCodeSection() {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CodeInfo | null>(null);
  const [rewards, setRewards] = useState<string>('0');
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, REFERRAL_CODE.maxLength);
    setCode(value);
    setResult(null);
    setRewards('0');
    setNotFound(false);
    setError(null);
  };
  
  const handleLookup = useCallback(async () => {
    if (!code.trim()) return;
    
    setIsLoading(true);
    setError(null);
    setResult(null);
    setRewards('0');
    setNotFound(false);
    
    try {
      const codeInfo = await contractService.getCodeInfo(code.toLowerCase());
      if (codeInfo) {
        setResult(codeInfo);
        // Fetch rewards from leaderboard
        const codeRewards = await getCodeRewards(code.toLowerCase());
        setRewards(codeRewards);
      } else {
        setNotFound(true);
      }
    } catch (err) {
      setError('Failed to lookup code. Please try again.');
      console.error('Lookup error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [code]);
  
  return (
    <Card className="w-full">
      <CardHeader>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-surface-700 border border-white/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          Lookup Code
        </h2>
        <p className="text-sm text-gray-400 mt-1 ml-10">
          Find the owner of a referral code
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 mb-4">
          <div className="flex-1 relative">
            <input
              type="text"
              value={code}
              onChange={handleInputChange}
              placeholder="Enter referral code"
              className="w-full px-4 py-3 bg-surface-800 border border-white/10 rounded-xl text-white font-mono focus:outline-none focus:border-amber-500/50 placeholder:text-gray-600"
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
            />
          </div>
          <Button
            variant="secondary"
            size="md"
            disabled={!code.trim() || isLoading}
            loading={isLoading}
            onClick={handleLookup}
          >
            Lookup
          </Button>
        </div>
        
        {/* Result */}
        {result && (
          <div className="p-4 bg-surface-800/50 border border-white/5 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">Code</p>
                <p className="text-lg font-mono font-semibold text-white">{result.code}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-1">Owner</p>
                <a
                  href={getAddressScannerUrl(result.owner)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-mono text-amber-400 hover:text-amber-300 underline underline-offset-2"
                >
                  {formatAddress(result.owner, 10)}
                </a>
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-t border-white/5">
              <div>
                <p className="text-xs text-gray-500 mb-1">Rewards Earned</p>
                <p className="text-lg font-mono font-semibold text-green-400">{formatUstrAmount(rewards)} USTR</p>
              </div>
            </div>
            <div className="pt-3 border-t border-white/5">
              <p className="text-xs text-gray-500 mb-2">Referral Link</p>
              <CopyReferralLink code={result.code} />
            </div>
          </div>
        )}
        
        {/* Not found */}
        {notFound && (
          <div className="flex items-center gap-2 text-gray-400 text-sm p-3 bg-surface-800/50 rounded-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Code "{code.toLowerCase()}" is not registered
          </div>
        )}
        
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm p-3 bg-red-500/10 rounded-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Lookup by Owner Section
// ============================================

interface CodeWithRewards {
  code: string;
  rewards: string;
}

function LookupByOwnerSection() {
  const { address: connectedAddress } = useWallet();
  const [owner, setOwner] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CodeWithRewards[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Auto-fill with connected wallet address
  useEffect(() => {
    if (connectedAddress && !owner) {
      setOwner(connectedAddress);
    }
  }, [connectedAddress, owner]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOwner(e.target.value);
    setResult(null);
    setError(null);
  };
  
  const handleLookup = useCallback(async (addressToLookup: string) => {
    if (!addressToLookup.trim()) return;
    
    setIsLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const codesResponse = await contractService.getCodesByOwner(addressToLookup.trim());
      
      if (codesResponse.codes.length > 0) {
        // Fetch rewards for all codes
        const rewardsMap = await getCodesRewards(codesResponse.codes);
        
        // Build result with rewards
        const codesWithRewards: CodeWithRewards[] = codesResponse.codes.map(code => ({
          code,
          rewards: rewardsMap.get(code.toLowerCase()) || '0',
        }));
        
        setResult(codesWithRewards);
      } else {
        setResult([]);
      }
    } catch (err) {
      setError('Failed to lookup codes. Please try again.');
      console.error('Lookup error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  const handleLookupMine = useCallback(() => {
    if (connectedAddress) {
      setOwner(connectedAddress);
      handleLookup(connectedAddress);
    }
  }, [connectedAddress, handleLookup]);
  
  return (
    <Card className="w-full">
      <CardHeader>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-surface-700 border border-white/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </span>
          Codes by Owner
        </h2>
        <p className="text-sm text-gray-400 mt-1 ml-10">
          View all codes registered by an address
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 mb-4">
          <div className="flex-1 relative">
            <input
              type="text"
              value={owner}
              onChange={handleInputChange}
              placeholder="Enter wallet address (terra1...)"
              className="w-full px-4 py-3 bg-surface-800 border border-white/10 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-amber-500/50 placeholder:text-gray-600"
              onKeyDown={(e) => e.key === 'Enter' && handleLookup(owner)}
            />
          </div>
          <Button
            variant="secondary"
            size="md"
            disabled={!owner.trim() || isLoading}
            loading={isLoading}
            onClick={() => handleLookup(owner)}
          >
            Lookup
          </Button>
        </div>
        
        {/* My Codes button */}
        {connectedAddress && (
          <button
            onClick={handleLookupMine}
            className="text-sm text-amber-400 hover:text-amber-300 transition-colors mb-4"
          >
            View my registered codes
          </button>
        )}
        
        {/* Result */}
        {result && (
          <div className="p-4 bg-surface-800/50 border border-white/5 rounded-xl">
            {result.length > 0 ? (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  {result.length} code{result.length !== 1 ? 's' : ''} registered
                </p>
                <div className="space-y-3">
                  {result.map(({ code, rewards }) => (
                    <div key={code} className="p-3 bg-surface-700/50 border border-white/5 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center">
                            <svg className="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                          </span>
                          <span className="text-sm font-semibold text-white font-mono">{code}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">Rewards</p>
                          <p className="text-sm font-mono font-semibold text-green-400">{formatUstrAmount(rewards)} USTR</p>
                        </div>
                      </div>
                      <CopyReferralLink code={code} />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-gray-400 text-sm">No codes registered by this address</p>
            )}
          </div>
        )}
        
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm p-3 bg-red-500/10 rounded-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Contract Info Section
// ============================================

function ContractInfoSection() {
  const contractAddress = CONTRACTS[DEFAULT_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'].referral;
  
  return (
    <div className="mt-8 text-center">
      <p className="text-xs text-gray-500">
        Contract:{' '}
        <a
          href={getAddressScannerUrl(contractAddress)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-amber-400/70 hover:text-amber-400 transition-colors"
        >
          {formatAddress(contractAddress || 'Not deployed', 12)}
        </a>
      </p>
    </div>
  );
}

// ============================================
// Main Page Component
// ============================================

export function ReferralPage() {
  return (
    <div className="min-h-screen py-8 px-4 relative">
      <CharacterParticles />
      <div className="max-w-4xl mx-auto relative z-10">
        {/* Page Header */}
        <div className="text-center mb-10 animate-fade-in-up">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Referral Program
          </h1>
          <p className="text-gray-400 max-w-lg mx-auto">
            Register unique referral codes to earn bonus USTR when others use your code during swaps.
          </p>
        </div>
        
        {/* Main Content */}
        <div className="space-y-6 animate-fade-in-up stagger-1">
          {/* Register Section */}
          <RegisterCodeSection />
          
          {/* Leaderboard Section */}
          <Leaderboard />
          
          {/* Lookup Sections */}
          <div className="grid md:grid-cols-2 gap-6">
            <LookupCodeSection />
            <LookupByOwnerSection />
          </div>
        </div>
        
        {/* Contract Info */}
        <ContractInfoSection />
      </div>
    </div>
  );
}
