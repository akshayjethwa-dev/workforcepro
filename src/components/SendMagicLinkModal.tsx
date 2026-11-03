// src/components/SendMagicLinkModal.tsx
import React, { useState, useEffect } from 'react';
import { 
  X, Send, MessageSquare, Phone, Calendar, FileText, Check, 
  Copy, ExternalLink, Printer, AlertTriangle, ShieldCheck, 
  Clock, Sparkles, ChevronRight, AlertCircle, Edit3
} from 'lucide-react';
import { Worker, MagicLinkScope, MagicLinkChannel, WorkerAccessToken } from '../types/index';
import { magicLinkService, validateWorkerPhone } from '../services/magicLinkService';
import { useToast } from '../contexts/ToastContext';

interface Props {
  worker: Worker;
  initialScope?: MagicLinkScope;
  tenantId: string;
  issuedByEmail: string;
  onClose: () => void;
  onEditWorker?: (worker: Worker) => void;
  onPreviewToken?: (token: string) => void;
}

export const SendMagicLinkModal: React.FC<Props> = ({
  worker,
  initialScope = 'PAYSLIP',
  tenantId,
  issuedByEmail,
  onClose,
  onEditWorker,
  onPreviewToken
}) => {
  const { toast } = useToast();
  const [scope, setScope] = useState<MagicLinkScope>(initialScope);
  const [ttlHours, setTtlHours] = useState<number>(72);
  const [targetMonth, setTargetMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedLink, setGeneratedLink] = useState<{
    token: string;
    universalUrl: string;
    localUrl: string;
    whatsappUrl: string;
    smsUrl: string;
    messageText: string;
  } | null>(null);

  const [copied, setCopied] = useState<boolean>(false);

  // Validate phone number
  const phoneValidation = validateWorkerPhone(worker.phone);

  // Generate or regenerate token when scope or TTL or targetMonth changes
  const handleGenerate = async (channel: MagicLinkChannel = 'WHATSAPP') => {
    setIsGenerating(true);
    try {
      const result = await magicLinkService.createWorkerMagicLink({
        tenantId,
        worker,
        scope,
        channel,
        issuedBy: issuedByEmail,
        ttlHours,
        targetMonth
      });
      setGeneratedLink(result);
      return result;
    } catch (err: any) {
      console.error('Failed to generate magic link:', err);
      toast.error('Failed to generate magic link: ' + (err.message || 'Unknown error'));
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  // Generate on initial open or when scope changes
  useEffect(() => {
    handleGenerate('WHATSAPP');
  }, [scope, ttlHours, targetMonth]);

  const handleCopy = async () => {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink.universalUrl);
      setCopied(true);
      toast.success('Magic link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info('Copy link: ' + generatedLink.universalUrl);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!phoneValidation.isValid) {
      toast.error('Cannot send WhatsApp: No valid phone number on file.');
      return;
    }
    let link = generatedLink;
    if (!link) {
      link = await handleGenerate('WHATSAPP');
    }
    if (link) {
      window.open(link.whatsappUrl, '_blank', 'noopener,noreferrer');
      toast.success(`WhatsApp opened with ${scope.toLowerCase()} link for ${worker.name}`);
    }
  };

  const handleSendSms = async () => {
    if (!phoneValidation.isValid) {
      toast.error('Cannot send SMS: No valid phone number on file.');
      return;
    }
    let link = generatedLink;
    if (!link) {
      link = await handleGenerate('SMS');
    }
    if (link) {
      window.location.href = link.smsUrl;
      toast.success(`SMS composer opened for ${worker.name}`);
    }
  };

  const handleOpenPreview = () => {
    if (!generatedLink) return;
    if (onPreviewToken) {
      onPreviewToken(generatedLink.token);
    } else {
      window.open(generatedLink.localUrl, '_blank');
    }
  };

  const handlePrintHandover = () => {
    // Open preview for physical handover / PDF print
    if (generatedLink) {
      window.open(generatedLink.localUrl + '&print=true', '_blank');
      toast.info('Opening print-friendly portal for physical handover.');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20">
              <Sparkles size={20} className="text-amber-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight">Send Worker Magic Link</h2>
              <p className="text-xs text-blue-100 flex items-center gap-1.5 mt-0.5">
                <span>One-tap read-only portal for</span>
                <span className="font-semibold underline decoration-white/30">{worker.name}</span>
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

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 text-slate-800 text-xs sm:text-sm">
          
          {/* Worker Info & Phone Status Alert */}
          <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Recipient Worker</span>
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <span>{worker.name}</span>
                  <span className="text-[11px] font-normal text-slate-500">({worker.designation || 'Worker'} • {worker.department || 'General'})</span>
                </h4>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-mono font-semibold">
                ID: {worker.id.replace('worker-', '#')}
              </span>
            </div>

            {/* Phone check & Edge case 1 handling */}
            {!phoneValidation.isValid ? (
              <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-xs text-amber-800">
                    No phone number on file — update in profile.
                  </p>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    WhatsApp and SMS require a valid phone number. You can update their profile or copy the link manually.
                  </p>
                  {onEditWorker && (
                    <button
                      onClick={() => {
                        onClose();
                        onEditWorker(worker);
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] transition-colors shadow-xs"
                    >
                      <Edit3 size={12} />
                      <span>Update Worker Phone</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs pt-1 text-slate-600 border-t border-slate-200/60 mt-1">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <Phone size={13} className="text-emerald-600" />
                  <span>WhatsApp Verified:</span>
                </span>
                <span className="font-mono font-bold text-slate-900">{phoneValidation.formattedDisplay}</span>
              </div>
            )}
          </div>

          {/* Scope Selector: 3 One-tap Actions */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Select Document Scope to Deliver:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setScope('PAYSLIP')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  scope === 'PAYSLIP'
                    ? 'border-blue-600 bg-blue-50/80 shadow-xs ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:bg-slate-50 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-base">💰</span>
                  {scope === 'PAYSLIP' && <Check size={14} className="text-blue-600" />}
                </div>
                <div className="font-bold text-xs text-slate-900">Payslip</div>
                <p className="text-[10px] text-slate-500 mt-0.5">Salary & Deductions</p>
              </button>

              <button
                type="button"
                onClick={() => setScope('SCHEDULE')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  scope === 'SCHEDULE'
                    ? 'border-blue-600 bg-blue-50/80 shadow-xs ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:bg-slate-50 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-base">📅</span>
                  {scope === 'SCHEDULE' && <Check size={14} className="text-blue-600" />}
                </div>
                <div className="font-bold text-xs text-slate-900">Schedule</div>
                <p className="text-[10px] text-slate-500 mt-0.5">Shift & Weekly Offs</p>
              </button>

              <button
                type="button"
                onClick={() => setScope('ATTENDANCE_SUMMARY')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  scope === 'ATTENDANCE_SUMMARY'
                    ? 'border-blue-600 bg-blue-50/80 shadow-xs ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:bg-slate-50 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-base">📋</span>
                  {scope === 'ATTENDANCE_SUMMARY' && <Check size={14} className="text-blue-600" />}
                </div>
                <div className="font-bold text-xs text-slate-900">Attendance</div>
                <p className="text-[10px] text-slate-500 mt-0.5">Monthly Logs</p>
              </button>

              <button
                type="button"
                onClick={() => setScope('PUNCH')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  scope === 'PUNCH'
                    ? 'border-emerald-600 bg-emerald-50/80 shadow-xs ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:bg-slate-50 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-base">📱</span>
                  {scope === 'PUNCH' && <Check size={14} className="text-emerald-600" />}
                </div>
                <div className="font-bold text-xs text-slate-900">Punch Link</div>
                <p className="text-[10px] text-slate-500 mt-0.5">1-Tap Device Bound</p>
              </button>
            </div>
          </div>

          {/* Configurable Token TTL & Target Month */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Clock size={12} className="text-slate-400" />
                <span>Link Expiration (TTL):</span>
              </label>
              <select
                value={ttlHours}
                onChange={(e) => setTtlHours(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium text-xs text-slate-800 outline-none focus:border-blue-600"
              >
                <option value={24}>24 Hours (1 Day)</option>
                <option value={48}>48 Hours (2 Days)</option>
                <option value={72}>72 Hours (3 Days - Default)</option>
                <option value={168}>7 Days (1 Week)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Calendar size={12} className="text-slate-400" />
                <span>Target Month:</span>
              </label>
              <input
                type="month"
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium text-xs text-slate-800 outline-none focus:border-blue-600 font-mono"
              />
            </div>
          </div>

          {/* Universal Link Card & Preview Copy */}
          {generatedLink && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <ShieldCheck size={14} className="text-emerald-600" />
                  <span>Scoped Universal Link (App & PWA)</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  TTL: {ttlHours}h
                </span>
              </div>

              <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs text-slate-800">
                <span className="truncate flex-1 text-blue-700 font-semibold">{generatedLink.universalUrl}</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-sans font-semibold flex items-center gap-1 shrink-0 transition-colors"
                >
                  {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              {/* Message Preview Box */}
              <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-2.5 text-[11px] text-emerald-950 font-sans leading-relaxed whitespace-pre-wrap">
                <div className="font-bold text-[10px] uppercase tracking-wider text-emerald-800 mb-1 flex items-center gap-1">
                  <MessageSquare size={12} />
                  <span>Outgoing WhatsApp / SMS Message:</span>
                </div>
                {generatedLink.messageText}
              </div>
            </div>
          )}

          {/* Security & Multi-Device Protection Notice */}
          <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-start gap-2">
            <ShieldCheck size={15} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-700">Enterprise Security Guarantees</p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Token is strictly read-only, signed with tenant secret, and SHA-256 hashed at rest. If accessed on &gt;2 distinct devices within 1 hour, a security anomaly alert is instantly logged.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex flex-col gap-2.5">
          {/* Primary Action: WhatsApp First */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleSendWhatsApp}
              disabled={!phoneValidation.isValid || isGenerating}
              className={`w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-98 ${
                phoneValidation.isValid && !isGenerating
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                  : 'bg-emerald-100 text-emerald-400 cursor-not-allowed'
              }`}
            >
              <MessageSquare size={16} />
              <span>Send via WhatsApp</span>
            </button>

            {/* Fallback Action: SMS */}
            <button
              type="button"
              onClick={handleSendSms}
              disabled={!phoneValidation.isValid || isGenerating}
              className={`w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all active:scale-98 ${
                phoneValidation.isValid && !isGenerating
                  ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800 cursor-pointer'
                  : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Send size={15} />
              <span>Send via SMS Fallback</span>
            </button>
          </div>

          {/* Secondary Actions: Preview & Print Handover */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={handlePrintHandover}
              className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-colors"
              title="Print-friendly PDF if delivery fails or worker has no smartphone"
            >
              <Printer size={13} className="text-slate-500" />
              <span>Print Handover PDF</span>
            </button>

            <button
              type="button"
              onClick={handleOpenPreview}
              className="px-3 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-colors"
              title="Test the read-only portal view as seen by worker"
            >
              <ExternalLink size={13} />
              <span>Preview Portal</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
