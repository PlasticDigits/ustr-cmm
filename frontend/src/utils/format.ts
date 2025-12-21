/**
 * Formatting utilities for USTR CMM
 */

import { DECIMALS } from './constants';

/**
 * Format a micro-denominated amount to human-readable
 */
export function formatAmount(
  microAmount: string | number,
  decimals: number = DECIMALS.USTC
): string {
  const amount = typeof microAmount === 'string' 
    ? parseFloat(microAmount) 
    : microAmount;
  
  const formatted = amount / Math.pow(10, decimals);
  
  return formatted.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}

/**
 * Parse a human-readable amount to micro-denominated
 */
export function parseAmount(
  humanAmount: string | number,
  decimals: number = DECIMALS.USTC
): string {
  const amount = typeof humanAmount === 'string' 
    ? parseFloat(humanAmount) 
    : humanAmount;
  
  return Math.floor(amount * Math.pow(10, decimals)).toString();
}

/**
 * Format an exchange rate
 */
export function formatRate(rate: string | number): string {
  const rateNum = typeof rate === 'string' ? parseFloat(rate) : rate;
  return rateNum.toFixed(4);
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
 * Format a timestamp to locale string
 */
export function formatTimestamp(timestamp: number | string): string {
  const ts = typeof timestamp === 'string' ? parseInt(timestamp) : timestamp;
  // Convert nanoseconds to milliseconds if needed
  const ms = ts > 1e15 ? ts / 1e6 : ts * 1000;
  return new Date(ms).toLocaleString();
}

