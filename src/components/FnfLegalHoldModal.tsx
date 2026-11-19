// src/components/FnfLegalHoldModal.tsx
import React, { useRef, useState } from 'react';
import { PauseCircle, ShieldAlert, X } from 'lucide-react';
import { FnfLegalHoldCategory, FnfSettlementRecord } from '../types/index';
import { KeyboardAwareFormContainer } from './KeyboardAwareFormContainer';
import { InlineFieldError } from './InlineFieldError';
import { scrollToFirstInvalidField } from '../hooks/useKeyboardAwareLayout';

interface Props {
  record: FnfSettlementRecord;
  onClose: () => void;
  onConfirm: (category: FnfLegalHoldCategory, reason: string) => Promise<void>;
}

const HOLD_CATEGORIES: { id: FnfLegalHoldCategory; label: string; hint: string }[] = [
  {
    id: 'ABSCONDING',
    label: 'Employee Absconded',
    hint: 'Employee stopped reporting without formal handover or notice',
  },
  {
    id: 'ASSET_NOT_RETURNED',
    label: 'Company Property Unreturned',
    hint: 'Tools, uniform, laptop, ID badge, or safety gear not returned',
  },
  {
    id: 'NOTICE_DISPUTE',
    label: 'Notice Period / Recovery Dispute',
    hint: 'Pending reconciliation of unserved notice days or buyout',
  },
  {
    id: 'DISCIPLINARY_INQUIRY',
    label: 'Disciplinary / Audit Inquiry',
    hint: 'Pending investigation prior to final financial clearance',
  },
  {
    id: 'OTHER',
    label: 'Other Legal / Clearance Hold',
    hint: 'Specify statutory or contractual hold justification below',
  },
];

export const FnfLegalHoldModal: React.FC<Props> = ({
  record,
  onClose,
  onConfirm,
}) => {
  const [category, setCategory] = useState<FnfLegalHoldCategory>('ABSCONDING');
  const [reason, setReason] = useState<string>(
    'Employee absconded without serving notice / returning company tools & access card.'
  );
  const [submitting, setSubmitting] = useState(false);
  const [reasonError, setReasonError] = useState('');
  const formContainerRef = useRef<HTMLDivElement | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setReasonError('Please enter a documented legal hold reason for the audit trail.');
      window.requestAnimationFrame(() =>
        scrollToFirstInvalidField(formContainerRef.current, 'holdReason')
      );
      return;
    }
    setReasonError('');
    setSubmitting(true);
    try {
      await onConfirm(category, reason.trim());
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 border border-amber-300 flex items-center justify-center shrink-0">
              <PauseCircle size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 truncate">
                Place LEGAL_HOLD on FnF Timer
              </h3>
              <p className="text-[11px] text-slate-600 truncate">
                {record.workerName} · Exit {record.exitDate}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        <KeyboardAwareFormContainer
          containerRef={formContainerRef}
          onSubmit={handleSubmit}
          extraBottomPadding={32}
          className="p-5 space-y-4 text-xs flex-1"
          footerClassName="px-5 py-3.5 bg-slate-50 border-t border-slate-100"
          stickyFooter={
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 py-2.5 min-h-[2.75rem] bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl cursor-pointer text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-2.5 min-h-[2.75rem] bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-xl cursor-pointer text-xs"
              >
                {submitting ? 'Placing Hold...' : 'Pause Timer (LEGAL_HOLD)'}
              </button>
            </div>
          }
        >
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 flex items-start gap-2">
            <ShieldAlert size={15} className="text-amber-700 shrink-0 mt-0.5" />
            <span>
              Placing a <strong>LEGAL_HOLD</strong> pauses the Section 17(2) 2-working-day deadline timer and freezes 12% p.a. delay interest accrual until clearance is completed.
            </span>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
              Hold Category
            </label>
            <select
              value={category}
              onChange={(e) => {
                const next = e.target.value as FnfLegalHoldCategory;
                setCategory(next);
                setReasonError('');
                if (next === 'ABSCONDING') {
                  setReason('Employee absconded without serving notice / returning company tools & access card.');
                } else if (next === 'ASSET_NOT_RETURNED') {
                  setReason('Company property / tools / PPE kit not returned at exit.');
                } else if (next === 'NOTICE_DISPUTE') {
                  setReason('Notice period shortfall recovery pending verification.');
                } else if (next === 'DISCIPLINARY_INQUIRY') {
                  setReason('Pending disciplinary / inventory audit clearance.');
                }
              }}
              className="w-full px-3 py-2.5 min-h-11 border border-slate-200 rounded-xl font-semibold text-slate-900 bg-white outline-none focus:border-amber-600"
            >
              {HOLD_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div data-field="holdReason">
            <label htmlFor="fnf-hold-reason" className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
              Documented Reason (Required for Statutory Audit Trail)
            </label>
            <textarea
              id="fnf-hold-reason"
              rows={3}
              aria-invalid={Boolean(reasonError)}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (reasonError) setReasonError('');
              }}
              placeholder="Enter exact reason e.g. Absconded since Monday without returning biometric badge & drill kit..."
              className={`w-full px-3 py-2.5 border rounded-xl text-slate-900 outline-none ${
                reasonError
                  ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500'
                  : 'border-slate-200 bg-white focus:border-amber-600'
              }`}
            />
            <InlineFieldError message={reasonError} />
          </div>
        </KeyboardAwareFormContainer>
      </div>
    </div>
  );
};
