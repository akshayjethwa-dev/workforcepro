// src/components/WorkerAccessModal.tsx
import React, { useState, useEffect } from 'react';
import { 
  X, ShieldAlert, Key, Smartphone, Trash2, AlertTriangle, 
  CheckCircle2, Clock, Calendar, IndianRupee, Download, 
  FileText, ExternalLink, RefreshCw, Send, Check, Copy, UserCheck,
  Shield, ShieldCheck, MapPin, Eye, Lock
} from 'lucide-react';
import { 
  Worker, 
  WorkerAccessToken, 
  BoundDevice, 
  RevocationReason, 
  DpdpSubjectAccessReport,
  ConsentRecord,
  LocationDeletionRequest
} from '../types/index';
import { magicLinkService } from '../services/magicLinkService';
import { consentService } from '../services/consentService';
import { LocationPrivacyModal } from './LocationPrivacyModal';
import { CURRENT_CONSENT_POLICY_VERSION } from '../utils/consentTranslations';
import { useToast } from '../contexts/ToastContext';

interface Props {
  worker: Worker;
  tenantId: string;
  managerEmail: string;
  onClose: () => void;
  onSendMagicLink?: (scope: any) => void;
}

export const WorkerAccessModal: React.FC<Props> = ({
  worker,
  tenantId,
  managerEmail,
  onClose,
  onSendMagicLink
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'TOKENS' | 'DEVICES' | 'CONSENT' | 'REVOKED' | 'DPDP'>('TOKENS');
  const [activeTokens, setActiveTokens] = useState<WorkerAccessToken[]>([]);
  const [revokedTokens, setRevokedTokens] = useState<WorkerAccessToken[]>([]);
  const [boundDevices, setBoundDevices] = useState<BoundDevice[]>([]);
  const [workerConsent, setWorkerConsent] = useState<ConsentRecord | null>(null);
  const [consentHistory, setConsentHistory] = useState<ConsentRecord[]>([]);
  const [deletionTickets, setDeletionTickets] = useState<LocationDeletionRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Privacy Modal state
  const [showPrivacyModal, setShowPrivacyModal] = useState<boolean>(false);
  const [showAssistedWithdrawModal, setShowAssistedWithdrawModal] = useState<boolean>(false);
  const [isWithdrawingAssisted, setIsWithdrawingAssisted] = useState<boolean>(false);

  // Revocation dialog state
  const [tokenToRevoke, setTokenToRevoke] = useState<WorkerAccessToken | null>(null);
  const [revocationReason, setRevocationReason] = useState<RevocationReason>('suspicious access');
  const [isRevoking, setIsRevoking] = useState<boolean>(false);

  // Device unbinding state
  const [deviceToUnbind, setDeviceToUnbind] = useState<BoundDevice | null>(null);

  // DPDP export state
  const [dpdpReport, setDpdpReport] = useState<DpdpSubjectAccessReport | null>(null);
  const [isExportingDpdp, setIsExportingDpdp] = useState<boolean>(false);

  const loadData = () => {
    setLoading(true);
    try {
      const { active, revoked } = magicLinkService.getTokensForWorker(worker.id);
      const devices = magicLinkService.getBoundDevicesForWorker(worker.id);
      const consent = consentService.getWorkerConsent(worker.id, tenantId);
      const history = consentService.getConsentHistory(worker.id);
      const tickets = consentService.getDeletionTicketsForWorker(worker.id);
      
      setActiveTokens(active);
      setRevokedTokens(revoked);
      setBoundDevices(devices);
      setWorkerConsent(consent);
      setConsentHistory(history);
      setDeletionTickets(tickets);
    } catch (err) {
      console.error('Failed to load worker access records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [worker.id]);

  const handleConfirmRevoke = async () => {
    if (!tokenToRevoke) return;
    setIsRevoking(true);
    try {
      await magicLinkService.revokeToken(tokenToRevoke.token, managerEmail, revocationReason);
      toast.success(`Magic link revoked (${revocationReason}). Takes effect within 60s.`);
      setTokenToRevoke(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to revoke token');
    } finally {
      setIsRevoking(false);
    }
  };

  const handleConfirmUnbindDevice = async () => {
    if (!deviceToUnbind) return;
    try {
      await magicLinkService.unbindDevice(worker.id, deviceToUnbind.id, managerEmail, 'manager initiated unbind');
      toast.success(`Device ${deviceToUnbind.deviceModel} unbound successfully.`);
      setDeviceToUnbind(null);
      loadData();
    } catch (err: any) {
      toast.error('Failed to unbind device: ' + err.message);
    }
  };

  const handleGenerateDpdpReport = async () => {
    setIsExportingDpdp(true);
    try {
      const report = await magicLinkService.generateDpdpSubjectAccessReport(worker, tenantId);
      setDpdpReport(report);
      setActiveTab('DPDP');
      toast.success('DPDP Subject-Access Report compiled successfully.');
    } catch (err: any) {
      toast.error('Failed to generate DPDP report: ' + err.message);
    } finally {
      setIsExportingDpdp(false);
    }
  };

  const handlePrintDpdp = () => {
    window.print();
  };

  // Deliver Location Summary Link to worker (Key AC 6)
  const handleSendLocationSummaryLink = () => {
    const summaryUrl = `${window.location.origin}/#privacy-summary?workerId=${worker.id}&tenantId=${tenantId}`;
    if (worker.phone) {
      const message = encodeURIComponent(`नमस्ते ${worker.name}, यहाँ आपका WorkForce Pro लोकेशन डेटा सारांश (DPDP 2023) है: ${summaryUrl} (कोई raw coordinates साझा नहीं किए जाते)`);
      window.open(`https://wa.me/91${worker.phone.replace(/\D/g, '')}?text=${message}`, '_blank');
      toast.success('Location Summary link opened for WhatsApp dispatch');
    } else {
      navigator.clipboard.writeText(summaryUrl);
      toast.success('Location Summary link copied to clipboard');
    }
  };

  // Manager-Assisted Consent Withdrawal (Key AC 4c & 5)
  const handleConfirmAssistedWithdrawal = async () => {
    setIsWithdrawingAssisted(true);
    try {
      await consentService.withdrawConsent({
        tenantId,
        workerId: worker.id,
        workerName: worker.name,
        purposesToWithdraw: ['attendance_location', 'safety_location'],
        channel: 'MANAGER_ASSISTED',
        actorId: managerEmail
      });
      toast.success('Worker location consent recorded as withdrawn. Takes effect in 60s across all systems.');
      setShowAssistedWithdrawModal(false);
      loadData();
    } catch (err: any) {
      toast.error('Failed to record withdrawal: ' + err.message);
    } finally {
      setIsWithdrawingAssisted(false);
    }
  };

  // Manager-Assisted Deletion Ticket creation (Key AC 7)
  const handleCreateAssistedDeletionTicket = async () => {
    try {
      const ticket = await consentService.requestLocationDeletion({
        worker,
        tenantId,
        channel: 'MANAGER_ASSISTED'
      });
      toast.success(`DPDP Deletion Ticket #${ticket.id.slice(-6)} created (30-day statutory timeline).`);
      loadData();
    } catch (err: any) {
      toast.error('Failed to file deletion request: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-100 overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
              <Key size={18} className="text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight">Worker Access &amp; Lifecycle</h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] border border-emerald-400/30">
                  DPDP Compliant
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Token lifecycle, device bindings &amp; audit history for <strong className="text-white">{worker.name}</strong>
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 sm:px-6 pt-3 flex gap-2 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setActiveTab('TOKENS')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'TOKENS'
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Active Magic Links</span>
            <span className="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 text-[10px] font-mono">
              {activeTokens.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('DEVICES')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'DEVICES'
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Bound Devices</span>
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono">
              {boundDevices.filter(d => d.status === 'BOUND').length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('CONSENT')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'CONSENT'
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shield size={13} className={workerConsent?.active ? 'text-emerald-600' : 'text-amber-500'} />
            <span>DPDP Consent &amp; Privacy</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
              workerConsent?.active 
                ? 'bg-emerald-100 text-emerald-800' 
                : workerConsent?.withdrawnAt 
                  ? 'bg-rose-100 text-rose-800' 
                  : 'bg-amber-100 text-amber-800'
            }`}>
              {workerConsent?.active ? 'Active' : workerConsent?.withdrawnAt ? 'Withdrawn' : 'Pending'}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('REVOKED')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'REVOKED'
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Revoked / Inactive</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[10px] font-mono">
              {revokedTokens.length}
            </span>
          </button>

          <button
            onClick={() => handleGenerateDpdpReport()}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'DPDP'
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>DPDP Access Audit</span>
            <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[10px] font-mono">
              Export
            </span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm flex-1">
          
          {/* TAB 1: ACTIVE TOKENS */}
          {activeTab === 'TOKENS' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Active read-only links issued to {worker.name}</span>
                <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                  60s Real-time Revocation Active
                </span>
              </div>

              {activeTokens.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Key size={24} className="mx-auto text-slate-400 mb-2" />
                  <p className="font-bold text-slate-700 text-xs">No active magic links for this worker</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Use the "Send" action on the worker card to issue a scoped link.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {activeTokens.map((tok) => {
                    const expiry = new Date(tok.expiresAt);
                    const expiresHours = Math.max(0, Math.round((expiry.getTime() - Date.now()) / 3600000));
                    const distinctDevices = new Set(tok.accessLog?.map(a => a.deviceFingerprint) || []).size;

                    return (
                      <div 
                        key={tok.token}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          tok.flaggedMultiDevice 
                            ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-400/30' 
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="px-2 py-1 rounded-xl bg-blue-50 text-blue-700 font-bold text-[11px] border border-blue-200">
                              {tok.scope}
                            </span>
                            <span className="text-xs font-semibold text-slate-800">
                              Channel: <strong className="text-slate-900">{tok.channel}</strong>
                            </span>
                            {tok.flaggedMultiDevice && (
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px] flex items-center gap-1">
                                <AlertTriangle size={11} />
                                <span>Multi-Device Flag</span>
                              </span>
                            )}
                          </div>

                          {/* Single-tap Revoke Button */}
                          <button
                            type="button"
                            onClick={() => setTokenToRevoke(tok)}
                            className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition-colors self-start sm:self-auto flex items-center gap-1 active:scale-95 cursor-pointer"
                          >
                            <Trash2 size={12} />
                            <span>Revoke Access</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-600 font-mono">
                          <div>
                            <span className="text-slate-400 block text-[10px]">Issued At</span>
                            <span>{new Date(tok.issuedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Expires In</span>
                            <span className="font-bold text-slate-900">{expiresHours} hours</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Distinct Devices</span>
                            <span className={distinctDevices > 2 ? 'text-rose-600 font-bold' : ''}>
                              {distinctDevices} device{distinctDevices !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Last Used</span>
                            <span>
                              {tok.lastUsedAt 
                                ? new Date(tok.lastUsedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                                : 'Never opened'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: BOUND DEVICES */}
          {activeTab === 'DEVICES' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900">Device-Bound Punch Identity</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      boundDevices.filter(d => d.status === 'BOUND').length >= 2
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    }`}>
                      {boundDevices.filter(d => d.status === 'BOUND').length} / 2 Devices Maximum
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Workers can punch with 1-tap from up to 2 verified personal devices (30-day validity, auto-renewed on punch).
                  </p>
                </div>

                {onSendMagicLink && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSendMagicLink('PUNCH');
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 flex items-center gap-1.5"
                  >
                    <Smartphone size={13} />
                    <span>Send Punch Link</span>
                  </button>
                )}
              </div>

              {boundDevices.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Smartphone size={24} className="mx-auto text-slate-400 mb-2" />
                  <p className="font-bold text-slate-700 text-xs">No bound devices recorded</p>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-xs mx-auto">
                    When the worker opens their punch link and verifies their registered phone via OTP, their device will be bound here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {boundDevices.map((dev) => {
                    const isDevBound = dev.status === 'BOUND';
                    return (
                      <div 
                        key={dev.id}
                        className={`p-3.5 rounded-2xl border ${
                          isDevBound ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50/70 opacity-70'
                        } flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            isDevBound ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-400'
                          }`}>
                            <Smartphone size={18} />
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                              <span>{dev.deviceModel}</span>
                              <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                                isDevBound ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                              }`}>
                                {isDevBound ? 'ACTIVE (BOUND)' : 'UNBOUND'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5 space-x-2">
                              <span>Bound: {new Date(dev.boundAt).toLocaleDateString()}</span>
                              <span>•</span>
                              <span>Last Punch: {new Date(dev.lastPunchAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                              {dev.expiresAt && (
                                <>
                                  <span>•</span>
                                  <span className="text-emerald-700 font-semibold">Valid till {new Date(dev.expiresAt).toLocaleDateString()}</span>
                                </>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              Fingerprint: {dev.deviceFingerprint?.slice(0, 24)}...
                            </div>
                          </div>
                        </div>

                        {isDevBound && (
                          <button
                            type="button"
                            onClick={() => setDeviceToUnbind(dev)}
                            className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-200 font-bold text-xs transition-colors self-start sm:self-auto cursor-pointer flex items-center gap-1 shadow-2xs"
                            title="Unbinding takes effect within 60s; worker will require a fresh OTP"
                          >
                            <Trash2 size={12} className="text-rose-500" />
                            <span>Unbind Device</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: DPDP LOCATION CONSENT & TRANSPARENCY (STORY 4 & DPDP 2023) */}
          {activeTab === 'CONSENT' && (
            <div className="space-y-4">
              {/* Header Card */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Shield className={workerConsent?.active ? 'text-emerald-600' : 'text-amber-500'} size={18} />
                      <h3 className="font-bold text-slate-900 text-xs sm:text-sm">DPDP Location Consent &amp; Transparency Status</h3>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Digital Personal Data Protection Act 2023 • Purpose-Specific Geofencing &amp; SOS Safeguards
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setShowPrivacyModal(true)}
                      className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Eye size={12} className="text-blue-600" />
                      <span>Worker Privacy Portal</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSendLocationSummaryLink}
                      className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Send size={12} />
                      <span>Send Summary Link</span>
                    </button>
                  </div>
                </div>

                {/* Consent Status Meta */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 text-[11px] font-mono">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Policy Version</span>
                    <strong className="text-slate-800">{workerConsent?.policyVersion || CURRENT_CONSENT_POLICY_VERSION}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Worker Language</span>
                    <strong className="text-slate-800 uppercase">{workerConsent?.language || 'hi'}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Capture Channel</span>
                    <strong className="text-slate-800">{workerConsent?.channel || 'PUNCH_VIEW'}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Status</span>
                    <strong className={workerConsent?.active ? 'text-emerald-700' : 'text-amber-700'}>
                      {workerConsent?.active ? 'ACTIVE & BOUND' : workerConsent?.withdrawnAt ? 'WITHDRAWN' : 'NOT INITIALIZED'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Purpose Breakdown Cards */}
              <div className="space-y-2.5">
                <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Purpose-Specific Consents (Key AC 2)</span>
                  <span className="text-[10px] text-slate-400 font-normal">Independent Opt-In/Opt-Out</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Purpose 1: Attendance Geofence */}
                  <div className={`p-3.5 rounded-2xl border ${
                    workerConsent?.purposes.attendance_location 
                      ? 'bg-emerald-50/50 border-emerald-200 ring-1 ring-emerald-500/10' 
                      : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className={workerConsent?.purposes.attendance_location ? 'text-emerald-600' : 'text-slate-400'} />
                        <span className="font-bold text-xs text-slate-900">Attendance Location</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                        workerConsent?.purposes.attendance_location 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {workerConsent?.purposes.attendance_location ? 'GRANTED' : 'WITHDRAWN / REFUSED'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                      Geofence verification at time of punch only. No real-time tracking outside punch window.
                    </p>
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>Retention: 180 Days</span>
                      <span>Statutory Payroll Basis</span>
                    </div>
                  </div>

                  {/* Purpose 2: Safety Breadcrumbs */}
                  <div className={`p-3.5 rounded-2xl border ${
                    workerConsent?.purposes.safety_location 
                      ? 'bg-blue-50/50 border-blue-200 ring-1 ring-blue-500/10' 
                      : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={16} className={workerConsent?.purposes.safety_location ? 'text-blue-600' : 'text-slate-400'} />
                        <span className="font-bold text-xs text-slate-900">Shift Safety &amp; SOS</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                        workerConsent?.purposes.safety_location 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-slate-200 text-slate-600'
                      }`}>
                        {workerConsent?.purposes.safety_location ? 'GRANTED' : 'WITHDRAWN / REFUSED'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                      Periodic breadcrumbs during active duty for lone-worker hazard detection and emergency SOS.
                    </p>
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>Retention: 30 Days</span>
                      <span>Automated DPDP Purge</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* CRITICAL AC 5 ENFORCEMENT BANNER */}
              {(!workerConsent || !workerConsent.active || !workerConsent.purposes.attendance_location || !workerConsent.purposes.safety_location) ? (
                <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-300 text-amber-900 flex items-start gap-3">
                  <Lock size={18} className="text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-xs text-amber-900 flex items-center gap-1.5">
                      <span>DPDP Statutory Guardrail: Irreversible by Supervisor (Key AC 5)</span>
                    </h4>
                    <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                      Under Section 6 of the DPDP Act 2023, consent withdrawal is an absolute right of the Data Principal (worker). 
                      <strong> Supervisors and tenant admins are strictly barred from re-enabling location tracking.</strong> The worker's 
                      shift remains active and punches are recorded in <strong>PUNCH_ONLY</strong> mode without geographic coordinates.
                      Only the worker can re-consent from their personal registered phone.
                    </p>
                  </div>
                </div>
              ) : (
                /* If consent is active, allow manager-assisted withdrawal if worker called/requested (Key AC 4c) */
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <div className="text-xs text-slate-600">
                    <span className="font-bold text-slate-800 block">Worker Requested Verbal / Offline Withdrawal?</span>
                    <span className="text-[11px] text-slate-500">Record manager-assisted withdrawal per Key AC 4 (60s SLA).</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAssistedWithdrawModal(true)}
                    className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-xs transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                  >
                    <ShieldAlert size={12} />
                    <span>Record Worker Withdrawal</span>
                  </button>
                </div>
              )}

              {/* SECTION: RIGHT TO ERASURE / DELETION TICKETS (Key AC 7 & Edge Case 4) */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-slate-800">DPDP Historical Location Deletion Tickets</h4>
                    <p className="text-[10px] text-slate-500">30-day statutory timeline for erasure of GPS coordinates (Key AC 7)</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateAssistedDeletionTicket}
                    className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 size={11} className="text-rose-600" />
                    <span>Log Erasure Request</span>
                  </button>
                </div>

                {deletionTickets.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-500">
                    No location deletion requests on file for this worker.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {deletionTickets.map((ticket) => {
                      const dueDays = Math.max(0, Math.ceil((new Date(ticket.dueByDate).getTime() - Date.now()) / (86400 * 1000)));
                      return (
                        <div key={ticket.id} className="p-3 bg-white rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs text-slate-900">#{ticket.id.slice(-6)}</span>
                              <span className={`px-2 py-0.2 rounded-full font-mono text-[10px] font-bold ${
                                ticket.status === 'UNDER_LEGAL_HOLD' 
                                  ? 'bg-amber-100 text-amber-800' 
                                  : ticket.status === 'PROCESSED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-blue-100 text-blue-800'
                              }`}>
                                {ticket.status}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">via {ticket.channel}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1">
                              Requested: {new Date(ticket.requestedAt).toLocaleDateString()} • Statutory Deadline: <strong className="text-slate-800">{new Date(ticket.dueByDate).toLocaleDateString()} ({dueDays}d remaining)</strong>
                            </div>
                            {ticket.legalHoldApplied && (
                              <div className="mt-1 text-[10px] text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200 inline-block">
                                ⚖️ {ticket.legalHoldReason || 'Section 8(7) DPDP Act Legal Hold: Minimum wage records preserved.'}
                              </div>
                            )}
                          </div>

                          <div className="text-right text-[11px] font-mono text-slate-400 shrink-0">
                            30-Day SLA Active
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: REVOKED TOKENS */}
          {activeTab === 'REVOKED' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500">
                <span>Revoked and expired tokens with audit trails</span>
              </div>

              {revokedTokens.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <CheckCircle2 size={24} className="mx-auto text-emerald-500 mb-2" />
                  <p className="font-bold text-slate-700 text-xs">No revoked tokens</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Any revoked or expired magic links will appear here with justification notes.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {revokedTokens.map((tok, idx) => (
                    <div 
                      key={idx}
                      className="p-3 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-800 flex items-center gap-2">
                          <span className="font-mono text-slate-500">{tok.scope}</span>
                          <span className="px-2 py-0.2 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                            Reason: {tok.revocationReason || 'Expired / Revoked'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Revoked by {tok.revokedBy || 'System'} at {tok.revokedAt ? new Date(tok.revokedAt).toLocaleString() : 'N/A'}
                        </div>
                      </div>

                      <span className="text-[11px] font-mono text-slate-400">
                        Hash: {tok.tokenHash.slice(0, 8)}...
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: DPDP SUBJECT-ACCESS REPORT */}
          {activeTab === 'DPDP' && dpdpReport && (
            <div className="space-y-4 print:p-0">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">DPDP Act (2023) Subject-Access Record</h3>
                    <p className="text-[11px] text-slate-500">Official personal data &amp; access dispatch certificate</p>
                  </div>
                  <button
                    onClick={handlePrintDpdp}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <Download size={13} />
                    <span>Download / Print PDF</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Data Principal</span>
                    <strong className="text-slate-900">{dpdpReport.workerName}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Registered Phone</span>
                    <strong className="text-slate-900">{dpdpReport.phone}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Aadhaar Status</span>
                    <strong className="text-slate-900">{dpdpReport.aadharMasked}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Total Punch Records</span>
                    <strong className="text-slate-900">{dpdpReport.punchRecordsCount} entries</strong>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
                  <div className="font-bold text-[11px] text-slate-900 uppercase tracking-wider">Access Dispatches Recorded:</div>
                  <p className="text-[11px] text-slate-600">
                    Total Active Magic Links: <strong className="font-mono">{dpdpReport.activeTokensCount}</strong> • Revoked/Expired Tokens: <strong className="font-mono">{dpdpReport.revokedTokensCount}</strong> • Bound Devices: <strong className="font-mono">{dpdpReport.boundDevicesCount}</strong>
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 font-mono">
            Worker ID: {worker.id}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>

      {/* REVOCATION REASON MODAL */}
      {tokenToRevoke && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5 border border-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Revoke Worker Magic Link</h3>
                <p className="text-xs text-slate-500">Takes effect within 60 seconds</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Select Revocation Reason:
              </label>
              <select
                value={revocationReason}
                onChange={(e) => setRevocationReason(e.target.value as RevocationReason)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 bg-white outline-none focus:border-rose-600"
              >
                <option value="lost phone">Lost Phone</option>
                <option value="worker exit">Worker Exit</option>
                <option value="suspicious access">Suspicious Access</option>
                <option value="shared link">Shared Link with Colleague</option>
                <option value="other">Other Administrative Reason</option>
              </select>
            </div>

            <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              The worker's browser will immediately reject further requests and display an expired notice.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTokenToRevoke(null)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                disabled={isRevoking}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors flex items-center gap-1.5"
              >
                <Trash2 size={13} />
                <span>{isRevoking ? 'Revoking...' : 'Confirm Revoke'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UNBIND DEVICE MODAL */}
      {deviceToUnbind && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5 border border-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Smartphone size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Unbind Hardware Device</h3>
                <p className="text-xs text-slate-500">{deviceToUnbind.deviceModel}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to unbind this device from {worker.name}? The device will be disconnected from automatic biometric and PIN punch recognition.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeviceToUnbind(null)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUnbindDevice}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-colors"
              >
                Unbind Device
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANAGER-ASSISTED CONSENT WITHDRAWAL MODAL (Key AC 4c & 5) */}
      {showAssistedWithdrawModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5 border border-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Record Worker Withdrawal</h3>
                <p className="text-xs text-slate-500">Manager-Assisted DPDP Action</p>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-2">
              <p>
                Are you recording a verbal or offline withdrawal request from <strong>{worker.name}</strong>?
              </p>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800 space-y-1">
                <p className="font-bold">Important DPDP Legal Conditions:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Takes effect across all devices within 60 seconds.</li>
                  <li>Worker's shift remains active; punches continue in <strong>PUNCH_ONLY</strong> mode.</li>
                  <li><strong>Irreversible by supervisor.</strong> Only the worker can re-grant consent from their phone.</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAssistedWithdrawModal(false)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAssistedWithdrawal}
                disabled={isWithdrawingAssisted}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-colors flex items-center gap-1.5"
              >
                <Check size={13} />
                <span>{isWithdrawingAssisted ? 'Recording...' : 'Record Withdrawal'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WORKER LOCATION & PRIVACY TRANSPARENCY PORTAL (Key AC 6 & 7) */}
      {showPrivacyModal && (
        <LocationPrivacyModal
          worker={worker}
          tenantId={tenantId}
          isOpen={showPrivacyModal}
          onClose={() => {
            setShowPrivacyModal(false);
            loadData();
          }}
          onConsentUpdated={loadData}
        />
      )}

    </div>
  );
};
