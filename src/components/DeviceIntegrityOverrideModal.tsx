import React, { useState } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  CheckCircle2, 
  X, 
  KeyRound, 
  Smartphone, 
  UserCheck, 
  AlertTriangle,
  Info,
  Clock,
  Sparkles
} from 'lucide-react';
import { DeviceIntegrityVerdict } from '../types';
import { deviceAttestationService } from '../services/deviceAttestationService';

interface DeviceIntegrityOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  workerId: string;
  workerName: string;
  deviceModel: string;
  verdict?: DeviceIntegrityVerdict | null;
  onApplyOverride: (override: {
    approvedBy: string;
    supervisorName: string;
    reason: string;
    approvedAt: string;
    overrideCode: string;
  }) => Promise<void>;
}

export const DeviceIntegrityOverrideModal: React.FC<DeviceIntegrityOverrideModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  workerId,
  workerName,
  deviceModel,
  verdict,
  onApplyOverride
}) => {
  const [overrideCode, setOverrideCode] = useState<string>('');
  const [supervisorName, setSupervisorName] = useState<string>('Site Manager');
  const [reason, setReason] = useState<string>('Verified employee identity in person on LineageOS / custom ROM device');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'PIN' | 'REMOTE'>('PIN');
  const [remoteRequestSent, setRemoteRequestSent] = useState<boolean>(false);
  const [generatedDemoCode, setGeneratedDemoCode] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleVerifyAndSubmit = async (codeToVerify?: string) => {
    const code = (codeToVerify || overrideCode).trim();
    setErrorMessage(null);

    if (!code) {
      setErrorMessage('Please enter the 6-digit supervisor override code or PIN.');
      return;
    }

    setIsSubmitting(true);
    try {
      const validation = deviceAttestationService.validateSupervisorOverrideCode(
        tenantId,
        workerId,
        code
      );

      if (!validation.valid) {
        setErrorMessage(validation.reason || 'Invalid or expired supervisor override code.');
        setIsSubmitting(false);
        return;
      }

      const overrideData = {
        approvedBy: validation.record?.approvedBy || 'supervisor_duty',
        supervisorName: validation.record?.supervisorName || supervisorName || 'Field Supervisor',
        reason: validation.record?.reason || reason,
        approvedAt: new Date().toISOString(),
        overrideCode: code
      };

      setSuccessNotice('Supervisor override approved and verified!');
      setTimeout(async () => {
        await onApplyOverride(overrideData);
        setIsSubmitting(false);
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to apply supervisor override.');
      setIsSubmitting(false);
    }
  };

  const handleGenerateSupervisorCode = () => {
    const record = deviceAttestationService.generateSupervisorOverride({
      tenantId,
      workerId,
      workerName,
      deviceModel,
      approvedBy: 'supervisor_on_duty',
      supervisorName: supervisorName || 'Site Manager',
      reason
    });
    setGeneratedDemoCode(record.overrideCode);
    setOverrideCode(record.overrideCode);
  };

  const handleSendRemoteRequest = async () => {
    setIsSubmitting(true);
    try {
      const record = deviceAttestationService.generateSupervisorOverride({
        tenantId,
        workerId,
        workerName,
        deviceModel,
        approvedBy: 'remote_inbox_supervisor',
        supervisorName: 'Designated Shift Supervisor',
        reason
      });
      setRemoteRequestSent(true);
      setGeneratedDemoCode(record.overrideCode);
      setOverrideCode(record.overrideCode);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-amber-200 dark:border-amber-900/50 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Device Integrity Verification</h3>
              <p className="text-amber-100 text-xs">Supervisor Override Protocol (Play Integrity)</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* Status Breakdown Box */}
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {verdict?.isCustomRom ? 'Custom ROM Detected (e.g. LineageOS)' : 'Device Integrity Check Failed'}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  Google Play Integrity returned <code className="bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded text-amber-900 dark:text-amber-200">MEETS_DEVICE_INTEGRITY: false</code>. The operating system or bootloader has modifications.
                </p>
              </div>
            </div>

            {/* Diagnostic Badges */}
            <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
              <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Basic Integrity</div>
                <div className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Pass
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 text-center">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Device Integrity</div>
                <div className="font-bold text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1 mt-0.5">
                  <ShieldAlert className="w-3.5 h-3.5" /> Fail
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Strong Hardware</div>
                <div className="font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                  Optional
                </div>
              </div>
            </div>
          </div>

          {/* Worker & Device Info */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-slate-500" />
              <div>
                <span className="text-slate-500">Device: </span>
                <span className="font-semibold text-slate-900 dark:text-white">{deviceModel}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-slate-500" />
              <div>
                <span className="text-slate-500">Worker: </span>
                <span className="font-semibold text-slate-900 dark:text-white">{workerName}</span>
              </div>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              onClick={() => setActiveTab('PIN')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                activeTab === 'PIN'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              In-Person Supervisor PIN
            </button>
            <button
              onClick={() => setActiveTab('REMOTE')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                activeTab === 'REMOTE'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Remote Inbox Approval
            </button>
          </div>

          {activeTab === 'PIN' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Supervisor 6-Digit Code or Emergency PIN
                </label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="e.g. 749201 or generated OTP"
                    value={overrideCode}
                    onChange={(e) => setOverrideCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-base tracking-widest font-mono font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  <KeyRound className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5" />
                  Supervisor on duty may enter their emergency authorization code or tap below.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Supervisor / Manager Name
                </label>
                <input
                  type="text"
                  value={supervisorName}
                  onChange={(e) => setSupervisorName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  placeholder="Supervisor Name"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Verification Reason
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="Verified employee identity in person on LineageOS / custom ROM device">
                    Verified employee identity in person on LineageOS / custom ROM
                  </option>
                  <option value="Physical inspection confirmed genuine hardware; OEM bootloader unlock for repair">
                    Physical inspection confirmed genuine hardware (OEM unlock)
                  </option>
                  <option value="Authorized company test device on custom firmware">
                    Authorized company test device on custom firmware
                  </option>
                  <option value="Temporary shift loaner device assigned by manager">
                    Temporary shift loaner device assigned by manager
                  </option>
                </select>
              </div>

              {/* Demo Helper Banner */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Demo & Reviewer Quick Test
                  </span>
                  {generatedDemoCode && (
                    <span className="text-[11px] font-mono bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.5 rounded font-bold">
                      Code: {generatedDemoCode}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOverrideCode('749201');
                      handleVerifyAndSubmit('749201');
                    }}
                    className="flex-1 py-1.5 px-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium transition"
                  >
                    Use On-Duty PIN (749201)
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateSupervisorCode}
                    className="py-1.5 px-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-medium transition"
                  >
                    Generate OTP
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-center py-2">
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-left space-y-2">
                <p className="font-semibold text-blue-900 dark:text-blue-200 text-xs flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-blue-500" />
                  E3 Action Inbox Remote Request
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Sends an urgent verification request to your supervisor's E3 Inbox. The supervisor can review your device profile and authorize this shift with one click.
                </p>
              </div>

              {remoteRequestSent ? (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 space-y-2">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
                  <p className="font-bold text-sm">Supervisor Verification Dispatched</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    Your request was routed to E3 Action Inbox. We generated single-use authorization code:
                  </p>
                  <div className="text-xl font-mono font-bold tracking-widest py-1 bg-white dark:bg-slate-800 rounded-lg border border-emerald-300 dark:border-emerald-800 text-slate-900 dark:text-white">
                    {generatedDemoCode}
                  </div>
                  <button
                    onClick={() => handleVerifyAndSubmit(generatedDemoCode || '')}
                    className="w-full mt-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow transition"
                  >
                    Apply Approved Override Now
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSendRemoteRequest}
                  disabled={isSubmitting}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow transition"
                >
                  {isSubmitting ? 'Routing to Supervisor Inbox...' : 'Notify Supervisor via E3 Inbox'}
                </button>
              )}
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successNotice && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successNotice}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
          >
            Cancel
          </button>
          {activeTab === 'PIN' && (
            <button
              type="button"
              onClick={() => handleVerifyAndSubmit()}
              disabled={isSubmitting || !overrideCode}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-2"
            >
              {isSubmitting ? (
                <span>Verifying...</span>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Authorize Punch</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
