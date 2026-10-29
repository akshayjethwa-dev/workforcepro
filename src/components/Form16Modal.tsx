import React from 'react';
import { X, Printer, Download, FileText, CheckCircle2 } from 'lucide-react';
import { Worker, MonthlyPayroll, Form16Data } from '../types/index';
import { statutoryEngine } from '../services/statutoryEngine';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  worker: Worker | null;
  payrolls: MonthlyPayroll[];
  companyName: string;
}

export const Form16Modal: React.FC<Props> = ({
  isOpen,
  onClose,
  worker,
  payrolls,
  companyName
}) => {
  if (!isOpen || !worker) return null;

  const form16: Form16Data = statutoryEngine.generateForm16(worker, payrolls, companyName);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 animate-in zoom-in-95 my-auto max-h-[92vh] flex flex-col">
        {/* Actions Bar (hidden in print) */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 print:hidden shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">
                Form 16 Part B Certificate Preview
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Certificate under Section 203 of the Income-tax Act, 1961 for TDS on Salary
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="h-10 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Printer size={15} />
              <span>Print / Save PDF</span>
            </button>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Printable Form 16 Sheet */}
        <div className="overflow-y-auto py-6 space-y-6 text-slate-800 text-xs pr-1 font-sans" id="form-16-print">
          {/* Official Document Header */}
          <div className="text-center border-b-2 border-slate-900 pb-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Government of India • Ministry of Finance • Income Tax Department
            </div>
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 mt-1">
              FORM NO. 16 [PART B]
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Certificate under Section 203 of the Income-tax Act, 1961 for tax deducted at source on salary
            </p>
          </div>

          {/* Employer & Employee Grid */}
          <div className="grid grid-cols-2 gap-4 border border-slate-300 p-4 rounded-xl bg-slate-50/50">
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-400">Employer Name & Address</span>
              <div className="font-bold text-sm text-slate-900">{form16.employerName}</div>
              <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                TAN: {form16.employerTan} | PAN: {form16.employerPan}
              </div>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-400">Employee Details</span>
              <div className="font-bold text-sm text-slate-900">{form16.employeeName}</div>
              <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                PAN: {form16.employeePan} | Desig: {form16.employeeDesignation}
              </div>
            </div>
            <div className="pt-2 border-t border-slate-200">
              <span className="block text-[10px] uppercase font-bold text-slate-400">Assessment Year</span>
              <span className="font-bold text-indigo-700">{form16.assessmentYear}</span>
            </div>
            <div className="pt-2 border-t border-slate-200">
              <span className="block text-[10px] uppercase font-bold text-slate-400">Financial Year & Regime</span>
              <span className="font-bold">{form16.financialYear} ({form16.regime} Tax Regime)</span>
            </div>
          </div>

          {/* Line-by-Line Salary & Tax Computation Table */}
          <div className="border border-slate-300 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Particulars of Income and Tax Computation</th>
                  <th className="p-3 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                <tr>
                  <td className="p-3 font-sans">1. Gross Salary (Salary received as per provisions of Section 17(1))</td>
                  <td className="p-3 text-right font-bold">₹{form16.grossSalary.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="p-3 font-sans">2. Allowances exempt under Section 10 (HRA / Conveyance)</td>
                  <td className="p-3 text-right text-emerald-700">₹{(worker.taxDeclarations?.hraExemption || 0).toLocaleString()}</td>
                </tr>
                <tr className="bg-slate-50 font-sans font-bold">
                  <td className="p-3">3. Balance (1 - 2)</td>
                  <td className="p-3 text-right font-mono">₹{(form16.grossSalary - (worker.taxDeclarations?.hraExemption || 0)).toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="p-3 font-sans">4. Standard Deduction under Section 16(ia)</td>
                  <td className="p-3 text-right text-emerald-700">-₹{form16.standardDeduction.toLocaleString()}</td>
                </tr>
                <tr className="bg-slate-50 font-sans font-bold">
                  <td className="p-3">5. Income Chargeable under the head 'Salaries'</td>
                  <td className="p-3 text-right font-mono">₹{Math.max(0, form16.grossSalary - form16.standardDeduction).toLocaleString()}</td>
                </tr>
                {form16.regime === 'OLD' && (
                  <>
                    <tr>
                      <td className="p-3 font-sans pl-6">• Deductions under Chapter VI-A (Section 80C)</td>
                      <td className="p-3 text-right text-emerald-700">-₹{form16.section80C.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-sans pl-6">• Health Insurance Premium (Section 80D)</td>
                      <td className="p-3 text-right text-emerald-700">-₹{form16.section80D.toLocaleString()}</td>
                    </tr>
                  </>
                )}
                <tr className="bg-blue-50/50 font-sans font-bold text-slate-900 border-t-2 border-slate-300">
                  <td className="p-3">6. Total Taxable Income (Rounded off under Section 288A)</td>
                  <td className="p-3 text-right font-mono text-sm">₹{form16.taxableIncome.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="p-3 font-sans">7. Tax Calculated on Total Income</td>
                  <td className="p-3 text-right">₹{form16.taxOnTotalIncome.toLocaleString()}</td>
                </tr>
                {form16.rebate87A > 0 && (
                  <tr>
                    <td className="p-3 font-sans text-emerald-700">8. Rebate under Section 87A (Full rebate for eligible slab)</td>
                    <td className="p-3 text-right text-emerald-700">-₹{form16.rebate87A.toLocaleString()}</td>
                  </tr>
                )}
                <tr>
                  <td className="p-3 font-sans">9. Health and Education Cess (4% on Tax)</td>
                  <td className="p-3 text-right">₹{form16.healthAndEduCess.toLocaleString()}</td>
                </tr>
                <tr className="bg-slate-900 text-white font-sans font-bold text-sm">
                  <td className="p-3.5">10. Net Tax Payable (7 - 8 + 9)</td>
                  <td className="p-3.5 text-right font-mono text-emerald-400">₹{form16.totalTaxPayable.toLocaleString()}</td>
                </tr>
                <tr className="bg-slate-100 font-sans font-bold text-slate-900">
                  <td className="p-3">11. Total Tax Deducted at Source (TDS) under Section 192</td>
                  <td className="p-3 text-right font-mono text-indigo-700">₹{form16.taxDeductedAtSource.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Verification Declaration */}
          <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-2">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              Verification & Certification
            </h4>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              I, the Authorized Signatory of <strong>{form16.employerName}</strong>, do hereby certify that the sum of <strong>₹{form16.taxDeductedAtSource.toLocaleString()}</strong> has been deducted at source and paid to the credit of the Central Government in accordance with Chapter XVII-B of the Income-tax Act, 1961.
            </p>
            <div className="pt-4 flex justify-between items-end text-[11px] text-slate-500">
              <div>
                <div>Place: Mumbai / Factory HQ</div>
                <div>Date: {new Date().toLocaleDateString('en-IN')}</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-slate-800">For {form16.employerName}</div>
                <div className="text-slate-400 italic mt-4">(Authorized Signatory & Stamp)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
