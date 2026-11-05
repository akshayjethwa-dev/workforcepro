import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Send, Phone, Video, MoreVertical, CheckCheck, Clock, 
  MapPin, Camera, AlertTriangle, ShieldCheck, Sparkles, RefreshCw, 
  ExternalLink, User, Lock, MessageSquare, Bell, ArrowRight, 
  FileText, Calendar, IndianRupee, HelpCircle, Check, Slash
} from 'lucide-react';
import { Worker, WhatsAppMessage, WhatsAppCommandKey, ShiftConfig } from '../types/index';
import { whatsappService } from '../services/whatsappService';
import { dbService } from '../services/db';

interface WhatsAppChatSimulatorProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  initialWorkerId?: string;
}

export const WhatsAppChatSimulator: React.FC<WhatsAppChatSimulatorProps> = ({
  isOpen,
  onClose,
  tenantId,
  initialWorkerId
}) => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(initialWorkerId || 'worker-1');
  const [phoneMode, setPhoneMode] = useState<'REGISTERED' | 'UNREGISTERED' | 'SHARED_CONFLICT'>('REGISTERED');
  const [customPhone, setCustomPhone] = useState<string>('9876543210');
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'hi' | 'gu'>('hi');
  const [attachLocation, setAttachLocation] = useState<boolean>(false);
  const [attachSelfie, setAttachSelfie] = useState<boolean>(false);
  const [simulateSelfieMismatch, setSimulateSelfieMismatch] = useState<boolean>(false);
  const [simulateOutsideGeofence, setSimulateOutsideGeofence] = useState<boolean>(false);
  const [showProactivePanel, setShowProactivePanel] = useState<boolean>(false);
  const [bannerAlert, setBannerAlert] = useState<{ type: 'success' | 'warn' | 'error'; text: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load workers and initial messages
  useEffect(() => {
    if (!isOpen) return;

    dbService.getWorkers(tenantId).then(list => {
      setWorkers(list);
      if (initialWorkerId) {
        setSelectedWorkerId(initialWorkerId);
        const w = list.find(x => x.id === initialWorkerId);
        if (w) setCustomPhone(w.phone);
      } else if (list.length > 0) {
        setSelectedWorkerId(list[0].id);
        setCustomPhone(list[0].phone);
      }
    }).catch(err => console.warn('Failed to load workers:', err));

    loadMessages();
  }, [isOpen, tenantId, initialWorkerId]);

  const loadMessages = () => {
    const list = whatsappService.getMessages(tenantId);
    setMessages(list);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen) return null;

  const currentWorker = workers.find(w => w.id === selectedWorkerId);

  // Handle worker selection change
  const handleWorkerChange = (workerId: string) => {
    setSelectedWorkerId(workerId);
    setPhoneMode('REGISTERED');
    const w = workers.find(x => x.id === workerId);
    if (w) setCustomPhone(w.phone);
  };

  // Get active phone to send from
  const getActivePhone = () => {
    if (phoneMode === 'UNREGISTERED') return '9999900000';
    if (phoneMode === 'SHARED_CONFLICT') return '9876543210';
    return customPhone || currentWorker?.phone || '9876543210';
  };

  // Send message through whatsappService
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend !== undefined ? textToSend : inputText).trim();
    if (!text && !attachLocation && !attachSelfie) return;

    setIsSending(true);
    setInputText('');

    const phone = getActivePhone();

    // Prepare coordinates if location attached
    let locationData = undefined;
    if (attachLocation || simulateOutsideGeofence) {
      if (simulateOutsideGeofence) {
        // 800m away from site
        locationData = { lat: 28.5450, lng: 77.4050, address: 'Expressway Flyover (800m away from Plant)' };
      } else {
        // calibrated inside plant boundary
        locationData = { lat: 28.5355, lng: 77.3910, address: 'Plant #1 Geofence Gate 2' };
      }
    }

    // Prepare photo if selfie attached
    const photoUrl = attachSelfie || simulateSelfieMismatch 
      ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop'
      : undefined;

    try {
      const result = await whatsappService.handleInboundMessage({
        tenantId,
        fromPhone: phone,
        messageText: text || (attachLocation ? '📍 [Location Attached]' : '📷 [Selfie Attached]'),
        location: locationData,
        photoUrl,
        isSelfieMismatch: simulateSelfieMismatch
      });

      if (result.isAnomaly) {
        setBannerAlert({
          type: 'warn',
          text: `E9 Anomaly Flagged: ${result.anomalyReason || 'Selfie mismatch / abnormal pattern detected'} (Routed to E3 Inbox)`
        });
      } else if (result.command === 'PUNCH_IN' || result.command === 'PUNCH_OUT') {
        setBannerAlert({
          type: 'success',
          text: `Attendance Punch recorded with channel = 'WHATSAPP' in audit trail!`
        });
      }

      loadMessages();
    } catch (err: any) {
      console.error('WhatsApp message error:', err);
      setBannerAlert({ type: 'error', text: err.message || 'Failed to process message' });
    } finally {
      setIsSending(false);
      // Reset one-time flags
      setAttachLocation(false);
      setAttachSelfie(false);
      setSimulateSelfieMismatch(false);
      setSimulateOutsideGeofence(false);
    }
  };

  // Trigger Proactive Notifications (Story E11-S1)
  const triggerShiftReminder = async () => {
    if (!currentWorker) return;
    const shift: ShiftConfig = {
      id: currentWorker.shiftId || 'default',
      name: 'Morning General',
      startTime: '09:00',
      endTime: '18:00',
      gracePeriodMins: 15,
      maxGraceAllowed: 3,
      breakDurationMins: 45,
      minHalfDayHours: 4,
      minOvertimeMins: 30
    };
    await whatsappService.sendShiftReminder(tenantId, currentWorker, shift);
    loadMessages();
    setBannerAlert({ type: 'success', text: `Proactive Shift Reminder delivered via WhatsApp template!` });
  };

  const triggerAdvanceApproval = async () => {
    if (!currentWorker) return;
    await whatsappService.sendApprovalOutcome(tenantId, currentWorker, 2500, 'APPROVED', 'Disbursed to registered UPI');
    loadMessages();
    setBannerAlert({ type: 'success', text: `Proactive Advance Approval notification delivered via WhatsApp template!` });
  };

  const triggerPayslipReady = async () => {
    if (!currentWorker) return;
    const res = await whatsappService.sendPayslipReadyNotification(tenantId, currentWorker);
    loadMessages();
    setBannerAlert({ type: 'success', text: `Payslip-Ready notification sent with 72h scoped link!` });
  };

  const triggerMissingPunchOut = async () => {
    if (!currentWorker) return;
    await whatsappService.sendMissingPunchOutAlert(tenantId, currentWorker);
    loadMessages();
    setBannerAlert({ type: 'warn', text: `Missing Punch-Out alert delivered to worker WhatsApp!` });
  };

  // Simulate Rate Limit (10 rapid calls)
  const simulateRateLimitFired = async () => {
    if (!currentWorker) return;
    setIsSending(true);
    for (let i = 0; i < 11; i++) {
      await whatsappService.handleInboundMessage({
        tenantId,
        fromPhone: getActivePhone(),
        messageText: `Status query #${i + 1}`
      });
    }
    loadMessages();
    setIsSending(false);
    setBannerAlert({ type: 'error', text: 'Rate limit (10 commands/hour) triggered! Exceeded message returned.' });
  };

  // Language Command Sets
  const commandSets = {
    en: [
      { label: 'IN (Clock In)', text: 'IN' },
      { label: 'OUT (Clock Out)', text: 'OUT' },
      { label: 'payslip', text: 'payslip' },
      { label: 'schedule', text: 'schedule' },
      { label: 'attendance', text: 'attendance' },
      { label: 'balance', text: 'balance' },
      { label: 'leave', text: 'leave' },
      { label: 'STOP (Opt-out)', text: 'STOP' },
      { label: 'START (Opt-in)', text: 'START' }
    ],
    hi: [
      { label: 'हाजिरी इन (IN)', text: 'हाजिरी इन' },
      { label: 'हाजिरी आउट (OUT)', text: 'हाजिरी आउट' },
      { label: 'पेस्लिप (Payslip)', text: 'पेस्लिप' },
      { label: 'शिड्यूल (Schedule)', text: 'शिड्यूल' },
      { label: 'हाजिरी (Summary)', text: 'हाजिरी' },
      { label: 'खर्ची / बैलेंस (Advance)', text: 'खर्ची' },
      { label: 'छुट्टी (Leave)', text: 'छुट्टी' },
      { label: 'रुको (STOP)', text: 'STOP' },
      { label: 'शुरू (START)', text: 'START' }
    ],
    gu: [
      { label: 'હાજરી આવ્યા (IN)', text: 'હાજરી આવ્યા' },
      { label: 'હાજરી ગયા (OUT)', text: 'હાજરી ગયા' },
      { label: 'પગારચીઠ્ઠી (Payslip)', text: 'પગારચીઠ્ઠી' },
      { label: 'સમયપત્રક (Schedule)', text: 'સમયપત્રક' },
      { label: 'હાજરી (Summary)', text: 'હાજરી' },
      { label: 'ઉપાડ (Advance)', text: 'ઉપાડ' },
      { label: 'રજા (Leave)', text: 'રજા' },
      { label: 'STOP', text: 'STOP' },
      { label: 'START', text: 'START' }
    ]
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl h-[92vh] max-h-[850px] rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden border border-slate-200">
        
        {/* LEFT / TOP CONTROL PANEL: Worker selection, test configurations, edge cases */}
        <div className="w-full md:w-80 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 p-4 flex flex-col overflow-y-auto shrink-0">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                WA
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">WhatsApp Bridge</h3>
                <p className="text-[11px] text-slate-500 font-medium">E11 Conversational Channel</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200"
            >
              <X size={18} />
            </button>
          </div>

          {/* Test Persona / Worker Selection */}
          <div className="mt-3 space-y-2">
            <label className="text-xs font-bold text-slate-700 block">Simulate Worker Persona:</label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/60 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setPhoneMode('REGISTERED')}
                className={`py-1.5 px-2 rounded-lg transition-all text-center ${
                  phoneMode === 'REGISTERED' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Registered
              </button>
              <button
                type="button"
                onClick={() => setPhoneMode('UNREGISTERED')}
                className={`py-1.5 px-2 rounded-lg transition-all text-center ${
                  phoneMode === 'UNREGISTERED' ? 'bg-white text-rose-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Edge Case 1: Unregistered phone number gets generic reply"
              >
                Unregistered
              </button>
              <button
                type="button"
                onClick={() => setPhoneMode('SHARED_CONFLICT')}
                className={`py-1.5 px-2 rounded-lg transition-all text-center ${
                  phoneMode === 'SHARED_CONFLICT' ? 'bg-white text-amber-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Edge Case 2: 2 workers share one WhatsApp number"
              >
                Shared Phone
              </button>
            </div>

            {phoneMode === 'REGISTERED' && (
              <select
                value={selectedWorkerId}
                onChange={e => handleWorkerChange(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
              >
                {workers.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.designation}) — +91 {w.phone.slice(-10)}
                  </option>
                ))}
              </select>
            )}

            {phoneMode === 'UNREGISTERED' && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                <span className="font-bold">Edge Case 1 Test:</span> Simulating unknown caller (+91 99999 00000). The bot will respond: <em>"This number is not registered. Ask your manager to update."</em> (Never leaks PII).
              </div>
            )}

            {phoneMode === 'SHARED_CONFLICT' && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                <span className="font-bold">Edge Case 2 Test:</span> Two workers registered with phone (+91 98765 43210). Bound to first worker; second rejected to eliminate buddy punching.
              </div>
            )}
          </div>

          {/* Language Preference */}
          <div className="mt-3">
            <label className="text-xs font-bold text-slate-700 block mb-1">Command Language:</label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/60 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setSelectedLanguage('en')}
                className={`py-1 rounded-lg transition-all ${
                  selectedLanguage === 'en' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setSelectedLanguage('hi')}
                className={`py-1 rounded-lg transition-all ${
                  selectedLanguage === 'hi' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600'
                }`}
              >
                हिंदी (Hindi)
              </button>
              <button
                type="button"
                onClick={() => setSelectedLanguage('gu')}
                className={`py-1 rounded-lg transition-all ${
                  selectedLanguage === 'gu' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600'
                }`}
              >
                ગુજરાતી (Gujarati)
              </button>
            </div>
          </div>

          {/* Quick Edge Case Buttons */}
          <div className="mt-4 pt-3 border-t border-slate-200 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Simulate Edge Cases:
            </span>

            <button
              type="button"
              onClick={() => {
                setSimulateOutsideGeofence(true);
                setAttachLocation(true);
                handleSendMessage('IN');
              }}
              className="w-full text-left px-2.5 py-1.5 bg-white hover:bg-amber-50 border border-slate-200 hover:border-amber-300 rounded-lg text-xs font-medium text-slate-700 hover:text-amber-900 transition-colors flex items-center justify-between"
            >
              <span>⚠️ Punch Outside Geofence</span>
              <span className="text-[10px] text-amber-600 font-bold bg-amber-100 px-1.5 py-0.5 rounded">800m</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSimulateSelfieMismatch(true);
                setAttachSelfie(true);
                handleSendMessage('IN');
              }}
              className="w-full text-left px-2.5 py-1.5 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 rounded-lg text-xs font-medium text-slate-700 hover:text-rose-900 transition-colors flex items-center justify-between"
            >
              <span>🚨 Selfie Mismatch (Buddy Punch)</span>
              <span className="text-[10px] text-rose-600 font-bold bg-rose-100 px-1.5 py-0.5 rounded">E9 Engine</span>
            </button>

            <button
              type="button"
              onClick={() => handleSendMessage('IN')}
              className="w-full text-left px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 transition-colors flex items-center justify-between"
              title="Clicking IN twice within 5m tests duplicate suppression"
            >
              <span>⚡ Duplicate Punch (Within 5m)</span>
              <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded">E9-S1</span>
            </button>

            <button
              type="button"
              onClick={simulateRateLimitFired}
              className="w-full text-left px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 transition-colors flex items-center justify-between"
            >
              <span>⏱️ Rate Limit (10 msgs/hr)</span>
              <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded">Rate Cap</span>
            </button>
          </div>

          {/* Proactive Notification Triggers */}
          <div className="mt-4 pt-3 border-t border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Proactive Bot Alerts (HSM):
              </span>
              <button
                type="button"
                onClick={() => setShowProactivePanel(!showProactivePanel)}
                className="text-[11px] text-emerald-700 font-bold hover:underline"
              >
                {showProactivePanel ? 'Hide' : 'Show'}
              </button>
            </div>

            {showProactivePanel && (
              <div className="space-y-1.5 pt-1">
                <button
                  type="button"
                  onClick={triggerShiftReminder}
                  className="w-full text-left px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-800 transition-colors flex items-center gap-1.5"
                >
                  <Clock size={13} className="text-emerald-600" />
                  <span>Send Shift Reminder</span>
                </button>

                <button
                  type="button"
                  onClick={triggerPayslipReady}
                  className="w-full text-left px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-medium text-blue-800 transition-colors flex items-center gap-1.5"
                >
                  <FileText size={13} className="text-blue-600" />
                  <span>Send Payslip-Ready Link</span>
                </button>

                <button
                  type="button"
                  onClick={triggerAdvanceApproval}
                  className="w-full text-left px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-xs font-medium text-indigo-800 transition-colors flex items-center gap-1.5"
                >
                  <IndianRupee size={13} className="text-indigo-600" />
                  <span>Send Advance Approval (₹2.5k)</span>
                </button>

                <button
                  type="button"
                  onClick={triggerMissingPunchOut}
                  className="w-full text-left px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-medium text-amber-800 transition-colors flex items-center gap-1.5"
                >
                  <AlertTriangle size={13} className="text-amber-600" />
                  <span>Send Missing Check-Out Alert</span>
                </button>
              </div>
            )}
          </div>

          <div className="mt-auto pt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                whatsappService.clearMessages(tenantId);
                loadMessages();
              }}
              className="flex-1 text-center py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Clear Chat
            </button>
            <button
              type="button"
              onClick={onClose}
              className="hidden md:block px-4 py-1.5 text-xs font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* RIGHT / MAIN CHAT SIMULATOR INTERFACE */}
        <div className="flex-1 flex flex-col bg-[#efeae2] relative min-w-0">
          
          {/* WHATSAPP TOP HEADER */}
          <div className="bg-[#075e54] text-white px-4 py-2.5 flex items-center justify-between shadow-md shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-emerald-700 border-2 border-emerald-400 flex items-center justify-center font-bold text-white shadow-xs overflow-hidden">
                  <User size={22} className="text-white" />
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-[#075e54] rounded-full"></span>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="font-bold text-sm tracking-tight leading-tight">WorkforcePro Attendance Bot</h4>
                  <span className="w-3.5 h-3.5 bg-emerald-400 text-[#075e54] rounded-full flex items-center justify-center text-[9px] font-black" title="Verified Business Account">
                    ✓
                  </span>
                </div>
                <p className="text-[11px] text-emerald-100 flex items-center gap-1 leading-tight">
                  <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-ping"></span>
                  Official WhatsApp Business API • +91 98200 12345
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] bg-emerald-800/80 text-emerald-100 px-2.5 py-1 rounded-full font-mono hidden sm:inline">
                Calling as: +91 {getActivePhone().slice(-10)}
              </span>
              <button 
                onClick={onClose}
                className="p-1.5 text-emerald-100 hover:text-white rounded-lg hover:bg-emerald-700"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* BANNER NOTIFICATION (If Anomaly or Punch Event triggered) */}
          {bannerAlert && (
            <div className={`px-4 py-2 text-xs font-semibold flex items-center justify-between shrink-0 shadow-xs transition-all ${
              bannerAlert.type === 'error' ? 'bg-rose-600 text-white' :
              bannerAlert.type === 'warn' ? 'bg-amber-500 text-slate-900' :
              'bg-emerald-600 text-white'
            }`}>
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="shrink-0" />
                <span>{bannerAlert.text}</span>
              </div>
              <button onClick={() => setBannerAlert(null)} className="p-0.5 hover:opacity-75">
                <X size={14} />
              </button>
            </div>
          )}

          {/* CHAT MESSAGES SCROLL AREA */}
          <div 
            className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-3"
            style={{
              backgroundImage: `radial-gradient(#d5ceb8 1px, transparent 1px)`,
              backgroundSize: '16px 16px'
            }}
          >
            {/* End-to-end encryption / DPDP compliance notice banner */}
            <div className="flex justify-center my-1">
              <div className="bg-[#ffeecd] border border-[#f0dfb8] text-[#54656f] text-[11px] px-3 py-1.5 rounded-lg max-w-md text-center shadow-xs flex items-center justify-center gap-1.5">
                <Lock size={12} className="text-[#54656f] shrink-0" />
                <span>
                  Messages are securely audited with DPDP India consent. Scoped links expire in 72h to keep PII out of WhatsApp storage.
                </span>
              </div>
            </div>

            {messages.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                <MessageSquare size={36} className="mx-auto text-slate-400 mb-2 opacity-50" />
                <p className="font-semibold text-slate-600">No messages in chat history.</p>
                <p className="mt-1">Tap one of the quick command buttons below (e.g. IN, OUT, payslip, schedule) to test conversational flow.</p>
              </div>
            ) : (
              messages.slice().reverse().map((msg) => {
                const isInbound = msg.direction === 'INBOUND';
                const formattedTime = new Date(msg.timestamp).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                });

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isInbound ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3 shadow-xs text-xs relative ${
                        isInbound
                          ? 'bg-[#d9fdd3] text-[#111b21] rounded-tr-xs'
                          : 'bg-white text-[#111b21] rounded-tl-xs'
                      }`}
                    >
                      {/* Attached Location Pill */}
                      {msg.location && (
                        <div className="mb-2 p-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
                          <MapPin size={16} className="text-emerald-700 shrink-0" />
                          <div>
                            <span className="font-bold text-emerald-900 block text-[11px]">Live Location Shared</span>
                            <span className="text-[10px] text-emerald-700">{msg.location.address || `${msg.location.lat}, ${msg.location.lng}`}</span>
                          </div>
                        </div>
                      )}

                      {/* Attached Selfie Pill */}
                      {msg.mediaUrl && (
                        <div className="mb-2 p-2 bg-slate-100 border border-slate-200 rounded-xl flex items-center gap-2">
                          <Camera size={16} className="text-slate-700 shrink-0" />
                          <div>
                            <span className="font-bold text-slate-900 block text-[11px]">Selfie Verified</span>
                            <span className="text-[10px] text-slate-600">Biometric liveness captured</span>
                          </div>
                        </div>
                      )}

                      {/* Message Text with preserved line breaks */}
                      <div className="whitespace-pre-line leading-relaxed text-[13px]">
                        {msg.content}
                      </div>

                      {/* Clickable Scoped Link Button (if generated for payslip / schedule) */}
                      {msg.scopedLinkUrl && (
                        <div className="mt-2.5 pt-2 border-t border-slate-200/80">
                          <a
                            href={msg.scopedLinkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#25d366] hover:bg-[#20ba59] text-white font-bold rounded-lg text-xs shadow-xs transition-colors"
                          >
                            <span>Open Secure Worker Link</span>
                            <ExternalLink size={12} />
                          </a>
                          <span className="block text-[10px] text-slate-500 mt-1">
                            🔐 72h scoped token • PII preserved outside WhatsApp
                          </span>
                        </div>
                      )}

                      {/* Audit metadata & Double check mark */}
                      <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-400">
                        {msg.isAnomaly && (
                          <span className="text-rose-600 font-bold mr-1">E9 Anomaly</span>
                        )}
                        <span>{formattedTime}</span>
                        {isInbound ? (
                          <CheckCheck size={14} className="text-sky-500 inline" />
                        ) : (
                          <span className="text-emerald-700 font-semibold text-[9px] bg-emerald-50 px-1 rounded">BOT</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* QUICK COMMAND PILLS (Language-aware) */}
          <div className="bg-[#f0f2f5] border-t border-slate-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0">
            <span className="text-[11px] font-bold text-slate-500 shrink-0 flex items-center gap-1">
              <Sparkles size={12} className="text-emerald-600" />
              Quick:
            </span>
            {commandSets[selectedLanguage].map(cmd => (
              <button
                key={cmd.text}
                type="button"
                onClick={() => handleSendMessage(cmd.text)}
                disabled={isSending}
                className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 rounded-full text-xs font-semibold whitespace-nowrap shadow-2xs transition-all active:scale-95 disabled:opacity-50"
              >
                {cmd.label}
              </button>
            ))}
          </div>

          {/* MESSAGE INPUT BAR */}
          <div className="bg-[#f0f2f5] border-t border-slate-300 px-3 py-2 flex items-center gap-2 shrink-0">
            {/* Location Toggle */}
            <button
              type="button"
              onClick={() => setAttachLocation(!attachLocation)}
              className={`p-2 rounded-xl transition-colors ${
                attachLocation ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-200'
              }`}
              title={attachLocation ? 'Location attached (inside site)' : 'Attach Geolocation pin'}
            >
              <MapPin size={18} />
            </button>

            {/* Selfie Toggle */}
            <button
              type="button"
              onClick={() => setAttachSelfie(!attachSelfie)}
              className={`p-2 rounded-xl transition-colors ${
                attachSelfie ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-200'
              }`}
              title={attachSelfie ? 'Selfie photo attached' : 'Attach Biometric Selfie'}
            >
              <Camera size={18} />
            </button>

            {/* Input Field */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={
                  selectedLanguage === 'hi'
                    ? 'कमांड टाइप करें (जैसे IN, OUT, payslip, schedule)...'
                    : selectedLanguage === 'gu'
                    ? 'કમાન્ડ ટાઈપ કરો (જેમ કે IN, OUT, payslip)...'
                    : 'Type a command (e.g. IN, OUT, payslip, schedule)...'
                }
                className="w-full bg-white border border-slate-300 rounded-2xl px-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 shadow-2xs"
              />
            </div>

            {/* Send Button */}
            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={isSending || (!inputText.trim() && !attachLocation && !attachSelfie)}
              className="w-9 h-9 rounded-full bg-[#00a884] hover:bg-[#008f70] text-white flex items-center justify-center shadow-xs transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isSending ? (
                <RefreshCw size={16} className="animate-spin text-white" />
              ) : (
                <Send size={16} className="text-white ml-0.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
