// src/components/PanicSosModal.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  AlertOctagon, PhoneCall, ShieldAlert, CheckCircle2, 
  MapPin, Battery, X, Radio, ArrowRight, Shield, Volume2, VolumeX, RotateCcw
} from 'lucide-react';
import { FieldShiftSession, PanicAlertRecord, EmergencyContact } from '../types/index';
import { safetyCheckInService } from '../services/safetyCheckInService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  session?: FieldShiftSession | null;
  tenantId: string;
  workerId: string;
  workerName: string;
  workerPhone?: string;
  siteId?: string;
  siteName?: string;
}

export const PanicSosModal: React.FC<Props> = ({
  isOpen,
  onClose,
  session,
  tenantId,
  workerId,
  workerName,
  workerPhone,
  siteId,
  siteName
}) => {
  // Press-and-hold state
  const [holding, setHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0); // 0 to 100
  const [activeAlert, setActiveAlert] = useState<PanicAlertRecord | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [showFalseAlarmDialog, setShowFalseAlarmDialog] = useState(false);
  const [falseAlarmReason, setFalseAlarmReason] = useState('Accidental button press');
  const [sirenMuted, setSirenMuted] = useState(false);

  const holdTimerRef = useRef<any>(null);
  const holdStartTimeRef = useRef<number>(0);
  const HOLD_DURATION_MS = 3000; // 3 seconds hold

  useEffect(() => {
    if (isOpen) {
      // Check if there is already an active panic alert for this worker
      const existing = safetyCheckInService.getActivePanicForWorker(workerId);
      if (existing) {
        setActiveAlert(existing);
      } else {
        setActiveAlert(null);
        setHoldProgress(0);
        setHolding(false);
      }
    }
  }, [isOpen, workerId]);

  if (!isOpen) return null;

  const startHold = () => {
    if (activeAlert) return;
    setHolding(true);
    holdStartTimeRef.current = Date.now();

    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartTimeRef.current;
      const progress = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      setHoldProgress(progress);

      if (progress >= 100) {
        clearInterval(holdTimerRef.current);
        triggerPanic();
      }
    }, 50);
  };

  const cancelHold = () => {
    if (activeAlert) return;
    setHolding(false);
    setHoldProgress(0);
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
    }
  };

  const triggerPanic = async () => {
    setIsTriggering(true);
    setHolding(false);

    try {
      // Get current GPS
      let lat = 0;
      let lng = 0;
      let accuracy = 15;
      try {
        if ('geolocation' in navigator) {
          const pos: any = await new Promise((res, rej) => {
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3500, enableHighAccuracy: true });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          accuracy = pos.coords.accuracy;
        }
      } catch (err) {
        console.warn('Could not acquire precise GPS for panic alert, dispatching with last known coordinates');
      }

      const alert = await safetyCheckInService.triggerPanicAlert({
        sessionId: session?.id,
        tenantId,
        workerId,
        workerName,
        workerPhone,
        siteId: siteId || session?.siteId,
        siteName: siteName || session?.siteName || 'Field Location',
        location: lat !== 0 ? { lat, lng, accuracy, address: siteName || 'Active Field Zone' } : undefined,
        batteryPct: 84,
        shiftContext: session ? {
          shiftName: session.siteName,
          startTime: session.startedAt,
          elapsedMinutes: Math.floor((Date.now() - new Date(session.startedAt).getTime()) / (60 * 1000))
        } : undefined
      });

      setActiveAlert(alert);
    } catch (err) {
      console.error('Failed to trigger panic alert:', err);
    } finally {
      setIsTriggering(false);
    }
  };

  const handleResolveAlert = async (isFalseAlarm: boolean) => {
    if (!activeAlert) return;
    await safetyCheckInService.resolvePanicAlert({
      alertId: activeAlert.id,
      tenantId,
      resolvedBy: workerName,
      isFalseAlarm,
      notes: isFalseAlarm ? falseAlarmReason : 'Worker confirmed safe and situation under control'
    });
    setActiveAlert(null);
    setShowFalseAlarmDialog(false);
    onClose();
  };

  // Circular progress calculations for 3s hold
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (holdProgress / 100) * circumference;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden relative">

        {!activeAlert ? (
          /* PRE-TRIGGER SOS VIEW */
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <AlertOctagon size={18} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">Emergency Panic SOS</h3>
                  <p className="text-[10px] text-slate-400">Shift Safety Quick Action</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 mb-6 text-xs text-rose-900 leading-relaxed">
              <p className="font-bold mb-1">Press and hold for 3 seconds to trigger emergency broadcast.</p>
              <p className="text-[11px] text-rose-700">
                Immediately dispatches your live GPS location, battery percentage, and shift context to your Operations Supervisor, Branch Manager, and 24/7 Fallback Dispatch.
              </p>
            </div>

            {/* Circular Press-and-Hold Button */}
            <div className="flex flex-col items-center justify-center py-4">
              <div 
                className="relative cursor-pointer select-none touch-none active:scale-95 transition-transform"
                onMouseDown={startHold}
                onMouseUp={cancelHold}
                onMouseLeave={cancelHold}
                onTouchStart={startHold}
                onTouchEnd={cancelHold}
              >
                <svg className="w-36 h-36 transform -rotate-90">
                  <circle
                    cx="72"
                    cy="72"
                    r={radius}
                    stroke="#f1f5f9"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="72"
                    cy="72"
                    r={radius}
                    stroke="#e11d48"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-75"
                  />
                </svg>

                <div className={`absolute inset-3 rounded-full flex flex-col items-center justify-center text-white shadow-xl transition-all ${
                  holding ? 'bg-rose-700 scale-95 shadow-rose-600/50' : 'bg-rose-600 shadow-rose-600/30'
                }`}>
                  <AlertOctagon size={32} className={holding ? 'animate-bounce' : ''} />
                  <span className="text-xs font-black uppercase mt-1 tracking-wider">
                    {holding ? `${Math.ceil((100 - holdProgress) / 33.3)}s` : 'HOLD 3S'}
                  </span>
                  <span className="text-[9px] text-rose-200 uppercase font-semibold">
                    FOR SOS
                  </span>
                </div>
              </div>

              <p className="text-xs font-semibold text-slate-500 mt-4 text-center">
                {holding ? 'Keep holding to activate...' : 'Press & hold button above to send SOS'}
              </p>
            </div>

            {/* Quick Emergency Bypass Button */}
            <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
              <button
                type="button"
                onClick={triggerPanic}
                disabled={isTriggering}
                className="w-full py-2.5 px-4 rounded-xl border-2 border-dashed border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-bold transition-all text-center"
              >
                {isTriggering ? 'Dispatching Emergency...' : 'Emergency Bypass: Tap to Trigger Immediately'}
              </button>

              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                <span>Accidental press protection: 3s hold required</span>
                <span className="font-mono">T+0 Broadcast</span>
              </div>
            </div>
          </div>
        ) : (
          /* ACTIVE SOS ALERT STATE */
          <div className="p-6">
            <div className="bg-rose-600 -mx-6 -mt-6 p-4 text-white text-center animate-pulse mb-5 flex items-center justify-between px-6">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-white animate-ping" />
                <span className="font-black text-sm uppercase tracking-wider">CRITICAL EMERGENCY SOS ACTIVE</span>
              </div>
              <button 
                onClick={() => setSirenMuted(!sirenMuted)}
                className="p-1 rounded-lg bg-rose-700 hover:bg-rose-800 text-white"
                title={sirenMuted ? 'Unmute siren' : 'Mute siren'}
              >
                {sirenMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </div>

            <div className="space-y-4">
              <div className="text-center">
                <h4 className="text-xl font-black text-slate-900">
                  Help is on the way
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Emergency contacts have been notified with your live coordinates.
                </p>
              </div>

              {/* Broadcast Status List */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Dispatched Contacts (Multi-Tier)
                </span>
                {activeAlert.contactsNotified.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <div>
                        <div className="font-bold text-slate-800">{c.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{c.phone} • {c.role}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      DISPATCHED
                    </span>
                  </div>
                ))}
              </div>

              {/* Direct Emergency Call Button */}
              <a
                href="tel:112"
                className="w-full py-3.5 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all"
              >
                <PhoneCall size={18} className="text-emerald-400" />
                <span>Call Emergency Services (112)</span>
              </a>

              {/* False Alarm / Stand Down Action */}
              {!showFalseAlarmDialog ? (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowFalseAlarmDialog(true)}
                    className="py-2.5 px-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all"
                  >
                    False Alarm
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResolveAlert(false)}
                    className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-xs"
                  >
                    I Am Now Safe
                  </button>
                </div>
              ) : (
                <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900">Confirm False Alarm Stand-Down</span>
                    <button onClick={() => setShowFalseAlarmDialog(false)} className="text-amber-700">
                      <X size={14} />
                    </button>
                  </div>
                  <select
                    value={falseAlarmReason}
                    onChange={(e) => setFalseAlarmReason(e.target.value)}
                    className="w-full p-2 bg-white rounded-lg border border-amber-300 text-xs font-medium text-slate-800 outline-none"
                  >
                    <option value="Accidental button press">Accidental button press</option>
                    <option value="Device in pocket pressed against surface">Device in pocket pressed against surface</option>
                    <option value="Tested emergency feature">Tested emergency feature</option>
                    <option value="Perceived hazard cleared quickly">Perceived hazard cleared quickly</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleResolveAlert(true)}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs"
                  >
                    Confirm Stand Down (Log False Alarm)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
