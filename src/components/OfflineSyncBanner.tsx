// src/components/OfflineSyncBanner.tsx
import React, { useState, useEffect } from 'react';
import { 
  WifiOff, 
  Wifi, 
  RefreshCw, 
  AlertTriangle, 
  HardDrive, 
  Clock, 
  Database, 
  ShieldAlert 
} from 'lucide-react';
import { syncService, SYNC_STALE_THRESHOLD_MS } from '../services/syncService';
import { OfflineQueueItem } from '../types/index';
import { OfflineQueueModal } from './OfflineQueueModal';
import { triggerFrontlineHaptic } from '../utils/frontlineTouch';

interface Props {
  tenantId?: string;
  className?: string;
}

export const OfflineSyncBanner: React.FC<Props> = ({ tenantId, className = '' }) => {
  const [queueItems, setQueueItems] = useState<OfflineQueueItem[]>([]);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncService.syncPendingData();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleSyncStatus = (e: any) => {
      if (e.detail?.syncing !== undefined) {
        setIsSyncing(e.detail.syncing);
      }
    };
    window.addEventListener('syncStatus', handleSyncStatus);

    const unsubscribe = syncService.subscribe((items) => {
      setQueueItems(items);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('syncStatus', handleSyncStatus);
      unsubscribe();
    };
  }, []);

  const pendingItems = queueItems.filter(
    (i) => i.syncStatus === 'PENDING_LOCAL' || i.syncStatus === 'SYNCING'
  );
  const failedItems = queueItems.filter((i) => i.syncStatus === 'FAILED' || i.syncStatus === 'CONFLICT');
  const staleItems = pendingItems.filter((i) => syncService.isItemStale(i, SYNC_STALE_THRESHOLD_MS));

  // Only render banner if device is offline OR if there are pending/failed items in the queue
  if (isOnline && pendingItems.length === 0 && failedItems.length === 0) {
    return null;
  }

  const handleManualSync = () => {
    triggerFrontlineHaptic('light');
    syncService.syncPendingData();
  };

  return (
    <>
      <div
        className={`w-full rounded-2xl p-3.5 sm:px-5 sm:py-3.5 border-2 shadow-sm transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
          !isOnline
            ? 'bg-amber-50 border-amber-300 text-amber-950'
            : failedItems.length > 0
            ? 'bg-rose-50 border-rose-300 text-rose-950'
            : 'bg-blue-50 border-blue-300 text-blue-950'
        } ${className}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold ${
              !isOnline
                ? 'bg-amber-500 text-slate-950'
                : failedItems.length > 0
                ? 'bg-rose-600 text-white'
                : 'bg-blue-600 text-white'
            }`}
          >
            {!isOnline ? (
              <WifiOff size={18} />
            ) : isSyncing ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : failedItems.length > 0 ? (
              <AlertTriangle size={18} />
            ) : (
              <HardDrive size={18} />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-xs sm:text-sm">
                {!isOnline ? 'Offline Queue Active' : isSyncing ? 'Syncing Queue to Server...' : 'Pending Local Records'}
              </span>

              {/* Pending Count Badge */}
              <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded-md bg-black/10">
                {pendingItems.length} Saved on Device
              </span>

              {/* Stale Warning (>4h shift threshold) */}
              {staleItems.length > 0 && (
                <span className="inline-flex items-center gap-1 font-mono font-black text-[10px] px-2 py-0.5 rounded-md bg-rose-600 text-white animate-pulse">
                  <Clock size={11} />
                  <span>{staleItems.length} &gt;4h Shift Alert</span>
                </span>
              )}

              {/* Failed Items Warning */}
              {failedItems.length > 0 && (
                <span className="font-mono font-bold text-[10px] px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300">
                  {failedItems.length} Failed / Conflict
                </span>
              )}
            </div>

            <p className="text-[11px] opacity-80 mt-0.5 truncate">
              {!isOnline
                ? 'Punches written to IndexedDB. Will auto-flush without user action upon reconnect.'
                : isSyncing
                ? 'Transferring local punches to server. Verified with Confirmed status.'
                : failedItems.length > 0
                ? 'Some punches need supervisor attention. Tap Manage Queue to resolve.'
                : 'All offline records queued safely in device storage.'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {isOnline && (
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              type="button"
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-900 font-bold text-xs border border-slate-300 shadow-xs flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={isSyncing ? 'animate-spin text-blue-600' : 'text-slate-600'} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          )}

          <button
            onClick={() => {
              triggerFrontlineHaptic('light');
              setIsQueueModalOpen(true);
            }}
            type="button"
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 active:scale-95 cursor-pointer"
          >
            <Database size={13} />
            <span>Manage Queue</span>
          </button>
        </div>
      </div>

      {/* Offline Queue Modal */}
      <OfflineQueueModal
        isOpen={isQueueModalOpen}
        onClose={() => setIsQueueModalOpen(false)}
        tenantId={tenantId}
      />
    </>
  );
};
