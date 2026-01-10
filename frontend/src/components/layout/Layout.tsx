/**
 * Layout Component
 * 
 * Main application layout wrapper with:
 * - Animated gradient background
 * - Noise texture overlay
 * - Floating orb decorations
 */

import { Header } from './Header';
import { Footer } from './Footer';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col animated-gradient-bg noise-overlay relative">
      {/* Floating orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        {/* Top right orb */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl animate-pulse-glow" />
        
        {/* Bottom left orb */}
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '1s' }} />
        
        {/* Center subtle orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-3xl" />
      </div>
      
      {/* Radial gradient overlay for depth */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/10 via-transparent to-transparent -z-10" />
      
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-6 md:py-8 relative z-10">
        {children}
      </main>
      
      <Footer />
    </div>
  );
}
