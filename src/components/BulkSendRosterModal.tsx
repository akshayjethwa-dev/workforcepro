// src/components/BulkSendRosterModal.tsx
import React, { useState } from 'react';
import { 
  X, Send, MessageSquare, Phone, Check, Copy, AlertTriangle, 
  ShieldCheck, Clock, Users, Sparkles, ExternalLink, Download 
} from 'lucide-react';
import { Worker, WorkerAccessToken } from '../types/index';
import { magicLinkService, validateWorkerPhone } from '../services/magicLinkService';
import { useToast } from '../contexts/ToastContext';

interface Props {
  workers: Worker[];
  tenantId: string;
  issuedByEmail: string;
  shiftName?: string;
  weekName?: string;
  onClose: () => void;
}

export const BulkSendRosterModal: React.FC<Props> = ({
  workers,
  tenantId,
  issuedByEmail,
  shiftName = 'Current Shift',
  weekName = 'Weekly Schedule',
  onClose
}) => {
  const { toast } = useToast();
  const [ttlHours, setTtlHours] = useState<number>(72);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>(() => {
    // Select all workers who have valid phone numbers by default
    return workers
      .filter(w => validateWorkerPhone(w.phone).isValid)
      .map(w => w.id);
  });

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [dispatchResults, setDispatchResults] = useState<{
    total: number;
    dispatched: number;
    skipped: number;
    links: { workerName: string; phone: string; link: string }[];
  } | null>(null);

  const [copiedAll, setCopiedAll] = useState<boolean>(false);

  // Toggle selection
  const toggleWorker = (id: string) => {
    setSelectedWorkerIds(prev => 
      prev.includes(id) ? prev.filter(wId => wId !== id) : [...prev, id]
    );
  };

  const selectAllValid = () => {
    setSelectedWorkerIds(
      workers.filter(w => validateWorkerPhone(w.phone).isValid).map(w => w.id)
    );
  };

  const handleBulkDispatch = async (channel: 'WHATSAPP' | 'COPY_ALL') => {
    if (selectedWorkerIds.length === 0) {
      toast.error('Please select at least one worker.');
      return;
    }

    setIsProcessing(true);
    const generatedList: { workerName: string; phone: string; link: string }[] = [];
    let dispatchedCount = 0;
    let skippedCount = 0;

    try {
      for (const workerId of selectedWorkerIds) {
        const worker = workers.find(w => w.id === workerId);
        if (!worker) continue;

        const phoneVal = validateWorkerPhone(worker.phone);
        if (!phoneVal.isValid) {
          skippedCount++;
          continue;
        }

        const res = await magicLinkService.createWorkerMagicLink({
          tenantId,
          worker,
          scope: 'SCHEDULE',
          channel: 'WHATSAPP',
          issuedBy: issuedByEmail,
          ttlHours
        });

        dispatchedCount++;
        generatedList.push({
          workerName: worker.name,
          phone: phoneVal.formattedDisplay,
          link: res.universalUrl
        });
      }

      setDispatchResults({
        total: selectedWorkerIds.length,
        dispatched: dispatchedCount,
        skipped: skippedCount,
        links: generatedList
      });

      if (channel === 'WHATSAPP') {
        // Open first worker's WhatsApp link directly, and provide list for remaining
        if (generatedList.length > 0) {
          const firstWorker = workers.find(w => w.name === generatedList[0].workerName);
          if (firstWorker) {
            const { cleanPhone } = validateWorkerPhone(firstWorker.phone);
            const msg = `नमस्ते ${firstWorker.name}! आपका कार्य शेड्यूल तैयार है / Your schedule is ready:\n🔗 ${generatedList[0].link} (expires ${ttlHours}h)`;
            window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
          }
        }
        toast.success(`Generated schedule links for ${dispatchedCount} workers!`);
      } else {
        const allText = generatedList
          .map(item => `${item.workerName} (${item.phone}): ${item.link}`)
          .join('\n');
        await navigator.clipboard.writeText(allText);
        setCopiedAll(true);
        toast.success(`Copied all ${generatedList.length} schedule magic links!`);
      }

    } catch (err: any) {
      console.error('Bulk dispatch failed:', err);
      toast.error('Failed to dispatch schedule links: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const copyResultsText = async () => {
    if (!dispatchResults?.links) return;
    const text = dispatchResults.links
      .map(item => `${item.workerName} (${item.phone}): ${item.link}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
    setCopiedAll(true);
    toast.success('All generated links copied to clipboard!');
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-slate-100 overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20">
              <Users size={20} className="text-amber-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight">Bulk Send Shift Schedules</h2>
              <p className="text-xs text-blue-100 mt-0.5">{shiftName} • {weekName}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm">
          
          {/* Dispatch Settings */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Security Setting</span>
              <p className="font-bold text-slate-900 text-xs">Link Validity (TTL)</p>
            </div>
            <select
              value={ttlHours}
              onChange={(e) => setTtlHours(Number(e.target.value))}
              className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
            >
              <option value={24}>24 Hours</option>
              <option value={48}>48 Hours</option>
              <option value={72}>72 Hours (Default)</option>
              <option value={168}>7 Days</option>
            </select>
          </div>

          {/* Results View if already generated */}
          {dispatchResults && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-900 text-xs flex items-center gap-1.5">
                  <Check size={16} className="text-emerald-600" />
                  <span>Successfully Generated {dispatchResults.dispatched} Magic Links</span>
                </span>
                <button
                  onClick={copyResultsText}
                  className="px-2.5 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                >
                  <Copy size={12} />
                  <span>{copiedAll ? 'Copied All!' : 'Copy All Links'}</span>
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
                {dispatchResults.links.map((item, idx) => (
                  <div key={idx} className="bg-white p-2 rounded-xl border border-emerald-100 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900">{item.workerName}</span>
                      <span className="text-slate-400 text-[10px] ml-1.5">({item.phone})</span>
                    </div>
                    <span className="text-blue-600 truncate max-w-[200px]">{item.link}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Worker Selection List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700">
                Select Shift Workers ({selectedWorkerIds.length}/{workers.length} selected):
              </label>
              <button
                type="button"
                onClick={selectAllValid}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-700 underline"
              >
                Select All with Phone
              </button>
            </div>

            <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {workers.map(w => {
                const phoneVal = validateWorkerPhone(w.phone);
                const isSelected = selectedWorkerIds.includes(w.id);

                return (
                  <div 
                    key={w.id}
                    onClick={() => phoneVal.isValid && toggleWorker(w.id)}
                    className={`p-3 flex items-center justify-between transition-colors ${
                      !phoneVal.isValid 
                        ? 'bg-amber-50/50 opacity-70 cursor-not-allowed' 
                        : isSelected 
                        ? 'bg-blue-50/50 cursor-pointer' 
                        : 'hover:bg-slate-50 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox"
                        checked={isSelected}
                        disabled={!phoneVal.isValid}
                        onChange={() => toggleWorker(w.id)}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                      <div>
                        <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                          <span>{w.name}</span>
                          <span className="text-[10px] text-slate-500 font-normal">({w.designation})</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {phoneVal.isValid ? (
                            <span className="text-slate-600">{phoneVal.formattedDisplay}</span>
                          ) : (
                            <span className="text-amber-700 font-semibold flex items-center gap-1">
                              <AlertTriangle size={11} />
                              <span>Missing phone number — cannot auto-deliver</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
                      Shift: {w.shiftId}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-[11px] text-slate-500 flex items-start gap-2">
            <ShieldCheck size={16} className="text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-700">Audit Trail Notice (E15)</p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Every individual magic link dispatch is recorded in the E15 security audit log with worker ID, schedule scope, and expiry date.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-white transition-colors"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleBulkDispatch('COPY_ALL')}
              disabled={isProcessing || selectedWorkerIds.length === 0}
              className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 font-bold text-xs text-slate-800 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Copy size={13} />
              <span>Copy All Magic Links</span>
            </button>

            <button
              type="button"
              onClick={() => handleBulkDispatch('WHATSAPP')}
              disabled={isProcessing || selectedWorkerIds.length === 0}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold text-xs text-white flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
            >
              <MessageSquare size={14} />
              <span>{isProcessing ? 'Generating...' : `Dispatch via WhatsApp (${selectedWorkerIds.length})`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
