/**
 * Under Construction Component
 * 
 * Displays an "under construction" message for pages that are not yet available.
 */

import { Link } from 'react-router-dom';

interface UnderConstructionProps {
  title?: string;
  description?: string;
}

export function UnderConstruction({ 
  title = "Under Construction",
  description = "This page is currently under development. Please check back soon!"
}: UnderConstructionProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="max-w-2xl mx-auto">
        {/* Icon/Illustration */}
        <div className="mb-8">
          <div className="relative inline-block">
            <div className="absolute -inset-2 bg-gradient-to-r from-[#222e31]/30 via-[#222e31]/10 to-[#222e31]/30 rounded-full blur-xl opacity-60 animate-pulse" />
            <div className="relative bg-gradient-to-br from-[#222e31]/90 to-[#222e31]/70 backdrop-blur-sm border border-[#222e31]/60 rounded-full p-8 md:p-12">
              <img 
                src="/assets/icons/gears.png" 
                alt="Construction"
                className="w-16 h-16 md:w-20 md:h-20 object-contain opacity-80"
              />
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          {title}
        </h1>

        {/* Description */}
        <p className="text-gray-300 text-lg md:text-xl mb-8 max-w-md mx-auto">
          {description}
        </p>

        {/* Back to Home Button */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
        >
          <span>←</span>
          <span>Back to Swap</span>
        </Link>
      </div>
    </div>
  );
}
