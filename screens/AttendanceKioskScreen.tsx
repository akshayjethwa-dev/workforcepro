import React, { useRef, useEffect, useState } from 'react';
import { Wifi, WifiOff, X, UserCheck, Clock } from 'lucide-react';
import { storageService } from '../services/storage';
import { Worker, AttendanceRecord } from '../types';

interface Props {
  onExit: () => void;
}

export const AttendanceKioskScreen: React.FC<Props> = ({ onExit }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [feedback, setFeedback] = useState<string>("Stand in front of camera");
  const [detectedWorker, setDetectedWorker] = useState<Worker | null>(null);
  const [lastRecord, setLastRecord] = useState<AttendanceRecord | null>(null);
  const [punchType, setPunchType] = useState<'IN' | 'OUT' | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  // Animation states
  const [isScanning, setIsScanning] = useState(true);
  const [scanLinePos, setScanLinePos] = useState(0);

  useEffect(() => {
    // Network listeners
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Camera setup
    let stream: MediaStream;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setFeedback("Camera Error: Access Denied");
      }
    };
    startCamera();

    // Simulation Loop
    const workers = storageService.getWorkers();
    
    const interval = setInterval(() => {
        if (!isScanning) return;

        // Randomly detect a face every 3-8 seconds for simulation
        const randomChance = Math.random();
        
        if (randomChance > 0.8 && workers.length > 0) {
            // FACE DETECTED!
            setIsScanning(false);
            const randomWorker = workers[Math.floor(Math.random() * workers.length)];
            
            // Step 1: Face Box Animation
            setFeedback("Verifying...");
            
            // Step 2: Recognition (Simulated Delay)
            setTimeout(() => {
                setDetectedWorker(randomWorker);
                processAttendance(randomWorker);
            }, 1000);
        }
    }, 2000);

    return () => {
      clearInterval(interval);
      if (stream) stream.getTracks().forEach(t => t.stop());
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isScanning]);

  const processAttendance = (worker: Worker) => {
      try {
          // Capture Frame (Mock URL)
          const photoUrl = "https://via.placeholder.com/150"; 
          
          const result = storageService.markKioskAttendance(worker.id, photoUrl);
          
          setLastRecord(result.record);
          setPunchType(result.status);
          
          // Play Sound (Mock)
          // new Audio('/success.mp3').play();

          // Reset after 4 seconds
          setTimeout(() => {
              setDetectedWorker(null);
              setLastRecord(null);
              setPunchType(null);
              setFeedback("Stand in front of camera");
              setIsScanning(true);
          }, 4000);

      } catch (e) {
          setFeedback("Error processing attendance");
          setIsScanning(true);
      }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Kiosk Header */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-10 bg-gradient-to-b from-black/80 to-transparent">
        <div>
           <h1 className="text-white text-2xl font-bold tracking-wider">ATTENDANCE KIOSK</h1>
           <p className="text-gray-300 text-sm">{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
            <button onClick={onExit} className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full backdrop-blur-md">
                <X size={24} />
            </button>
            <div className={`flex items-center px-3 py-1 rounded-full text-xs font-bold ${isOffline ? 'bg-red-500/80 text-white' : 'bg-green-500/80 text-white'}`}>
                {isOffline ? <WifiOff size={12} className="mr-1"/> : <Wifi size={12} className="mr-1"/>}
                {isOffline ? 'OFFLINE' : 'ONLINE'}
            </div>
        </div>
      </div>

      {/* Main Camera View */}
      <div className="flex-1 relative overflow-hidden">
        <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover transform scale-x-[-1]" 
        />
        
        {/* Scanning Overlay */}
        {!detectedWorker && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-[80vw] max-w-[400px] aspect-[3/4] border-2 border-white/30 rounded-[50%] relative overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)_inset]">
                    {/* Face Guide Markers */}
                    <div className="absolute top-1/3 left-1/4 right-1/4 h-[1px] bg-white/20"></div>
                    <div className="absolute top-2/3 left-1/3 right-1/3 h-[1px] bg-white/20"></div>
                    
                    {/* Scanning Line */}
                    <div className="w-full h-1 bg-blue-500/80 shadow-[0_0_20px_#3b82f6] absolute top-0 animate-[scanKiosk_2s_ease-in-out_infinite]"></div>
                </div>
            </div>
        )}

        {/* Feedback Text */}
        {!detectedWorker && (
             <div className="absolute bottom-20 left-0 right-0 text-center animate-pulse">
                <p className="text-white text-2xl font-light tracking-widest uppercase drop-shadow-lg">{feedback}</p>
             </div>
        )}

        {/* Success Modal Overlay */}
        {detectedWorker && lastRecord && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fadeIn">
                <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl transform scale-100 transition-all text-center relative overflow-hidden">
                    
                    {/* Status Banner */}
                    <div className={`absolute top-0 left-0 right-0 h-2 ${punchType === 'IN' ? 'bg-green-500' : 'bg-orange-500'}`}></div>

                    <div className="mb-6 relative inline-block">
                        <div className="w-24 h-24 bg-gray-200 rounded-full mx-auto overflow-hidden border-4 border-white shadow-xl">
                            <img src={`https://ui-avatars.com/api/?name=${detectedWorker.name}&background=random`} alt="Worker" className="w-full h-full object-cover"/>
                        </div>
                        <div className={`absolute bottom-0 right-0 p-2 rounded-full border-2 border-white ${punchType === 'IN' ? 'bg-green-500' : 'bg-orange-500'}`}>
                            {punchType === 'IN' ? <UserCheck className="text-white" size={20}/> : <Clock className="text-white" size={20}/>}
                        </div>
                    </div>

                    <h2 className="text-2xl font-bold text-gray-800 mb-1">{punchType === 'IN' ? 'Good Morning,' : 'Goodbye,'}</h2>
                    <h3 className="text-xl text-blue-600 font-bold mb-4">{detectedWorker.name}</h3>

                    <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-gray-500 text-sm uppercase font-bold">Time</span>
                            <span className="text-2xl font-mono font-bold text-gray-800">
                                {new Date(punchType === 'IN' ? lastRecord.inTime.timestamp : lastRecord.outTime!.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                        </div>
                        {punchType === 'OUT' && (
                            <div className="flex justify-between items-center border-t border-gray-200 pt-2 mt-2">
                                <span className="text-gray-500 text-sm">Worked Today</span>
                                <span className="text-green-600 font-bold">{lastRecord.calculatedHours?.grossHours} Hrs</span>
                            </div>
                        )}
                         {lastRecord.calculatedHours?.isLate && punchType === 'IN' && (
                             <div className="text-red-500 text-xs font-bold mt-2 bg-red-50 py-1 rounded">
                                 Late by {lastRecord.calculatedHours.lateByMinutes} mins
                             </div>
                         )}
                    </div>
                    
                    <p className="text-gray-400 text-xs">Attendance ID: #{lastRecord.attendanceId.slice(-6)}</p>
                </div>
            </div>
        )}
      </div>
      
      <style>{`
        @keyframes scanKiosk {
            0% { top: 0; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};
