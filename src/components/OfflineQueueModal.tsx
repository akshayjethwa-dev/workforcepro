import { ConflictResolutionModal } from './ConflictResolutionModal';
import { conflictService } from '../services/conflictService';
import { GitMerge } from 'lucide-react';
// src/components/OfflineQueueModal.tsx
import React, { useState, useEffect } from 'react';
import { 
  X, 
  HardDrive, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Trash2, 
  ArrowUpRight, 
  ShieldCheck, 
  ShieldAlert, 
  Clock, 
  Database, 
  Wifi, 
  WifiOff, 
  PlusCircle 
} from 'lucide-react';
import { syncService } from '../services/syncService';
import { OfflineQueueItem, StorageHealth } from '../types/index';
import { SyncStatusBadge } from './SyncStatusBadge';
import { triggerFrontlineHaptic } from '../utils/frontlineTouch';
import { useToast } from '../contexts/ToastContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tenantId?: string;
}

export const OfflineQueueModal: React.FC<Props> = ({ isOpen, onClose, tenantId }) => {
  const [queueItems, setQueueItems] = useState<OfflineQueueItem[]>([]);
  const [storageHealth, setStorageHealth] = useState<StorageHealth | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'FAILED' | 'CONFLICT'>('ALL');
  const { toast } = useToast();

  const loadData = async () => {
    const items = await syncService.getQueueItems();
    setQueueItems(items);
    const health = await syncService.getStorageHealth();
    setStorageHealth(health);
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      const unsubscribe = syncService.subscribe((items) => {
        setQueueItems(items);
      });
      return () => unsubscribe();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSyncNow = async () => {
    triggerFrontlineHaptic('light');
    setIsSyncing(true);
    try {
      const res = await syncService.syncPendingData();
      if (res.syncedCount > 0) {
        toast.success(`Successfully synced ${res.syncedCount} offline record(s) to server.`);
      } else if (!navigator.onLine) {
        toast.warning('Device is offline. Entries remain safely saved in IndexedDB.');
      } else if (res.conflictCount > 0) {
        toast.warning(`${res.conflictCount} entry required manual supervisor resolution.`);
      }
    } finally {
      setIsSyncing(false);
      loadData();
    }
  };

  const handleRetryItem = async (id: number) => {
    triggerFrontlineHaptic('light');
    await syncService.retryItem(id);
    toast.info('Item queued for sync.');
  };

  const handleForceOverride = async (id: number) => {
    triggerFrontlineHaptic('confirm');
    const success = await syncService.forceOverrideServer(id);
    if (success) {
      toast.success('Pushed override to server.');
    } else {
      toast.error('Failed to override server.');
    }
    loadData();
  };

  const handleDiscard = async (id: number) => {
    triggerFrontlineHaptic('light');
    await syncService.removeItem(id);
    toast.info('Discarded local entry.');
    loadData();
  };

  const handleSimulateOfflinePunch = async () => {
    triggerFrontlineHaptic('confirm');
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const dummyRecord = {
      id: `sim_${Date.now()}`,
      tenantId: tenantId || 'demo-tenant-id',
      workerId: `sim_worker_${Date.now()}`,
      workerName: 'Simulated Field Worker',
      date: today,
      shiftId: 'default',
      timeline: [{
        timestamp: now.toISOString(),
        type: 'IN' as const,
        device: 'Offline Field App',
      }],
      status: 'PRESENT' as const,
      lateStatus: { isLate: false, lateByMins: 0, penaltyApplied: false },
      hours: { gross: 8, net: 8, overtime: 0 },
    };

    await syncService.savePunchOffline(dummyRecord as any);
    toast.success('Simulated punch saved to IndexedDB (PENDING_LOCAL).');
    loadData();
  };

  const filteredItems = queueItems.filter(item => {
    if (filter === 'PENDING') return item.syncStatus === 'PENDING_LOCAL' || item.syncStatus === 'SYNCING';
    if (filter === 'FAILED') return item.syncStatus === 'FAILED';
    if (filter === 'CONFLICT') return item.syncStatus === 'CONFLICT';
    return true;
  });

  const pendingCount = queueItems.filter(i => i.syncStatus === 'PENDING_LOCAL' || i.syncStatus === 'SYNCING').length;
  const failedCount = queueItems.filter(i => i.syncStatus === 'FAILED').length;
  const conflictCount = queueItems.filter(i => i.syncStatus === 'CONFLICT').length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full border-2 border-slate-200 shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shrink-0">
              <Database size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight">Offline Queue & Sync Manager</h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                  navigator.onLine 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {navigator.onLine ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Durable IndexedDB persistence with per-entry sync states & conflict resolution
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          
          {/* Storage Health & iOS Eviction Diagnostics */}
          <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  storageHealth?.isPersistent ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {storageHealth?.isPersistent ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                    <span>IndexedDB Persistence:</span>
                    <span className={storageHealth?.isPersistent ? 'text-emerald-700' : 'text-amber-700'}>
                      {storageHealth?.isPersistent ? 'Guaranteed (Durable)' : 'Standard (At risk on low-battery iOS)'}
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {storageHealth?.usageBytes 
                      ? `${(storageHealth.usageBytes / 1024 / 1024).toFixed(1)} MB used of ${(storageHealth.quotaBytes / 1024 / 1024).toFixed(0)} MB quota (${storageHealth.percentUsed}%)`
                      : 'Storage quota nominal · Protected against memory pressure'}
                  </p>
                </div>
              </div>

              {/* Simulation buttons for supervisors */}
              <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                <button
                  type="button"
                  onClick={async () => {
                    triggerFrontlineHaptic('light');
                    await conflictService.seedDemoConflict(tenantId || 'demo-tenant-id');
                    setIsConflictModalOpen(true);
                    loadData();
                  }}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                  title="Generate a dual-device punch conflict (Kiosk vs Personal Mobile)"
                >
                  <GitMerge size={14} className="text-purple-700" />
                  <span>Simulate Conflict</span>
                </button>

                <button
                  type="button"
                  onClick={handleSimulateOfflinePunch}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                  title="Create a dummy punch in IndexedDB to verify offline queueing"
                >
                  <PlusCircle size={14} />
                  <span>Simulate Punch</span>
                </button>
              </div>
            </div>
          </div>

          {/* Controls Bar: Filters & Sync Now Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1.5 p-1 bg-slate-200/80 rounded-2xl shrink-0 overflow-x-auto">
              {[
                { id: 'ALL', label: `All (${queueItems.length})` },
                { id: 'PENDING', label: `Pending (${pendingCount})` },
                { id: 'FAILED', label: `Failed (${failedCount})` },
                { id: 'CONFLICT', label: `Conflicts (${conflictCount})` },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id as any)}
                  type="button"
                  className={`min-h-[38px] px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    filter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              type="button"
              className="min-h-[48px] px-4 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
              <span>{isSyncing ? 'Flushing Queue...' : 'Sync Queue Now'}</span>
            </button>
          </div>

          {/* Queue List */}
          <div className="space-y-3">
            {filteredItems.length === 0 ? (
              <div className="p-10 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                <h4 className="text-sm font-bold text-slate-800">Queue is Clear</h4>
                <p className="text-xs text-slate-400 mt-1">All punches and requests are confirmed on the server.</p>
              </div>
            ) : (
              filteredItems.map(item => (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl border-2 transition-all ${
                    item.syncStatus === 'FAILED'
                      ? 'bg-rose-50/50 border-rose-300'
                      : item.syncStatus === 'CONFLICT'
                      ? 'bg-purple-50/50 border-purple-300'
                      : item.syncStatus === 'SYNCING'
                      ? 'bg-blue-50/50 border-blue-300'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 font-bold text-xs text-slate-700 flex items-center justify-center">
                        {item.workerName.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900">{item.workerName}</h4>
                        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2">
                          <span>{item.entityType}</span>
                          <span>·</span>
                          <span>Saved: {new Date(item.offlineTimestamp).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>

                    <SyncStatusBadge
                      status={item.syncStatus}
                      offlineTimestamp={item.offlineTimestamp}
                      size="sm"
                    />
                  </div>

                  {/* Error / Conflict details if present */}
                  {item.lastError && (
                    <div className="p-2.5 rounded-xl bg-rose-100/70 border border-rose-200 text-xs text-rose-800 mb-3 font-mono">
                      {item.lastError}
                    </div>
                  )}

                  {/* Action buttons (>= 44px min height for supervisor) */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    {item.syncStatus === 'CONFLICT' && (
                      <>
                        <button
                          onClick={() => {
                            triggerFrontlineHaptic('light');
                            setIsConflictModalOpen(true);
                          }}
                          type="button"
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-xs"
                          title="Review conflict side-by-side with server state"
                        >
                          <GitMerge size={14} />
                          <span>Review & Resolve</span>
                        </button>
                        <button
                          onClick={() => handleForceOverride(item.id!)}
                          type="button"
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 font-bold text-xs flex items-center gap-1 active:scale-95 cursor-pointer"
                          title="Force server to accept local punch"
                        >
                          <ArrowUpRight size={14} />
                          <span>Force Override</span>
                        </button>
                      </>
                    )}

                    {(item.syncStatus === 'FAILED' || item.syncStatus === 'PENDING_LOCAL') && (
                      <button
                        onClick={() => handleRetryItem(item.id!)}
                        type="button"
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1 active:scale-95 cursor-pointer border border-slate-300"
                      >
                        <RefreshCw size={13} />
                        <span>Retry</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleDiscard(item.id!)}
                      type="button"
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 font-bold text-xs flex items-center gap-1 active:scale-95 cursor-pointer border border-rose-200"
                      title="Discard invalid entry"
                    >
                      <Trash2 size={13} />
                      <span>Discard</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:px-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
            <span>Auto-flushes on reconnect</span>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="px-5 py-2.5 min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
      {/* CONFLICT RESOLUTION MODAL */}
      <ConflictResolutionModal
        isOpen={isConflictModalOpen}
        onClose={() => setIsConflictModalOpen(false)}
        tenantId={tenantId}
        onResolved={loadData}
      />
    </div>
  );
};
