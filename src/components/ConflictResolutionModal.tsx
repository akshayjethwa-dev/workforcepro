// src/components/ConflictResolutionModal.tsx
import React, { useState, useEffect } from 'react';
import { 
  X, 
  GitMerge, 
  HardDrive, 
  Server, 
  Clock, 
  Smartphone, 
  Monitor, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  ArrowRight, 
  FileText, 
  History, 
  MapPin, 
  User, 
  Sparkles 
} from 'lucide-react';
import { conflictService } from '../services/conflictService';
import { PunchConflict, ConflictAuditEntry } from '../types/index';
import { triggerFrontlineHaptic } from '../utils/frontlineTouch';
import { useToast } from '../contexts/ToastContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tenantId?: string;
  initialConflictId?: string;
  onResolved?: () => void;
}

export const ConflictResolutionModal: React.FC<Props> = ({
  isOpen,
  onClose,
  tenantId = 'demo-tenant-id',
  initialConflictId,
  onResolved,
}) => {
  const [conflicts, setConflicts] = useState<PunchConflict[]>([]);
  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(initialConflictId || null);
  const [activeTab, setActiveTab] = useState<'RESOLVE' | 'AUDIT_TRAIL'>('RESOLVE');
  const [auditTrail, setAuditTrail] = useState<ConflictAuditEntry[]>([]);
  const [isManualMergeOpen, setIsManualMergeOpen] = useState(false);
  const [manualPunchType, setManualPunchType] = useState<'IN' | 'OUT'>('IN');
  const [manualNotes, setManualNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const loadData = async () => {
    const list = await conflictService.getConflicts(tenantId);
    setConflicts(list);

    const unresolved = list.filter((c) => c.status === 'UNRESOLVED');
    if (!selectedConflictId || !list.find((c) => c.id === selectedConflictId)) {
      if (unresolved.length > 0) {
        setSelectedConflictId(unresolved[0].id);
      } else if (list.length > 0) {
        setSelectedConflictId(list[0].id);
      }
    }

    const trail = await conflictService.getAuditTrail(tenantId);
    setAuditTrail(trail);
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, tenantId]);

  if (!isOpen) return null;

  const activeConflict = conflicts.find((c) => c.id === selectedConflictId) || conflicts[0];
  const unresolvedConflicts = conflicts.filter((c) => c.status === 'UNRESOLVED');

  const handleResolve = async (
    strategy: 'KEEP_OFFLINE' | 'KEEP_SERVER' | 'MANUAL_MERGE'
  ) => {
    if (!activeConflict) return;
    triggerFrontlineHaptic('confirm');
    setIsSubmitting(true);

    try {
      const manualData = strategy === 'MANUAL_MERGE' ? {
        finalTimestamp: activeConflict.serverData.serverTimestamp,
        finalPunchType: manualPunchType,
        finalNotes: manualNotes || 'Supervisor manual merge reconciliation',
      } : undefined;

      await conflictService.resolvePunchConflict(
        activeConflict.id,
        strategy,
        manualData,
        'Site Administrator'
      );

      toast.success(
        strategy === 'KEEP_OFFLINE'
          ? `Kept offline punch for ${activeConflict.workerName} with server-authoritative timestamp.`
          : strategy === 'KEEP_SERVER'
          ? `Preserved server attendance record for ${activeConflict.workerName}.`
          : `Manually reconciled and merged punch for ${activeConflict.workerName}.`
      );

      setIsManualMergeOpen(false);
      await loadData();
      onResolved?.();
    } catch (e) {
      console.error('Resolution error:', e);
      toast.error('Failed to resolve punch conflict.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSeedDemoConflict = async () => {
    triggerFrontlineHaptic('light');
    const demo = await conflictService.seedDemoConflict(tenantId, 'Ramesh Kumar', 'worker-1');
    setSelectedConflictId(demo.id);
    await loadData();
    toast.info('Generated demo dual-device conflict (Kiosk vs Personal Mobile).');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full border-2 border-slate-200 shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/40 flex items-center justify-center shrink-0">
              <GitMerge size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight">Attendance Conflict Resolution</h2>
                {unresolvedConflicts.length > 0 ? (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-mono font-bold animate-pulse">
                    {unresolvedConflicts.length} UNRESOLVED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold">
                    ALL RESOLVED
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Server-authoritative review & field-level merge · Protects payroll integrity
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSeedDemoConflict}
              type="button"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
              title="Generate a sample dual-device punch conflict for testing"
            >
              <Sparkles size={13} className="text-amber-400" />
              <span>Simulate Conflict</span>
            </button>

            <button
              onClick={onClose}
              type="button"
              className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* View Switcher Tabs (Resolve Conflicts vs Audit Trail) */}
        <div className="px-5 sm:px-6 pt-3 pb-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('RESOLVE')}
              className={`min-h-[38px] px-4 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                activeTab === 'RESOLVE'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Review & Resolve ({unresolvedConflicts.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('AUDIT_TRAIL')}
              className={`min-h-[38px] px-4 py-1.5 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'AUDIT_TRAIL'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History size={14} />
              <span>Audit Trail ({auditTrail.length})</span>
            </button>
          </div>

          {activeConflict && activeTab === 'RESOLVE' && (
            <span className="text-[11px] font-mono text-slate-500 font-bold hidden sm:inline">
              Pay Period: {activeConflict.payPeriod}
            </span>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'AUDIT_TRAIL' ? (
            /* AUDIT TRAIL VIEW */
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-500">
                  Immutable Conflict & Last-Write-Wins Audit Trail
                </h3>
                <span className="text-[11px] text-slate-400">{auditTrail.length} Logged Events</span>
              </div>

              {auditTrail.length === 0 ? (
                <div className="p-10 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                  <History size={32} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-bold text-slate-700">No Conflict Resolutions Logged Yet</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Resolutions and scalar last-write-wins events will appear here with timestamps.
                  </p>
                </div>
              ) : (
                auditTrail.map((entry) => (
                  <div key={entry.id} className="p-4 rounded-2xl border-2 border-slate-200 bg-slate-50/70 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-sm">{entry.workerName || 'Staff Record'}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-200 font-mono font-bold text-[10px] text-slate-700">
                        {entry.strategy}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono text-slate-600">
                      <div>
                        <span className="text-slate-400 block font-sans">Resolved By:</span>
                        <span className="font-bold">{entry.resolvedBy}</span> ({new Date(entry.resolvedAt).toLocaleTimeString()})
                      </div>
                      <div>
                        <span className="text-slate-400 block font-sans">Device:</span>
                        <span className="truncate block">{entry.deviceId || 'System Default'}</span>
                      </div>
                    </div>

                    {entry.notes && (
                      <div className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-[11px]">
                        {entry.notes}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : (
            /* CONFLICT RESOLUTION VIEW */
            <>
              {conflicts.length === 0 ? (
                <div className="p-12 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                  <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3" />
                  <h3 className="text-base font-bold text-slate-800">Zero Attendance Conflicts</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    All offline punches are synchronized and consistent with server state. Payroll finalisation is unlocked.
                  </p>
                </div>
              ) : (
                <>
                  {/* Conflict Selector Pills (if multiple workers have conflicts) */}
                  {conflicts.length > 1 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      <span className="text-[11px] font-mono font-bold text-slate-400 uppercase shrink-0">
                        Select Worker:
                      </span>
                      {conflicts.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            triggerFrontlineHaptic('light');
                            setSelectedConflictId(c.id);
                            setIsManualMergeOpen(false);
                          }}
                          className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold border-2 transition-all shrink-0 cursor-pointer ${
                            c.id === selectedConflictId
                              ? 'bg-purple-600 text-white border-purple-500 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {c.workerName} {c.status === 'UNRESOLVED' ? '⚠️' : '✓'}
                        </button>
                      ))}
                    </div>
                  )}

                  {activeConflict && (
                    <div className="space-y-4">
                      {/* Conflict Context Banner */}
                      <div className="p-4 bg-purple-50/80 border-2 border-purple-200 rounded-2xl flex items-start gap-3">
                        <AlertTriangle size={20} className="text-purple-600 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-extrabold text-sm text-purple-950">
                            {activeConflict.workerName}: Dual-Device Punch Conflict
                          </h4>
                          <p className="text-xs text-purple-900 mt-0.5 leading-relaxed">
                            {activeConflict.conflictReason}
                          </p>
                          <div className="mt-2 flex items-center gap-3 text-[11px] font-mono font-bold text-purple-800">
                            <span>Clock Skew: {Math.round(activeConflict.clockSkewMs / 1000)}s</span>
                            <span>·</span>
                            <span>Resolution Rule: Server Timestamp Authoritative</span>
                          </div>
                        </div>
                      </div>

                      {/* SIDE-BY-SIDE COMPARISON (AC 4) */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Offline Value Card */}
                        <div className="p-4 sm:p-5 rounded-2xl border-2 border-amber-300 bg-amber-50/40 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 uppercase font-mono">
                              <Smartphone size={15} />
                              Offline Device Punch
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-amber-200 text-amber-900 font-mono font-black text-xs">
                              {activeConflict.offlineData.punchType}
                            </span>
                          </div>

                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400 font-mono uppercase block">Recorded Device:</span>
                              <span className="font-bold text-slate-900">{activeConflict.offlineData.deviceId}</span>
                            </div>

                            <div>
                              <span className="text-[10px] text-slate-400 font-mono uppercase block">Device Timestamp:</span>
                              <span className="font-mono font-bold text-slate-900 text-sm">
                                {new Date(activeConflict.offlineData.deviceTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono block">
                                {new Date(activeConflict.offlineData.deviceTimestamp).toLocaleDateString()}
                              </span>
                            </div>

                            {activeConflict.offlineData.location && (
                              <div className="flex items-center gap-1 text-[11px] text-slate-600 font-mono">
                                <MapPin size={12} className="text-slate-400" />
                                <span>GPS: {activeConflict.offlineData.location.lat.toFixed(4)}, {activeConflict.offlineData.location.lng.toFixed(4)}</span>
                              </div>
                            )}

                            <div>
                              <span className="text-[10px] text-slate-400 font-mono uppercase block">Notes:</span>
                              <span className="text-slate-700">{activeConflict.offlineData.notes || 'None recorded'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Server Value Card */}
                        <div className="p-4 sm:p-5 rounded-2xl border-2 border-blue-300 bg-blue-50/40 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-900 uppercase font-mono">
                              <Server size={15} />
                              Server Confirmed Punch
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-blue-200 text-blue-900 font-mono font-black text-xs">
                              {activeConflict.serverData.punchType}
                            </span>
                          </div>

                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400 font-mono uppercase block">Authoritative Device:</span>
                              <span className="font-bold text-slate-900">{activeConflict.serverData.deviceId}</span>
                            </div>

                            <div>
                              <span className="text-[10px] text-slate-400 font-mono uppercase block">Server Timestamp:</span>
                              <span className="font-mono font-bold text-slate-900 text-sm">
                                {new Date(activeConflict.serverData.serverTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono block">
                                {new Date(activeConflict.serverData.serverTimestamp).toLocaleDateString()}
                              </span>
                            </div>

                            {activeConflict.serverData.location && (
                              <div className="flex items-center gap-1 text-[11px] text-slate-600 font-mono">
                                <MapPin size={12} className="text-slate-400" />
                                <span>GPS: {activeConflict.serverData.location.lat.toFixed(4)}, {activeConflict.serverData.location.lng.toFixed(4)}</span>
                              </div>
                            )}

                            <div>
                              <span className="text-[10px] text-slate-400 font-mono uppercase block">Notes:</span>
                              <span className="text-slate-700">{activeConflict.serverData.notes || 'Server Authoritative'}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Manual Merge Builder (if toggled) */}
                      {isManualMergeOpen && (
                        <div className="p-4 bg-slate-50 border-2 border-purple-300 rounded-2xl space-y-3 animate-in fade-in">
                          <h4 className="font-black text-xs uppercase tracking-wider font-mono text-purple-900">
                            Custom Manual Merge Reconciler:
                          </h4>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                                Designated Punch Type:
                              </label>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setManualPunchType('IN')}
                                  className={`flex-1 min-h-[44px] rounded-xl font-black text-xs border-2 cursor-pointer ${
                                    manualPunchType === 'IN'
                                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                                      : 'bg-white text-slate-700 border-slate-300'
                                  }`}
                                >
                                  PUNCH IN
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setManualPunchType('OUT')}
                                  className={`flex-1 min-h-[44px] rounded-xl font-black text-xs border-2 cursor-pointer ${
                                    manualPunchType === 'OUT'
                                      ? 'bg-rose-600 text-white border-rose-500 shadow-xs'
                                      : 'bg-white text-slate-700 border-slate-300'
                                  }`}
                                >
                                  PUNCH OUT
                                </button>
                              </div>
                            </div>

                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                                Supervisor Reconcile Note:
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. Worker was delayed by kiosk queue"
                                value={manualNotes}
                                onChange={(e) => setManualNotes(e.target.value)}
                                className="w-full min-h-[44px] px-3 py-2 text-xs bg-white border-2 border-slate-300 rounded-xl outline-none focus:border-purple-600"
                              />
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleResolve('MANUAL_MERGE')}
                            disabled={isSubmitting}
                            className="w-full min-h-[48px] rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-black text-xs uppercase tracking-wide border border-purple-500 shadow-md cursor-pointer"
                          >
                            Save & Commit Manual Merge
                          </button>
                        </div>
                      )}

                      {/* ACTION BUTTONS (>= 56px touch target, >= 12px gap) */}
                      {activeConflict.status === 'UNRESOLVED' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
                          {/* KEEP SERVER */}
                          <button
                            type="button"
                            onClick={() => handleResolve('KEEP_SERVER')}
                            disabled={isSubmitting}
                            className="min-h-[56px] px-4 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black text-xs sm:text-sm border-2 border-blue-400 shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
                            title="Accept server-authoritative punch and discard duplicate offline punch"
                          >
                            <Server size={18} />
                            <span>Keep Server Record</span>
                          </button>

                          {/* KEEP OFFLINE */}
                          <button
                            type="button"
                            onClick={() => handleResolve('KEEP_OFFLINE')}
                            disabled={isSubmitting}
                            className="min-h-[56px] px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-black text-xs sm:text-sm border-2 border-amber-300 shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
                            title="Accept offline device punch (Uses server timestamp for skew protection)"
                          >
                            <HardDrive size={18} />
                            <span>Keep Offline Punch</span>
                          </button>

                          {/* MERGE MANUALLY */}
                          <button
                            type="button"
                            onClick={() => {
                              triggerFrontlineHaptic('light');
                              setIsManualMergeOpen(!isManualMergeOpen);
                            }}
                            disabled={isSubmitting}
                            className="min-h-[56px] px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-black text-xs sm:text-sm border-2 border-slate-700 shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
                            title="Open custom merge builder to combine timeline values"
                          >
                            <GitMerge size={18} />
                            <span>{isManualMergeOpen ? 'Close Merge Tool' : 'Merge Manually'}</span>
                          </button>
                        </div>
                      ) : (
                        <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-2xl flex items-center justify-between">
                          <div className="flex items-center gap-2 text-emerald-900 text-xs font-bold">
                            <CheckCircle2 size={18} className="text-emerald-600" />
                            <span>
                              Resolved via {activeConflict.resolution?.strategy} by {activeConflict.resolution?.resolvedBy}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-emerald-800">
                            {new Date(activeConflict.resolution?.resolvedAt || '').toLocaleTimeString()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:px-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck size={16} className="text-blue-600" />
            <span>Audit trail preserved for wage & labor compliance</span>
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
    </div>
  );
};
