// src/components/LocationPrivacyModal.tsx
import React, { useState, useEffect } from 'react';
import { 
  X, Shield, ShieldCheck, ShieldAlert, MapPin, Trash2, 
  Clock, AlertTriangle, CheckCircle2, RefreshCw, MessageSquare, 
  Send, ExternalLink, Calendar, UserCheck, Info, FileText, Check
} from 'lucide-react';
import { 
  Worker, 
  ConsentRecord, 
  WorkerLanguage, 
  LocationDataSummary, 
  LocationDeletionRequest,
  ConsentPurposeKey 
} from '../types/index';
import { consentService } from '../services/consentService';
import { CONSENT_TRANSLATIONS, CURRENT_CONSENT_POLICY_VERSION } from '../utils/consentTranslations';

interface Props {
  worker: Worker;
  tenantId: string;
  isOpen: boolean;
  onClose: () => void;
  onConsentUpdated?: () => void;
}

export const LocationPrivacyModal: React.FC<Props> = ({
  worker,
  tenantId,
  isOpen,
  onClose,
  onConsentUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'CONSENT' | 'MY_DATA' | 'ERASURE' | 'WHATSAPP_BOT'>('CONSENT');
  const [selectedLanguage, setSelectedLanguage] = useState<WorkerLanguage>('hi');
  const [activeConsent, setActiveConsent] = useState<ConsentRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Withdrawal dialog state
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState<boolean>(false);
  const [withdrawAttendance, setWithdrawAttendance] = useState<boolean>(true);
  const [withdrawSafety, setWithdrawSafety] = useState<boolean>(true);
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);
  const [withdrawalSuccess, setWithdrawalSuccess] = useState<string | null>(null);

  // My Data Summary state
  const [dataSummary, setDataSummary] = useState<LocationDataSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);

  // Deletion Tickets state
  const [deletionTickets, setDeletionTickets] = useState<LocationDeletionRequest[]>([]);
  const [isRequestingDeletion, setIsRequestingDeletion] = useState<boolean>(false);
  const [deletionSuccess, setDeletionSuccess] = useState<string | null>(null);

  // WhatsApp bot interactive simulation
  const [botInput, setBotInput] = useState<string>('STOP LOCATION');
  const [botMessages, setBotMessages] = useState<Array<{ sender: 'user' | 'bot'; text: string; time: string }>>([
    {
      sender: 'bot',
      text: '🤖 WorkForce Pro Privacy Bot: Send "STOP LOCATION" to stop tracking or "MY LOCATION DATA" for your 7-day log.',
      time: 'Just now'
    }
  ]);
  const [botSending, setBotSending] = useState<boolean>(false);

  const t = CONSENT_TRANSLATIONS[selectedLanguage];

  const loadConsentData = async () => {
    setLoading(true);
    try {
      const consent = consentService.getWorkerConsent(worker.id, tenantId);
      setActiveConsent(consent);
      const tickets = consentService.getDeletionTicketsForWorker(worker.id);
      setDeletionTickets(tickets);
    } finally {
      setLoading(false);
    }
  };

  const loadDataSummary = async () => {
    setSummaryLoading(true);
    try {
      const summary = await consentService.getLocationDataSummary(worker, tenantId);
      setDataSummary(summary);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadConsentData();
      if (activeTab === 'MY_DATA') {
        loadDataSummary();
      }
    }
  }, [isOpen, worker.id, activeTab]);

  if (!isOpen) return null;

  const handleWithdraw = async () => {
    setIsWithdrawing(true);
    setWithdrawalSuccess(null);
    try {
      const purposes: ConsentPurposeKey[] = [];
      if (withdrawAttendance) purposes.push('attendance_location');
      if (withdrawSafety) purposes.push('safety_location');

      const res = await consentService.withdrawConsent({
        tenantId,
        workerId: worker.id,
        workerName: worker.name,
        purposesToWithdraw: purposes,
        channel: 'PUNCH_VIEW'
      });

      setActiveConsent(res.updatedConsent);
      setWithdrawalSuccess(res.message);
      setShowWithdrawConfirm(false);
      if (onConsentUpdated) onConsentUpdated();
    } catch (err: any) {
      alert('Withdrawal error: ' + err.message);
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleRequestDeletion = async () => {
    setIsRequestingDeletion(true);
    setDeletionSuccess(null);
    try {
      const ticket = await consentService.requestLocationDeletion({
        worker,
        tenantId,
        channel: 'PUNCH_VIEW'
      });
      setDeletionTickets([ticket, ...deletionTickets]);
      setDeletionSuccess(`Statutory DPDP Erasure Ticket created! 30-day deadline: ${new Date(ticket.dueByDate).toLocaleDateString()}`);
    } catch (err: any) {
      alert('Deletion request failed: ' + err.message);
    } finally {
      setIsRequestingDeletion(false);
    }
  };

  const handleSendBotMessage = async (customCommand?: string) => {
    const textToSend = customCommand || botInput;
    if (!textToSend.trim()) return;

    setBotSending(true);
    const userMsg = {
      sender: 'user' as const,
      text: textToSend,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setBotMessages(prev => [...prev, userMsg]);
    setBotInput('');

    try {
      const res = await consentService.processWhatsAppBotCommand(worker, tenantId, textToSend);
      const botReply = {
        sender: 'bot' as const,
        text: res.responseText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setBotMessages(prev => [...prev, botReply]);
      loadConsentData();
      if (onConsentUpdated) onConsentUpdated();
    } catch (err: any) {
      setBotMessages(prev => [...prev, {
        sender: 'bot',
        text: 'Error processing command: ' + err.message,
        time: 'Just now'
      }]);
    } finally {
      setBotSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-slate-100 overflow-hidden my-auto flex flex-col max-h-[92vh]">
        
        {/* HEADER */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
              <ShieldCheck size={20} className="text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight">
                  {t.screenTitle}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] border border-emerald-400/30">
                  DPDP 2023
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Worker Privacy Rights for <strong className="text-white">{worker.name}</strong>
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

        {/* LANGUAGE SELECTOR PILLS */}
        <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-semibold text-[11px]">Select Language (भाषा):</span>
          <div className="flex gap-1.5 bg-white p-1 rounded-xl border border-slate-200/80">
            <button
              onClick={() => setSelectedLanguage('en')}
              className={`px-2.5 py-0.5 rounded-lg text-xs font-bold transition-all ${
                selectedLanguage === 'en' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              English
            </button>
            <button
              onClick={() => setSelectedLanguage('hi')}
              className={`px-2.5 py-0.5 rounded-lg text-xs font-bold transition-all ${
                selectedLanguage === 'hi' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              हिंदी
            </button>
            <button
              onClick={() => setSelectedLanguage('gu')}
              className={`px-2.5 py-0.5 rounded-lg text-xs font-bold transition-all ${
                selectedLanguage === 'gu' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ગુજરાતી
            </button>
          </div>
        </div>

        {/* TAB NAVIGATION */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 sm:px-6 pt-3 flex gap-2 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setActiveTab('CONSENT')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'CONSENT'
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shield size={13} />
            <span>Consent &amp; Policy</span>
          </button>

          <button
            onClick={() => setActiveTab('MY_DATA')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'MY_DATA'
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock size={13} />
            <span>My Location Data (7 Days)</span>
          </button>

          <button
            onClick={() => setActiveTab('ERASURE')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'ERASURE'
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Trash2 size={13} />
            <span>Right to Erasure (Delete)</span>
          </button>

          <button
            onClick={() => setActiveTab('WHATSAPP_BOT')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'WHATSAPP_BOT'
                ? 'border-emerald-600 text-emerald-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <MessageSquare size={13} />
            <span>WhatsApp Bot</span>
          </button>
        </div>

        {/* MODAL CONTENT */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs text-slate-700">

          {/* TAB 1: CONSENT & POLICY OVERVIEW */}
          {activeTab === 'CONSENT' && (
            <div className="space-y-4">
              
              {/* STATUS SUMMARY */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Current Location Permission
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-bold text-sm text-slate-900">
                      {activeConsent?.purposes.attendance_location ? 'Active (Attendance Verified)' : 'PUNCH_ONLY (Location Withdrawn)'}
                    </span>
                    <span className="font-mono text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                      {activeConsent?.policyVersion || CURRENT_CONSENT_POLICY_VERSION}
                    </span>
                  </div>
                </div>

                {activeConsent?.active && (
                  <button
                    onClick={() => setShowWithdrawConfirm(true)}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 size={13} />
                    <span>Withdraw Consent</span>
                  </button>
                )}
              </div>

              {withdrawalSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span>{withdrawalSuccess}</span>
                </div>
              )}

              {/* PURPOSE 1: ATTENDANCE LOCATION */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                    <MapPin size={14} className="text-blue-600" />
                    <span>{t.attendancePurpose.title}</span>
                  </h4>
                  <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                    activeConsent?.purposes.attendance_location 
                      ? 'bg-emerald-100 text-emerald-800' 
                      : 'bg-rose-100 text-rose-800'
                  }`}>
                    {activeConsent?.purposes.attendance_location ? 'GRANTED' : 'WITHDRAWN'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">{t.attendancePurpose.description}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <div>
                    <strong className="text-slate-800 block text-[10px] uppercase">What is collected:</strong>
                    <span>{t.attendancePurpose.whatCollected}</span>
                  </div>
                  <div>
                    <strong className="text-slate-800 block text-[10px] uppercase">Retention Period:</strong>
                    <span>{t.attendancePurpose.retention}</span>
                  </div>
                </div>
              </div>

              {/* PURPOSE 2: SAFETY LOCATION */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                    <ShieldCheck size={14} className="text-indigo-600" />
                    <span>{t.safetyPurpose.title}</span>
                  </h4>
                  <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                    activeConsent?.purposes.safety_location 
                      ? 'bg-emerald-100 text-emerald-800' 
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {activeConsent?.purposes.safety_location ? 'GRANTED' : 'DECLINED / OFF'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">{t.safetyPurpose.description}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <div>
                    <strong className="text-slate-800 block text-[10px] uppercase">What is collected:</strong>
                    <span>{t.safetyPurpose.whatCollected}</span>
                  </div>
                  <div>
                    <strong className="text-slate-800 block text-[10px] uppercase">Retention Period:</strong>
                    <span>{t.safetyPurpose.retention}</span>
                  </div>
                </div>
              </div>

              {/* DURESS & STATUTORY GUARANTEE NOTICE */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-2xl text-[11px] text-blue-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-blue-950">
                  <Info size={13} className="text-blue-600" />
                  <span>Statutory DPDP Act 2023 Protections:</span>
                </p>
                <p>{t.duressNotice}</p>
                <p className="text-slate-600 pt-0.5">{t.botCommandsInfo}</p>
              </div>

              {/* WITHDRAWAL MODAL / DRAWER */}
              {showWithdrawConfirm && (
                <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-200 space-y-3 animate-in fade-in">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-rose-900 text-xs">{t.withdrawalTitle}</h4>
                      <p className="text-[11px] text-rose-700 mt-0.5">{t.withdrawalWarning}</p>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={withdrawAttendance}
                        onChange={(e) => setWithdrawAttendance(e.target.checked)}
                        className="rounded text-rose-600 focus:ring-rose-500"
                      />
                      <span>Withdraw Attendance Location (हाजिरी लोकेशन वापस लें)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={withdrawSafety}
                        onChange={(e) => setWithdrawSafety(e.target.checked)}
                        className="rounded text-rose-600 focus:ring-rose-500"
                      />
                      <span>Withdraw Safety Shift Breadcrumbs (सुरक्षा ट्रैकिंग वापस लें)</span>
                    </label>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setShowWithdrawConfirm(false)}
                      className="flex-1 py-2 px-3 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-white"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={isWithdrawing || (!withdrawAttendance && !withdrawSafety)}
                      onClick={handleWithdraw}
                      className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center justify-center gap-1.5"
                    >
                      {isWithdrawing ? (
                        <RefreshCw size={13} className="animate-spin" />
                      ) : (
                        <span>{t.withdrawalConfirm}</span>
                      )}
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 2: MY LOCATION DATA SUMMARY (KEY AC 6) */}
          {activeTab === 'MY_DATA' && (
            <div className="space-y-3">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-[11px] text-slate-600">
                <p className="font-bold text-slate-800 text-xs">Privacy-First Data Summary (Section 11 DPDP):</p>
                <p className="mt-0.5">
                  Displays the exact timestamps when your location was verified over the last 7 days. Raw GPS coordinates are never exposed for your personal privacy.
                </p>
              </div>

              {summaryLoading ? (
                <div className="py-8 text-center text-slate-400">
                  <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
                  <span>Loading verified timestamps...</span>
                </div>
              ) : (
                <>
                  {/* BREADCRUMB TIMESTAMPS */}
                  <div className="space-y-1.5">
                    <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider">
                      Verified Location Events (Past 7 Days):
                    </span>
                    {dataSummary?.breadcrumbs && dataSummary.breadcrumbs.length > 0 ? (
                      <div className="space-y-1.5 max-h-56 overflow-y-auto">
                        {dataSummary.breadcrumbs.map((b, idx) => (
                          <div 
                            key={idx} 
                            className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <MapPin size={13} className={b.status === 'VERIFIED' ? 'text-emerald-600' : 'text-slate-400'} />
                              <span className="font-bold text-slate-800">
                                {b.activityType.replace('_', ' ')}
                              </span>
                              <span className="font-mono text-[10px] text-slate-500">
                                {new Date(b.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <span className={`px-2 py-0.2 rounded-full font-mono text-[10px] font-bold ${
                              b.status === 'VERIFIED' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {b.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-50 rounded-xl text-center text-slate-500 text-xs">
                        No location breadcrumbs recorded in the past 7 days.
                      </div>
                    )}
                  </div>

                  {/* AUDIT LOG: WHO VIEWED DATA */}
                  <div className="space-y-1.5 pt-2">
                    <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider">
                      Who Viewed Your Location Records (E15 Audit):
                    </span>
                    {dataSummary?.auditViews && dataSummary.auditViews.length > 0 ? (
                      <div className="space-y-1.5">
                        {dataSummary.auditViews.map((view, i) => (
                          <div key={i} className="p-2 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-2">
                              <UserCheck size={12} className="text-blue-600" />
                              <span className="font-medium text-slate-800">{view.viewerName} ({view.viewerRole})</span>
                            </div>
                            <span className="font-mono text-slate-500 text-[10px]">
                              {new Date(view.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-50 rounded-xl text-slate-500 text-center text-[11px]">
                        No supervisor inspect logs recorded.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 3: RIGHT TO ERASURE (KEY AC 7 & EDGE CASE 4) */}
          {activeTab === 'ERASURE' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 space-y-1">
                <h4 className="font-bold flex items-center gap-1.5">
                  <Trash2 size={14} className="text-rose-600" />
                  <span>Right to Erasure (DPDP Section 12)</span>
                </h4>
                <p className="text-[11px] text-rose-800 leading-relaxed">
                  You can request permanent deletion of historical location breadcrumbs. By law, requests must be completed within <strong>30 days</strong>. If a wage dispute is active, minimum records are held under legal hold until resolution.
                </p>
              </div>

              {deletionSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span>{deletionSuccess}</span>
                </div>
              )}

              <button
                type="button"
                disabled={isRequestingDeletion}
                onClick={handleRequestDeletion}
                className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                {isRequestingDeletion ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Create Statutory Erasure Request Ticket</span>
                  </>
                )}
              </button>

              {/* OPEN DELETION TICKETS */}
              <div className="space-y-2 pt-2">
                <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider">
                  Your Deletion Tickets:
                </span>
                {deletionTickets.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-xl text-slate-400 text-center text-xs">
                    No deletion requests submitted.
                  </div>
                ) : (
                  deletionTickets.map(ticket => (
                    <div key={ticket.id} className="p-3 bg-white rounded-2xl border border-slate-200 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-xs">Ticket #{ticket.id.slice(-6)}</span>
                        <span className={`px-2 py-0.2 rounded-full font-mono text-[10px] font-bold ${
                          ticket.status === 'UNDER_LEGAL_HOLD' 
                            ? 'bg-amber-100 text-amber-800 border border-amber-300' 
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {ticket.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Requested: {new Date(ticket.requestedAt).toLocaleDateString()} • Due by: <strong>{new Date(ticket.dueByDate).toLocaleDateString()}</strong> (30-day statutory timeline)
                      </p>
                      {ticket.legalHoldReason && (
                        <div className="p-2 rounded-xl bg-amber-50 text-[10px] text-amber-800 border border-amber-200">
                          ⚠️ {ticket.legalHoldReason}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 4: WHATSAPP BOT INTERACTIVE SIMULATOR (KEY AC 4b) */}
          {activeTab === 'WHATSAPP_BOT' && (
            <div className="space-y-3">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-[11px] text-emerald-900">
                <p className="font-bold">WhatsApp Privacy Bot Simulator:</p>
                <p className="mt-0.5">
                  Workers can manage their location rights via WhatsApp without opening the app. Test sending commands below:
                </p>
              </div>

              {/* QUICK COMMAND PILLS */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSendBotMessage('STOP LOCATION')}
                  className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold"
                >
                  "STOP LOCATION"
                </button>
                <button
                  type="button"
                  onClick={() => handleSendBotMessage('लोकेशन बंद')}
                  className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold"
                >
                  "लोकेशन बंद"
                </button>
                <button
                  type="button"
                  onClick={() => handleSendBotMessage('MY LOCATION DATA')}
                  className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold"
                >
                  "MY LOCATION DATA"
                </button>
                <button
                  type="button"
                  onClick={() => handleSendBotMessage('DELETE LOCATION')}
                  className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold"
                >
                  "DELETE LOCATION"
                </button>
              </div>

              {/* CHAT MESSAGES WINDOW */}
              <div className="bg-slate-900 rounded-2xl p-3 h-52 overflow-y-auto space-y-2 text-xs font-sans border border-slate-800">
                {botMessages.map((msg, i) => (
                  <div 
                    key={i} 
                    className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div className={`p-2.5 rounded-2xl max-w-[85%] whitespace-pre-line leading-relaxed ${
                      msg.sender === 'user' 
                        ? 'bg-emerald-600 text-white rounded-br-xs' 
                        : 'bg-slate-800 text-slate-200 rounded-bl-xs border border-slate-700'
                    }`}>
                      {msg.text}
                    </div>
                    <span className="text-[9px] text-slate-500 mt-0.5 px-1">{msg.time}</span>
                  </div>
                ))}
              </div>

              {/* INPUT BAR */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder='Type "STOP LOCATION", "MY LOCATION DATA"...'
                  value={botInput}
                  onChange={(e) => setBotInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendBotMessage(); }}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-600"
                />
                <button
                  type="button"
                  disabled={botSending || !botInput.trim()}
                  onClick={() => handleSendBotMessage()}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1"
                >
                  <Send size={13} />
                  <span>Send</span>
                </button>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
