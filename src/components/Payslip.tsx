import React from 'react';
import { MonthlyPayroll } from '../types/index';
import { X, Printer } from 'lucide-react';

interface Props {
  data: MonthlyPayroll;
  companyName: string;
  siteAddress?: string;
  onClose: () => void;
}

export const Payslip: React.FC<Props> = ({ data, companyName, siteAddress, onClose }) => {
  
  // Format "2026-02" to "February 2026"
  const formattedMonth = React.useMemo(() => {
     const [year, month] = data.month.split('-');
     const date = new Date(parseInt(year), parseInt(month) - 1);
     return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [data.month]);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden animate-fadeIn my-auto">
        
        {/* Actions Header */}
        <div className="bg-gray-800 text-white p-3 flex justify-between items-center print:hidden">
            <h3 className="font-bold">Payslip Preview</h3>
            <div className="flex space-x-2">
                <button onClick={() => window.print()} className="p-2 hover:bg-gray-700 rounded-full">
                    <Printer size={20} />
                </button>
                <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-full">
                    <X size={20} />
                </button>
            </div>
        </div>

        {/* Printable Area */}
        <div className="p-8 print:p-0" id="payslip-content">
            {/* Header */}
            <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
                <h1 className="text-2xl font-bold uppercase tracking-wider text-gray-900">
                    {companyName || 'Factory Admin'}
                </h1>
                {siteAddress && (
                    <p className="text-sm text-gray-500 mt-1">{siteAddress}</p>
                )}
                <h2 className="text-lg font-bold mt-4 bg-gray-100 py-1 uppercase">PAYSLIP - {formattedMonth}</h2>
            </div>

            {/* Worker Info */}
            <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                <div>
                    <p className="text-gray-500">Name</p>
                    <p className="font-bold">{data.workerName}</p>
                </div>
                <div className="text-right">
                     <p className="text-gray-500">Employee ID</p>
                     {/* Renders exact Firebase ID */}
                     <p className="font-bold text-xs font-mono">{data.workerId}</p> 
                </div>
                <div>
                    <p className="text-gray-500">Designation</p>
                    <p className="font-bold">{data.workerDesignation || 'Worker'}</p>
                </div>
                <div className="text-right">
                    <p className="text-gray-500">Department</p>
                    <p className="font-bold">{data.workerDepartment || 'General'}</p>
                </div>
            </div>

            {/* Attendance Table */}
            <div className="mb-6">
                <h3 className="font-bold text-xs uppercase text-gray-500 mb-2 border-b border-gray-200 pb-1">Attendance Summary</h3>
                <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="bg-gray-50 p-2 rounded">
                        <span className="block text-xs text-gray-500">Total Days</span>
                        <span className="font-bold">{data.attendanceSummary.totalDays}</span>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                        <span className="block text-xs text-gray-500">Present</span>
                        <span className="font-bold">{data.attendanceSummary.presentDays}</span>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                         <span className="block text-xs text-gray-500">OT Hours</span>
                         <span className="font-bold">{data.attendanceSummary.totalOvertimeHours}</span>
                    </div>
                </div>
            </div>

            {/* Earnings Table */}
            <div className="mb-6">
                 <table className="w-full text-sm">
                     <thead>
                         <tr className="border-b border-gray-300">
                             <th className="text-left py-2 text-gray-500 font-bold uppercase text-xs">Earnings</th>
                             <th className="text-right py-2 text-gray-500 font-bold uppercase text-xs">Amount (₹)</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100">
                         <tr><td className="py-2">Basic Wages</td><td className="text-right py-2">{data.earnings.basic.toFixed(2)}</td></tr>
                         <tr><td className="py-2">Overtime</td><td className="text-right py-2">{data.earnings.overtime.toFixed(2)}</td></tr>
                         <tr><td className="py-2">Allowances</td><td className="text-right py-2">{data.earnings.allowances.other.toFixed(2)}</td></tr>
                         <tr className="bg-green-50 font-bold">
                             <td className="py-2 pl-2">GROSS EARNINGS</td>
                             <td className="text-right py-2 pr-2">{data.earnings.gross.toFixed(2)}</td>
                         </tr>
                     </tbody>
                 </table>
            </div>

            {/* Deductions Table */}
            <div className="mb-6">
                 <table className="w-full text-sm">
                     <thead>
                         <tr className="border-b border-gray-300">
                             <th className="text-left py-2 text-gray-500 font-bold uppercase text-xs">Deductions</th>
                             <th className="text-right py-2 text-gray-500 font-bold uppercase text-xs">Amount (₹)</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100">
                         {data.deductions.details.map((d, i) => (
                             <tr key={i}><td className="py-2">{d.description}</td><td className="text-right py-2">{d.amount.toFixed(2)}</td></tr>
                         ))}
                         {data.deductions.total === 0 && <tr><td className="py-2 text-gray-400 italic">No deductions</td><td className="text-right py-2">-</td></tr>}
                         <tr className="bg-red-50 font-bold">
                             <td className="py-2 pl-2">TOTAL DEDUCTIONS</td>
                             <td className="text-right py-2 pr-2">{data.deductions.total.toFixed(2)}</td>
                         </tr>
                     </tbody>
                 </table>
            </div>

            {/* Net Pay */}
            <div className="bg-gray-900 text-white p-4 rounded-lg flex justify-between items-center mb-8 mt-4">
                <span className="font-bold uppercase tracking-widest text-sm">Net Payable</span>
                <span className="text-2xl font-bold">₹{data.netPayable.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
            </div>

            {/* Footer */}
            <div className="text-xs text-gray-400 text-center pt-8 border-t border-gray-200">
                <p>Payment Mode: Bank Transfer • Generated on {new Date().toLocaleDateString()}</p>
                <p className="mt-1">This is a system generated payslip.</p>
            </div>
        </div>
      </div>
      <style>{`
         @media print {
            body * { visibility: hidden; }
            #payslip-content, #payslip-content * { visibility: visible; }
            #payslip-content { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
         }
      `}</style>
    </div>
  );
};