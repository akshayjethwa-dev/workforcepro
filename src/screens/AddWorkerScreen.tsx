// src/screens/AddWorkerScreen.tsx
import React, { useState, useRef, useEffect } from 'react';
import { 
  ChevronLeft, ChevronRight, Save, User, Briefcase, IndianRupee, 
  Camera, CheckCircle, Loader2, Clock, Calendar, Shield, AlertCircle, Lock
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dbService } from '../services/db';
import { faceService } from '../services/faceService';
import { triggerAutomatedDraftFnf } from '../services/fnfService';
import { Worker, ShiftConfig, Branch, OrgSettings, WorkerSkillCategory } from '../types/index';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { useBackButton } from '../hooks/useBackButton'; 
import { quickSwitchService } from '../services/quickSwitchService';
import { UpgradePaywallModal } from '../components/UpgradePaywallModal';
import { EmployeeCapExceededError } from '../services/employeeCapGuard';
import { INDIAN_STATES } from '../types/index';
import {
  DEFAULT_SCHEDULED_EMPLOYMENT,
  getDefaultZoneForState,
  getStateMinimumWage,
  getZonesForState,
  rebalanceWageConfigTo50Percent,
  resolveWorkerDefaultState,
  resolveWorkerWorkLocation,
  SCHEDULED_EMPLOYMENT_CATEGORIES,
  SKILL_LEVEL_LABELS,
  validateWorkerWageStructure,
} from '../services/wageStructureValidationService';
import { WageStructureValidatorCard } from '../components/WageStructureValidatorCard';
import { KeyboardAwareFormContainer } from '../components/KeyboardAwareFormContainer';
import { ModalDatePicker } from '../components/ModalDatePicker';
import { InlineFieldError } from '../components/InlineFieldError';
import {
  scrollToFirstInvalidField,
  useKeyboardAwareLayout,
} from '../hooks/useKeyboardAwareLayout';

interface Props {
  onBack: () => void;
  onSuccess: () => void;
  initialData?: Worker; 
  onNavigateToBilling?: () => void;
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

export const AddWorkerScreen: React.FC<Props> = ({ onBack, onSuccess, initialData, onNavigateToBilling }) => {
  const { profile, limits } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showPaywall, setShowPaywall] = useState<boolean>(false);
  const [paywallError, setPaywallError] = useState<any>(null);
  
