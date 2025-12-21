/**
 * Card Component
 * 
 * Reusable card container with consistent styling.
 */

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'highlight' | 'glass';
}

export function Card({ children, className = '', variant = 'default' }: CardProps) {
  const variants = {
    default: 'bg-gray-800/50 border-gray-700/50',
    highlight: 'bg-gradient-to-br from-amber-900/20 to-orange-900/20 border-amber-700/30',
    glass: 'bg-gray-800/30 backdrop-blur-lg border-gray-700/30',
  };

  return (
    <div className={`rounded-2xl border ${variants[variant]} ${className}`}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`px-6 py-4 border-b border-gray-700/50 ${className}`}>
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
    <div className={`p-6 ${className}`}>
      {children}
    </div>
  );
}

