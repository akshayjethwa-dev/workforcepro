// src/components/BulkImportModal.tsx
import React, { useState } from 'react';
import { 
  Upload, X, FileText, CheckCircle2, AlertTriangle, 
  ArrowRight, Users, RefreshCw, ShieldAlert 
} from 'lucide-react';
import { Worker } from '../types/index';
import { employeeCapGuard, BulkImportRowResult, EmployeeCapExceededError } from '../services/employeeCapGuard';
import { dbService } from '../services/db';
import { useToast } from '../contexts/ToastContext';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  onSuccess: () => void;
  onPaywallTrigger: (err: EmployeeCapExceededError) => void;
}

const SAMPLE_CSV = `name,phone,uan,gender,category,designation,wageType,amount
Amit Kumar,9876543201,101234567801,Male,Daily Wage,Fitter,DAILY,650
Sunita Devi,9876543202,101234567802,Female,Monthly,Quality Inspector,MONTHLY,24000
Pooja Verma,9876543203,101234567803,Female,Daily Wage,Assembler,DAILY,600
Mohan Lal,9876543204,101234567804,Male,Daily Wage,Machinist,DAILY,700
Deepak Joshi,9876543205,101234567805,Male,Monthly,Supervisor,MONTHLY,28000`;

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  onSuccess,
  onPaywallTrigger
}) => {
  const { toast } = useToast();
  const [csvContent, setCsvContent] = useState<string>(SAMPLE_CSV);
  const [validating, setValidating] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [previewRows, setPreviewRows] = useState<BulkImportRowResult[] | null>(null);

  if (!isOpen) return null;

  const parseCsvToWorkers = (raw: string): Array<Partial<Worker>> => {
    const lines = raw.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const workers: Array<Partial<Worker>> = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const rowObj: any = { tenantId, status: 'ACTIVE' };

      headers.forEach((h, idx) => {
        const val = values[idx];
        if (h === 'name') rowObj.name = val;
        else if (h === 'phone') rowObj.phone = val;
        else if (h === 'uan') rowObj.uan = val;
        else if (h === 'gender') rowObj.gender = val;
        else if (h === 'category') rowObj.category = val;
        else if (h === 'designation') rowObj.designation = val;
        else if (h === 'wagetype') rowObj.wageType = val;
        else if (h === 'amount') {
          rowObj.wageConfig = {
            type: rowObj.wageType === 'MONTHLY' ? 'MONTHLY' : 'DAILY',
            amount: Number(val) || 600,
            overtimeEligible: true
          };
        }
      });

      if (rowObj.name) {
        workers.push(rowObj);
      }
    }

    return workers;
  };

  const handleValidateBatch = async () => {
    const candidates = parseCsvToWorkers(csvContent);
    if (candidates.length === 0) {
      toast.warning('Please provide at least one valid worker in the CSV data.');
      return;
    }

    setValidating(true);
    try {
      const result = await employeeCapGuard.validateBatchImport(tenantId, candidates);
      setPreviewRows(result.rowReport);
      toast.success(`Batch validated: ${result.newDistinctCount} new worker(s) within allowable cap.`);
    } catch (err: any) {
      if (err instanceof EmployeeCapExceededError) {
        setPreviewRows(err.rowReport || null);
        onClose();
        onPaywallTrigger(err);
      } else {
        toast.error(err.message || 'Validation failed');
      }
    } finally {
      setValidating(false);
    }
  };

  const handleExecuteImport = async () => {
    const candidates = parseCsvToWorkers(csvContent);
    if (candidates.length === 0) return;

    setImporting(true);
    try {
      // Re-verify guard inside transaction lock before executing batch
      await employeeCapGuard.validateBatchImport(tenantId, candidates);

      // Save atomically
      await dbService.bulkAddWorkers(tenantId, candidates);

      toast.success(`Imported ${candidates.length} worker(s) successfully!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      if (err instanceof EmployeeCapExceededError) {
        onClose();
        onPaywallTrigger(err);
      } else {
        toast.error(err.message || 'Bulk import failed');
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-3xl p-6 shadow-2xl relative my-6 max-h-[90vh] overflow-y-auto">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200"
        >
          <X size={18} />
        </button>

        <div className="mb-4 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Upload size={18} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Bulk Worker CSV Import</h3>
              <p className="text-xs text-gray-500">
                All-or-nothing validation: Enforces hard cap check before insertion.
              </p>
            </div>
          </div>
        </div>

        {/* INPUT CSV */}
        <div className="space-y-4 text-xs">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="font-bold text-gray-700">Paste CSV Employee Roster Data</label>
              <button 
                onClick={() => setCsvContent(SAMPLE_CSV)}
                className="text-blue-600 hover:underline text-[11px] font-semibold"
              >
                Load Sample Batch
              </button>
            </div>
            <textarea
              rows={8}
              value={csvContent}
              onChange={e => {
                setCsvContent(e.target.value);
                setPreviewRows(null);
              }}
              className="w-full p-3 font-mono text-xs border border-gray-200 rounded-xl bg-gray-50 focus:ring-2 focus:ring-blue-500"
              placeholder="name,phone,uan,gender,category,designation,wageType,amount..."
            />
          </div>

          {/* VALIDATION PREVIEW */}
          {previewRows && (
            <div className="border border-gray-200 rounded-2xl p-3 bg-gray-50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-800 text-xs flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-600" /> Pre-Flight Invariant Validation
                </span>
                <span className="text-[10px] text-gray-500 font-mono">
                  {previewRows.length} rows evaluated
                </span>
              </div>

              <div className="max-h-40 overflow-y-auto divide-y divide-gray-100 bg-white rounded-xl border border-gray-200 text-[11px]">
                {previewRows.map(row => (
                  <div key={row.rowIndex} className="p-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-gray-400">#{row.rowIndex}</span>
                      <span className="font-semibold text-gray-800 font-sans">{row.workerName}</span>
                      <span className="text-gray-400 text-[10px]">({row.phoneOrKey})</span>
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

          <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleValidateBatch}
              disabled={validating || importing}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {validating ? <RefreshCw size={13} className="animate-spin" /> : <FileText size={13} />}
              <span>Pre-Validate Batch</span>
            </button>
            <button
              onClick={handleExecuteImport}
              disabled={importing || validating}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {importing ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />}
              <span>Import All Records</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
