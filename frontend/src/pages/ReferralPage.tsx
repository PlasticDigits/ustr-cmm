/**
 * Referral Page
 * 
 * Manage referral codes:
 * - Register new codes (10 USTR fee, burned)
 * - Look up code info by code
 * - Look up codes by owner address
 */

import { useState, useCallback, useMemo } from 'react';
import { useWallet } from '../hooks/useWallet';
import { contractService } from '../services/contract';
import { Card, CardContent, CardHeader } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { formatAddress } from '../utils/format';
import { REFERRAL_CODE, CONTRACTS, DEFAULT_NETWORK } from '../utils/constants';
import type { CodeInfo, CodesResponse, ValidateResponse } from '../types/contracts';

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
  const [success, setSuccess] = useState<string | null>(null);
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
    
    try {
      const txHash = await contractService.registerReferralCode(address, clientValidation.normalizedCode);
      setSuccess(`Code "${clientValidation.normalizedCode}" registered successfully! Tx: ${formatAddress(txHash, 8)}`);
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
  const canRegister = connected && clientValidation.isValid && validationState?.is_valid_format && !validationState?.is_registered && hasEnoughUstr;
  
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
              The {REFERRAL_CODE.registrationFeeDisplay} USTR fee is burned. Choose your code carefully!
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
          <div className="flex items-center gap-2 text-green-400 text-sm mb-4 p-3 bg-green-500/10 rounded-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {success}
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
              disabled={!canRegister}
              onClick={() => setShowConfirmation(true)}
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
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, REFERRAL_CODE.maxLength);
    setCode(value);
    setResult(null);
    setNotFound(false);
    setError(null);
  };
  
  const handleLookup = useCallback(async () => {
    if (!code.trim()) return;
    
    setIsLoading(true);
    setError(null);
    setResult(null);
    setNotFound(false);
    
    try {
      const codeInfo = await contractService.getCodeInfo(code.toLowerCase());
      if (codeInfo) {
        setResult(codeInfo);
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
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-1">Code</p>
                <p className="text-lg font-mono font-semibold text-white">{result.code}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-1">Owner</p>
                <p className="text-sm font-mono text-amber-400">{formatAddress(result.owner, 10)}</p>
              </div>
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

function LookupByOwnerSection() {
  const { address: connectedAddress } = useWallet();
  const [owner, setOwner] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CodesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
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
      const codes = await contractService.getCodesByOwner(addressToLookup.trim());
      setResult(codes);
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
            {result.codes.length > 0 ? (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  {result.codes.length} code{result.codes.length !== 1 ? 's' : ''} registered
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.codes.map((code) => (
                    <span
                      key={code}
                      className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm font-mono text-amber-400"
                    >
                      {code}
                    </span>
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
          href={`https://finder.terra.money/classic/address/${contractAddress}`}
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
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
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
