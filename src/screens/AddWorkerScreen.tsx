// src/screens/AddWorkerScreen.tsx

import React, { useState, useRef, useEffect } from 'react';
import { 
  ChevronLeft, ChevronRight, Save, User, Briefcase, IndianRupee, 
  Camera, CheckCircle, Loader2, Clock, Calendar 
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { faceService } from '../services/faceService';
import { Worker, ShiftConfig } from '../types/index';

interface Props {
  onBack: () => void;
  onSuccess: () => void;
  initialData?: Worker; 
}

const STEPS = [
  { id: 0, title: 'Personal', icon: User },
  { id: 1, title: 'Employment', icon: Briefcase },
  { id: 2, title: 'Wage Info', icon: IndianRupee },
  { id: 3, title: 'Face Scan', icon: Camera },
];

const FACE_ANGLES = [
  "Look Straight",
  "Turn Slightly Left",
  "Turn Slightly Right",
  "Tilt Head Up",
  "Tilt Head Down"
];

export const AddWorkerScreen: React.FC<Props> = ({ onBack, onSuccess, initialData }) => {
  const { profile } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [availableShifts, setAvailableShifts] = useState<ShiftConfig[]>([]); // NEW: State for shifts
  const isEditing = !!initialData;
  
  // Camera State
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [cameraError, setCameraError] = useState<string>('');

  const [formData, setFormData] = useState<Partial<Worker>>({
    name: '', phone: '', aadhar: '', dob: '', gender: 'Male',
    category: 'Daily Wage', department: 'Production', designation: '', 
    joinedDate: new Date().toISOString().split('T')[0],
    shiftId: 'default', // Aligned with DB default ID
    wageConfig: {
      type: 'DAILY', amount: 0, overtimeEligible: true,
      allowances: { travel: 0, food: 0, nightShift: 0 }
    },
    status: 'ACTIVE'
  });

  // --- FETCH SHIFTS FROM SETTINGS ---
  useEffect(() => {
    if (profile?.tenantId) {
      dbService.getOrgSettings(profile.tenantId).then(settings => {
        setAvailableShifts(settings.shifts);
        
        // If creating a new worker, default to the first available shift
        if (!isEditing && settings.shifts.length > 0) {
          setFormData(prev => ({ ...prev, shiftId: settings.shifts[0].id }));
        }
      });
    }
  }, [profile, isEditing]);

  // --- INIT FOR EDIT MODE ---
  useEffect(() => {
    if (initialData) {
        setFormData(initialData);
        if (initialData.faceDescriptor && initialData.faceDescriptor.length > 0) {
             setCapturedImages(["EXISTING_DATA", "EXISTING_DATA", "EXISTING_DATA", "EXISTING_DATA", "EXISTING_DATA"]);
        }
    }
  }, [initialData]);

  // --- CAMERA LOGIC ---
  useEffect(() => {
    faceService.loadModels();
    if (currentStep === 3 && capturedImages[0] !== "EXISTING_DATA") {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [currentStep, capturedImages]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: 480, height: 480 } 
      });
      setStream(mediaStream);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
      setCameraError('');
    } catch (err) {
      setCameraError("Camera access denied. Please allow permissions.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    const photoData = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedImages(prev => [...prev, photoData]);
  };

  const resetPhotos = () => {
      setCapturedImages([]); 
  };

  const validateStep = (step: number): boolean => {
    if (step === 0) {
      if (!formData.name?.trim()) { alert("Name is required"); return false; }
      if (!formData.phone?.trim() || formData.phone.length < 10) { alert("Valid Phone is required"); return false; }
    }
    if (step === 2) {
      if (!formData.wageConfig?.amount || formData.wageConfig.amount <= 0) { alert("Wage Amount is required"); return false; }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) setCurrentStep(prev => prev + 1);
  };

  const handleSave = async () => {
    if (!profile?.tenantId) return alert("System Error: Tenant ID missing");
    setSaving(true);
    try {
      let descriptor = initialData?.faceDescriptor || [];
      let mainPhoto = initialData?.photoUrl || undefined;

      if (capturedImages.length > 0 && capturedImages[0] !== "EXISTING_DATA") {
          mainPhoto = capturedImages[0];
          try {
            const img = document.createElement('img');
            img.src = mainPhoto;
            await new Promise((resolve) => { img.onload = resolve; });
            const rawDescriptor = await faceService.getFaceDescriptor(img);
            if (rawDescriptor) {
              descriptor = rawDescriptor;
            } else if (!confirm("Warning: Face not clearly detected. Continue?")) {
              setSaving(false); return;
            }
          } catch (err) { console.error("Face processing error", err); }
      }

      const workerData: any = {
        ...formData,
        tenantId: profile.tenantId,
        photoUrl: mainPhoto, 
        faceDescriptor: descriptor, 
        status: 'ACTIVE'
      };
      
      if (isEditing && initialData?.id) {
          await dbService.updateWorker(initialData.id, workerData);
      } else {
          await dbService.addWorker(workerData);
      }
      onSuccess();
    } catch (e: any) {
      alert(`Error saving worker: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white p-4 shadow-sm sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100"><ChevronLeft className="text-gray-600"/></button>
          <h1 className="text-lg font-bold ml-2 text-gray-800">{isEditing ? 'Edit Worker' : 'New Registration'}</h1>
        </div>
        <div className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
          Step {currentStep + 1}/4
        </div>
      </div>

      {/* Progress Bar */}
      <div className="flex justify-between px-6 py-4 bg-white border-b border-gray-100">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isActive = idx === currentStep;
          const isCompleted = idx < currentStep;
          return (
            <div key={step.id} className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 transition-all ${
                isActive ? 'bg-blue-600 text-white scale-110 shadow-lg' : 
                isCompleted ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
              }`}>
                {isCompleted ? <CheckCircle size={16}/> : <Icon size={16}/>}
              </div>
              <span className={`text-[10px] font-bold ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
                {step.title}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex-1 p-4 overflow-y-auto pb-24">
        {/* STEP 1: PERSONAL */}
        {currentStep === 0 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-lg font-bold text-gray-800 mb-2">Personal Information</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Full Name *</label>
                <input className="w-full p-3 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Ramesh Kumar" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Mobile Number *</label>
                <input className="w-full p-3 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  type="tel" maxLength={10} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="10-digit number" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Gender</label>
                    <select className="w-full p-3 mt-1 border border-gray-200 rounded-xl bg-white"
                       value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value as any})}>
                       <option>Male</option><option>Female</option><option>Other</option>
                    </select>
                 </div>
                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">DOB</label>
                    <input type="date" className="w-full p-3 mt-1 border border-gray-200 rounded-xl bg-white"
                       value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} />
                 </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Aadhar Number (Optional)</label>
                <input className="w-full p-3 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={12} value={formData.aadhar} onChange={e => setFormData({...formData, aadhar: e.target.value})} placeholder="12-digit UID" />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: EMPLOYMENT */}
        {currentStep === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-lg font-bold text-gray-800 mb-2">Employment Details</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Worker Category</label>
                <select className="w-full p-3 mt-1 border border-gray-200 rounded-xl bg-white"
                  value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as any})}>
                  <option>Daily Wage</option><option>Monthly</option><option>Contract</option><option>Permanent</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Department</label>
                <select className="w-full p-3 mt-1 border border-gray-200 rounded-xl bg-white"
                  value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})}>
                  <option>Production</option><option>Packaging</option><option>Maintenance</option><option>Loading</option><option>Quality</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Designation</label>
                <input className="w-full p-3 mt-1 border border-gray-200 rounded-xl outline-none"
                  value={formData.designation} onChange={e => setFormData({...formData, designation: e.target.value})} placeholder="e.g. Helper, Operator" />
              </div>
              
              {/* UPDATED: Dynamic Shift Timing Dropdown */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Shift Timing</label>
                <select 
                  className="w-full p-3 mt-1 border border-gray-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.shiftId} 
                  onChange={e => setFormData({...formData, shiftId: e.target.value})}
                >
                  {availableShifts.length > 0 ? (
                    availableShifts.map(shift => (
                      <option key={shift.id} value={shift.id}>
                        {shift.name} ({shift.startTime} - {shift.endTime})
                      </option>
                    ))
                  ) : (
                    <option value="default">General Shift (Loading...)</option>
                  )}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: WAGE */}
        {currentStep === 2 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-lg font-bold text-gray-800 mb-2">Wage Configuration</h2>
            <div className="grid grid-cols-2 gap-4">
               <div 
                 onClick={() => setFormData(prev => ({...prev, wageConfig: {...prev.wageConfig!, type: 'DAILY'}}))}
                 className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col items-center justify-center space-y-2 ${
                    formData.wageConfig?.type === 'DAILY' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'
                 }`}
               >
                  <Clock size={24} />
                  <span className="font-bold text-sm">Daily Wages</span>
               </div>
               <div 
                 onClick={() => setFormData(prev => ({...prev, wageConfig: {...prev.wageConfig!, type: 'MONTHLY'}}))}
                 className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col items-center justify-center space-y-2 ${
                    formData.wageConfig?.type === 'MONTHLY' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'
                 }`}
               >
                  <Calendar size={24} />
                  <span className="font-bold text-sm">Monthly Salary</span>
               </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">
                {formData.wageConfig?.type === 'DAILY' ? 'Daily Rate Amount' : 'Monthly Salary Amount'} *
              </label>
              <div className="relative mt-2">
                <IndianRupee className="absolute left-3 top-3.5 text-gray-400" size={18}/>
                <input type="number" className="w-full pl-10 p-3 border border-gray-200 rounded-xl font-bold text-lg outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={formData.wageConfig?.type === 'DAILY' ? "e.g. 500" : "e.g. 15000"}
                  value={formData.wageConfig?.amount || ''} 
                  onChange={e => setFormData({...formData, wageConfig: {...formData.wageConfig!, amount: parseFloat(e.target.value)}})} />
              </div>
            </div>

            {/* --- NEW: OVERTIME CONFIGURATION --- */}
            <div className="mt-4 bg-blue-50 p-4 rounded-xl border border-blue-100">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="text-sm font-bold text-blue-900">Overtime (OT) Rules</h3>
                        <p className="text-[10px] text-blue-600 font-medium">Is this worker eligible for OT pay?</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          checked={formData.wageConfig?.overtimeEligible || false} 
                          onChange={e => setFormData({...formData, wageConfig: {...formData.wageConfig!, overtimeEligible: e.target.checked}})} 
                        />
                        <div className="w-11 h-6 bg-blue-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>

                {formData.wageConfig?.overtimeEligible && (
                    <div className="animate-in fade-in slide-in-from-top-2">
                        <label className="text-[10px] font-bold text-blue-800 uppercase">OT Pay Rate (Per Hour)</label>
                        <div className="relative mt-1">
                            <IndianRupee className="absolute left-3 top-2.5 text-blue-500" size={16}/>
                            <input 
                              type="number" 
                              className="w-full pl-9 p-2 border border-blue-200 rounded-lg text-sm bg-white font-bold text-blue-900 focus:ring-2 focus:ring-blue-500 outline-none" 
                              placeholder="e.g. 100" 
                              value={formData.wageConfig?.overtimeRatePerHour || ''} 
                              onChange={e => setFormData({...formData, wageConfig: {...formData.wageConfig!, overtimeRatePerHour: parseFloat(e.target.value)}})} 
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mt-2">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Daily Allowances (Optional)</h3>
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Travel</label>
                    <input type="number" className="w-full p-2 mt-1 border border-gray-200 rounded-lg text-sm bg-white" placeholder="₹ 0"
                      value={formData.wageConfig?.allowances?.travel || ''}
                      onChange={e => setFormData({...formData, wageConfig: {...formData.wageConfig!, allowances: {...formData.wageConfig!.allowances, travel: parseFloat(e.target.value)}}})} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Food</label>
                    <input type="number" className="w-full p-2 mt-1 border border-gray-200 rounded-lg text-sm bg-white" placeholder="₹ 0"
                      value={formData.wageConfig?.allowances?.food || ''}
                      onChange={e => setFormData({...formData, wageConfig: {...formData.wageConfig!, allowances: {...formData.wageConfig!.allowances, food: parseFloat(e.target.value)}}})} />
                  </div>
              </div>
            </div>
          </div>
        )}


        {/* STEP 4: FACE SCAN */}
        {currentStep === 3 && (
          <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
             <h2 className="text-lg font-bold text-gray-800 mb-4">Face Registration</h2>
             {capturedImages[0] === "EXISTING_DATA" ? (
                <div className="text-center py-10 w-full">
                    <div className="w-24 h-24 bg-gray-200 rounded-full mx-auto mb-4 overflow-hidden border-4 border-white shadow-lg">
                        {formData.photoUrl ? (
                            <img src={formData.photoUrl} className="w-full h-full object-cover"/>
                        ) : (
                            <div className="flex items-center justify-center h-full bg-blue-100 text-blue-500"><User size={32}/></div>
                        )}
                    </div>
                    <p className="font-bold text-gray-800 text-lg">Face Data Configured</p>
                    <p className="text-gray-500 text-sm mb-6">This worker is ready for attendance.</p>
                    <button onClick={resetPhotos} className="text-blue-600 font-bold bg-blue-50 px-4 py-2 rounded-lg hover:bg-blue-100 transition-colors">
                        Re-scan Face (Update)
                    </button>
                    <div className="mt-12">
                        <button onClick={handleSave} className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold flex items-center justify-center shadow-lg active:scale-95 transition-all">
                            {saving ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2"/>} Update Worker
                        </button>
                    </div>
                </div>
             ) : (
                <>
                   <div className="relative w-64 h-64 bg-black rounded-full overflow-hidden border-4 border-blue-100 shadow-2xl mb-6">
                      {cameraError ? (
                        <div className="flex items-center justify-center h-full text-white text-xs text-center p-4">{cameraError}</div>
                      ) : (
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                      )}
                      <div className="absolute inset-0 border-2 border-dashed border-white/50 rounded-full scale-90 pointer-events-none"></div>
                   </div>

                   {capturedImages.length < 5 ? (
                     <>
                       <div className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold mb-8 animate-pulse text-center">
                          {FACE_ANGLES[capturedImages.length]}
                       </div>
                       <button onClick={capturePhoto} className="w-20 h-20 bg-white border-4 border-gray-200 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all">
                          <div className="w-16 h-16 bg-red-500 rounded-full border-2 border-white"></div>
                       </button>
                       <p className="text-gray-400 text-xs mt-4">Photo {capturedImages.length + 1} of 5</p>
                     </>
                   ) : (
                     <div className="w-full text-center">
                       <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                          <CheckCircle size={32} />
                       </div>
                       <h3 className="font-bold text-gray-800 text-lg">Scan Complete!</h3>
                       <p className="text-gray-500 text-sm mb-8">All 5 angles captured successfully.</p>
                       <button onClick={handleSave} disabled={saving} 
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl font-bold shadow-lg flex items-center justify-center transition-all">
                          {saving ? (
                            <>
                              <Loader2 className="animate-spin mr-2"/> Processing Face...
                            </>
                          ) : (
                            <>
                              <Save className="mr-2"/> {isEditing ? 'Update' : 'Complete Registration'}
                            </>
                          )}
                       </button>
                     </div>
                   )}
                   {capturedImages.length > 0 && capturedImages.length < 5 && (
                      <div className="flex gap-2 mt-6">
                        {capturedImages.map((img, i) => (
                          <img key={i} src={img} className="w-10 h-10 rounded-lg object-cover border border-gray-200" alt="scan" />
                        ))}
                      </div>
                   )}
                </>
             )}
          </div>
        )}
      </div>

      {/* Footer Navigation */}
      {currentStep < 3 && (
        <div className="p-4 bg-white border-t border-gray-100 flex justify-between">
          <button onClick={() => currentStep > 0 ? setCurrentStep(c => c - 1) : onBack()} 
            className="px-6 py-3 rounded-xl text-gray-500 font-bold hover:bg-gray-50">
            {currentStep === 0 ? 'Cancel' : 'Back'}
          </button>
          <button onClick={handleNext} 
            className="px-8 py-3 bg-gray-900 text-white rounded-xl font-bold shadow-lg flex items-center hover:bg-black active:scale-95 transition-all">
            Next <ChevronRight size={16} className="ml-1"/>
          </button>
        </div>
      )}
    </div>
  );
};