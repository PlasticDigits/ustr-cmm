/**
 * TokenIcon Component
 *
 * Displays a token icon from /assets/tokens/{SYMBOL}.png
 * Falls back to showing the first letter of the symbol if image fails to load.
 * LP rows can pass pairSymbols to stack both tokens in the same box as a single icon.
 */

import { useState } from 'react';

interface TokenIconProps {
  symbol: string;
  /** Overlapping pair logos (same outer size as a single icon). */
  pairSymbols?: [string, string];
  size?: 'sm' | 'md' | 'lg';
  gradient?: string;
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
};

const pairGlyphClasses = {
  sm: 'w-[22px] h-[22px]',
  md: 'w-7 h-7',
  lg: 'w-[34px] h-[34px]',
};

const textSizes = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

function TokenGlyph({
  symbol,
  gradient,
  className,
  textSize,
}: {
  symbol: string;
  gradient?: string;
  className: string;
  textSize: string;
}) {
  const [imageError, setImageError] = useState(false);
  const imagePath = `/assets/tokens/${symbol.toUpperCase()}.png`;

  if (imageError) {
    return (
      <div
        className={`bg-gradient-to-br ${gradient || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white font-bold ${textSize} ${className}`}
      >
        {symbol.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <div className={className}>
      <img
        src={imagePath}
        alt={symbol}
        className="w-full h-full object-cover"
        onError={() => setImageError(true)}
      />
    </div>
  );
}

export function TokenIcon({
  symbol,
  pairSymbols,
  size = 'md',
  gradient,
  className = '',
}: TokenIconProps) {
  const sizeClass = sizeClasses[size];
  const textSize = textSizes[size];

  if (pairSymbols?.[0] && pairSymbols[1]) {
    const glyphClass = `${pairGlyphClasses[size]} rounded-full overflow-hidden shadow-lg ring-2 ring-black/70`;
    return (
      <div
        className={`relative ${sizeClass} ${className}`}
        title={`${pairSymbols[0]}/${pairSymbols[1]}`}
      >
        <TokenGlyph
          symbol={pairSymbols[0]}
          gradient={gradient}
          textSize="text-[10px]"
          className={`absolute left-0 top-1/2 -translate-y-1/2 z-[1] ${glyphClass}`}
        />
        <TokenGlyph
          symbol={pairSymbols[1]}
          gradient={gradient}
          textSize="text-[10px]"
          className={`absolute right-0 top-1/2 -translate-y-1/2 ${glyphClass}`}
        />
      </div>
    );
  }

  return (
    <TokenGlyph
      symbol={symbol}
      gradient={gradient}
      textSize={textSize}
      className={`${sizeClass} rounded-xl overflow-hidden shadow-lg ${className}`}
    />
  );
}
