// src/components/FnfDeadlineBadge.tsx
import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, PauseCircle } from 'lucide-react';
import { FnfSettlementRecord, OrgSettings } from '../types/index';
import { evaluateFnfDeadline } from '../services/fnfService';

interface Props {
  record: FnfSettlementRecord;
  orgSettings?: OrgSettings | null;
  compact?: boolean;
}

export const FnfDeadlineBadge: React.FC<Props> = ({
  record,
  orgSettings,
  compact = false,
}) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const isStatic =
    record.status === 'SETTLED' ||
    record.status === 'LEGAL_HOLD' ||
    Boolean(record.deadlineTracking?.isPaused) ||
    record.paymentSchedules?.wageFnf?.status === 'PAID';

  useEffect(() => {
    if (isStatic) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isStatic]);

  const evalRes = evaluateFnfDeadline(record, nowMs, orgSettings);

  if (evalRes.state === 'DEADLINE_MET') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono text-[11px] font-bold tabular-nums">
        <CheckCircle2 size={12} />
        <span>{compact ? 'DEADLINE MET' : `DEADLINE MET · Due ${evalRes.effectiveDeadlineLabel}`}</span>
      </span>
    );
  }

  if (evalRes.state === 'SETTLED_LATE') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 font-mono text-[11px] font-bold tabular-nums">
        <Clock size={12} />
        <span>{evalRes.countdownText}</span>
      </span>
    );
  }

  if (evalRes.state === 'PAUSED_HOLD') {
    return (
      <span
        title={record.legalHold?.reason}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-950 border border-amber-300 font-mono text-[11px] font-bold tabular-nums"
      >
        <PauseCircle size={12} className="text-amber-700" />
        <span>
          {compact
            ? 'LEGAL_HOLD · PAUSED'
            : `PAUSED (LEGAL_HOLD · ${record.legalHold?.category || 'HOLD'})`}
        </span>
      </span>
    );
  }

  if (evalRes.state === 'BREACHED') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-600 text-white border border-rose-700 font-mono text-[11px] font-bold tabular-nums animate-pulse">
        <AlertTriangle size={12} />
        <span>
          {compact
            ? `BREACHED (+${evalRes.overdueWholeDays}d · ₹${evalRes.accruedInterestPenalty.toLocaleString('en-IN')} int.)`
            : `${evalRes.countdownText} · 12% Int: ₹${evalRes.accruedInterestPenalty.toLocaleString('en-IN')}`}
        </span>
      </span>
    );
  }

  const urgent = evalRes.state === 'URGENT_DUE_SOON';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px] font-bold tabular-nums ${
        urgent
          ? 'bg-amber-50 text-amber-900 border-amber-300'
          : 'bg-blue-50 text-blue-800 border-blue-200'
      }`}
    >
      <Clock size={12} />
      <span>
        {compact
          ? `${evalRes.countdownText}`
          : `Sec 17(2) Timer: ${evalRes.countdownText} · Due ${evalRes.effectiveDeadlineLabel}`}
      </span>
    </span>
  );
};
