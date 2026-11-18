// src/components/PoshComplaintForm.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  Lock,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import {
  IccCommitteeConfig,
  IccMember,
  PoshComplaintRecord,
  Worker,
} from '../types/index';
import {
  detectComplaintConflictOfInterest,
  evaluateIccCompliance,
  getAllIccMembers,
  poshIccService,
} from '../services/poshIccService';

interface PoshComplaintFormProps {
  tenantId: string;
  workers: Worker[];
  filedVia: 'WEB_PORTAL' | 'WORKER_PWA' | 'MAGIC_LINK';
  prefillWorker?: Worker | null;
  iccConfig?: IccCommitteeConfig | null;
  onSubmitted?: (record: PoshComplaintRecord) => void;
  onCancel?: () => void;
  compactMobile?: boolean;
}

export const PoshComplaintForm: React.FC<PoshComplaintFormProps> = ({
  tenantId,
  workers,
  filedVia,
  prefillWorker,
  iccConfig: initialConfig,
  onSubmitted,
  onCancel,
  compactMobile = false,
}) => {
  const [iccConfig, setIccConfig] = useState<IccCommitteeConfig | null>(initialConfig || null);
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  const [complainantName, setComplainantName] = useState<string>(prefillWorker?.name || '');
  const [complainantWorkerId, setComplainantWorkerId] = useState<string>(prefillWorker?.id || '');
  const [complainantDepartment, setComplainantDepartment] = useState<string>(prefillWorker?.department || '');
  const [complainantPhone, setComplainantPhone] = useState<string>(prefillWorker?.phone || '');

  const [respondentMode, setRespondentMode] = useState<'DIRECTORY' | 'CUSTOM'>('DIRECTORY');
  const [selectedRespondentKey, setSelectedRespondentKey] = useState<string>('');
  const [respondentName, setRespondentName] = useState<string>('');
  const [respondentWorkerId, setRespondentWorkerId] = useState<string | undefined>(undefined);
  const [respondentRoleOrDept, setRespondentRoleOrDept] = useState<string>('');

  const [incidentDate, setIncidentDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [incidentLocation, setIncidentLocation] = useState<string>('');
  const [incidentDescription, setIncidentDescription] = useState<string>('');
  const [witnessDetails, setWitnessDetails] = useState<string>('');
  const [evidenceNotes, setEvidenceNotes] = useState<string>('');
  const [conciliationRequested, setConciliationRequested] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedRecord, setSubmittedRecord] = useState<PoshComplaintRecord | null>(null);

  useEffect(() => {
    if (initialConfig) {
      setIccConfig(initialConfig);
      return;
    }
    poshIccService
      .getIccConfig(tenantId)
      .then(setIccConfig)
      .catch(() => {});
  }, [tenantId, initialConfig]);

  useEffect(() => {
    if (prefillWorker && !isAnonymous) {
      setComplainantName(prefillWorker.name);
      setComplainantWorkerId(prefillWorker.id);
      setComplainantDepartment(prefillWorker.department || '');
      setComplainantPhone(prefillWorker.phone || '');
    }
  }, [prefillWorker, isAnonymous]);

  const activeEmployeeCount = useMemo(
    () => workers.filter((w: Worker) => w.status !== 'INACTIVE' && w.isActive !== false).length,
    [workers]
  );

  const thresholdEval = useMemo(
    () => evaluateIccCompliance(iccConfig, activeEmployeeCount),
    [iccConfig, activeEmployeeCount]
  );

  const iccMembersList = useMemo(() => getAllIccMembers(iccConfig), [iccConfig]);

  const directoryOptions = useMemo(() => {
    const iccByWorkerId = new Map<string, IccMember>();
    iccMembersList.forEach((m: IccMember) => {
      if (m.workerId) iccByWorkerId.set(m.workerId, m);
    });

    const list: {
      key: string;
      name: string;
      workerId?: string;
      subtitle: string;
      isIccMember: boolean;
    }[] = workers
      .filter((w: Worker) => w.id !== prefillWorker?.id)
      .map((w: Worker) => {
        const iccMatch = iccByWorkerId.get(w.id);
        return {
          key: `worker::${w.id}`,
          name: w.name,
          workerId: w.id,
          subtitle: iccMatch
            ? `${w.designation} · ICC ${iccMatch.role.replace('_', ' ')}`
            : `${w.designation} · ${w.department}`,
          isIccMember: Boolean(iccMatch),
        };
      });

    // Include ICC members who aren't in the worker directory (e.g., External Member or external manager)
    iccMembersList.forEach((m: IccMember) => {
      if (!m.workerId || !workers.some((w: Worker) => w.id === m.workerId)) {
        list.push({
          key: `icc::${m.id}`,
          name: m.name,
          workerId: m.workerId,
          subtitle: `${m.designation} · ICC ${m.role.replace('_', ' ')}`,
          isIccMember: true,
        });
      }
    });

    return list;
  }, [workers, iccMembersList, prefillWorker?.id]);

  const conflictPreview = useMemo(() => {
    if (!respondentName.trim()) return null;
    return detectComplaintConflictOfInterest({
      respondentName,
      respondentWorkerId,
      iccConfig,
    });
  }, [respondentName, respondentWorkerId, iccConfig]);

  const handleSelectDirectoryRespondent = (key: string) => {
    setSelectedRespondentKey(key);
    const found = directoryOptions.find((opt) => opt.key === key);
    if (found) {
      setRespondentName(found.name);
      setRespondentWorkerId(found.workerId);
      setRespondentRoleOrDept(found.subtitle);
    } else {
      setRespondentName('');
      setRespondentWorkerId(undefined);
      setRespondentRoleOrDept('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await poshIccService.submitComplaint({
        tenantId,
        filedVia,
        isAnonymous,
        complainantName: isAnonymous ? undefined : complainantName,
        complainantWorkerId: isAnonymous ? undefined : complainantWorkerId || undefined,
        complainantDepartment: isAnonymous ? undefined : complainantDepartment || undefined,
        complainantPhone: isAnonymous ? undefined : complainantPhone || undefined,
        respondentName,
        respondentWorkerId,
        respondentRoleOrDept,
        incidentDate,
        incidentLocation,
        incidentDescription,
        witnessDetails,
        evidenceNotes,
        conciliationRequested,
        workers,
      });

      if (!res.success || !res.complaint) {
        setErrorMsg(res.error || 'Could not submit confidential complaint.');
        return;
      }

      setSubmittedRecord(res.complaint);
      if (onSubmitted) {
        onSubmitted(res.complaint);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unexpected error encrypting and storing complaint.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedRecord) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className="text-xs font-mono text-emerald-700 font-semibold uppercase tracking-wide">
                Encrypted &amp; Logged · AES-256-GCM
              </p>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
                Confidential Docket Recorded: <span className="font-mono">{submittedRecord.caseCode}</span>
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Your complaint details were encrypted at rest before saving. Regular admins can only view workflow status — never your narrative.
              </p>
            </div>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-w-[40px] min-h-[40px] flex items-center justify-center"
              aria-label="Close confirmation"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs border-t border-slate-100 pt-4">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[11px] text-slate-500 block">Assigned Authority</span>
            <span className="font-semibold text-slate-900 mt-0.5 block">
              {submittedRecord.assignedHandlerName}
            </span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[11px] text-slate-500 block">Identity Protection</span>
            <span className="font-semibold text-slate-900 mt-0.5 block">
              {submittedRecord.isAnonymous ? 'Anonymous Mode (Identity Masked)' : 'ICC Eyes Only'}
            </span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[11px] text-slate-500 block">90-Day Inquiry Deadline</span>
            <span className="font-mono font-semibold text-slate-900 mt-0.5 block tabular-nums">
              {new Date(new Date(submittedRecord.filedAt).getTime() + 90 * 86400000).toISOString().slice(0, 10)}
            </span>
          </div>
        </div>

        {submittedRecord.conflictOfInterest && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 flex items-start gap-2.5">
            <ShieldAlert size={16} className="text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">CONFLICT_OF_INTEREST Safeguard Triggered</p>
              <p className="mt-0.5 text-amber-900">
                Because the complaint names an ICC member, that member has been automatically recused and blocked from viewing this docket. It has been routed directly to the External Member ({submittedRecord.assignedHandlerName}).
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              setSubmittedRecord(null);
              setIncidentDescription('');
              setWitnessDetails('');
              setEvidenceNotes('');
              setRespondentName('');
              setSelectedRespondentKey('');
            }}
            className="min-h-[44px] px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Submit Another Report
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              Done
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            <Lock size={17} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Confidential POSH Complaint Intake
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Encrypted at rest (AES-256-GCM) · Accessible strictly to authorized non-recused ICC members · 90-day inquiry &amp; 10-day report SLA
            </p>
          </div>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-w-[40px] min-h-[40px] flex items-center justify-center"
            aria-label="Close form"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Workforce Threshold Notice (<10 vs >=10) */}
      <div
        className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
          thresholdEval.formalIccMandatory
            ? 'bg-slate-50 border-slate-200 text-slate-700'
            : 'bg-sky-50 border-sky-200 text-sky-900'
        }`}
      >
        <ShieldCheck
          size={16}
          className={thresholdEval.formalIccMandatory ? 'text-emerald-700 shrink-0 mt-0.5' : 'text-sky-700 shrink-0 mt-0.5'}
        />
        <div>
          <p className="font-semibold">
            {thresholdEval.formalIccMandatory
              ? `ICC Active (${thresholdEval.activeEmployeeCount} employees)`
              : `Below 10-Employee Threshold (${thresholdEval.activeEmployeeCount} employees) · Formal ICC Relaxed`}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed">{thresholdEval.advisoryNote}</p>
        </div>
      </div>

      {/* Anonymous Filing Toggle */}
      <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <EyeOff size={16} className="text-slate-600 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs font-semibold text-slate-900 block">
                Complainant Identity &amp; Confidentiality Mode
              </span>
              <span className="text-[11px] text-slate-500">
                {iccConfig?.allowAnonymousComplaints
                  ? 'Tenant permits anonymous filing. Choosing Anonymous omits your name/ID from the encrypted docket so neither accused nor admins see your identity.'
                  : 'Tenant policy requires complainant identification (POSH Act Sec 9 requires written complaint). Your name remains visible ONLY to non-recused ICC members.'}
              </span>
            </div>
          </div>

          {iccConfig?.allowAnonymousComplaints ? (
            <button
              type="button"
              role="switch"
              aria-checked={isAnonymous}
              onClick={() => setIsAnonymous((prev: boolean) => !prev)}
              className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors shrink-0 cursor-pointer ${
                isAnonymous
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {isAnonymous ? 'Anonymous Mode: ON' : 'Submit Anonymously'}
            </button>
          ) : (
            <span className="text-[11px] font-mono text-slate-500 shrink-0">
              Anonymous: Disabled by Org
            </span>
          )}
        </div>

        {!isAnonymous && (
          <div className={`grid grid-cols-1 ${compactMobile ? '' : 'sm:grid-cols-3'} gap-3 pt-2 border-t border-slate-200/70`}>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Your Name *
              </label>
              <input
                type="text"
                required={!isAnonymous}
                value={complainantName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setComplainantName(e.target.value)}
                placeholder="Full Name"
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-slate-900"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Department / Site
              </label>
              <input
                type="text"
                value={complainantDepartment}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setComplainantDepartment(e.target.value)}
                placeholder="e.g. Production / Quality"
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-slate-900"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Safe Contact Phone (ICC Only)
              </label>
              <input
                type="tel"
                value={complainantPhone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setComplainantPhone(e.target.value)}
                placeholder="Optional callback number"
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 font-mono focus:outline-none focus:border-slate-900"
              />
            </div>
          </div>
        )}
      </div>

      {/* Respondent Section */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs font-semibold text-slate-800">
            Respondent (Person Complaint Is Against) *
          </label>
          <div className="inline-flex border border-slate-200 rounded-lg bg-slate-50 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setRespondentMode('DIRECTORY')}
              className={`px-2.5 py-1.5 rounded-md font-medium cursor-pointer ${
                respondentMode === 'DIRECTORY'
                  ? 'bg-white text-slate-900 border border-slate-200'
                  : 'text-slate-600'
              }`}
            >
              Select Employee / ICC
            </button>
            <button
              type="button"
              onClick={() => {
                setRespondentMode('CUSTOM');
                setSelectedRespondentKey('');
                setRespondentWorkerId(undefined);
              }}
              className={`px-2.5 py-1.5 rounded-md font-medium cursor-pointer ${
                respondentMode === 'CUSTOM'
                  ? 'bg-white text-slate-900 border border-slate-200'
                  : 'text-slate-600'
              }`}
            >
              Enter Name Manually
            </button>
          </div>
        </div>

        {respondentMode === 'DIRECTORY' ? (
          <select
            value={selectedRespondentKey}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              handleSelectDirectoryRespondent(e.target.value)
            }
            required={!respondentName.trim()}
            className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-slate-900"
          >
            <option value="">Select person from workforce or ICC directory...</option>
            {directoryOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.name} — {opt.subtitle}
              </option>
            ))}
          </select>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              value={respondentName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRespondentName(e.target.value)}
              placeholder="Respondent full name *"
              className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-slate-900"
            />
            <input
              type="text"
              value={respondentRoleOrDept}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRespondentRoleOrDept(e.target.value)}
              placeholder="Role / Department / Vendor"
              className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-slate-900"
            />
          </div>
        )}

        {/* Live Conflict of Interest Alert */}
        {conflictPreview?.conflictOfInterest && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 flex items-start gap-2.5">
            <ShieldAlert size={16} className="text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                ICC Conflict-of-Interest Protection Active (CONFLICT_OF_INTEREST)
              </p>
              <p className="mt-0.5 text-[11px] text-amber-900">
                {conflictPreview.recusedMemberNames.join(', ')} is on the Internal Committee. They will be automatically recused, blocked from reading this report, and your docket will route directly to{' '}
                <strong>{conflictPreview.assignedHandlerName}</strong>.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Incident Date & Location */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1">
            Date of Incident *
          </label>
          <input
            type="date"
            required
            value={incidentDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncidentDate(e.target.value)}
            className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-slate-900"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1">
            Workplace Location *
          </label>
          <input
            type="text"
            required
            value={incidentLocation}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncidentLocation(e.target.value)}
            placeholder="e.g., Shopfloor Bay 2, Canteen, Night Shift Bus"
            className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-slate-900"
          />
        </div>
      </div>

      {/* Incident Narrative */}
      <div>
        <label className="block text-xs font-semibold text-slate-800 mb-1">
          Confidential Incident Description *
        </label>
        <textarea
          required
          rows={4}
          value={incidentDescription}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setIncidentDescription(e.target.value)}
          placeholder="Describe what happened, approximate time, and any unwelcome behaviour. Encrypted with AES-256-GCM before saving."
          className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-slate-900"
        />
      </div>

      {/* Witnesses & Evidence */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1">
            Witnesses (Optional)
          </label>
          <input
            type="text"
            value={witnessDetails}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWitnessDetails(e.target.value)}
            placeholder="Names or roles of anyone present"
            className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-slate-900"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1">
            Supporting Evidence Notes (Optional)
          </label>
          <input
            type="text"
            value={evidenceNotes}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEvidenceNotes(e.target.value)}
            placeholder="e.g., WhatsApp screenshots, CCTV date/time"
            className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-slate-900"
          />
        </div>
      </div>

      {/* Conciliation Request Toggle (Sec 10 POSH Act) */}
      <label className="flex items-start gap-2.5 p-3 border border-slate-200 rounded-lg bg-slate-50/50 cursor-pointer text-xs">
        <input
          type="checkbox"
          checked={conciliationRequested}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConciliationRequested(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900"
        />
        <span>
          <strong className="text-slate-900 block">Request Pre-Inquiry Conciliation Option (Sec 10 POSH Act)</strong>
          <span className="text-[11px] text-slate-500">
            Optional: Only initiated at your written request; no monetary settlement may be suggested.
          </span>
        </span>
      </label>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
          <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Footer Submit */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <UserCheck size={14} className="text-emerald-700 shrink-0" />
          <span>Encrypted at rest · Non-ICC Admins see Status Only</span>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="min-h-[44px] px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Lock size={14} />
          <span>{submitting ? 'Encrypting & Submitting...' : 'Encrypt & Submit Confidential Complaint'}</span>
        </button>
      </div>
    </form>
  );
};
