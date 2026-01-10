/**
 * Header Component
 * 
 * Main navigation header with:
 * - Logo and branding
 * - Desktop navigation
 * - Mobile hamburger menu
 * - Wallet connection
 */

import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { WalletButton } from '../common/WalletButton';

export function Header() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinks = [
    { to: '/', label: 'Swap' },
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/treasury', label: 'Treasury' },
    { to: '/referral', label: 'Referral' },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-surface-900/80 backdrop-blur-xl">
      <nav className="container mx-auto px-4 py-3 md:py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
              <img 
                src="/assets/ustr-light.png" 
                alt="USTR Logo" 
                className="relative w-9 h-9 md:w-10 md:h-10 object-contain"
              />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-white tracking-tight">
                USTR <span className="text-amber-500">CMM</span>
              </h1>
              <p className="text-[9px] md:text-[10px] text-gray-500 -mt-0.5 hidden sm:block">Collateralized Unstablecoin</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <NavLink 
                key={link.to}
                to={link.to} 
                isActive={location.pathname === link.to}
              >
                {link.label}
              </NavLink>
            ))}
          </div>

          {/* Right side: Wallet + Mobile Menu Button */}
          <div className="flex items-center gap-2">
            <WalletButton />
            
            {/* Mobile menu button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        <div className={`
          md:hidden overflow-hidden transition-all duration-300 ease-in-out
          ${isMobileMenuOpen ? 'max-h-64 opacity-100 mt-4' : 'max-h-0 opacity-0'}
        `}>
          <div className="flex flex-col gap-1 py-2 border-t border-white/5">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`
                  px-4 py-3 rounded-xl text-sm font-medium transition-all
                  ${location.pathname === link.to 
                    ? 'bg-amber-500/10 text-amber-400' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }
                `}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </header>
  );
}

interface NavLinkProps {
  to: string;
  children: React.ReactNode;
  isActive?: boolean;
}

function NavLink({ to, children, isActive }: NavLinkProps) {
  return (
    <Link
      to={to}
      className={`
        relative px-4 py-2 rounded-lg text-sm font-medium transition-all
        ${isActive 
          ? 'text-amber-400' 
          : 'text-gray-400 hover:text-white'
        }
      `}
    >
      {isActive && (
        <div className="absolute inset-0 bg-amber-500/10 rounded-lg" />
      )}
      <span className="relative">{children}</span>
    </Link>
  );
}
