import React, { useState } from 'react';
import { 
  X, AlertTriangle, AlertCircle, CheckCircle2, ShieldAlert, Clock, 
  ArrowRightLeft, UserX, FileCheck, Settings2, RefreshCw, Sparkles, 
  ChevronRight, Calendar, User, Zap, Info, ShieldCheck, Check
} from 'lucide-react';
import { 
  ScheduleConflict, 
  ScheduleValidationRulesConfig, 
  ScheduleRuleSeverity,
  ScheduleValidationRuleKey,
  RosterShift
} from '../types/scheduleValidation';
import { Worker, OrgSettings, AttendanceRecord } from '../types/index';
import { scheduleValidationService } from '../services/scheduleValidationService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  shifts: RosterShift[];
  workers: Worker[];
  settings?: OrgSettings;
  attendanceHistory?: AttendanceRecord[];
  onShiftsChange: (updatedShifts: RosterShift[]) => void;
  onPublishSuccess: () => void;
  rosterName?: string;
  weekRange?: { start: string; end: string };
}

export const PrePublishValidationPanel: React.FC<Props> = ({
  isOpen,
  onClose,
  shifts,
  workers,
  settings,
  attendanceHistory,
  onShiftsChange,
  onPublishSuccess,
  rosterName = 'Current Roster',
  weekRange
}) => {
  const { profile } = useAuth();
  const { toast } = useToast();

  const tenantId = profile?.tenantId || 'demo-tenant-id';
  const [rulesConfig, setRulesConfig] = useState<ScheduleValidationRulesConfig>(() => 
    scheduleValidationService.getRulesConfig(tenantId)
  );

  const [filterSeverity, setFilterSeverity] = useState<'ALL' | 'BLOCK' | 'WARN' | 'OVERRIDDEN'>('ALL');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedConflictForOverride, setSelectedConflictForOverride] = useState<ScheduleConflict | null>(null);
  const [overrideReasonText, setOverrideReasonText] = useState('');
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);
  const [swapShiftTarget, setSwapShiftTarget] = useState<{ shiftId: string; requiredSkill?: string } | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  // Compute live conflicts
  const currentOverrides = scheduleValidationService.getOverrides(tenantId);
  const conflicts = scheduleValidationService.validateRoster(shifts, {
    rulesConfig,
    workers,
    settings,
    attendanceHistory,
    currentOverrides,
    weekStartDate: weekRange?.start,
    weekEndDate: weekRange?.end,
  });

  const blockers = conflicts.filter(c => c.severity === 'BLOCK' && !c.isOverridden);
  const warnings = conflicts.filter(c => c.severity === 'WARN' && !c.isOverridden);
  const overridden = conflicts.filter(c => c.isOverridden);

  const canPublish = blockers.length === 0;

  if (!isOpen) return null;

  // Filtered conflicts list
  const displayedConflicts = conflicts.filter(c => {
    if (filterSeverity === 'BLOCK') return c.severity === 'BLOCK' && !c.isOverridden;
    if (filterSeverity === 'WARN') return c.severity === 'WARN' && !c.isOverridden;
    if (filterSeverity === 'OVERRIDDEN') return c.isOverridden;
    return true;
  });

  // Action: Unassign worker
  const handleUnassign = (shiftId: string) => {
    const updated = scheduleValidationService.unassignShift(shifts, shiftId);
    onShiftsChange(updated);
    toast.success('Worker unassigned from shift. Conflict updated.');
  };

  // Action: Swap worker
  const handleSwapWorker = (shiftId: string, newWorker: Worker) => {
    const updated = scheduleValidationService.swapWorker(shifts, shiftId, newWorker);
    onShiftsChange(updated);
    setSwapShiftTarget(null);
    toast.success(`Shift reassigned to ${newWorker.name}.`);
  };

  // Action: Submit Override
  const handleSubmitOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConflictForOverride || !overrideReasonText.trim()) {
      toast.error('A mandatory justification reason is required to override.');
      return;
    }

    setIsSubmittingOverride(true);
    try {
      await scheduleValidationService.overrideConflict(
        tenantId,
        selectedConflictForOverride,
        overrideReasonText.trim(),
        {
          uid: profile?.uid || 'user',
          email: profile?.email,
          companyName: profile?.companyName,
        }
      );

      toast.success(`Override logged in audit trail for ${selectedConflictForOverride.ruleKey}.`);
      setSelectedConflictForOverride(null);
      setOverrideReasonText('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to log override.');
    } finally {
      setIsSubmittingOverride(false);
    }
  };

  // Action: Save rules config
  const handleUpdateRuleSeverity = (ruleKey: ScheduleValidationRuleKey, severity: ScheduleRuleSeverity) => {
    const updated: ScheduleValidationRulesConfig = {
      ...rulesConfig,
      rules: {
        ...rulesConfig.rules,
        [ruleKey]: {
          ...rulesConfig.rules[ruleKey],
          severity,
        },
      },
    };
    setRulesConfig(updated);
    scheduleValidationService.saveRulesConfig(tenantId, updated);
    toast.success(`Rule "${rulesConfig.rules[ruleKey].name}" updated to ${severity}.`);
  };

  // Action: Publish roster
  const handlePublishRoster = async () => {
    if (!canPublish) {
      toast.error(`Cannot publish: ${blockers.length} blocking conflict(s) must be resolved first.`);
      return;
    }

    setIsPublishing(true);
    try {
      await scheduleValidationService.publishRoster(
        tenantId,
        {
          id: `roster_${Date.now()}`,
          tenantId,
          name: rosterName,
          weekStartDate: weekRange?.start || new Date().toISOString().split('T')[0],
          weekEndDate: weekRange?.end || new Date().toISOString().split('T')[0],
          status: 'PUBLISHED',
          shifts,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          uid: profile?.uid || 'user',
          email: profile?.email,
          companyName: profile?.companyName,
        }
      );

      toast.success('Roster published successfully! Workers notified.');
      onPublishSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Failed to publish roster.');
    } finally {
      setIsPublishing(false);
    }
  };

  const getRuleIcon = (key: ScheduleValidationRuleKey) => {
    switch (key) {
      case 'DOUBLE_BOOKING': return <AlertCircle className="text-rose-600" size={16} />;
      case 'REST_PERIOD': return <Clock className="text-amber-600" size={16} />;
      case 'OVERTIME_RISK': return <Zap className="text-amber-600" size={16} />;
      case 'AVAILABILITY_MISMATCH': return <Calendar className="text-amber-600" size={16} />;
      case 'SKILL_MISMATCH': return <ShieldAlert className="text-rose-600" size={16} />;
      case 'COVERAGE_GAP': return <UserX className="text-amber-600" size={16} />;
      case 'PUBLIC_HOLIDAY': return <Sparkles className="text-indigo-600" size={16} />;
      default: return <AlertTriangle size={16} />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end transition-opacity duration-300">
      {/* Sliding Panel */}
      <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shadow-xs">
                <FileCheck size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">Pre-Publish Schedule Validation</h2>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                    Live Check
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Validates overtime caps, double-booking, rest turnarounds, availability, and skills before publishing.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowConfigModal(!showConfigModal)}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
                title="Configure validation rule severity"
              >
                <Settings2 size={18} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-4 gap-2 mt-4">
            <button
              type="button"
              onClick={() => setFilterSeverity('ALL')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                filterSeverity === 'ALL' ? 'bg-white border-blue-500 ring-2 ring-blue-500/20 shadow-xs' : 'bg-white/60 border-slate-200'
              }`}
            >
              <div className="text-[11px] font-semibold text-slate-500">Total Flags</div>
              <div className="text-base font-bold text-slate-900">{conflicts.length}</div>
            </button>

            <button
              type="button"
              onClick={() => setFilterSeverity('BLOCK')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                filterSeverity === 'BLOCK' ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-400/20 shadow-xs' : 'bg-white/60 border-slate-200'
              }`}
            >
              <div className="text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                Blockers
              </div>
              <div className="text-base font-bold text-rose-700">{blockers.length}</div>
            </button>

            <button
              type="button"
              onClick={() => setFilterSeverity('WARN')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                filterSeverity === 'WARN' ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-400/20 shadow-xs' : 'bg-white/60 border-slate-200'
              }`}
            >
              <div className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                Warnings
              </div>
              <div className="text-base font-bold text-amber-700">{warnings.length}</div>
            </button>

            <button
              type="button"
              onClick={() => setFilterSeverity('OVERRIDDEN')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                filterSeverity === 'OVERRIDDEN' ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-400/20 shadow-xs' : 'bg-white/60 border-slate-200'
              }`}
            >
              <div className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                Overridden
              </div>
              <div className="text-base font-bold text-emerald-700">{overridden.length}</div>
            </button>
          </div>
        </div>

        {/* Rule Config Drawer / Subpanel (Collapsible) */}
        {showConfigModal && (
          <div className="p-4 bg-slate-900 text-white border-b border-slate-800 space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                  Validation Rule Severity Configuration
                </h3>
                <p className="text-[11px] text-slate-400">
                  Define whether rule violations strictly BLOCK roster publication or trigger WARN with mandatory justification.
                </p>
              </div>
              <button 
                onClick={() => setShowConfigModal(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Done
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
              {(Object.keys(rulesConfig.rules) as ScheduleValidationRuleKey[]).map(key => {
                const rule = rulesConfig.rules[key];
                return (
                  <div key={key} className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-200 truncate">{rule.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">{rule.description}</div>
                    </div>
                    <select
                      value={rule.severity}
                      onChange={(e) => handleUpdateRuleSeverity(key, e.target.value as ScheduleRuleSeverity)}
                      className="bg-slate-900 text-xs text-white border border-slate-600 rounded-lg px-2 py-1 font-semibold shrink-0 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      <option value="BLOCK">BLOCK</option>
                      <option value="WARN">WARN</option>
                      <option value="IGNORE">IGNORE</option>
                    </select>
                  </div>
                );
              })}
            </div>

            {/* Threshold Adjusters */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between bg-slate-800/50 p-2 rounded-xl">
                <span className="text-[11px] text-slate-300">Min Rest Period:</span>
                <span className="text-xs font-bold text-amber-300">{rulesConfig.minRestHours} Hours</span>
              </div>
              <div className="flex items-center justify-between bg-slate-800/50 p-2 rounded-xl">
                <span className="text-[11px] text-slate-300">Weekly Overtime Cap:</span>
                <span className="text-xs font-bold text-blue-300">{rulesConfig.weeklyOvertimeThresholdHours} Hours</span>
              </div>
            </div>
          </div>
        )}

        {/* Conflicts List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 scrollbar-thin">
          {displayedConflicts.length === 0 ? (
            <div className="text-center py-14 px-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center mb-3">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-sm font-bold text-slate-800">
                {filterSeverity === 'ALL' ? 'No Schedule Conflicts Found' : `No ${filterSeverity} conflicts`}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                {filterSeverity === 'ALL' 
                  ? 'The roster satisfies all rules including turnaround rest periods, overtime limits, skills, and availability.'
                  : 'All items in this category have been resolved or cleared.'}
              </p>
            </div>
          ) : (
            displayedConflicts.map(conflict => {
              const isBlock = conflict.severity === 'BLOCK';
              const isOverridden = conflict.isOverridden;

              return (
                <div 
                  key={conflict.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    isOverridden 
                      ? 'bg-emerald-50/60 border-emerald-200/80' 
                      : isBlock 
                        ? 'bg-rose-50/70 border-rose-200 shadow-2xs' 
                        : 'bg-amber-50/60 border-amber-200 shadow-2xs'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 shrink-0">
                        {getRuleIcon(conflict.ruleKey)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            isOverridden
                              ? 'bg-emerald-200 text-emerald-900 font-bold'
                              : isBlock
                                ? 'bg-rose-600 text-white'
                                : 'bg-amber-500 text-white'
                          }`}>
                            {isOverridden ? 'OVERRIDDEN' : conflict.severity}
                          </span>
                          <span className="text-xs font-bold text-slate-900">
                            {conflict.title}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                          {conflict.message}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[11px] font-mono text-slate-500 bg-white/80 px-2 py-0.5 rounded border border-slate-200">
                        {conflict.shiftDate}
                      </span>
                    </div>
                  </div>

                  {/* Overridden Audit Stamp */}
                  {isOverridden && (
                    <div className="mt-3 p-2.5 bg-emerald-100/70 rounded-xl text-xs text-emerald-900 border border-emerald-300/60 flex items-start gap-2">
                      <ShieldCheck size={16} className="text-emerald-700 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">
                          Overridden by {conflict.overriddenBy || 'Scheduler'} on {new Date(conflict.overriddenAt || '').toLocaleDateString()}
                        </div>
                        <div className="text-[11px] text-emerald-800 italic mt-0.5">
                          "{conflict.overrideReason}"
                        </div>
                      </div>
                    </div>
                  )}

                  {/* One-Tap Action Resolutions Bar */}
                  {!isOverridden && (
                    <div className="mt-3 pt-3 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {/* Action 1: Unassign */}
                        <button
                          type="button"
                          onClick={() => handleUnassign(conflict.shiftId)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 shadow-2xs transition-all active:scale-95"
                          title="Unassign worker from shift"
                        >
                          <UserX size={13} className="text-rose-600" />
                          <span>Unassign Shift</span>
                        </button>

                        {/* Action 2: Swap / Reassign */}
                        <button
                          type="button"
                          onClick={() => setSwapShiftTarget({ 
                            shiftId: conflict.shiftId, 
                            requiredSkill: conflict.details?.requiredSkill 
                          })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 shadow-2xs transition-all active:scale-95"
                          title="Swap with qualified worker"
                        >
                          <ArrowRightLeft size={13} className="text-blue-600" />
                          <span>Swap Worker</span>
                        </button>
                      </div>

                      {/* Action 3: Override with Reason (Warnings or if allowed) */}
                      {(!isBlock || rulesConfig.allowOverrideOnBlock) && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedConflictForOverride(conflict);
                            setOverrideReasonText('');
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-200 transition-all active:scale-95 ml-auto"
                        >
                          <FileCheck size={13} />
                          <span>Override with Reason</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer / Publish Action */}
        <div className="p-5 border-t border-slate-200 bg-white shadow-lg space-y-3">
          {!canPublish ? (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-800">
              <ShieldAlert size={16} className="text-rose-600 shrink-0" />
              <span>
                <strong>{blockers.length} Blocking Conflict(s)</strong> must be resolved (unassign or swap) before publishing.
              </span>
            </div>
          ) : warnings.length > 0 ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2.5 text-xs text-amber-800">
              <AlertTriangle size={16} className="text-amber-600 shrink-0" />
              <span>
                <strong>{warnings.length} Warning(s) remaining.</strong> You may resolve them, provide mandatory overrides, or publish as accepted risks.
              </span>
            </div>
          ) : (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>All schedule validation checks passed! Ready for publication.</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
            >
              Continue Editing
            </button>

            <button
              type="button"
              disabled={!canPublish || isPublishing}
              onClick={handlePublishRoster}
              className={`flex-1 flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl shadow-md transition-all active:scale-95 ${
                canPublish
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300/60 shadow-none'
              }`}
            >
              {isPublishing ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  <span>Publishing Roster...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>Publish Roster ({shifts.length} Shifts)</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>

      {/* MODAL 1: Override Reason Input Modal */}
      {selectedConflictForOverride && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-indigo-700">
                <FileCheck size={20} />
                <h3 className="text-sm font-bold text-slate-900">Mandatory Override Justification</h3>
              </div>
              <button
                onClick={() => setSelectedConflictForOverride(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-3">
              <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 border border-slate-200">
                <div className="font-semibold text-slate-900">{selectedConflictForOverride.title}</div>
                <div className="text-[11px] text-slate-500 mt-1">{selectedConflictForOverride.message}</div>
              </div>

              <form onSubmit={handleSubmitOverride} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Select Standard Reason or Enter Specific Details:
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {[
                      'Urgent production deadline approved by Plant Manager',
                      'Employee volunteered and signed overtime agreement',
                      'Emergency machine breakdown turnaround coverage',
                      'Cross-trained operator covering sudden absence'
                    ].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setOverrideReasonText(preset)}
                        className="text-[10px] px-2 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 rounded-lg border border-slate-200 transition-colors text-left"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={3}
                    required
                    value={overrideReasonText}
                    onChange={(e) => setOverrideReasonText(e.target.value)}
                    placeholder="Provide mandatory business justification for overriding this schedule warning..."
                    className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <div className="text-[10px] text-slate-400 mt-1">
                    * This override will be recorded in the immutable audit trail with your user identity and timestamp.
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedConflictForOverride(null)}
                    className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingOverride || !overrideReasonText.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-50"
                  >
                    {isSubmittingOverride ? 'Recording...' : 'Authorize Override'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Swap Worker Picker */}
      {swapShiftTarget && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-blue-700">
                <ArrowRightLeft size={18} />
                <h3 className="text-sm font-bold text-slate-900">Select Replacement Worker</h3>
              </div>
              <button
                onClick={() => setSwapShiftTarget(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-2 text-xs text-slate-500">
              {swapShiftTarget.requiredSkill ? (
                <span>Filtering available workers matching required skill: <strong className="text-slate-800">{swapShiftTarget.requiredSkill}</strong></span>
              ) : (
                <span>Pick an active worker from your workforce pool to assign to this shift:</span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto mt-3 space-y-2 pr-1 scrollbar-thin">
              {workers
                .filter(w => w.status === 'ACTIVE')
                .map(worker => {
                  const matchesSkill = !swapShiftTarget.requiredSkill || 
                    (worker.designation || '').toLowerCase().includes(swapShiftTarget.requiredSkill.toLowerCase()) ||
                    (worker.department || '').toLowerCase().includes(swapShiftTarget.requiredSkill.toLowerCase());

                  return (
                    <button
                      key={worker.id}
                      type="button"
                      onClick={() => handleSwapWorker(swapShiftTarget.shiftId, worker)}
                      className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 flex items-center justify-between transition-all group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center border border-slate-200 group-hover:bg-blue-100 group-hover:text-blue-700">
                          {worker.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-slate-900">{worker.name}</div>
                          <div className="text-[10px] text-slate-500">{worker.designation || 'Staff'} • {worker.department || 'Production'}</div>
                        </div>
                      </div>

                      {matchesSkill ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          Qualified
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          General
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>

            <div className="pt-3 border-t border-slate-100 mt-2 text-right">
              <button
                type="button"
                onClick={() => setSwapShiftTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
