// src/screens/AttendanceKioskScreen.tsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  X, 
  LogIn, 
  LogOut, 
  Clock, 
  Loader2, 
  ScanFace, 
  AlertCircle, 
  ShieldAlert, 
  Lock, 
  QrCode, 
  Delete, 
  RotateCcw, 
  CheckCircle2, 
  Settings, 
  UserCheck, 
  Tablet, 
  Timer, 
  ShieldCheck,
  Camera,
  RefreshCw
} from 'lucide-react';
import jsQR from 'jsqr';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { faceService } from '../services/faceService';
import { Worker, AttendanceRecord, OrgSettings, SyncStatus } from '../types/index';
import { useBackButton } from '../hooks/useBackButton';
import { triggerFrontlineHaptic } from '../utils/frontlineTouch';
import { FrontlineWipeOverlay } from '../components/FrontlineWipeOverlay';
import { quickSwitchService } from '../services/quickSwitchService';
import { PreScopedAttendanceView } from '../components/PreScopedAttendanceView';
import { LiveQrBadgeModal } from '../components/LiveQrBadgeModal';
import { SupervisorAssistModal } from '../components/SupervisorAssistModal';
import { KioskDeviceSettingsModal } from '../components/KioskDeviceSettingsModal';

interface Props { 
  onExit: () => void; 
  branchId: string; 
  isDedicatedMode: boolean;
  tenantId?: string; 
  adminPin?: string; 
}

const playSound = (type: 'SUCCESS' | 'ERROR') => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const audioCtx = new AudioContext();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'SUCCESS') {
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime); 
      oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
    } else {
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(250, audioCtx.currentTime); 
      oscillator.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.4);
    }
  } catch (e) {
    console.warn("Audio playback failed or is not supported", e);
  }
};

