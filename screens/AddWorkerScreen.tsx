import React, { useState, useRef, useEffect } from 'react';
import { Camera, ChevronRight, ChevronLeft, Check, Upload, User, Save } from 'lucide-react';
import { storageService, SHIFTS } from '../services/storage';
import { Worker, WageConfig } from '../types';

interface Props {
  onBack: () => void;
  onSuccess: () => void;
}

const STEPS = ['Personal', 'Employment', 'Wage', 'Face Scan'];

export const AddWorkerScreen: React.FC<Props> = ({ onBack, onSuccess }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Form State
  const [formData, setFormData] = useState<Partial<Worker>>({
    name: '', phone: '', aadhar: '', dob: '', gender: 'Male',
    category: 'Daily Wage', department: 'Production', designation: '', joinedDate: new Date().toISOString().split('T')[0],
    shiftId: SHIFTS[0].id,
    wageConfig: {
      type: 'DAILY', amount: 0, overtimeEligible: true,
      allowances: { travel: 0, food: 0, nightShift: 0 }
    },
    faceTemplates: []
  });

  // Face Capture State
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [capturePromptIndex, setCapturePromptIndex] = useState(0);
  const capturePrompts = [
    "Look straight at camera",
    "Turn slightly LEFT",
    "Turn slightly RIGHT",
    "Tilt head UP",
    "Tilt head DOWN"
  ];

  useEffect(() => {
    if (currentStep === 3) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [currentStep]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setVideoStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) {
      alert("Camera access denied");
    }
  };

  const stopCamera = () => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
  };

  const handleCapture = () => {
    // Simulate capture and face detection check
    const canvas = document.createElement('canvas');
    if (videoRef.current) {
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
        const photoData = canvas.toDataURL('image/jpeg');
        
        // Mock validation
        const newPhotos = [...capturedPhotos, photoData];
        setCapturedPhotos(newPhotos);
        
        if (newPhotos.length < 5) {
            setCapturePromptIndex(newPhotos.length);
        }
    }
  };

  const handleSave = () => {
    const newWorker: Worker = {
      ...formData as Worker,
      id: Date.now().toString(),
      status: 'ACTIVE',
      faceTemplates: capturedPhotos.map((_, i) => `template_hash_${i}`) // Mock encryption
    };
    storageService.addWorker(newWorker);
    onSuccess();
  };

  const StepIndicator = () => (
    <div className="flex justify-between mb-8">
      {STEPS.map((step, idx) => (
        <div key={step} className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mb-1 
            ${idx <= currentStep ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
            {idx + 1}
          </div>
          <span className="text-[10px] text-gray-500">{step}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="bg-white min-h-screen pb-20">
      <div className="bg-blue-600 text-white p-4 flex items-center sticky top-0 z-20">
        <button onClick={onBack} className="mr-4"><ChevronLeft /></button>
        <h1 className="text-lg font-bold">Registration</h1>
      </div>

      <div className="p-6">
        <StepIndicator />

        {/* Step 1: Personal */}
        {currentStep === 0 && (
          <div className="space-y-4 animate-fadeIn">
            <div>
              <label className="label">Full Name *</label>
              <input 
                className="input" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="Worker Name"
              />
            </div>
            <div>
              <label className="label">Mobile Number *</label>
              <input 
                className="input" 
                type="tel"
                maxLength={10}
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
                placeholder="10 digit number"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                 <label className="label">DOB</label>
                 <input type="date" className="input" 
                   value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})}
                 />
              </div>
              <div>
                 <label className="label">Gender</label>
                 <select className="input bg-white" 
                   value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value as any})}
                 >
                   <option>Male</option>
                   <option>Female</option>
                   <option>Other</option>
                 </select>
              </div>
            </div>
            <div>
              <label className="label">Aadhaar (Optional)</label>
              <input 
                className="input" 
                value={formData.aadhar}
                onChange={e => setFormData({...formData, aadhar: e.target.value})}
                placeholder="12 digit UID"
              />
            </div>
          </div>
        )}

        {/* Step 2: Employment */}
        {currentStep === 1 && (
          <div className="space-y-4 animate-fadeIn">
            <div>
               <label className="label">Worker Category</label>
               <select className="input bg-white"
                 value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as any})}
               >
                 <option>Daily Wage</option>
                 <option>Monthly</option>
                 <option>Contract</option>
                 <option>Permanent</option>
               </select>
            </div>
            <div>
               <label className="label">Department</label>
               <select className="input bg-white"
                 value={formData.department} onChange={e => setFormData({...formData, department: e.target.value as any})}
               >
                 <option>Production</option>
                 <option>Packaging</option>
                 <option>Quality</option>
                 <option>Loading</option>
                 <option>Maintenance</option>
               </select>
            </div>
            <div>
               <label className="label">Designation</label>
               <input className="input" placeholder="e.g. Operator" 
                 value={formData.designation} onChange={e => setFormData({...formData, designation: e.target.value})}
               />
            </div>
            <div>
               <label className="label">Shift Timing</label>
               <select className="input bg-white"
                 value={formData.shiftId} onChange={e => setFormData({...formData, shiftId: e.target.value})}
               >
                 {SHIFTS.map(s => <option key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime})</option>)}
               </select>
            </div>
          </div>
        )}

        {/* Step 3: Wage */}
        {currentStep === 2 && (
          <div className="space-y-4 animate-fadeIn">
             <div>
               <label className="label">Wage Type</label>
               <div className="flex space-x-4 mt-2">
                 <label className="flex items-center space-x-2">
                   <input type="radio" checked={formData.wageConfig?.type === 'DAILY'} 
                     onChange={() => setFormData({...formData, wageConfig: {...formData.wageConfig!, type: 'DAILY'}})}
                   />
                   <span>Daily</span>
                 </label>
                 <label className="flex items-center space-x-2">
                   <input type="radio" checked={formData.wageConfig?.type === 'MONTHLY'} 
                     onChange={() => setFormData({...formData, wageConfig: {...formData.wageConfig!, type: 'MONTHLY'}})}
                   />
                   <span>Monthly</span>
                 </label>
               </div>
             </div>
             
             <div>
               <label className="label">{formData.wageConfig?.type === 'DAILY' ? 'Daily Wage Amount' : 'Monthly Salary'}</label>
               <div className="relative">
                 <span className="absolute left-3 top-3 text-gray-500">₹</span>
                 <input type="number" className="input pl-8" 
                   value={formData.wageConfig?.amount}
                   onChange={e => setFormData({
                     ...formData, 
                     wageConfig: {...formData.wageConfig!, amount: parseFloat(e.target.value)}
                   })}
                 />
               </div>
             </div>

             <div className="p-4 bg-gray-50 rounded-lg space-y-3">
               <h3 className="font-bold text-sm text-gray-700">Allowances (Per Day)</h3>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="label text-xs">Travel</label>
                   <input type="number" className="input text-sm" 
                     value={formData.wageConfig?.allowances.travel}
                     onChange={e => setFormData({
                        ...formData,
                        wageConfig: {
                          ...formData.wageConfig!,
                          allowances: {...formData.wageConfig!.allowances, travel: parseFloat(e.target.value)}
                        }
                     })}
                   />
                 </div>
                 <div>
                   <label className="label text-xs">Food</label>
                   <input type="number" className="input text-sm" 
                     value={formData.wageConfig?.allowances.food}
                     onChange={e => setFormData({
                        ...formData,
                        wageConfig: {
                          ...formData.wageConfig!,
                          allowances: {...formData.wageConfig!.allowances, food: parseFloat(e.target.value)}
                        }
                     })}
                   />
                 </div>
               </div>
             </div>
          </div>
        )}

        {/* Step 4: Face Scan */}
        {currentStep === 3 && (
          <div className="flex flex-col items-center">
             <div className="relative w-full aspect-[3/4] bg-black rounded-2xl overflow-hidden mb-6 shadow-2xl">
                {videoStream ? (
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror-mode" />
                ) : (
                  <div className="flex items-center justify-center h-full text-white">Starting Camera...</div>
                )}
                
                {/* Overlay Guide */}
                <div className="absolute inset-0 border-4 border-blue-500/30 rounded-2xl pointer-events-none">
                  <div className="absolute inset-x-12 inset-y-24 border-2 border-dashed border-white/50 rounded-[50%]"></div>
                </div>

                <div className="absolute bottom-4 inset-x-4 bg-black/60 backdrop-blur-md p-3 rounded-xl text-center">
                  <p className="text-white font-bold text-lg">{capturePrompts[capturePromptIndex]}</p>
                  <p className="text-blue-300 text-xs mt-1">Photo {capturedPhotos.length + 1}/5</p>
                </div>
             </div>

             {capturedPhotos.length < 5 ? (
               <button onClick={handleCapture} className="bg-blue-600 text-white w-20 h-20 rounded-full border-4 border-blue-200 flex items-center justify-center shadow-lg active:scale-95 transition-all">
                 <Camera size={32} />
               </button>
             ) : (
               <div className="w-full">
                 <div className="bg-green-100 text-green-700 p-4 rounded-xl flex items-center mb-6">
                   <Check className="mr-2" /> All 5 angles captured successfully!
                 </div>
                 <button onClick={handleSave} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center">
                   <Save className="mr-2" /> Complete Registration
                 </button>
               </div>
             )}
          </div>
        )}
      </div>

      {/* Navigation Footer */}
      {currentStep < 3 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 flex justify-between">
          <button 
            disabled={currentStep === 0}
            onClick={() => setCurrentStep(c => c - 1)}
            className="px-6 py-3 rounded-lg text-gray-600 font-medium disabled:opacity-30"
          >
            Back
          </button>
          <button 
            onClick={() => setCurrentStep(c => c + 1)}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold shadow-lg flex items-center"
          >
            Next <ChevronRight size={18} className="ml-1" />
          </button>
        </div>
      )}

      <style>{`
        .input {
          width: 100%;
          padding: 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          outline: none;
          transition: border-color 0.2s;
        }
        .input:focus {
          border-color: #2563eb;
          ring: 2px solid #2563eb;
        }
        .label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          margin-bottom: 0.5rem;
        }
        .mirror-mode {
          transform: scaleX(-1);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};
