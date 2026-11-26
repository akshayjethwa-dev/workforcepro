// src/screens/SetupWizardScreen.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  CheckCircle,
  Clock,
  SkipForward,
  ArrowLeft,
  ArrowRight,
  Save,
  Upload,
  Download,
  AlertTriangle,
  RefreshCw,
  Rocket,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  MigrationProgress,
  MigrationStepStatus,
  DEFAULT_MIGRATION_STEPS,
  Worker,
  OrgSettings,
} from '../types/index';
import {
  getMigrationProgress,
  saveMigrationProgress,
  updateStepStatus,
  completeMigration,
  initialiseMigration,
  isDemoTenant,
} from '../services/migrationService';
import { dbService } from '../services/db';
import {
  downloadLeaveBalanceTemplate,
  downloadLoanLedgerTemplate,
  downloadShiftRulesTemplate,
} from '../utils/workerExcelTemplate';
import { BulkLeaveBalanceImportModal } from '../components/BulkLeaveBalanceImportModal';
import { BulkLoanLedgerImportModal } from '../components/BulkLoanLedgerImportModal';
import { ShiftStatutoryImportModal } from '../components/ShiftStatutoryImportModal';

type LoadState = 'bootstrapping' | 'loading' | 'ready' | 'error';

export const SetupWizardScreen: React.FC = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const tenantId = profile?.tenantId;
  const demoTenant = isDemoTenant(tenantId);

  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('bootstrapping');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [wizardWorkers, setWizardWorkers] = useState<Worker[]>([]);
  const [wizardOrgSettings, setWizardOrgSettings] = useState<OrgSettings | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [showShiftStatutoryModal, setShowShiftStatutoryModal] = useState(false);

  // ---------------------------------------------------------------
  // DEMO-TENANT REDIRECT: skip the wizard entirely in demo/unauthenticated mode.
  // ---------------------------------------------------------------
  useEffect(() => {
    if (demoTenant) {
      toast.info(
        'The Migration Wizard is not available in demo mode.',
        'Demo Mode'
      );
      navigate('/dashboard', { replace: true });
    }
  }, [demoTenant, navigate, toast]);

  // ---------------------------------------------------------------
  // LOAD / INITIALISE MIGRATION PROGRESS (real tenants only)
  // ---------------------------------------------------------------
  const loadMigration = useCallback(async () => {
    if (demoTenant) return; // handled by the redirect effect above
    if (!tenantId) {
      setLoadState('bootstrapping');
      return;
    }
    setLoadState('loading');
    setErrorMessage(null);

    try {
      const [existing, fetchedWorkers, fetchedSettings] = await Promise.all([
        getMigrationProgress(tenantId),
        dbService.getWorkers(tenantId).catch(() => [] as Worker[]),
        dbService.getOrgSettings(tenantId).catch(() => null),
      ]);
      setWizardWorkers(fetchedWorkers);
      setWizardOrgSettings(fetchedSettings);
      if (existing) {
        setProgress(existing);
      } else {
        const fresh = await initialiseMigration(tenantId);
        setProgress(fresh);
      }
      setLoadState('ready');
    } catch (err: any) {
      console.error('[SetupWizard] init failed:', err);
      const msg =
        err?.message ||
        'Could not load your migration progress. This is usually a Firestore permissions issue.';
      setErrorMessage(msg);
      setLoadState('error');
    }
  }, [tenantId, demoTenant]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadMigration();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMigration]);

  // ---------------------------------------------------------------
  // PERSISTENCE HELPERS
  // ---------------------------------------------------------------
  const persistProgress = useCallback(
    async (updated: MigrationProgress): Promise<boolean> => {
      if (demoTenant || !tenantId) return false;
      setSaving(true);
      try {
        await saveMigrationProgress(tenantId, updated);
        setProgress(updated);
        return true;
      } catch (err: any) {
        console.error('[SetupWizard] save failed:', err);
        toast.error(err?.message || 'Could not save progress.', 'Save Failed');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [tenantId, demoTenant, toast]
  );

  const setStepStatus = useCallback(
    async (
      stepId: number,
      status: MigrationStepStatus,
      advance = false
    ): Promise<boolean> => {
      if (demoTenant || !tenantId) return false;
      try {
        const updated = await updateStepStatus(tenantId, stepId, status, advance);
        setProgress(updated);
        return true;
      } catch (err: any) {
        console.error('[SetupWizard] updateStepStatus failed:', err);
        toast.error(err?.message || 'Could not update step.', 'Update Failed');
        return false;
      }
    },
    [tenantId, demoTenant, toast]
  );

  // ---------------------------------------------------------------
  // ACTIONS
  // ---------------------------------------------------------------
  const handleSaveAndExit = async () => {
    if (demoTenant) {
      navigate('/dashboard');
      return;
    }
    if (!progress) return;
    const ok = await persistProgress(progress);
    if (ok) {
      toast.success('Progress saved. You can resume anytime.', 'Saved');
    }
    navigate('/dashboard');
  };

  const handleGoLive = async () => {
    if (demoTenant || !tenantId) return;
    setSaving(true);
    try {
      await completeMigration(tenantId);
      toast.success('Migration complete! Welcome to WorkforcePro.', 'Go‑Live');
      navigate('/dashboard');
    } catch (err: any) {
      console.error('[SetupWizard] completeMigration failed:', err);
      toast.error(err?.message || 'Could not complete migration.', 'Go‑Live Failed');
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------
  // STEP RENDERERS
  // ---------------------------------------------------------------
  const renderStep1 = () => {
    const mapping = wizardOrgSettings?.compliance?.statutoryMapping;
    const shiftCount = wizardOrgSettings?.shifts?.length ?? 0;

    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Shift Rules &amp; Primary Statutory State</h2>
        <p className="text-slate-600">
          Upload your factory&apos;s shift timings using{' '}
          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">Shift_Rules_Template.xlsx</span>{' '}
          and select your Primary State from the verified dropdown to lock PT slabs, LWF dates, and Central PF/ESI rules from day one.
        </p>

        <div className={`p-4 rounded-xl border ${mapping?.locked ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {mapping?.locked ? (
                <Lock size={16} className="text-emerald-700" />
              ) : (
                <Clock size={16} className="text-slate-500" />
              )}
              <span className="text-sm font-semibold text-slate-900">
                {mapping?.locked
                  ? `Statutory Rules Locked: ${mapping.primaryState}`
                  : 'Statutory State Not Locked Yet'}
              </span>
            </div>
            <span className="text-xs font-medium text-slate-600">
              {shiftCount} {shiftCount === 1 ? 'shift' : 'shifts'} configured
            </span>
          </div>
          {mapping?.locked ? (
            <p className="text-xs text-emerald-900 mt-2 leading-relaxed">
              PT: {mapping.ptSummary} · LWF: {mapping.lwfScheduleLabel} · Central PF/ESI Active
            </p>
          ) : (
            <p className="text-xs text-slate-500 mt-1.5">
              Excel upload of statutory slabs is intentionally disabled — choose your state via the strict dropdown selector.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => {
              const fileName = downloadShiftRulesTemplate();
              toast.success(`Downloaded ${fileName}.`, 'Step 1');
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-medium flex items-center gap-2 cursor-pointer"
          >
            <Download size={16} /> Download Shift_Rules_Template.xlsx
          </button>
          <button
            type="button"
            onClick={() => setShowShiftStatutoryModal(true)}
            disabled={!wizardOrgSettings}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <ShieldCheck size={16} /> Open Shift &amp; Statutory Wizard
          </button>
        </div>

        <button
          onClick={() => setStepStatus(1, 'COMPLETED', true)}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 cursor-pointer"
        >
          Save &amp; Continue
        </button>
      </div>
    );
  };

  const renderStep2 = () => {
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const data = evt.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const workers = XLSX.utils.sheet_to_json(sheet);
          console.log('Parsed workers:', workers);
          // TODO: call dbService.addWorkerBulk(workers)
          const ok = await setStepStatus(2, 'COMPLETED', true);
          if (ok) {
            toast.success(`${workers.length} workers imported.`, 'Workers Added');
          }
        } catch (err: any) {
          console.error('[SetupWizard] worker import failed:', err);
          toast.error(err?.message || 'Failed to import workers.', 'Import Failed');
        }
      };
      reader.readAsBinaryString(file);
    };

    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Add Workers</h2>
        <p className="text-slate-600">
          Upload an Excel file or add workers manually. This step must be completed
          before you can run payroll.
        </p>
        <div className="flex gap-4">
          <label className="flex-1 p-6 border-2 border-dashed rounded-xl text-center cursor-pointer hover:bg-slate-50">
            <Upload className="mx-auto mb-2" size={24} />
            <span className="text-sm font-medium">Upload Excel</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
          <button
            onClick={() => {
              toast.info('Manual entry – use the Workers screen.');
            }}
            className="flex-1 p-6 border-2 border-dashed rounded-xl text-center hover:bg-slate-50"
          >
            <span className="text-sm font-medium">Add Manually</span>
          </button>
        </div>
      </div>
    );
  };

  const renderStep3 = () => {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Import Opening Leave Balances</h2>
        <p className="text-slate-600">
          Download Leave_Balance_Template.xlsx, fill in accrued leave balances from your old
          software, and validate before committing. You can skip this step if you have no
          historical leave data.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => {
              const fileName = downloadLeaveBalanceTemplate({
                existingWorkers: wizardWorkers,
                prefillExistingWorkers: wizardWorkers.length > 0,
              });
              toast.success(`Downloaded ${fileName}.`, 'Step 3');
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-medium flex items-center gap-2 cursor-pointer"
          >
            <Download size={16} /> Download Leave_Balance_Template.xlsx
          </button>
          <button
            type="button"
            onClick={() => setShowLeaveModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold cursor-pointer flex items-center gap-2"
          >
            <Upload size={16} /> Open Leave Balance Importer
          </button>
        </div>
        <button
          onClick={() => setStepStatus(3, 'SKIPPED', true)}
          disabled={saving}
          className="text-sm text-slate-500 underline disabled:opacity-50"
        >
          Skip this step
        </button>
      </div>
    );
  };

  const renderStep4 = () => {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Import Pending Advances / Loans</h2>
        <p className="text-slate-600">
          Download Loan_Ledger_Template.xlsx and upload workers&apos; outstanding loans so
          PayrollEngine automatically deducts monthly EMIs as &ldquo;Loan Recovery&rdquo; on
          upcoming payslips. You can skip this step if there are none.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => {
              const fileName = downloadLoanLedgerTemplate({
                existingWorkers: wizardWorkers,
                prefillExistingWorkers: wizardWorkers.length > 0,
              });
              toast.success(`Downloaded ${fileName}.`, 'Step 4');
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-medium flex items-center gap-2 cursor-pointer"
          >
            <Download size={16} /> Download Loan_Ledger_Template.xlsx
          </button>
          <button
            type="button"
            onClick={() => setShowLoanModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold cursor-pointer flex items-center gap-2"
          >
            <Upload size={16} /> Open Loan Ledger Importer
          </button>
        </div>
        <button
          onClick={() => setStepStatus(4, 'SKIPPED', true)}
          disabled={saving}
          className="text-sm text-slate-500 underline disabled:opacity-50"
        >
          Skip this step
        </button>
      </div>
    );
  };

  const renderStep5 = () => {
    const workersComplete =
      progress?.steps.find((s) => s.id === 2)?.status === 'COMPLETED';

    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Review & Go‑Live</h2>
        <p className="text-slate-600">
          Review the status of each step. You can only go live once Step 2 (Workers)
          is completed.
        </p>
        <ul className="space-y-2">
          {progress?.steps.map((step) => (
            <li key={step.id} className="flex items-center gap-2">
              {step.status === 'COMPLETED' ? (
                <CheckCircle size={18} className="text-green-600" />
              ) : step.status === 'SKIPPED' ? (
                <SkipForward size={18} className="text-amber-600" />
              ) : (
                <Clock size={18} className="text-slate-400" />
              )}
              <span>
                {step.id}. {step.title}
              </span>
              <span className="ml-auto text-sm font-medium">{step.status}</span>
            </li>
          ))}
        </ul>
        <button
          onClick={handleGoLive}
          disabled={!workersComplete || saving}
          className={`px-4 py-2 rounded-xl text-white ${
            workersComplete && !saving
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-slate-300 cursor-not-allowed'
          }`}
        >
          {saving ? 'Finishing…' : 'Go‑Live'}
        </button>
        {!workersComplete && (
          <p className="text-sm text-amber-600">
            <AlertTriangle size={14} className="inline mr-1" />
            Step 2 (Add Workers) must be completed before going live.
          </p>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------
  // DEMO MODE: render nothing (redirect effect will take over)
  // ---------------------------------------------------------------
  if (demoTenant) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <RefreshCw className="mx-auto text-blue-600 animate-spin mb-3" size={28} />
          <p className="text-sm text-slate-600">Returning to dashboard…</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // LOADING / ERROR STATES
  // ---------------------------------------------------------------
  if (loadState === 'bootstrapping') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <RefreshCw className="mx-auto text-blue-600 animate-spin mb-3" size={28} />
          <p className="text-sm text-slate-600">Preparing your workspace…</p>
        </div>
      </div>
    );
  }

  if (loadState === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <RefreshCw className="mx-auto text-blue-600 animate-spin mb-3" size={28} />
          <p className="text-sm text-slate-600">Loading wizard…</p>
        </div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle size={24} />
          </div>
          <h2 className="font-bold text-slate-900 mb-2">Could not load the wizard</h2>
          <p className="text-sm text-slate-600 mb-4 break-words">{errorMessage}</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={loadMigration}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <RefreshCw size={15} /> Try Again
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <p className="text-sm text-slate-600">No progress loaded. Please refresh.</p>
      </div>
    );
  }

  const activeStep = progress.steps[progress.currentStepIndex];

  const renderStepContent = () => {
    switch (activeStep.id) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      case 4:
        return renderStep4();
      case 5:
        return renderStep5();
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b p-4 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0">
            <Rocket size={16} />
          </div>
          <h1 className="text-lg font-semibold truncate">Migration Wizard</h1>
        </div>
        <button
          onClick={handleSaveAndExit}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-100 rounded-xl hover:bg-slate-200 disabled:opacity-60"
        >
          <Save size={16} /> {saving ? 'Saving…' : 'Save & Exit'}
        </button>
      </header>

      {/* Progress sidebar + content */}
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="w-full md:w-64 bg-white md:border-r border-b md:border-b-0 p-3 md:p-4 space-y-1.5 md:space-y-2">
          {progress.steps.map((step, idx) => (
            <button
              key={step.id}
              onClick={() => {
                if (idx <= progress.currentStepIndex || step.status === 'COMPLETED') {
                  setProgress({ ...progress, currentStepIndex: idx });
                }
              }}
              className={`w-full text-left p-2 rounded-lg flex items-center gap-2 ${
                idx === progress.currentStepIndex
                  ? 'bg-blue-50 text-blue-700'
                  : 'hover:bg-slate-50'
              }`}
            >
              {step.status === 'COMPLETED' ? (
                <CheckCircle size={16} className="text-green-600 shrink-0" />
              ) : step.status === 'SKIPPED' ? (
                <SkipForward size={16} className="text-amber-600 shrink-0" />
              ) : (
                <span className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
              )}
              <span className="text-sm truncate">
                {step.id}. {step.title}
              </span>
            </button>
          ))}
        </aside>

        <main className="flex-1 p-6 bg-white">
          <div className="max-w-2xl mx-auto">
            {renderStepContent()}

            <div className="mt-8 flex justify-between">
              <button
                onClick={() => {
                  if (progress.currentStepIndex > 0) {
                    setProgress({
                      ...progress,
                      currentStepIndex: progress.currentStepIndex - 1,
                    });
                  }
                }}
                disabled={progress.currentStepIndex === 0}
                className="px-4 py-2 text-sm rounded-xl border disabled:opacity-50 flex items-center gap-2"
              >
                <ArrowLeft size={16} /> Back
              </button>

              {activeStep.id < 5 && (
                <button
                  onClick={() => {
                    setProgress({
                      ...progress,
                      currentStepIndex: Math.min(
                        progress.currentStepIndex + 1,
                        progress.steps.length - 1
                      ),
                    });
                  }}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl flex items-center gap-2"
                >
                  Next <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        </main>
      </div>

      {tenantId && (
        <>
          <BulkLeaveBalanceImportModal
            isOpen={showLeaveModal}
            onClose={() => setShowLeaveModal(false)}
            tenantId={tenantId}
            orgSettings={wizardOrgSettings}
            existingWorkers={wizardWorkers}
            actorEmail={profile?.email || 'admin@workforcepro.in'}
            onSuccess={async () => {
              const updatedWorkers = await dbService.getWorkers(tenantId).catch(() => wizardWorkers);
              setWizardWorkers(updatedWorkers);
              await setStepStatus(3, 'COMPLETED', true);
            }}
            onOrgSettingsUpdated={(updated) => setWizardOrgSettings(updated)}
          />

          <BulkLoanLedgerImportModal
            isOpen={showLoanModal}
            onClose={() => setShowLoanModal(false)}
            tenantId={tenantId}
            orgSettings={wizardOrgSettings}
            existingWorkers={wizardWorkers}
            actorEmail={profile?.email || 'admin@workforcepro.in'}
            onSuccess={async () => {
              await setStepStatus(4, 'COMPLETED', true);
            }}
          />

          {wizardOrgSettings && (
            <ShiftStatutoryImportModal
              isOpen={showShiftStatutoryModal}
              onClose={() => setShowShiftStatutoryModal(false)}
              tenantId={tenantId}
              orgSettings={wizardOrgSettings}
              actorEmail={profile?.email || 'admin@workforcepro.in'}
              initialStep="SHIFTS"
              onApplied={async (updated) => {
                setWizardOrgSettings(updated);
                await setStepStatus(1, 'COMPLETED', true);
              }}
            />
          )}
        </>
      )}
    </div>
  );
};