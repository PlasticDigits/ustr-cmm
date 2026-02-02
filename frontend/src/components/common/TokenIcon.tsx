/**
 * TokenIcon Component
 * 
 * Displays a token icon from /assets/tokens/{SYMBOL}.png
 * Falls back to showing the first letter of the symbol if image fails to load.
 */

import { useState } from 'react';

interface TokenIconProps {
  symbol: string;
  size?: 'sm' | 'md' | 'lg';
  gradient?: string;
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
};

const textSizes = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

export function TokenIcon({ symbol, size = 'md', gradient, className = '' }: TokenIconProps) {
  const [imageError, setImageError] = useState(false);
  
  const sizeClass = sizeClasses[size];
  const textSize = textSizes[size];
  const imagePath = `/assets/tokens/${symbol.toUpperCase()}.png`;
  
  // If image failed to load, show fallback letter
  if (imageError) {
    return (
      <div 
        className={`${sizeClass} rounded-xl bg-gradient-to-br ${gradient || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white font-bold ${textSize} shadow-lg ${className}`}
      >
        {symbol.charAt(0).toUpperCase()}
      </div>
    );
  }
  
  return (
    <div className={`${sizeClass} rounded-xl overflow-hidden shadow-lg ${className}`}>
      <img
        src={imagePath}
        alt={symbol}
        className="w-full h-full object-cover"
        onError={() => setImageError(true)}
      />
    </div>
  );
}
