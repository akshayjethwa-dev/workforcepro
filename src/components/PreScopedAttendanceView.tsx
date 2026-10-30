// src/components/PreScopedAttendanceView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  LogIn, 
  LogOut, 
  Clock, 
  CheckCircle2, 
  MapPin, 
  Calendar, 
  Timer, 
  ShieldCheck, 
  RotateCcw,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { Worker, AttendanceRecord, OrgSettings, Punch } from '../types/index';
import { dbService } from '../services/db';
import { quickSwitchService } from '../services/quickSwitchService';
import { triggerFrontlineHaptic } from '../utils/frontlineTouch';

interface Props {
  worker: Worker;
  tenantId: string;
  branchId: string;
  authMethod: 'PIN' | 'QR_PIN_2FA' | 'SUPERVISOR_ASSISTED';
  onHandoverComplete: () => void;
  playAudio: (type: 'SUCCESS' | 'ERROR') => void;
}

export const PreScopedAttendanceView: React.FC<Props> = ({
  worker,
  tenantId,
  branchId,
  authMethod,
  onHandoverComplete,
  playAudio
}) => {
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [punchFeedback, setPunchFeedback] = useState<{ type: 'SUCCESS' | 'ERROR'; message: string } | null>(null);
  
  // Auto-handover countdown (AC 4)
  const defaultIdleTimeout = quickSwitchService.getAutoIdleTimeoutSeconds();
  const [countdown, setCountdown] = useState<number>(defaultIdleTimeout);
  const countdownIntervalRef = useRef<any>(null);
  const deviceId = quickSwitchService.getDeviceId();

  // Reset/extend idle timer on user touch
  const resetIdleTimer = () => {
    setCountdown(defaultIdleTimeout);
  };

  // Fetch today's record for this worker
  useEffect(() => {
    let isMounted = true;
    const fetchTodayAttendance = async () => {
      try {
        setLoading(true);
        const records = await dbService.getTodayAttendance(tenantId);
        const myRecord = records.find(r => r.workerId === worker.id);
        if (isMounted) {
          setTodayRecord(myRecord || null);
        }
      } catch (err) {
        console.warn('Could not load worker today record:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchTodayAttendance();
    return () => { isMounted = false; };
  }, [tenantId, worker.id]);

  // Auto-idle countdown ticker
  useEffect(() => {
    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          onHandoverComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [onHandoverComplete]);

  // Determine current punch status
  const lastPunch = todayRecord?.timeline && todayRecord.timeline.length > 0 
    ? todayRecord.timeline[todayRecord.timeline.length - 1] 
    : null;
  const isClockedIn = lastPunch?.type === 'IN';

  // Perform Punch Action
  const executePunch = async (punchType: 'IN' | 'OUT') => {
    if (punching) return;
    setPunching(true);
    triggerFrontlineHaptic('confirm');
    resetIdleTimer();

    try {
      const now = new Date();
      const todayDateStr = now.toISOString().split('T')[0];
      const recordId = `${tenantId}_${worker.id}_${todayDateStr}`;

      // Check fast 10-second double-punch protection
      if (lastPunch) {
        const lastPunchTime = new Date(lastPunch.timestamp).getTime();
        const diffSeconds = (now.getTime() - lastPunchTime) / 1000;
        if (diffSeconds < 10) {
          playAudio('ERROR');
          setPunchFeedback({
            type: 'ERROR',
            message: `Double-punch protected. Please wait ${Math.ceil(10 - diffSeconds)}s before next punch.`
          });
          setPunching(false);
          return;
        }
      }

      // Geo coordinates if available
      let location: { lat: number; lng: number } | undefined = undefined;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
          });
          location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        } catch {}
      }

      const newPunch: Punch = {
        timestamp: now.toISOString(),
        type: punchType,
        device: `${deviceId} (${authMethod})`,
        location,
        syncStatus: 'SYNCED'
      };

      // Construct / update attendance record
      const updatedTimeline = [...(todayRecord?.timeline || []), newPunch];
      const updatedRecord: AttendanceRecord = {
        id: recordId,
        tenantId,
        workerId: worker.id,
        workerName: worker.name,
        date: todayDateStr,
        shiftId: worker.shiftId || 'default',
        timeline: updatedTimeline,
        status: punchType === 'IN' ? 'PRESENT' : (todayRecord?.status || 'PRESENT'),
        lateStatus: todayRecord?.lateStatus || { isLate: false, lateByMins: 0, penaltyApplied: false },
        hours: todayRecord?.hours || { gross: 0, net: 0, overtime: 0 }
      };

      // Save to local & remote db
      await dbService.markAttendance(updatedRecord);
      setTodayRecord(updatedRecord);

      // Attribution in audit trail (AC 5)
      await quickSwitchService.logQuickSwitchAudit({
        tenantId,
        worker,
        authMethod,
        action: punchType === 'IN' ? 'PUNCH_IN' : 'PUNCH_OUT',
        deviceId,
        details: {
          punchType,
          timestamp: now.toISOString(),
          recordId
        }
      });

      playAudio('SUCCESS');
      setPunchFeedback({
        type: 'SUCCESS',
        message: `Successfully clocked ${punchType} at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
      });

      // After punch completion, auto-return to idle after short celebratory delay (3 seconds)
      setTimeout(() => {
        onHandoverComplete();
      }, 2500);

    } catch (err: any) {
      console.warn('Punch failed:', err);
      playAudio('ERROR');
      setPunchFeedback({
        type: 'ERROR',
        message: err?.message || 'Punch could not be completed. Please try again.'
      });
    } finally {
      setPunching(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-slate-950 text-white z-50 flex flex-col p-4 sm:p-6 overflow-y-auto select-none"
      onClick={resetIdleTimer}
      onTouchStart={resetIdleTimer}
    >
      {/* TOP HEADER: Pre-Scoped Profile & Live Handover Countdown */}
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-black text-xl flex items-center justify-center border-2 border-blue-400 shadow-md">
            {worker.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-800">
                Active Shift Worker
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Via {authMethod === 'PIN' ? 'Direct PIN' : authMethod === 'QR_PIN_2FA' ? 'QR + 2FA PIN' : 'Supervisor Assist'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white">{worker.name}</h1>
            <p className="text-xs text-slate-400">
              {worker.designation || 'Staff'} · {worker.department || 'General'} · Phone: {worker.phone}
            </p>
          </div>
        </div>

        {/* Live Auto-Return Countdown Badge (AC 4) */}
        <div className="flex items-center gap-3">
          <div 
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 text-amber-300 font-mono text-xs sm:text-sm shadow-md"
            title="Auto-returns to idle to protect your session if tablet is handed over"
          >
            <Timer size={16} className="animate-spin text-amber-400" />
            <span>Handover in <strong className="text-white text-base tabular-nums">{countdown}s</strong></span>
          </div>

          <button
            type="button"
            onClick={onHandoverComplete}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 text-xs sm:text-sm font-black border border-slate-700 active:scale-95 cursor-pointer flex items-center gap-2 transition-all shadow-md"
          >
            <RotateCcw size={16} />
            <span>Handover Now</span>
          </button>
        </div>
      </div>

      {/* MAIN ATTENDANCE ACTION CARD */}
      <div className="max-w-2xl w-full mx-auto my-auto py-6">
        {/* Feedback Alert */}
        {punchFeedback && (
          <div 
            className={`mb-5 p-4 rounded-2xl border-2 flex items-center gap-3 animate-in zoom-in-95 ${
              punchFeedback.type === 'SUCCESS' 
                ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200' 
                : 'bg-rose-950/90 border-rose-500 text-rose-200'
            }`}
          >
            {punchFeedback.type === 'SUCCESS' ? (
              <CheckCircle2 size={24} className="text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle size={24} className="text-rose-400 shrink-0" />
            )}
            <div className="font-bold text-sm sm:text-base">{punchFeedback.message}</div>
          </div>
        )}

        {/* Current Status Box */}
        <div className="p-5 bg-slate-900 border-2 border-slate-800 rounded-3xl mb-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Current Status Today</span>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <Clock size={14} />
              <span>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div 
              className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 shrink-0 ${
                isClockedIn 
                  ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400' 
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              {isClockedIn ? <LogIn size={28} /> : <LogOut size={28} />}
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">
                {isClockedIn ? 'Clocked IN' : 'Not Clocked In'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                {lastPunch ? (
                  <>Last punch recorded at <strong className="text-slate-200">{new Date(lastPunch.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong> ({lastPunch.type})</>
                ) : (
                  'No punch activity recorded for this shift yet today.'
                )}
              </p>
            </div>
          </div>
        </div>

        {/* MASSIVE 72PX TACTILE PUNCH BUTTONS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <button
            type="button"
            disabled={punching}
            onClick={() => executePunch('IN')}
            className={`min-h-[76px] h-[76px] rounded-2xl text-white font-black text-xl uppercase border-4 shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all cursor-pointer ${
              !isClockedIn 
                ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400 animate-pulse' 
                : 'bg-emerald-800/80 hover:bg-emerald-700 border-emerald-600 text-emerald-100'
            }`}
          >
            <LogIn size={28} strokeWidth={3} />
            <span>Clock IN</span>
          </button>

          <button
            type="button"
            disabled={punching}
            onClick={() => executePunch('OUT')}
            className={`min-h-[76px] h-[76px] rounded-2xl text-white font-black text-xl uppercase border-4 shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all cursor-pointer ${
              isClockedIn 
                ? 'bg-rose-600 hover:bg-rose-500 border-rose-400 animate-pulse' 
                : 'bg-rose-800/80 hover:bg-rose-700 border-rose-600 text-rose-100'
            }`}
          >
            <LogOut size={28} strokeWidth={3} />
            <span>Clock OUT</span>
          </button>
        </div>

        {/* TODAY'S TIMELINE LOGS */}
        {todayRecord?.timeline && todayRecord.timeline.length > 0 && (
          <div className="p-4 bg-slate-900 border-2 border-slate-800 rounded-2xl">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 block mb-3">
              Today's Punches ({todayRecord.timeline.length})
            </span>
            <div className="space-y-2">
              {todayRecord.timeline.map((p, idx) => (
                <div 
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span 
                      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        p.type === 'IN' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                      }`}
                    >
                      {p.type}
                    </span>
                    <span className="text-slate-300">
                      {new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <span className="text-slate-500 text-[11px] truncate max-w-[200px]">
                    {p.device || deviceId}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* FOOTER: Device info & session security notice */}
      <div className="max-w-4xl w-full mx-auto pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500 font-mono">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-blue-400" />
          <span>Device: {deviceId} · Handover security enforced</span>
        </div>
        <button
          type="button"
          onClick={onHandoverComplete}
          className="text-blue-400 hover:text-blue-300 underline font-bold cursor-pointer"
        >
          Exit to PIN Pad
        </button>
      </div>
    </div>
  );
};
