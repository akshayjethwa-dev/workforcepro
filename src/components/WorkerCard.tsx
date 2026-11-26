import React from 'react';
import {
  Edit2,
  Trash2,
  IndianRupee,
  UserCheck,
  Camera,
  Sparkles,
  Calendar,
  Clock,
  Key,
  UserX,
  RotateCcw,
  Smartphone,
  Landmark,
} from 'lucide-react';
import {
  Worker,
  OrgSettings,
  MagicLinkScope,
  FnfSettlementRecord,
  ActiveLoan,
} from '../types/index';
import { validateWorkerWageStructure } from '../services/wageStructureValidationService';
import { FnfDeadlineBadge } from './FnfDeadlineBadge';
import { TruncatedText, TruncatedDetailItem } from './TruncatedText';

export interface WorkerCardProps {
  worker: Worker;
  settings: OrgSettings | null;
  latestFnf?: FnfSettlementRecord;
  activeLoans?: ActiveLoan[];
  wageAudit: ReturnType<typeof validateWorkerWageStructure> | null;
  activeTokensCount: number;
  isInactive: boolean;
  isOwner: boolean;
  allowancesEnabled: boolean;
  onEdit: (worker: Worker) => void;
  onExit: (worker: Worker) => void;
  onReactivate: (worker: Worker) => void;
  onDelete: (worker: Worker) => void;
  onOpenEwa: (worker: Worker) => void;
  onOpenAdvance: (worker: Worker) => void;
  onOpenMagicLink: (worker: Worker, scope: MagicLinkScope) => void;
  onOpenAccess: (worker: Worker) => void;
  onOpenWageStructure: (worker: Worker) => void;
  onOpenFnfGratuity?: (workerId: string) => void;
}

