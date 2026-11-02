// src/components/UpgradePaywallModal.tsx
import React from 'react';
import { 
  ShieldAlert, Lock, ArrowRight, CheckCircle2, AlertTriangle, 
  X, Users, Sparkles, Building2, ExternalLink 
} from 'lucide-react';
import { EmployeeCapExceededError, BulkImportRowResult } from '../services/employeeCapGuard';

interface UpgradePaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToBilling: () => void;
  errorPayload?: EmployeeCapExceededError | {
    currentCount: number;
    cap: number;
    hardCapLimit: number;
    softCapLimit: number;
    overageCount: number;
    planCode: string;
    upgradeUrl?: string;
    message?: string;
    rowReport?: BulkImportRowResult[];
  } | null;
}

export const UpgradePaywallModal: React.FC<UpgradePaywallModalProps> = ({
  isOpen,
  onClose,
  onNavigateToBilling,
  errorPayload
}) => {
  if (!isOpen || !errorPayload) return null;

  const {
    currentCount,
    cap,
    hardCapLimit,
    overageCount,
    planCode,
    rowReport
  } = errorPayload;

  const nextTierName = planCode === 'FREE' 
    ? 'Growth Business Plan (50 Workers)' 
    : planCode === 'GROWTH' 
      ? 'Agency Pro Plan (100 Workers)' 
      : 'Enterprise Scale (Unlimited)';

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl p-6 sm:p-7 shadow-2xl relative animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200 transition-colors"
          aria-label="Close paywall modal"
        >
          <X size={18} />
        </button>

        {/* PAYWALL HEADER */}
        <div className="text-center mb-6 mt-1">
          <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-xs border border-rose-100">
            <Lock size={28} />
          </div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-mono">
            EMPLOYEE_CAP_EXCEEDED
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 mt-2">
            Workforce Hard Cap Reached
          </h2>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto leading-relaxed">
            Your organization has exceeded the allowable capacity limit for the{' '}
            <strong className="text-gray-900 font-mono">{planCode}</strong> plan.
          </p>
        </div>

        {/* CAP COMPARISON STRIP */}
        <div className="grid grid-cols-3 gap-2.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-center font-mono text-xs mb-5">
          <div className="p-2 bg-white rounded-xl border border-slate-100">
            <span className="text-[10px] text-gray-400 block uppercase font-sans font-bold">Base Cap</span>
            <span className="text-sm font-extrabold text-gray-700">{cap} staff</span>
          </div>
          <div className="p-2 bg-white rounded-xl border border-slate-100">
            <span className="text-[10px] text-amber-600 block uppercase font-sans font-bold">+10% Buffer</span>
            <span className="text-sm font-extrabold text-amber-700">{hardCapLimit} max</span>
          </div>
          <div className="p-2 bg-rose-50 rounded-xl border border-rose-200">
            <span className="text-[10px] text-rose-600 block uppercase font-sans font-bold">Current</span>
            <span className="text-sm font-black text-rose-700">{currentCount} active</span>
          </div>
        </div>

        {/* EXPLANATION */}
        <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 text-xs text-slate-700 space-y-2 mb-5">
          <div className="flex items-start gap-2">
            <ShieldAlert size={16} className="text-rose-500 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Server-Side Guard Invariant:</strong> To guarantee cloud stability and billing integrity, new worker registrations are strictly blocked once the 110% hard cap is breached.
            </p>
          </div>
          <p className="text-[11px] text-slate-500 pl-6 leading-relaxed">
            Inactive or archived workers do not count toward this limit. You can either upgrade your plan immediately or archive inactive staff members to free up capacity.
          </p>
        </div>

        {/* BULK IMPORT ROW-LEVEL REPORT (IF BATCH FAILED) */}
        {rowReport && rowReport.length > 0 && (
          <div className="mb-5 border border-rose-200 rounded-2xl p-3 bg-rose-50/40 text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-rose-950 text-xs flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-rose-600" /> Bulk Import Batch Report
              </span>
              <span className="text-[10px] text-rose-700 font-mono">
                Entire batch rejected (all-or-nothing)
              </span>
            </div>
            <div className="max-h-36 overflow-y-auto divide-y divide-rose-100 bg-white rounded-xl border border-rose-100 text-[11px]">
              {rowReport.map((row) => (
                <div key={row.rowIndex} className="p-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-gray-400">#{row.rowIndex}</span>
                    <span className="font-semibold text-gray-800">{row.workerName}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    row.allowed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {row.reason}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ACTIONS */}
        <div className="space-y-2 pt-2">
          <button
            onClick={() => {
              onClose();
              onNavigateToBilling();
            }}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
          >
            <span>Upgrade to {nextTierName}</span>
            <ArrowRight size={15} />
          </button>

          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors text-center"
          >
            Deactivate or Archive Existing Workers Instead
          </button>
        </div>
      </div>
    </div>
  );
};
