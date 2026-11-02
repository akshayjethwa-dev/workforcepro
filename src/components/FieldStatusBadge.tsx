// src/components/FieldStatusBadge.tsx
import React from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  Umbrella, 
  Timer,
  HelpCircle 
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export type PunchStatusType = 
  | 'PRESENT' 
  | 'HALF_DAY' 
  | 'ABSENT' 
  | 'LATE' 
  | 'ON_LEAVE' 
  | 'PENDING' 
  | 'OVERTIME'
  | string;

interface Props {
  status: PunchStatusType;
  isLate?: boolean;
  lateMinutes?: number;
  customLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Whether to render as an inline tag or larger standalone badge */
  isCriticalMetric?: boolean;
}

export const FieldStatusBadge: React.FC<Props> = ({
  status,
  isLate = false,
  lateMinutes,
  customLabel,
  size = 'md',
  className = '',
  isCriticalMetric = false,
}) => {
  const { isFieldMode } = useTheme();

  const normalizedStatus = String(status || '').toUpperCase();

  // Determine Icon, explicit text label, and high-contrast styles
  let IconComponent = HelpCircle;
  let labelText = customLabel || 'Unknown';
  let defaultStyle = 'bg-slate-100 text-slate-900 border-slate-300';
  let fieldModeStyle = 'bg-white text-black border-2 border-black font-black';

  if (normalizedStatus === 'PRESENT') {
    IconComponent = CheckCircle2;
    labelText = customLabel || (isFieldMode ? 'PRESENT [FULL DAY]' : 'Present');
    defaultStyle = 'bg-emerald-50 text-emerald-900 border-emerald-300';
    fieldModeStyle = 'bg-[#f0fdf4] text-[#14532d] border-2 border-[#166534] font-black'; // 10.3:1 contrast
  } else if (normalizedStatus === 'HALF_DAY') {
    IconComponent = Clock;
    labelText = customLabel || (isFieldMode ? 'HALF DAY [4H+]' : 'Half Day');
    defaultStyle = 'bg-amber-50 text-amber-950 border-amber-300';
    fieldModeStyle = 'bg-[#fefce8] text-[#713f12] border-2 border-[#854d0e] font-black'; // 9.6:1 contrast
  } else if (normalizedStatus === 'ABSENT') {
    IconComponent = XCircle;
    labelText = customLabel || (isFieldMode ? 'ABSENT [NOT IN]' : 'Absent');
    defaultStyle = 'bg-rose-50 text-rose-950 border-rose-300';
    fieldModeStyle = 'bg-[#fef2f2] text-[#7f1d1d] border-2 border-[#991b1b] font-black'; // 10.8:1 contrast
  } else if (normalizedStatus === 'ON_LEAVE' || normalizedStatus === 'LEAVE') {
    IconComponent = Umbrella;
    labelText = customLabel || (isFieldMode ? 'ON LEAVE [AUTHORIZED]' : 'On Leave');
    defaultStyle = 'bg-purple-50 text-purple-950 border-purple-300';
    fieldModeStyle = 'bg-[#faf5ff] text-[#581c87] border-2 border-[#6b21a8] font-black'; // 11.2:1 contrast
  } else if (normalizedStatus === 'PENDING' || normalizedStatus === 'IN_PROGRESS' || normalizedStatus === 'ACTIVE') {
    IconComponent = Timer;
    labelText = customLabel || (isFieldMode ? 'ON SHIFT [ACTIVE]' : 'On Shift');
    defaultStyle = 'bg-blue-50 text-blue-950 border-blue-300';
    fieldModeStyle = 'bg-[#eff6ff] text-[#1e3a8a] border-2 border-[#1e40af] font-black'; // 10.5:1 contrast
  }

  // Handle secondary Late badge overlay or primary late status
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 20 : 16;
  const paddingClass = size === 'sm' 
    ? 'px-2 py-0.5 text-xs' 
    : size === 'lg' 
      ? 'px-3.5 py-1.5 text-base' 
      : 'px-2.5 py-1 text-xs';

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      {/* Primary Accessible Status (Always Icon + Explicit Text) */}
      <span
        role="status"
        aria-label={`Status: ${labelText}`}
        className={`inline-flex items-center gap-1.5 rounded-lg border font-bold tracking-tight transition-all ${paddingClass} ${
          isFieldMode ? fieldModeStyle : defaultStyle
        } ${isCriticalMetric ? (isFieldMode ? 'text-lg font-black' : 'font-extrabold') : ''} ${className}`}
      >
        <IconComponent 
          size={iconSize} 
          aria-hidden="true" 
          className="shrink-0"
          strokeWidth={isFieldMode ? 2.5 : 2}
        />
        <span>{labelText}</span>
      </span>

      {/* Explicit Late Arrival Badge (Never colour alone) */}
      {isLate && (
        <span
          role="status"
          aria-label={lateMinutes ? `Late arrival by ${lateMinutes} minutes` : 'Late arrival'}
          className={`inline-flex items-center gap-1 rounded-lg border font-bold transition-all ${paddingClass} ${
            isFieldMode 
              ? 'bg-[#fefce8] text-[#713f12] border-2 border-[#854d0e] font-black'
              : 'bg-amber-100 text-amber-950 border-amber-300'
          }`}
        >
          <AlertTriangle size={iconSize - 2} aria-hidden="true" className="shrink-0" />
          <span>{lateMinutes ? `LATE (+${lateMinutes}m)` : 'LATE'}</span>
        </span>
      )}
    </div>
  );
};
