/**
 * Countdown Timer Component
 * 
 * Displays a countdown to the launch date: January 22, 2026 13:00:00 UTC
 * Features:
 * - Mobile-responsive grid layout
 * - Animated number transitions
 * - Glowing amber accents
 */

import { useEffect, useState, useRef } from 'react';
import { useLaunchStatus } from '../../hooks/useLaunchStatus';

const LAUNCH_DATE = new Date('2026-01-22T13:00:00Z');

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

function calculateTimeRemaining(): TimeRemaining {
  const now = new Date().getTime();
  const target = LAUNCH_DATE.getTime();
  const difference = target - now;

  if (difference <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
  }

  const days = Math.floor(difference / (1000 * 60 * 60 * 24));
  const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((difference % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, total: difference };
}

interface TimeUnitProps {
  value: number;
  label: string;
  prevValue: number;
}

function TimeUnit({ value, label, prevValue }: TimeUnitProps) {
  const [isFlipping, setIsFlipping] = useState(false);
  
  useEffect(() => {
    if (value !== prevValue) {
      setIsFlipping(true);
      const timer = setTimeout(() => setIsFlipping(false), 300);
      return () => clearTimeout(timer);
    }
  }, [value, prevValue]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative group">
        {/* Glow effect */}
        <div className="absolute -inset-2 bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-amber-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        
        {/* Main box */}
        <div className="relative overflow-hidden">
          {/* Background with gradient border effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 via-transparent to-orange-500/20 rounded-xl" />
          <div className="absolute inset-[1px] bg-gradient-to-br from-surface-800 via-surface-900 to-surface-800 rounded-xl" />
          
          {/* Number container */}
          <div className={`
            relative px-4 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5
            min-w-[60px] sm:min-w-[80px] md:min-w-[100px]
            transition-transform duration-300
            ${isFlipping ? 'scale-95' : 'scale-100'}
          `}>
            {/* Shine overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-transparent rounded-xl pointer-events-none" />
            
            {/* The number */}
            <div className={`
              font-mono-numbers text-3xl sm:text-4xl md:text-5xl lg:text-6xl 
              font-bold text-white text-center
              transition-all duration-200
              ${isFlipping ? 'text-amber-400 text-glow-amber' : ''}
            `}>
              {String(value).padStart(2, '0')}
            </div>
          </div>
        </div>
      </div>
      
      {/* Label */}
      <div className="mt-2 sm:mt-3 text-[10px] sm:text-xs md:text-sm font-semibold text-gray-400 uppercase tracking-[0.2em]">
        {label}
      </div>
    </div>
  );
}

function Separator() {
  return (
    <div className="hidden sm:flex flex-col justify-center gap-2 px-1 md:px-2 pb-6">
      <div className="w-2 h-2 rounded-full bg-amber-500/60 animate-pulse" />
      <div className="w-2 h-2 rounded-full bg-amber-500/60 animate-pulse" style={{ animationDelay: '0.5s' }} />
    </div>
  );
}

export function CountdownTimer() {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(calculateTimeRemaining);
  const prevTimeRef = useRef<TimeRemaining>(timeRemaining);
  const isLaunched = useLaunchStatus();

  useEffect(() => {
    if (isLaunched) return;

    const timer = setInterval(() => {
      prevTimeRef.current = timeRemaining;
      const remaining = calculateTimeRemaining();
      setTimeRemaining(remaining);
    }, 1000);

    return () => clearInterval(timer);
  }, [isLaunched, timeRemaining]);

  if (isLaunched) {
    return (
      <div className="w-full max-w-4xl mx-auto animate-scale-in">
        <div className="relative">
          {/* Glow */}
          <div className="absolute -inset-4 bg-gradient-to-r from-amber-500/30 via-orange-500/20 to-amber-500/30 rounded-3xl blur-2xl animate-pulse-glow" />
          
          {/* Card */}
          <div className="relative glass rounded-3xl p-8 md:p-12 text-center glow-amber-strong overflow-hidden">
            {/* Decorative gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-orange-500/10 pointer-events-none" />
            
            <div className="relative">
              <div className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-4 text-glow-amber">
                🚀 Launch Time!
              </div>
              <p className="text-gray-200 text-lg md:text-xl font-medium max-w-lg mx-auto">
                The swap is now live. Start swapping your USTC for USTR!
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto animate-fade-in-up">
      <div className="relative">
        {/* Ambient glow */}
        <div className="absolute -inset-4 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-amber-500/10 rounded-3xl blur-2xl" />
        
        {/* Main container */}
        <div className="relative glass rounded-3xl p-6 sm:p-8 md:p-10 lg:p-12 glow-amber overflow-hidden">
          {/* Decorative elements */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-500/5 pointer-events-none" />
          
          {/* Header */}
          <div className="relative text-center mb-6 sm:mb-8 md:mb-10">
            <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">
              Launch Countdown
            </h3>
            <div className="h-1 w-16 mx-auto bg-gradient-to-r from-amber-500 to-orange-500 rounded-full mb-3" />
            <p className="text-gray-400 text-sm sm:text-base md:text-lg">
              Swap opens <span className="text-amber-400 font-semibold">January 22, 2026</span> at <span className="text-amber-400 font-semibold">13:00 UTC</span>
            </p>
          </div>

          {/* Time units - Grid layout for mobile, flex for desktop */}
          <div className="relative grid grid-cols-4 gap-2 sm:gap-4 md:hidden">
            <TimeUnit value={timeRemaining.days} label="Days" prevValue={prevTimeRef.current.days} />
            <TimeUnit value={timeRemaining.hours} label="Hours" prevValue={prevTimeRef.current.hours} />
            <TimeUnit value={timeRemaining.minutes} label="Mins" prevValue={prevTimeRef.current.minutes} />
            <TimeUnit value={timeRemaining.seconds} label="Secs" prevValue={prevTimeRef.current.seconds} />
          </div>
          
          {/* Desktop layout with separators */}
          <div className="relative hidden md:flex justify-center items-start gap-2 lg:gap-4">
            <TimeUnit value={timeRemaining.days} label="Days" prevValue={prevTimeRef.current.days} />
            <Separator />
            <TimeUnit value={timeRemaining.hours} label="Hours" prevValue={prevTimeRef.current.hours} />
            <Separator />
            <TimeUnit value={timeRemaining.minutes} label="Minutes" prevValue={prevTimeRef.current.minutes} />
            <Separator />
            <TimeUnit value={timeRemaining.seconds} label="Seconds" prevValue={prevTimeRef.current.seconds} />
          </div>
        </div>
      </div>
    </div>
  );
}
