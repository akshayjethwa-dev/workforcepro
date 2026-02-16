import React, { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, Check, XCircle } from 'lucide-react';
import { storageService } from '../services/storage';
import { Worker } from '../types';

export const AttendanceScreen: React.FC = () => {
  const [mode, setMode] = useState<'SCAN' | 'MANUAL'>('SCAN');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ worker: Worker; confidence: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const workers = storageService.getWorkers();

  const startCamera = async () => {
    setIsScanning(true);
    setScanResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      // Simulate ML Kit Face Detection Delay
      setTimeout(() => {
        // Randomly pick a worker to simulate "Recognized"
        const randomWorker = workers[Math.floor(Math.random() * workers.length)];
        setScanResult({ worker: randomWorker, confidence: 0.94 });
      }, 3000);

    } catch (err) {
      console.error("Camera Error", err);
      alert("Camera permission denied or not available. Switching to manual mode.");
      setMode('MANUAL');
      setIsScanning(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setIsScanning(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const confirmAttendance = () => {
    if (scanResult) {
      storageService.markManualAttendance(scanResult.worker.id);
      alert(`Marked Present: ${scanResult.worker.name}`);
      setScanResult(null);
      // Restart scan automatically
      startCamera();
    }
  };

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 z-10 flex justify-between items-center bg-gradient-to-b from-black/70 to-transparent">
        <h2 className="text-white font-bold text-lg">Attendance Scanner</h2>
        <div className="flex space-x-2">
           <button 
            onClick={() => setMode(mode === 'SCAN' ? 'MANUAL' : 'SCAN')}
            className="text-white text-xs bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm"
          >
            {mode === 'SCAN' ? 'Switch to List' : 'Switch to Camera'}
          </button>
        </div>
      </div>

      {mode === 'SCAN' ? (
        <div className="flex-1 relative flex flex-col justify-center bg-gray-900">
          {!isScanning ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-6">
                <Camera className="text-gray-400" size={32} />
              </div>
              <h3 className="text-white text-xl font-bold mb-2">Ready to Scan</h3>
              <p className="text-gray-400 mb-8 max-w-xs">Point camera at worker's face to mark attendance automatically.</p>
              <button 
                onClick={startCamera}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-12 rounded-full shadow-lg shadow-blue-900/50 transition-all active:scale-95"
              >
                Start Scanning
              </button>
            </div>
          ) : (
            <>
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted
                className="w-full h-full object-cover"
              />
              
              {/* Overlay Scanner UI */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-64 border-2 border-white/50 rounded-lg relative">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-blue-500 -mt-0.5 -ml-0.5"></div>
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-blue-500 -mt-0.5 -mr-0.5"></div>
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-blue-500 -mb-0.5 -ml-0.5"></div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-blue-500 -mb-0.5 -mr-0.5"></div>
                  
                  {/* Scanning Line Animation */}
                  <div className="w-full h-0.5 bg-blue-500/80 shadow-[0_0_10px_rgba(59,130,246,0.8)] absolute top-0 animate-[scan_2s_ease-in-out_infinite]"></div>
                </div>
              </div>

              {/* Result Pop-up */}
              {scanResult && (
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-white rounded-t-3xl animate-slide-up pb-24">
                  <div className="flex items-center space-x-4 mb-6">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-2xl font-bold text-blue-600">{scanResult.worker.name.charAt(0)}</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{scanResult.worker.name}</h3>
                      <p className="text-gray-500">{scanResult.worker.designation}</p>
                      <p className="text-xs text-green-600 font-medium mt-1 flex items-center">
                        <Check size={12} className="mr-1"/> Match Confidence: {(scanResult.confidence * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-3">
                    <button 
                      onClick={() => { setScanResult(null); startCamera(); }}
                      className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium"
                    >
                      Retake
                    </button>
                    <button 
                      onClick={confirmAttendance}
                      className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-green-200"
                    >
                      Confirm Present
                    </button>
                  </div>
                </div>
              )}

              <button 
                onClick={stopCamera}
                className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full backdrop-blur-md z-20"
              >
                <XCircle size={24} />
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="bg-gray-50 h-full p-4 overflow-y-auto pb-24">
          <h3 className="font-bold text-gray-700 mb-4 mt-12">Manual Attendance List</h3>
          <div className="space-y-3">
            {workers.map(worker => (
              <div key={worker.id} className="bg-white p-4 rounded-xl shadow-sm flex justify-between items-center">
                <div>
                  <p className="font-bold text-gray-800">{worker.name}</p>
                  <p className="text-xs text-gray-500">{worker.designation}</p>
                </div>
                <button 
                  onClick={() => {
                     storageService.markManualAttendance(worker.id);
                      alert(`Marked ${worker.name} as Present`);
                  }}
                  className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-200"
                >
                  Mark Present
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes scan {
          0% { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .animate-slide-up {
          animation: slideUp 0.3s ease-out forwards;
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};