// src/components/OfflineBanner.tsx
import React, { useState, useEffect } from 'react';
import { 
  WifiOff, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Database, 
  Clock, 
  HardDrive 
} from 'lucide-react';
import { syncService, SYNC_STALE_THRESHOLD_MS } from '../services/syncService';
import { OfflineQueueItem } from '../types/index';
import { OfflineQueueModal } from './OfflineQueueModal';
import { triggerFrontlineHaptic } from '../utils/frontlineTouch';

export const OfflineBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [queueItems, setQueueItems] = useState<OfflineQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    syncService.initAutoSync();

    const unsubscribe = syncService.subscribe((items) => {
      setQueueItems(items);
    });

    const handleOnline = () => {
      setIsOffline(false);
      syncService.syncPendingData();
    };
    const handleOffline = () => setIsOffline(true);

    const handleSyncStatus = (e: any) => {
      const { syncing, count } = e.detail;
      setIsSyncing(syncing);
      if (!syncing && count === 0 && queueItems.length > 0) {
        setShowSuccessMessage(true);
        setTimeout(() => setShowSuccessMessage(false), 3000);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('syncStatus', handleSyncStatus);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('syncStatus', handleSyncStatus);
      unsubscribe();
    };
  }, [queueItems.length]);

  const pendingItems = queueItems.filter(
    (i) => i.syncStatus === 'PENDING_LOCAL' || i.syncStatus === 'SYNCING'
  );
  const failedItems = queueItems.filter(
    (i) => i.syncStatus === 'FAILED' || i.syncStatus === 'CONFLICT'
  );
  const staleItems = pendingItems.filter((i) =>
    syncService.isItemStale(i, SYNC_STALE_THRESHOLD_MS)
  );

  // Don't render banner if online and nothing is pending/failed
  if (!isOffline && pendingItems.length === 0 && failedItems.length === 0 && !isSyncing && !showSuccessMessage) {
    return null;
  }

  const handleManualSync = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerFrontlineHaptic('light');
    syncService.syncPendingData();
  };

  return (
    <>
      <aside
        aria-label="Offline Sync Status Banner"
        className="fixed top-0 left-0 right-0 z-50 flex justify-center w-full px-3 pt-2 pointer-events-none"
      >
        <div
          role="status"
          className="bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border-2 border-slate-700 pointer-events-auto px-4 py-2.5 flex items-center justify-between gap-3 max-w-2xl w-full transition-all duration-300 text-xs"
        >
          {/* Status Icon & Message */}
          <div className="flex items-center gap-2.5 min-w-0">
            {showSuccessMessage ? (
              <div className="flex items-center text-emerald-400 font-bold gap-2">
                <CheckCircle2 size={18} className="shrink-0" />
                <span>All offline records confirmed on server!</span>
              </div>
            ) : isSyncing ? (
              <div className="flex items-center text-blue-400 font-bold gap-2 min-w-0">
                <RefreshCw size={18} className="animate-spin shrink-0" />
                <span className="truncate">Syncing {pendingItems.length} records to server...</span>
              </div>
            ) : isOffline ? (
              <div className="flex items-center text-amber-400 font-bold gap-2 min-w-0">
                <WifiOff size={18} className="shrink-0" />
                <span className="truncate">Offline Mode (IndexedDB Queue Active)</span>
                {pendingItems.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-mono text-[10px] border border-amber-400/40 shrink-0">
                    {pendingItems.length} Saved on Device
                  </span>
                )}
              </div>
            ) : failedItems.length > 0 ? (
              <div className="flex items-center text-rose-400 font-bold gap-2 min-w-0">
                <AlertTriangle size={18} className="shrink-0" />
                <span className="truncate">{failedItems.length} punches need supervisor resolution</span>
              </div>
            ) : (
              <div className="flex items-center text-slate-300 font-bold gap-2 min-w-0">
                <HardDrive size={18} className="text-amber-400 shrink-0" />
                <span className="truncate">{pendingItems.length} records waiting to sync</span>
              </div>
            )}

            {/* Shift Threshold Alert (>4h unsynced) */}
            {staleItems.length > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 font-mono font-black text-[10px] px-2 py-0.5 rounded-lg bg-rose-600 text-white animate-pulse shrink-0">
                <Clock size={11} />
                <span>{staleItems.length} &gt;4h Alert</span>
              </span>
            )}
          </div>

          {/* Action Buttons (>= 40px min height) */}
          <div className="flex items-center gap-2 shrink-0">
            {!isOffline && pendingItems.length > 0 && (
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="min-h-[36px] px-2.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Sync Now</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                triggerFrontlineHaptic('light');
                setIsModalOpen(true);
              }}
              className="min-h-[36px] px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white font-bold text-xs flex items-center gap-1.5 border border-slate-600 cursor-pointer"
            >
              <Database size={13} />
              <span>Queue ({queueItems.length})</span>
            </button>
          </div>
        </div>
      </aside>

      <OfflineQueueModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};
