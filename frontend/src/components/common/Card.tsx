/**
 * Card Component
 * 
 * Reusable card container with:
 * - Multiple variants (default, highlight, glass)
 * - Gradient borders
 * - Hover animations
 */

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'highlight' | 'glass';
  hover?: boolean;
}

export function Card({ children, className = '', variant = 'default', hover = false }: CardProps) {
  const baseStyles = 'rounded-2xl transition-all duration-300';
  
  const variants = {
    default: 'glass border border-white/5',
    highlight: 'relative bg-gradient-to-br from-amber-500/10 via-surface-800/90 to-orange-500/10 border border-amber-500/20',
    glass: 'glass border border-white/5',
  };

  const hoverStyles = hover 
    ? 'hover:border-amber-500/30 hover:shadow-lg hover:shadow-amber-500/5 hover:-translate-y-0.5' 
    : '';

  return (
    <div className={`${baseStyles} ${variants[variant]} ${hoverStyles} ${className}`}>
      {variant === 'highlight' && (
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-500/5 rounded-2xl pointer-events-none" />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`px-5 md:px-6 py-4 border-b border-white/5 ${className}`}>
      {children}
    </div>
  );
}

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function CardContent({ children, className = '' }: CardContentProps) {
  return (
    <div className={`p-5 md:p-6 ${className}`}>
      {children}
    </div>
  );
}
