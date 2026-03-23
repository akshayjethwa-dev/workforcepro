// src/screens/AddWorkerScreen.tsx
import React, { useState, useRef, useEffect } from 'react';
import { 
  ChevronLeft, ChevronRight, Save, User, Briefcase, IndianRupee, 
  Camera, CheckCircle, Loader2, Clock, Calendar, Shield, AlertCircle, Lock
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { faceService } from '../services/faceService';
import { Worker, ShiftConfig, Branch, OrgSettings } from '../types/index';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { useBackButton } from '../hooks/useBackButton'; 

interface Props {
  onBack: () => void;
  onSuccess: () => void;
  initialData?: Worker; 
}

const STEPS = [
  { id: 0, title: 'Personal', icon: User },
  { id: 1, title: 'Employment', icon: Briefcase },
  { id: 2, title: 'Wage Info', icon: IndianRupee },
  { id: 3, title: 'Statutory', icon: Shield },
  { id: 4, title: 'Face Scan', icon: Camera },
];

const FACE_ANGLES = [
  "Look Straight",
  "Turn Slightly Left",
  "Turn Slightly Right",
  "Tilt Head Up",
  "Tilt Head Down"
];

const DAYS_OF_WEEK = [
  { id: 1, label: 'Monday' },
  { id: 2, label: 'Tuesday' },
  { id: 3, label: 'Wednesday' },
  { id: 4, label: 'Thursday' },
  { id: 5, label: 'Friday' },
  { id: 6, label: 'Saturday' },
  { id: 0, label: 'Sunday' }
];

export const AddWorkerScreen: React.FC<Props> = ({ onBack, onSuccess, initialData }) => {
  const { profile, limits } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  
  const [availableShifts, setAvailableShifts] = useState<ShiftConfig[]>([]); 
  const [availableBranches, setAvailableBranches] = useState<Branch[]>([]);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);
  
  // NEW: Store the full org settings to pre-fill the leave override
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  
  // State to track if we are overriding the leave policy (Defaults to OFF)
  const [isLeaveOverride, setIsLeaveOverride] = useState(false);
  
  const isEditing = !!initialData;
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [cameraError, setCameraError] = useState<string>('');

  const [formData, setFormData] = useState<Partial<Worker>>({
    name: '', phone: '', aadhar: '', dob: '', gender: '' as any, 
    category: 'Daily Wage', department: '', designation: '', 
    joinedDate: new Date().toISOString().split('T')[0],
    shiftId: 'default',
    branchId: 'default',
    weeklyOffOverride: undefined, 
    leaveBalances: undefined, // Default to undefined to use factory policy
    wageConfig: {
      type: 'DAILY', amount: 0, overtimeEligible: false, 
      allowances: { travel: 0, food: 0, nightShift: 0 },
      monthlyBreakdown: { basic: 0, hra: 0, others: 0 }
    },
    uan: '',
    esicIp: '',
    pan: '',
    fatherName: '', 
    dateOfBirth: '', 
    dateOfJoining: '', 
    dateOfExit: '', 
    status: 'ACTIVE'
  });

  useBackButton(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      return true;
    } else {
      onBack();
      return true; 
    }
  });

  useEffect(() => {
    if (profile?.tenantId) {
      dbService.getOrgSettings(profile.tenantId).then(orgSettings => {
        setSettings(orgSettings); // Save settings to state for leave pre-filling
        setAvailableShifts(orgSettings.shifts);
        
        const branches = orgSettings.branches?.length ? orgSettings.branches : [{id: 'default', name: 'Main Branch'}];
        setAvailableBranches(branches);
        
        const depts = orgSettings.departments?.length ? orgSettings.departments : ['Production', 'Packaging', 'Maintenance', 'Loading', 'Quality'];
        setAvailableDepartments(depts);
        
        if (!isEditing) {
          setFormData(prev => ({ 
             ...prev, 
             shiftId: orgSettings.shifts.length > 0 ? orgSettings.shifts[0].id : 'default',
             branchId: branches[0].id,
             department: depts[0]
          }));
        }
      });
    }
  }, [profile, isEditing]);

  useEffect(() => {
    if (initialData) {
        setFormData(initialData);
        // STRICT CHECK: Only turn toggle ON if they actually have a custom saved policy
        if (initialData.leaveBalances && Object.keys(initialData.leaveBalances).length > 0) {
            setIsLeaveOverride(true);
        } else {
            setIsLeaveOverride(false);
        }
        
        if (initialData.faceDescriptor && initialData.faceDescriptor.length > 0) {
             setCapturedImages(["EXISTING_DATA", "EXISTING_DATA", "EXISTING_DATA", "EXISTING_DATA", "EXISTING_DATA"]);
        }
    }
  }, [initialData]);

  useEffect(() => {
    faceService.loadModels();
    if (currentStep === 4 && capturedImages[0] !== "EXISTING_DATA") {
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

  const handleMonthlyWageChange = (field: 'basic' | 'hra' | 'others', value: string) => {
    const numVal = parseFloat(value) || 0;
    setFormData(prev => {
      const currentBreakdown = prev.wageConfig?.monthlyBreakdown || { basic: 0, hra: 0, others: 0 };
      const updatedBreakdown = { ...currentBreakdown, [field]: numVal };
      const newTotal = updatedBreakdown.basic + updatedBreakdown.hra + updatedBreakdown.others;
      
      return {
        ...prev,
        wageConfig: {
          ...prev.wageConfig!,
          monthlyBreakdown: updatedBreakdown,
          amount: newTotal 
        }
      };
    });
  };

  const validateStep = (step: number): boolean => {
    if (step === 0) {
      if (!formData.name?.trim()) { alert("Full Name is required."); return false; }
      if (!formData.phone?.trim() || !/^\d{10}$/.test(formData.phone)) { alert("Mobile Number must be exactly 10 digits."); return false; }
      if (!formData.gender) { alert("Gender is required."); return false; }
      if (!formData.dob) { alert("Date of Birth is required."); return false; }
      if (formData.aadhar && !/^\d{12}$/.test(formData.aadhar)) { alert("Aadhar Number must be exactly 12 digits."); return false; }
    }
    if (step === 1) {
      if (!formData.designation?.trim()) { alert("Designation is required."); return false; }
    }
    if (step === 2) {
      if (!formData.wageConfig?.amount || formData.wageConfig.amount <= 0) { alert("Wage Amount/Gross Salary is required and must be greater than 0."); return false; }
      if (formData.wageConfig?.type === 'MONTHLY' && (!formData.wageConfig?.monthlyBreakdown?.basic || formData.wageConfig.monthlyBreakdown.basic <= 0)) {
         alert("Basic Salary is required for Monthly Wages to process PF accurately."); return false;
      }
      if (formData.wageConfig?.overtimeEligible && (!formData.wageConfig.overtimeRatePerHour || formData.wageConfig.overtimeRatePerHour <= 0)) {
         alert("Overtime Rate per hour is required because Overtime is enabled."); return false; 
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) setCurrentStep(prev => prev + 1);
  };

  const handleSave = async () => {
    if (capturedImages[0] !== "EXISTING_DATA" && capturedImages.length < 5) {
      alert("All 5 face scans are required to complete registration.");
      return;
    }

    if (!profile?.tenantId) return alert("System Error: Tenant ID missing");
    setSaving(true);
    
    try {
      let descriptor = initialData?.faceDescriptor || [];
      let mainPhotoUrl = initialData?.photoUrl || undefined;

      if (capturedImages.length > 0 && capturedImages[0] !== "EXISTING_DATA") {
          const base64Image = capturedImages[0];
          
          try {
            const img = document.createElement('img');
            img.src = base64Image;
            await new Promise((resolve) => { img.onload = resolve; });
            
            const rawDescriptor = await faceService.getFaceDescriptor(img);
            if (rawDescriptor) {
              descriptor = rawDescriptor;
            } else if (!confirm("Warning: Face not clearly detected. Continue?")) {
              setSaving(false); 
              return;
            }

            const imageRef = ref(storage, `workers/${profile.tenantId}/${Date.now()}_profile.jpg`);
            await uploadString(imageRef, base64Image, 'data_url');
            mainPhotoUrl = await getDownloadURL(imageRef);

          } catch (err) { 
            console.error("Image processing or upload error", err);
            alert("Failed to process face or upload image to storage.");
            setSaving(false);
            return;
          }
      }

      const workerData: any = {
        ...formData,
        tenantId: profile.tenantId,
        photoUrl: mainPhotoUrl, 
        faceDescriptor: descriptor, 
        status: 'ACTIVE'
      };

      // FIREBASE SAFETY: Remove undefined fields if the toggle is OFF
      if (!isLeaveOverride) {
          delete workerData.leaveBalances;
      }
      
      if (isEditing && initialData?.id) {
          await dbService.updateWorker(initialData.id, workerData);
      } else {
          await dbService.addWorker(workerData);
          await dbService.addNotification({
              tenantId: profile.tenantId,
              title: 'New Worker Registered',
              message: `${formData.name} was successfully added to the system.`,
              type: 'INFO',
              createdAt: new Date().toISOString(),
              read: false
          });
      }
      onSuccess();
    } catch (e: any) {
      alert(`Error saving worker: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    // Mobile Optimization: 100dvh prevents UI jumping due to browser URL bars
    <div className="bg-gray-50 min-h-dvh flex flex-col">
      
      {/* Header */}
      <div className="bg-white p-4 shadow-sm sticky top-0 z-20 flex items-center justify-between min-h-16">
        <div className="flex items-center">
          {/* Mobile Optimization: w-11 h-11 provides a >44px touch target */}
          <button onClick={() => { currentStep > 0 ? setCurrentStep(c => c - 1) : onBack() }} 
            className="w-11 h-11 flex items-center justify-center -ml-2 rounded-full hover:bg-gray-100 transition-colors">
            <ChevronLeft className="text-gray-600" size={24}/>
          </button>
          <h1 className="text-lg font-bold ml-1 text-gray-800">{isEditing ? 'Edit Worker' : 'New Registration'}</h1>
        </div>
        <div className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
          Step {currentStep + 1}/5
        </div>
      </div>

      {/* Progress Bar */}
      <div className="flex justify-between px-6 py-4 bg-white border-b border-gray-100 shrink-0">
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

      {/* Mobile Optimization: pb-40 ensures we can scroll up high enough so the keyboard doesn't block inputs */}
      <div className="flex-1 p-4 overflow-y-auto pb-40">
        {/* STEP 1: PERSONAL */}
        {currentStep === 0 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-lg font-bold text-gray-800 mb-2">Personal Information</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Full Name *</label>
                <input className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
                  value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Ramesh Kumar" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Mobile Number *</label>
                <input className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
                  type="tel" maxLength={10} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, '')})} placeholder="10-digit number" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">Gender *</label>
                    <select className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl bg-white min-h-12"
                       value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value as any})}>
                       <option value="">Select Gender</option>
                       <option value="Male">Male</option>
                       <option value="Female">Female</option>
                       <option value="Other">Other</option>
                    </select>
                 </div>
                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">DOB *</label>
                    <input type="date" className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl bg-white min-h-12"
                       value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} />
                 </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Aadhar Number (Optional)</label>
                <input className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
                  maxLength={12} type="tel" value={formData.aadhar} onChange={e => setFormData({...formData, aadhar: e.target.value.replace(/\D/g, '')})} placeholder="12-digit UID" />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: EMPLOYMENT */}
        {currentStep === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-lg font-bold text-gray-800 mb-2">Employment Details</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Worker Category *</label>
                <select className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl bg-white min-h-12"
                  value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as any})}>
                  <option>Daily Wage</option><option>Monthly</option><option>Contract</option><option>Permanent</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Primary Branch *</label>
                <select className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
                  value={formData.branchId} onChange={e => setFormData({...formData, branchId: e.target.value})}>
                  {availableBranches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Department *</label>
                <select className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
                  value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})}>
                  {availableDepartments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Designation *</label>
                <input className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
                  value={formData.designation} onChange={e => setFormData({...formData, designation: e.target.value})} placeholder="e.g. Helper, Operator" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                 <div className="col-span-1">
                   <label className="text-xs font-bold text-gray-500 uppercase ml-1">Shift Timing *</label>
                   <select 
                     className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 text-sm min-h-12"
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

                 <div className="col-span-1">
                   <label className="text-xs font-bold text-gray-500 uppercase ml-1">Weekly Off *</label>
                   <select 
                     className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 text-sm min-h-12"
                     value={formData.weeklyOffOverride ? formData.weeklyOffOverride[0] : 'default'} 
                     onChange={e => {
                         const val = e.target.value;
                         setFormData({...formData, weeklyOffOverride: val === 'default' ? undefined : [parseInt(val)]});
                     }}
                   >
                     <option value="default">Factory Default</option>
                     {DAYS_OF_WEEK.map(day => (
                         <option key={day.id} value={day.id}>{day.label}</option>
                     ))}
                   </select>
                 </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100">
                {/* Mobile Optimization: min-h-[44px] provides an easily tappable area for the toggle switch */}
                <label className="flex items-center justify-between mb-3 min-h-11 cursor-pointer">
                  <div>
                    <span className="text-xs font-bold text-gray-800 uppercase block">Leave Policy Override</span>
                    <span className="text-[10px] text-gray-500">Assign custom leave balances for this worker.</span>
                  </div>
                  <div className="relative inline-flex items-center">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={isLeaveOverride} 
                      onChange={e => {
                        const checked = e.target.checked;
                        setIsLeaveOverride(checked);
                        if (checked) {
                          setFormData({
                            ...formData, 
                            leaveBalances: {
                                cl: settings?.leavePolicy?.cl || 0, 
                                sl: settings?.leavePolicy?.sl || 0, 
                                pl: settings?.leavePolicy?.pl || 0
                            }
                          });
                        } else {
                          setFormData({...formData, leaveBalances: undefined});
                        }
                      }} 
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </div>
                </label>

                {isLeaveOverride && (
                  <div className="grid grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-2">
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1 ml-1">Casual (CL)</label>
                      <input type="number" min="0" className="w-full p-3.5 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
                        value={formData.leaveBalances?.cl ?? 0}
                        onChange={e => setFormData({...formData, leaveBalances: {...(formData.leaveBalances || {cl:0, sl:0, pl:0}), cl: parseInt(e.target.value) || 0}})} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1 ml-1">Sick (SL)</label>
                      <input type="number" min="0" className="w-full p-3.5 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
                        value={formData.leaveBalances?.sl ?? 0}
                        onChange={e => setFormData({...formData, leaveBalances: {...(formData.leaveBalances || {cl:0, sl:0, pl:0}), sl: parseInt(e.target.value) || 0}})} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1 ml-1">Privilege (PL)</label>
                      <input type="number" min="0" className="w-full p-3.5 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
                        value={formData.leaveBalances?.pl ?? 0}
                        onChange={e => setFormData({...formData, leaveBalances: {...(formData.leaveBalances || {cl:0, sl:0, pl:0}), pl: parseInt(e.target.value) || 0}})} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: WAGE */}
        {currentStep === 2 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-lg font-bold text-gray-800 mb-2">Wage Configuration</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
               <button 
                 type="button"
                 onClick={() => setFormData(prev => ({...prev, wageConfig: {...prev.wageConfig!, type: 'DAILY'}}))}
                 className={`p-4 min-h-20 rounded-xl border-2 transition-all flex flex-col items-center justify-center space-y-2 ${
                    formData.wageConfig?.type === 'DAILY' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'
                 }`}
               >
                 <Clock size={24} />
                 <span className="font-bold text-sm">Daily Wages</span>
               </button>
               <button 
                 type="button"
                 onClick={() => setFormData(prev => ({...prev, wageConfig: {...prev.wageConfig!, type: 'MONTHLY'}}))}
                 className={`p-4 min-h-20 rounded-xl border-2 transition-all flex flex-col items-center justify-center space-y-2 ${
                    formData.wageConfig?.type === 'MONTHLY' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'
                 }`}
               >
                 <Calendar size={24} />
                 <span className="font-bold text-sm">Monthly Salary</span>
               </button>
            </div>

            {formData.wageConfig?.type === 'DAILY' ? (
              <div className="mt-4 animate-in fade-in">
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Daily Rate Amount *</label>
                <div className="relative mt-2">
                  <IndianRupee className="absolute left-3 top-4 text-gray-400" size={20}/>
                  <input type="number" className="w-full pl-10 p-3.5 border border-gray-200 rounded-xl font-bold text-lg outline-none focus:ring-2 focus:ring-blue-500 min-h-13"
                    placeholder="e.g. 500"
                    value={formData.wageConfig?.amount || ''} 
                    onChange={e => setFormData({...formData, wageConfig: {...formData.wageConfig!, amount: parseFloat(e.target.value)}})} />
                </div>
              </div>
            ) : (
              <div className="mt-4 bg-blue-50 p-4 rounded-xl border border-blue-100 animate-in fade-in slide-in-from-top-2">
                <h3 className="text-sm font-bold text-blue-900 mb-4 flex items-center">
                  <Briefcase size={16} className="mr-2"/> Monthly Salary Structure
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-bold text-blue-800 uppercase ml-1">Basic + DA (PF Applicable) *</label>
                        <div className="relative mt-1">
                          <IndianRupee className="absolute left-3 top-3.5 text-blue-400" size={16}/>
                          <input type="number" className="w-full pl-9 p-3 border border-blue-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none min-h-12"
                            value={formData.wageConfig?.monthlyBreakdown?.basic || ''}
                            onChange={e => handleMonthlyWageChange('basic', e.target.value)} placeholder="e.g. 15000" />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-blue-800 uppercase ml-1">HRA (House Rent Allowance)</label>
                        <div className="relative mt-1">
                          <IndianRupee className="absolute left-3 top-3.5 text-blue-400" size={16}/>
                          <input type="number" className="w-full pl-9 p-3 border border-blue-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none min-h-12"
                            value={formData.wageConfig?.monthlyBreakdown?.hra || ''}
                            onChange={e => handleMonthlyWageChange('hra', e.target.value)} placeholder="e.g. 5000" />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-blue-800 uppercase ml-1">Other Allowances</label>
                        <div className="relative mt-1">
                          <IndianRupee className="absolute left-3 top-3.5 text-blue-400" size={16}/>
                          <input type="number" className="w-full pl-9 p-3 border border-blue-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none min-h-12"
                            value={formData.wageConfig?.monthlyBreakdown?.others || ''}
                            onChange={e => handleMonthlyWageChange('others', e.target.value)} placeholder="e.g. 2000" />
                        </div>
                    </div>
                </div>
                <div className="mt-4 pt-4 border-t border-blue-200 flex justify-between items-center">
                    <span className="text-xs font-bold text-blue-900 uppercase">Total Gross Salary</span>
                    <span className="text-xl font-black text-blue-700">₹ {formData.wageConfig?.amount || 0}</span>
                </div>
              </div>
            )}

            <div className="mt-4 bg-blue-50 p-4 rounded-xl border border-blue-100">
                <label className="flex items-center justify-between mb-3 min-h-11 cursor-pointer">
                    <div>
                        <span className="text-sm font-bold text-blue-900 block">Overtime (OT) Rules</span>
                        <span className="text-[10px] text-blue-600 font-medium">Is this worker eligible for OT pay?</span>
                    </div>
                    <div className="relative inline-flex items-center">
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          checked={formData.wageConfig?.overtimeEligible || false} 
                          onChange={e => setFormData({...formData, wageConfig: {...formData.wageConfig!, overtimeEligible: e.target.checked}})} 
                        />
                        <div className="w-11 h-6 bg-blue-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </div>
                </label>

                {formData.wageConfig?.overtimeEligible && (
                    <div className="animate-in fade-in slide-in-from-top-2">
                        <label className="text-[10px] font-bold text-blue-800 uppercase ml-1">OT Pay Rate (Per Hour) *</label>
                        <div className="relative mt-1">
                            <IndianRupee className="absolute left-3 top-3 text-blue-500" size={18}/>
                            <input 
                              type="number" 
                              className="w-full pl-10 p-3 border border-blue-200 rounded-lg text-sm bg-white font-bold text-blue-900 focus:ring-2 focus:ring-blue-500 outline-none min-h-12" 
                              placeholder="e.g. 100" 
                              value={formData.wageConfig?.overtimeRatePerHour || ''} 
                              onChange={e => setFormData({...formData, wageConfig: {...formData.wageConfig!, overtimeRatePerHour: parseFloat(e.target.value)}})} 
                            />
                        </div>
                    </div>
                )}
            </div>

            {limits?.allowancesAndDeductionsEnabled && (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mt-2">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">Daily Allowances (Optional)</h3>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Travel</label>
                        <input type="number" className="w-full p-3 mt-1 border border-gray-200 rounded-lg text-sm bg-white min-h-12" placeholder="₹ 0"
                          value={formData.wageConfig?.allowances?.travel || ''}
                          onChange={e => setFormData({...formData, wageConfig: {...formData.wageConfig!, allowances: {...formData.wageConfig!.allowances, travel: parseFloat(e.target.value)}}})} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Food</label>
                        <input type="number" className="w-full p-3 mt-1 border border-gray-200 rounded-lg text-sm bg-white min-h-12" placeholder="₹ 0"
                          value={formData.wageConfig?.allowances?.food || ''}
                          onChange={e => setFormData({...formData, wageConfig: {...formData.wageConfig!, allowances: {...formData.wageConfig!.allowances, food: parseFloat(e.target.value)}}})} />
                      </div>
                  </div>
                </div>
            )}
          </div>
        )}

        {/* STEP 4: STATUTORY */}
        {currentStep === 3 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-indigo-600 p-1.5 rounded-lg">
                <Shield size={16} className="text-white" />
              </div>
              <h2 className="text-lg font-bold text-gray-800">Statutory Compliance</h2>
            </div>
            
            {limits?.statutoryComplianceEnabled ? (
                <>
                    <p className="text-xs text-gray-500 mb-4">Required for EPFO ECR & ESIC Return generation</p>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase ml-1">UAN (PF Number)</label>
                          <input className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
                            maxLength={12} type="tel" value={formData.uan || ''} onChange={e => setFormData({...formData, uan: e.target.value.replace(/\D/g, '')})} placeholder="12-digit UAN" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase ml-1">ESIC IP Number</label>
                          <input className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
                            maxLength={17} type="tel" value={formData.esicIp || ''} onChange={e => setFormData({...formData, esicIp: e.target.value.replace(/\D/g, '')})} placeholder="10-17 digits" />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase ml-1">PAN Number</label>
                        <input className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 uppercase min-h-12"
                          maxLength={10} value={formData.pan || ''} onChange={e => setFormData({...formData, pan: e.target.value.toUpperCase()})} placeholder="e.g. ABCDE1234F" />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase ml-1">Father's Name <span className="text-[10px] lowercase">(for EPFO)</span></label>
                        <input className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
                          value={formData.fatherName || ''} onChange={e => setFormData({...formData, fatherName: e.target.value})} placeholder="Enter full name" />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase ml-1">DOB <span className="text-[10px] lowercase">(DD/MM/YYYY)</span></label>
                          <input className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
                            maxLength={10} type="tel" value={formData.dateOfBirth || ''} onChange={e => setFormData({...formData, dateOfBirth: e.target.value})} placeholder="15/08/1990" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase ml-1">Joining <span className="text-[10px] lowercase">(DD/MM/YYYY)</span></label>
                          <input className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
                            maxLength={10} type="tel" value={formData.dateOfJoining || ''} onChange={e => setFormData({...formData, dateOfJoining: e.target.value})} placeholder="01/01/2024" />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase ml-1">Date of Exit <span className="text-[10px] lowercase">(optional)</span></label>
                        <input className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
                          maxLength={10} type="tel" value={formData.dateOfExit || ''} onChange={e => setFormData({...formData, dateOfExit: e.target.value})} placeholder="31/12/2024" />
                      </div>
                    </div>
                </>
            ) : (
                <div className="bg-gray-100 rounded-2xl shadow-inner border border-gray-200 p-8 text-center mt-6">
                    <Lock className="text-gray-400 mx-auto mb-3" size={32} />
                    <h3 className="font-bold text-gray-800 mb-2">Enterprise Feature</h3>
                    <p className="text-xs text-gray-500 mb-6">
                        Tracking UAN, ESIC, PF details, and ECR reporting requires the Enterprise Compliance module.
                    </p>
                    <button onClick={handleNext} className="bg-indigo-600 text-white px-6 min-h-12 rounded-xl font-bold text-sm shadow-md flex items-center justify-center mx-auto">
                        Skip to Face Scan
                    </button>
                </div>
            )}
          </div>
        )}

        {/* STEP 5: FACE SCAN */}
        {currentStep === 4 && (
          <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
             <h2 className="text-lg font-bold text-gray-800 mb-4">Face Registration *</h2>
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
                    <button onClick={resetPhotos} className="text-blue-600 font-bold bg-blue-50 px-6 min-h-12 rounded-xl hover:bg-blue-100 transition-colors">
                        Re-scan Face (Update)
                    </button>
                    <div className="mt-12 w-full px-4">
                        <button onClick={handleSave} className="w-full bg-blue-600 text-white min-h-14 rounded-xl font-bold flex items-center justify-center shadow-lg active:scale-95 transition-all text-lg">
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
                       <div className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold mb-8 animate-pulse text-center min-h-10 flex items-center">
                          {FACE_ANGLES[capturedImages.length]}
                       </div>
                       <button onClick={capturePhoto} className="w-20 h-20 bg-white border-4 border-gray-200 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all focus:outline-none focus:ring-4 focus:ring-blue-300">
                          <div className="w-16 h-16 bg-red-500 rounded-full border-2 border-white pointer-events-none"></div>
                       </button>
                       <p className="text-gray-400 text-xs mt-4">Photo {capturedImages.length + 1} of 5</p>
                     </>
                   ) : (
                     <div className="w-full text-center px-4">
                       <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                          <CheckCircle size={32} />
                       </div>
                       <h3 className="font-bold text-gray-800 text-lg">Scan Complete!</h3>
                       <p className="text-gray-500 text-sm mb-8">All 5 angles captured successfully.</p>
                       <button onClick={handleSave} disabled={saving} 
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white min-h-14 rounded-xl font-bold shadow-lg flex items-center justify-center transition-all text-lg">
                          {saving ? (
                            <>
                              <Loader2 className="animate-spin mr-2"/> Processing Face...
                            </>
                          ) : (
                            <>
                              <Save className="mr-2"/> {isEditing ? 'Update Worker' : 'Complete Registration'}
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

      {/* Footer Navigation: Sticky bottom over keyboard area */}
      {currentStep < 4 && (
        <div className="p-4 bg-white border-t border-gray-100 flex justify-between sticky bottom-0 left-0 right-0 z-20 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <button onClick={() => currentStep > 0 ? setCurrentStep(c => c - 1) : onBack()} 
            className="px-6 min-h-12 rounded-xl text-gray-500 font-bold hover:bg-gray-50 flex items-center justify-center transition-colors">
            {currentStep === 0 ? 'Cancel' : 'Back'}
          </button>
          <button onClick={handleNext} 
            className="px-8 min-h-12 bg-gray-900 text-white rounded-xl font-bold shadow-lg flex items-center justify-center hover:bg-black active:scale-95 transition-all">
            Next <ChevronRight size={16} className="ml-1"/>
          </button>
        </div>
      )}
    </div>
  );
};