import React, { useRef, useEffect, useState } from 'react';
import { X, LogIn, LogOut, Clock, Loader2, ScanFace, AlertCircle, ShieldAlert, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { faceService } from '../services/faceService';
import { attendanceLogic } from '../services/attendanceLogic';
import { Worker, AttendanceRecord, OrgSettings } from '../types/index';
import { useBackButton } from '../hooks/useBackButton';
import { geoUtils } from '../utils/geo';

interface Props { 
  onExit: () => void; 
  branchId: string; 
  isDedicatedMode: boolean;
  tenantId?: string; // Provided if dedicated
  adminPin?: string; // Provided if dedicated
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
      oscillator.frequency.setValueAtTime(200, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.4);
    }
  } catch (e) {
    console.warn("Audio playback failed or is not supported", e);
  }
};

export const AttendanceKioskScreen: React.FC<Props> = ({ onExit, branchId, isDedicatedMode, tenantId: propsTenantId, adminPin }) => {
  const { profile } = useAuth();
  
  const activeTenantId = isDedicatedMode ? propsTenantId : profile?.tenantId;

  const videoRef = useRef<HTMLVideoElement>(null);
  
  const processingRef = useRef(false); 
  const workersRef = useRef<Worker[]>([]);
  const settingsRef = useRef<OrgSettings>({ shifts: [], enableBreakTracking: false });
  
  const [livenessState, setLivenessState] = useState<'SCANNING' | 'CHALLENGE'>('SCANNING');
  const targetWorkerRef = useRef<Worker | null>(null);
  const livenessTimerRef = useRef<number>(0);
  const failedAttemptsRef = useRef<Record<string, number>>({});

  const [feedback, setFeedback] = useState("Initializing System...");
  const [modelsLoaded, setModelsLoaded] = useState(false);
  
  const [detectedWorker, setDetectedWorker] = useState<{worker: Worker, action: 'IN' | 'OUT'} | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);

  const [recentPunches, setRecentPunches] = useState<{name: string, type: 'IN'|'OUT', time: Date, status: 'SUCCESS'|'ERROR'}[]>([]);
  const [showExitPin, setShowExitPin] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');

  useBackButton(() => {
    if (isDedicatedMode) return true; 
    onExit();
    return true; 
  });

  useEffect(() => {
    const init = async () => {
      try {
        console.log("Loading Face Models...");
        await faceService.loadModels();
        setModelsLoaded(true);

        if (activeTenantId) {
            setFeedback("Loading Local Branch Faces...");
            const [w, settings] = await Promise.all([
               dbService.getWorkers(activeTenantId),
               dbService.getOrgSettings(activeTenantId)
            ]);
            
            const targetBranch = branchId || 'default';

            const validWorkers = w.map(worker => {
                let fd = worker.faceDescriptor;
                if (fd && typeof fd === 'object' && !Array.isArray(fd)) {
                    fd = Object.values(fd) as number[];
                }
                return { ...worker, faceDescriptor: fd };
            }).filter(worker => 
                 worker.faceDescriptor && 
                 worker.faceDescriptor.length > 0 && 
                 (worker.branchId || 'default') === targetBranch
            );
            
            workersRef.current = validWorkers;
            settingsRef.current = settings; 
            
            if (validWorkers.length === 0) {
                setFeedback("No registered faces for this Branch.");
            } else {
                setFeedback(`Ready. Loaded ${validWorkers.length} faces.`);
            }
        }
      } catch (e) {
        console.error("Init Error:", e);
        setFeedback("System Error: Check Console");
      }
    };
    init();

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } })
      .then(stream => { 
          if(videoRef.current) videoRef.current.srcObject = stream; 
      })
      .catch(err => {
          console.error("Camera Error:", err);
          setFeedback("Camera Blocked. Check Permissions.");
      });
      
    return () => {
        processingRef.current = false;
    };
  }, [activeTenantId, branchId]);

  useEffect(() => {
    if (!modelsLoaded || showExitPin) return;

    const scanInterval = setInterval(async () => {
       if (!videoRef.current || videoRef.current.paused || videoRef.current.ended || processingRef.current || workersRef.current.length === 0) {
           return;
       }

       try {
           const matchResult = await faceService.findMatchAndLiveness(videoRef.current, workersRef.current);
           
           if (!matchResult) {
               if (livenessState === 'CHALLENGE') {
                   setLivenessState('SCANNING');
                   setFeedback("Look at Camera");
                   targetWorkerRef.current = null;
               }
               return;
           }

           if (livenessState === 'SCANNING') {
               if (settingsRef.current?.strictLiveness) {
                   setLivenessState('CHALLENGE');
                   targetWorkerRef.current = matchResult.worker;
                   livenessTimerRef.current = Date.now();
                   setFeedback(`Hi ${matchResult.worker.name.split(' ')[0]}, please BLINK to verify...`);
                   playSound('SUCCESS');
               } else {
                   await handlePunch(matchResult.worker);
               }
           } 
           else if (livenessState === 'CHALLENGE' && targetWorkerRef.current) {
               if (matchResult.worker.id === targetWorkerRef.current.id) {
                   if (matchResult.hasBlinked) {
                       setFeedback("Liveness Verified!");
                       setLivenessState('SCANNING');
                       await handlePunch(matchResult.worker);
                       targetWorkerRef.current = null;
                   } 
                   else if (Date.now() - livenessTimerRef.current > 3000) {
                       handleSpoofFailure(targetWorkerRef.current);
                   }
               } else {
                   setLivenessState('SCANNING');
                   setFeedback("Look at Camera");
               }
           }

       } catch (e) {
           console.error("Scan Loop Error", e);
           processingRef.current = false;
       }
    }, 150); 

    return () => clearInterval(scanInterval);
  }, [modelsLoaded, livenessState, showExitPin]);

  const handleSpoofFailure = async (worker: Worker) => {
    processingRef.current = true;
    playSound('ERROR');
    
    const fails = (failedAttemptsRef.current[worker.id] || 0) + 1;
    failedAttemptsRef.current[worker.id] = fails;

    if (fails >= 3) {
        setFeedback("🚨 SPOOFING ATTEMPT LOGGED!");
        
        let base64Image = "";
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0);
                base64Image = canvas.toDataURL('image/jpeg', 0.5); 
            }
        }

        if (activeTenantId) {
            await dbService.addNotification({
                tenantId: activeTenantId,
                title: "⚠️ Security Alert: Liveness Failed",
                message: `Multiple failed liveness checks for ${worker.name}. This may be a proxy punch attempt.`,
                imageUrl: base64Image,
                type: 'ALERT',
                createdAt: new Date().toISOString(),
                read: false
            });
        }

        failedAttemptsRef.current[worker.id] = 0;

        setTimeout(() => {
            setLivenessState('SCANNING');
            setFeedback("Look at Camera");
            processingRef.current = false;
            targetWorkerRef.current = null;
        }, 3000);
    } else {
        setFeedback("Verification Failed. Please blink clearly.");
        setTimeout(() => {
            setLivenessState('SCANNING');
            setFeedback("Look at Camera");
            processingRef.current = false;
            targetWorkerRef.current = null;
        }, 2000);
    }
  };

  const handlePunch = async (worker: Worker) => {
    processingRef.current = true;
    setFeedback(`Identifying ${worker.name}...`);

    try {
        const today = new Date().toISOString().split('T')[0];
        const recordId = `${activeTenantId}_${worker.id}_${today}`;
        
        const existingDocs = await dbService.getTodayAttendance(activeTenantId!); 
        const existingRecord = existingDocs.find(r => r.id === recordId);

        let punchType: 'IN' | 'OUT' = 'IN';
        if (existingRecord?.timeline && existingRecord.timeline.length > 0) {
            const lastPunch = existingRecord.timeline[existingRecord.timeline.length - 1];
            punchType = lastPunch.type === 'IN' ? 'OUT' : 'IN';
        }

        const now = new Date();
        
        if (existingRecord?.timeline && existingRecord.timeline.length > 0) {
            const lastPunchTime = new Date(existingRecord.timeline[existingRecord.timeline.length - 1].timestamp);
            const diffSeconds = (now.getTime() - lastPunchTime.getTime()) / 1000;
            
            if (diffSeconds < 10) { 
                console.log("Cooldown active");
                playSound('ERROR'); 
                setErrorFeedback(`Wait ${Math.ceil(10 - diffSeconds)}s...`);
                
                setTimeout(() => { 
                    setErrorFeedback(null); 
                    setFeedback("Look at Camera"); 
                    processingRef.current = false; 
                }, 2000);
                return;
            }
        }

        // --- FIXED: TS Error by extracting rawType before casting ---
        if (punchType === 'IN' && existingRecord?.status === 'ON_LEAVE' && existingRecord.leaveInfo?.isPaid) {
            const rawType = existingRecord.leaveInfo.type.toLowerCase();
            
            if (rawType !== 'lwp' && worker.leaveBalances) {
                const lType = rawType as 'cl' | 'sl' | 'pl';
                const currentBal = worker.leaveBalances[lType] ?? 0;
                
                // Refund 1 day
                await dbService.updateWorker(worker.id, {
                    leaveBalances: {
                        ...worker.leaveBalances,
                        [lType]: currentBal + 1
                    }
                });
                
                await dbService.addNotification({
                    tenantId: activeTenantId!, 
                    title: "Leave Automatically Cancelled",
                    message: `${worker.name} punched in today, cancelling their scheduled ${lType.toUpperCase()} leave. 1 day refunded to balance.`,
                    type: 'INFO', 
                    createdAt: new Date().toISOString(), 
                    read: false
                });
            }
        }
        // ----------------------------------

        let currentLocation: { lat: number; lng: number } | undefined;
        let isOutOfGeofence = false;

        if (navigator.geolocation) {
            try {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
                });
                currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                
                const { branches, baseLocation } = settingsRef.current;
                const branch = branches?.find(b => b.id === branchId) || branches?.[0];
                const targetLoc = branch?.location || baseLocation;
                
                if (targetLoc) {
                    const dist = geoUtils.getDistanceInMeters(
                        currentLocation.lat, currentLocation.lng,
                        targetLoc.lat, targetLoc.lng
                    );
                    isOutOfGeofence = dist > (targetLoc.radius || 200);
                }
            } catch (err) {
                console.warn("Could not get location on Kiosk", err);
            }
        }

        const currentTimeline = existingRecord?.timeline || [];
        const newTimeline = [...currentTimeline, { 
            timestamp: now.toISOString(), 
            type: punchType, 
            device: 'Kiosk',
            location: currentLocation,
            isOutOfGeofence 
        }];

        const { shifts, enableBreakTracking } = settingsRef.current;
        const shift = shifts.find(s => s.id === worker.shiftId) || shifts[0];
        
        if (!shift) throw new Error("No Shift Configuration Found");

        const lateCount = await dbService.getMonthlyLateCount(activeTenantId!, worker.id);

        const baseRecord: AttendanceRecord = {
            id: recordId,
            tenantId: activeTenantId!,
            workerId: worker.id,
            workerName: worker.name,
            date: today,
            shiftId: worker.shiftId || 'default',
            timeline: newTimeline,
            status: 'ABSENT', 
            lateStatus: existingRecord?.lateStatus || { isLate: false, lateByMins: 0, penaltyApplied: false },
            hours: { gross: 0, net: 0, overtime: 0 }
        };

        // Clear any previous leave info since they actually punched in
        if (baseRecord.leaveInfo) {
            delete baseRecord.leaveInfo;
        }

        const finalRecord = attendanceLogic.processDailyStatus(baseRecord, shift, lateCount, enableBreakTracking, worker, settingsRef.current);

        await dbService.markAttendance(finalRecord);

        if (isOutOfGeofence) {
            await dbService.addNotification({
                tenantId: activeTenantId!,
                title: 'Geofence Violation Alert',
                message: `${worker.name} punched ${punchType} via Kiosk outside the allowed factory radius.`,
                type: 'WARNING',
                createdAt: new Date().toISOString(),
                read: false
            });
        }
        
        playSound('SUCCESS'); 

        setRecentPunches(prev => [{name: worker.name, type: punchType, time: new Date(), status: 'SUCCESS' as const}, ...prev].slice(0, 10));

        setDetectedWorker({ worker, action: punchType });
        setFeedback(punchType === 'IN' ? "Welcome!" : "Goodbye!");

        setTimeout(() => {
            setDetectedWorker(null);
            processingRef.current = false; 
            if (!isDedicatedMode) onExit(); 
        }, 2000);

    } catch (e: any) {
        console.error("Handle Punch Error", e);
        playSound('ERROR'); 
        setFeedback("System Error: " + (e.message || "Unknown"));
        processingRef.current = false;
        setTimeout(() => setFeedback("Look at Camera"), 2000);
    }
  };

  const submitExitPin = () => {
    if (enteredPin === adminPin) {
      onExit();
    } else {
      alert("Incorrect PIN");
      setShowExitPin(false);
      setEnteredPin('');
      processingRef.current = false;
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col md:flex-row">
       {isDedicatedMode && (
          <button 
            onClick={() => {
              setShowExitPin(true);
              processingRef.current = true; 
            }}
            className="absolute top-6 right-6 z-50 p-3 rounded-full bg-black/20 text-white/30 hover:bg-black/50 hover:text-white/80 transition-all backdrop-blur-md border border-white/5"
          >
            <Lock size={20} />
          </button>
       )}

       {!isDedicatedMode && (
         <div className="absolute top-0 w-full p-4 flex justify-between z-10">
           <div className="bg-black/40 px-4 py-2 rounded-full text-white font-mono text-sm backdrop-blur-md">
               {new Date().toLocaleTimeString()}
           </div>
           <button onClick={onExit} className="bg-white/20 p-2 rounded-full text-white hover:bg-white/30 transition-colors"><X/></button>
         </div>
       )}

      <div className={`relative h-1/2 md:h-full bg-gray-900 border-b md:border-b-0 md:border-r border-white/10 ${isDedicatedMode ? 'w-full md:w-2/3' : 'w-full'}`}>
         <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
         
         <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
             <div className={`w-72 h-72 border-4 rounded-full flex items-center justify-center transition-colors duration-300 ${livenessState === 'CHALLENGE' ? 'border-purple-500' : 'border-white/30'}`}>
                 <div className="w-64 h-64 border-2 border-dashed border-white/50 rounded-full opacity-50"></div>
             </div>
             <p className={`absolute mt-80 text-white/90 text-sm font-bold px-4 py-2 rounded-full backdrop-blur-sm shadow-lg transition-colors duration-300 ${livenessState === 'CHALLENGE' ? 'bg-purple-600' : 'bg-black/40'}`}>
                 {livenessState === 'CHALLENGE' ? "Keep face in circle & Blink" : "Place face within circle"}
             </p>
         </div>

         <div className="absolute bottom-6 w-full text-center pointer-events-none z-10">
           <div className={`backdrop-blur-md inline-flex items-center px-8 py-4 rounded-full border shadow-lg transition-all duration-300 ${livenessState === 'CHALLENGE' ? 'bg-purple-900/80 border-purple-500' : 'bg-black/60 border-white/20'}`}>
              {!modelsLoaded ? (
                  <Loader2 className="animate-spin text-white mr-3" />
              ) : livenessState === 'CHALLENGE' ? (
                  <ScanFace className="text-purple-300 mr-3 animate-bounce" size={28} />
              ) : (
                  <ScanFace className="text-white mr-3 animate-pulse" />
              )}
              <p className="text-white text-xl font-bold tracking-wide">{feedback}</p>
           </div>
         </div>
      </div>

      {isDedicatedMode && (
         <div className="w-full md:w-1/3 h-1/2 md:h-full bg-gray-950 flex flex-col z-20">
            <div className="p-6 border-b border-gray-800 bg-black">
               <h2 className="text-xl font-bold text-white tracking-wide">Live Activity</h2>
               <p className="text-gray-400 text-sm mt-1 flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                  System Active & Monitoring
               </p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
               {recentPunches.length === 0 ? (
                  <div className="h-full flex flex-col justify-center items-center text-gray-500">
                     <Clock size={48} className="mb-4 opacity-20"/>
                     <p>Awaiting first scan...</p>
                  </div>
               ) : (
                  recentPunches.map((punch, idx) => (
                     <div key={idx} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center animate-in slide-in-from-left-4 fade-in">
                        <div className={`p-3 rounded-xl mr-4 ${punch.type === 'IN' ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
                           {punch.type === 'IN' ? <LogIn size={20}/> : <LogOut size={20}/>}
                        </div>
                        <div className="flex-1">
                           <h4 className="text-white font-bold">{punch.name}</h4>
                           <p className="text-gray-400 text-xs">Punched {punch.type} • {punch.time.toLocaleTimeString()}</p>
                        </div>
                     </div>
                  ))
               )}
            </div>
         </div>
      )}
      
      {detectedWorker && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 animate-in fade-in zoom-in duration-300 z-30">
              <div className="bg-white p-8 rounded-3xl text-center shadow-2xl max-w-sm w-full mx-4">
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 ${
                      detectedWorker.action === 'IN' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                  }`}>
                     {detectedWorker.action === 'IN' ? <LogIn size={48}/> : <LogOut size={48}/>}
                  </div>
                  <h2 className="text-3xl font-bold text-gray-800">{detectedWorker.worker.name}</h2>
                  <p className="text-xl font-medium text-gray-600 mt-2">
                      {detectedWorker.action === 'IN' ? 'Check In' : 'Check Out'} Successful
                  </p>
                  <div className="mt-6 flex items-center justify-center text-gray-400 text-sm">
                      <Clock size={16} className="mr-2"/> 
                      {new Date().toLocaleTimeString()}
                  </div>
              </div>
          </div>
      )}

      {errorFeedback && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 animate-in fade-in z-30">
              <div className="bg-white p-6 rounded-2xl text-center shadow-xl max-w-xs mx-4 border-l-4 border-yellow-400">
                  <AlertCircle className="mx-auto text-yellow-500 mb-3" size={40} />
                  <h3 className="font-bold text-gray-800 text-lg">Wait a moment</h3>
                  <p className="text-gray-600 mt-1">{errorFeedback}</p>
              </div>
          </div>
      )}

      {showExitPin && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-50">
             <div className="bg-white p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl animate-in zoom-in">
                 <ShieldAlert size={40} className="text-red-500 mx-auto mb-4"/>
                 <h3 className="text-xl font-bold mb-2">Exit Kiosk Mode</h3>
                 <p className="text-sm text-gray-500 mb-6">Enter Admin PIN to close terminal</p>
                 <input 
                    type="password" 
                    maxLength={4} 
                    value={enteredPin} 
                    onChange={(e)=>setEnteredPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center text-3xl tracking-widest p-4 bg-gray-100 border-none rounded-xl mb-6 focus:ring-2 focus:ring-red-500 outline-none" 
                    autoFocus
                 />
                 <div className="flex space-x-3">
                    <button 
                      onClick={() => { setShowExitPin(false); processingRef.current = false; setEnteredPin(''); }} 
                      className="flex-1 p-3 bg-gray-200 text-gray-800 font-bold rounded-xl transition-colors hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={submitExitPin} 
                      className="flex-1 p-3 bg-red-600 text-white font-bold rounded-xl transition-colors hover:bg-red-700"
                    >
                      Unlock
                    </button>
                 </div>
             </div>
          </div>
      )}
    </div>
  );
};