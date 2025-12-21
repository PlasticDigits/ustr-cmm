/**
 * RateChart Component
 * 
 * Visualizes the rate progression over the 100-day swap period.
 */

import { useMemo } from 'react';
import { Card, CardHeader, CardContent } from '../common/Card';
import { SWAP_CONFIG } from '../../utils/constants';

interface RateChartProps {
  currentDay?: number;
}

export function RateChart({ currentDay = 0 }: RateChartProps) {
  // Generate rate data points
  const dataPoints = useMemo(() => {
    const points = [];
    for (let day = 0; day <= 100; day += 10) {
      const rate = SWAP_CONFIG.startRate + 
        ((SWAP_CONFIG.endRate - SWAP_CONFIG.startRate) * day / SWAP_CONFIG.durationDays);
      points.push({ day, rate });
    }
    return points;
  }, []);

  // Calculate current rate position
  const currentRate = SWAP_CONFIG.startRate + 
    ((SWAP_CONFIG.endRate - SWAP_CONFIG.startRate) * Math.min(currentDay, 100) / SWAP_CONFIG.durationDays);
  
  const progressPercent = Math.min((currentDay / SWAP_CONFIG.durationDays) * 100, 100);

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold text-white">Rate Progression</h3>
        <p className="text-sm text-gray-400">USTC per USTR over 100 days</p>
      </CardHeader>
      <CardContent>
        {/* Simple visualization */}
        <div className="relative h-40 mb-4">
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between text-xs text-gray-500">
            <span>2.5</span>
            <span>2.0</span>
            <span>1.5</span>
          </div>

          {/* Chart area */}
          <div className="ml-14 h-full relative">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-amber-500/10 to-transparent rounded-lg" />
            
            {/* Progress line */}
            <div 
              className="absolute bottom-0 left-0 h-0.5 bg-amber-500 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />

            {/* Current position marker */}
            <div 
              className="absolute w-3 h-3 bg-amber-500 rounded-full transform -translate-x-1/2 transition-all duration-500"
              style={{ 
                left: `${progressPercent}%`,
                bottom: `${((currentRate - 1.5) / 1) * 100}%`
              }}
            />

            {/* Rate line (simplified) */}
            <svg className="absolute inset-0 w-full h-full">
              <line
                x1="0%"
                y1="100%"
                x2="100%"
                y2="0%"
                stroke="#6b7280"
                strokeWidth="2"
                strokeDasharray="4 4"
              />
            </svg>
          </div>
        </div>

        {/* X-axis labels */}
        <div className="ml-14 flex justify-between text-xs text-gray-500">
          <span>Day 0</span>
          <span>Day 25</span>
          <span>Day 50</span>
          <span>Day 75</span>
          <span>Day 100</span>
        </div>

        {/* Current stats */}
        <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-gray-700">
          <div className="text-center">
            <p className="text-xs text-gray-500">Current Day</p>
            <p className="text-lg font-semibold text-white">{Math.floor(currentDay)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">Current Rate</p>
            <p className="text-lg font-semibold text-amber-500">{currentRate.toFixed(4)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">End Rate</p>
            <p className="text-lg font-semibold text-gray-400">{SWAP_CONFIG.endRate}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

