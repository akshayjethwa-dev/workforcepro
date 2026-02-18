import React, { useRef, useEffect, useState } from 'react';
import { X, LogIn, LogOut, Clock, Loader2, ScanFace, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { faceService } from '../services/faceService';
import { attendanceLogic } from '../services/attendanceLogic';
import { Worker, ShiftConfig, AttendanceRecord, OrgSettings } from '../types/index';

interface Props { onExit: () => void; }

export const AttendanceKioskScreen: React.FC<Props> = ({ onExit }) => {
  const { profile } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Refs for State (Crucial for setInterval loops to avoid stale closures)
  const processingRef = useRef(false); 
  const workersRef = useRef<Worker[]>([]);
  // We store the full settings object in a Ref
  const settingsRef = useRef<OrgSettings>({ shifts: [], enableBreakTracking: false });
  
  const [feedback, setFeedback] = useState("Initializing System...");
  const [modelsLoaded, setModelsLoaded] = useState(false);
  
  // UI States
  const [detectedWorker, setDetectedWorker] = useState<{worker: Worker, action: 'IN' | 'OUT'} | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);

  // 1. INITIAL SETUP
  useEffect(() => {
    const init = async () => {
      try {
        console.log("Loading Face Models...");
        await faceService.loadModels();
        setModelsLoaded(true);
        console.log("Models Loaded.");

        if (profile?.tenantId) {
            setFeedback("Fetching Workers...");
            // Fetch Workers AND Org Settings (Logic Rules)
            const [w, settings] = await Promise.all([
               dbService.getWorkers(profile.tenantId),
               dbService.getOrgSettings(profile.tenantId)
            ]);
            
            const validWorkers = w.filter(worker => worker.faceDescriptor && worker.faceDescriptor.length > 0);
            
            // Update Refs immediately so the loop sees it
            workersRef.current = validWorkers;
            settingsRef.current = settings; // Store settings (shifts + break tracking)
            
            if (validWorkers.length === 0) {
                setFeedback("No workers found with Face Data.");
            } else {
                setFeedback("Look at Camera");
            }
        }
      } catch (e) {
        console.error("Init Error:", e);
        setFeedback("System Error: Check Console");
      }
    };
    init();

    // Start Camera
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } })
      .then(stream => { 
          if(videoRef.current) videoRef.current.srcObject = stream; 
      })
      .catch(err => {
          console.error("Camera Error:", err);
          setFeedback("Camera Blocked. Check Permissions.");
      });
      
    // Cleanup
    return () => {
        processingRef.current = false;
    };
  }, [profile]);

  // 2. SCANNING LOOP
  useEffect(() => {
    if (!modelsLoaded) return;

    const scanInterval = setInterval(async () => {
       // CHECKS:
       if (!videoRef.current || videoRef.current.paused || videoRef.current.ended || processingRef.current || workersRef.current.length === 0) {
           return;
       }

       try {
           // Run Matching
           const match = await faceService.findMatch(videoRef.current, workersRef.current);
           
           if (match && match.distance > 0.65) {
               console.log("Face Found:", match.worker.name);
               await handlePunch(match.worker);
           }
       } catch (e) {
           console.error("Scan Loop Error", e);
           // Force unlock if error happens
           processingRef.current = false;
       }
    }, 500); // Check every 500ms

    return () => clearInterval(scanInterval);
  }, [modelsLoaded]);

  const handlePunch = async (worker: Worker) => {
    // LOCK
    processingRef.current = true;
    setFeedback(`Identifying ${worker.name}...`);

    try {
        const today = new Date().toISOString().split('T')[0];
        const recordId = `${profile!.tenantId}_${worker.id}_${today}`;
        
        // A. Fetch existing record
        const existingDocs = await dbService.getTodayAttendance(profile!.tenantId); 
        const existingRecord = existingDocs.find(r => r.id === recordId);

        // B. Determine Action
        const punchCount = existingRecord?.timeline?.length || 0;
        const punchType = (punchCount % 2 === 0) ? 'IN' : 'OUT';

        const now = new Date();
        
        // C. COOLDOWN (10 Seconds)
        if (existingRecord?.timeline && existingRecord.timeline.length > 0) {
            const lastPunchTime = new Date(existingRecord.timeline[existingRecord.timeline.length - 1].timestamp);
            const diffSeconds = (now.getTime() - lastPunchTime.getTime()) / 1000;
            
            if (diffSeconds < 10) { 
                console.log("Cooldown active");
                setErrorFeedback(`Wait ${Math.ceil(10 - diffSeconds)}s...`);
                
                // UNLOCK after short delay
                setTimeout(() => { 
                    setErrorFeedback(null); 
                    setFeedback("Look at Camera"); 
                    processingRef.current = false; 
                }, 2000);
                return;
            }
        }

        // D. Create Timeline
        const currentTimeline = existingRecord?.timeline || [];
        const newTimeline = [...currentTimeline, { 
            timestamp: now.toISOString(), 
            type: punchType as 'IN' | 'OUT', 
            device: 'Kiosk' 
        }];

        // E. Logic
        // Use settingsRef to get the correct Shift and Break Mode
        const { shifts, enableBreakTracking } = settingsRef.current;
        const shift = shifts.find(s => s.id === worker.shiftId) || shifts[0];
        
        if (!shift) throw new Error("No Shift Configuration Found");

        const lateCount = await dbService.getMonthlyLateCount(profile!.tenantId, worker.id);

        const baseRecord: AttendanceRecord = {
            id: recordId,
            tenantId: profile!.tenantId,
            workerId: worker.id,
            workerName: worker.name,
            date: today,
            shiftId: worker.shiftId || 'default',
            timeline: newTimeline,
            status: 'ABSENT', // Default, logic will update
            lateStatus: existingRecord?.lateStatus || { isLate: false, lateByMins: 0, penaltyApplied: false },
            hours: { gross: 0, net: 0, overtime: 0 }
        };

        // Pass enableBreakTracking to the calculation engine
        const finalRecord = attendanceLogic.processDailyStatus(baseRecord, shift, lateCount, enableBreakTracking);

        // F. Save
        await dbService.markAttendance(finalRecord);
        
        // G. Success UI
        setDetectedWorker({ worker, action: punchType });
        setFeedback(punchType === 'IN' ? "Welcome!" : "Goodbye!");

        // Close Kiosk and Go to Dashboard after 2 seconds
        setTimeout(() => {
            setDetectedWorker(null);
            onExit(); // <--- This closes the kiosk
        }, 2000);

    } catch (e: any) {
        console.error("Handle Punch Error", e);
        setFeedback("System Error: " + (e.message || "Unknown"));
        // Force unlock
        processingRef.current = false;
        setTimeout(() => setFeedback("Look at Camera"), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center">
       {/* Header */}
       <div className="absolute top-0 w-full p-4 flex justify-between z-10">
         <div className="bg-black/40 px-4 py-2 rounded-full text-white font-mono text-sm backdrop-blur-md border border-white/10">
             {new Date().toLocaleTimeString()}
         </div>
         <button onClick={onExit} className="bg-white/20 p-2 rounded-full text-white hover:bg-white/30 transition-colors"><X/></button>
      </div>

      {/* Video Feed */}
      <div className="relative w-full h-full">
         <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
         
         <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
             <div className="w-72 h-72 border-2 border-white/30 rounded-full flex items-center justify-center">
                 <div className="w-64 h-64 border-2 border-dashed border-white/50 rounded-full opacity-50"></div>
             </div>
             <p className="absolute mt-80 text-white/70 text-sm font-bold bg-black/20 px-3 py-1 rounded-full backdrop-blur-sm">
                 Place face within circle
             </p>
         </div>
      </div>
      
      {/* SUCCESS POPUP */}
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

      {/* ERROR POPUP */}
      {errorFeedback && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 animate-in fade-in z-30">
              <div className="bg-white p-6 rounded-2xl text-center shadow-xl max-w-xs mx-4 border-l-4 border-yellow-400">
                  <AlertCircle className="mx-auto text-yellow-500 mb-3" size={40} />
                  <h3 className="font-bold text-gray-800 text-lg">Wait a moment</h3>
                  <p className="text-gray-600 mt-1">{errorFeedback}</p>
              </div>
          </div>
      )}
      
      {/* STATUS BAR */}
      <div className="absolute bottom-10 w-full text-center pointer-events-none z-10">
         <div className="bg-white/10 backdrop-blur-md inline-flex items-center px-8 py-4 rounded-full border border-white/20 shadow-lg">
            {!modelsLoaded ? (
                <Loader2 className="animate-spin text-white mr-3" />
            ) : (
                <ScanFace className="text-white mr-3 animate-pulse" />
            )}
            <p className="text-white text-xl font-bold tracking-wide">{feedback}</p>
         </div>
      </div>
    </div>
  );
};