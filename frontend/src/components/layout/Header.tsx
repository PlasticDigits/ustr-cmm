/**
 * Header Component
 * 
 * Main navigation header with logo and wallet connection.
 */

import { WalletButton } from '../common/WalletButton';

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-700/50 bg-gray-900/80 backdrop-blur-xl">
      <nav className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <span className="text-white font-bold text-lg">U</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                USTR <span className="text-amber-500">CMM</span>
              </h1>
              <p className="text-[10px] text-gray-500 -mt-1">Collateralized Unstablecoin</p>
            </div>
          </a>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-8">
            <NavLink href="/" active>Swap</NavLink>
            <NavLink href="/dashboard">Dashboard</NavLink>
            <NavLink href="/treasury">Treasury</NavLink>
            <NavLink href="/airdrop">Airdrop</NavLink>
          </div>

          {/* Wallet */}
          <WalletButton />
        </div>
      </nav>
    </header>
  );
}

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  active?: boolean;
}

function NavLink({ href, children, active }: NavLinkProps) {
  return (
    <a
      href={href}
      className={`text-sm font-medium transition-colors ${
        active 
          ? 'text-amber-500' 
          : 'text-gray-400 hover:text-white'
      }`}
    >
      {children}
    </a>
  );
}

