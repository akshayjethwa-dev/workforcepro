import React, { useState, useEffect } from 'react';
import { 
  Save, Plus, Trash2, Clock, AlertCircle, CheckCircle, 
  Calendar, Coffee, Info, MapPin, Building, User, Lock,
  GitBranch, Layers, X, ScanFace, Loader2, CalendarDays, Umbrella, Shield, BookOpen, Sparkles, ChevronRight,
  CheckCircle2, Wand2, ArrowRight, ChevronDown, ChevronUp
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dbService } from '../services/db';
import { OrgSettings, ShiftConfig, Branch, KioskTerminal, ScreenName } from '../types/index';
import { SetupGuideModal } from '../components/SetupGuideModal';

import { doc, updateDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const SettingsScreen: React.FC<{ onNavigate?: (screen: ScreenName) => void }> = ({ onNavigate }) => {
  const { profile, limits } = useAuth();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState<'GENERAL' | 'SHIFTS' | 'BRANCHES' | 'DEPARTMENTS' | 'TERMINALS' | 'CALENDAR' | 'LEAVES' | 'COMPLIANCE'>('GENERAL');
  const [showGuide, setShowGuide] = useState(false);
  const [showSetupAssistant, setShowSetupAssistant] = useState(true);
  
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [initialSettings, setInitialSettings] = useState<OrgSettings | null>(null);

  const [orgProfile, setOrgProfile] = useState({ companyName: '', ownerName: '' });
  const [initialOrgProfile, setInitialOrgProfile] = useState({ companyName: '', ownerName: '' });
  
  const [newDept, setNewDept] = useState('');
  
  // --- KIOSK TERMINALS STATE ---
  const [terminals, setTerminals] = useState<KioskTerminal[]>([]);
  const [newTerminalName, setNewTerminalName] = useState('');
  const [newTerminalPin, setNewTerminalPin] = useState('');

  // --- HOLIDAYS STATE ---
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayPaid, setNewHolidayPaid] = useState(true);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const DAYS_OF_WEEK = [
    { id: 1, label: 'Mon' },
    { id: 2, label: 'Tue' },
    { id: 3, label: 'Wed' },
    { id: 4, label: 'Thu' },
    { id: 5, label: 'Fri' },
    { id: 6, label: 'Sat' },
    { id: 0, label: 'Sun' }
  ];

  useEffect(() => {
    if (profile) {
      const currentOrg = { 
        companyName: profile.companyName || '', 
        ownerName: (profile as any).name || profile.email || '' 
      };
      setOrgProfile(currentOrg);
      setInitialOrgProfile(currentOrg);

      if (profile.tenantId) {
        dbService.getOrgSettings(profile.tenantId).then((data) => {
           setSettings(data);
           setInitialSettings(data);
        }).finally(() => setLoading(false));

        dbService.getKioskTerminals(profile.tenantId)
          .then(setTerminals)
          .catch((err) => console.warn("Could not fetch terminals:", err));
      } else {
        setLoading(false);
      }
    }
  }, [profile]);

  const hasChanges = 
    JSON.stringify(settings) !== JSON.stringify(initialSettings) ||
    JSON.stringify(orgProfile) !== JSON.stringify(initialOrgProfile);

  // --- TERMINAL MANAGEMENT ---
  const handleGenerateTerminal = async () => {
    if (!profile?.tenantId || !newTerminalName || newTerminalPin.length !== 4) {
       toast.error("Provide a terminal name and a 4-digit PIN."); 
       return;
    }
    
    setSaving(true);
    try {
      const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
      const newKioskLocal: KioskTerminal = {
         id: pairingCode, 
         tenantId: profile.tenantId,
         branchId: 'default',
         name: newTerminalName,
         pairingCode,
         adminPin: newTerminalPin,
         status: 'active',
         createdAt: new Date().toISOString()
      };

      if (profile.tenantId === 'demo-tenant-id') {
        const currentStored = (() => {
          try {
            return JSON.parse(localStorage.getItem('demo_kiosks') || '[]');
          } catch { return []; }
        })();
        localStorage.setItem('demo_kiosks', JSON.stringify([...currentStored, newKioskLocal]));
        setTerminals(prev => [...prev, newKioskLocal]);
        setNewTerminalName('');
        setNewTerminalPin('');
        toast.success(`Terminal paired! Code: ${pairingCode}`);
        return;
      }
      
      const kioskDocRef = doc(db, 'kiosks', pairingCode);
      await setDoc(kioskDocRef, {
         tenantId: profile.tenantId, 
         createdBy: profile.uid || 'unknown',
         branchId: 'default',
         name: newTerminalName,
         pairingCode,
         adminPin: newTerminalPin,
         status: 'pending',
         createdAt: serverTimestamp()
      });

      setTerminals([...terminals, newKioskLocal]);
      setNewTerminalName('');
      setNewTerminalPin('');
      toast.success(`Terminal paired! Code: ${pairingCode}`);
    } catch (e: any) {
      console.warn("Firebase Error: ", e);
      const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
      const newKioskLocal: KioskTerminal = {
         id: pairingCode, 
         tenantId: profile.tenantId,
         branchId: 'default',
         name: newTerminalName,
         pairingCode,
         adminPin: newTerminalPin,
         status: 'active',
         createdAt: new Date().toISOString()
      };
      setTerminals(prev => [...prev, newKioskLocal]);
      setNewTerminalName('');
      setNewTerminalPin('');
      toast.success(`Terminal paired locally! Code: ${pairingCode}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTerminal = async (id: string) => {
    setSaving(true);
    try {
      if (profile?.tenantId === 'demo-tenant-id') {
        const currentStored = (() => {
          try {
            return JSON.parse(localStorage.getItem('demo_kiosks') || '[]');
          } catch { return []; }
        })();
        const updated = currentStored.filter((t: any) => t.id !== id);
        localStorage.setItem('demo_kiosks', JSON.stringify(updated));
        setTerminals(prev => prev.filter(t => t.id !== id));
        toast.success("Terminal access revoked.");
        return;
      }

      await deleteDoc(doc(db, 'kiosks', id));
      setTerminals(prev => prev.filter(t => t.id !== id));
      toast.success("Terminal access revoked.");
    } catch (e: any) {
      console.warn("Delete Error: ", e);
      setTerminals(prev => prev.filter(t => t.id !== id));
      toast.success("Terminal access revoked.");
    } finally {
      setSaving(false);
    }
  };

  // --- SHIFTS MANAGEMENT ---
  const addShift = () => {
    if (!settings) return;
    if (limits && settings.shifts.length >= limits.maxShifts) {
        toast.info(`Your current plan allows ${limits.maxShifts} shift(s). Please upgrade to add more.`);
        return;
    }
    const newShift: ShiftConfig = {
      id: `shift_${Date.now()}`, name: 'New Shift', startTime: '09:00', endTime: '18:00',
      gracePeriodMins: 15, maxGraceAllowed: 3, breakDurationMins: 60, minOvertimeMins: 60, minHalfDayHours: 4
    };
    setSettings({ ...settings, shifts: [...settings.shifts, newShift] });
    toast.success("Shift added. Click Save to apply.");
  };

  const updateShift = (id: string, updates: Partial<ShiftConfig>) => {
    if (!settings) return;
    setSettings({
      ...settings,
      shifts: settings.shifts.map(s => s.id === id ? { ...s, ...updates } : s)
    });
  };

  const removeShift = (id: string) => {
    if (!settings || id === 'default') return;
    setSettings({ ...settings, shifts: settings.shifts.filter(s => s.id !== id) });
    toast.info("Shift removed. Click Save to apply.");
  };

  // --- BRANCH MANAGEMENT ---
  const addBranch = () => {
    if (!settings) return;
    if (!limits?.multiBranchEnabled && (settings.branches?.length || 0) >= 1) {
        toast.info("Multiple branches requires Enterprise plan. Please upgrade in Billing.");
        return;
    }
    const newBranch: Branch = { id: `branch_${Date.now()}`, name: 'New Branch' };
    setSettings({ ...settings, branches: [...(settings.branches || []), newBranch] });
    toast.success("Branch added. Click Save to apply.");
  };

  const updateBranch = (id: string, name: string) => {
    if (!settings) return;
    setSettings({ ...settings, branches: settings.branches?.map(b => b.id === id ? { ...b, name } : b) });
  };

  const removeBranch = (id: string) => {
    if (!settings || id === 'default') return;
    setSettings({ ...settings, branches: settings.branches?.filter(b => b.id !== id) });
    toast.info("Branch removed. Click Save to apply.");
  };

  const handleSetLocation = (branchId: string) => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser.");
      return;
    }
    setSaving(true); 
    navigator.geolocation.getCurrentPosition(async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      let addressName = "Location captured (Address not found)";

      try {
         const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
         const data = await res.json();
         if (data && data.display_name) addressName = data.display_name;
      } catch (err) {
         console.warn("Reverse geocoding failed", err);
      }

      setSettings(s => s ? {
        ...s,
        branches: s.branches?.map(b => b.id === branchId ? { ...b, location: { lat, lng, radius: 200, address: addressName } } : b)
      } : null);
      
      setSaving(false);
      toast.success('Location acquired! Click Save to apply.');
    }, (err) => {
        setSaving(false);
        toast.error(`Failed to get location: ${err.message}`);
    });
  };

  // --- DEPARTMENTS MANAGEMENT ---
  const addDepartment = () => {
    if (!settings || !newDept.trim()) return;
    const currentDepts = settings.departments || [];
    if (!currentDepts.includes(newDept.trim())) {
      setSettings({ ...settings, departments: [...currentDepts, newDept.trim()] });
    }
    setNewDept('');
  };

  const removeDepartment = (dept: string) => {
    if (!settings) return;
    setSettings({ ...settings, departments: settings.departments?.filter(d => d !== dept) });
  };

  // --- HOLIDAY CALENDAR MANAGEMENT ---
  const toggleWeeklyOff = (dayId: number) => {
    if (!settings) return;
    const currentDays = settings.weeklyOffs?.defaultDays || [0];
    let newDays;
    if (currentDays.includes(dayId)) newDays = currentDays.filter(d => d !== dayId);
    else newDays = [...currentDays, dayId].sort((a,b) => a - b);

    setSettings({
        ...settings,
        weeklyOffs: {
            ...(settings.weeklyOffs || { saturdayRule: 'NONE' }),
            defaultDays: newDays
        }
    });
  };

  const updateSaturdayRule = (rule: any) => {
    if (!settings) return;
    setSettings({
        ...settings,
        weeklyOffs: {
            ...(settings.weeklyOffs || { defaultDays: [0] }),
            saturdayRule: rule
        }
    });
  };

  const handleAddHoliday = (e: React.MouseEvent) => {
    e.preventDefault(); 
    if (!newHolidayName.trim() || !newHolidayDate) return;
    const newHoliday = {
        id: `hol_${Date.now()}`, name: newHolidayName.trim(), date: newHolidayDate, isPaid: newHolidayPaid
    };
    setSettings(prevSettings => {
        if (!prevSettings) return prevSettings;
        const existingHolidays = prevSettings.holidays || [];
        return {
            ...prevSettings,
            holidays: [...existingHolidays, newHoliday].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        };
    });
    setNewHolidayName(''); setNewHolidayDate(''); setNewHolidayPaid(true);
  };

  const removeHoliday = (id: string) => {
    setSettings(prevSettings => {
        if (!prevSettings) return prevSettings;
        return { ...prevSettings, holidays: (prevSettings.holidays || []).filter(h => h.id !== id) };
    });
  };

  const handleAddNationalHolidays = () => {
    const currentYear = new Date().getFullYear();
    const nationalHolidays = [
      { id: `hol_rep_${currentYear}`, name: 'Republic Day', date: `${currentYear}-01-26`, isPaid: true },
      { id: `hol_may_${currentYear}`, name: 'May Day / Labour Day', date: `${currentYear}-05-01`, isPaid: true },
      { id: `hol_ind_${currentYear}`, name: 'Independence Day', date: `${currentYear}-08-15`, isPaid: true },
      { id: `hol_gan_${currentYear}`, name: 'Gandhi Jayanti', date: `${currentYear}-10-02`, isPaid: true },
      { id: `hol_diw_${currentYear}`, name: 'Diwali', date: `${currentYear}-11-08`, isPaid: true }
    ];

    setSettings(prev => {
      if (!prev) return prev;
      const existing = prev.holidays || [];
      const existingDates = new Set(existing.map(h => h.date));
      const newItems = nationalHolidays.filter(h => !existingDates.has(h.date));
      return {
        ...prev,
        holidays: [...existing, ...newItems].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      };
    });
    toast.success("Added 5 gazetted national holidays!");
  };

  const applyRecommendedDefaults = () => {
    if (!settings) return;
    const currentYear = new Date().getFullYear();
    const standardShifts: ShiftConfig[] = [
      {
        id: 'shift_general',
        name: 'General Day Shift',
        startTime: '09:00',
        endTime: '18:00',
        gracePeriodMins: 15,
        maxGraceAllowed: 3,
        breakDurationMins: 60,
        minOvertimeMins: 60,
        minHalfDayHours: 4
      }
    ];

    const standardHolidays = [
      { id: `hol_rep_${currentYear}`, name: 'Republic Day', date: `${currentYear}-01-26`, isPaid: true },
      { id: `hol_may_${currentYear}`, name: 'May Day / Labour Day', date: `${currentYear}-05-01`, isPaid: true },
      { id: `hol_ind_${currentYear}`, name: 'Independence Day', date: `${currentYear}-08-15`, isPaid: true },
      { id: `hol_gan_${currentYear}`, name: 'Gandhi Jayanti', date: `${currentYear}-10-02`, isPaid: true },
      { id: `hol_diw_${currentYear}`, name: 'Diwali', date: `${currentYear}-11-08`, isPaid: true }
    ];

    const updatedSettings: OrgSettings = {
      ...settings,
      shifts: settings.shifts?.length ? settings.shifts : standardShifts,
      enableBreakTracking: true,
      strictLiveness: false,
      departments: Array.from(new Set([...(settings.departments || []), 'Production', 'Packaging', 'Quality Control', 'Maintenance', 'Loading & Dispatch'])),
      weeklyOffs: {
        defaultDays: [0],
        saturdayRule: 'NONE'
      },
      holidays: (settings.holidays && settings.holidays.length > 0) ? settings.holidays : standardHolidays,
      enableSandwichRule: true,
      holidayPayMultiplier: 2.0,
      compliance: {
        pfRegistrationNumber: settings.compliance?.pfRegistrationNumber || 'MH/BAN/0012345/000',
        esicCode: settings.compliance?.esicCode || '31000123450000101',
        capPfDeduction: true,
        dailyWagePfPercentage: 100,
        pfContributionRate: 12,
        epsContributionRate: 8.33,
        epfWageCeiling: 15000
      }
    };

    setSettings(updatedSettings);

    if (!orgProfile.companyName && profile?.companyName) {
      setOrgProfile(prev => ({ ...prev, companyName: profile.companyName || '' }));
    }

    toast.success("Standard factory setup applied! Check each tab and click Save Changes.");
  };

  const setupSteps = [
    { 
      id: 'profile', 
      label: 'Site Profile', 
      done: Boolean(orgProfile.companyName?.trim()), 
      tab: 'GENERAL' as const,
      hint: 'Company & factory name'
    },
    { 
      id: 'shifts', 
      label: 'Shift & Grace', 
      done: Boolean(settings?.shifts && settings.shifts.length > 0), 
      tab: 'SHIFTS' as const,
      hint: '9h shift, 15m grace'
    },
    { 
      id: 'geofence', 
      label: 'GPS Geofence', 
      done: Boolean(settings?.branches?.some(b => b.location?.lat)), 
      tab: 'BRANCHES' as const,
      hint: 'Lock GPS coordinates'
    },
    { 
      id: 'calendar', 
      label: 'Rest Days & PH', 
      done: Boolean(settings?.weeklyOffs?.defaultDays?.length), 
      tab: 'CALENDAR' as const,
      hint: 'Sunday off + holidays'
    },
    { 
      id: 'compliance', 
      label: 'EPFO & ESIC', 
      done: Boolean(settings?.compliance?.pfContributionRate), 
      tab: 'COMPLIANCE' as const,
      hint: '12% PF & 0.75% ESI'
    },
    { 
      id: 'terminals', 
      label: 'Gate Terminal', 
      done: terminals.length > 0, 
      tab: 'TERMINALS' as const,
      hint: 'Pair tablet with PIN'
    }
  ];

  const completedStepsCount = setupSteps.filter(s => s.done).length;

  // --- GLOBAL SAVE ---
  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      if (profile.tenantId && settings) {
        await dbService.saveOrgSettings(profile.tenantId, settings);
        setInitialSettings(settings); 
      }
      if (JSON.stringify(orgProfile) !== JSON.stringify(initialOrgProfile)) {
        const userId = profile.uid; 
        if (userId && profile.tenantId !== 'demo-tenant-id' && !userId.startsWith('demo-')) {
          try {
            await updateDoc(doc(db, "users", userId), { companyName: orgProfile.companyName, name: orgProfile.ownerName });
          } catch (err) {
            console.warn("Could not update users collection in Firestore:", err);
          }
        }
        setInitialOrgProfile(orgProfile);
      }
      setMessage({ type: 'success', text: 'Changes saved successfully!' });
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Failed to save changes.' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const discardChanges = () => {
      setSettings(initialSettings);
      setOrgProfile(initialOrgProfile);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-dvh bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    // Mobile Optimization: 100dvh and massive pb-40 so floating action bar doesn't cover lowest inputs when keyboard opens
    <div className="space-y-6 pb-28">
      {/* TOOLBAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Factory Settings & Operations</h1>
          <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
            <span>Configure branches, shifts, leave rules, statutory returns & terminals</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums text-slate-600">{settings?.shifts?.length || 0} shifts active</span>
          </div>
        </div>

        <button 
          onClick={() => setShowGuide(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 border border-indigo-200/80 rounded-xl text-xs font-semibold shadow-2xs transition-all active:scale-95 self-start sm:self-auto"
        >
          <BookOpen size={15} className="text-indigo-600" />
          <span>Factory Setup Guide</span>
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl flex items-center shadow-xs animate-in fade-in slide-in-from-top-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
          {message.type === 'success' ? <CheckCircle size={18} className="mr-2.5 text-emerald-600 shrink-0"/> : <AlertCircle size={18} className="mr-2.5 text-rose-600 shrink-0"/>}
          <span className="text-xs font-semibold">{message.text}</span>
        </div>
      )}

      {/* ======================= EASY SETUP ASSISTANT ======================= */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-md border border-indigo-900/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-md bg-indigo-500/30 text-indigo-200 border border-indigo-400/20">
                  Easy Factory Setup
                </span>
                <span className="text-xs text-indigo-300 font-mono">
                  {completedStepsCount} of {setupSteps.length} Steps Ready
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white mt-1">
                Configure Factory Rules &amp; Operations
              </h2>
              <p className="text-xs text-indigo-200/90 mt-0.5 max-w-2xl leading-relaxed">
                Set up your working shifts, factory perimeter geofence, holiday calendar, and EPFO/ESIC statutory standards in minutes.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={applyRecommendedDefaults}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95"
                title="Auto-fill recommended Indian factory configuration"
              >
                <Wand2 size={14} />
                <span>Auto-Fill Factory Defaults</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSetupAssistant(!showSetupAssistant)}
                className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                title={showSetupAssistant ? "Collapse checklist" : "Expand checklist"}
              >
                {showSetupAssistant ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-800/80 rounded-full h-2 mt-4 overflow-hidden border border-white/10">
            <div 
              className="bg-gradient-to-r from-blue-500 via-indigo-400 to-emerald-400 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(completedStepsCount / setupSteps.length) * 100}%` }}
            />
          </div>

          {/* Interactive Steps Grid */}
          {showSetupAssistant && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-4">
              {setupSteps.map(step => (
                <button
                  key={step.id}
                  onClick={() => setActiveTab(step.tab)}
                  className={`p-3 rounded-2xl border text-left transition-all group flex flex-col justify-between ${
                    step.done 
                      ? 'bg-white/10 border-emerald-500/30 hover:bg-white/15' 
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  } ${activeTab === step.tab ? 'ring-2 ring-indigo-400' : ''}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-mono text-indigo-300">
                      {step.tab}
                    </span>
                    {step.done ? (
                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="text-xs font-bold text-white group-hover:text-indigo-200 transition-colors line-clamp-1">
                      {step.label}
                    </div>
                    <div className="text-[10px] text-indigo-200/70 line-clamp-1 mt-0.5">
                      {step.hint}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* --- SEGMENTED TABS CONTROLS --- */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-200/70 rounded-2xl overflow-x-auto scrollbar-none">
        {[
          { id: 'GENERAL', label: 'General', icon: Building },
          { id: 'SHIFTS', label: 'Shifts & Grace', icon: Clock },
          { id: 'CALENDAR', label: 'Holidays & Calendar', icon: CalendarDays },
          { id: 'LEAVES', label: 'Leave Policy', icon: Umbrella },
          { id: 'COMPLIANCE', label: 'Statutory (PF & ESI)', icon: Shield },
          { id: 'BRANCHES', label: 'Locations & Geofence', icon: GitBranch },
          { id: 'DEPARTMENTS', label: 'Departments', icon: Layers },
          { id: 'TERMINALS', label: 'Kiosk Terminals', icon: ScanFace }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 active:scale-95 ${
              activeTab === tab.id 
                ? 'bg-white text-slate-900 shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <tab.icon size={15} className={activeTab === tab.id ? 'text-blue-600' : 'text-slate-500'} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ======================= GENERAL TAB ======================= */}
      {activeTab === 'GENERAL' && (
        <div className="animate-in fade-in duration-300">
          <div className="px-1 mb-3">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Organization Profile</h3>
          </div>
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter ml-1">Company / Site Name</label>
                      <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <Building className="h-4 w-4 text-slate-400" />
                          </div>
                          <input 
                              type="text" 
                              className="w-full pl-10 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 min-h-12 transition-all" 
                              value={orgProfile.companyName} 
                              onChange={(e) => setOrgProfile({...orgProfile, companyName: e.target.value})} 
                              placeholder="Enter your factory name"
                          />
                      </div>
                  </div>
                  <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter ml-1">Admin / Owner Name</label>
                      <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <User className="h-4 w-4 text-slate-400" />
                          </div>
                          <input 
                              type="text" 
                              className="w-full pl-10 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 min-h-12 transition-all" 
                              value={orgProfile.ownerName} 
                              onChange={(e) => setOrgProfile({...orgProfile, ownerName: e.target.value})} 
                              placeholder="Your full name"
                          />
                      </div>
                  </div>
              </div>
          </div>

          <div className="px-1 mb-3">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Automated Rules</h3>
          </div>
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 mb-8">
            <label className="flex items-center justify-between mb-4 min-h-11 cursor-pointer">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-orange-50 rounded-xl">
                    <Coffee className="text-orange-500" size={20} />
                </div>
                <div>
                    <span className="text-sm font-black text-slate-800 uppercase tracking-tight block">Break Tracking</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Auto-Deduction Logic</span>
                </div>
              </div>
              <div className="relative inline-flex items-center ml-4">
                <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={settings?.enableBreakTracking || false} 
                    onChange={(e) => setSettings(s => s ? {...s, enableBreakTracking: e.target.checked} : null)}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </div>
            </label>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-6">
                <div className="flex items-center text-slate-600 mb-2">
                    <Info size={14} className="mr-2 text-indigo-500" />
                    <span className="text-xs font-bold">What does this do?</span>
                </div>
                <ul className="space-y-2">
                    <li className="text-[11px] text-slate-500 font-medium flex items-start leading-normal">
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-1 mr-2 shrink-0" />
                        Automatically deducts 1 hour (60 mins) from total working hours to account for lunch/rest periods.
                    </li>
                </ul>
            </div>

            {limits?.livenessDetectionEnabled ? (
                <label className="flex items-center justify-between mb-4 pt-6 border-t border-slate-100 min-h-11 cursor-pointer">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-purple-50 rounded-xl">
                        <ScanFace className="text-purple-500" size={20} />
                    </div>
                    <div>
                        <span className="text-sm font-black text-slate-800 uppercase tracking-tight block">Strict Liveness Detection</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Anti-Spoofing & Proxy Prevention</span>
                    </div>
                  </div>
                  <div className="relative inline-flex items-center ml-4">
                    <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={settings?.strictLiveness || false} 
                        onChange={(e) => setSettings(s => s ? {...s, strictLiveness: e.target.checked} : null)}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </div>
                </label>
            ) : (
                <div className="flex items-center justify-between mb-4 pt-6 border-t border-slate-100 min-h-11">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-purple-50 rounded-xl"><ScanFace className="text-purple-500" size={20} /></div>
                    <div>
                        <span className="text-sm font-black text-slate-800 uppercase tracking-tight block text-opacity-50">Strict Liveness Detection</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Anti-Spoofing & Proxy Prevention</span>
                    </div>
                  </div>
                  <span className="bg-purple-100 text-purple-800 text-[10px] px-2 py-1 rounded font-black tracking-wide uppercase shrink-0">Pro Feature</span>
                </div>
            )}

            {limits?.livenessDetectionEnabled ? (
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex items-center text-slate-600 mb-2">
                        <Info size={14} className="mr-2 text-purple-500" />
                        <span className="text-xs font-bold">What does this do?</span>
                    </div>
                    <ul className="space-y-2">
                        <li className="text-[11px] text-slate-500 font-medium flex items-start leading-normal">
                            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full mt-1 mr-2 shrink-0" />
                            Requires workers to physically blink when facing the Kiosk.
                        </li>
                        <li className="text-[11px] text-slate-500 font-medium flex items-start leading-normal">
                            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full mt-1 mr-2 shrink-0" />
                            Prevents "Proxy Punching" via printed photos or phone screens. Logs 3 failed attempts to Admin Notifications.
                        </li>
                    </ul>
                </div>
            ) : (
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 opacity-70">
                    <p className="text-xs text-slate-500">Requires workers to physically blink when facing the Kiosk. Upgrade to Pro to unlock anti-spoofing.</p>
                </div>
            )}
          </div>

          <div className="px-1 mb-3">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Government Statutory Standards (EPFO & ESIC)</h3>
          </div>
          
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Shield size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <span>Indian Statutory Return Settings</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Standard Compliant
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-xl">
                    Configure your <strong>EPFO Establishment ID</strong>, <strong>ESIC Employer Code</strong>, contribution percentages (12% EPF / 8.33% EPS / 0.75% ESIC), and wage ceilings for Form T, ECR 2.0 text file, and ESIC returns.
                  </p>
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-600 font-mono">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      EPFO: {settings?.compliance?.pfRegistrationNumber || 'Not configured'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                      ESIC: {settings?.compliance?.esicCode || 'Not configured'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      EPF Cap: ₹15,000 | ESIC Cap: ₹21,000
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('COMPLIANCE')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all active:scale-95 shrink-0 self-start sm:self-center"
              >
                <span>Configure Statutory</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================= LEAVES POLICY TAB ======================= */}
      {activeTab === 'LEAVES' && (
        <div className="animate-in fade-in duration-300 space-y-6 mb-8">
          {/* Leaves Guidance Banner */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50/50 to-emerald-50 p-5 rounded-3xl border border-emerald-100 flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
              <Umbrella size={19} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-900 text-sm">Annual Leave Entitlements &amp; Policy</h4>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Labor Laws Standard
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Configure annual leave quotas granted to your workforce. Approved leaves are recorded under standard muster codes (CL/SL/PL) and count as paid days in monthly payroll without wage deduction.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3 text-xs">
                <div className="bg-white/80 p-3 rounded-xl border border-emerald-100/70">
                  <div className="font-bold text-slate-800 text-xs">Casual Leave (CL)</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">For urgent personal matters. Typically 7–12 days per calendar year.</div>
                </div>
                <div className="bg-white/80 p-3 rounded-xl border border-emerald-100/70">
                  <div className="font-bold text-slate-800 text-xs">Sick Leave (SL)</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">For medical recovery. Typically 7–10 days per calendar year.</div>
                </div>
                <div className="bg-white/80 p-3 rounded-xl border border-emerald-100/70">
                  <div className="font-bold text-slate-800 text-xs">Privilege Leave (PL)</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Earned annual leave under Factories Act (1 day earned for every 20 days worked).</div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-1 mb-3">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Annual Leave Balances</h3>
          </div>
            
            {limits?.advancedLeavesEnabled ? (
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-6">
                    <p className="text-sm text-slate-500 font-medium">Define the default number of leaves granted to workers annually.</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block ml-1">Casual Leaves (CL)</label>
                            <input type="number" className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none min-h-12" 
                                value={settings?.leavePolicy?.cl || 0} onChange={(e) => setSettings(s => s ? {...s, leavePolicy: {...(s.leavePolicy || {cl:0, sl:0, pl:0, allowNegativeBalance: false}), cl: Number(e.target.value)}} : null)} 
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block ml-1">Sick Leaves (SL)</label>
                            <input type="number" className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none min-h-12" 
                                value={settings?.leavePolicy?.sl || 0} onChange={(e) => setSettings(s => s ? {...s, leavePolicy: {...(s.leavePolicy || {cl:0, sl:0, pl:0, allowNegativeBalance: false}), sl: Number(e.target.value)}} : null)} 
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block ml-1">Privilege Leaves (PL)</label>
                            <input type="number" className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none min-h-12" 
                                value={settings?.leavePolicy?.pl || 0} onChange={(e) => setSettings(s => s ? {...s, leavePolicy: {...(s.leavePolicy || {cl:0, sl:0, pl:0, allowNegativeBalance: false}), pl: Number(e.target.value)}} : null)} 
                            />
                        </div>
                    </div>

                    <label className="pt-6 border-t border-slate-100 flex items-center justify-between cursor-pointer min-h-11">
                        <div>
                            <span className="text-sm font-bold text-slate-800 block">Allow Negative Balances</span>
                            <span className="text-[11px] text-slate-500 mt-1 max-w-sm block">If toggled off, any leave applied when balance is 0 will automatically convert to Unpaid Leave (LWP).</span>
                        </div>
                        <div className="relative inline-flex items-center ml-4 shrink-0">
                            <input type="checkbox" className="sr-only peer" 
                                checked={settings?.leavePolicy?.allowNegativeBalance ?? false} 
                                onChange={(e) => setSettings(s => s ? {...s, leavePolicy: {...(s.leavePolicy || {cl:0, sl:0, pl:0}), allowNegativeBalance: e.target.checked}} : null)}
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        </div>
                    </label>
                </div>
            ) : (
                <div className="bg-gray-100 rounded-3xl shadow-inner border border-gray-200 p-6 opacity-70">
                    <div className="flex items-center mb-2">
                        <Lock className="text-gray-500 mr-2" size={18} />
                        <h3 className="font-bold text-gray-800">Advanced Leaves Locked</h3>
                    </div>
                    <p className="text-xs text-gray-600">
                        Tracking structured paid leaves (CL/SL/PL) and negative balances requires the Pro Plan.
                    </p>
                </div>
            )}
        </div>
      )}

      {/* ======================= HOLIDAY CALENDAR TAB ======================= */}
      {activeTab === 'CALENDAR' && (
        <div className="animate-in fade-in duration-300 space-y-8 mb-8">
          {/* Calendar Guidance Banner */}
          <div className="bg-gradient-to-r from-indigo-50 via-blue-50/50 to-indigo-50 p-5 rounded-3xl border border-indigo-100 flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
              <CalendarDays size={19} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-900 text-sm">Weekly Rest Days &amp; Factory Public Holidays</h4>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Muster Roll Form T
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Weekly off days (e.g. Sunday) and registered paid holidays (PH) reflect on the daily muster roll columns. Under standard Indian factory wage practices, permanent and regular staff receive paid weekly offs.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3 text-xs">
                <div className="bg-white/80 p-3 rounded-xl border border-indigo-100/70">
                  <div className="font-bold text-slate-800 text-xs">Sandwich Rule</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">When enabled, if a worker is absent on both the day before AND after a holiday/weekly off, that rest day becomes unpaid.</div>
                </div>
                <div className="bg-white/80 p-3 rounded-xl border border-indigo-100/70">
                  <div className="font-bold text-slate-800 text-xs">Holiday Worked Multiplier</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Employees who work on a declared holiday earn premium pay (default 2.0x standard rate).</div>
                </div>
              </div>
            </div>
          </div>
            
            {/* WEEKLY OFFS */}
            <section>
                <div className="px-1 mb-3">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Weekly Offs</h3>
                </div>
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                    <p className="text-sm font-bold text-slate-800 mb-4">Select default weekly off days</p>
                    <div className="flex flex-wrap gap-3 mb-6">
                        {DAYS_OF_WEEK.map((day) => {
                            const isSelected = settings?.weeklyOffs?.defaultDays?.includes(day.id) ?? (day.id === 0);
                            return (
                                <button
                                    key={day.id}
                                    onClick={() => toggleWeeklyOff(day.id)}
                                    className={`px-4 min-h-11 rounded-2xl text-sm font-bold transition-all border ${
                                        isSelected 
                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' 
                                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                    }`}
                                >
                                    {day.label}
                                </button>
                            );
                        })}
                    </div>

                    {(settings?.weeklyOffs?.defaultDays?.includes(6) || false) && (
                        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl animate-in fade-in slide-in-from-top-2">
                            <label className="text-[10px] font-black text-indigo-800 uppercase mb-2 block tracking-tighter ml-1">Saturday Working Rule</label>
                            <select 
                                className="w-full md:w-1/2 p-3.5 bg-white border border-indigo-200 rounded-xl text-sm font-bold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-12"
                                value={settings?.weeklyOffs?.saturdayRule || 'ALL'}
                                onChange={(e) => updateSaturdayRule(e.target.value)}
                            >
                                <option value="ALL">All Saturdays are Off</option>
                                <option value="ALTERNATE">Alternate Saturdays (2nd & 4th Off)</option>
                                <option value="FIRST_THIRD">1st & 3rd Saturdays Off</option>
                            </select>
                        </div>
                    )}
                </div>
            </section>

            {/* SANDWICH RULE & HOLIDAY PAY */}
            <section>
                <div className="px-1 mb-3">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Payroll Rules</h3>
                </div>
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-bold text-slate-800">Enable Sandwich Rule</p>
                            <p className="text-[11px] text-slate-500 mt-1 max-w-sm">If a worker is absent on the day before AND the day after a holiday/weekly off, the holiday becomes unpaid.</p>
                        </div>
                        {limits?.advancedLeavesEnabled ? (
                        <label className="relative inline-flex items-center cursor-pointer ml-4 min-h-11">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={settings?.enableSandwichRule ?? false} 
                                onChange={(e) => setSettings(s => s ? {...s, enableSandwichRule: e.target.checked} : null)}
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                        </label>
                        ) : (
                          <span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-1 rounded font-black tracking-wide uppercase shadow-sm ml-4 whitespace-nowrap"><Lock size={10} className="inline mr-1 mb-0.5"/> Pro Plan</span>
                        )}
                    </div>

                    <div className="border-t border-slate-100 pt-6">
                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter ml-1">Holiday Pay Multiplier</label>
                        <div className="flex items-center space-x-3">
                            <div className="relative">
                                <input 
                                    type="number" 
                                    step="0.5" min="1" max="5"
                                    className="w-24 pl-3 pr-8 py-3.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 min-h-12" 
                                    value={settings?.holidayPayMultiplier || 2.0} 
                                    onChange={(e) => setSettings(s => s ? {...s, holidayPayMultiplier: Number(e.target.value)} : null)} 
                                />
                                <span className="absolute right-3 top-4 text-xs font-bold text-slate-400">x</span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-tight max-w-50">
                                Rate applied when a worker physically checks in on a declared holiday or weekly off.
                            </p>
                        </div>
                    </div>

                </div>
            </section>

            {/* PUBLIC HOLIDAYS */}
            <section>
                <div className="px-1 mb-3 flex justify-between items-end">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Public Holidays</h3>
                </div>
                
                {limits?.publicHolidaysEnabled ? (
                  <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                      <div className="p-6 bg-slate-50 border-b border-slate-100">
                          <h4 className="text-sm font-black text-slate-800 mb-4 tracking-tight">Register New Holiday</h4>
                          
                          <div className="flex flex-col md:flex-row flex-wrap gap-4">
                              <div className="flex-1 min-w-50">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block ml-1">Holiday Name</label>
                                  <input 
                                      type="text" 
                                      placeholder="e.g. Diwali, Holi" 
                                      className="w-full min-h-12 px-4 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 shadow-sm"
                                      value={newHolidayName}
                                      onChange={(e) => setNewHolidayName(e.target.value)}
                                  />
                              </div>

                              <div className="w-full md:w-40">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block ml-1">Date</label>
                                  <input 
                                      type="date" 
                                      className="w-full min-h-12 px-4 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 shadow-sm"
                                      value={newHolidayDate}
                                      onChange={(e) => setNewHolidayDate(e.target.value)}
                                  />
                              </div>
                              
                              <div className="w-full md:w-40">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block ml-1">Pay Type</label>
                                  <select 
                                      className="w-full min-h-12 px-4 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 shadow-sm appearance-none"
                                      value={newHolidayPaid ? 'PAID' : 'UNPAID'}
                                      onChange={(e) => setNewHolidayPaid(e.target.value === 'PAID')}
                                  >
                                      <option value="PAID">Paid (Full Wage)</option>
                                      <option value="UNPAID">Unpaid</option>
                                  </select>
                              </div>

                              <div className="w-full md:w-28 flex items-end">
                                  <button 
                                      type="button"
                                      onClick={handleAddHoliday}
                                      disabled={!newHolidayName.trim() || !newHolidayDate}
                                      className="w-full min-h-12 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center shadow-md shadow-indigo-100"
                                  >
                                      <Plus size={18} className="mr-1"/> Add
                                  </button>
                              </div>
                          </div>
                      </div>
                      
                      <div className="p-2">
                          {(settings?.holidays || []).length > 0 ? (
                              <div className="divide-y divide-slate-50">
                                  {settings?.holidays?.map((holiday) => (
                                      <div key={holiday.id} className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors">
                                          <div className="flex items-center space-x-4">
                                              <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden text-center min-w-16 flex flex-col">
                                                  <div className={`text-[10px] font-black uppercase py-1 tracking-widest ${holiday.isPaid ? 'bg-indigo-500 text-white' : 'bg-slate-400 text-white'}`}>
                                                      {new Date(holiday.date).toLocaleDateString('en-US', { month: 'short' })}
                                                  </div>
                                                  <div className="text-xl font-black text-slate-800 py-1.5">
                                                      {new Date(holiday.date).getDate()}
                                                  </div>
                                              </div>
                                              
                                              <div>
                                                  <h4 className="font-bold text-slate-800 text-base leading-tight">{holiday.name}</h4>
                                                  <span className={`text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded flex items-center w-max mt-1.5 ${holiday.isPaid ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                                                      {holiday.isPaid ? 'Paid Holiday' : 'Unpaid Holiday'}
                                                  </span>
                                              </div>
                                          </div>
                                          {/* Mobile Optimization: w-11 h-11 wrapper ensures > 44px touch area */}
                                          <div className="w-11 h-11 flex items-center justify-center">
                                            <button 
                                                type="button"
                                                onClick={() => removeHoliday(holiday.id)}
                                                className="text-slate-400 hover:text-red-500 bg-white hover:bg-red-50 p-2.5 rounded-xl border border-slate-100 hover:border-red-100 transition-all shadow-sm"
                                            >
                                                <Trash2 size={18}/>
                                            </button>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          ) : (
                              <div className="p-10 text-center text-slate-400">
                                  <CalendarDays size={48} className="mx-auto text-slate-200 mb-3" />
                                  <p className="text-sm font-medium">No public holidays registered.</p>
                              </div>
                          )}
                      </div>
                  </div>
                ) : (
                  <div className="bg-gray-100 rounded-3xl shadow-inner border border-gray-200 p-6 opacity-70">
                      <div className="flex items-center mb-2">
                          <Lock className="text-gray-500 mr-2" size={18} />
                          <h3 className="font-bold text-gray-800">Public Holidays Locked</h3>
                      </div>
                      <p className="text-xs text-gray-600">
                          Managing public holidays and specific holiday multi-pay is available on the Starter plan and above.
                      </p>
                  </div>
                )}
            </section>
        </div>
      )}

      {/* ======================= SHIFTS TAB ======================= */}
      {activeTab === 'SHIFTS' && (
        <div className="space-y-6 mb-8 animate-in fade-in duration-300">
          {/* Shift Guidance Info Banner */}
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50/50 to-blue-50 p-5 rounded-3xl border border-blue-100 flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
              <Clock size={19} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-900 text-sm">Shift Schedules &amp; Overtime Rules</h4>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200">
                  Factories Act Compliant
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Define operational shifts for your factory workforce. Attendance punches at gate terminals are automatically validated against these shift parameters.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3 text-xs">
                <div className="bg-white/80 p-3 rounded-xl border border-blue-100/70">
                  <div className="font-bold text-slate-800 text-xs">Grace Period</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Late arrival grace (e.g. 15 mins). After maximum monthly grace strikes, record flags for review.</div>
                </div>
                <div className="bg-white/80 p-3 rounded-xl border border-blue-100/70">
                  <div className="font-bold text-slate-800 text-xs">Overtime (2x Pay)</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Under the Indian Factories Act, working past the OT trigger minutes earns overtime at double rate.</div>
                </div>
                <div className="bg-white/80 p-3 rounded-xl border border-blue-100/70">
                  <div className="font-bold text-slate-800 text-xs">Lunch / Rest Interval</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Auto-deduction subtracts 1 hour (60 min) for meal times when enabled in General settings.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-end px-1">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Active Shift Profiles</h3>
              <button onClick={addShift} className="text-indigo-600 text-sm font-bold flex items-center bg-indigo-50 px-4 min-h-11 rounded-xl hover:bg-indigo-100 transition-colors">
                  <Plus size={16} className="mr-1"/> Add New
              </button>
          </div>

          {settings?.shifts.map((shift) => (
            <div key={shift.id} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden transition-all">
              <div className="p-5 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                  <div className="flex items-center space-x-3 w-full">
                      <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 shrink-0">
                          <Clock className="text-indigo-500" size={18} />
                      </div>
                      <input className="font-black text-slate-800 bg-transparent border-b-2 border-transparent focus:border-indigo-500 outline-none px-1 w-full min-h-11" value={shift.name} onChange={(e) => updateShift(shift.id, { name: e.target.value })} disabled={shift.id === 'default'}/>
                  </div>
                  {shift.id !== 'default' && (
                    <div className="w-11 h-11 flex items-center justify-center shrink-0">
                      <button onClick={() => removeShift(shift.id)} className="text-slate-300 hover:text-red-500 transition-colors p-2"><Trash2 size={18} /></button>
                    </div>
                  )}
              </div>
              
              <div className="p-6 grid grid-cols-2 gap-x-4 gap-y-6">
                  <div className="col-span-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter ml-1">Shift Start</label>
                    <input type="time" className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none min-h-12" value={shift.startTime} onChange={(e) => updateShift(shift.id, { startTime: e.target.value })} />
                  </div>
                  <div className="col-span-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter ml-1">Shift End</label>
                    <input type="time" className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none min-h-12" value={shift.endTime} onChange={(e) => updateShift(shift.id, { endTime: e.target.value })} />
                  </div>
                  <div className="col-span-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter ml-1">Late Grace (Mins)</label>
                    <div className="relative">
                      <input type="number" className="w-full p-3.5 pr-8 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none min-h-12" value={shift.gracePeriodMins} onChange={(e) => updateShift(shift.id, { gracePeriodMins: parseInt(e.target.value) })} />
                      <span className="absolute right-3 top-4 text-[10px] font-bold text-slate-400">min</span>
                    </div>
                  </div>
                  <div className="col-span-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter ml-1">Allowed Late / Month</label>
                    <div className="relative">
                      <input type="number" className="w-full p-3.5 pr-8 bg-slate-50 border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none border-indigo-100 min-h-12" value={shift.maxGraceAllowed} onChange={(e) => updateShift(shift.id, { maxGraceAllowed: parseInt(e.target.value) })} />
                      <Calendar className="absolute right-3 top-4 text-indigo-300" size={14} />
                    </div>
                  </div>

                  <div className="col-span-2 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                    <label className="text-[10px] font-black text-blue-800 uppercase mb-1.5 block tracking-tighter ml-1">Min. Extra Mins to Trigger OT</label>
                    <div className="relative">
                      <input 
                         type="number" 
                         className="w-full p-3.5 pr-14 bg-white border border-blue-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none text-blue-900 min-h-12" 
                         value={shift.minOvertimeMins || 0} 
                         onChange={(e) => updateShift(shift.id, { minOvertimeMins: parseInt(e.target.value) || 0 })} 
                      />
                      <span className="absolute right-3 top-4 text-[10px] font-bold text-blue-400">minutes</span>
                    </div>
                    <p className="text-[9px] text-blue-600 mt-2 font-medium leading-relaxed">
                      Workers must stay this many minutes past Shift End for OT to count. (Prevents 5-minute punch-out delays from costing you).
                    </p>
                  </div>
                  
                  <div className="col-span-2">
                     <div className="bg-amber-50 rounded-2xl p-3 flex items-start">
                        <AlertCircle className="text-amber-500 mt-0.5 mr-2 shrink-0" size={14} />
                        <p className="text-[10px] leading-relaxed text-amber-700 font-medium">
                          If a worker exceeds <b>{shift.maxGraceAllowed} late arrivals</b> in a month, the system will flag the record for salary deduction or warning.
                        </p>
                     </div>
                  </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ======================= BRANCHES TAB ======================= */}
      {activeTab === 'BRANCHES' && (
        <div className="space-y-6 mb-8 animate-in fade-in duration-300">
          {/* Branches & Geofence Banner */}
          <div className="bg-gradient-to-r from-emerald-50 via-green-50/50 to-emerald-50 p-5 rounded-3xl border border-emerald-100 flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
              <MapPin size={19} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-900 text-sm">Factory Premises &amp; GPS Geofencing</h4>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Perimeter Security
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Pinpoint your physical factory GPS coordinates. When supervisors or workers punch on mobile devices, the system validates that they are within the boundary radius (e.g. 150m) to prevent remote off-site punching.
              </p>
            </div>
          </div>

          <div className="flex justify-between items-end px-1">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Factory Locations</h3>
              <button onClick={addBranch} className="text-indigo-600 text-sm font-bold flex items-center bg-indigo-50 px-4 min-h-11 rounded-xl hover:bg-indigo-100 transition-colors">
                  <Plus size={16} className="mr-1"/> Add Branch
              </button>
          </div>

          {!limits?.multiBranchEnabled && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start mb-4">
               <Lock className="text-amber-500 mt-0.5 mr-3 shrink-0" size={20} />
               <p className="text-xs font-medium text-amber-800">You are on the Starter/Pro plan. Multiple branches are supported on Enterprise plans only. You can still manage your primary location below.</p>
            </div>
          )}

          {settings?.branches?.map(branch => (
            <div key={branch.id} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden mb-6">
                <div className="p-5 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                    <div className="flex items-center space-x-3 w-full">
                        <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 shrink-0">
                            <Building className="text-indigo-500" size={18} />
                        </div>
                        <input className="font-black text-slate-800 bg-transparent border-b-2 border-transparent focus:border-indigo-500 outline-none px-1 w-full max-w-sm min-h-11" 
                            value={branch.name} onChange={(e) => updateBranch(branch.id, e.target.value)} disabled={branch.id === 'default'} placeholder="Branch Name"/>
                    </div>
                    {branch.id !== 'default' && (
                      <div className="w-11 h-11 flex items-center justify-center shrink-0 ml-2">
                        <button onClick={() => removeBranch(branch.id)} className="text-slate-300 hover:text-red-500 transition-colors p-2"><Trash2 size={18} /></button>
                      </div>
                    )}
                </div>

                <div className="p-6">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Location Geofencing</h4>
                  
                  {limits?.geofencingEnabled !== false ? (
                      <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 space-y-4 sm:space-y-0">
                              <div className="flex items-center space-x-3">
                                  <div className="p-2 bg-green-50 rounded-xl shrink-0">
                                      <MapPin className="text-green-500" size={16} />
                                  </div>
                                  <div>
                                      <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Factory GPS Base</p>
                                      <p className="text-[10px] text-slate-400 font-bold uppercase">Used for mobile punch validation</p>
                                  </div>
                              </div>
                              <button 
                                  onClick={() => handleSetLocation(branch.id)}
                                  className="text-xs font-bold bg-green-100 text-green-700 px-4 min-h-11 w-full sm:w-auto rounded-xl hover:bg-green-200 transition-colors flex items-center justify-center"
                              >
                                  {branch.location ? "Update Location" : "Set Location"}
                              </button>
                          </div>
                          
                          {branch.location ? (
                              <div className="bg-white p-4 rounded-xl border border-slate-100 flex flex-col space-y-2">
                                  <div className="flex items-start text-sm text-slate-700">
                                     <MapPin size={16} className="text-green-500 mr-2 mt-0.5 shrink-0"/>
                                     <span className="font-medium leading-tight">{branch.location.address || "Address not found"}</span>
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono ml-6">
                                      Lat: {branch.location.lat.toFixed(6)}, Lng: {branch.location.lng.toFixed(6)}
                                  </div>
                                  <div className="text-xs font-bold text-indigo-600 ml-6 mt-1 bg-indigo-50 inline-block px-2 py-1 rounded w-max">
                                      Enforcement Radius: {branch.location.radius} meters
                                  </div>
                              </div>
                          ) : (
                              <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100 flex items-center">
                                  <AlertCircle size={14} className="mr-2 shrink-0" />
                                  No location set. All mobile punches will be marked valid for this branch.
                              </p>
                          )}
                      </div>
                  ) : (
                      <div className="bg-gray-100 rounded-2xl shadow-inner border border-gray-200 p-6 opacity-70 relative overflow-hidden">
                         <div className="flex justify-between items-start mb-2 relative z-10">
                            <div className="flex items-center space-x-3">
                               <div className="p-2 bg-gray-200 rounded-xl"><Lock className="text-gray-500" size={20} /></div>
                               <h3 className="font-bold text-gray-800">Location Geofencing</h3>
                            </div>
                            <span className="bg-yellow-100 text-yellow-800 text-[10px] px-2 py-1 rounded font-black tracking-wide uppercase shadow-sm">Pro Feature</span>
                         </div>
                         <p className="text-xs text-gray-600 mt-2 relative z-10">
                            Ensure workers can only punch in when they are physically at the factory location. Upgrade to Pro to unlock GPS boundaries.
                         </p>
                      </div>
                  )}
                </div>
            </div>
          ))}
        </div>
      )}

      {/* ======================= DEPARTMENTS TAB ======================= */}
      {activeTab === 'DEPARTMENTS' && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 mb-8 animate-in fade-in duration-300">
           <div className="mb-4">
               <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Worker Departments</h3>
               <p className="text-[10px] text-slate-400 font-bold uppercase">Categorize your workforce into operational areas</p>
           </div>
           
           <div className="flex mb-6 relative">
               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                   <Layers className="h-4 w-4 text-slate-400" />
               </div>
               <input 
                  type="text" 
                  value={newDept} 
                  onChange={e => setNewDept(e.target.value)} 
                  placeholder="E.g. Logistics, Quality Control" 
                  className="flex-1 pl-10 p-3 bg-slate-50 border border-slate-100 rounded-l-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 min-h-12 transition-all"
               />
               <button 
                  onClick={addDepartment} 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 min-h-12 rounded-r-2xl font-bold transition-colors"
               >
                  <Plus size={18}/>
               </button>
           </div>
           
           <div className="flex flex-wrap gap-2">
               {settings?.departments?.map(dept => (
                   <div key={dept} className="bg-slate-50 border border-slate-100 px-3 min-h-11 rounded-xl flex items-center text-sm font-bold text-slate-700 shadow-sm">
                       {dept}
                       <button onClick={() => removeDepartment(dept)} className="ml-3 text-slate-300 hover:text-red-500 transition-colors p-1 -mr-1">
                           <X size={16}/>
                       </button>
                   </div>
               ))}
               {(!settings?.departments || settings.departments.length === 0) && (
                   <p className="text-xs text-slate-400 font-medium italic w-full p-4 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      No departments added yet. Add your first department above.
                   </p>
               )}
           </div>
        </div>
      )}

      {/* ======================= TERMINALS TAB ======================= */}
      {activeTab === 'TERMINALS' && (
        <div className="animate-in fade-in duration-300 mb-8 space-y-6">
          {/* Terminals Guidance Banner */}
          <div className="bg-gradient-to-r from-purple-50 via-indigo-50/50 to-purple-50 p-5 rounded-3xl border border-purple-100 flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
              <ScanFace size={19} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-900 text-sm">Gate Attendance Kiosks &amp; Tablets</h4>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-200">
                  AI Biometrics
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Mount any budget Android tablet, iPad, or mobile phone at your factory gate or department entry.
                Workers stand in front of the camera for instant facial recognition check-in, or scan their QR badge card.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3 text-xs">
                <div className="bg-white/80 p-3 rounded-xl border border-purple-100/70">
                  <div className="font-bold text-slate-800 text-xs">6-Digit Pairing Code</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Enter this code on the tablet when opening Kiosk Mode to pair it to your factory.</div>
                </div>
                <div className="bg-white/80 p-3 rounded-xl border border-purple-100/70">
                  <div className="font-bold text-slate-800 text-xs">4-Digit Supervisor PIN</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Required whenever a manager needs to unlock, calibrate, or exit the kiosk app.</div>
                </div>
              </div>
            </div>
          </div>

          {limits?.kioskEnabled ? (
            <>
               <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 mb-8">
                   <div className="mb-6">
                       <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Register New Kiosk</h3>
                       <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Generate a 6-digit pairing code to link a factory tablet</p>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter ml-1">Terminal Name</label>
                          <input 
                            type="text" 
                            placeholder="e.g., Main Gate, Packaging Dept" 
                            className="w-full p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-purple-500 outline-none min-h-12 transition-all" 
                            value={newTerminalName} 
                            onChange={e => setNewTerminalName(e.target.value)} 
                          />
                      </div>
                      
                      <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter ml-1">Admin Exit PIN</label>
                          <div className="relative">
                              <input 
                                type="text" 
                                maxLength={4} 
                                placeholder="4-digit PIN" 
                                className="w-full p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-sm font-bold tracking-widest focus:ring-2 focus:ring-purple-500 outline-none min-h-12 transition-all" 
                                value={newTerminalPin} 
                                onChange={e => setNewTerminalPin(e.target.value.replace(/\D/g, ''))} 
                              />
                              <Lock className="absolute right-4 top-4 text-slate-400" size={16} />
                          </div>
                          <p className="text-[9px] text-slate-500 mt-1.5 font-medium leading-relaxed">
                            Secret PIN required to unlock or exit the Kiosk Mode on the tablet.
                          </p>
                      </div>
                   </div>

                   <div className="flex justify-end pt-4 border-t border-slate-50">
                      <button 
                        onClick={handleGenerateTerminal} 
                        disabled={saving || !newTerminalName || newTerminalPin.length !== 4}
                        className="bg-purple-600 text-white px-8 min-h-13 font-bold rounded-xl hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-purple-200 w-full md:w-auto"
                      >
                        {saving ? <Loader2 className="animate-spin mr-2" size={18} /> : <ScanFace className="mr-2" size={18} />}
                        {saving ? 'Generating...' : 'Generate Pairing Code'}
                      </button>
                   </div>
               </div>

               <div className="space-y-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 px-1">Active Terminals</h3>
                  {terminals.map(terminal => (
                     <div key={terminal.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex justify-between items-center">
                        <div>
                           <h4 className="font-bold text-slate-800">{terminal.name}</h4>
                           <p className="text-xs text-slate-500 font-mono mt-1">
                              Pairing Code: <span className="font-bold text-purple-600 tracking-widest text-sm">{terminal.pairingCode}</span>
                           </p>
                        </div>
                        <div className="w-11 h-11 flex items-center justify-center shrink-0">
                          <button 
                            onClick={() => handleDeleteTerminal(terminal.id)} 
                            disabled={saving}
                            className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition disabled:opacity-50"
                          >
                            <Trash2 size={20}/>
                          </button>
                        </div>
                     </div>
                  ))}
                  {terminals.length === 0 && (
                    <p className="text-center text-slate-400 text-xs py-8 bg-white rounded-3xl border border-dashed border-slate-200">
                      No active terminals. Generate a code above to get started.
                    </p>
                  )}
               </div>
            </>
          ) : (
            <div className="bg-gray-100 rounded-3xl shadow-inner border border-gray-200 p-6 opacity-70">
                <div className="flex items-center mb-2">
                    <Lock className="text-gray-500 mr-2" size={24} />
                    <h3 className="font-bold text-gray-800 text-lg">Kiosk Terminals Locked</h3>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                    Generating codes to pair factory tablets as dedicated AI Attendance Kiosks is a premium feature. Please upgrade your plan to unlock facial recognition terminals.
                </p>
            </div>
          )}
        </div>
      )}

      {/* ======================= COMPLIANCE TAB (EPFO & ESIC) ======================= */}
      {activeTab === 'COMPLIANCE' && (
        <div className="animate-in fade-in duration-300 space-y-6">
          {/* Header banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 rounded-3xl shadow-sm border border-indigo-900/40 flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-950/50 mt-0.5">
              <Shield size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white tracking-tight">Government Statutory Returns (EPFO & ESIC)</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  Indian Standards
                </span>
              </div>
              <p className="text-xs text-indigo-200 mt-1 leading-relaxed">
                Configure your establishment identification codes and contribution parameters. These values directly drive your monthly EPFO ECR 2.0 text file, ESIC portal upload sheets, and Form T Monthly Muster Roll.
              </p>
            </div>
          </div>

          {/* Section 1: EPFO Configuration */}
          <div className="px-1 mb-1">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">1. EPFO (Employees' Provident Fund Organisation)</h3>
          </div>
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter ml-1">
                  PF Establishment Code / Registration No.
                </label>
                <input
                  type="text"
                  className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold font-mono focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 transition-all uppercase placeholder:normal-case placeholder:font-sans"
                  value={settings?.compliance?.pfRegistrationNumber || ''}
                  onChange={(e) => setSettings(s => s ? {
                    ...s,
                    compliance: { ...(s.compliance || {}), pfRegistrationNumber: e.target.value.toUpperCase() }
                  } : null)}
                  placeholder="e.g. GJ/AHM/0034821/000"
                />
                <p className="text-[11px] text-slate-400 mt-1.5 ml-1">
                  Your official EPFO Establishment ID printed on monthly TRRN challans and Form T Muster Roll.
                </p>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter ml-1">
                  EPF Statutory Wage Ceiling
                </label>
                <div className="flex items-center p-3.5 bg-slate-100 border border-slate-200/60 rounded-2xl text-sm font-bold font-mono text-slate-700">
                  <span>₹ 15,000 / month</span>
                  <span className="ml-auto text-[10px] font-sans font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    Statutory Limit
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 ml-1">
                  Prescribed wage ceiling under the Employees' Provident Funds Scheme, 1952.
                </p>
              </div>
            </div>

            {/* Ceiling Cap Switch */}
            <div className="pt-4 border-t border-slate-100">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm font-bold text-slate-800 block">Cap EPF Deductions at Statutory Ceiling (₹15,000)</span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Limits employee share to ₹1,800 (12%) and employer EPS pension to ₹1,250 (8.33%). Recommended for standard factory operations.
                  </span>
                </div>
                <div className="relative inline-flex items-center ml-4 shrink-0">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={settings?.compliance?.capPfDeduction !== false} 
                    onChange={(e) => setSettings(s => s ? {
                      ...s,
                      compliance: { ...(s.compliance || {}), capPfDeduction: e.target.checked }
                    } : null)}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </div>
              </label>
            </div>

            {/* Daily Wage PF Base Percentage */}
            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Daily Wage Laborer EPF Consideration Base</span>
                  <span className="text-[11px] text-slate-500">
                    Percentage of daily wage considered as Basic Wage for PF deduction (default 100%).
                  </span>
                </div>
                <span className="font-mono font-bold text-sm text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-xl">
                  {settings?.compliance?.dailyWagePfPercentage || 100}%
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="100"
                step="5"
                value={settings?.compliance?.dailyWagePfPercentage || 100}
                onChange={(e) => setSettings(s => s ? {
                  ...s,
                  compliance: { ...(s.compliance || {}), dailyWagePfPercentage: parseInt(e.target.value, 10) }
                } : null)}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>

            {/* EPFO Statutory Rates Reference */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs font-mono">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/60">
                <span className="text-[10px] text-slate-400 block font-sans font-semibold uppercase">EE Share (A/c 1)</span>
                <span className="font-bold text-slate-900 text-sm">12.00%</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/60">
                <span className="text-[10px] text-slate-400 block font-sans font-semibold uppercase">ER EPS (A/c 10)</span>
                <span className="font-bold text-slate-900 text-sm">8.33%</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/60">
                <span className="text-[10px] text-slate-400 block font-sans font-semibold uppercase">ER EPF (Diff)</span>
                <span className="font-bold text-slate-900 text-sm">3.67%</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/60">
                <span className="text-[10px] text-slate-400 block font-sans font-semibold uppercase">Admin (A/c 2)</span>
                <span className="font-bold text-slate-900 text-sm">0.50%</span>
              </div>
            </div>
          </div>

          {/* Section 2: ESIC Configuration */}
          <div className="px-1 mb-1">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">2. ESIC (Employees' State Insurance Corporation)</h3>
          </div>
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter ml-1">
                  ESIC Employer Code (17 digits)
                </label>
                <input
                  type="text"
                  maxLength={17}
                  className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold font-mono focus:ring-2 focus:ring-teal-500 outline-none text-slate-800 transition-all placeholder:font-sans"
                  value={settings?.compliance?.esicCode || ''}
                  onChange={(e) => setSettings(s => s ? {
                    ...s,
                    compliance: { ...(s.compliance || {}), esicCode: e.target.value.replace(/[^0-9]/g, '') }
                  } : null)}
                  placeholder="e.g. 31000492810000101"
                />
                <p className="text-[11px] text-slate-400 mt-1.5 ml-1">
                  Your 17-digit employer registration number assigned by the ESIC portal.
                </p>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter ml-1">
                  ESIC Coverage Wage Ceiling
                </label>
                <div className="flex items-center p-3.5 bg-slate-100 border border-slate-200/60 rounded-2xl text-sm font-bold font-mono text-slate-700">
                  <span>₹ 21,000 / month</span>
                  <span className="ml-auto text-[10px] font-sans font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                    Statutory Limit
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 ml-1">
                  Workers with gross monthly wage exceeding ₹21,000 are automatically excluded from ESIC returns.
                </p>
              </div>
            </div>

            {/* ESIC Contribution Rates Reference */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 grid grid-cols-3 gap-3 text-center text-xs font-mono">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/60">
                <span className="text-[10px] text-slate-400 block font-sans font-semibold uppercase">EE Share</span>
                <span className="font-bold text-teal-700 text-sm">0.75%</span>
                <span className="text-[9px] text-slate-400 font-sans block mt-0.5">Waived if daily wage ≤ ₹176</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/60">
                <span className="text-[10px] text-slate-400 block font-sans font-semibold uppercase">ER Share</span>
                <span className="font-bold text-teal-700 text-sm">3.25%</span>
                <span className="text-[9px] text-slate-400 font-sans block mt-0.5">Employer contribution</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/60">
                <span className="text-[10px] text-slate-400 block font-sans font-semibold uppercase">Total ESIC</span>
                <span className="font-bold text-slate-900 text-sm">4.00%</span>
                <span className="text-[9px] text-slate-400 font-sans block mt-0.5">Total statutory due</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Factory Setup & Flow Guide Modal */}
      <SetupGuideModal
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
        onNavigate={onNavigate || (() => {})}
      />

      {/* --- FLOATING SAVE ACTION BAR --- */}
      {hasChanges && (
          <div className="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-8 sm:w-auto bg-slate-900/95 backdrop-blur-md rounded-2xl p-3 sm:px-5 shadow-xl border border-slate-800 flex items-center justify-between gap-4 z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
              <div className="flex items-center text-white gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-xs font-semibold text-slate-200">Unsaved configuration changes</span>
              </div>
              <div className="flex items-center gap-2">
                  <button 
                      onClick={discardChanges}
                      disabled={saving}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                  >
                      Discard
                  </button>
                  <button 
                      onClick={handleSave}
                      disabled={saving}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-xs"
                  >
                      {saving ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Save size={13} />
                          <span>Save Settings</span>
                        </>
                      )}
                  </button>
              </div>
          </div>
      )}
    </div>
  );
};