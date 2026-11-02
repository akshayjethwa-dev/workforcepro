import React, { useState, useMemo } from 'react';
import { 
  X, 
  IndianRupee, 
  AlertTriangle, 
  ShieldCheck, 
  Clock, 
  ArrowRight, 
  CheckCircle2, 
  Calendar, 
  Lock, 
  Info, 
  TrendingUp, 
  RefreshCw, 
  Zap, 
  Building2 
} from 'lucide-react';
import { Worker, AttendanceRecord, Advance, OrgSettings } from '../types/index';
import { ewaService } from '../services/ewaService';
import { triggerFrontlineHaptic } from '../utils/frontlineTouch';
import { useToast } from '../contexts/ToastContext';

interface WorkerEwaModalProps {
  isOpen: boolean;
  onClose: () => void;
  worker: Worker;
  tenantId: string;
  attendanceRecords: AttendanceRecord[];
  advances: Advance[];
  orgSettings: OrgSettings;
  onAdvanceCreated?: (newAdvance: Advance) => void;
}

export const WorkerEwaModal: React.FC<WorkerEwaModalProps> = ({
  isOpen,
  onClose,
  worker,
  tenantId,
  attendanceRecords,
  advances,
  orgSettings,
  onAdvanceCreated
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'REQUEST' | 'HISTORY'>('REQUEST');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [requestedAmount, setRequestedAmount] = useState<number>(1000);
  const [reason, setReason] = useState<string>('Medical & Health Emergency');
  const [otherReasonText, setOtherReasonText] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Calculate live accrued-wage balance
  const balance = useMemo(() => {
    return ewaService.calculateAccruedWageBalance(
      worker, 
      attendanceRecords, 
      advances, 
      orgSettings
    );
  }, [worker, attendanceRecords, advances, orgSettings]);

  // Dynamic fee calculation based on regulatory provider
  const fee = useMemo(() => {
    if (balance.providerInfo.feeType === 'FLAT') {
      return balance.providerInfo.feeValue;
    }
    return Math.round((requestedAmount * balance.providerInfo.feeValue) / 100);
  }, [requestedAmount, balance.providerInfo]);

  const netDisbursal = Math.max(0, requestedAmount - fee);

  // Filter EWA history for this worker
  const ewaHistory = useMemo(() => {
    return advances
      .filter(a => a.workerId === worker.id && a.isEwa)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [advances, worker.id]);

  if (!isOpen) return null;

  const handlePercentageSelect = (pct: number) => {
    triggerFrontlineHaptic('light');
    const amt = Math.floor(balance.maxWithdrawableAmount * (pct / 100));
    setRequestedAmount(Math.max(100, Math.min(balance.maxWithdrawableAmount, amt)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (balance.isPayrollLocked) {
      toast.error(balance.payrollLockMessage || 'EWA locked during payroll processing.');
      return;
    }

    if (requestedAmount <= 0) {
      toast.error('Withdrawal amount must be greater than ₹0.');
      return;
    }

    if (requestedAmount > balance.maxWithdrawableAmount) {
      if (balance.hasPendingLocalPunches) {
        toast.error(`Blocked against unconfirmed local punches. Balance may increase after sync.`);
      } else {
        toast.error(`Max allowed withdrawal is ₹${balance.maxWithdrawableAmount.toLocaleString()}.`);
      }
      return;
    }

    setIsSubmitting(true);
    triggerFrontlineHaptic('confirm');

    try {
      const finalReason = reason === 'Other' ? (otherReasonText || 'Emergency cash need') : reason;
      const res = await ewaService.requestEwaWithdrawal({
        tenantId,
        worker,
        amount: requestedAmount,
        reason: finalReason,
        attendanceRecords,
        advances,
        orgSettings
      });

      if (res.success && res.advance) {
        toast.success(`EWA withdrawal requested: ₹${requestedAmount.toLocaleString()} sent to Action Inbox for approval!`);
        if (onAdvanceCreated) {
          onAdvanceCreated(res.advance);
        }
        setActiveTab('HISTORY');
      } else {
        toast.error(res.error || 'Failed to submit withdrawal request.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error processing EWA request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />

      <div className="relative bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] z-10">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <IndianRupee size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 tracking-tight">Earned Wage Access (EWA)</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Live Accrual
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {worker.name} • {worker.designation || 'Staff'} ({worker.category})
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              triggerFrontlineHaptic('light');
              onClose();
            }}
            className="w-10 h-10 rounded-xl hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 pt-3 bg-white border-b border-slate-200 flex gap-4">
          <button
            type="button"
            onClick={() => {
              triggerFrontlineHaptic('light');
              setActiveTab('REQUEST');
            }}
            className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'REQUEST'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Request Withdrawal
          </button>
          <button
            type="button"
            onClick={() => {
              triggerFrontlineHaptic('light');
              setActiveTab('HISTORY');
            }}
            className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'HISTORY'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Timeline & History</span>
            {ewaHistory.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[10px] flex items-center justify-center font-bold">
                {ewaHistory.length}
              </span>
            )}
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* ACCRUED-WAGE BALANCE HERO CARD */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
              <span>Real-Time Earned Wages ({balance.month})</span>
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <CheckCircle2 size={13} />
                {balance.confirmedAttendanceCount} Confirmed Days
              </span>
            </div>

            <div className="flex items-baseline justify-between mt-1">
              <div>
                <div className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-white">
                  ₹{balance.netAccruedBalance.toLocaleString()}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Available for instant withdrawal (up to {balance.maxAllowedPercentage}% limit):{' '}
                  <strong className="text-emerald-400">₹{balance.maxWithdrawableAmount.toLocaleString()}</strong>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors cursor-pointer"
              >
                {showBreakdown ? 'Hide Breakdown' : 'View Breakdown'}
              </button>
            </div>

            {/* Expandable Accrual Math Breakdown */}
            {showBreakdown && (
              <div className="mt-4 pt-3 border-t border-slate-800 text-xs space-y-1.5 animate-in fade-in duration-150">
                <div className="flex justify-between text-slate-300">
                  <span>Gross Earned (Confirmed Attendance):</span>
                  <span className="font-mono font-bold text-white">₹{balance.grossAccrued.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Estimated Statutory Reserve (EPF/ESI/PT):</span>
                  <span className="font-mono text-rose-300">-₹{balance.statutoryDeductionsEstimate.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Existing Month Advances / EWA:</span>
                  <span className="font-mono text-rose-300">-₹{balance.existingAdvances.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-emerald-300 font-bold pt-1 border-t border-slate-800">
                  <span>Net Accrued Wage Balance:</span>
                  <span className="font-mono text-white">₹{balance.netAccruedBalance.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>

          {/* EDGE CASE 1: Unsynced attendance records warning & block */}
          {balance.hasPendingLocalPunches && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 leading-relaxed">
                <strong className="font-bold">Balance may increase after sync:</strong>{' '}
                {balance.pendingLocalCount} attendance punch(es) valued at approximately{' '}
                <strong className="font-mono font-bold">₹{balance.pendingLocalEstimatedAmount.toLocaleString()}</strong>{' '}
                are currently stored locally on this device. EWA withdrawal requests against unverified offline records are blocked until synchronization completes.
              </div>
            </div>
          )}

          {/* EDGE CASE 2: Mid-Cycle Salary Revision Notice */}
          {balance.hasSalaryRevision && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <TrendingUp size={15} className="text-blue-600" />
                <span>Mid-Cycle Salary Revision Effective {balance.salaryRevisionDate}</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Pre-revision rate ({balance.preRevisionDays} days): <strong className="font-mono text-slate-800">₹{balance.preRevisionRate}/day</strong>. 
                Revised current rate ({balance.postRevisionDays} days): <strong className="font-mono text-slate-800">₹{balance.currentRate}/day</strong>. 
                Accruals are calculated strictly without retroactive distortion.
              </p>
            </div>
          )}

          {/* EDGE CASE 3: Full & Final (FnF) Exit Notice */}
          {balance.isFnFSettlement && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-950 flex items-start gap-2.5">
              <Info size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Full & Final (FnF) Settlement Clearance Active:</strong>{' '}
                Worker exit date is recorded as <span className="font-mono font-bold">{balance.fnfExitDate}</span>. Any approved EWA withdrawal will surface as an itemized recovery line item on the final settlement clearance payslip.
              </div>
            </div>
          )}

          {/* EDGE CASE 4: Payroll Processing Lock Window Banner */}
          {balance.isPayrollLocked && (
            <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl text-xs text-rose-950 flex items-start gap-3">
              <Lock size={20} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-black text-sm text-rose-900 mb-0.5">Payroll Processing Lock Active</div>
                <p className="leading-relaxed font-medium">
                  {balance.payrollLockMessage}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'REQUEST' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Withdrawal Amount Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-800">Withdrawal Amount</label>
                  <span className="text-slate-500 font-medium">
                    Max: <strong className="text-slate-900 font-mono">₹{balance.maxWithdrawableAmount.toLocaleString()}</strong>
                  </span>
                </div>

                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">₹</span>
                  <input
                    type="number"
                    min={100}
                    max={balance.maxWithdrawableAmount}
                    step={100}
                    disabled={balance.isPayrollLocked || balance.maxWithdrawableAmount <= 0}
                    value={requestedAmount}
                    onChange={(e) => setRequestedAmount(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full h-14 pl-9 pr-4 rounded-2xl border-2 border-slate-300 focus:border-emerald-600 focus:ring-0 text-xl font-mono font-bold text-slate-900 disabled:bg-slate-100 disabled:text-slate-400 transition-colors"
                  />
                </div>

                {/* Percentage Quick-Picks */}
                <div className="flex gap-2 pt-1">
                  {[
                    { label: '25%', value: 25 },
                    { label: '50%', value: 50 },
                    { label: 'Max', value: 100 }
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      disabled={balance.isPayrollLocked || balance.maxWithdrawableAmount <= 0}
                      onClick={() => handlePercentageSelect(p.value)}
                      className="flex-1 h-9 rounded-xl border border-slate-300 hover:border-emerald-600 hover:bg-emerald-50 active:scale-95 text-xs font-bold text-slate-700 transition-all cursor-pointer disabled:opacity-40"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Purpose / Reason */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">Emergency Purpose</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={balance.isPayrollLocked}
                  className="w-full h-12 px-3 rounded-xl border border-slate-300 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                >
                  <option value="Medical & Health Emergency">Medical & Health Emergency</option>
                  <option value="Family Necessity / School Fees">Family Necessity / School Fees</option>
                  <option value="Travel / Urgent Commute">Travel / Urgent Commute</option>
                  <option value="Weekly Grocery & Ration">Weekly Grocery & Ration</option>
                  <option value="Other">Other Emergency</option>
                </select>

                {reason === 'Other' && (
                  <input
                    type="text"
                    value={otherReasonText}
                    onChange={(e) => setOtherReasonText(e.target.value)}
                    placeholder="Enter specific emergency reason..."
                    className="w-full h-10 px-3 mt-2 rounded-xl border border-slate-300 text-xs text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                  />
                )}
              </div>

              {/* EDGE CASE 5: Regulatory Lender & Disbursal Partner Disclosure */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-900 font-bold">
                  <span className="flex items-center gap-1.5">
                    <Building2 size={14} className="text-blue-600" />
                    <span>Lender & Disbursal Partner</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    {balance.providerInfo.providerName}
                  </span>
                </div>

                <div className="text-[11px] text-slate-600 leading-relaxed">
                  {balance.providerInfo.disclosureNote}
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-medium">
                  <span className="text-slate-600">Fixed Facilitation Fee:</span>
                  <span className="font-mono font-bold text-slate-900">₹{fee}</span>
                </div>

                <div className="flex items-center justify-between font-bold text-emerald-800 text-sm">
                  <span>Net Payout to Bank / UPI:</span>
                  <span className="font-mono text-base text-emerald-700">₹{netDisbursal.toLocaleString()}</span>
                </div>
              </div>

              {/* Action Inbox Notice */}
              <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-center gap-2">
                <Info size={14} className="text-blue-600 shrink-0" />
                <span>
                  Withdrawals flow to the <strong>E3 Action Inbox</strong> for one-tap supervisor approval, with automatic itemization on upcoming payslips.
                </span>
              </div>

              {/* Submit Button (>= 56px touch target for frontline workers) */}
              <button
                type="submit"
                disabled={
                  isSubmitting || 
                  balance.isPayrollLocked || 
                  balance.maxWithdrawableAmount <= 0 ||
                  requestedAmount <= 0 ||
                  requestedAmount > balance.maxWithdrawableAmount
                }
                className="w-full min-h-[56px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-sm transition-all disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    <span>Routing to Action Inbox...</span>
                  </>
                ) : (
                  <>
                    <Zap size={18} />
                    <span>Request Instant EWA (₹{requestedAmount.toLocaleString()})</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            /* HISTORY & 4-STEP TIMELINE VIEW */
            <div className="space-y-3">
              {ewaHistory.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200">
                  <Clock size={32} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700">No Earned Wage Access requests yet.</p>
                  <p className="text-[11px] text-slate-500 mt-1">Submit your first emergency withdrawal above.</p>
                </div>
              ) : (
                ewaHistory.map((adv) => {
                  const details = adv.ewaDetails;
                  const currentStage = details?.timelineStage || (adv.status === 'APPROVED' ? 'APPROVED' : 'REQUESTED');
                  const stages: { key: string; label: string }[] = [
                    { key: 'REQUESTED', label: 'Requested' },
                    { key: 'APPROVED', label: 'Approved' },
                    { key: 'DISBURSED', label: 'Disbursed' },
                    { key: 'ADJUSTED_IN_PAYSLIP', label: 'In Payslip' }
                  ];
                  const stageOrder = ['REQUESTED', 'APPROVED', 'DISBURSED', 'ADJUSTED_IN_PAYSLIP'];
                  const currentIndex = stageOrder.indexOf(currentStage);

                  return (
                    <div 
                      key={adv.id}
                      className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-black text-slate-900 font-mono">
                              ₹{adv.amount.toLocaleString()}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              adv.status === 'APPROVED'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : adv.status === 'REJECTED'
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}>
                              {adv.status || 'PENDING'}
                            </span>
                            {details?.isFnFSettlement && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                FnF
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {adv.reason} • Ref: <span className="font-mono text-slate-700">{adv.id.slice(-6).toUpperCase()}</span>
                          </div>
                        </div>

                        <div className="text-right text-[11px] text-slate-400">
                          {adv.date}
                        </div>
                      </div>

                      {/* 4-Step Visual Progress Stepper */}
                      <div className="pt-1">
                        <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
                          {stages.map((st, idx) => {
                            const isDone = currentIndex >= idx;
                            const isCurrent = currentStage === st.key;

                            return (
                              <div
                                key={st.key}
                                className={`p-1.5 rounded-lg border font-bold ${
                                  isCurrent
                                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                                    : isDone
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-slate-100 text-slate-400 border-slate-200'
                                }`}
                              >
                                <div className="text-[11px] mb-0.5">{idx + 1}</div>
                                <div>{st.label}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Itemized Payslip Deduction Line */}
                      <div className="p-2 bg-slate-50 rounded-lg text-[11px] text-slate-600 border border-slate-200 flex items-center justify-between">
                        <span>Payslip Deduction Line:</span>
                        <code className="font-mono text-[10px] text-slate-800 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                          {details?.isFnFSettlement 
                            ? `Full & Final Settlement: EWA Recovery (${adv.date})`
                            : `Earned Wage Access (${adv.date}) [Ref: ${adv.id.slice(-6).toUpperCase()}]`}
                        </code>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
