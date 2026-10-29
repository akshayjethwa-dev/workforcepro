import React from 'react';
import { 
  X, Calculator, ShieldCheck, FileSpreadsheet, Building2, 
  Info, CheckCircle2, AlertTriangle, ArrowRight, Copy, Check 
} from 'lucide-react';
import { MonthlyPayroll } from '../types/index';
import { useToast } from '../contexts/ToastContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  payroll: MonthlyPayroll | null;
}

export const StatutoryTraceModal: React.FC<Props> = ({ isOpen, onClose, payroll }) => {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  if (!isOpen || !payroll || !payroll.statutory) return null;

  const stat = payroll.statutory;
  const trace = stat.calculationTrace;
  const src = trace.sourceValues;

  const handleCopyTrace = () => {
    const traceText = `
--- STATUTORY CALCULATION AUDIT TRACE ---
Worker: ${payroll.workerName} (${payroll.workerDesignation})
Month: ${payroll.month} | State: ${stat.state} | Regime: ${stat.taxRegime}

1. PROVIDENT FUND (PF):
Rule: ${trace.pfRuleApplied}
Formula: ${trace.pfCalculation}
Employee PF: ₹${stat.employeePf} | Employer PF (EPF+EPS+EDLI+Admin): ₹${stat.totalEmployerPf}

2. EMPLOYEE STATE INSURANCE (ESI):
Rule: ${trace.esiRuleApplied}
Formula: ${trace.esiCalculation}
Employee ESI: ₹${stat.employeeEsi} | Employer ESI: ₹${stat.employerEsi}
${stat.esiDroppedNote ? `Note: ${stat.esiDroppedNote}` : ''}

3. PROFESSIONAL TAX (PT):
Rule: ${trace.ptRuleApplied}
Formula: ${trace.ptCalculation}
PT Deducted: ₹${stat.professionalTax}

4. TDS (INCOME TAX):
Rule: ${trace.tdsRuleApplied}
Formula: ${trace.tdsCalculation}
Monthly TDS: ₹${stat.tds}

5. TOTAL STATUTORY LIABILITY:
Employee Deductions: ₹${stat.totalEmployeeStatutory}
Employer Contributions: ₹${stat.totalEmployerStatutory}
Total Cost To Company (CTC): ₹${payroll.employerCostToCompany || (payroll.earnings.gross + stat.totalEmployerStatutory)}
    `.trim();

    navigator.clipboard.writeText(traceText);
    setCopied(true);
    toast.success('Calculation trace copied to clipboard');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Calculator size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900">
                  Statutory Calculation Trace
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  {stat.state}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Audited mathematical derivation for {payroll.workerName} ({payroll.month})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyTrace}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
              title="Copy audit trace"
            >
              {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto py-4 space-y-4 pr-1">
          {/* Source Base Values Strip */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Basic Wages</span>
              <span className="font-mono font-bold text-slate-900">₹{payroll.earnings.basic.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Gross Earnings</span>
              <span className="font-mono font-bold text-slate-900">₹{payroll.earnings.gross.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Tax Regime</span>
              <span className="font-mono font-bold text-indigo-700">{stat.taxRegime} Regime</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Net Payable</span>
              <span className="font-mono font-black text-emerald-700">₹{payroll.netPayable.toLocaleString()}</span>
            </div>
          </div>

          {/* 1. Provident Fund (PF) Trace */}
          <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase text-blue-900 flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-blue-600" />
                1. Employees' Provident Fund (EPF & MP Act 1952)
              </span>
              <span className="text-xs font-black font-mono text-blue-950">
                Employee: ₹{stat.employeePf} | Employer: ₹{stat.totalEmployerPf}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              {trace.pfRuleApplied}
            </p>
            <div className="p-2.5 bg-white rounded-xl border border-blue-100 font-mono text-xs text-slate-800 space-y-1">
              <div>{trace.pfCalculation}</div>
              <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                • Employer EPF (3.67%): ₹{stat.employerEpf} • Employer EPS (8.33% capped): ₹{stat.employerEps} • EDLI (0.5%): ₹{stat.employerEdli} • Admin (0.5%): ₹{stat.employerAdminCharges}
              </div>
            </div>
          </div>

          {/* 2. Employee State Insurance (ESI) Trace */}
          <div className={`p-4 rounded-2xl border space-y-2 ${
            stat.isEsiApplicable ? 'border-teal-200 bg-teal-50/40' : 'border-amber-200 bg-amber-50/40'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-extrabold uppercase flex items-center gap-1.5 ${
                stat.isEsiApplicable ? 'text-teal-900' : 'text-amber-900'
              }`}>
                <ShieldCheck size={16} className={stat.isEsiApplicable ? 'text-teal-600' : 'text-amber-600'} />
                2. Employee State Insurance (ESI Act 1948)
              </span>
              <span className="text-xs font-black font-mono text-slate-900">
                {stat.isEsiApplicable ? `Employee: ₹${stat.employeeEsi} | Employer: ₹${stat.employerEsi}` : 'Exempt (₹0)'}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              {trace.esiRuleApplied}
            </p>
            {stat.esiDroppedNote && (
              <div className="p-2.5 bg-amber-100/70 border border-amber-300 rounded-xl text-xs text-amber-950 font-semibold flex items-start gap-2">
                <AlertTriangle size={15} className="text-amber-700 shrink-0 mt-0.5" />
                <span>{stat.esiDroppedNote}</span>
              </div>
            )}
            <div className="p-2.5 bg-white rounded-xl border border-slate-200 font-mono text-xs text-slate-800">
              {trace.esiCalculation}
            </div>
          </div>

          {/* 3. Professional Tax (PT) Trace */}
          <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase text-indigo-900 flex items-center gap-1.5">
                <Building2 size={16} className="text-indigo-600" />
                3. State Professional Tax ({stat.state})
              </span>
              <span className="text-xs font-black font-mono text-indigo-950">
                PT Deducted: ₹{stat.professionalTax}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              {trace.ptRuleApplied}
            </p>
            <div className="p-2.5 bg-white rounded-xl border border-indigo-100 font-mono text-xs text-slate-800">
              {trace.ptCalculation}
            </div>
          </div>

          {/* 4. TDS (Income Tax) Trace */}
          <div className="p-4 rounded-2xl border border-violet-200 bg-violet-50/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase text-violet-900 flex items-center gap-1.5">
                <FileSpreadsheet size={16} className="text-violet-600" />
                4. Tax Deducted at Source (TDS - Section 192)
              </span>
              <span className="text-xs font-black font-mono text-violet-950">
                Monthly TDS: ₹{stat.tds}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              {trace.tdsRuleApplied}
            </p>
            <div className="p-2.5 bg-white rounded-xl border border-violet-100 font-mono text-xs text-slate-800">
              {trace.tdsCalculation}
            </div>
          </div>

          {/* 5. Employer Statutory Liabilities & Cost To Company (CTC) */}
          <div className="p-4 rounded-2xl border border-slate-300 bg-slate-900 text-white space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Employer Statutory Liability & CTC Impact
              </span>
              <span className="text-sm font-black font-mono text-emerald-400">
                +₹{stat.totalEmployerStatutory.toLocaleString()} / mo
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-slate-800/80 rounded-xl">
                <span className="text-slate-400 block text-[10px]">Employer PF Total (13.0%)</span>
                <span className="font-mono font-bold text-white">₹{stat.totalEmployerPf.toLocaleString()}</span>
              </div>
              <div className="p-2 bg-slate-800/80 rounded-xl">
                <span className="text-slate-400 block text-[10px]">Employer ESI Total (3.25%)</span>
                <span className="font-mono font-bold text-white">₹{stat.employerEsi.toLocaleString()}</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">True Monthly Cost to Company (CTC):</span>
              <span className="text-base font-black font-mono text-emerald-400">
                ₹{(payroll.employerCostToCompany || (payroll.earnings.gross + stat.totalEmployerStatutory)).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="h-11 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-colors"
          >
            Close Trace
          </button>
        </div>
      </div>
    </div>
  );
};
