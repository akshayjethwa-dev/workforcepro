// src/components/SyncStatusBadge.tsx
import React from 'react';
import { 
  HardDrive, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  GitMerge, 
  Clock, 
  AlertCircle 
} from 'lucide-react';
import { SyncStatus } from '../types/index';
import { SYNC_STALE_THRESHOLD_MS } from '../services/syncService';

interface Props {
  status?: SyncStatus;
  offlineTimestamp?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showAge?: boolean;
}

export const SyncStatusBadge: React.FC<Props> = ({
  status = 'SYNCED',
  offlineTimestamp,
  size = 'md',
  className = '',
  showAge = true,
}) => {
  // Calculate if entry exceeds the shift threshold (4 hours)
  const isStale = offlineTimestamp 
    ? Date.now() - new Date(offlineTimestamp).getTime() > SYNC_STALE_THRESHOLD_MS
    : false;

  const ageMinutes = offlineTimestamp 
    ? Math.max(0, Math.floor((Date.now() - new Date(offlineTimestamp).getTime()) / 60000))
    : 0;

  const formatAge = () => {
    if (!offlineTimestamp) return '';
    if (ageMinutes < 1) return 'just now';
    if (ageMinutes < 60) return `${ageMinutes}m ago`;
    const hours = Math.floor(ageMinutes / 60);
    return `${hours}h ${ageMinutes % 60}m ago`;
  };

  const config = {
    PENDING_LOCAL: {
      label: 'Saved on device',
      bg: 'bg-amber-500/10 text-amber-700 border-amber-300',
      icon: HardDrive,
      animate: false,
    },
    SYNCING: {
      label: 'Syncing...',
      bg: 'bg-blue-500/10 text-blue-700 border-blue-400',
      icon: Loader2,
      animate: true,
    },
    SYNCED: {
      label: 'Confirmed on server',
      bg: 'bg-emerald-500/10 text-emerald-800 border-emerald-400',
      icon: CheckCircle2,
      animate: false,
    },
    CONFLICT: {
      label: 'Sync Conflict',
      bg: 'bg-purple-500/10 text-purple-800 border-purple-400',
      icon: GitMerge,
      animate: false,
    },
    FAILED: {
      label: 'Sync Failed',
      bg: 'bg-rose-500/10 text-rose-800 border-rose-400',
      icon: AlertTriangle,
      animate: false,
    },
  }[status] || {
    label: 'Confirmed on server',
    bg: 'bg-emerald-500/10 text-emerald-800 border-emerald-400',
    icon: CheckCircle2,
    animate: false,
  };

  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-bold',
  }[size];

  return (
    <div className={`inline-flex items-center flex-wrap gap-1.5 ${className}`}>
      <span
        title={status === 'PENDING_LOCAL' ? 'Stored in IndexedDB on device. Auto-flushes when online.' : config.label}
        className={`inline-flex items-center font-mono font-bold rounded-xl border-2 transition-all shadow-2xs ${sizeClasses} ${config.bg}`}
      >
        <Icon 
          size={size === 'sm' ? 12 : size === 'lg' ? 16 : 14} 
          className={config.animate ? 'animate-spin' : ''} 
        />
        <span>{config.label}</span>
        {showAge && offlineTimestamp && status !== 'SYNCED' && (
          <span className="opacity-75 font-normal text-[10px] ml-0.5">
            ({formatAge()})
          </span>
        )}
      </span>

      {/* Visible Age Limit Warning (> 4 Hours Shift Threshold) */}
      {isStale && status !== 'SYNCED' && (
        <span 
          title="This punch has remained unsynced beyond the 4-hour shift threshold. Please connect to internet to reconcile attendance."
          className="inline-flex items-center gap-1 text-[10px] font-mono font-black px-2 py-0.5 rounded-lg bg-rose-600 text-white shadow-xs animate-pulse"
        >
          <AlertCircle size={11} />
          <span>&gt;4h Shift Alert</span>
        </span>
      )}
    </div>
  );
};
