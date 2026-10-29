// src/components/FrontlineWipeOverlay.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Droplets, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { FRONTLINE_TOUCH, triggerFrontlineHaptic } from '../utils/frontlineTouch';

interface Props {
  /** Optional callback fired when wipe mode engages or finishes */
  onLockChange?: (isLocked: boolean) => void;
  /** Positioning for the floating corner quick trigger button */
  corner?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  /** Show the visible floating corner button */
  showCornerTrigger?: boolean;
}

export const FrontlineWipeOverlay: React.FC<Props> = ({
  onLockChange,
  corner = 'top-right',
  showCornerTrigger = true,
}) => {
  const [isActive, setIsActive] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const timerRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const startWipeMode = () => {
    if (isActive) return;
    setIsActive(true);
    setRemainingMs(FRONTLINE_TOUCH.WIPE_LOCK_DURATION_MS);
    triggerFrontlineHaptic('wipe');
    onLockChange?.(true);

    const startTime = Date.now();
    const duration = FRONTLINE_TOUCH.WIPE_LOCK_DURATION_MS;

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const left = Math.max(0, duration - elapsed);
      setRemainingMs(left);
      if (left <= 0) {
        clearInterval(intervalRef.current);
      }
    }, 50);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsActive(false);
      triggerFrontlineHaptic('light');
      onLockChange?.(false);
      clearInterval(intervalRef.current);
    }, duration);
  };

  const cancelEarly = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsActive(false);
    onLockChange?.(false);
    triggerFrontlineHaptic('light');
  };

  // Corner-swipe gesture listener for wet screen clearing (detects swipe from top corners)
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const winW = window.innerWidth;
      // If touch starts within 80px of top-right or top-left corner
      const isTopRight = t.clientX > winW - 80 && t.clientY < 80;
      const isTopLeft = t.clientX < 80 && t.clientY < 80;

      if (isTopRight || isTopLeft) {
        touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
      } else {
        touchStartRef.current = null;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const elapsed = Date.now() - touchStartRef.current.time;

      // Diagonal swipe of at least 55px within 450ms from corner triggers wipe mode
      if (dist > 55 && elapsed < 450) {
        startWipeMode();
      }
      touchStartRef.current = null;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive]);

  const progressPercent = Math.min(100, Math.max(0, (remainingMs / FRONTLINE_TOUCH.WIPE_LOCK_DURATION_MS) * 100));
  const secondsLeft = (remainingMs / 1000).toFixed(1);

  const cornerClasses = {
    'top-right': 'top-3 right-3 sm:top-4 sm:right-4',
    'top-left': 'top-3 left-3 sm:top-4 sm:left-4',
    'bottom-right': 'bottom-24 right-3 sm:bottom-28 sm:right-4',
    'bottom-left': 'bottom-24 left-3 sm:bottom-28 sm:left-4',
  }[corner];

  return (
    <>
      {/* Floating Corner Trigger Button (>= 56x56px touch target) */}
      {showCornerTrigger && !isActive && (
        <button
          onClick={startWipeMode}
          type="button"
          aria-label="Activate Rain and Screen Wipe Mode"
          title="Rain / Screen Wipe Mode (Locks input for 2.8s to wipe moisture or gloves)"
          className={`fixed ${cornerClasses} z-40 min-h-[56px] min-w-[56px] px-3.5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-bold text-xs shadow-lg border-2 border-amber-300 flex items-center justify-center gap-2 transition-all cursor-pointer`}
        >
          <Droplets size={20} className="text-slate-950 animate-pulse" />
          <span className="hidden sm:inline font-sans uppercase tracking-wider text-[11px] font-black">
            Wipe Mode
          </span>
        </button>
      )}

      {/* Screen Wipe Lockout Overlay (Disables inputs for 2.8s, absorbing phantom touches) */}
      {isActive && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 select-none touch-none animate-in fade-in duration-150 cursor-wait"
          style={{ touchAction: 'none' }}
        >
          <div className="max-w-md w-full bg-slate-900 border-4 border-amber-400 rounded-3xl p-6 sm:p-8 text-center shadow-2xl text-white">
            <div className="w-20 h-20 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center mx-auto mb-5 shadow-lg animate-bounce">
              <Droplets size={40} />
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 text-xs font-mono font-bold uppercase tracking-wider mb-3 border border-amber-400/40">
              <ShieldAlert size={14} /> Screen Wipe Mode Active
            </div>

            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-2">
              Wipe Screen Now
            </h2>

            <p className="text-sm text-slate-300 mb-6 leading-relaxed">
              Touch input is temporarily locked. Clear water droplets, grease, or glove residue without triggering accidental punches.
            </p>

            {/* Countdown Bar */}
            <div className="w-full bg-slate-800 rounded-full h-4 overflow-hidden border border-slate-700 mb-4 p-0.5">
              <div
                className="bg-amber-400 h-full rounded-full transition-all duration-75"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-6">
              <span>Phantom Touch Protection</span>
              <span className="text-amber-400 font-bold text-sm">{secondsLeft}s remaining</span>
            </div>

            {/* Safety Manual Dismiss Button (min-h-[56px] for gloves) */}
            <button
              onClick={cancelEarly}
              type="button"
              className="w-full min-h-[56px] rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-98 text-white font-bold text-sm border border-slate-600 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 size={18} className="text-emerald-400" />
              <span>Resume Operations Early</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
