import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertTriangle, Landmark, ShieldAlert, Loader2, PlayCircle, ArrowRight } from 'lucide-react';
import { Worker } from '../types/index';
import { dbService } from '../services/db';
import { useToast } from '../contexts/ToastContext';

interface MissingKycQuickFixModalProps {
  isOpen: boolean;
  onClose: () => void;
  workers: Worker[];
  onSaved: () => Promise<void>;
}

interface KycDraft {
  pan: string;
  uan: string;
}

export const MissingKycQuickFixModal: React.FC<MissingKycQuickFixModalProps> = ({
  isOpen,
  onClose,
  workers,
  onSaved,
}) => {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, KycDraft>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const init: Record<string, KycDraft> = {};
    workers.forEach((w) => {
      init[w.id] = {
        pan: (w.pan || '').toUpperCase(),
        uan: (w.uan || '').replace(/\D/g, ''),
      };
    });
    setDrafts(init);
  }, [isOpen, workers]);

  if (!isOpen) return null;

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      let updatedCount = 0;
      for (const w of workers) {
        const draft = drafts[w.id];
        if (!draft) continue;
        const nextPan = draft.pan.trim().toUpperCase();
        const nextUan = draft.uan.replace(/\D/g, '').trim();
        if (nextPan !== (w.pan || '') || nextUan !== (w.uan || '')) {
          await dbService.updateWorker(w.id, {
            pan: nextPan,
            uan: nextUan,
          });
          updatedCount += 1;
        }
      }
      await onSaved();
      if (updatedCount > 0) {
        toast.success(`Updated PAN/UAN for ${updatedCount} worker${updatedCount === 1 ? '' : 's'}.`);
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Could not save PAN/UAN details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
              <ShieldAlert size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate">Fix Missing PAN / UAN</h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Add missing tax and PF numbers so every worker is included in filings.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-xl hover:bg-white/10 text-slate-300 cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-3.5 flex-1">
          {workers.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 size={32} className="text-emerald-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-900">All workers have PAN and UAN on file.</p>
            </div>
          ) : (
            workers.map((w) => {
              const draft = drafts[w.id] || { pan: '', uan: '' };
              const missingPan = !draft.pan.trim();
              const missingUan = !draft.uan.trim();
              return (
                <div
                  key={w.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <div className="font-bold text-sm text-slate-900">{w.name}</div>
                      <div className="text-xs text-slate-500">
                        {w.designation || 'Worker'} · {w.department || 'General'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {missingPan && (
                        <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                          Missing PAN
                        </span>
                      )}
                      {missingUan && (
                        <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                          Missing UAN
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                        PAN Number
                      </label>
                      <input
                        type="text"
                        maxLength={10}
                        placeholder="e.g. ABCDE1234F"
                        value={draft.pan}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [w.id]: {
                              ...(prev[w.id] || { pan: '', uan: '' }),
                              pan: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                            },
                          }))
                        }
                        className={`w-full px-3 py-2.5 rounded-xl border bg-white font-mono text-sm uppercase outline-none focus:ring-2 focus:ring-blue-500 min-h-11 ${
                          missingPan ? 'border-amber-300' : 'border-slate-200'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                        UAN (12-Digit PF Number)
                      </label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={12}
                        placeholder="12-digit UAN"
                        value={draft.uan}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [w.id]: {
                              ...(prev[w.id] || { pan: '', uan: '' }),
                              uan: e.target.value.replace(/\D/g, ''),
                            },
                          }))
                        }
                        className={`w-full px-3 py-2.5 rounded-xl border bg-white font-mono text-sm outline-none focus:ring-2 focus:ring-blue-500 min-h-11 ${
                          missingUan ? 'border-amber-300' : 'border-slate-200'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveAll}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-xs cursor-pointer"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            <span>Save Details</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface MissingBankDetailsPauseModalProps {
  isOpen: boolean;
  onClose: () => void;
  missingBankWorkers: Worker[];
  readyWorkerCount: number;
  onSaveAndResume: (updatedWorkers: Worker[]) => Promise<void>;
  onRunForReadyOnly: () => Promise<void>;
}

interface BankDraft {
  accountNumber: string;
  ifscCode: string;
  bankName: string;
}

export const MissingBankDetailsPauseModal: React.FC<MissingBankDetailsPauseModalProps> = ({
  isOpen,
  onClose,
  missingBankWorkers,
  readyWorkerCount,
  onSaveAndResume,
  onRunForReadyOnly,
}) => {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, BankDraft>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const init: Record<string, BankDraft> = {};
    missingBankWorkers.forEach((w) => {
      init[w.id] = {
        accountNumber: (w.bankDetails?.accountNumber || '').replace(/\D/g, ''),
        ifscCode: (w.bankDetails?.ifscCode || '').toUpperCase(),
        bankName: w.bankDetails?.bankName || '',
      };
    });
    setDrafts(init);
  }, [isOpen, missingBankWorkers]);

  if (!isOpen) return null;

  const completedInModalCount = missingBankWorkers.filter((w) => {
    const d = drafts[w.id];
    return Boolean(d && d.accountNumber.trim().length >= 9 && d.ifscCode.trim().length === 11);
  }).length;

  const allCompleted =
    missingBankWorkers.length > 0 && completedInModalCount === missingBankWorkers.length;

  const handleSaveAndResumeClick = async () => {
    const incomplete = missingBankWorkers.filter((w) => {
      const d = drafts[w.id];
      return !d || d.accountNumber.trim().length < 9 || d.ifscCode.trim().length !== 11;
    });

    if (incomplete.length > 0) {
      toast.warning(
        `Enter a valid account number (9+ digits) and 11-character IFSC for ${incomplete[0].name} to include them, or run for ready workers only.`
      );
      return;
    }

    setSaving(true);
    try {
      const savedWorkers: Worker[] = [];
      for (const w of missingBankWorkers) {
        const d = drafts[w.id];
        const nextBank = {
          accountHolderName: w.name,
          accountNumber: d.accountNumber.trim(),
          ifscCode: d.ifscCode.trim().toUpperCase(),
          bankName: d.bankName.trim() || undefined,
        };
        await dbService.updateWorker(w.id, { bankDetails: nextBank });
        savedWorkers.push({ ...w, bankDetails: nextBank });
      }
      await onSaveAndResume(savedWorkers);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save bank details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 bg-amber-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
              <Landmark size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold">Payroll Paused — Bank Details Needed</h2>
              <p className="text-xs text-amber-200 mt-0.5">
                {missingBankWorkers.length} worker{missingBankWorkers.length === 1 ? ' is' : 's are'} missing bank account details. Add them below to resume, or pay ready workers now.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-xl hover:bg-white/10 text-amber-200 cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-950">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <span>
              Your payroll has <strong>not failed</strong> — we paused before payout so you can add bank accounts for the{' '}
              <strong>{missingBankWorkers.length}</strong> listed worker{missingBankWorkers.length === 1 ? '' : 's'}.
              {readyWorkerCount > 0 && (
                <> All other <strong>{readyWorkerCount}</strong> workers are ready to be paid.</>
              )}
            </span>
          </div>

          <div className="space-y-3">
            {missingBankWorkers.map((w) => {
              const draft = drafts[w.id] || { accountNumber: '', ifscCode: '', bankName: '' };
              const isRowComplete =
                draft.accountNumber.trim().length >= 9 && draft.ifscCode.trim().length === 11;

              return (
                <div
                  key={w.id}
                  className={`p-4 rounded-xl border space-y-3 transition-colors ${
                    isRowComplete
                      ? 'border-emerald-200 bg-emerald-50/40'
                      : 'border-slate-200 bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <div className="font-bold text-sm text-slate-900">{w.name}</div>
                      <div className="text-xs text-slate-500">
                        {w.designation || 'Worker'} · {w.department || 'General'}
                      </div>
                    </div>
                    {isRowComplete ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                        <CheckCircle2 size={14} /> Ready
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                        Bank Account Needed
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                        Account Number *
                      </label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={18}
                        placeholder="e.g. 501002348912"
                        value={draft.accountNumber}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [w.id]: {
                              ...(prev[w.id] || { accountNumber: '', ifscCode: '', bankName: '' }),
                              accountNumber: e.target.value.replace(/\D/g, ''),
                            },
                          }))
                        }
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-mono text-sm outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                        IFSC Code *
                      </label>
                      <input
                        type="text"
                        maxLength={11}
                        placeholder="e.g. HDFC0001234"
                        value={draft.ifscCode}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [w.id]: {
                              ...(prev[w.id] || { accountNumber: '', ifscCode: '', bankName: '' }),
                              ifscCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                            },
                          }))
                        }
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-mono text-sm uppercase outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                        Bank Name (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. HDFC Bank"
                        value={draft.bankName}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [w.id]: {
                              ...(prev[w.id] || { accountNumber: '', ifscCode: '', bankName: '' }),
                              bankName: e.target.value,
                            },
                          }))
                        }
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {readyWorkerCount > 0 && (
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onRunForReadyOnly();
                  } finally {
                    setSaving(false);
                  }
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>Pay Ready Workers Only ({readyWorkerCount})</span>
                <ArrowRight size={13} />
              </button>
            )}

            <button
              type="button"
              disabled={saving}
              onClick={handleSaveAndResumeClick}
              className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 ${
                allCompleted
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
              <span>Save Bank Details &amp; Resume Payroll</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
