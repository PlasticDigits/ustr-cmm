/**
 * Formatting utilities for USTR CMM
 */

import { NETWORKS, DEFAULT_NETWORK } from './constants';

/**
 * Format a micro-denominated amount to human-readable
 * @param microAmount The amount in micro units (accepts string, number, or bigint)
 * @param decimals The number of decimal places for conversion (default: 6 for native tokens)
 * @param displayDecimals Optional max decimal places for display (default: same as decimals)
 */
export function formatAmount(
  microAmount: string | number | bigint,
  decimals: number = 6,
  displayDecimals?: number
): string {
  let amount: number;
  
  if (typeof microAmount === 'bigint') {
    // For bigint, convert to string first to preserve precision
    const divisor = BigInt(10 ** decimals);
    const wholePart = microAmount / divisor;
    const fractionalPart = microAmount % divisor;
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    amount = parseFloat(`${wholePart}.${fractionalStr}`);
  } else if (typeof microAmount === 'string') {
    amount = parseFloat(microAmount) / Math.pow(10, decimals);
  } else {
    amount = microAmount / Math.pow(10, decimals);
  }
  
  const maxDecimals = displayDecimals ?? Math.min(decimals, 6);
  const minDecimals = Math.min(2, maxDecimals);
  
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  });
}

/**
 * Parse a human-readable amount to micro-denominated
 */
export function parseAmount(
  humanAmount: string | number,
  decimals: number = 6
): string {
  const amount = typeof humanAmount === 'string' 
    ? parseFloat(humanAmount) 
    : humanAmount;
  
  return Math.floor(amount * Math.pow(10, decimals)).toString();
}

/**
 * Format an exchange rate
 * @param rate The rate value
 * @param decimals Number of decimal places (default 4, use 8 for ticking display)
 */
export function formatRate(rate: string | number, decimals: number = 4): string {
  const rateNum = typeof rate === 'string' ? parseFloat(rate) : rate;
  return rateNum.toFixed(decimals);
}

/**
 * Format a duration in seconds to human-readable
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return 'Ended';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Format an address for display (truncated)
 */
export function formatAddress(address: string, chars: number = 8): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Format a percentage
 */
export function formatPercent(value: number, decimals: number = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * LP ownership of the pool. Tiny 18dp share amounts are not useful next to NAV.
 * Rounding contract (#21): `≥ 0.99995` → `100% of pool`. Do not widen that.
 */
export function formatPoolShare(share: number | null | undefined): string {
  if (share === null || share === undefined || !Number.isFinite(share) || share < 0) {
    return '—';
  }
  if (share >= 0.99995) return '100% of pool';
  if (share >= 0.01) return `${(share * 100).toFixed(2)}% of pool`;
  if (share > 0) return `${(share * 100).toFixed(4)}% of pool`;
  return '0% of pool';
}

/**
 * Format a timestamp to locale string
 */
export function formatTimestamp(timestamp: number | string): string {
  const ts = typeof timestamp === 'string' ? parseInt(timestamp) : timestamp;
  // Convert nanoseconds to milliseconds if needed
  const ms = ts > 1e15 ? ts / 1e6 : ts * 1000;
  return new Date(ms).toLocaleString();
}

/**
 * Get the scanner base URL for the current network
 */
export function getScannerUrl(): string {
  return NETWORKS[DEFAULT_NETWORK].scanner;
}

/**
 * Get the scanner URL for a wallet address
 */
export function getAddressScannerUrl(address: string): string {
  return `${getScannerUrl()}/address/${address}`;
}

/**
 * Get the scanner URL for a transaction hash
 */
export function getTxScannerUrl(txHash: string): string {
  return `${getScannerUrl()}/tx/${txHash}`;
}

