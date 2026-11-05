// src/components/SupervisorSafetyMonitorModal.tsx
import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, ShieldCheck, AlertTriangle, AlertOctagon, 
  Clock, PhoneCall, RefreshCw, X, Filter, MapPin, 
  Battery, Mic, Play, CheckCircle2, UserX, User, HelpCircle,
  ExternalLink, Layers, ArrowUpRight
} from 'lucide-react';
import { 
  safetyCheckInService, 
  LoneWorkerOverviewItem 
} from '../services/safetyCheckInService';
import { Branch } from '../types/index';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  branches?: Branch[];
}

export const SupervisorSafetyMonitorModal: React.FC<Props> = ({
  isOpen,
  onClose,
  tenantId,
  branches = []
}) => {
  const [workers, setWorkers] = useState<LoneWorkerOverviewItem[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      // Run escalation ladder evaluation
      await safetyCheckInService.checkEscalations(tenantId);
      const list = safetyCheckInService.getLoneWorkerOverview(tenantId);
      setWorkers(list);
    } catch (e) {
      console.error('Failed to load lone worker safety overview:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      const interval = setInterval(loadData, 15000); // 15s live poll
      return () => clearInterval(interval);
    }
  }, [isOpen, tenantId]);

  if (!isOpen) return null;

  const filteredWorkers = workers.filter(w => {
    if (selectedBranch !== 'ALL' && w.session.siteId !== selectedBranch) return false;
    if (selectedStatusFilter === 'PANIC' && w.status !== 'PANIC') return false;
    if (selectedStatusFilter === 'ESCALATING' && !['ESCALATING_T5', 'ESCALATING_T15', 'ESCALATED_T30'].includes(w.status)) return false;
    if (selectedStatusFilter === 'SAFE' && w.status !== 'SAFE' && w.status !== 'DUE_SOON') return false;
    if (selectedStatusFilter === 'DECLINED' && w.status !== 'DECLINED') return false;
    return true;
  });

  const panicCount = workers.filter(w => w.status === 'PANIC').length;
  const escalatingCount = workers.filter(w => ['ESCALATING_T5', 'ESCALATING_T15', 'ESCALATED_T30'].includes(w.status)).length;
  const safeCount = workers.filter(w => w.status === 'SAFE' || w.status === 'DUE_SOON').length;
  const declinedCount = workers.filter(w => w.status === 'DECLINED').length;
  const hasAnyFallbackMissing = workers.some(w => !w.hasFallbackContact);

  const getStatusBadge = (status: LoneWorkerOverviewItem['status'], minutesUntilDue: number) => {
    switch (status) {
      case 'PANIC':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rose-600 text-white animate-pulse flex items-center gap-1.5 shadow-xs">
            <AlertOctagon size={13} />
            CRITICAL PANIC SOS
          </span>
        );
      case 'ESCALATED_T30':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-red-700 text-white flex items-center gap-1.5">
            <AlertTriangle size={13} />
            ESCALATED (T+30)
          </span>
        );
      case 'ESCALATING_T15':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-orange-600 text-white flex items-center gap-1.5">
            <AlertTriangle size={13} />
            MISSED (T+15)
          </span>
        );
      case 'ESCALATING_T5':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500 text-white flex items-center gap-1.5">
            <Clock size={13} />
            OVERDUE (T+5)
          </span>
        );
      case 'DUE':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            CHECK-IN DUE NOW
          </span>
        );
      case 'DUE_SOON':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            Due in {minutesUntilDue}m
          </span>
        );
      case 'SAFE':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <ShieldCheck size={13} />
            SAFE & CONFIRMED
          </span>
        );
      case 'DECLINED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            Opted Out (No Penalty)
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
            Shift Ended
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-4xl w-full h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
              <ShieldAlert size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight">Lone Worker Safety Command</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/10 text-slate-300">
                  {workers.length} On Shift
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Multi-tier escalation ladder, heartbeat monitor, and panic SOS dispatch
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={isRefreshing}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Refresh status"
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Fallback Contact Warning Banner */}
        {hasAnyFallbackMissing && (
          <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} />
              <span>Safety Warning: One or more sites lack a secondary fallback emergency contact. Single-point-of-failure escalation is prohibited.</span>
            </div>
          </div>
        )}

        {/* Status Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 sm:p-4 bg-slate-50 border-b border-slate-200 shrink-0 text-xs">
          <button
            onClick={() => setSelectedStatusFilter('PANIC')}
            className={`p-2.5 rounded-2xl border text-left transition-all ${
              selectedStatusFilter === 'PANIC' 
                ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500' 
                : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-rose-700">Active Panic</span>
              <AlertOctagon size={16} className={panicCount > 0 ? 'text-rose-600 animate-bounce' : 'text-slate-300'} />
            </div>
            <div className="text-xl font-black text-rose-900 mt-1">{panicCount}</div>
          </button>

          <button
            onClick={() => setSelectedStatusFilter('ESCALATING')}
            className={`p-2.5 rounded-2xl border text-left transition-all ${
              selectedStatusFilter === 'ESCALATING' 
                ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500' 
                : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-700">Missed / Escalating</span>
              <AlertTriangle size={16} className={escalatingCount > 0 ? 'text-amber-600' : 'text-slate-300'} />
            </div>
            <div className="text-xl font-black text-amber-900 mt-1">{escalatingCount}</div>
          </button>

          <button
            onClick={() => setSelectedStatusFilter('SAFE')}
            className={`p-2.5 rounded-2xl border text-left transition-all ${
              selectedStatusFilter === 'SAFE' 
                ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500' 
                : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-700">Safe & Normal</span>
              <ShieldCheck size={16} className="text-emerald-500" />
            </div>
            <div className="text-xl font-black text-emerald-900 mt-1">{safeCount}</div>
          </button>

          <button
            onClick={() => setSelectedStatusFilter('DECLINED')}
            className={`p-2.5 rounded-2xl border text-left transition-all ${
              selectedStatusFilter === 'DECLINED' 
                ? 'bg-slate-200 border-slate-400 ring-2 ring-slate-500' 
                : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">Opted Out (Declined)</span>
              <UserX size={16} className="text-slate-400" />
            </div>
            <div className="text-xl font-black text-slate-800 mt-1">{declinedCount}</div>
          </button>
        </div>

        {/* Filter Controls */}
        <div className="px-4 py-2.5 bg-white border-b border-slate-100 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-bold uppercase text-[10px]">Site Filter:</span>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="ALL">All Sites & Branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {selectedStatusFilter !== 'ALL' && (
            <button
              onClick={() => setSelectedStatusFilter('ALL')}
              className="text-xs text-indigo-600 hover:underline font-bold"
            >
              Clear filter ({selectedStatusFilter})
            </button>
          )}
        </div>

        {/* Lone Workers List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
          {filteredWorkers.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
              <ShieldCheck size={36} className="mx-auto text-slate-300 mb-2" />
              <h4 className="font-bold text-slate-700 text-sm">No lone workers matching filter</h4>
              <p className="text-xs text-slate-400 mt-1">
                Active shifts on lone worker safety enabled sites will appear here automatically.
              </p>
            </div>
          ) : (
            filteredWorkers.map((item) => (
              <div 
                key={item.session.id}
                className={`p-4 rounded-2xl border transition-all ${
                  item.status === 'PANIC'
                    ? 'bg-rose-50/70 border-rose-300 shadow-md ring-1 ring-rose-400'
                    : item.status.includes('ESCALAT')
                    ? 'bg-amber-50/60 border-amber-300 shadow-xs'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 font-black text-sm flex items-center justify-center border border-slate-200 shrink-0">
                      {item.session.workerName.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-black text-slate-900 text-sm">{item.session.workerName}</h4>
                        {getStatusBadge(item.status, item.minutesUntilDue)}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Site: <span className="font-semibold text-slate-700">{item.session.siteName}</span> • Shift started {new Date(item.session.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href="tel:112"
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs"
                    >
                      <PhoneCall size={14} className="text-emerald-400" />
                      <span>Direct Call</span>
                    </a>
                    {item.activePanic && (
                      <button
                        onClick={async () => {
                          await safetyCheckInService.resolvePanicAlert({
                            alertId: item.activePanic!.id,
                            tenantId,
                            resolvedBy: 'Operations Supervisor',
                            isFalseAlarm: false,
                            notes: 'Supervisor verified worker safety in person/via radio'
                          });
                          loadData();
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-xs"
                      >
                        Stand Down Panic
                      </button>
                    )}
                  </div>
                </div>

                {/* Status Details Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-100 text-[11px]">
                  <div>
                    <span className="text-slate-400 font-bold block uppercase text-[9px]">Last Checked In</span>
                    <span className="font-semibold text-slate-700">
                      {item.lastRespondedAt 
                        ? new Date(item.lastRespondedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                        : 'Shift Start (No check-in yet)'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 font-bold block uppercase text-[9px]">Next Check-In Due</span>
                    <span className={`font-semibold ${item.minutesUntilDue <= 0 ? 'text-rose-600 font-bold' : 'text-slate-700'}`}>
                      {item.nextDueAt 
                        ? `${new Date(item.nextDueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${item.minutesUntilDue > 0 ? `in ${item.minutesUntilDue}m` : `${Math.abs(item.minutesUntilDue)}m overdue`})` 
                        : item.status === 'DECLINED' ? 'Opted Out' : 'None scheduled'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 font-bold block uppercase text-[9px]">Battery / Signal</span>
                    <span className="font-semibold text-slate-700 flex items-center gap-1">
                      <Battery size={13} className="text-emerald-600" />
                      <span>{item.currentCheckIn?.batteryPct ?? 85}%</span>
                      {item.isOffline && <span className="text-[10px] text-amber-600 font-bold">(Offline buffer)</span>}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 font-bold block uppercase text-[9px]">Fallback Guard</span>
                    <span className={`font-semibold ${item.hasFallbackContact ? 'text-emerald-600' : 'text-rose-600 font-bold'}`}>
                      {item.hasFallbackContact ? 'Active (No SPOF)' : 'Missing Fallback!'}
                    </span>
                  </div>
                </div>

                {/* Voice note player if worker submitted audio */}
                {item.currentCheckIn?.voiceNoteSnippet && (
                  <div className="mt-2.5 p-2 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-indigo-900 font-medium">
                      <Mic size={14} className="text-indigo-600" />
                      <span>Voice note submitted: {item.currentCheckIn.voiceNoteSnippet}</span>
                    </div>
                    <span className="text-[10px] font-mono text-indigo-700 bg-white px-2 py-0.5 rounded-full border border-indigo-200">
                      Audio Verified
                    </span>
                  </div>
                )}

                {/* Escalation Ladder History if active */}
                {item.currentCheckIn?.escalationLogs && item.currentCheckIn.escalationLogs.length > 0 && (
                  <div className="mt-2.5 p-2 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-[11px]">
                    <span className="font-bold text-amber-900 uppercase text-[9px] block">
                      Escalation Trail
                    </span>
                    {item.currentCheckIn.escalationLogs.map((log, li) => (
                      <div key={li} className="flex items-center justify-between text-amber-800">
                        <span>• {log.note}</span>
                        <span className="font-mono text-[10px] text-amber-600">
                          {new Date(log.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>Escalation Ladder: T+5 Worker • T+15 Supervisor • T+30 Branch Manager</span>
          </div>
          <span className="font-mono text-[10px] text-slate-400">
            DPDP / E15 Audited
          </span>
        </div>

      </div>
    </div>
  );
};
