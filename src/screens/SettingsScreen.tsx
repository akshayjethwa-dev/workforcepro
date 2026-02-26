// src/screens/SettingsScreen.tsx
import React, { useState, useEffect } from 'react';
import { 
  Save, Plus, Trash2, Clock, AlertCircle, CheckCircle, 
  Calendar, Coffee, Info, MapPin, Building, User, Lock,
  GitBranch, Layers, X, ScanFace
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { OrgSettings, ShiftConfig, Branch } from '../types/index';

import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const SettingsScreen: React.FC = () => {
  // PULL LIMITS FROM AUTH CONTEXT
  const { profile, limits } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'GENERAL' | 'SHIFTS' | 'BRANCHES' | 'DEPARTMENTS'>('GENERAL');
  
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [initialSettings, setInitialSettings] = useState<OrgSettings | null>(null);

  const [orgProfile, setOrgProfile] = useState({ companyName: '', ownerName: '' });
  const [initialOrgProfile, setInitialOrgProfile] = useState({ companyName: '', ownerName: '' });
  
  const [newDept, setNewDept] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    if (profile) {
      const currentOrg = { 
        companyName: profile.companyName || '', 
        ownerName: profile.name || '' 
      };
      setOrgProfile(currentOrg);
      setInitialOrgProfile(currentOrg);

      if (profile.tenantId) {
        dbService.getOrgSettings(profile.tenantId).then((data) => {
           setSettings(data);
           setInitialSettings(data);
        }).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }
  }, [profile]);

  const hasChanges = 
    JSON.stringify(settings) !== JSON.stringify(initialSettings) ||
    JSON.stringify(orgProfile) !== JSON.stringify(initialOrgProfile);

  // --- SHIFTS MANAGEMENT ---
  const addShift = () => {
    if (!settings) return;
    
    if (limits && settings.shifts.length >= limits.maxShifts) {
        alert(`Your current plan only allows ${limits.maxShifts} shift(s). Please upgrade to add more.`);
        return;
    }

    const newShift: ShiftConfig = {
      id: `shift_${Date.now()}`,
      name: 'New Shift',
      startTime: '09:00',
      endTime: '18:00',
      gracePeriodMins: 15,
      maxGraceAllowed: 3,
      breakDurationMins: 60,
      minOvertimeMins: 60,
      minHalfDayHours: 4
    };
    setSettings({ ...settings, shifts: [...settings.shifts, newShift] });
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
    if (window.confirm("Delete this shift? Workers assigned to it may need reassignment.")) {
        setSettings({ ...settings, shifts: settings.shifts.filter(s => s.id !== id) });
    }
  };

  // --- BRANCH MANAGEMENT ---
  const addBranch = () => {
    if (!settings) return;
    if (!limits?.multiBranchEnabled && (settings.branches?.length || 0) >= 1) {
        alert("Your current plan does not support multiple branches. Please upgrade to the Enterprise plan.");
        return;
    }
    const newBranch: Branch = { id: `branch_${Date.now()}`, name: 'New Branch' };
    setSettings({ ...settings, branches: [...(settings.branches || []), newBranch] });
  };

  const updateBranch = (id: string, name: string) => {
    if (!settings) return;
    setSettings({ ...settings, branches: settings.branches?.map(b => b.id === id ? { ...b, name } : b) });
  };

  const removeBranch = (id: string) => {
    if (!settings || id === 'default') return;
    if (window.confirm("Delete this branch? Workers assigned to it may need to be reassigned.")) {
        setSettings({ ...settings, branches: settings.branches?.filter(b => b.id !== id) });
    }
  };

  const handleSetLocation = (branchId: string) => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
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
         if (data && data.display_name) {
             addressName = data.display_name;
         }
      } catch (err) {
         console.warn("Reverse geocoding failed", err);
      }

      setSettings(s => s ? {
        ...s,
        branches: s.branches?.map(b => b.id === branchId ? { ...b, location: { lat, lng, radius: 200, address: addressName } } : b)
      } : null);
      
      setSaving(false);
      setMessage({ type: 'success', text: 'Location acquired! Click Save to apply.' });
      setTimeout(() => setMessage(null), 4000);

    }, (err) => {
        setSaving(false);
        alert(`Failed to get location: ${err.message}`);
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
        const userId = profile.uid || profile.id; 
        if (userId) {
            await updateDoc(doc(db, "users", userId), {
                companyName: orgProfile.companyName,
                name: orgProfile.ownerName
            });
            setInitialOrgProfile(orgProfile);
        }
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
    <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    <div className="p-4 bg-gray-50 min-h-screen pb-32">
      <div className="flex flex-col mb-6 space-y-4 sm:flex-row sm:justify-between sm:items-center">
        <div>
            <h2 className="text-2xl font-black text-slate-900">Factory Settings</h2>
            <p className="text-sm text-slate-500 font-medium">Manage your organization and rules</p>
        </div>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-2xl flex items-center animate-in fade-in slide-in-from-top-2 ${message.type === 'success' ? 'bg-green-600 text-white shadow-green-100' : 'bg-red-600 text-white shadow-red-100'} shadow-lg`}>
          {message.type === 'success' ? <CheckCircle size={20} className="mr-3"/> : <AlertCircle size={20} className="mr-3"/>}
          <span className="text-sm font-bold">{message.text}</span>
        </div>
      )}

      {/* --- TABS NAVIGATION --- */}
      <div className="flex space-x-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
        {[
          { id: 'GENERAL', label: 'General', icon: Building },
          { id: 'SHIFTS', label: 'Shifts', icon: Clock },
          { id: 'BRANCHES', label: 'Locations', icon: GitBranch },
          { id: 'DEPARTMENTS', label: 'Departments', icon: Layers }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center px-4 py-2.5 rounded-2xl text-sm font-bold whitespace-nowrap transition-all ${
              activeTab === tab.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <tab.icon size={16} className="mr-2" /> {tab.label}
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
                      <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter">Company / Site Name</label>
                      <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <Building className="h-4 w-4 text-slate-400" />
                          </div>
                          <input 
                              type="text" 
                              className="w-full pl-10 p-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 transition-all" 
                              value={orgProfile.companyName} 
                              onChange={(e) => setOrgProfile({...orgProfile, companyName: e.target.value})} 
                              placeholder="Enter your factory name"
                          />
                      </div>
                  </div>
                  <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter">Admin / Owner Name</label>
                      <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <User className="h-4 w-4 text-slate-400" />
                          </div>
                          <input 
                              type="text" 
                              className="w-full pl-10 p-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 transition-all" 
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
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-orange-50 rounded-xl">
                    <Coffee className="text-orange-500" size={20} />
                </div>
                <div>
                    <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Break Tracking</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Auto-Deduction Logic</p>
                </div>
              </div>
              
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={settings?.enableBreakTracking || false} 
                    onChange={(e) => setSettings(s => s ? {...s, enableBreakTracking: e.target.checked} : null)}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

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

            {/* --- NEW: LIVENESS DETECTION TOGGLE --- */}
            <div className="flex items-center justify-between mb-4 pt-6 border-t border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-50 rounded-xl">
                    <ScanFace className="text-purple-500" size={20} />
                </div>
                <div>
                    <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Strict Liveness Detection</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Anti-Spoofing & Proxy Prevention</p>
                </div>
              </div>
              
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={settings?.strictLiveness || false} 
                    onChange={(e) => setSettings(s => s ? {...s, strictLiveness: e.target.checked} : null)}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

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

          </div>
        </div>
      )}

      {/* ======================= SHIFTS TAB ======================= */}
      {activeTab === 'SHIFTS' && (
        <div className="space-y-6 mb-8 animate-in fade-in duration-300">
          <div className="flex justify-between items-end px-1">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Active Shift Profiles</h3>
              <button onClick={addShift} className="text-indigo-600 text-sm font-bold flex items-center bg-indigo-50 px-3 py-1.5 rounded-xl hover:bg-indigo-100 transition-colors">
                  <Plus size={16} className="mr-1"/> Add New
              </button>
          </div>

          {settings?.shifts.map((shift) => (
            <div key={shift.id} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden transition-all">
              <div className="p-5 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                  <div className="flex items-center space-x-3">
                      <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100">
                          <Clock className="text-indigo-500" size={18} />
                      </div>
                      <input className="font-black text-slate-800 bg-transparent border-b-2 border-transparent focus:border-indigo-500 outline-none px-1" value={shift.name} onChange={(e) => updateShift(shift.id, { name: e.target.value })} disabled={shift.id === 'default'}/>
                  </div>
                  {shift.id !== 'default' && (
                    <button onClick={() => removeShift(shift.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                  )}
              </div>
              
              <div className="p-6 grid grid-cols-2 gap-x-4 gap-y-6">
                  <div className="col-span-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter">Shift Start</label>
                    <input type="time" className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" value={shift.startTime} onChange={(e) => updateShift(shift.id, { startTime: e.target.value })} />
                  </div>
                  <div className="col-span-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter">Shift End</label>
                    <input type="time" className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" value={shift.endTime} onChange={(e) => updateShift(shift.id, { endTime: e.target.value })} />
                  </div>
                  <div className="col-span-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter">Late Grace (Mins)</label>
                    <div className="relative">
                      <input type="number" className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" value={shift.gracePeriodMins} onChange={(e) => updateShift(shift.id, { gracePeriodMins: parseInt(e.target.value) })} />
                      <span className="absolute right-3 top-3 text-[10px] font-bold text-slate-400">min</span>
                    </div>
                  </div>
                  <div className="col-span-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter">Allowed Late / Month</label>
                    <div className="relative">
                      <input type="number" className="w-full p-3 bg-slate-50 border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none border-indigo-100" value={shift.maxGraceAllowed} onChange={(e) => updateShift(shift.id, { maxGraceAllowed: parseInt(e.target.value) })} />
                      <Calendar className="absolute right-3 top-3 text-indigo-300" size={14} />
                    </div>
                  </div>

                  <div className="col-span-2 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                    <label className="text-[10px] font-black text-blue-800 uppercase mb-1.5 block tracking-tighter">Min. Extra Mins to Trigger OT</label>
                    <div className="relative">
                      <input 
                         type="number" 
                         className="w-full p-3 bg-white border border-blue-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none text-blue-900" 
                         value={shift.minOvertimeMins || 0} 
                         onChange={(e) => updateShift(shift.id, { minOvertimeMins: parseInt(e.target.value) || 0 })} 
                      />
                      <span className="absolute right-3 top-3 text-[10px] font-bold text-blue-400">minutes</span>
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
          <div className="flex justify-between items-end px-1">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Factory Locations</h3>
              <button onClick={addBranch} className="text-indigo-600 text-sm font-bold flex items-center bg-indigo-50 px-3 py-1.5 rounded-xl hover:bg-indigo-100 transition-colors">
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
                        <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100">
                            <Building className="text-indigo-500" size={18} />
                        </div>
                        <input className="font-black text-slate-800 bg-transparent border-b-2 border-transparent focus:border-indigo-500 outline-none px-1 w-full max-w-sm" 
                            value={branch.name} onChange={(e) => updateBranch(branch.id, e.target.value)} disabled={branch.id === 'default'} placeholder="Branch Name"/>
                    </div>
                    {branch.id !== 'default' && (
                      <button onClick={() => removeBranch(branch.id)} className="text-slate-300 hover:text-red-500 transition-colors ml-4 shrink-0"><Trash2 size={18} /></button>
                    )}
                </div>

                <div className="p-6">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Location Geofencing</h4>
                  
                  {limits?.geofencingEnabled !== false ? (
                      <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4">
                          <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center space-x-3">
                                  <div className="p-2 bg-green-50 rounded-xl">
                                      <MapPin className="text-green-500" size={16} />
                                  </div>
                                  <div>
                                      <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Factory GPS Base</p>
                                      <p className="text-[10px] text-slate-400 font-bold uppercase">Used for mobile punch validation</p>
                                  </div>
                              </div>
                              <button 
                                  onClick={() => handleSetLocation(branch.id)}
                                  className="text-xs font-bold bg-green-100 text-green-700 px-4 py-2 rounded-xl hover:bg-green-200 transition-colors"
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
                  className="flex-1 pl-10 p-3 bg-slate-50 border border-slate-100 rounded-l-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 transition-all"
               />
               <button 
                  onClick={addDepartment} 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 rounded-r-2xl font-bold transition-colors"
               >
                  <Plus size={18}/>
               </button>
           </div>
           
           <div className="flex flex-wrap gap-2">
               {settings?.departments?.map(dept => (
                   <div key={dept} className="bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl flex items-center text-sm font-bold text-slate-700 shadow-sm">
                       {dept}
                       <button onClick={() => removeDepartment(dept)} className="ml-3 text-slate-300 hover:text-red-500 transition-colors">
                           <X size={14}/>
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

{/* --- COMPLIANCE SETTINGS SECTION --- */}
<div className="px-1 mb-3 mt-8">
    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Statutory & Compliance</h3>
</div>
<div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 mb-8">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
            <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter">PF Registration Number</label>
            <input 
                type="text" 
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" 
                value={settings?.compliance?.pfRegistrationNumber || ''} 
                onChange={(e) => setSettings(s => s ? {...s, compliance: {...(s.compliance || {esicCode:'', capPfDeduction:true, dailyWagePfPercentage:100}), pfRegistrationNumber: e.target.value}} : null)} 
                placeholder="e.g. MH/BAN/0000000/000"
            />
        </div>
        <div>
            <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter">ESIC Code</label>
            <input 
                type="text" 
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" 
                value={settings?.compliance?.esicCode || ''} 
                onChange={(e) => setSettings(s => s ? {...s, compliance: {...(s.compliance || {pfRegistrationNumber:'', capPfDeduction:true, dailyWagePfPercentage:100}), esicCode: e.target.value}} : null)} 
                placeholder="17-digit ESIC Code"
            />
        </div>
    </div>
    
    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-4">
        <div className="flex items-center justify-between">
            <div>
                <p className="text-sm font-bold text-slate-800">Cap PF Deduction at ₹15,000</p>
                <p className="text-[10px] text-slate-500">Limits employer & employee PF contribution to the ₹15k wage ceiling.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
                <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={settings?.compliance?.capPfDeduction ?? true} 
                    onChange={(e) => setSettings(s => s ? {...s, compliance: {...(s.compliance || {} as any), capPfDeduction: e.target.checked}} : null)}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
        </div>
        
        <div className="pt-4 border-t border-slate-200">
            <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter">Daily Wage PF Calculation Method (%)</label>
            <div className="flex items-center space-x-3">
                <input 
                    type="number" 
                    max="100" min="1"
                    className="w-24 p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" 
                    value={settings?.compliance?.dailyWagePfPercentage || 100} 
                    onChange={(e) => setSettings(s => s ? {...s, compliance: {...(s.compliance || {} as any), dailyWagePfPercentage: Number(e.target.value)}} : null)} 
                />
                <p className="text-[10px] text-slate-500 leading-tight">
                    % of the total daily gross wage to be considered as "Basic + DA" for PF calculations.
                </p>
            </div>
        </div>
    </div>
</div>

      {/* --- FLOATING SAVE ACTION BAR --- */}
      {hasChanges && (
          <div className="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-8 sm:w-auto bg-slate-900 rounded-2xl p-4 shadow-2xl border border-slate-700 flex items-center justify-between z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
              <div className="flex items-center text-white space-x-4 pr-6">
                  <AlertCircle className="text-amber-400" size={20} />
                  <span className="text-sm font-bold">Unsaved changes</span>
              </div>
              <div className="flex items-center space-x-3">
                  <button 
                      onClick={discardChanges}
                      disabled={saving}
                      className="text-xs font-bold text-slate-300 hover:text-white transition-colors px-2"
                  >
                      Discard
                  </button>
                  <button 
                      onClick={handleSave}
                      disabled={saving}
                      className="bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold py-2 px-4 rounded-xl transition-colors disabled:opacity-50 flex items-center shadow-lg shadow-indigo-500/30"
                  >
                      {saving ? 'Saving...' : <><Save size={14} className="mr-1.5"/> Save</>}
                  </button>
              </div>
          </div>
      )}

    </div>
  );
};