export const WorkerCard: React.FC<WorkerCardProps> = ({
  worker,
  settings,
  latestFnf,
  activeLoans,
  wageAudit,
  activeTokensCount,
  isInactive,
  isOwner,
  allowancesEnabled,
  onEdit,
  onExit,
  onReactivate,
  onDelete,
  onOpenEwa,
  onOpenAdvance,
  onOpenMagicLink,
  onOpenAccess,
  onOpenWageStructure,
  onOpenFnfGratuity,
}) => {
  const hasFace = Boolean(worker.faceDescriptor);
  const daily =
    worker.dailyWage ??
    (worker.wageConfig?.type === 'DAILY' ? worker.wageConfig?.amount : undefined);
  const monthly =
    worker.monthlySalary ??
    (worker.wageConfig?.type === 'MONTHLY' ? worker.wageConfig?.amount : undefined);
  const rateStr = daily
    ? `₹${daily.toLocaleString()} / day`
    : monthly
    ? `₹${monthly.toLocaleString()} / mo`
    : 'Rate unassigned';

  const statusLabel = isInactive
    ? worker.status === 'RESIGNED'
      ? 'Resigned'
      : worker.status === 'TERMINATED'
      ? 'Terminated'
      : 'Exited'
    : 'Active';

  const branchName = settings?.branches?.find((b) => b.id === worker.branchId)?.name;
  const workerEmail = (worker as any).email as string | undefined;

  const modalDetails: TruncatedDetailItem[] = [
    { label: 'Status', value: statusLabel },
    { label: 'Pay Rate', value: rateStr, mono: true },
    { label: 'Phone', value: worker.phone || 'No phone recorded', mono: true },
    ...(workerEmail
      ? [{ label: 'Email', value: workerEmail, breakAnywhere: true }]
      : []),
    ...(branchName ? [{ label: 'Branch / Unit', value: branchName }] : []),
    ...(worker.department ? [{ label: 'Department', value: worker.department }] : []),
    ...(worker.uan
      ? [{ label: 'UAN', value: worker.uan, mono: true, breakAnywhere: true }]
      : []),
    { label: 'Worker ID', value: worker.id, mono: true, breakAnywhere: true },
  ];

  return (
    <article
      className={`min-w-0 w-full bg-white p-4 sm:p-5 rounded-2xl border transition-all flex flex-col justify-between group ${
        isInactive
          ? 'border-rose-200/80 bg-rose-50/10 opacity-95'
          : 'border-slate-200/80 hover:border-slate-300 shadow-xs'
      }`}
    >
      <div className="min-w-0">
        {/* WORKER HEADER ROW: flex-wrap + min-w-0 prevents long names from pushing action buttons out of bounds */}
        <div className="flex items-start justify-between gap-2.5 flex-wrap xs:flex-nowrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden relative shrink-0 flex items-center justify-center">
              {worker.photoUrl ? (
                <img
                  src={worker.photoUrl}
                  alt={worker.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <span className="text-fluid-base font-bold text-slate-600 font-mono">
                  {worker.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className="min-w-0 flex-1 font-bold text-fluid-sm text-slate-900 group-hover:text-blue-600 transition-colors leading-snug">
                  <TruncatedText
                    text={worker.name}
                    modalTitle="Worker Full Name & Profile"
                    subtitle={worker.designation || 'Factory Operator'}
                    details={modalDetails}
                    className="font-bold text-fluid-sm text-slate-900 group-hover:text-blue-600"
                  />
                </h3>
                {isInactive ? (
                  <span className="shrink-0 text-fluid-2xs font-extrabold uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">
                    {statusLabel}
                  </span>
                ) : (
                  <span className="shrink-0 text-fluid-2xs font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                    Active
                  </span>
                )}
              </div>
              <div className="text-fluid-xs text-slate-500 mt-0.5 min-w-0">
                <TruncatedText
                  text={worker.designation || 'Factory Operator'}
                  modalTitle="Role & Assignment"
                  subtitle={worker.name}
                  details={modalDetails}
                  className="text-fluid-xs text-slate-500"
                />
              </div>
            </div>
          </div>

          {/* ACTIONS: Edit, Exit/Reactivate & Delete */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onEdit(worker)}
              title="Edit profile & wage"
              aria-label={`Edit ${worker.name}`}
              className="p-1.5 min-w-[2.25rem] min-h-[2.25rem] flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
            >
              <Edit2 size={15} className="shrink-0" />
            </button>

            {isInactive ? (
              <button
                type="button"
                onClick={() => onReactivate(worker)}
                title="Reactivate worker profile"
                aria-label={`Reactivate ${worker.name}`}
                className="p-1.5 min-w-[2.25rem] min-h-[2.25rem] flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw size={15} className="shrink-0" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onExit(worker)}
                title="Mark Resigned / Terminated & Trigger Automated FnF"
                aria-label={`Exit ${worker.name}`}
                className="p-1.5 min-w-[2.25rem] min-h-[2.25rem] flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
              >
                <UserX size={15} className="shrink-0" />
              </button>
            )}

            {isOwner && (
              <button
                type="button"
                onClick={() => onDelete(worker)}
                title="Remove worker"
                aria-label={`Delete ${worker.name}`}
                className="p-1.5 min-w-[2.25rem] min-h-[2.25rem] flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 size={15} className="shrink-0" />
              </button>
            )}
          </div>
        </div>

        {/* WORKER METADATA STRIP: flex-wrap & min-w-0 handle 200% zoom and longer regional strings */}
        <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-fluid-xs text-slate-600">
          <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
            <span className="text-slate-400 text-fluid-2xs">Pay Rate</span>
            <span className="font-mono font-bold text-slate-900 tabular-nums break-words">
              {rateStr}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
            <span className="text-slate-400 text-fluid-2xs">Phone</span>
            <span className="font-mono text-slate-600 tabular-nums break-all [overflow-wrap:anywhere]">
              {worker.phone || 'No phone recorded'}
            </span>
          </div>

          {workerEmail && (
            <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
              <span className="text-slate-400 text-fluid-2xs">Email</span>
              <span className="text-slate-600 text-fluid-2xs break-all [overflow-wrap:anywhere] text-right">
                {workerEmail}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 flex-wrap pt-1 text-fluid-2xs min-w-0">
            <span className="text-slate-400">Biometric Verification</span>
            <span
              className={`font-medium flex items-center gap-1 min-w-0 ${
                hasFace ? 'text-emerald-700' : 'text-slate-500'
              }`}
            >
              {hasFace ? (
                <>
                  <UserCheck size={12} className="text-emerald-600 shrink-0" />
                  <span className="break-words">Face Enrolled</span>
                </>
              ) : (
                <>
                  <Camera size={12} className="text-slate-400 shrink-0" />
                  <span className="break-words">QR Code Only</span>
                </>
              )}
            </span>
          </div>

          {worker.leaveBalances && (
            <div className="flex items-center justify-between gap-2 flex-wrap pt-1.5 border-t border-slate-100 text-fluid-2xs min-w-0">
              <span className="text-slate-400 flex items-center gap-1">
                <Calendar size={11} className="text-indigo-500 shrink-0" />
                <span>
                  Leave Bal
                  {worker.leaveBalances.migrationDate ? ` (${worker.leaveBalances.migrationDate})` : ''}
                </span>
              </span>
              <span className="font-mono font-bold tabular-nums flex items-center gap-1.5 flex-wrap">
                <span className={worker.leaveBalances.pl < 0 ? 'text-rose-600' : 'text-slate-700'}>
                  EL {worker.leaveBalances.pl}
                </span>
                <span className="text-slate-300">·</span>
                <span className={worker.leaveBalances.sl < 0 ? 'text-rose-600' : 'text-slate-700'}>
                  SL {worker.leaveBalances.sl}
                </span>
                <span className="text-slate-300">·</span>
                <span className={worker.leaveBalances.cl < 0 ? 'text-rose-600' : 'text-slate-700'}>
                  CL {worker.leaveBalances.cl}
                </span>
              </span>
            </div>
          )}

          {activeLoans && activeLoans.length > 0 && (() => {
            const totalEmi = activeLoans.reduce(
              (sum, l) => sum + Math.min(l.monthlyEmi, l.outstandingPrincipal),
              0
            );
            const totalBal = activeLoans.reduce((sum, l) => sum + l.outstandingPrincipal, 0);
            return (
              <div className="flex items-center justify-between gap-2 flex-wrap pt-1.5 border-t border-slate-100 text-fluid-2xs min-w-0">
                <span className="text-slate-400 flex items-center gap-1">
                  <Landmark size={11} className="text-amber-600 shrink-0" />
                  <span>
                    Active Loan{activeLoans.length > 1 ? `s (${activeLoans.length})` : ''}
                  </span>
                </span>
                <span className="font-mono font-bold tabular-nums text-amber-800 flex items-center gap-1.5 flex-wrap">
                  <span>EMI ₹{Math.round(totalEmi).toLocaleString('en-IN')}/mo</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-600">
                    Bal ₹{Math.round(totalBal).toLocaleString('en-IN')}
                  </span>
                </span>
              </div>
            );
          })()}

          {latestFnf && (
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
                <FnfDeadlineBadge record={latestFnf} orgSettings={settings} compact />
                {onOpenFnfGratuity && (
                  <button
                    type="button"
                    onClick={() => onOpenFnfGratuity(worker.id)}
                    className="text-fluid-2xs font-bold text-blue-700 hover:text-blue-900 cursor-pointer break-words"
                  >
                    Open FnF ({latestFnf.status}) →
                  </button>
                )}
              </div>
            </div>
          )}

          {wageAudit && wageAudit.hasAnyViolation && (
            <div className="pt-1.5 flex items-center justify-between gap-2 flex-wrap min-w-0">
              <div className="flex items-center gap-1 flex-wrap min-w-0">
                {wageAudit.isFiftyPercentNonCompliant && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 font-mono font-bold text-fluid-2xs break-words">
                    NON_COMPLIANT · Gap ₹{wageAudit.gapAmount.toLocaleString('en-IN')}
                  </span>
                )}
                {wageAudit.isMinimumWageViolation && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-mono font-bold text-fluid-2xs">
                    MIN_WAGE
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onOpenWageStructure(worker)}
                className="text-fluid-2xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                Fix Structure
              </button>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM ACTIONS: EWA Accrued Wages + Kharchi / Advance */}
      <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-1 xs:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onOpenEwa(worker)}
          className="min-w-0 min-h-[2.5rem] py-2 px-2.5 rounded-xl text-fluid-xs font-bold transition-all active:scale-98 flex items-center justify-center gap-1.5 flex-wrap bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs cursor-pointer"
          title="Real-time Accrued Wage Balance & EWA Withdrawal"
        >
          <IndianRupee size={13} className="text-emerald-700 shrink-0" />
          <span className="truncate">EWA Access</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenAdvance(worker)}
          className={`min-w-0 min-h-[2.5rem] py-2 px-2.5 rounded-xl text-fluid-xs font-semibold transition-all active:scale-98 flex items-center justify-center gap-1.5 flex-wrap ${
            allowancesEnabled
              ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 cursor-pointer'
              : 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
          }`}
        >
          <span className="truncate">Kharchi</span>
        </button>
      </div>

      {/* ONE-TAP MAGIC LINK ACTIONS */}
      <div className="mt-3 pt-2.5 border-t border-slate-100">
        <div className="flex items-center justify-between gap-2 flex-wrap text-fluid-2xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
          <span className="flex items-center gap-1 text-slate-500 min-w-0">
            <Sparkles size={11} className="text-amber-500 shrink-0" />
            <span className="truncate">One-Tap Magic Links</span>
          </span>
          <span className="text-fluid-2xs text-emerald-600 font-semibold lowercase shrink-0">
            WhatsApp • SMS
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <button
            type="button"
            disabled={isInactive}
            onClick={() => onOpenMagicLink(worker, 'PAYSLIP')}
            className="min-w-0 min-h-[2.25rem] py-1.5 px-2 rounded-xl text-fluid-2xs font-semibold bg-blue-50/80 hover:bg-blue-100 disabled:opacity-40 text-blue-700 border border-blue-200/80 flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
            title={isInactive ? 'Worker is inactive' : 'Send Payslip to Worker via WhatsApp or SMS'}
          >
            <IndianRupee size={11} className="text-blue-600 shrink-0" />
            <span className="truncate">Payslip</span>
          </button>

          <button
            type="button"
            disabled={isInactive}
            onClick={() => onOpenMagicLink(worker, 'SCHEDULE')}
            className="min-w-0 min-h-[2.25rem] py-1.5 px-2 rounded-xl text-fluid-2xs font-semibold bg-indigo-50/80 hover:bg-indigo-100 disabled:opacity-40 text-indigo-700 border border-indigo-200/80 flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
            title={isInactive ? 'Worker is inactive' : 'Send Duty Schedule to Worker via WhatsApp or SMS'}
          >
            <Calendar size={11} className="text-indigo-600 shrink-0" />
            <span className="truncate">Schedule</span>
          </button>

          <button
            type="button"
            disabled={isInactive}
            onClick={() => onOpenMagicLink(worker, 'ATTENDANCE_SUMMARY')}
            className="min-w-0 min-h-[2.25rem] py-1.5 px-2 rounded-xl text-fluid-2xs font-semibold bg-emerald-50/80 hover:bg-emerald-100 disabled:opacity-40 text-emerald-700 border border-emerald-200/80 flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
            title={
              isInactive ? 'Worker is inactive' : 'Send Attendance Summary to Worker via WhatsApp or SMS'
            }
          >
            <Clock size={11} className="text-emerald-600 shrink-0" />
            <span className="truncate">Attendance</span>
          </button>

          <button
            type="button"
            disabled={isInactive}
            onClick={() => onOpenMagicLink(worker, 'PUNCH')}
            className="min-w-0 min-h-[2.25rem] py-1.5 px-2 rounded-xl text-fluid-2xs font-semibold bg-purple-50/80 hover:bg-purple-100 disabled:opacity-40 text-purple-700 border border-purple-200/80 flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
            title={
              isInactive
                ? 'Worker is inactive'
                : 'Send One-Tap Mobile Punch Link to Worker via WhatsApp or SMS'
            }
          >
            <Smartphone size={11} className="text-purple-600 shrink-0" />
            <span className="truncate">Punch</span>
          </button>
        </div>

        {/* WORKER ACCESS, BOUND DEVICES & DPDP AUDIT BUTTON */}
        <button
          type="button"
          onClick={() => onOpenAccess(worker)}
          className="w-full mt-2 min-h-[2.5rem] py-2 px-3 rounded-xl text-fluid-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200/80 hover:border-slate-300 flex items-center justify-between gap-2 flex-wrap text-slate-700 transition-all cursor-pointer shadow-2xs"
          title="Inspect active magic tokens, bound devices, revocation audit log & DPDP subject-access report"
        >
          <span className="flex items-center gap-1.5 text-slate-800 font-bold min-w-0">
            <Key size={13} className="text-indigo-600 shrink-0" />
            <span className="truncate">Worker Access &amp; Audit</span>
          </span>
          <span className="font-mono text-fluid-2xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/70 px-2 py-0.5 rounded-md shrink-0">
            {activeTokensCount} active
          </span>
        </button>
      </div>
    </article>
  );
};
