// src/screens/PoshIccScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileText,
  Lock,
  Plus,
  Printer,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  AnnualPoshDistrictReport,
  IccCommitteeConfig,
  IccMember,
  PoshActorContext,
  PoshComplaintRecord,
  PoshComplaintView,
  PoshFindingOutcome,
  PoshInquiryEntry,
  PoshWorkshopRecord,
  ScreenName,
  Worker,
} from '../types/index';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dbService } from '../services/db';
import {
  evaluateIccCompliance,
  getAllIccMembers,
  poshIccService,
} from '../services/poshIccService';
import { PoshComplaintForm } from '../components/PoshComplaintForm';

interface PoshIccScreenProps {
  onNavigate?: (screen: ScreenName) => void;
}

type PoshTab = 'COMPLAINTS' | 'ICC_SETUP' | 'ANNUAL_REPORT';

export const PoshIccScreen: React.FC<PoshIccScreenProps> = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const tenantId = profile?.tenantId || 'demo-tenant-id';
  const companyName = profile?.companyName || 'WorkForce Pro Manufacturing Pvt Ltd';

  const [activeTab, setActiveTab] = useState<PoshTab>('COMPLAINTS');
  const [loading, setLoading] = useState<boolean>(true);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [iccConfig, setIccConfig] = useState<IccCommitteeConfig | null>(null);
  const [complaints, setComplaints] = useState<PoshComplaintRecord[]>([]);
  const [workshops, setWorkshops] = useState<PoshWorkshopRecord[]>([]);
  const [projectedViews, setProjectedViews] = useState<PoshComplaintView[]>([]);

  // Active RBAC View Context (General Admin vs Presiding Officer / Internal / External ICC Member)
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>('GENERAL_ADMIN');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SLA_ALERT' | 'DISPOSED'>('ALL');
  const [selectedComplaintId, setSelectedComplaintId] = useState<string>('');
  const [showNewComplaintForm, setShowNewComplaintForm] = useState<boolean>(false);

  // Inquiry Action Logger state
  const [inquiryActionType, setInquiryActionType] = useState<PoshInquiryEntry['entryType']>('HEARING');
  const [inquirySummary, setInquirySummary] = useState<string>('');
  const [reportOutcome, setReportOutcome] = useState<PoshFindingOutcome>('SUBSTANTIATED');
  const [employerActionText, setEmployerActionText] = useState<string>('');
  const [savingAction, setSavingAction] = useState<boolean>(false);

  // ICC Config Editor state
  const [draftConfig, setDraftConfig] = useState<IccCommitteeConfig | null>(null);
  const [newInternalName, setNewInternalName] = useState<string>('');
  const [newInternalDesig, setNewInternalDesig] = useState<string>('');
  const [newInternalEmail, setNewInternalEmail] = useState<string>('');
  const [savingConfig, setSavingConfig] = useState<boolean>(false);

  // Annual Report & Workshops state
  const [reportYear, setReportYear] = useState<number>(() => new Date().getFullYear());
  const [showWorkshopForm, setShowWorkshopForm] = useState<boolean>(false);
  const [wsTitle, setWsTitle] = useState<string>('');
  const [wsDate, setWsDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [wsTrainer, setWsTrainer] = useState<string>('');
  const [wsAttendees, setWsAttendees] = useState<number>(20);
  const [wsMode, setWsMode] = useState<'IN_PERSON' | 'ONLINE' | 'FLOOR_ORIENTATION'>('IN_PERSON');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [wList, cfg, compList, wsList] = await Promise.all([
        dbService.getWorkers(tenantId).catch(() => []),
        poshIccService.getIccConfig(tenantId),
        poshIccService.getComplaints(tenantId),
        poshIccService.getWorkshops(tenantId),
      ]);
      setWorkers(wList);
      setIccConfig(cfg);
      setDraftConfig(cfg);
      setComplaints(compList);
      setWorkshops(wsList);
      if (compList.length > 0 && !selectedComplaintId) {
        setSelectedComplaintId(compList[0].id);
      }

      // Auto-select matching ICC member context if logged-in user email matches an ICC member
      if (profile?.email && cfg) {
        const allM = getAllIccMembers(cfg);
        const match = allM.find(
          (m: IccMember) => m.email && m.email.toLowerCase() === profile.email?.toLowerCase()
        );
        if (match) {
          setSelectedRoleKey(`ICC::${match.id}`);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId, profile?.email, selectedComplaintId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const activeIccMembers = useMemo(() => getAllIccMembers(iccConfig), [iccConfig]);

  const activeActor: PoshActorContext = useMemo(() => {
    if (selectedRoleKey.startsWith('ICC::')) {
      const memberId = selectedRoleKey.replace('ICC::', '');
      const member = activeIccMembers.find((m: IccMember) => m.id === memberId);
      if (member) {
        return {
          actorType: 'ICC_MEMBER',
          userId: profile?.uid || member.id,
          workerId: member.workerId,
          email: member.email,
          name: member.name,
          iccMemberId: member.id,
          iccRole: member.role,
        };
      }
    }
    return {
      actorType: 'GENERAL_ADMIN',
      userId: profile?.uid || 'admin',
      email: profile?.email || 'admin@company.in',
      name: (profile as any)?.name || 'HR / Regular Admin',
    };
  }, [selectedRoleKey, activeIccMembers, profile]);

  useEffect(() => {
    let cancelled = false;
    poshIccService
      .projectComplaintsForActor(complaints, iccConfig, activeActor)
      .then((views: PoshComplaintView[]) => {
        if (!cancelled) {
          setProjectedViews(views);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [complaints, iccConfig, activeActor]);

  const activeEmployeeCount = useMemo(
    () => workers.filter((w: Worker) => w.status !== 'INACTIVE' && w.isActive !== false).length,
    [workers]
  );

  const thresholdEvaluation = useMemo(
    () => evaluateIccCompliance(iccConfig, activeEmployeeCount),
    [iccConfig, activeEmployeeCount]
  );

  const filteredViews = useMemo(() => {
    return projectedViews.filter((v: PoshComplaintView) => {
      const st = v.record.status;
      const isDisposed = st === 'CLOSED' || st === 'ACTION_TAKEN' || st === 'REFERRED_TO_LOCAL_COMMITTEE';
      if (statusFilter === 'ACTIVE') return !isDisposed;
      if (statusFilter === 'DISPOSED') return isDisposed;
      if (statusFilter === 'SLA_ALERT') {
        return (
          v.timeline.isDay60ReminderDue ||
          v.timeline.isDay80EscalationDue ||
          v.timeline.isInquiryOverdue ||
          v.timeline.isReportOverdue ||
          v.timeline.slaStage === 'REPORT_10D_DUE'
        );
      }
      return true;
    });
  }, [projectedViews, statusFilter]);

  const selectedView = useMemo(
    () =>
      projectedViews.find((v: PoshComplaintView) => v.record.id === selectedComplaintId) ||
      filteredViews[0] ||
      projectedViews[0] ||
      null,
    [projectedViews, filteredViews, selectedComplaintId]
  );

  const kpis = useMemo(() => {
    const activeCases = projectedViews.filter(
      (v: PoshComplaintView) =>
        v.record.status !== 'CLOSED' &&
        v.record.status !== 'ACTION_TAKEN' &&
        v.record.status !== 'REFERRED_TO_LOCAL_COMMITTEE'
    );
    const slaAlerts = activeCases.filter(
      (v: PoshComplaintView) =>
        v.timeline.isDay60ReminderDue ||
        v.timeline.isDay80EscalationDue ||
        v.timeline.isInquiryOverdue ||
        v.timeline.isReportOverdue
    );
    const reportPending = activeCases.filter(
      (v: PoshComplaintView) => Boolean(v.record.inquiryCompletedAt && !v.record.reportSubmittedAt)
    );
    const conflictsCount = activeCases.filter((v: PoshComplaintView) => v.record.conflictOfInterest).length;

    return {
      totalCount: projectedViews.length,
      activeCount: activeCases.length,
      slaAlertsCount: slaAlerts.length,
      reportPendingCount: reportPending.length,
      conflictsCount,
    };
  }, [projectedViews]);

  const annualReport: AnnualPoshDistrictReport | null = useMemo(() => {
    if (!iccConfig) return null;
    return poshIccService.generateAnnualPoshDistrictReport({
      year: reportYear,
      tenantId,
      companyName,
      iccConfig,
      complaints,
      workshops,
      activeEmployeeCount,
    });
  }, [reportYear, tenantId, companyName, iccConfig, complaints, workshops, activeEmployeeCount]);

  const handleDispatchReminders = async () => {
    const res = await poshIccService.dispatchDueSlaReminders(tenantId);
    await loadAll();
    if (res.day60SentCount === 0 && res.day80SentCount === 0) {
      toast.info('All due Day 60 and Day 80 statutory reminders have already been dispatched.');
    } else {
      toast.success(
        `Sent ${res.day60SentCount} Day-60 reminder(s) and ${res.day80SentCount} Day-80 escalation alert(s) to non-recused ICC members.`
      );
    }
  };

  const handleLogInquiryAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedView) return;
    setSavingAction(true);
    try {
      const res = await poshIccService.logInquiryAction({
        tenantId,
        complaintId: selectedView.record.id,
        actor: activeActor,
        entryType: inquiryActionType,
        summary:
          inquiryActionType === 'EMPLOYER_ACTION'
            ? employerActionText.trim() || 'Employer acted on ICC recommendations'
            : inquirySummary.trim() || `${inquiryActionType.replace(/_/g, ' ')} recorded`,
        findingOutcome: inquiryActionType === 'REPORT_SUBMISSION' ? reportOutcome : undefined,
        employerActionTaken: inquiryActionType === 'EMPLOYER_ACTION' ? employerActionText.trim() : undefined,
      });

      if (!res.success) {
        toast.error(res.error || 'Could not update docket.');
        return;
      }
      setInquirySummary('');
      setEmployerActionText('');
      await loadAll();
      toast.success('Statutory inquiry log updated.');
    } finally {
      setSavingAction(false);
    }
  };

  const handleRecordEmployerAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedView || !employerActionText.trim()) return;
    setSavingAction(true);
    try {
      const res = await poshIccService.logInquiryAction({
        tenantId,
        complaintId: selectedView.record.id,
        actor: activeActor,
        entryType: 'EMPLOYER_ACTION',
        summary: employerActionText.trim(),
        employerActionTaken: employerActionText.trim(),
      });
      if (!res.success) {
        toast.error(res.error || 'Failed to record employer action.');
        return;
      }
      setEmployerActionText('');
      await loadAll();
      toast.success('Employer action recorded under Sec 13(4) POSH Act.');
    } finally {
      setSavingAction(false);
    }
  };

  const handleSaveIccConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftConfig) return;
    setSavingConfig(true);
    try {
      const { saved, thresholdEvaluation: evalRes } = await poshIccService.saveIccConfig(
        tenantId,
        draftConfig,
        workers,
        profile?.email || 'HR Head'
      );
      setIccConfig(saved);
      setDraftConfig(saved);
      if (evalRes.formalIccMandatory && !evalRes.isIccValid) {
        toast.warning(`ICC saved, but statutory requirements pending: ${evalRes.missingRequirements.join(', ')}`);
      } else {
        toast.success('Internal Committee configuration saved.');
      }
    } finally {
      setSavingConfig(false);
    }
  };

  const handleAddInternalMember = () => {
    if (!draftConfig || !newInternalName.trim()) return;
    const member: IccMember = {
      id: `icc-int-${Date.now()}`,
      role: 'INTERNAL_MEMBER',
      name: newInternalName.trim(),
      designation: newInternalDesig.trim() || 'Committee Member',
      email: newInternalEmail.trim() || undefined,
      appointedDate: new Date().toISOString().slice(0, 10),
      isActive: true,
    };
    setDraftConfig({
      ...draftConfig,
      internalMembers: [...draftConfig.internalMembers, member],
    });
    setNewInternalName('');
    setNewInternalDesig('');
    setNewInternalEmail('');
  };

  const handleRemoveInternalMember = (id: string) => {
    if (!draftConfig) return;
    setDraftConfig({
      ...draftConfig,
      internalMembers: draftConfig.internalMembers.filter((m: IccMember) => m.id !== id),
    });
  };

  const handleAddWorkshop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsTitle.trim() || !wsTrainer.trim()) return;
    await poshIccService.addWorkshop(tenantId, {
      date: wsDate,
      title: wsTitle.trim(),
      trainerName: wsTrainer.trim(),
      attendeesCount: Math.max(1, wsAttendees),
      mode: wsMode,
    });
    setWsTitle('');
    setWsTrainer('');
    setShowWorkshopForm(false);
    await loadAll();
    toast.success('POSH awareness workshop logged for Annual District Officer Return.');
  };

  const handleDownloadReport = () => {
    if (!annualReport) return;
    const blob = new Blob([annualReport.reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `POSH_Annual_District_Officer_Report_${annualReport.year}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded Sec 21 Annual POSH Return (${annualReport.year}).`);
  };

  if (loading && !iccConfig) {
    return (
      <div className="py-16 text-center text-xs text-slate-500">
        Loading encrypted POSH / ICC workspace...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Role Confidentiality Context Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <ShieldCheck size={14} className="text-slate-700" />
            <span>POSH Act, 2013</span>
            <span aria-hidden="true">·</span>
            <span>AES-256-GCM Encrypted at Rest</span>
            <span aria-hidden="true">·</span>
            <span>Sec 4, 11, 13 &amp; 21 Compliance</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Digital Internal Committee (ICC) &amp; Complaint Logging
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Confidential complaint handling, conflict-of-interest recusal, 90-day inquiry &amp; 10-day report SLA tracking, and District Officer Annual Return.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Role Access Selector */}
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
            <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">Viewing As:</span>
            <select
              value={selectedRoleKey}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedRoleKey(e.target.value)}
              className="text-xs font-semibold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
              aria-label="Select Role Access Context"
            >
              <option value="GENERAL_ADMIN">Regular HR Admin (Status-Only Redacted)</option>
              {activeIccMembers.map((m: IccMember) => (
                <option key={m.id} value={`ICC::${m.id}`}>
                  ICC {m.role.replace('_', ' ')}: {m.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              setActiveTab('COMPLAINTS');
              setShowNewComplaintForm(true);
            }}
            className="min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus size={15} />
            <span>File Confidential Complaint</span>
          </button>
        </div>
      </div>

      {/* Confidentiality / RBAC Context Strip */}
      <div
        className={`p-3.5 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
          activeActor.actorType === 'GENERAL_ADMIN'
            ? 'bg-slate-50 border-slate-200 text-slate-700'
            : 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
        }`}
      >
        <div className="flex items-start sm:items-center gap-2.5">
          {activeActor.actorType === 'GENERAL_ADMIN' ? (
            <EyeOff size={16} className="text-slate-600 shrink-0 mt-0.5 sm:mt-0" />
          ) : (
            <Eye size={16} className="text-emerald-700 shrink-0 mt-0.5 sm:mt-0" />
          )}
          <div>
            {activeActor.actorType === 'GENERAL_ADMIN' ? (
              <span>
                <strong>Restricted Admin View (Sec 16 POSH Confidentiality):</strong> Regular admins see ONLY case status, SLA timelines, and aggregate counts. Confidential descriptions &amp; identities are redacted.
              </span>
            ) : (
              <span>
                <strong>Authorized ICC Session ({activeActor.name} · {activeActor.iccRole?.replace('_', ' ')}):</strong> Authorized to decrypt non-recused complaints. Any docket with <span className="font-mono">CONFLICT_OF_INTEREST</span> targeting you remains blocked.
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleDispatchReminders}
          className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-md text-[11px] font-semibold text-slate-700 flex items-center gap-1.5 self-start sm:self-auto shrink-0 cursor-pointer"
        >
          <Bell size={13} />
          <span>Run Day 60/80 SLA Check</span>
        </button>
      </div>

      {/* 4-Card Statutory KPI Strip (Single-level elevation, tabular-nums, zero pills) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">Active POSH Inquiries</div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {kpis.activeCount}
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {kpis.totalCount} total logged
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600 flex items-center justify-between">
            <span>Conflict Recusals</span>
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {kpis.conflictsCount} routed to External
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">90-Day SLA Alerts (Day 60/80)</div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span
              className={`text-2xl font-bold font-mono tabular-nums ${
                kpis.slaAlertsCount > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {kpis.slaAlertsCount}
            </span>
            <span className="text-xs font-mono text-slate-500">Sec 11(4) SLA</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
            Automated alerts at Day 60 &amp; Day 80
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">10-Day Report Window</div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {kpis.reportPendingCount}
            </span>
            <span className="text-xs font-mono text-slate-500">Sec 13(1) SLA</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
            Submit report within 10d of inquiry end
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">Workforce &amp; ICC Mandate</div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {activeEmployeeCount}
            </span>
            <span
              className={`text-xs font-semibold ${
                thresholdEvaluation.formalIccMandatory ? 'text-emerald-700' : 'text-sky-700'
              }`}
            >
              {thresholdEvaluation.formalIccMandatory ? '>= 10 Mandatory' : '< 10 Relaxed'}
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600 truncate">
            {thresholdEvaluation.formalIccMandatory
              ? thresholdEvaluation.isIccValid
                ? 'ICC Valid (PO + 2 Int + Ext)'
                : `Incomplete (${thresholdEvaluation.missingRequirements.length} missing)`
              : 'Formal ICC optional; LC fallback active'}
          </div>
        </div>
      </div>

      {/* Primary Workspace Sub-Navigation */}
      <div className="border-b border-slate-200 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('COMPLAINTS')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'COMPLAINTS'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Complaints &amp; Timelines ({projectedViews.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ICC_SETUP')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'ICC_SETUP'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Internal Committee (ICC) &amp; Threshold
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ANNUAL_REPORT')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'ANNUAL_REPORT'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Workshops &amp; Annual District Officer Report
        </button>
      </div>

      {/* ================================================================= */}
      {/* TAB 1: COMPLAINTS & STATUTORY TIMELINES                           */}
      {/* ================================================================= */}
      {activeTab === 'COMPLAINTS' && (
        <div className="space-y-4">
          {showNewComplaintForm && (
            <PoshComplaintForm
              tenantId={tenantId}
              workers={workers}
              filedVia="WEB_PORTAL"
              iccConfig={iccConfig}
              onSubmitted={async (created: PoshComplaintRecord) => {
                await loadAll();
                setSelectedComplaintId(created.id);
              }}
              onCancel={() => setShowNewComplaintForm(false)}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left List: Case Dockets */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800">Encrypted Complaint Dockets</span>
                <div className="flex items-center gap-1 text-[11px]">
                  {(['ALL', 'ACTIVE', 'SLA_ALERT', 'DISPOSED'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setStatusFilter(f)}
                      className={`px-2 py-1 rounded font-medium cursor-pointer ${
                        statusFilter === f
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-200/70'
                      }`}
                    >
                      {f === 'ALL'
                        ? 'All'
                        : f === 'ACTIVE'
                        ? 'Open'
                        : f === 'SLA_ALERT'
                        ? 'SLA Due'
                        : 'Disposed'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {filteredViews.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No POSH complaints match the selected filter.
                  </div>
                ) : (
                  filteredViews.map((view: PoshComplaintView) => {
                    const isSelected = selectedView?.record.id === view.record.id;
                    const tl = view.timeline;
                    return (
                      <button
                        key={view.record.id}
                        type="button"
                        onClick={() => setSelectedComplaintId(view.record.id)}
                        className={`w-full text-left p-4 transition-colors cursor-pointer ${
                          isSelected ? 'bg-slate-100/90' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900">
                            {view.record.caseCode}
                          </span>
                          <span className="text-[11px] font-mono tabular-nums text-slate-600">
                            Day {tl.daysElapsed} / 90d
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-700">
                          <span className="font-semibold">
                            {view.record.status.replace(/_/g, ' ')}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="text-[11px] text-slate-500">
                            Filed {tl.filedDate}
                          </span>
                        </div>

                        <div className="mt-1.5 text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>Handler: {view.record.assignedHandlerName}</span>
                          {view.record.conflictOfInterest && (
                            <span className="text-amber-800 font-semibold">
                              · CONFLICT_OF_INTEREST
                            </span>
                          )}
                          {view.record.isAnonymous && (
                            <span className="text-slate-700 font-mono">
                              · ANONYMOUS
                            </span>
                          )}
                        </div>

                        {(tl.isDay60ReminderDue || tl.isDay80EscalationDue || tl.isInquiryOverdue || tl.slaStage === 'REPORT_10D_DUE') && (
                          <div className="mt-2 text-[11px] font-medium text-amber-800 flex items-center gap-1.5">
                            <Clock size={12} />
                            <span>
                              {tl.isInquiryOverdue
                                ? 'OVERDUE (>90d inquiry deadline)'
                                : tl.isDay80EscalationDue
                                ? `Day 80 Escalation · ${tl.inquiryDaysRemaining}d left`
                                : tl.isDay60ReminderDue
                                ? `Day 60 Reminder · ${tl.inquiryDaysRemaining}d left`
                                : `10-Day Report Window (${tl.reportDaysRemaining ?? 0}d left)`}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Detail Panel: Encrypted Dossier OR Strictly Redacted Status Panel */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 space-y-5">
              {!selectedView ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  Select a docket to inspect statutory timelines and authorization scope.
                </div>
              ) : (
                <>
                  {/* Case Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500">
                        <span className="font-bold text-slate-900">{selectedView.record.caseCode}</span>
                        <span>·</span>
                        <span>Via {selectedView.record.filedVia}</span>
                        <span>·</span>
                        <span>{selectedView.record.encryptedPayload.algorithm}</span>
                      </div>
                      <h2 className="text-base font-bold text-slate-900 mt-1">
                        Status: {selectedView.record.status.replace(/_/g, ' ')}
                      </h2>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Assigned Authority: <strong>{selectedView.record.assignedHandlerName}</strong>
                      </p>
                    </div>

                    <div className="text-left sm:text-right font-mono tabular-nums text-xs">
                      <div className="text-slate-500">90-Day Inquiry Deadline</div>
                      <div className="font-bold text-slate-900">
                        {selectedView.timeline.inquiryDeadlineAt.slice(0, 10)} (
                        {selectedView.timeline.inquiryDaysRemaining >= 0
                          ? `${selectedView.timeline.inquiryDaysRemaining}d left`
                          : `${Math.abs(selectedView.timeline.inquiryDaysRemaining)}d overdue`}
                        )
                      </div>
                      {selectedView.timeline.reportDeadlineAt && (
                        <div className="text-[11px] text-slate-600 mt-1">
                          10d Report Due: {selectedView.timeline.reportDeadlineAt.slice(0, 10)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Conflict of Interest Notice */}
                  {selectedView.record.conflictOfInterest && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 flex items-start gap-2.5">
                      <ShieldAlert size={16} className="text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">CONFLICT_OF_INTEREST Flag Active</p>
                        <p className="mt-0.5 text-[11px]">
                          Accused ICC member(s) automatically recused and denied decryption rights. Docket routed to External Member ({selectedView.record.assignedHandlerName}).
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Strictly Redacted OR Decrypted Confidential Details */}
                  {!selectedView.canViewDetails ? (
                    <div className="border border-slate-200 rounded-lg p-5 bg-slate-50 space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                        <Lock size={15} className="text-slate-700" />
                        <span>
                          {selectedView.redactionReason === 'CONFLICT_OF_INTEREST_RECUSED'
                            ? 'ACCESS BLOCKED — RECUSED (CONFLICT_OF_INTEREST)'
                            : 'DETAILS REDACTED — ICC MEMBERS EYES ONLY'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {selectedView.redactionReason === 'CONFLICT_OF_INTEREST_RECUSED'
                          ? 'You are recused from this complaint because you are named in the filing. Decryption keys are restricted to non-recused ICC members and the External Member.'
                          : 'Per Section 16 of the POSH Act and Role-Based Confidentiality rules, regular administrators can monitor only workflow status, 90-day/10-day SLA deadlines, and statutory counts. Switch "Viewing As" above to an authorized non-recused ICC member to decrypt.'}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs border-t border-slate-200">
                        <div>
                          <span className="text-[11px] text-slate-500 block">Complainant Reference</span>
                          <span className="font-mono font-semibold text-slate-800">
                            {selectedView.visibleComplainantLabel}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-500 block">Respondent</span>
                          <span className="font-mono font-semibold text-slate-800">
                            {selectedView.visibleRespondentLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    selectedView.decryptedDetails && (
                      <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50/40">
                        <div className="flex items-center justify-between text-[11px] text-emerald-800 font-semibold border-b border-slate-200 pb-2">
                          <span className="flex items-center gap-1.5">
                            <ShieldCheck size={14} />
                            Decrypted Confidential Narrative (Authorized ICC View)
                          </span>
                          <span className="font-mono text-slate-500">
                            IV: {selectedView.record.encryptedPayload.iv.slice(0, 10)}…
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-[11px] text-slate-500 block">Complainant</span>
                            <span className="font-semibold text-slate-900">
                              {selectedView.visibleComplainantLabel}
                            </span>
                            {!selectedView.record.isAnonymous &&
                              selectedView.decryptedDetails.complainantDepartment && (
                                <span className="text-[11px] text-slate-500 block">
                                  {selectedView.decryptedDetails.complainantDepartment}
                                </span>
                              )}
                          </div>
                          <div>
                            <span className="text-[11px] text-slate-500 block">Respondent</span>
                            <span className="font-semibold text-slate-900">
                              {selectedView.visibleRespondentLabel}
                            </span>
                            {selectedView.decryptedDetails.respondentRoleOrDept && (
                              <span className="text-[11px] text-slate-500 block">
                                {selectedView.decryptedDetails.respondentRoleOrDept}
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="text-[11px] text-slate-500 block">Incident Date</span>
                            <span className="font-mono font-semibold text-slate-900">
                              {selectedView.decryptedDetails.incidentDate}
                            </span>
                          </div>
                          <div>
                            <span className="text-[11px] text-slate-500 block">Location</span>
                            <span className="font-semibold text-slate-900">
                              {selectedView.decryptedDetails.incidentLocation}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs pt-2 border-t border-slate-200">
                          <span className="text-[11px] text-slate-500 block mb-1">
                            Statement / Description
                          </span>
                          <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">
                            {selectedView.decryptedDetails.incidentDescription}
                          </p>
                        </div>

                        {(selectedView.decryptedDetails.witnessDetails ||
                          selectedView.decryptedDetails.evidenceNotes) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-200">
                            <div>
                              <span className="text-[11px] text-slate-500 block">Witnesses</span>
                              <span className="text-slate-800">
                                {selectedView.decryptedDetails.witnessDetails || 'None listed'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[11px] text-slate-500 block">Evidence Notes</span>
                              <span className="text-slate-800">
                                {selectedView.decryptedDetails.evidenceNotes || 'None listed'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  )}

                  {/* Statutory Timeline & Inquiry Log */}
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Statutory Timeline &amp; Inquiry Log (90d Inquiry · 10d Report)
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono tabular-nums">
                      <div className="p-2.5 border border-slate-200 rounded bg-slate-50">
                        <span className="text-slate-500 block font-sans">Filed (Day 0)</span>
                        <span className="font-semibold text-slate-900">
                          {selectedView.timeline.filedDate}
                        </span>
                      </div>
                      <div className="p-2.5 border border-slate-200 rounded bg-slate-50">
                        <span className="text-slate-500 block font-sans">Day 60 / 80 Alerts</span>
                        <span className="font-semibold text-slate-900">
                          {selectedView.record.reminder80SentAt
                            ? 'Day 80 Sent'
                            : selectedView.record.reminder60SentAt
                            ? 'Day 60 Sent'
                            : `Day ${selectedView.timeline.daysElapsed}`}
                        </span>
                      </div>
                      <div className="p-2.5 border border-slate-200 rounded bg-slate-50">
                        <span className="text-slate-500 block font-sans">90d Inquiry Cap</span>
                        <span className="font-semibold text-slate-900">
                          {selectedView.timeline.inquiryDeadlineAt.slice(0, 10)}
                        </span>
                      </div>
                      <div className="p-2.5 border border-slate-200 rounded bg-slate-50">
                        <span className="text-slate-500 block font-sans">10d Report Window</span>
                        <span className="font-semibold text-slate-900">
                          {selectedView.record.reportSubmittedAt
                            ? `Submitted ${selectedView.record.reportSubmittedAt.slice(0, 10)}`
                            : selectedView.timeline.reportDeadlineAt
                            ? `Due ${selectedView.timeline.reportDeadlineAt.slice(0, 10)}`
                            : 'Starts after inquiry'}
                        </span>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                      {selectedView.record.inquiryTimeline.map((entry: PoshInquiryEntry) => (
                        <div key={entry.id} className="p-3 text-xs flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">
                              {entry.entryType.replace(/_/g, ' ')} · {entry.loggedByName}
                            </div>
                            <p className="text-slate-600 mt-0.5">{entry.summary}</p>
                          </div>
                          <span className="font-mono text-[11px] text-slate-400 shrink-0 tabular-nums">
                            {entry.loggedAt.slice(0, 10)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Inquiry Action Controls (Non-recused ICC members only) */}
                  {selectedView.canViewDetails &&
                    selectedView.record.status !== 'CLOSED' &&
                    selectedView.record.status !== 'ACTION_TAKEN' && (
                      <form
                        onSubmit={handleLogInquiryAction}
                        className="border border-slate-200 rounded-lg p-4 bg-slate-50/70 space-y-3"
                      >
                        <div className="text-xs font-bold text-slate-900">
                          Log ICC Proceeding / Submit Inquiry Report
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <select
                            value={inquiryActionType}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                              setInquiryActionType(e.target.value as PoshInquiryEntry['entryType'])
                            }
                            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                          >
                            <option value="HEARING">Record Inquiry Hearing</option>
                            <option value="CONCILIATION">Record Sec 10 Conciliation</option>
                            <option value="EVIDENCE_REVIEW">Complete Inquiry (Starts 10d Report Clock)</option>
                            <option value="REPORT_SUBMISSION">Submit Sec 13 Report to Employer</option>
                            <option value="LOCAL_COMMITTEE_REFERRAL">Refer to District Local Committee</option>
                          </select>

                          {inquiryActionType === 'REPORT_SUBMISSION' && (
                            <select
                              value={reportOutcome}
                              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                                setReportOutcome(e.target.value as PoshFindingOutcome)
                              }
                              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                            >
                              <option value="SUBSTANTIATED">Finding: Allegations Substantiated</option>
                              <option value="UNSUBSTANTIATED">Finding: Not Substantiated</option>
                              <option value="CONCILIATED">Finding: Conciliated Settlement</option>
                              <option value="MALICIOUS_FALSE">Finding: Malicious / False</option>
                            </select>
                          )}
                        </div>

                        <input
                          type="text"
                          required
                          value={inquirySummary}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setInquirySummary(e.target.value)
                          }
                          placeholder="Enter non-sensitive procedural note or recommendations summary..."
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                        />

                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={savingAction}
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-60"
                          >
                            {savingAction ? 'Recording...' : 'Record ICC Milestone'}
                          </button>
                        </div>
                      </form>
                    )}

                  {/* Employer Action Control (After ICC submits Sec 13 Report) */}
                  {selectedView.record.status === 'REPORT_SUBMITTED' && (
                    <form
                      onSubmit={handleRecordEmployerAction}
                      className="border border-emerald-200 rounded-lg p-4 bg-emerald-50/40 space-y-2.5"
                    >
                      <div className="text-xs font-bold text-emerald-950">
                        Record Employer Action Taken (Sec 13(4) — Within 60 Days of ICC Report)
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          required
                          value={employerActionText}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setEmployerActionText(e.target.value)
                          }
                          placeholder="e.g., Disciplinary suspension & mandatory sensitization ordered"
                          className="flex-1 px-3 py-2 bg-white border border-emerald-300 rounded-lg text-xs text-slate-900"
                        />
                        <button
                          type="submit"
                          disabled={savingAction}
                          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          Confirm Employer Action
                        </button>
                      </div>
                    </form>
                  )}

                  {selectedView.record.employerActionTaken && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800">
                      <span className="font-semibold">Employer Action Logged ({selectedView.record.employerActionDate}):</span>{' '}
                      {selectedView.record.employerActionTaken}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: INTERNAL COMMITTEE (ICC) SETUP & 10-EMPLOYEE THRESHOLD     */}
      {/* ================================================================= */}
      {activeTab === 'ICC_SETUP' && draftConfig && (
        <form onSubmit={handleSaveIccConfig} className="space-y-5">
          {/* Threshold Evaluation Banner */}
          <div
            className={`p-4 rounded-lg border text-xs flex items-start gap-3 ${
              thresholdEvaluation.formalIccMandatory
                ? thresholdEvaluation.isIccValid
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                  : 'bg-amber-50 border-amber-200 text-amber-950'
                : 'bg-sky-50 border-sky-200 text-sky-950'
            }`}
          >
            <Shield size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">
                {thresholdEvaluation.formalIccMandatory
                  ? `Statutory Threshold Met (${thresholdEvaluation.activeEmployeeCount} >= 10 Employees): Formal ICC Mandatory`
                  : `Below 10-Employee Threshold (${thresholdEvaluation.activeEmployeeCount} Active Employees)`}
              </p>
              <p className="mt-1 leading-relaxed">{thresholdEvaluation.advisoryNote}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Presiding Officer */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-sm font-bold text-slate-900">
                  1. Presiding Officer (Senior Woman Employee)
                </h3>
                <span className="text-[11px] font-mono text-slate-500">Sec 4(2)(a)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={draftConfig.presidingOfficer?.name || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setDraftConfig({
                        ...draftConfig,
                        presidingOfficer: {
                          ...(draftConfig.presidingOfficer || {
                            id: 'icc-po-1',
                            role: 'PRESIDING_OFFICER',
                            designation: 'Presiding Officer',
                            appointedDate: new Date().toISOString().slice(0, 10),
                            isWoman: true,
                            isActive: true,
                          }),
                          name: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Designation</label>
                  <input
                    type="text"
                    value={draftConfig.presidingOfficer?.designation || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setDraftConfig({
                        ...draftConfig,
                        presidingOfficer: {
                          ...(draftConfig.presidingOfficer || {
                            id: 'icc-po-1',
                            role: 'PRESIDING_OFFICER',
                            name: '',
                            appointedDate: new Date().toISOString().slice(0, 10),
                            isWoman: true,
                            isActive: true,
                          }),
                          designation: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Official Email</label>
                  <input
                    type="email"
                    value={draftConfig.presidingOfficer?.email || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setDraftConfig({
                        ...draftConfig,
                        presidingOfficer: {
                          ...(draftConfig.presidingOfficer || {
                            id: 'icc-po-1',
                            role: 'PRESIDING_OFFICER',
                            name: '',
                            designation: 'Presiding Officer',
                            appointedDate: new Date().toISOString().slice(0, 10),
                            isWoman: true,
                            isActive: true,
                          }),
                          email: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Mandatory External Member */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-sm font-bold text-slate-900">
                  2. External Member (Mandatory NGO / Legal Advisor)
                </h3>
                <span className="text-[11px] font-mono text-slate-500">Sec 4(2)(c)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={draftConfig.externalMember?.name || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setDraftConfig({
                        ...draftConfig,
                        externalMember: {
                          ...(draftConfig.externalMember || {
                            id: 'icc-ext-1',
                            role: 'EXTERNAL_MEMBER',
                            designation: 'External Member',
                            appointedDate: new Date().toISOString().slice(0, 10),
                            isActive: true,
                          }),
                          name: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    NGO / Legal Body *
                  </label>
                  <input
                    type="text"
                    value={draftConfig.externalMember?.organization || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setDraftConfig({
                        ...draftConfig,
                        externalMember: {
                          ...(draftConfig.externalMember || {
                            id: 'icc-ext-1',
                            role: 'EXTERNAL_MEMBER',
                            name: '',
                            designation: 'External Member',
                            appointedDate: new Date().toISOString().slice(0, 10),
                            isActive: true,
                          }),
                          organization: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={draftConfig.externalMember?.email || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setDraftConfig({
                        ...draftConfig,
                        externalMember: {
                          ...(draftConfig.externalMember || {
                            id: 'icc-ext-1',
                            role: 'EXTERNAL_MEMBER',
                            name: '',
                            designation: 'External Member',
                            appointedDate: new Date().toISOString().slice(0, 10),
                            isActive: true,
                          }),
                          email: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={draftConfig.externalMember?.phone || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setDraftConfig({
                        ...draftConfig,
                        externalMember: {
                          ...(draftConfig.externalMember || {
                            id: 'icc-ext-1',
                            role: 'EXTERNAL_MEMBER',
                            name: '',
                            designation: 'External Member',
                            appointedDate: new Date().toISOString().slice(0, 10),
                            isActive: true,
                          }),
                          phone: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Internal Members */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  3. Internal Members (Minimum 2 Required When &gt;= 10 Employees)
                </h3>
                <p className="text-xs text-slate-500">
                  Employees committed to women&apos;s cause or social/legal awareness (Sec 4(2)(b))
                </p>
              </div>
              <span className="text-xs font-mono text-slate-700">
                {draftConfig.internalMembers.length} active
              </span>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {draftConfig.internalMembers.map((m: IccMember) => (
                <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-semibold text-slate-900">{m.name}</span>
                    <span className="text-slate-400 mx-1.5">·</span>
                    <span className="text-slate-600">{m.designation}</span>
                    {m.email && (
                      <>
                        <span className="text-slate-400 mx-1.5">·</span>
                        <span className="font-mono text-slate-500">{m.email}</span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveInternalMember(m.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                    aria-label={`Remove ${m.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
              <input
                type="text"
                value={newInternalName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewInternalName(e.target.value)}
                placeholder="Internal member name"
                className="px-3 py-2 border border-slate-200 rounded-lg"
              />
              <input
                type="text"
                value={newInternalDesig}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewInternalDesig(e.target.value)}
                placeholder="Designation / Dept"
                className="px-3 py-2 border border-slate-200 rounded-lg"
              />
              <input
                type="email"
                value={newInternalEmail}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewInternalEmail(e.target.value)}
                placeholder="Email"
                className="px-3 py-2 border border-slate-200 rounded-lg"
              />
              <button
                type="button"
                onClick={handleAddInternalMember}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>Add Member</span>
              </button>
            </div>
          </div>

          {/* Governance Toggles */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2.5">
              4. Tenant Filing &amp; District Local Committee Policy
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <label className="flex items-start gap-2.5 p-3 border border-slate-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftConfig.allowAnonymousComplaints}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDraftConfig({ ...draftConfig, allowAnonymousComplaints: e.target.checked })
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  <strong className="text-slate-900 block">Allow Anonymous Complaints</strong>
                  <span className="text-[11px] text-slate-500">
                    When enabled, complainant identity is masked from both accused &amp; general admins.
                  </span>
                </span>
              </label>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  District Officer / Local Committee (LC) Jurisdiction
                </label>
                <input
                  type="text"
                  value={draftConfig.localCommitteeDistrict}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDraftConfig({ ...draftConfig, localCommitteeDistrict: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingConfig}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {savingConfig ? 'Saving ICC Config...' : 'Save ICC Constitution & Policy'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ================================================================= */}
      {/* TAB 3: WORKSHOPS & ANNUAL DISTRICT OFFICER REPORT (SEC 21)        */}
      {/* ================================================================= */}
      {activeTab === 'ANNUAL_REPORT' && annualReport && (
        <div className="space-y-5">
          {/* Controls Header */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <FileText size={18} className="text-slate-700" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Annual POSH Return (Section 21 &amp; Rule 14 — District Officer)
                </h2>
                <p className="text-xs text-slate-500">
                  Jurisdiction: {annualReport.districtOfficerJurisdiction} · Confidential identities excluded
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={reportYear}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setReportYear(Number(e.target.value))}
                className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-semibold text-slate-900"
              >
                <option value={new Date().getFullYear()}>{new Date().getFullYear()}</option>
                <option value={new Date().getFullYear() - 1}>{new Date().getFullYear() - 1}</option>
              </select>

              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer size={14} />
                <span>Print</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadReport}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={14} />
                <span>Download District Officer Return</span>
              </button>
            </div>
          </div>

          {/* Statutory Table (5 Mandatory Disclosures under Rule 14) */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">
                Mandatory Statutory Disclosures ({annualReport.year})
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Rule 14 · Section 21
              </span>
            </div>

            <table className="w-full text-left border-collapse text-xs">
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-5 py-3 text-slate-700 font-medium">
                    (a) Number of complaints of sexual harassment received in the year
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums font-bold text-slate-900">
                    {annualReport.complaintsReceivedCount}
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-slate-700 font-medium">
                    (b) Number of complaints disposed off during the year
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                    {annualReport.complaintsDisposedCount}
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-slate-700 font-medium">
                    (c) Number of cases pending for more than ninety (90) days
                  </td>
                  <td
                    className={`px-5 py-3 text-right font-mono tabular-nums font-bold ${
                      annualReport.complaintsPendingOver90DaysCount > 0
                        ? 'text-rose-700'
                        : 'text-slate-900'
                    }`}
                  >
                    {annualReport.complaintsPendingOver90DaysCount}
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-slate-700 font-medium">
                    (d) Number of workshops or awareness programmes against sexual harassment carried out
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums font-bold text-slate-900">
                    {annualReport.workshopsConductedCount} ({annualReport.workshopParticipantsTotal} participants)
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-slate-700 font-medium align-top">
                    (e) Nature of action taken by the employer or District Officer
                  </td>
                  <td className="px-5 py-3 text-right text-slate-800 space-y-1">
                    {annualReport.natureOfActionsSummary.length === 0 ? (
                      <span>Nil complaints logged during period</span>
                    ) : (
                      annualReport.natureOfActionsSummary.map((item) => (
                        <div key={item.action} className="font-mono tabular-nums">
                          {item.action} ({item.count})
                        </div>
                      ))
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Awareness Workshops Register */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  POSH Awareness Workshops &amp; ICC Training Register
                </h3>
                <p className="text-xs text-slate-500">
                  Feeds Section 21 disclosure item (d) for District Officer submission
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowWorkshopForm((prev: boolean) => !prev)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>Log Workshop</span>
              </button>
            </div>

            {showWorkshopForm && (
              <form
                onSubmit={handleAddWorkshop}
                className="p-4 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-xs"
              >
                <input
                  type="date"
                  required
                  value={wsDate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWsDate(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono"
                />
                <input
                  type="text"
                  required
                  value={wsTitle}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWsTitle(e.target.value)}
                  placeholder="Workshop title *"
                  className="sm:col-span-2 px-3 py-2 bg-white border border-slate-200 rounded-lg"
                />
                <input
                  type="text"
                  required
                  value={wsTrainer}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWsTrainer(e.target.value)}
                  placeholder="Trainer / NGO *"
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    value={wsAttendees}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setWsAttendees(Number(e.target.value))
                    }
                    className="w-20 px-2.5 py-2 bg-white border border-slate-200 rounded-lg font-mono"
                  />
                  <button
                    type="submit"
                    className="flex-1 px-3 py-2 bg-slate-900 text-white rounded-lg font-semibold cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </form>
            )}

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {workshops.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No workshops recorded yet.
                </div>
              ) : (
                workshops.map((w: PoshWorkshopRecord) => (
                  <div
                    key={w.id}
                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{w.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Trainer: {w.trainerName} · Mode: {w.mode.replace(/_/g, ' ')}
                      </div>
                    </div>
                    <div className="font-mono tabular-nums text-right text-slate-700 shrink-0">
                      <span className="font-semibold text-slate-900">{w.attendeesCount}</span> attendees · {w.date}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