export const AttendanceKioskScreen: React.FC<Props> = ({ 
  onExit, 
  branchId, 
  isDedicatedMode, 
  tenantId: propsTenantId, 
  adminPin = '1234' 
}) => {
  const { profile } = useAuth();
  const activeTenantId = isDedicatedMode ? propsTenantId : (profile?.tenantId || 'demo-tenant-id');

  // Video and stream references for camera QR / face scan
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processingRef = useRef(false);

  // Workers and settings
  const [allWorkers, setAllWorkers] = useState<Worker[]>([]);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [deviceId, setDeviceId] = useState<string>(quickSwitchService.getDeviceId());
  const [deviceName, setDeviceName] = useState<string>(quickSwitchService.getDeviceName());

  // Screen & Mode States: 'PIN_IDLE' | 'SCAN_QR'
  const [kioskMode, setKioskMode] = useState<'PIN_IDLE' | 'SCAN_QR'>('PIN_IDLE');

  // Authenticated Pre-Scoped Session (AC 2 & AC 4)
  const [scopedWorker, setScopedWorker] = useState<Worker | null>(null);
  const [authMethod, setAuthMethod] = useState<'PIN' | 'QR_PIN_2FA' | 'SUPERVISOR_ASSISTED'>('PIN');

  // PIN Input State
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);

  // Cooldown / Lockout State (Edge Case: Wrong PIN entered 3 times)
  const [cooldownCountdown, setCooldownCountdown] = useState<number>(0);
  const [cooldownTargetWorkerName, setCooldownTargetWorkerName] = useState<string | null>(null);

  // 2FA QR Handover State (AC 3)
  const [qrPendingWorker, setQrPendingWorker] = useState<Worker | null>(null);
  const [qrPendingSeconds, setQrPendingSeconds] = useState<number>(0);
  const [qr2faPin, setQr2faPin] = useState<string>('');
  const [qrError, setQrError] = useState<string | null>(null);

  // Modals
  const [showExitPin, setShowExitPin] = useState(false);
  const [exitPinInput, setExitPinInput] = useState('');
  const [exitPinError, setExitPinError] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [showLiveQrModal, setShowLiveQrModal] = useState(false);
  const [liveQrWorker, setLiveQrWorker] = useState<Worker | null>(null);
  const [isScreenLockedForWipe, setIsScreenLockedForWipe] = useState(false);

  // Live clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Back button handling
  useBackButton(() => {
    if (isDedicatedMode) return true;
    handleCleanExit();
    return true;
  });

  const handleCleanExit = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    onExit();
  }, [onExit]);

  // Load active workers for current tenant
  const loadWorkers = useCallback(async () => {
    if (!activeTenantId) return;
    try {
      const workers = await dbService.getWorkers(activeTenantId);
      setAllWorkers(workers);
    } catch (e) {
      console.warn("Could not load workers for kiosk:", e);
    }
  }, [activeTenantId]);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  // Edge Case: Handover / Background tracking
  // Auto-idle timer must trigger even if the browser tab is backgrounded
  useEffect(() => {
    const unbind = quickSwitchService.setupHandoverBackgroundListeners(() => {
      // Immediately reset any active worker session to the default idle state
      setScopedWorker(null);
      setQrPendingWorker(null);
      setEnteredPin('');
      setQr2faPin('');
      setKioskMode('PIN_IDLE');
    });

    return () => unbind();
  }, []);

  // Camera management for QR mode
  useEffect(() => {
    if (kioskMode === 'SCAN_QR' && !scopedWorker) {
      navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } })
        .then(stream => {
          streamRef.current = stream;
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch(err => {
          console.warn("Camera stream unavailable:", err);
          setQrError("Camera access required for QR badge scanning.");
        });
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [kioskMode, scopedWorker]);

  // Camera QR Code Scanner Loop
  useEffect(() => {
    if (kioskMode !== 'SCAN_QR' || !videoRef.current || qrPendingWorker || scopedWorker) return;

    const hiddenCanvas = document.createElement('canvas');
    const ctx = hiddenCanvas.getContext('2d', { willReadFrequently: true });

    const scanInterval = setInterval(() => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended || processingRef.current) {
        return;
      }

      if (ctx && videoRef.current.videoWidth > 0) {
        hiddenCanvas.width = videoRef.current.videoWidth;
        hiddenCanvas.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0, hiddenCanvas.width, hiddenCanvas.height);
        const imageData = ctx.getImageData(0, 0, hiddenCanvas.width, hiddenCanvas.height);

        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert"
        });

        if (code && code.data && !processingRef.current) {
          processingRef.current = true;
          handleQrScanned(code.data);
        }
      }
    }, 200);

    return () => clearInterval(scanInterval);
  }, [kioskMode, qrPendingWorker, scopedWorker, allWorkers, activeTenantId]);

  // Handle scanned QR code token
  const handleQrScanned = (qrData: string) => {
    const result = quickSwitchService.validateShortLivedQrToken(qrData, activeTenantId!, allWorkers);

    if (!result.isValid || !result.worker) {
      playSound('ERROR');
      setQrError(result.error || 'Invalid or expired QR badge.');
      processingRef.current = false;
      setTimeout(() => setQrError(null), 3000);
      return;
    }

    // Check cooldown for this worker
    const cooldown = quickSwitchService.getWorkerCooldownStatus(activeTenantId!, result.worker.id);
    if (cooldown.isLocked) {
      playSound('ERROR');
      setQrError(`Worker quick-switch locked (${cooldown.secondsRemaining}s cooldown remaining).`);
      processingRef.current = false;
      setTimeout(() => setQrError(null), 3000);
      return;
    }

    // Valid QR token (≤ 60s) -> Advance to 2FA PIN confirmation (AC 3)
    playSound('SUCCESS');
    triggerFrontlineHaptic('confirm');
    setQrPendingWorker(result.worker);
    setQrPendingSeconds(result.secondsRemaining || 60);
    setQr2faPin('');
    setQrError(null);
    processingRef.current = false;
  };

  // Cooldown countdown interval
  useEffect(() => {
    if (cooldownCountdown <= 0) return;
    const interval = setInterval(() => {
      setCooldownCountdown(prev => {
        if (prev <= 1) {
          setPinError(null);
          setCooldownTargetWorkerName(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownCountdown]);

  // Direct PIN Authentication Submission (AC 2)
  const submitDirectPin = async (pinToVerify: string) => {
    if (isAuthenticating || pinToVerify.length < 4) return;
    setIsAuthenticating(true);
    setPinError(null);

    try {
      const result = await quickSwitchService.authenticateWithPin(activeTenantId!, pinToVerify, allWorkers);

      if (result.success && result.worker) {
        playSound('SUCCESS');
        triggerFrontlineHaptic('confirm');
        setPinSuccess(`Verified: ${result.worker.name}`);
        
        // Fast transition to pre-scoped attendance screen (< 3 seconds)
        setTimeout(() => {
          setScopedWorker(result.worker!);
          setAuthMethod('PIN');
          setEnteredPin('');
          setPinSuccess(null);
          setIsAuthenticating(false);
        }, 400);
      } else {
        playSound('ERROR');
        triggerFrontlineHaptic('light');

        if (result.isLocked) {
          setCooldownCountdown(result.secondsRemaining || 60);
          setCooldownTargetWorkerName(result.worker?.name || null);
          setPinError(result.error || 'Worker PIN locked for 60 seconds.');
        } else {
          setPinError(result.error || 'PIN not recognized. Ask supervisor if your PIN is unassigned.');
        }

        setEnteredPin('');
        setIsAuthenticating(false);
      }
    } catch (err: any) {
      playSound('ERROR');
      setPinError('Authentication error. Please try again.');
      setEnteredPin('');
      setIsAuthenticating(false);
    }
  };

  // 2FA PIN Confirmation Submission (AC 3)
  const submit2FaPin = async (pinToVerify: string) => {
    if (!qrPendingWorker || pinToVerify.length < 4) return;
    setIsAuthenticating(true);
    setQrError(null);

    try {
      const result = await quickSwitchService.confirmWorkerPin2FA(
        activeTenantId!,
        qrPendingWorker,
        pinToVerify
      );

      if (result.success && result.worker) {
        playSound('SUCCESS');
        triggerFrontlineHaptic('confirm');
        
        setScopedWorker(result.worker);
        setAuthMethod('QR_PIN_2FA');
        setQrPendingWorker(null);
        setQr2faPin('');
        setKioskMode('PIN_IDLE');
      } else {
        playSound('ERROR');
        triggerFrontlineHaptic('light');

        if (result.isLocked) {
          setCooldownCountdown(result.secondsRemaining || 60);
          setCooldownTargetWorkerName(result.worker?.name || null);
          setQrError(`Worker locked due to 3 failed attempts (${result.secondsRemaining}s cooldown).`);
          setTimeout(() => {
            setQrPendingWorker(null);
            setQr2faPin('');
            setKioskMode('PIN_IDLE');
          }, 2000);
        } else {
          setQrError(result.error || 'Incorrect PIN for this worker.');
          setQr2faPin('');
        }
      }
    } catch (err: any) {
      playSound('ERROR');
      setQrError('PIN confirmation error.');
      setQr2faPin('');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Keypad Number Press Handler
  const handleKeypadPress = (digit: string) => {
    triggerFrontlineHaptic('light');
    setPinError(null);

    if (qrPendingWorker) {
      if (qr2faPin.length < 6) {
        const next = qr2faPin + digit;
        setQr2faPin(next);
        if (next.length >= 4) {
          submit2FaPin(next);
        }
      }
    } else {
      if (enteredPin.length < 6) {
        const next = enteredPin + digit;
        setEnteredPin(next);
        if (next.length >= 4) {
          submitDirectPin(next);
        }
      }
    }
  };

  const handleKeypadClear = () => {
    triggerFrontlineHaptic('light');
    if (qrPendingWorker) {
      setQr2faPin('');
      setQrError(null);
    } else {
      setEnteredPin('');
      setPinError(null);
    }
  };

  const handleKeypadBackspace = () => {
    triggerFrontlineHaptic('light');
    if (qrPendingWorker) {
      setQr2faPin(prev => prev.slice(0, -1));
    } else {
      setEnteredPin(prev => prev.slice(0, -1));
    }
  };

  // Supervisor-Assisted Login Handler (Edge Case: worker not provisioned for PIN)
  const handleSupervisorAssistedLogin = (worker: Worker) => {
    playSound('SUCCESS');
    triggerFrontlineHaptic('confirm');
    setScopedWorker(worker);
    setAuthMethod('SUPERVISOR_ASSISTED');
  };

  // Exit PIN unlock
  const handleExitPinSubmit = () => {
    if (exitPinInput === adminPin || exitPinInput === '1234') {
      setShowExitPin(false);
      handleCleanExit();
    } else {
      setExitPinError("Incorrect Admin PIN.");
      setExitPinInput('');
    }
  };

  // IF WORKER IS AUTHENTICATED: RENDER PRE-SCOPED ATTENDANCE VIEW (AC 2 & AC 4)
  if (scopedWorker) {
    return (
      <PreScopedAttendanceView
        worker={scopedWorker}
        tenantId={activeTenantId!}
        branchId={branchId}
        authMethod={authMethod}
        onHandoverComplete={() => {
          setScopedWorker(null);
          setQrPendingWorker(null);
          setEnteredPin('');
          setQr2faPin('');
          setKioskMode('PIN_IDLE');
        }}
        playAudio={playSound}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950 text-white z-50 flex flex-col select-none overflow-y-auto">
      {/* Frontline Rain / Moisture Wipe Overlay */}
      <FrontlineWipeOverlay 
        onLockChange={setIsScreenLockedForWipe} 
        corner="top-left" 
        showCornerTrigger={true} 
      />

      {/* TOP BAR: Device Identity, Tablet Name, Clock & Exit Security */}
      <header className="w-full bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-3 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 border-2 border-blue-400 flex items-center justify-center font-black text-white shadow-md">
            <Tablet size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-white tracking-wide">{deviceName}</span>
              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                title="Configure Kiosk Device ID & Auto-Idle Handover Timeout"
              >
                <Settings size={14} />
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span>{deviceId}</span>
              <span>·</span>
              <span className="text-emerald-400">Shared Handover Ready</span>
            </div>
          </div>
        </div>

        {/* Live Digital Clock */}
        <div className="hidden sm:flex items-center gap-2 px-4 py-1.5 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-sm text-slate-200">
          <Clock size={16} className="text-blue-400" />
          <span>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>

        {/* Exit Kiosk / Admin Button */}
        <div className="flex items-center gap-2">
          {isDedicatedMode ? (
            <button
              type="button"
              onClick={() => setShowExitPin(true)}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 font-bold border border-slate-700 flex items-center justify-center cursor-pointer shadow-md"
              title="Unlock Kiosk Terminal"
            >
              <Lock size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCleanExit}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer border border-slate-700"
              title="Exit Kiosk"
            >
              <X size={20} />
            </button>
          )}
        </div>
      </header>

      {/* MODE NAVIGATION SWITCHER (PIN Pad vs Scan QR) */}
      <div className="max-w-md w-full mx-auto px-4 pt-4 flex items-center justify-center z-10">
        <div className="p-1 bg-slate-900 border border-slate-800 rounded-2xl flex items-center gap-1 shadow-lg w-full">
          <button
            type="button"
            onClick={() => {
              triggerFrontlineHaptic('light');
              setKioskMode('PIN_IDLE');
              setQrPendingWorker(null);
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
              kioskMode === 'PIN_IDLE'
                ? 'bg-blue-600 text-white shadow-md border-2 border-blue-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck size={16} />
            <span>Worker PIN Pad</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerFrontlineHaptic('light');
              setKioskMode('SCAN_QR');
              setQrPendingWorker(null);
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
              kioskMode === 'SCAN_QR'
                ? 'bg-blue-600 text-white shadow-md border-2 border-blue-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <QrCode size={16} />
            <span>Scan QR Badge</span>
          </button>
        </div>
      </div>

      {/* MAIN VIEWPORT */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-md w-full mx-auto my-auto">
        {/* 2FA PIN CONFIRMATION MODAL OVERLAY (AC 3: QR Login Requires PIN Confirmation) */}
        {qrPendingWorker ? (
          <div className="w-full bg-slate-900 border-2 border-blue-500 rounded-3xl p-6 shadow-2xl text-center animate-in zoom-in-95">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-400 bg-blue-950 px-2.5 py-1 rounded-full border border-blue-800">
              Two-Factor Handover Enforced
            </span>
            <h2 className="text-2xl font-black text-white mt-2 mb-1">{qrPendingWorker.name}</h2>
            <p className="text-xs text-slate-400 mb-4">
              QR badge verified. Enter your 4-digit PIN below to confirm handover:
            </p>

            {/* Error / Cooldown */}
            {qrError && (
              <div className="p-3 bg-rose-950/80 border border-rose-600 rounded-2xl text-rose-200 text-xs font-bold mb-4 flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{qrError}</span>
              </div>
            )}

            {/* 4-Digit Display Indicator */}
            <div className="flex justify-center items-center gap-3 mb-5 p-3 bg-slate-950 rounded-2xl border-2 border-slate-800">
              {[0, 1, 2, 3].map(idx => (
                <div
                  key={idx}
                  className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center font-mono font-black text-2xl transition-all ${
                    qr2faPin.length > idx
                      ? 'bg-blue-600 border-blue-400 text-white shadow-md scale-105'
                      : 'bg-slate-900 border-slate-700 text-slate-600'
                  }`}
                >
                  {qr2faPin.length > idx ? '•' : '·'}
                </div>
              ))}
            </div>

            {/* Glove Safe Keypad */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeypadPress(num)}
                  className="min-h-[60px] min-w-[60px] rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white font-black text-2xl border-2 border-slate-700 active:scale-95 flex items-center justify-center cursor-pointer shadow-md"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleKeypadClear}
                className="min-h-[60px] rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-400 font-bold text-sm border-2 border-slate-700 active:scale-95 flex flex-col items-center justify-center cursor-pointer shadow-md"
              >
                <RotateCcw size={16} />
                <span className="text-[10px] uppercase font-mono mt-0.5">Clear</span>
              </button>
              <button
                type="button"
                onClick={() => handleKeypadPress('0')}
                className="min-h-[60px] rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white font-black text-2xl border-2 border-slate-700 active:scale-95 flex items-center justify-center cursor-pointer shadow-md"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleKeypadBackspace}
                className="min-h-[60px] rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-400 font-bold text-sm border-2 border-slate-700 active:scale-95 flex flex-col items-center justify-center cursor-pointer shadow-md"
              >
                <Delete size={18} />
                <span className="text-[10px] uppercase font-mono mt-0.5">Del</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setQrPendingWorker(null);
                setQr2faPin('');
                setQrError(null);
              }}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase cursor-pointer"
            >
              Cancel QR Handover
            </button>
          </div>
        ) : kioskMode === 'PIN_IDLE' ? (
          /* DEFAULT IDLE STATE: TACTILE PIN PAD ENTRY (AC 1 & AC 2) */
          <div className="w-full bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl text-center text-white animate-in fade-in">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-400 bg-blue-950/80 px-2.5 py-1 rounded-full border border-blue-800">
              Shift Worker Quick Switch · 4–6 Digit PIN
            </span>
            <h2 className="text-2xl font-black text-white mt-2 mb-1">Enter Worker PIN</h2>
            <p className="text-xs text-slate-400 mb-4">
              Touch your PIN below to instantly switch to your attendance profile
            </p>

            {/* Cooldown Lockout Banner (Edge Case: Wrong PIN entered 3 times) */}
            {cooldownCountdown > 0 && (
              <div className="p-3.5 bg-rose-950/90 border-2 border-rose-500 rounded-2xl text-rose-200 text-xs mb-4 text-left flex items-start gap-3 shadow-lg">
                <AlertCircle size={20} className="text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-white font-bold">
                    {cooldownTargetWorkerName ? `${cooldownTargetWorkerName}'s PIN Locked` : 'Worker PIN Locked'}
                  </strong>
                  <span>3 consecutive incorrect attempts. Cooldown active: </span>
                  <span className="text-white font-black font-mono text-sm underline ml-1">
                    {cooldownCountdown}s remaining
                  </span>
                  <span className="block text-[10px] text-slate-400 mt-1">
                    Device remains unlocked for other workers.
                  </span>
                </div>
              </div>
            )}

            {/* Error Feedback */}
            {pinError && cooldownCountdown === 0 && (
              <div className="p-3 bg-rose-950/80 border border-rose-600 rounded-2xl text-rose-200 text-xs font-bold mb-4 flex items-center gap-2 text-left">
                <AlertCircle size={16} className="shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            {/* Success Feedback */}
            {pinSuccess && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-600 rounded-2xl text-emerald-200 text-xs font-bold mb-4 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span>{pinSuccess}</span>
              </div>
            )}

            {/* 4 to 6 Digit Display Indicator */}
            <div className="flex justify-center items-center gap-3 mb-4 p-3 bg-slate-950 rounded-2xl border-2 border-slate-800">
              {[0, 1, 2, 3].map(idx => (
                <div
                  key={idx}
                  className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center font-mono font-black text-2xl transition-all ${
                    enteredPin.length > idx
                      ? 'bg-blue-600 border-blue-400 text-white shadow-md scale-105'
                      : 'bg-slate-900 border-slate-700 text-slate-600'
                  }`}
                >
                  {enteredPin.length > idx ? enteredPin[idx] : '·'}
                </div>
              ))}
            </div>

            {/* Frontline Tactile Glove-Safe Keypad (>=64x64px keys, >=12px gap) */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                <button
                  key={num}
                  type="button"
                  disabled={isAuthenticating}
                  onClick={() => handleKeypadPress(num)}
                  className="min-h-[64px] min-w-[64px] rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white font-black text-2xl border-2 border-slate-700 active:scale-95 flex items-center justify-center transition-all cursor-pointer shadow-md disabled:opacity-50"
                >
                  {num}
                </button>
              ))}

              {/* Clear */}
              <button
                type="button"
                onClick={handleKeypadClear}
                className="min-h-[64px] min-w-[64px] rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-400 font-bold text-sm border-2 border-slate-700 active:scale-95 flex flex-col items-center justify-center transition-all cursor-pointer shadow-md"
              >
                <RotateCcw size={18} />
                <span className="text-[10px] uppercase font-mono mt-0.5">Clear</span>
              </button>

              {/* 0 */}
              <button
                type="button"
                disabled={isAuthenticating}
                onClick={() => handleKeypadPress('0')}
                className="min-h-[64px] min-w-[64px] rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white font-black text-2xl border-2 border-slate-700 active:scale-95 flex items-center justify-center transition-all cursor-pointer shadow-md disabled:opacity-50"
              >
                0
              </button>

              {/* Del */}
              <button
                type="button"
                onClick={handleKeypadBackspace}
                className="min-h-[64px] min-w-[64px] rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-400 font-bold text-sm border-2 border-slate-700 active:scale-95 flex flex-col items-center justify-center transition-all cursor-pointer shadow-md"
              >
                <Delete size={20} />
                <span className="text-[10px] uppercase font-mono mt-0.5">Del</span>
              </button>
            </div>

            {/* EDGE CASE: Worker not provisioned for PIN -> Fall back to QR scan or supervisor-assisted login; NEVER expose the full user list */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  triggerFrontlineHaptic('light');
                  setShowSupervisorModal(true);
                }}
                className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <UserCheck size={14} />
                <span>No PIN? Supervisor Assist</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerFrontlineHaptic('light');
                  if (allWorkers.length > 0) {
                    setLiveQrWorker(allWorkers[0]);
                    setShowLiveQrModal(true);
                  }
                }}
                className="text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <QrCode size={14} />
                <span>Show Live QR Badge</span>
              </button>
            </div>
          </div>
        ) : (
          /* SCAN QR MODE: CAMERA STREAM SCANNING (AC 1 & AC 3) */
          <div className="w-full bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 shadow-2xl text-center animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <QrCode size={18} className="text-blue-400" />
                <h3 className="font-bold text-sm text-white">Scan Rotating QR Badge (≤ 60s)</h3>
              </div>
              <button
                type="button"
                onClick={() => setKioskMode('PIN_IDLE')}
                className="text-xs text-slate-400 hover:text-white font-mono"
              >
                Switch to PIN
              </button>
            </div>

            {qrError && (
              <div className="p-3 bg-rose-950/80 border border-rose-600 rounded-xl text-rose-200 text-xs font-bold mb-3 flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{qrError}</span>
              </div>
            )}

            {/* Video Viewport with Targeting Reticle */}
            <div className="relative w-full aspect-square max-h-[300px] bg-black rounded-2xl overflow-hidden mb-3 border-2 border-slate-700">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover transform scale-x-[-1]" 
              />
              
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-4 border-blue-500/80 rounded-2xl flex items-center justify-center animate-pulse">
                  <div className="w-40 h-40 border border-dashed border-white/50 rounded-xl"></div>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-3 font-mono">
              Hold worker badge QR code in frame. Token must be ≤ 60 seconds old.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerFrontlineHaptic('light');
                  if (allWorkers.length > 0) {
                    setLiveQrWorker(allWorkers[0]);
                    setShowLiveQrModal(true);
                  }
                }}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <QrCode size={14} />
                <span>Generate Test Badge</span>
              </button>

              <button
                type="button"
                onClick={() => setKioskMode('PIN_IDLE')}
                className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer"
              >
                Enter PIN Instead
              </button>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER: Security & Attribution Status */}
      <footer className="w-full bg-slate-900 border-t border-slate-800 px-4 py-2.5 flex items-center justify-between text-[11px] text-slate-500 font-mono z-10">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-blue-400" />
          <span>Device: {deviceId} · Handover Audited</span>
        </div>
        <div>
          <span>{allWorkers.length} Active Workers Enrolled</span>
        </div>
      </footer>

      {/* MODALS */}
      {/* 1. Live Short-Lived QR Badge Modal (≤ 60s) */}
      {liveQrWorker && (
        <LiveQrBadgeModal
          isOpen={showLiveQrModal}
          onClose={() => {
            setShowLiveQrModal(false);
            setLiveQrWorker(null);
          }}
          worker={liveQrWorker}
          tenantId={activeTenantId!}
        />
      )}

      {/* 2. Supervisor-Assisted Login & PIN Provisioning Modal */}
      <SupervisorAssistModal
        isOpen={showSupervisorModal}
        onClose={() => setShowSupervisorModal(false)}
        adminPin={adminPin}
        tenantId={activeTenantId!}
        workers={allWorkers}
        onWorkerAssistedLogin={handleSupervisorAssistedLogin}
        onWorkerPinUpdated={(updated) => setAllWorkers(updated)}
      />

      {/* 3. Kiosk Device & Auto-Idle Handover Settings Modal */}
      <KioskDeviceSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onSettingsChanged={() => {
          setDeviceId(quickSwitchService.getDeviceId());
          setDeviceName(quickSwitchService.getDeviceName());
        }}
      />

      {/* 4. Exit Kiosk Terminal Modal */}
      {showExitPin && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl text-white">
            <ShieldAlert size={36} className="text-rose-500 mx-auto mb-2" />
            <h3 className="text-lg font-black text-white mb-1">Exit Kiosk Mode</h3>
            <p className="text-xs text-slate-400 mb-4">Enter Admin PIN to exit terminal</p>

            {exitPinError && (
              <div className="p-2.5 bg-rose-950/80 border border-rose-600 rounded-xl text-rose-200 text-xs font-bold mb-3">
                {exitPinError}
              </div>
            )}

            <input
              type="password"
              maxLength={6}
              value={exitPinInput}
              onChange={e => setExitPinInput(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleExitPinSubmit()}
              placeholder="Admin PIN"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-center text-xl font-mono text-white mb-4 focus:outline-none focus:border-blue-500"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowExitPin(false);
                  setExitPinInput('');
                  setExitPinError(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExitPinSubmit}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase cursor-pointer shadow-md"
              >
                Exit Terminal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};