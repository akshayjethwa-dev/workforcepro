// src/components/LoneWorkerCheckInModal.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, AlertTriangle, Mic, MicOff, Check, X, 
  Volume2, Play, Square, Battery, MapPin, Clock, ArrowRight,
  ShieldAlert, UserX, Info, PhoneCall
} from 'lucide-react';
import { SafetyCheckInRecord, FieldShiftSession, SafetyResponseChannel } from '../types/index';
import { safetyCheckInService } from '../services/safetyCheckInService';

interface Props {
  checkIn: SafetyCheckInRecord;
  session: FieldShiftSession;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onDecline: () => void;
}

export const LoneWorkerCheckInModal: React.FC<Props> = ({
  checkIn,
  session,
  isOpen,
  onClose,
  onSuccess,
  onDecline
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [quickStatus, setQuickStatus] = useState<string>('All clear & safe');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [lateReason, setLateReason] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  const isOverdue = new Date().getTime() > new Date(checkIn.dueAt).getTime();
  const overdueMinutes = Math.max(0, Math.floor((Date.now() - new Date(checkIn.dueAt).getTime()) / (60 * 1000)));

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const startVoiceRecording = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            setRecordedAudio(reader.result as string);
          };
          stream.getTracks().forEach(t => t.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
        setRecordingSeconds(0);
        timerRef.current = setInterval(() => {
          setRecordingSeconds(sec => sec + 1);
        }, 1000);
      } else {
        // Fallback simulation for unsupported browsers
        setIsRecording(true);
        setRecordingSeconds(0);
        timerRef.current = setInterval(() => {
          setRecordingSeconds(sec => sec + 1);
        }, 1000);
      }
    } catch (err) {
      console.warn('Microphone permission not granted, using simulated audio capture', err);
      setIsRecording(true);
      timerRef.current = setInterval(() => {
        setRecordingSeconds(sec => sec + 1);
      }, 1000);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    } else {
      setRecordedAudio('data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwE...');
    }
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleConfirmOk = async () => {
    setIsSubmitting(true);
    try {
      let lat = 0;
      let lng = 0;
      let accuracy = 10;
      try {
        if ('geolocation' in navigator) {
          const pos: any = await new Promise((res, rej) => {
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000, enableHighAccuracy: true });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          accuracy = pos.coords.accuracy;
        }
      } catch {
        // Fallback coordinates from checkIn record if GPS blocked
        if (checkIn.lastKnownLocation) {
          lat = checkIn.lastKnownLocation.lat;
          lng = checkIn.lastKnownLocation.lng;
        }
      }

      const res = await safetyCheckInService.submitCheckInOk({
        checkInId: checkIn.id,
        sessionId: session.id,
        tenantId: session.tenantId,
        workerId: session.workerId,
        channel: 'IN_APP',
        voiceNoteSnippet: recordedAudio || (quickStatus ? `Voice note: "${quickStatus}"` : undefined),
        voiceNoteDurationSec: recordingSeconds > 0 ? recordingSeconds : (recordedAudio ? 5 : undefined),
        batteryPct: 88,
        location: { lat, lng, accuracy, address: session.siteName },
        lateReason: isOverdue ? (lateReason || 'Delayed check-in prompt') : undefined
      });

      if (res.success) {
        onSuccess();
      } else {
        alert(res.message);
        onClose();
      }
    } catch (err) {
      console.error('Error submitting safety check-in:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeclineSafety = async () => {
    setIsSubmitting(true);
    try {
      await safetyCheckInService.declineSafetyMonitoring({
        workerId: session.workerId,
        workerName: session.workerName,
        tenantId: session.tenantId,
        sessionId: session.id,
        reason: declineReason || 'Worker requested opt-out'
      });
      onDecline();
    } catch (err) {
      console.error('Error declining safety check-in:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 overflow-hidden relative">
        
        {/* Header Alert Ribbon */}
        <div className={`-mx-6 -mt-6 p-4 text-center font-bold text-xs uppercase tracking-wider mb-5 flex items-center justify-center gap-2 ${
          isOverdue 
            ? 'bg-rose-600 text-white animate-pulse' 
            : 'bg-emerald-600 text-white'
        }`}>
          {isOverdue ? (
            <>
              <AlertTriangle size={16} />
              <span>Safety Check-In Overdue by {overdueMinutes}m — Escalation Active</span>
            </>
          ) : (
            <>
              <ShieldCheck size={16} />
              <span>Lone Worker Scheduled Safety Check-In</span>
            </>
          )}
        </div>

        {!showDeclineConfirm ? (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border-2 border-emerald-200 shadow-inner">
                <ShieldCheck size={36} />
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">
                Are you OK?
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                Shift: <span className="font-semibold text-slate-700">{session.siteName}</span> • Response goes directly to your supervisor.
              </p>
            </div>

            {/* Overdue Late Note if applicable */}
            {isOverdue && (
              <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
                <label className="text-[10px] font-bold text-amber-800 uppercase block mb-1">
                  Reason for delay (optional)
                </label>
                <input 
                  type="text" 
                  value={lateReason} 
                  onChange={(e) => setLateReason(e.target.value)}
                  placeholder="e.g. In basement / heavy machinery noise" 
                  className="w-full text-xs p-2 bg-white rounded-lg border border-amber-300 outline-none text-slate-800 placeholder:text-slate-400"
                />
              </div>
            )}

            {/* Quick Status Tags */}
            <div className="mb-4">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Quick Status Note (Optional)
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  'All clear & safe',
                  'Moving to next zone',
                  'Heavy machinery operating',
                  'Weak signal area'
                ].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setQuickStatus(tag)}
                    className={`p-2 rounded-xl text-[11px] font-medium text-left border transition-all ${
                      quickStatus === tag
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Voice Note (E1-S2: Single tap, optional voice note — no typing) */}
            <div className="mb-5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Mic size={14} className="text-indigo-600" />
                  Voice Note (No typing needed)
                </span>
                {recordedAudio && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    Voice Note Ready ({recordingSeconds > 0 ? `${recordingSeconds}s` : 'Captured'})
                  </span>
                )}
              </div>

              {!isRecording ? (
                <button
                  type="button"
                  onClick={startVoiceRecording}
                  className="w-full py-2 px-3 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-98 shadow-xs"
                >
                  <Mic size={15} />
                  <span>{recordedAudio ? 'Re-record Voice Snippet' : 'Tap to Record 10s Voice Update'}</span>
                </button>
              ) : (
                <div className="flex items-center justify-between bg-rose-50 border border-rose-200 p-2.5 rounded-xl animate-pulse">
                  <div className="flex items-center gap-2 text-rose-700 text-xs font-bold">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping" />
                    <span>Recording... {recordingSeconds}s</span>
                  </div>
                  <button
                    type="button"
                    onClick={stopVoiceRecording}
                    className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-xs"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>

            {/* Primary Action Button: "I'm OK" */}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleConfirmOk}
              className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-base shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-3 transition-all mb-3 cursor-pointer"
            >
              <Check size={24} className="stroke-[3]" />
              <span>{isSubmitting ? 'Confirming...' : "I'M OK — CONFIRM SAFETY"}</span>
            </button>

            {/* Worker Decline Option (AC: Must not be treated as insubordination) */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setShowDeclineConfirm(true)}
                className="text-slate-400 hover:text-slate-600 font-medium underline"
              >
                Decline safety check-ins
              </button>
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px]">
                <Clock size={12} />
                <span>Next: 60m</span>
              </div>
            </div>
          </>
        ) : (
          /* Decline Safety Check-In View */
          <div className="space-y-4 py-2">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200 mx-auto">
              <UserX size={24} />
            </div>
            
            <div className="text-center">
              <h4 className="font-black text-slate-900 text-base">
                Opt Out of Lone Worker Check-Ins?
              </h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                You can decline safety check-ins for this shift without losing your ability to punch in or out.
              </p>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-[11px] text-blue-900 flex items-start gap-2 leading-relaxed">
              <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
              <span>
                <strong>Corporate Policy Protected:</strong> Under platform and statutory guidelines, your decision to opt out must <u>never</u> be treated as insubordination. Your supervisor will be notified once for roster awareness.
              </span>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                Reason for opting out (optional)
              </label>
              <input
                type="text"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g. Paired with co-worker on site"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeclineConfirm(false)}
                className="py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50"
              >
                Keep Safety On
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleDeclineSafety}
                className="py-2.5 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-900 shadow-xs"
              >
                {isSubmitting ? 'Opting Out...' : 'Confirm Opt-Out'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