  const [availableShifts, setAvailableShifts] = useState<ShiftConfig[]>([]); 
  const [availableBranches, setAvailableBranches] = useState<Branch[]>([]);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);
  
  // NEW: Store the full org settings to pre-fill the leave override
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  
  // State to track if we are overriding the leave policy (Defaults to OFF)
  const [isLeaveOverride, setIsLeaveOverride] = useState(false);
  
  const isEditing = !!initialData;
  
  const formContainerRef = useRef<HTMLDivElement | null>(null);
  const { keyboardHeight, isKeyboardOpen } = useKeyboardAwareLayout();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearFieldError = (field: string) => {
    setFieldErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

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
      type: 'DAILY', amount: 0, dailyMultiplier: 26, workingDaysPerMonth: 26, overtimeEligible: false, 
      allowances: { travel: 0, food: 0, nightShift: 0 },
      monthlyBreakdown: { basic: 0, da: 0, retainingAllowance: 0, hra: 0, travel: 0, medical: 0, others: 0, employerPf: 0, employerGratuity: 0 },
      dailyBreakdown: { basic: 0, da: 0, retainingAllowance: 0, hra: 0, travel: 0, medical: 0, others: 0, employerPf: 0, employerGratuity: 0 }
    },
    state: 'Maharashtra',
    wageZone: getDefaultZoneForState('Maharashtra'),
    scheduledEmployment: DEFAULT_SCHEDULED_EMPLOYMENT,
    skillCategory: 'UNSKILLED',
    isOnProbation: false,
    salaryRevisionDate: '',
    uan: '',
    esicIp: '',
    pan: '',
    fatherName: '', 
    dateOfBirth: '', 
    dateOfJoining: '', 
    dateOfExit: '', 
    status: 'ACTIVE'
  });

  const [useDailyBreakdown, setUseDailyBreakdown] = useState(false);
  const [acknowledgedNonCompliant, setAcknowledgedNonCompliant] = useState(false);

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
          const defaultBranch = branches[0];
          const initLoc = resolveWorkerWorkLocation({ branchId: defaultBranch.id }, orgSettings);
          setFormData(prev => ({ 
             ...prev, 
             shiftId: orgSettings.shifts.length > 0 ? orgSettings.shifts[0].id : 'default',
             branchId: defaultBranch.id,
             department: depts[0],
             state: initLoc.state,
             wageZone: initLoc.wageZone,
             scheduledEmployment: initLoc.scheduledEmployment,
          }));
        }
      });
    }
  }, [profile, isEditing]);

  useEffect(() => {
    if (initialData) {
        const hydrated = { ...initialData };
        if (
          (hydrated.wageConfig?.type === 'MONTHLY' || hydrated.wageType === 'MONTHLY') &&
          !hydrated.wageConfig?.monthlyBreakdown
        ) {
          const audit = validateWorkerWageStructure(hydrated, { ignoreRevisionCutoff: true });
          hydrated.wageConfig = {
            ...(hydrated.wageConfig || {
              type: 'MONTHLY',
              amount: audit.totalRemuneration,
              overtimeEligible: true,
              allowances: { travel: 0, food: 0, nightShift: 0 },
            }),
            type: 'MONTHLY',
            amount: audit.totalRemuneration,
            basicPercentage: Math.round(audit.wageBasePercentage),
            monthlyBreakdown: {
              basic: audit.basicPay,
              da: audit.da,
              retainingAllowance: audit.retainingAllowance,
              hra: audit.hra,
              travel: audit.travelAllowance,
              medical: audit.medicalAllowance,
              others: audit.otherAllowances,
              employerPf: audit.employerPf,
              employerGratuity: audit.employerGratuity,
            },
          };
        }
        setFormData(hydrated);
        setAcknowledgedNonCompliant(Boolean(hydrated.wageConfig?.acknowledgedNonCompliant));
        if (hydrated.wageConfig?.dailyBreakdown && (
          (hydrated.wageConfig.dailyBreakdown.basic || 0) +
          (hydrated.wageConfig.dailyBreakdown.hra || 0) +
          (hydrated.wageConfig.dailyBreakdown.others || 0) > 0
        )) {
          setUseDailyBreakdown(true);
        }
        // STRICT CHECK: Only turn toggle ON if they actually have a custom saved policy
        if (hydrated.leaveBalances && Object.keys(hydrated.leaveBalances).length > 0) {
            setIsLeaveOverride(true);
        } else {
            setIsLeaveOverride(false);
        }
        
        if (hydrated.faceDescriptor && hydrated.faceDescriptor.length > 0) {
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

  type BreakdownField =
    | 'basic'
    | 'da'
    | 'retainingAllowance'
    | 'hra'
    | 'travel'
    | 'medical'
    | 'others'
    | 'employerPf'
    | 'employerGratuity';

  const handleMonthlyWageChange = (field: BreakdownField, value: string) => {
    const numVal = parseFloat(value) || 0;
    setFormData(prev => {
      const currentBreakdown = prev.wageConfig?.monthlyBreakdown || {
        basic: 0, da: 0, retainingAllowance: 0, hra: 0, travel: 0, medical: 0, others: 0, employerPf: 0, employerGratuity: 0
      };
      const updatedBreakdown = { ...currentBreakdown, [field]: numVal };
      const newTotalRemuneration =
        (updatedBreakdown.basic || 0) +
        (updatedBreakdown.da || 0) +
        (updatedBreakdown.retainingAllowance || 0) +
        (updatedBreakdown.hra || 0) +
        (updatedBreakdown.travel || 0) +
        (updatedBreakdown.medical || 0) +
        (updatedBreakdown.others || 0);
      const wageBase =
        (updatedBreakdown.basic || 0) +
        (updatedBreakdown.da || 0) +
        (updatedBreakdown.retainingAllowance || 0);

      return {
        ...prev,
        wageConfig: {
          ...prev.wageConfig!,
          monthlyBreakdown: updatedBreakdown,
          amount: newTotalRemuneration,
          basicPercentage: newTotalRemuneration > 0 ? Math.round((wageBase / newTotalRemuneration) * 100) : 0
        }
      };
    });
  };

  const handleDailyBreakdownChange = (field: BreakdownField, value: string) => {
    const numVal = parseFloat(value) || 0;
    setFormData(prev => {
      const currentBreakdown = prev.wageConfig?.dailyBreakdown || {
        basic: 0, da: 0, retainingAllowance: 0, hra: 0, travel: 0, medical: 0, others: 0, employerPf: 0, employerGratuity: 0
      };
      const updatedBreakdown = { ...currentBreakdown, [field]: numVal };
      const dailyTotal =
        (updatedBreakdown.basic || 0) +
        (updatedBreakdown.da || 0) +
        (updatedBreakdown.retainingAllowance || 0) +
        (updatedBreakdown.hra || 0) +
        (updatedBreakdown.travel || 0) +
        (updatedBreakdown.medical || 0) +
        (updatedBreakdown.others || 0);
      const dailyWageBase =
        (updatedBreakdown.basic || 0) +
        (updatedBreakdown.da || 0) +
        (updatedBreakdown.retainingAllowance || 0);

      return {
        ...prev,
        wageConfig: {
          ...prev.wageConfig!,
          dailyBreakdown: updatedBreakdown,
          amount: dailyTotal,
          basicPercentage: dailyTotal > 0 ? Math.round((dailyWageBase / dailyTotal) * 100) : 0
        }
      };
    });
  };

  const liveWageAudit = validateWorkerWageStructure(
    {
      ...formData,
      state: formData.state || resolveWorkerDefaultState(formData, settings || undefined),
    },
    { ignoreRevisionCutoff: true, orgSettings: settings || undefined }
  );

  const validateStep = (step: number): boolean => {
    const errors: Record<string, string> = {};

    if (step === 0) {
      if (!formData.name?.trim()) {
        errors.name = 'Full Name is required.';
      }
      if (!formData.phone?.trim() || !/^\d{10}$/.test(formData.phone)) {
        errors.phone = 'Mobile Number must be exactly 10 digits.';
      }
      if (!formData.gender) {
        errors.gender = 'Please select a gender.';
      }
      if (!formData.dob) {
        errors.dob = 'Date of Birth is required.';
      }
      if (formData.aadhar && !/^\d{12}$/.test(formData.aadhar)) {
        errors.aadhar = 'Aadhar Number must be exactly 12 digits.';
      }
      if (formData.kioskPin && !/^\d{4,6}$/.test(formData.kioskPin)) {
        errors.kioskPin = 'Quick Switch Kiosk PIN must be 4 to 6 numeric digits.';
      }
    }

    if (step === 1) {
      if (!formData.designation?.trim()) {
        errors.designation = 'Designation is required (e.g. Helper, Operator).';
      }
    }

    if (step === 2) {
      if (formData.wageConfig?.type === 'MONTHLY') {
        if (!formData.wageConfig?.monthlyBreakdown?.basic || formData.wageConfig.monthlyBreakdown.basic <= 0) {
          errors.basicPay = 'Basic Pay is required for Monthly Wages to calculate PF accurately.';
        }
        if (!formData.wageConfig?.amount || formData.wageConfig.amount <= 0) {
          errors.basicPay = errors.basicPay || 'Gross monthly salary must be greater than ₹0.';
        }
      } else {
        if (!formData.wageConfig?.amount || formData.wageConfig.amount <= 0) {
          errors.wageAmount = 'Daily Rate Amount is required and must be greater than ₹0.';
        }
      }
      if (
        formData.wageConfig?.overtimeEligible &&
        (!formData.wageConfig.overtimeRatePerHour || formData.wageConfig.overtimeRatePerHour <= 0)
      ) {
        errors.overtimeRate = 'Overtime hourly rate is required when Overtime is enabled.';
      }
    }

    setFieldErrors(errors);

    const errorKeys = Object.keys(errors);
    if (errorKeys.length > 0) {
      toast.error(errors[errorKeys[0]]);
      // Wait one tick so inline error messages mount and push layout down before scrolling to the first invalid field
      window.requestAnimationFrame(() => {
        scrollToFirstInvalidField(formContainerRef.current, errorKeys[0]);
      });
      return false;
    }

    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setFieldErrors({});
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleSave = async () => {
    if (capturedImages[0] !== "EXISTING_DATA" && capturedImages.length < 5) {
      toast.warning("All 5 face orientation scans are recommended for biometric accuracy.");
      return;
    }

    if (!profile?.tenantId) {
      toast.error("Organization tenant session missing. Please refresh.");
      return;
    }

    // Check tenant PIN uniqueness if PIN is provided
    if (formData.kioskPin) {
      const allWorkers = await dbService.getWorkers(profile.tenantId);
      const uniqueness = quickSwitchService.checkPinUniqueness(
        profile.tenantId,
        formData.kioskPin,
        initialData?.id,
        allWorkers
      );
      if (!uniqueness.isUnique) {
        toast.error(`Kiosk PIN "${formData.kioskPin}" is already assigned to "${uniqueness.conflictingWorker?.name}". Every PIN must be unique within your organization.`);
        return;
      }
    }

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
            } else {
              toast.warning("Face not clearly detected in capture; proceeding with photo record.");
            }

            const imageRef = ref(storage, `workers/${profile.tenantId}/${Date.now()}_profile.jpg`);
            await uploadString(imageRef, base64Image, 'data_url');
            mainPhotoUrl = await getDownloadURL(imageRef);

          } catch (err) { 
            console.error("Image processing or upload error", err);
            toast.error("Failed to process face or upload image to cloud storage.");
            setSaving(false);
            return;
          }
      }

      const isMonthlyWage = formData.wageConfig?.type === 'MONTHLY';
      const wageAmount = (formData.wageConfig?.amount && formData.wageConfig.amount > 0) 
        ? formData.wageConfig.amount 
        : (isMonthlyWage ? 25000 : 650);

      const finalAudit = validateWorkerWageStructure(
        {
          ...formData,
          state: formData.state || resolveWorkerDefaultState(formData, settings || undefined),
          wageConfig: {
            ...(formData.wageConfig || {}),
            type: isMonthlyWage ? 'MONTHLY' : 'DAILY',
            amount: wageAmount,
            overtimeEligible: formData.wageConfig?.overtimeEligible ?? false,
            allowances: formData.wageConfig?.allowances || { travel: 0, food: 0, nightShift: 0 },
          },
        },
        { ignoreRevisionCutoff: true, orgSettings: settings || undefined }
      );

      const nextStatus: Worker['status'] = formData.status || 'ACTIVE';
      const isSeparated =
        nextStatus === 'RESIGNED' ||
        nextStatus === 'TERMINATED' ||
        nextStatus === 'INACTIVE';
      const resolvedExitDate =
        isSeparated && !formData.dateOfExit
          ? new Date().toISOString().split('T')[0]
          : formData.dateOfExit || undefined;

      const workerData: any = {
        ...formData,
        state: finalAudit.state,
        tenantId: profile.tenantId,
        photoUrl: mainPhotoUrl, 
        faceDescriptor: descriptor, 
        status: nextStatus,
        isActive: !isSeparated,
        ...(resolvedExitDate ? { dateOfExit: resolvedExitDate } : {}),
        ...(nextStatus === 'RESIGNED'
          ? { exitReason: 'RESIGNATION' }
          : nextStatus === 'TERMINATED'
          ? { exitReason: 'TERMINATION' }
          : {}),
        noticePeriodDays:
          typeof formData.noticePeriodDays === 'number'
            ? formData.noticePeriodDays
            : Number(formData.noticePeriodDays || 30),
        isContractor: Boolean(formData.isContractor || formData.employmentType === 'CONTRACTOR'),
        ptExemptionStatus: formData.ptExempt ? 'PT_EXEMPT' : 'NONE',
        ptExemptionReason: formData.ptExempt ? 'MULTIPLE_EMPLOYER' : undefined,
        wageType: isMonthlyWage ? 'MONTHLY' : 'DAILY',
        dailyWage: !isMonthlyWage ? wageAmount : undefined,
        monthlySalary: isMonthlyWage ? wageAmount : undefined,
        wageConfig: {
          ...(formData.wageConfig || {}),
          type: isMonthlyWage ? 'MONTHLY' : 'DAILY',
          amount: wageAmount,
          dailyMultiplier: !isMonthlyWage ? (formData.wageConfig?.dailyMultiplier || 26) : undefined,
          workingDaysPerMonth: !isMonthlyWage ? (formData.wageConfig?.dailyMultiplier || formData.wageConfig?.workingDaysPerMonth || 26) : (formData.wageConfig?.workingDaysPerMonth || 26),
          complianceStatus: finalAudit.status,
          complianceFlags: finalAudit.complianceFlags,
          wageAuditSummary: finalAudit,
          acknowledgedNonCompliant: finalAudit.isFiftyPercentNonCompliant
            ? acknowledgedNonCompliant || true
            : false,
        }
      };

      if (isEditing && initialData?.wageConfig && formData.salaryRevisionDate) {
        const structureChanged =
          initialData.wageConfig.amount !== wageAmount ||
          JSON.stringify(initialData.wageConfig.monthlyBreakdown) !== JSON.stringify(formData.wageConfig?.monthlyBreakdown) ||
          JSON.stringify(initialData.wageConfig.dailyBreakdown) !== JSON.stringify(formData.wageConfig?.dailyBreakdown);
        if (structureChanged) {
          workerData.previousWageConfig = initialData.wageConfig;
          workerData.previousWageAmount = initialData.wageConfig.amount;
        }
      }

      // FIREBASE SAFETY: Remove leaveBalances if the override toggle is OFF
      if (!isLeaveOverride) {
          delete workerData.leaveBalances;
      }
      
      // FIREBASE SAFETY: Clean up any undefined fields (like weeklyOffOverride or photoUrl) to prevent addDoc crashes
      Object.keys(workerData).forEach(key => {
        if (workerData[key] === undefined) {
          delete workerData[key];
        }
      });
      
      if (isEditing && initialData?.id) {
          await dbService.updateWorker(initialData.id, workerData);
          const wasNotSeparated =
            initialData.status !== 'RESIGNED' && initialData.status !== 'TERMINATED';
          if (
            (nextStatus === 'RESIGNED' || nextStatus === 'TERMINATED') &&
            wasNotSeparated
          ) {
            await triggerAutomatedDraftFnf({
              tenantId: profile.tenantId,
              worker: { ...initialData, ...workerData, id: initialData.id },
              exitDate: resolvedExitDate || new Date().toISOString().split('T')[0],
              exitReason: nextStatus === 'TERMINATED' ? 'TERMINATION' : 'RESIGNATION',
              actorEmail: profile.email || 'admin@factory.in',
              orgSettings: settings,
            });
            toast.success(
              `${formData.name} marked ${nextStatus}. Draft FnF Statement generated with 2-working-day Sec 17(2) deadline.`
            );
          } else {
            toast.success(`Updated ${formData.name}'s profile`);
          }
      } else {
          await dbService.addWorker(workerData);
          toast.success(`Registered ${formData.name} successfully`);
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
      if (e?.code === 'EMPLOYEE_CAP_EXCEEDED' || e?.name === 'EmployeeCapExceededError') {
        setPaywallError(e);
        setShowPaywall(true);
        return;
      }
      toast.error(`Error saving worker: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 sm:space-y-6">
      
      {/* Header Toolbar */}
      <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-200/80">
        <div className="flex items-center gap-3 min-w-0">
          <button 
            type="button"
            onClick={() => { currentStep > 0 ? setCurrentStep(c => c - 1) : onBack(); }} 
            className="w-11 h-11 flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-xs shrink-0"
            aria-label="Go Back"
          >
            <ChevronLeft className="text-slate-700" size={20}/>
          </button>
          <div className="min-w-0">
            <h1 className="text-fluid-xl font-bold tracking-tight text-slate-900 truncate">{isEditing ? 'Edit Worker Profile' : 'Register New Personnel'}</h1>
            <div className="text-fluid-xs text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
              <span>{STEPS[currentStep].title}</span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="font-mono tabular-nums text-slate-600 font-medium">Step {currentStep + 1} of {STEPS.length}</span>
            </div>
          </div>
        </div>

        <div className="text-fluid-xs font-mono tabular-nums text-slate-500 shrink-0">
          {Math.round(((currentStep + 1) / STEPS.length) * 100)}% Complete
        </div>
      </div>

      {/* Modern Stepper Tabs */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2 p-1 bg-slate-100/80 rounded-2xl border border-slate-200/60">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isActive = idx === currentStep;
          const isCompleted = idx < currentStep;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => {
                // Allow navigating backwards or if step valid
                if (idx < currentStep) {
                  setFieldErrors({});
                  setCurrentStep(idx);
                }
              }}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 min-h-[2.75rem] rounded-xl text-xs font-semibold transition-all ${
                isActive 
                  ? 'bg-white text-blue-600 shadow-xs' 
                  : isCompleted 
                  ? 'text-emerald-700 hover:bg-white/50' 
                  : 'text-slate-400 cursor-not-allowed'
              }`}
            >
              <div className="shrink-0">
                {isCompleted ? <CheckCircle size={15} className="text-emerald-600" /> : <Icon size={15} />}
              </div>
              <span className="hidden sm:inline text-[11px] truncate">{step.title}</span>
            </button>
          );
        })}
      </div>

      {/* Keyboard-Aware Scrollable Step Form Body */}
      <KeyboardAwareFormContainer
        containerRef={formContainerRef}
        onFinalFieldSubmit={currentStep < 4 ? handleNext : undefined}
        extraBottomPadding={120}
        className="bg-white p-4 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs"
      >
        {/* STEP 1: PERSONAL */}
        {currentStep === 0 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-fluid-lg font-bold text-gray-800 mb-2">Personal Information</h2>
            <div className="space-y-4">
              <div data-field="name">
                <label htmlFor="worker-name" className="text-xs font-bold text-gray-600 uppercase ml-1 block">Full Name *</label>
                <input
                  id="worker-name"
                  type="text"
                  autoComplete="name"
                  enterKeyHint="next"
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? 'worker-name-error' : undefined}
                  className={`w-full p-3.5 mt-1 border rounded-xl outline-none focus:ring-2 min-h-12 transition-colors ${
                    fieldErrors.name
                      ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500'
                      : 'border-gray-200 bg-white focus:ring-blue-500'
                  }`}
                  value={formData.name}
                  onChange={e => {
                    setFormData({...formData, name: e.target.value});
                    clearFieldError('name');
                  }}
                  placeholder="e.g. Ramesh Kumar"
                />
                <InlineFieldError id="worker-name-error" message={fieldErrors.name} />
              </div>

              <div data-field="phone">
                <label htmlFor="worker-phone" className="text-xs font-bold text-gray-600 uppercase ml-1 block">Mobile Number *</label>
                <input
                  id="worker-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  enterKeyHint="next"
                  maxLength={10}
                  aria-invalid={Boolean(fieldErrors.phone)}
                  aria-describedby={fieldErrors.phone ? 'worker-phone-error' : undefined}
                  className={`w-full p-3.5 mt-1 border rounded-xl outline-none focus:ring-2 min-h-12 font-mono transition-colors ${
                    fieldErrors.phone
                      ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500'
                      : 'border-gray-200 bg-white focus:ring-blue-500'
                  }`}
                  value={formData.phone}
                  onChange={e => {
                    setFormData({...formData, phone: e.target.value.replace(/\D/g, '')});
                    clearFieldError('phone');
                  }}
                  placeholder="10-digit number"
                />
                <InlineFieldError id="worker-phone-error" message={fieldErrors.phone} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div data-field="gender">
                    <label htmlFor="worker-gender" className="text-xs font-bold text-gray-600 uppercase ml-1 block">Gender *</label>
                    <select
                      id="worker-gender"
                      aria-invalid={Boolean(fieldErrors.gender)}
                      aria-describedby={fieldErrors.gender ? 'worker-gender-error' : undefined}
                      className={`w-full p-3.5 mt-1 border rounded-xl bg-white min-h-12 outline-none focus:ring-2 transition-colors ${
                        fieldErrors.gender
                          ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500'
                          : 'border-gray-200 focus:ring-blue-500'
                      }`}
                      value={formData.gender}
                      onChange={e => {
                        setFormData({...formData, gender: e.target.value as any});
                        clearFieldError('gender');
                      }}
                    >
                       <option value="">Select Gender</option>
                       <option value="Male">Male</option>
                       <option value="Female">Female</option>
                       <option value="Other">Other</option>
                    </select>
                    <InlineFieldError id="worker-gender-error" message={fieldErrors.gender} />
                 </div>

                 <div data-field="dob">
                    <label htmlFor="worker-dob" className="text-xs font-bold text-gray-600 uppercase ml-1 block">Date of Birth *</label>
                    <ModalDatePicker
                      id="worker-dob"
                      fieldName="dob"
                      label="Select Date of Birth"
                      placeholder="Select date of birth"
                      value={formData.dob || ''}
                      minYear={1945}
                      maxYear={new Date().getFullYear()}
                      hasError={Boolean(fieldErrors.dob)}
                      className="mt-1"
                      onChange={iso => {
                        setFormData({...formData, dob: iso});
                        clearFieldError('dob');
                      }}
                    />
                    <InlineFieldError id="worker-dob-error" message={fieldErrors.dob} />
                 </div>
              </div>

              <div data-field="aadhar">
                <label htmlFor="worker-aadhar" className="text-xs font-bold text-gray-600 uppercase ml-1 block">Aadhar Number (Optional)</label>
                <input
                  id="worker-aadhar"
                  type="tel"
                  inputMode="numeric"
                  enterKeyHint="next"
                  maxLength={12}
                  aria-invalid={Boolean(fieldErrors.aadhar)}
                  aria-describedby={fieldErrors.aadhar ? 'worker-aadhar-error' : undefined}
                  className={`w-full p-3.5 mt-1 border rounded-xl outline-none focus:ring-2 min-h-12 font-mono transition-colors ${
                    fieldErrors.aadhar
                      ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500'
                      : 'border-gray-200 bg-white focus:ring-blue-500'
                  }`}
                  value={formData.aadhar}
                  onChange={e => {
                    setFormData({...formData, aadhar: e.target.value.replace(/\D/g, '')});
                    clearFieldError('aadhar');
                  }}
                  placeholder="12-digit UID"
                />
                <InlineFieldError id="worker-aadhar-error" message={fieldErrors.aadhar} />
              </div>

              <div data-field="kioskPin">
                <div className="flex items-center justify-between flex-wrap gap-1 ml-1">
                  <label htmlFor="worker-kiosk-pin" className="text-xs font-bold text-gray-600 uppercase">Quick Switch Kiosk PIN (4–6 Digits)</label>
                  <span className="text-[10px] text-blue-600 font-mono font-bold">Unique per tenant</span>
                </div>
                <input
                  id="worker-kiosk-pin"
                  type="password"
                  inputMode="numeric"
                  enterKeyHint="done"
                  maxLength={6}
                  aria-invalid={Boolean(fieldErrors.kioskPin)}
                  aria-describedby={fieldErrors.kioskPin ? 'worker-pin-error' : undefined}
                  className={`w-full p-3.5 mt-1 border rounded-xl outline-none focus:ring-2 min-h-12 font-mono tracking-widest transition-colors ${
                    fieldErrors.kioskPin
                      ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500'
                      : 'border-gray-200 bg-white focus:ring-blue-500'
                  }`}
                  value={formData.kioskPin || ''}
                  onChange={e => {
                    setFormData({...formData, kioskPin: e.target.value.replace(/\D/g, '')});
                    clearFieldError('kioskPin');
                  }}
                  placeholder="Defaults to last 4 digits of phone"
                />
                <InlineFieldError id="worker-pin-error" message={fieldErrors.kioskPin} />
                <span className="text-[11px] text-gray-500 ml-1 block mt-1">Used by workers to switch profiles instantly on shared kiosk tablets.</span>
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
                  value={formData.branchId} onChange={e => {
                    const nextBranchId = e.target.value;
                    const chosenBranch = availableBranches.find(b => b.id === nextBranchId);
                    const loc = resolveWorkerWorkLocation(
                      { branchId: nextBranchId },
                      settings || undefined
                    );
                    setFormData(prev => ({
                      ...prev,
                      branchId: nextBranchId,
                      ...(chosenBranch?.state || chosenBranch?.location?.address
                        ? {
                            state: loc.state,
                            wageZone: loc.wageZone,
                            scheduledEmployment: loc.scheduledEmployment,
                          }
                        : {}),
                    }));
                  }}>
                  {availableBranches.map(branch => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}{branch.state ? ` (${branch.state}${branch.wageZone ? ` · ${branch.wageZone}` : ''})` : ''}
                    </option>
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

              <div data-field="designation">
                <label htmlFor="worker-designation" className="text-xs font-bold text-gray-600 uppercase ml-1 block">Designation *</label>
                <input
                  id="worker-designation"
                  type="text"
                  enterKeyHint="next"
                  aria-invalid={Boolean(fieldErrors.designation)}
                  aria-describedby={fieldErrors.designation ? 'worker-designation-error' : undefined}
                  className={`w-full p-3.5 mt-1 border rounded-xl outline-none focus:ring-2 min-h-12 transition-colors ${
                    fieldErrors.designation
                      ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500'
                      : 'border-gray-200 bg-white focus:ring-blue-500'
                  }`}
                  value={formData.designation}
                  onChange={e => {
                    setFormData({...formData, designation: e.target.value});
                    clearFieldError('designation');
                  }}
                  placeholder="e.g. Helper, Operator"
                />
                <InlineFieldError id="worker-designation-error" message={fieldErrors.designation} />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="col-span-1">
                   <label className="text-xs font-bold text-gray-600 uppercase ml-1 block">Shift Timing *</label>
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
                   <label className="text-xs font-bold text-gray-600 uppercase ml-1 block">Weekly Off *</label>
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase ml-1 block">Notice Period (Days)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    enterKeyHint={isLeaveOverride ? 'next' : 'done'}
                    min={0}
                    className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 min-h-12 font-mono text-sm"
                    value={formData.noticePeriodDays ?? (formData.category === 'Permanent' ? 30 : 15)}
                    onChange={e => setFormData({...formData, noticePeriodDays: Math.max(0, parseInt(e.target.value) || 0)})}
                  />
                </div>
                {isEditing && (
                  <>
                    <div>
                      <label className="text-xs font-bold text-gray-600 uppercase ml-1 block">Employment Status</label>
                      <select
                        className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold min-h-12"
                        value={formData.status || 'ACTIVE'}
                        onChange={e => {
                          const s = e.target.value as Worker['status'];
                          setFormData({
                            ...formData,
                            status: s,
                            dateOfExit:
                              (s === 'RESIGNED' || s === 'TERMINATED' || s === 'INACTIVE') && !formData.dateOfExit
                                ? new Date().toISOString().split('T')[0]
                                : formData.dateOfExit,
                          });
                        }}
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="RESIGNED">RESIGNED (Auto-Triggers FnF)</option>
                        <option value="TERMINATED">TERMINATED (Auto-Triggers FnF)</option>
                        <option value="INACTIVE">INACTIVE</option>
                      </select>
                    </div>
                    {(formData.status === 'RESIGNED' || formData.status === 'TERMINATED' || formData.status === 'INACTIVE') && (
                      <div>
                        <label className="text-xs font-bold text-gray-600 uppercase ml-1 block">Exit Date</label>
                        <ModalDatePicker
                          fieldName="dateOfExit"
                          label="Select Exit Date"
                          placeholder="Select exit date"
                          value={formData.dateOfExit || new Date().toISOString().split('T')[0]}
                          className="mt-1"
                          onChange={iso => setFormData({...formData, dateOfExit: iso})}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100">
                {/* Mobile Optimization: min-h-[44px] provides an easily tappable area for the toggle switch */}
                <label className="flex items-center justify-between mb-3 min-h-11 cursor-pointer">
                  <div>
                    <span className="text-xs font-bold text-gray-800 uppercase block">Leave Policy Override</span>
                    <span className="text-[10px] text-gray-500">Assign custom leave balances for this worker.</span>
                  </div>
                  <div className="relative inline-flex items-center shrink-0">
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-2">
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1 ml-1">Casual (CL)</label>
                      <input type="number" inputMode="numeric" enterKeyHint="next" min="0" className="w-full p-3.5 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
                        value={formData.leaveBalances?.cl ?? 0}
                        onChange={e => setFormData({...formData, leaveBalances: {...(formData.leaveBalances || {cl:0, sl:0, pl:0}), cl: parseInt(e.target.value) || 0}})} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1 ml-1">Sick (SL)</label>
                      <input type="number" inputMode="numeric" enterKeyHint="next" min="0" className="w-full p-3.5 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
                        value={formData.leaveBalances?.sl ?? 0}
                        onChange={e => setFormData({...formData, leaveBalances: {...(formData.leaveBalances || {cl:0, sl:0, pl:0}), sl: parseInt(e.target.value) || 0}})} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1 ml-1">Privilege (PL)</label>
                      <input type="number" inputMode="numeric" enterKeyHint="done" min="0" className="w-full p-3.5 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
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
            <h2 className="text-lg font-bold text-gray-800 mb-2">Wage Configuration &amp; 50% Rule Validation</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
               <button 
                 type="button"
                 onClick={() => setFormData(prev => ({...prev, wageConfig: {...prev.wageConfig!, type: 'DAILY'}}))}
                 className={`p-4 min-h-20 rounded-xl border-2 transition-all flex flex-col items-center justify-center space-y-2 cursor-pointer ${
                    formData.wageConfig?.type === 'DAILY' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'
                 }`}
               >
                 <Clock size={24} />
                 <span className="font-bold text-sm">Daily Wages</span>
               </button>
               <button 
                 type="button"
                 onClick={() => setFormData(prev => ({...prev, wageConfig: {...prev.wageConfig!, type: 'MONTHLY'}}))}
                 className={`p-4 min-h-20 rounded-xl border-2 transition-all flex flex-col items-center justify-center space-y-2 cursor-pointer ${
                    formData.wageConfig?.type === 'MONTHLY' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'
                 }`}
               >
                 <Calendar size={24} />
                 <span className="font-bold text-sm">Monthly Salary</span>
               </button>
            </div>

            {/* Work State, Zone, Skill, Scheduled Employment, Revision Date & Probation */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase ml-1 block">Work State (Employee Location)</label>
                  <select
                    className="w-full p-2.5 mt-1 border border-slate-200 rounded-lg bg-white text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                    value={formData.state || resolveWorkerDefaultState(formData, settings || undefined)}
                    onChange={e => {
                      const nextSt = e.target.value;
                      setFormData({
                        ...formData,
                        state: nextSt,
                        wageZone: getDefaultZoneForState(nextSt),
                      });
                    }}
                  >
                    {INDIAN_STATES.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase ml-1 block">Minimum Wage Zone</label>
                  <select
                    className="w-full p-2.5 mt-1 border border-slate-200 rounded-lg bg-white text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                    value={formData.wageZone || getDefaultZoneForState(formData.state || resolveWorkerDefaultState(formData, settings || undefined))}
                    onChange={e => setFormData({ ...formData, wageZone: e.target.value })}
                  >
                    {getZonesForState(formData.state || resolveWorkerDefaultState(formData, settings || undefined)).map(z => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase ml-1 block">Skill Category</label>
                  <select
                    className="w-full p-2.5 mt-1 border border-slate-200 rounded-lg bg-white text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                    value={formData.skillCategory || 'UNSKILLED'}
                    onChange={e => setFormData({ ...formData, skillCategory: e.target.value as WorkerSkillCategory })}
                  >
                    {(Object.keys(SKILL_LEVEL_LABELS) as WorkerSkillCategory[]).map(sk => (
                      <option key={sk} value={sk}>{SKILL_LEVEL_LABELS[sk]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase ml-1 block">Scheduled Employment</label>
                  <select
                    className="w-full p-2.5 mt-1 border border-slate-200 rounded-lg bg-white text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                    value={formData.scheduledEmployment || DEFAULT_SCHEDULED_EMPLOYMENT}
                    onChange={e => setFormData({ ...formData, scheduledEmployment: e.target.value })}
                  >
                    {SCHEDULED_EMPLOYMENT_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase ml-1 block">Structure Effective Date</label>
                  <ModalDatePicker
                    fieldName="salaryRevisionDate"
                    label="Structure Effective Date"
                    placeholder="Select effective date"
                    value={formData.salaryRevisionDate || ''}
                    className="mt-1"
                    onChange={iso => setFormData({ ...formData, salaryRevisionDate: iso })}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 text-xs">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.isOnProbation)}
                    onChange={e => setFormData({ ...formData, isOnProbation: e.target.checked })}
                    className="w-4 h-4 accent-slate-900 rounded"
                  />
                  <span>Employee on Probation</span>
                  <span className="text-[11px] font-normal text-slate-500">(No minimum wage exemption)</span>
                </label>

                {(() => {
                  const st = formData.state || resolveWorkerDefaultState(formData, settings || undefined);
                  const minInfo = getStateMinimumWage(
                    st,
                    formData.skillCategory || 'UNSKILLED',
                    formData.wageZone,
                    formData.scheduledEmployment,
                    undefined,
                    settings?.compliance?.minimumWageRevisions
                  );
                  return (
                    <span className="text-[11px] text-slate-700 font-mono tabular-nums font-bold">
                      Floor: ₹{minInfo.monthlyFloor.toLocaleString('en-IN')}/mo (₹{minInfo.dailyFloor}/day) · Notif. {minInfo.entry.notificationDate}
                    </span>
                  );
                })()}
              </div>
            </div>

            {formData.wageConfig?.type === 'DAILY' ? (
              <div className="mt-4 space-y-4 animate-in fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div data-field="wageAmount">
                    <label htmlFor="worker-daily-rate" className="text-xs font-bold text-gray-600 uppercase ml-1 block">Daily Rate Amount *</label>
                    <div className="relative mt-1.5">
                      <IndianRupee className="absolute left-3 top-4 text-gray-400" size={18}/>
                      <input
                        id="worker-daily-rate"
                        type="number"
                        inputMode="decimal"
                        enterKeyHint="next"
                        aria-invalid={Boolean(fieldErrors.wageAmount)}
                        aria-describedby={fieldErrors.wageAmount ? 'worker-wage-error' : undefined}
                        className={`w-full pl-9 p-3.5 border rounded-xl font-bold text-lg outline-none focus:ring-2 min-h-13 transition-colors ${
                          fieldErrors.wageAmount
                            ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500'
                            : 'border-gray-200 bg-white focus:ring-blue-500'
                        }`}
                        placeholder="e.g. 500"
                        value={formData.wageConfig?.amount || ''} 
                        onChange={e => {
                          setFormData({...formData, wageConfig: {...formData.wageConfig!, amount: parseFloat(e.target.value) || 0}});
                          clearFieldError('wageAmount');
                        }}
                      />
                    </div>
                    <InlineFieldError id="worker-wage-error" message={fieldErrors.wageAmount} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600 uppercase ml-1 block">Monthly Equivalent Multiplier</label>
                    <div className="grid grid-cols-2 gap-2 mt-1.5">
                      {([26, 30] as const).map(mult => (
                        <button
                          key={mult}
                          type="button"
                          onClick={() => setFormData(prev => ({
                            ...prev,
                            wageConfig: { ...prev.wageConfig!, dailyMultiplier: mult, workingDaysPerMonth: mult }
                          }))}
                          className={`min-h-13 rounded-xl border-2 text-xs font-bold transition-all cursor-pointer ${
                            (formData.wageConfig?.dailyMultiplier || formData.wageConfig?.workingDaysPerMonth || 26) === mult
                              ? 'border-blue-600 bg-blue-50 text-blue-700'
                              : 'border-gray-200 bg-white text-gray-600'
                          }`}
                        >
                          × {mult} Days
                          <span className="block text-[10px] font-mono font-normal">
                            ₹{((formData.wageConfig?.amount || 0) * mult).toLocaleString('en-IN')}/mo
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Toggleable Daily Wage Component Split */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Specify Daily Component Breakdown (Optional)</span>
                      <span className="text-[11px] text-slate-500">Split daily wage into Basic/DA vs HRA/Travel/Medical/Other allowances</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={useDailyBreakdown}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setUseDailyBreakdown(checked);
                        if (!checked) {
                          setFormData(prev => ({
                            ...prev,
                            wageConfig: { ...prev.wageConfig!, dailyBreakdown: undefined }
                          }));
                        }
                      }}
                      className="w-4 h-4 accent-blue-600 shrink-0"
                    />
                  </label>

                  {useDailyBreakdown && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-200">
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase block">Daily Basic *</label>
                        <input type="number" inputMode="decimal" enterKeyHint="next" className="w-full p-2.5 mt-1 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono min-h-11"
                          value={formData.wageConfig?.dailyBreakdown?.basic || ''}
                          onChange={e => { handleDailyBreakdownChange('basic', e.target.value); clearFieldError('wageAmount'); }} placeholder="e.g. 300" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase block">Daily DA</label>
                        <input type="number" inputMode="decimal" enterKeyHint="next" className="w-full p-2.5 mt-1 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono min-h-11"
                          value={formData.wageConfig?.dailyBreakdown?.da || ''}
                          onChange={e => handleDailyBreakdownChange('da', e.target.value)} placeholder="0" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase block">Daily Retaining</label>
                        <input type="number" inputMode="decimal" enterKeyHint="next" className="w-full p-2.5 mt-1 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono min-h-11"
                          value={formData.wageConfig?.dailyBreakdown?.retainingAllowance || ''}
                          onChange={e => handleDailyBreakdownChange('retainingAllowance', e.target.value)} placeholder="0" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase block">Daily HRA</label>
                        <input type="number" inputMode="decimal" enterKeyHint="next" className="w-full p-2.5 mt-1 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono min-h-11"
                          value={formData.wageConfig?.dailyBreakdown?.hra || ''}
                          onChange={e => handleDailyBreakdownChange('hra', e.target.value)} placeholder="0" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase block">Daily Travel</label>
                        <input type="number" inputMode="decimal" enterKeyHint="next" className="w-full p-2.5 mt-1 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono min-h-11"
                          value={formData.wageConfig?.dailyBreakdown?.travel || ''}
                          onChange={e => handleDailyBreakdownChange('travel', e.target.value)} placeholder="0" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase block">Daily Medical</label>
                        <input type="number" inputMode="decimal" enterKeyHint="next" className="w-full p-2.5 mt-1 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono min-h-11"
                          value={formData.wageConfig?.dailyBreakdown?.medical || ''}
                          onChange={e => handleDailyBreakdownChange('medical', e.target.value)} placeholder="0" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase block">Daily Others</label>
                        <input type="number" inputMode="decimal" enterKeyHint="next" className="w-full p-2.5 mt-1 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono min-h-11"
                          value={formData.wageConfig?.dailyBreakdown?.others || ''}
                          onChange={e => handleDailyBreakdownChange('others', e.target.value)} placeholder="0" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-indigo-700 uppercase block">ER PF+Grat/day</label>
                        <input type="number" inputMode="decimal" enterKeyHint="next" className="w-full p-2.5 mt-1 bg-white border border-indigo-200 rounded-lg text-xs font-bold font-mono min-h-11"
                          value={formData.wageConfig?.dailyBreakdown?.employerPf || ''}
                          onChange={e => handleDailyBreakdownChange('employerPf', e.target.value)} placeholder="0" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 bg-blue-50/70 p-4 rounded-xl border border-blue-200/80 animate-in fade-in slide-in-from-top-2 space-y-4">
                <h3 className="text-sm font-bold text-blue-900 flex items-center">
                  <Briefcase size={16} className="mr-2"/> Monthly Salary Structure
                </h3>

                {/* WageBase Group */}
                <div className="bg-white/90 rounded-xl p-3 border border-blue-100 space-y-3">
                  <span className="text-[10px] font-extrabold text-blue-900 uppercase tracking-wider block">
                    WageBase = Basic Pay + DA + Retaining Allowance
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div data-field="basicPay">
                      <label htmlFor="worker-basic-pay" className="text-[10px] font-bold text-blue-800 uppercase ml-1 block">Basic Pay *</label>
                      <div className="relative mt-1">
                        <IndianRupee className="absolute left-2.5 top-3.5 text-blue-400" size={14}/>
                        <input
                          id="worker-basic-pay"
                          type="number"
                          inputMode="decimal"
                          enterKeyHint="next"
                          aria-invalid={Boolean(fieldErrors.basicPay)}
                          aria-describedby={fieldErrors.basicPay ? 'worker-basic-error' : undefined}
                          className={`w-full pl-8 p-2.5 border rounded-lg text-sm font-bold font-mono focus:ring-2 outline-none min-h-11 transition-colors ${
                            fieldErrors.basicPay
                              ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500'
                              : 'border-blue-200 bg-white focus:ring-blue-500'
                          }`}
                          value={formData.wageConfig?.monthlyBreakdown?.basic || ''}
                          onChange={e => {
                            handleMonthlyWageChange('basic', e.target.value);
                            clearFieldError('basicPay');
                          }}
                          placeholder="e.g. 15000"
                        />
                      </div>
                      <InlineFieldError id="worker-basic-error" message={fieldErrors.basicPay} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-blue-800 uppercase ml-1 block">DA (Dearness Allow.)</label>
                      <div className="relative mt-1">
                        <IndianRupee className="absolute left-2.5 top-3.5 text-blue-400" size={14}/>
                        <input type="number" inputMode="decimal" enterKeyHint="next" className="w-full pl-8 p-2.5 border border-blue-200 rounded-lg text-sm font-bold font-mono focus:ring-2 focus:ring-blue-500 outline-none min-h-11"
                          value={formData.wageConfig?.monthlyBreakdown?.da || ''}
                          onChange={e => handleMonthlyWageChange('da', e.target.value)} placeholder="0" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-blue-800 uppercase ml-1 block">Retaining Allowance</label>
                      <div className="relative mt-1">
                        <IndianRupee className="absolute left-2.5 top-3.5 text-blue-400" size={14}/>
                        <input type="number" inputMode="decimal" enterKeyHint="next" className="w-full pl-8 p-2.5 border border-blue-200 rounded-lg text-sm font-bold font-mono focus:ring-2 focus:ring-blue-500 outline-none min-h-11"
                          value={formData.wageConfig?.monthlyBreakdown?.retainingAllowance || ''}
                          onChange={e => handleMonthlyWageChange('retainingAllowance', e.target.value)} placeholder="0" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Excluded Components Group */}
                <div className="bg-white/90 rounded-xl p-3 border border-blue-100 space-y-3">
                  <span className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider block">
                    Excluded Components = HRA + Travel + Medical + Other Allowances
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 uppercase ml-1 block">HRA</label>
                      <input type="number" inputMode="decimal" enterKeyHint="next" className="w-full p-2.5 mt-1 border border-slate-200 rounded-lg text-sm font-bold font-mono focus:ring-2 focus:ring-blue-500 outline-none min-h-11"
                        value={formData.wageConfig?.monthlyBreakdown?.hra || ''}
                        onChange={e => handleMonthlyWageChange('hra', e.target.value)} placeholder="e.g. 5000" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 uppercase ml-1 block">Travel Allow.</label>
                      <input type="number" inputMode="decimal" enterKeyHint="next" className="w-full p-2.5 mt-1 border border-slate-200 rounded-lg text-sm font-bold font-mono focus:ring-2 focus:ring-blue-500 outline-none min-h-11"
                        value={formData.wageConfig?.monthlyBreakdown?.travel || ''}
                        onChange={e => handleMonthlyWageChange('travel', e.target.value)} placeholder="0" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 uppercase ml-1 block">Medical Allow.</label>
                      <input type="number" inputMode="decimal" enterKeyHint="next" className="w-full p-2.5 mt-1 border border-slate-200 rounded-lg text-sm font-bold font-mono focus:ring-2 focus:ring-blue-500 outline-none min-h-11"
                        value={formData.wageConfig?.monthlyBreakdown?.medical || ''}
                        onChange={e => handleMonthlyWageChange('medical', e.target.value)} placeholder="0" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 uppercase ml-1 block">Other Allow.</label>
                      <input type="number" inputMode="decimal" enterKeyHint="next" className="w-full p-2.5 mt-1 border border-slate-200 rounded-lg text-sm font-bold font-mono focus:ring-2 focus:ring-blue-500 outline-none min-h-11"
                        value={formData.wageConfig?.monthlyBreakdown?.others || ''}
                        onChange={e => handleMonthlyWageChange('others', e.target.value)} placeholder="e.g. 2000" />
                    </div>
                  </div>
                </div>

                {/* Employer Contributions (Explicitly Excluded from 50% Denominator) */}
                <div className="bg-indigo-50/80 rounded-xl p-3 border border-indigo-200/70 space-y-2">
                  <span className="text-[10px] font-extrabold text-indigo-900 uppercase tracking-wider block">
                    Employer Contributions (Excluded from 50% Rule Denominator)
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-indigo-800 uppercase ml-1 block">Employer PF (₹/mo)</label>
                      <input type="number" inputMode="decimal" enterKeyHint="next" className="w-full p-2.5 mt-1 bg-white border border-indigo-200 rounded-lg text-sm font-bold font-mono focus:ring-2 focus:ring-indigo-500 outline-none min-h-11"
                        value={formData.wageConfig?.monthlyBreakdown?.employerPf || ''}
                        onChange={e => handleMonthlyWageChange('employerPf', e.target.value)} placeholder="0" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-indigo-800 uppercase ml-1 block">Employer Gratuity (₹/mo)</label>
                      <input type="number" inputMode="decimal" enterKeyHint="next" className="w-full p-2.5 mt-1 bg-white border border-indigo-200 rounded-lg text-sm font-bold font-mono focus:ring-2 focus:ring-indigo-500 outline-none min-h-11"
                        value={formData.wageConfig?.monthlyBreakdown?.employerGratuity || ''}
                        onChange={e => handleMonthlyWageChange('employerGratuity', e.target.value)} placeholder="0" />
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-blue-200 flex justify-between items-center flex-wrap gap-2">
                    <span className="text-xs font-bold text-blue-900 uppercase">Total Remuneration (Excl. Employer PF/Gratuity)</span>
                    <span className="text-xl font-black font-mono text-blue-700">₹ {(formData.wageConfig?.amount || 0).toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}

            {/* LIVE 50% RULE & MINIMUM WAGE AUDIT CARD */}
            {liveWageAudit.totalRemuneration > 0 && (
              <WageStructureValidatorCard
                audit={liveWageAudit}
                acknowledgedNonCompliant={acknowledgedNonCompliant}
                onAcknowledgeChange={setAcknowledgedNonCompliant}
                onAutoRebalance={() => {
                  const balanced = rebalanceWageConfigTo50Percent(
                    { ...formData, state: formData.state || resolveWorkerDefaultState(formData, settings || undefined) },
                    settings || undefined
                  );
                  if (balanced.type === 'DAILY') setUseDailyBreakdown(true);
                  setFormData(prev => ({ ...prev, wageConfig: balanced }));
                  setAcknowledgedNonCompliant(false);
                  toast.success('Adjusted Basic Pay to meet the 50% Wage Rule.');
                }}
                onMatchMinimumWage={() => {
                  const minFloor = liveWageAudit.statutoryMinimumWageMonthly;
                  if (formData.wageConfig?.type === 'MONTHLY') {
                    handleMonthlyWageChange('basic', String(minFloor));
                  } else {
                    const mult = liveWageAudit.dailyMultiplier || 26;
                    const dailyMin = Math.ceil(minFloor / mult);
                    if (useDailyBreakdown) {
                      handleDailyBreakdownChange('basic', String(dailyMin));
                    } else {
                      setFormData(prev => ({
                        ...prev,
                        wageConfig: { ...prev.wageConfig!, amount: dailyMin }
                      }));
                    }
                  }
                  toast.success(`Updated Basic Pay to meet ${liveWageAudit.state} minimum wage floor.`);
                }}
                compact
              />
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
                    <div data-field="overtimeRate" className="animate-in fade-in slide-in-from-top-2">
                        <label htmlFor="worker-ot-rate" className="text-[10px] font-bold text-blue-800 uppercase ml-1 block">OT Pay Rate (Per Hour) *</label>
                        <div className="relative mt-1">
                            <IndianRupee className="absolute left-3 top-3.5 text-blue-500" size={18}/>
                            <input 
                              id="worker-ot-rate"
                              type="number" 
                              inputMode="decimal"
                              enterKeyHint="next"
                              aria-invalid={Boolean(fieldErrors.overtimeRate)}
                              aria-describedby={fieldErrors.overtimeRate ? 'worker-ot-error' : undefined}
                              className={`w-full pl-10 p-3 border rounded-lg text-sm bg-white font-bold text-blue-900 focus:ring-2 outline-none min-h-12 transition-colors ${
                                fieldErrors.overtimeRate
                                  ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500'
                                  : 'border-blue-200 focus:ring-blue-500'
                              }`}
                              placeholder="e.g. 100" 
                              value={formData.wageConfig?.overtimeRatePerHour || ''} 
                              onChange={e => {
                                setFormData({...formData, wageConfig: {...formData.wageConfig!, overtimeRatePerHour: parseFloat(e.target.value)}});
                                clearFieldError('overtimeRate');
                              }}
                            />
                        </div>
                        <InlineFieldError id="worker-ot-error" message={fieldErrors.overtimeRate} />
                    </div>
                )}
            </div>

            {limits?.allowancesAndDeductionsEnabled && (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mt-2">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">Daily Allowances (Optional)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase ml-1 block">Travel</label>
                        <input type="number" inputMode="decimal" enterKeyHint="next" className="w-full p-3 mt-1 border border-gray-200 rounded-lg text-sm bg-white min-h-12" placeholder="₹ 0"
                          value={formData.wageConfig?.allowances?.travel || ''}
                          onChange={e => setFormData({...formData, wageConfig: {...formData.wageConfig!, allowances: {...formData.wageConfig!.allowances, travel: parseFloat(e.target.value)}}})} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase ml-1 block">Food</label>
                        <input type="number" inputMode="decimal" enterKeyHint="done" className="w-full p-3 mt-1 border border-gray-200 rounded-lg text-sm bg-white min-h-12" placeholder="₹ 0"
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
              <div className="bg-indigo-600 p-1.5 rounded-lg shrink-0">
                <Shield size={16} className="text-white" />
              </div>
              <h2 className="text-fluid-lg font-bold text-gray-800">Statutory Compliance</h2>
            </div>
            
            {limits?.statutoryComplianceEnabled ? (
                <>
                    <p className="text-xs text-gray-500 mb-4">Required for EPFO ECR &amp; ESIC Return generation</p>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-gray-600 uppercase ml-1 block">UAN (PF Number)</label>
                          <input className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-12 font-mono"
                            maxLength={12} type="tel" inputMode="numeric" enterKeyHint="next" value={formData.uan || ''} onChange={e => setFormData({...formData, uan: e.target.value.replace(/\D/g, '')})} placeholder="12-digit UAN" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-600 uppercase ml-1 block">ESIC IP Number</label>
                          <input className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-12 font-mono"
                            maxLength={17} type="tel" inputMode="numeric" enterKeyHint="next" value={formData.esicIp || ''} onChange={e => setFormData({...formData, esicIp: e.target.value.replace(/\D/g, '')})} placeholder="10-17 digits" />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-gray-600 uppercase ml-1 block">PAN Number</label>
                        <input className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 uppercase min-h-12 font-mono"
                          maxLength={10} enterKeyHint="next" value={formData.pan || ''} onChange={e => setFormData({...formData, pan: e.target.value.toUpperCase()})} placeholder="e.g. ABCDE1234F" />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-gray-600 uppercase ml-1 block">Father's Name <span className="text-[10px] lowercase">(for EPFO)</span></label>
                        <input className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-12"
                          enterKeyHint="next" value={formData.fatherName || ''} onChange={e => setFormData({...formData, fatherName: e.target.value})} placeholder="Enter full name" />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-gray-600 uppercase ml-1 block">DOB <span className="text-[10px] lowercase">(DD/MM/YYYY)</span></label>
                          <input className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-12 font-mono"
                            maxLength={10} type="tel" inputMode="numeric" enterKeyHint="next" value={formData.dateOfBirth || ''} onChange={e => setFormData({...formData, dateOfBirth: e.target.value})} placeholder="15/08/1990" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-600 uppercase ml-1 block">Joining <span className="text-[10px] lowercase">(DD/MM/YYYY)</span></label>
                          <input className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-12 font-mono"
                            maxLength={10} type="tel" inputMode="numeric" enterKeyHint="next" value={formData.dateOfJoining || ''} onChange={e => setFormData({...formData, dateOfJoining: e.target.value})} placeholder="01/01/2024" />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-gray-600 uppercase ml-1 block">Date of Exit <span className="text-[10px] lowercase">(optional)</span></label>
                        <input className="w-full p-3.5 mt-1 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-12 font-mono"
                          maxLength={10} type="tel" inputMode="numeric" enterKeyHint="next" value={formData.dateOfExit || ''} onChange={e => setFormData({...formData, dateOfExit: e.target.value})} placeholder="31/12/2024" />
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

            {/* GRATUITY, NOMINEE & SUBSIDIARY TRANSFER SETTINGS */}
            <div className="mt-5 p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Gratuity Tenure, Nominee &amp; Subsidiary Transfer</h3>
                <p className="text-[11px] text-slate-500">
                  Configures 5-year vs Fixed-Term 1-year (Nov 2025) gratuity eligibility, nominee details &amp; prior subsidiary continuity.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Employment Type</label>
                  <select
                    value={formData.employmentType || (formData.isContractor ? 'CONTRACTOR' : formData.category === 'Daily Wage' ? 'DAILY_WAGE' : 'PERMANENT')}
                    onChange={e => {
                      const nextType = e.target.value as Worker['employmentType'];
                      setFormData({
                        ...formData,
                        employmentType: nextType,
                        isContractor: nextType === 'CONTRACTOR' || nextType === 'CONTRACT',
                      });
                    }}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:border-blue-600 min-h-11"
                  >
                    <option value="PERMANENT">Permanent (5-Yr Gratuity Rule)</option>
                    <option value="FIXED_TERM">Fixed-Term Hire (1-Yr Nov 2025)</option>
                    <option value="CONTRACTOR">CONTRACTOR (LWF Exempt if State Permits)</option>
                    <option value="CONTRACT">Third-Party Contract</option>
                    <option value="DAILY_WAGE">Daily Wage</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Nominee Full Name</label>
                  <input
                    type="text"
                    enterKeyHint="next"
                    value={formData.nomineeName || ''}
                    onChange={e => setFormData({ ...formData, nomineeName: e.target.value })}
                    placeholder="Beneficiary name"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-blue-600 min-h-11"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Nominee Relation</label>
                  <input
                    type="text"
                    enterKeyHint="next"
                    value={formData.nomineeRelation || ''}
                    onChange={e => setFormData({ ...formData, nomineeRelation: e.target.value })}
                    placeholder="Spouse / Parent / Child"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-blue-600 min-h-11"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 space-y-2.5">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.subsidiaryTransfer?.transferredFromSubsidiary)}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        subsidiaryTransfer: {
                          transferredFromSubsidiary: e.target.checked,
                          subsidiaryName: formData.subsidiaryTransfer?.subsidiaryName || '',
                          previousJoiningDate: formData.subsidiaryTransfer?.previousJoiningDate || '',
                          transferDate: formData.subsidiaryTransfer?.transferDate || formData.joinedDate || '',
                          noBreakInService: formData.subsidiaryTransfer?.noBreakInService ?? true,
                        },
                      })
                    }
                    className="w-4 h-4 accent-blue-600 shrink-0"
                  />
                  <span>Transferred from a group / subsidiary company (aggregate continuous service)</span>
                </label>

                {formData.subsidiaryTransfer?.transferredFromSubsidiary && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-600 block mb-1">Prior Subsidiary Name</label>
                      <input
                        type="text"
                        enterKeyHint="next"
                        value={formData.subsidiaryTransfer?.subsidiaryName || ''}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            subsidiaryTransfer: {
                              ...formData.subsidiaryTransfer!,
                              subsidiaryName: e.target.value,
                            },
                          })
                        }
                        placeholder="Subsidiary Pvt Ltd"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs min-h-11"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-600 block mb-1">Original Subsidiary Joining Date</label>
                      <ModalDatePicker
                        fieldName="subsidiaryJoiningDate"
                        label="Original Subsidiary Joining Date"
                        placeholder="Select joining date"
                        value={formData.subsidiaryTransfer?.previousJoiningDate || ''}
                        onChange={iso =>
                          setFormData({
                            ...formData,
                            subsidiaryTransfer: {
                              ...formData.subsidiaryTransfer!,
                              previousJoiningDate: iso,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 p-2.5 bg-white border border-slate-200 rounded-lg w-full cursor-pointer min-h-11">
                        <input
                          type="checkbox"
                          checked={formData.subsidiaryTransfer?.noBreakInService ?? true}
                          onChange={e =>
                            setFormData({
                              ...formData,
                              subsidiaryTransfer: {
                                ...formData.subsidiaryTransfer!,
                                noBreakInService: e.target.checked,
                              },
                            })
                          }
                          className="w-4 h-4 accent-blue-600 shrink-0"
                        />
                        <span>No break in service</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* PROFESSIONAL TAX EXEMPTION (PT_EXEMPT) & LWF CONTRACTOR TAG */}
            <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Professional Tax Exemption &amp; LWF Tags</h3>
                <p className="text-[11px] text-slate-500">
                  Handle multiple-employer PT declarations (PT_EXEMPT) and state-permitted CONTRACTOR LWF exemptions.
                </p>
              </div>

              <label className="flex items-start gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(formData.isContractor || formData.employmentType === 'CONTRACTOR')}
                  onChange={e => {
                    const checked = e.target.checked;
                    setFormData({
                      ...formData,
                      isContractor: checked,
                      employmentType: checked
                        ? 'CONTRACTOR'
                        : formData.employmentType === 'CONTRACTOR'
                        ? 'PERMANENT'
                        : formData.employmentType,
                    });
                  }}
                  className="w-4 h-4 mt-0.5 accent-blue-600"
                />
                <span>
                  Tag worker as <span className="font-mono text-slate-900">CONTRACTOR</span>{' '}
                  <span className="font-normal text-slate-500">
                    (Automatically skips Labour Welfare Fund in Gujarat &amp; other states where contractor exclusion applies)
                  </span>
                </span>
              </label>

              <div className="pt-2 border-t border-slate-200 space-y-2.5">
                <label className="flex items-start gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.ptExempt || formData.ptExemptionStatus === 'PT_EXEMPT')}
                    onChange={e => {
                      const checked = e.target.checked;
                      setFormData({
                        ...formData,
                        ptExempt: checked,
                        ptExemptionStatus: checked ? 'PT_EXEMPT' : 'NONE',
                        ptExemptionReason: checked ? 'MULTIPLE_EMPLOYER' : undefined,
                        ptPreviousEmployerDeclaration: checked
                          ? {
                              declared: true,
                              previousEmployerName: formData.ptPreviousEmployerDeclaration?.previousEmployerName || '',
                              certificateRef: formData.ptPreviousEmployerDeclaration?.certificateRef || '',
                              declaredDate:
                                formData.ptPreviousEmployerDeclaration?.declaredDate ||
                                new Date().toISOString().slice(0, 10),
                            }
                          : undefined,
                      });
                    }}
                    className="w-4 h-4 mt-0.5 accent-blue-600"
                  />
                  <span>
                    Mark as <span className="font-mono text-emerald-700">PT_EXEMPT</span>{' '}
                    <span className="font-normal text-slate-500">
                      (Employee provided PT-paid declaration from another / previous employer)
                    </span>
                  </span>
                </label>

                {(formData.ptExempt || formData.ptExemptionStatus === 'PT_EXEMPT') && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:pl-6">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                        Previous Employer Name
                      </label>
                      <input
                        type="text"
                        enterKeyHint="next"
                        value={formData.ptPreviousEmployerDeclaration?.previousEmployerName || ''}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            ptPreviousEmployerDeclaration: {
                              declared: true,
                              ...(formData.ptPreviousEmployerDeclaration || {}),
                              previousEmployerName: e.target.value,
                            },
                          })
                        }
                        placeholder="e.g. Bharat Forge Ltd"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs min-h-11"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                        PT Certificate / Ref No.
                      </label>
                      <input
                        type="text"
                        enterKeyHint="done"
                        value={formData.ptPreviousEmployerDeclaration?.certificateRef || ''}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            ptPreviousEmployerDeclaration: {
                              declared: true,
                              ...(formData.ptPreviousEmployerDeclaration || {}),
                              certificateRef: e.target.value,
                            },
                          })
                        }
                        placeholder="e.g. PT-CERT-2026-11"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-mono min-h-11"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                        Declaration Date
                      </label>
                      <ModalDatePicker
                        fieldName="ptDeclaredDate"
                        label="PT Declaration Date"
                        placeholder="Select declaration date"
                        value={formData.ptPreviousEmployerDeclaration?.declaredDate || ''}
                        onChange={iso =>
                          setFormData({
                            ...formData,
                            ptPreviousEmployerDeclaration: {
                              declared: true,
                              ...(formData.ptPreviousEmployerDeclaration || {}),
                              declaredDate: iso,
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
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
      </KeyboardAwareFormContainer>

      {/* Keyboard-Aware Footer Navigation: Rises smoothly above soft keyboard on mobile/native */}
      {currentStep < 4 && (
        <div
          className={`fixed left-0 right-0 z-30 lg:static bg-white/95 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none border-t border-slate-200/90 lg:border-slate-200/80 shadow-lg lg:shadow-none px-4 py-3 lg:px-0 lg:pt-4 lg:pb-2 transition-[bottom] duration-200 ease-out ${
            isKeyboardOpen ? '' : 'bottom-16 lg:bottom-auto'
          }`}
          style={
            isKeyboardOpen
              ? { bottom: `${keyboardHeight}px` }
              : undefined
          }
        >
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-2.5">
            <button 
              type="button"
              onClick={() => {
                setFieldErrors({});
                if (currentStep > 0) setCurrentStep(c => c - 1);
                else onBack();
              }} 
              className="px-4 sm:px-5 min-h-[2.75rem] rounded-xl text-slate-700 hover:text-slate-900 font-semibold text-xs border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-xs"
            >
              {currentStep === 0 ? 'Cancel' : 'Back'}
            </button>

            <div className="flex items-center gap-2">
              {isEditing && capturedImages[0] === 'EXISTING_DATA' && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    if (validateStep(currentStep)) handleSave();
                  }}
                  className="px-4 sm:px-5 min-h-[2.75rem] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl font-semibold text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all active:scale-95"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  <span>Save</span>
                </button>
              )}

              <button 
                type="button"
                onClick={handleNext} 
                className="px-5 sm:px-6 min-h-[2.75rem] bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all active:scale-95"
              >
                <span>Next Step</span>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HARD CAP UPGRADE PAYWALL */}
      <UpgradePaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onNavigateToBilling={() => {
          setShowPaywall(false);
          if (onNavigateToBilling) onNavigateToBilling();
          else onBack();
        }}
        errorPayload={paywallError}
      />
    </div>
  );
};