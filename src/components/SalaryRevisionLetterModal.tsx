import React, { useState, useEffect } from 'react';
import { X, Copy, Printer, Download, FileText, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { CtcSimulationWorkerPlan } from '../types/index';
import { generateSalaryRevisionLetterText } from '../services/ctcSimulatorService';
import { useToast } from '../contexts/ToastContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  plans: CtcSimulationWorkerPlan[];
  initialWorkerId?: string;
  effectiveDate: string;
  templateLabel: string;
  cbaOverrideRef?: string;
}

export const SalaryRevisionLetterModal: React.FC<Props> = ({
  isOpen,
  onClose,
  companyName,
  plans,
  initialWorkerId,
  effectiveDate,
  templateLabel,
  cbaOverrideRef,
}) => {
  const { toast } = useToast();
  const [activeIndex, setActiveIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || plans.length === 0) return;
    if (initialWorkerId) {
      const idx = plans.findIndex((p) => p.workerId === initialWorkerId);
      setActiveIndex(idx >= 0 ? idx : 0);
    } else {
      setActiveIndex(0);
    }
    setCopied(false);
  }, [isOpen, initialWorkerId, plans]);

  if (!isOpen || plans.length === 0) return null;

  const activePlan = plans[Math.min(activeIndex, plans.length - 1)];
  const sim = activePlan.simulation;
  const letterText = generateSalaryRevisionLetterText({
    companyName,
    plan: activePlan,
    effectiveDate,
    templateLabel,
    cbaOverrideRef,
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(letterText);
      setCopied(true);
      toast.success(`Revision letter copied for ${activePlan.workerName}`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Clipboard permission unavailable. Please select text manually or download.');
    }
  };

  const handleDownloadTxt = () => {
    const content =
      plans.length > 1
        ? plans
            .map((p) =>
              generateSalaryRevisionLetterText({
                companyName,
                plan: p,
                effectiveDate,
                templateLabel,
                cbaOverrideRef,
              })
            )
            .join('\n\n================================================================\n\n')
        : letterText;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      plans.length > 1
        ? `Salary_Revision_Letters_Batch_${effectiveDate}.txt`
        : `Salary_Revision_Letter_${activePlan.workerName.replace(/\s+/g, '_')}_${effectiveDate}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(
      plans.length > 1
        ? `Downloaded ${plans.length} salary revision letters.`
        : `Downloaded revision letter for ${activePlan.workerName}.`
    );
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:bg-white print:p-0">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] print:max-h-none print:shadow-none print:border-0">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/70 print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <FileText size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 truncate">
                Salary Revision Letter Template
              </h3>
              <p className="text-xs text-slate-500 truncate font-mono tabular-nums">
                {activePlan.workerName} · {templateLabel} · Effective {effectiveDate}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {plans.length > 1 && (
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setActiveIndex((prev) => (prev - 1 + plans.length) % plans.length)}
                  className="p-0.5 text-slate-500 hover:text-slate-900 cursor-pointer"
                  aria-label="Previous employee"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="px-1.5 font-semibold text-slate-700 tabular-nums">
                  {activeIndex + 1} / {plans.length}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveIndex((prev) => (prev + 1) % plans.length)}
                  className="p-0.5 text-slate-500 hover:text-slate-900 cursor-pointer"
                  aria-label="Next employee"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Letter Content (Printable) */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-5 text-slate-800 text-xs leading-relaxed">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b border-slate-200 pb-4 gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {companyName}
              </p>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                Notification of Salary Structure Re-alignment
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Code on Wages (2019) 50% Rule Alignment · Ref: {templateLabel}
              </p>
            </div>
            <div className="text-left sm:text-right font-mono text-xs text-slate-600 tabular-nums">
              <div>Effective: <strong className="text-slate-900">{effectiveDate}</strong></div>
              <div>Issued: {new Date().toLocaleDateString('en-IN')}</div>
            </div>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-900">To: {activePlan.workerName}</p>
            <p className="text-slate-600">
              {activePlan.designation} · {activePlan.department} Department · State: {activePlan.state} (
              {activePlan.wageType === 'DAILY' ? `Daily Wage × ${activePlan.dailyMultiplier}` : 'Monthly Salaried'})
            </p>
          </div>

          <p className="text-slate-700">
            Dear <strong>{activePlan.workerName}</strong>, to ensure full statutory compliance with the New Labour Codes (50% Wage Rule effective 21 Nov 2025), your monthly compensation breakup is being re-aligned effective <span className="font-mono font-semibold">{effectiveDate}</span>. Your Total Monthly Gross Remuneration remains strictly unchanged at <span className="font-mono font-bold text-slate-900">₹{Math.round(sim.totalRemuneration).toLocaleString('en-IN')}</span>.
          </p>

          {/* Structured Compensation Comparison Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-3.5">Component (Monthly Eq.)</th>
                  <th className="py-2.5 px-3.5 text-right">Current (₹)</th>
                  <th className="py-2.5 px-3.5 text-right">Revised (₹)</th>
                  <th className="py-2.5 px-3.5 text-right">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums text-xs">
                {[
                  { label: 'Basic Pay', oldV: sim.breakdownBefore.basic, newV: sim.breakdownAfter.basic },
                  { label: 'Dearness Allowance (DA)', oldV: sim.breakdownBefore.da, newV: sim.breakdownAfter.da },
                  { label: 'Retaining Allowance', oldV: sim.breakdownBefore.retaining, newV: sim.breakdownAfter.retaining },
                  { label: 'House Rent Allowance (HRA)', oldV: sim.breakdownBefore.hra, newV: sim.breakdownAfter.hra },
                  { label: 'Travel / Conveyance', oldV: sim.breakdownBefore.travel, newV: sim.breakdownAfter.travel },
                  { label: 'Medical Allowance', oldV: sim.breakdownBefore.medical, newV: sim.breakdownAfter.medical },
                  { label: 'Other Allowances', oldV: sim.breakdownBefore.others, newV: sim.breakdownAfter.others },
                ].map((row) => {
                  const diff = Math.round(row.newV - row.oldV);
                  return (
                    <tr key={row.label}>
                      <td className="py-2 px-3.5 font-sans font-medium text-slate-700">{row.label}</td>
                      <td className="py-2 px-3.5 text-right text-slate-600">
                        ₹{Math.round(row.oldV).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2 px-3.5 text-right font-semibold text-slate-900">
                        ₹{Math.round(row.newV).toLocaleString('en-IN')}
                      </td>
                      <td
                        className={`py-2 px-3.5 text-right font-semibold ${
                          diff > 0 ? 'text-emerald-700' : diff < 0 ? 'text-slate-500' : 'text-slate-400'
                        }`}
                      >
                        {diff > 0 ? `+₹${diff.toLocaleString('en-IN')}` : diff < 0 ? `-₹${Math.abs(diff).toLocaleString('en-IN')}` : '—'}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                  <td className="py-2.5 px-3.5 font-sans">Total Monthly Remuneration</td>
                  <td className="py-2.5 px-3.5 text-right">
                    ₹{Math.round(sim.totalRemuneration).toLocaleString('en-IN')}
                  </td>
                  <td className="py-2.5 px-3.5 text-right">
                    ₹{Math.round(sim.totalRemuneration).toLocaleString('en-IN')}
                  </td>
                  <td className="py-2.5 px-3.5 text-right text-slate-500">₹0</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Statutory Impact Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 font-mono tabular-nums">
            <div>
              <span className="text-[10px] font-sans font-bold uppercase text-slate-500 block">
                Employee PF / Mo
              </span>
              <span className="text-sm font-bold text-slate-900">
                ₹{sim.employeePfBefore.toLocaleString('en-IN')} → ₹{sim.employeePfAfter.toLocaleString('en-IN')}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-sans font-bold uppercase text-slate-500 block">
                Employer PF Liability / Mo
              </span>
              <span className="text-sm font-bold text-slate-900">
                ₹{sim.employerPfBefore.toLocaleString('en-IN')} → ₹{sim.employerPfAfter.toLocaleString('en-IN')}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-sans font-bold uppercase text-slate-500 block">
                Annual Gratuity Accrual
              </span>
              <span className="text-sm font-bold text-emerald-700">
                +₹{sim.gratuityAnnualDelta.toLocaleString('en-IN')}/yr
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-600">
            Statutory Verification: Revised Basic Pay (₹{Math.round(sim.breakdownAfter.basic).toLocaleString('en-IN')}/mo) complies with the {activePlan.state} statutory minimum wage floor (₹{sim.stateMinimumWageMonthly.toLocaleString('en-IN')}/mo).
            {cbaOverrideRef ? ` Issued under CBA Settlement Reference: ${cbaOverrideRef}.` : ''}
          </p>

          <div className="pt-4 border-t border-slate-200 flex justify-between text-xs text-slate-600">
            <div>
              <p className="font-bold text-slate-900">Authorized Signatory</p>
              <p>HR &amp; Payroll Compliance Desk · {companyName}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-900">Employee Acknowledgement</p>
              <p>Tracked via WhatsApp Consent Link</p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <span className="text-[11px] text-slate-500">
            {plans.length > 1
              ? `Batch ready: ${plans.length} affected worker letters included in download`
              : 'Ready to print or share with employee'}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {copied ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />}
              <span>{copied ? 'Copied' : 'Copy Text'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadTxt}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Download size={14} className="text-blue-600" />
              <span>{plans.length > 1 ? `Download All (${plans.length})` : 'Download Letter'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Printer size={14} />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
