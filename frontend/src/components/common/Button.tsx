/**
 * Button Component
 * 
 * Reusable button with:
 * - Multiple variants (primary, secondary, outline, ghost)
 * - Gradient backgrounds
 * - Loading state with spinner
 * - Hover animations
 */

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const baseStyles = `
    relative font-semibold rounded-xl transition-all duration-200
    disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
    active:scale-[0.98]
  `;

  const variants = {
    primary: `
      bg-gradient-to-r from-amber-500 to-orange-600 
      hover:from-amber-400 hover:to-orange-500 
      text-white shadow-lg shadow-amber-500/20
      hover:shadow-amber-500/30 hover:shadow-xl
    `,
    secondary: `
      bg-surface-700 hover:bg-surface-600 
      text-white border border-white/5
      hover:border-white/10
    `,
    outline: `
      bg-transparent border-2 border-amber-500/50 
      text-amber-400 
      hover:bg-amber-500/10 hover:border-amber-500
    `,
    ghost: `
      bg-transparent hover:bg-white/5 
      text-gray-300 hover:text-white
    `,
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  return (
    <button
      disabled={disabled || loading}
      className={`
        ${baseStyles}
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <LoadingSpinner />
          <span>{children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}

function LoadingSpinner() {
  return (
    <svg 
      className="animate-spin h-5 w-5" 
      xmlns="http://www.w3.org/2000/svg" 
      fill="none" 
      viewBox="0 0 24 24"
    >
      <circle 
        className="opacity-25" 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        strokeWidth="4"
      />
      <path 
        className="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
