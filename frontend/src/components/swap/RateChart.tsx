/**
 * RateChart Component
 * 
 * Visualizes the rate progression over the 100-day swap period.
 * Features:
 * - Gradient area fill
 * - Animated progress indicator
 * - Glass morphism styling
 * - Ticking rate display (8 decimals)
 */

import { Card, CardHeader, CardContent } from '../common/Card';
import { SWAP_CONFIG } from '../../utils/constants';
import { formatRate } from '../../utils/format';

interface RateChartProps {
  /** Current day (0-100) for chart position */
  currentDay?: number;
  /** Ticking rate from useTickingRate hook (updates 20x/sec) */
  tickingRate?: number;
  /** Ticking elapsed seconds for day display */
  elapsedSeconds?: number;
}

export function RateChart({ currentDay = 0, tickingRate, elapsedSeconds }: RateChartProps) {
  // Use ticking values if provided, otherwise calculate from currentDay
  const effectiveDay = elapsedSeconds !== undefined 
    ? elapsedSeconds / (SWAP_CONFIG.durationSeconds / SWAP_CONFIG.durationDays)
    : currentDay;
  
  const effectiveRate = tickingRate ?? (SWAP_CONFIG.startRate + 
    ((SWAP_CONFIG.endRate - SWAP_CONFIG.startRate) * Math.min(effectiveDay, 100) / SWAP_CONFIG.durationDays));
  
  const progressPercent = Math.min((effectiveDay / SWAP_CONFIG.durationDays) * 100, 100);

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Rate Progression</h3>
            <p className="text-sm text-gray-400">USTC per USTR over 100 days</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Chart area */}
        <div className="relative h-44 mb-4">
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-0 w-10 flex flex-col justify-between text-xs font-mono-numbers text-gray-500">
            <span>2.50</span>
            <span>2.00</span>
            <span>1.50</span>
          </div>

          {/* Chart visualization */}
          <div className="ml-12 h-full relative rounded-lg">
            {/* Background grid */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              {[0, 1, 2].map((i) => (
                <div key={i} className="border-t border-white/5" />
              ))}
            </div>
            
            {/* Gradient area fill - under the line */}
            <div className="absolute inset-0">
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgb(245, 158, 11)" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="rgb(245, 158, 11)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* Area fill - triangle under the line from bottom-left to top-right */}
                <polygon
                  points="0,100 100,0 100,100"
                  fill="url(#areaGradient)"
                  className="opacity-50"
                />
              </svg>
            </div>
            
            {/* Rate line */}
            <svg className="absolute inset-0 w-full h-full">
              <defs>
                <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#ea580c" />
                </linearGradient>
              </defs>
              <line
                x1="0%"
                y1="100%"
                x2="100%"
                y2="0%"
                stroke="url(#lineGradient)"
                strokeWidth="2"
              />
              {/* Dashed future line */}
              <line
                x1={`${progressPercent}%`}
                y1={`${100 - progressPercent}%`}
                x2="100%"
                y2="0%"
                stroke="#6b7280"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            </svg>

            {/* Progress indicator - positioned with z-index to stay in front */}
            <div 
              className="absolute w-4 h-4 transform -translate-x-1/2 -translate-y-1/2 transition-all duration-500 z-10"
              style={{ 
                left: `${progressPercent}%`,
                top: `${100 - progressPercent}%`
              }}
            >
              {/* Pulse ring */}
              <div className="absolute inset-0 bg-amber-500 rounded-full animate-ping opacity-50" />
              {/* Core dot */}
              <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full shadow-lg shadow-amber-500/50" />
            </div>
          </div>
        </div>

        {/* X-axis labels */}
        <div className="ml-12 flex justify-between text-xs font-mono-numbers text-gray-500">
          <span>Day 0</span>
          <span>Day 25</span>
          <span>Day 50</span>
          <span>Day 75</span>
          <span>Day 100</span>
        </div>

        {/* Current stats */}
        <div className="grid grid-cols-3 gap-3 mt-6 pt-5 border-t border-white/5">
          <StatBox label="Current Day" value={Math.floor(effectiveDay).toString()} />
          <StatBox 
            label="Current Rate" 
            value={tickingRate !== undefined ? formatRate(effectiveRate, 8) : formatRate(effectiveRate, 4)} 
            highlight 
          />
          <StatBox label="End Rate" value={SWAP_CONFIG.endRate.toString()} />
        </div>
      </CardContent>
    </Card>
  );
}

interface StatBoxProps {
  label: string;
  value: string;
  highlight?: boolean;
}

function StatBox({ label, value, highlight }: StatBoxProps) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-mono-numbers font-semibold ${highlight ? 'text-amber-400' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}