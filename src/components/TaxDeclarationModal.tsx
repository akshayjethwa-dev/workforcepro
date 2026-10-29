import React, { useState } from 'react';
import { 
  X, Shield, FileText, CheckCircle2, AlertTriangle, 
  MapPin, IndianRupee, Lock, Unlock, Calendar, Info 
} from 'lucide-react';
import { Worker, INDIAN_STATES } from '../types/index';
import { dbService } from '../services/db';
import { useToast } from '../contexts/ToastContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  worker: Worker | null;
  tenantId: string;
  onUpdated: () => void;
}

export const TaxDeclarationModal: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  worker, 
  tenantId, 
  onUpdated 
}) => {
  const { toast } = useToast();

  const [regime, setRegime] = useState<'NEW' | 'OLD'>(worker?.taxRegime || 'NEW');
  const [selectedState, setSelectedState] = useState<string>(worker?.state || 'Maharashtra');
  const [stateEffectiveDate, setStateEffectiveDate] = useState<string>(worker?.stateEffectiveDate || '');
  const [previousState, setPreviousState] = useState<string>(worker?.previousState || '');
  
  // Declarations
  const [sec80C, setSec80C] = useState<number>(worker?.taxDeclarations?.section80C || 0);
  const [sec80D, setSec80D] = useState<number>(worker?.taxDeclarations?.section80D || 0);
  const [hra, setHra] = useState<number>(worker?.taxDeclarations?.hraExemption || 0);
  const [other, setOther] = useState<number>(worker?.taxDeclarations?.otherExemptions || 0);
  const [isLocked, setIsLocked] = useState<boolean>(worker?.taxDeclarationLocked || false);
  const [overrideLock, setOverrideLock] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (worker) {
      setRegime(worker.taxRegime || 'NEW');
      setSelectedState(worker.state || 'Maharashtra');
      setStateEffectiveDate(worker.stateEffectiveDate || '');
      setPreviousState(worker.previousState || '');
      setSec80C(worker.taxDeclarations?.section80C || 0);
      setSec80D(worker.taxDeclarations?.section80D || 0);
      setHra(worker.taxDeclarations?.hraExemption || 0);
      setOther(worker.taxDeclarations?.otherExemptions || 0);
      setIsLocked(Boolean(worker.taxDeclarationLocked));
      setOverrideLock(false);
    }
  }, [worker]);

  if (!isOpen || !worker) return null;

  const handleRegimeChange = (newRegime: 'NEW' | 'OLD') => {
    if (isLocked && !overrideLock) {
      toast.warning('Tax regime is locked post-declaration deadline (May 31). Unlock with Admin Override to modify.');
      return;
    }
    setRegime(newRegime);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updatedWorker: Partial<Worker> = {
        state: selectedState,
        previousState: previousState || undefined,
        stateEffectiveDate: stateEffectiveDate || undefined,
        taxRegime: regime,
        taxDeclarationLocked: isLocked,
        taxDeclarations: {
          regime,
          regimeLocked: isLocked,
          regimeLockedDate: isLocked ? (worker.taxDeclarations?.regimeLockedDate || new Date().toISOString()) : undefined,
          section80C: Number(sec80C) || 0,
          section80D: Number(sec80D) || 0,
          hraExemption: Number(hra) || 0,
          otherExemptions: Number(other) || 0,
          effectiveFinancialYear: '2025-26'
        }
      };

      await dbService.updateWorker(worker.id, updatedWorker);
      toast.success(`Updated tax declarations & statutory parameters for ${worker.name}`);
      onUpdated();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update tax declarations');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Shield size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">
                Statutory & Tax Declaration
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Configure PT state slabs, tax regime & 80C/80D declarations for {worker.name}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSave} className="overflow-y-auto py-4 space-y-4 pr-1">
          {/* Regime Selection Box */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                Income Tax Regime (Section 115BAC)
              </span>
              {isLocked && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                  <Lock size={12} />
                  Locked for FY
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleRegimeChange('NEW')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  regime === 'NEW'
                    ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 font-bold shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
                }`}
              >
                <div className="text-xs font-black mb-0.5">New Regime (Default)</div>
                <div className="text-[11px] text-slate-500 leading-tight">
                  ₹75k Standard deduction, lower slabs, Nil tax up to ₹7,00,000
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleRegimeChange('OLD')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  regime === 'OLD'
                    ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 font-bold shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
                }`}
              >
                <div className="text-xs font-black mb-0.5">Old Regime</div>
                <div className="text-[11px] text-slate-500 leading-tight">
                  Allows 80C (₹1.5L), 80D, HRA & home loan deductions
                </div>
              </button>
            </div>

            {/* Locked Warning & Override Guard */}
            {isLocked && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={15} className="text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    <strong>Statutory Lock:</strong> Indian income tax regulations restrict mid-year regime switches after the employer declaration cut-off.
                  </span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer font-bold text-amber-950">
                  <input
                    type="checkbox"
                    checked={overrideLock}
                    onChange={(e) => setOverrideLock(e.target.checked)}
                    className="rounded border-amber-400 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Authorize Administrator Override to switch regime</span>
                </label>
              </div>
            )}
          </div>

          {/* State & Professional Tax Configuration */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin size={15} className="text-blue-600" />
              State for Professional Tax (PT Slabs)
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Active State Jurisdiction
                </label>
                <select
                  value={selectedState}
                  onChange={(e) => setSelectedState(e.target.value)}
                  className="w-full h-11 px-3 text-xs font-bold rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                >
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  State Transfer Effective Date (Optional)
                </label>
                <input
                  type="date"
                  value={stateEffectiveDate}
                  onChange={(e) => setStateEffectiveDate(e.target.value)}
                  className="w-full h-11 px-3 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>

            {stateEffectiveDate && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Previous State Before Transfer
                </label>
                <select
                  value={previousState}
                  onChange={(e) => setPreviousState(e.target.value)}
                  className="w-full h-11 px-3 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                >
                  <option value="">Select Previous State...</option>
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Chapter VI-A Investment Declarations (For Old Regime) */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Chapter VI-A Declarations ({regime === 'NEW' ? 'Not Applicable under New Regime' : 'Active'})
              </span>
              {regime === 'NEW' && (
                <span className="text-[11px] font-semibold text-slate-400">Exemptions bypassed</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Section 80C (PPF, ELSS, LIC)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-xs text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    disabled={regime === 'NEW'}
                    max={150000}
                    placeholder="Max 1,50,000"
                    value={sec80C || ''}
                    onChange={(e) => setSec80C(Number(e.target.value))}
                    className="w-full h-11 pl-7 pr-3 text-xs font-mono font-bold rounded-xl border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Section 80D (Mediclaim)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-xs text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    disabled={regime === 'NEW'}
                    max={100000}
                    placeholder="Max 50,000"
                    value={sec80D || ''}
                    onChange={(e) => setSec80D(Number(e.target.value))}
                    className="w-full h-11 pl-7 pr-3 text-xs font-mono font-bold rounded-xl border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  HRA Exemption (Sec 10)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-xs text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    disabled={regime === 'NEW'}
                    placeholder="e.g., 60,000"
                    value={hra || ''}
                    onChange={(e) => setHra(Number(e.target.value))}
                    className="w-full h-11 pl-7 pr-3 text-xs font-mono font-bold rounded-xl border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Other (NPS 80CCD, 24b)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-xs text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    disabled={regime === 'NEW'}
                    placeholder="e.g., 50,000"
                    value={other || ''}
                    onChange={(e) => setOther(Number(e.target.value))}
                    className="w-full h-11 pl-7 pr-3 text-xs font-mono font-bold rounded-xl border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Lock Checkbox */}
          <div className="flex items-center gap-2 p-3 bg-slate-100 rounded-xl text-xs text-slate-700">
            <input
              type="checkbox"
              id="lock-declarations"
              checked={isLocked}
              onChange={(e) => setIsLocked(e.target.checked)}
              className="rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="lock-declarations" className="font-semibold cursor-pointer">
              Lock tax declarations and regime choice for the remainder of this Financial Year
            </label>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-4 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-11 px-5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-xs transition-colors flex items-center gap-2"
            >
              {saving ? 'Saving...' : 'Save Declarations'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
