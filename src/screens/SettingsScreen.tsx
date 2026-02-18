import React, { useState, useEffect } from 'react';
import { Save, Clock, AlertTriangle, Building, Loader2, ToggleLeft, ToggleRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { ShiftConfig, OrgSettings } from '../types/index';

export const SettingsScreen: React.FC = () => {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<OrgSettings>({ shifts: [], enableBreakTracking: false });
  const [companyName, setCompanyName] = useState(profile?.companyName || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
     if(profile?.tenantId) {
         dbService.getOrgSettings(profile.tenantId).then(data => {
             setSettings(data);
             setLoading(false);
         });
     }
  }, [profile]);

  const handleSave = async () => {
      if(!profile?.tenantId) return;
      setSaving(true);
      try {
        // 1. Save Settings
        await dbService.saveOrgSettings(profile.tenantId, settings);
        
        // 2. Save Company Name if changed
        if (companyName !== profile.companyName) {
            await dbService.updateTenant(profile.tenantId, { name: companyName });
            alert("Settings Saved! (Re-login to see Company Name change)");
        } else {
            alert("Configuration Saved Successfully!");
        }
      } catch (e) {
        alert("Error saving settings");
      } finally {
        setSaving(false);
      }
  };

  const updateShift = (index: number, field: keyof ShiftConfig, value: any) => {
      const newShifts = [...settings.shifts];
      newShifts[index] = { ...newShifts[index], [field]: value };
      setSettings(prev => ({ ...prev, shifts: newShifts }));
  };

  const toggleBreakTracking = () => {
      setSettings(prev => ({ ...prev, enableBreakTracking: !prev.enableBreakTracking }));
  };

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600"/></div>;

  return (
    <div className="p-4 bg-gray-50 min-h-screen pb-24">
      <h1 className="text-xl font-bold text-gray-800 mb-6">Settings & Configuration</h1>

      {/* SECTION 1: ORGANIZATION PROFILE */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
           <div className="flex items-center mb-4 text-gray-800">
               <Building className="mr-2" size={20}/> 
               <h3 className="font-bold">Organization Profile</h3>
           </div>
           <div>
               <label className="text-xs font-bold text-gray-500 uppercase">Company Name</label>
               <input 
                  className="w-full p-3 border border-gray-200 rounded-lg mt-1 outline-none focus:border-blue-500 transition-colors"
                  value={companyName} 
                  onChange={e => setCompanyName(e.target.value)} 
               />
           </div>
      </div>

      {/* SECTION 2: ATTENDANCE LOGIC */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
           <div className="flex items-center mb-4 text-purple-600">
               <CheckCircle2 className="mr-2" size={20}/> 
               <h3 className="font-bold">Logic Configuration</h3>
           </div>
           
           <div className="flex items-center justify-between">
              <div>
                  <h4 className="font-bold text-gray-800">Enable Break Tracking</h4>
                  {/* [FIXED]: Replaced max-w-[200px] with max-w-50 per linter suggestion */}
                  <p className="text-xs text-gray-500 mt-1 max-w-50">
                      {settings.enableBreakTracking 
                        ? "ON: Work Time = Sum of all check-in/out segments. Breaks are excluded."
                        : "OFF: Work Time = First Check-In to Last Check-Out. Breaks are included."
                      }
                  </p>
              </div>
              <button onClick={toggleBreakTracking} className="transition-all">
                  {settings.enableBreakTracking 
                    ? <ToggleRight size={48} className="text-purple-600" />
                    : <ToggleLeft size={48} className="text-gray-300" />
                  }
              </button>
           </div>
           
           <div className="mt-4 bg-purple-50 p-3 rounded-lg text-xs text-purple-800">
               <strong>Current Logic Rules:</strong>
               <ul className="list-disc pl-4 mt-1 space-y-1">
                   <li>&lt; 4 Hours: <b>Absent</b></li>
                   <li>4 - 6 Hours: <b>Half Day</b></li>
                   <li>&gt; 6 Hours: <b>Full Day (Present)</b></li>
               </ul>
           </div>
      </div>

      {/* SECTION 3: SHIFT RULES */}
      {settings.shifts.map((shift, idx) => (
        <div key={idx} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
           <div className="flex items-center mb-4 text-blue-600">
               <Clock className="mr-2" size={20}/> 
               <h3 className="font-bold">Work Timings ({shift.name})</h3>
           </div>
           
           <div className="grid grid-cols-2 gap-4 mb-4">
               <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">Start Time</label>
                   <input type="time" className="w-full p-3 border rounded-lg mt-1 bg-gray-50"
                      value={shift.startTime} onChange={e => updateShift(idx, 'startTime', e.target.value)} />
               </div>
               <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">End Time</label>
                   <input type="time" className="w-full p-3 border rounded-lg mt-1 bg-gray-50"
                      value={shift.endTime} onChange={e => updateShift(idx, 'endTime', e.target.value)} />
               </div>
           </div>

           <hr className="my-4 border-gray-100"/>
           
           <div className="flex items-center mb-4 text-orange-600">
               <AlertTriangle className="mr-2" size={20}/> 
               <h3 className="font-bold">Late & Penalty Rules</h3>
           </div>

           <div className="space-y-4">
               <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">Grace Period (Minutes)</label>
                   <div className="flex items-center">
                       <input type="number" className="w-20 p-2 border rounded-lg text-center font-bold mr-3"
                          value={shift.gracePeriodMins} onChange={e => updateShift(idx, 'gracePeriodMins', parseInt(e.target.value))} />
                       <span className="text-xs text-gray-500">mins allowed after start time</span>
                   </div>
               </div>

               <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">Allowed Late Days (Per Month)</label>
                   <div className="flex items-center">
                       <input type="number" className="w-20 p-2 border rounded-lg text-center font-bold mr-3"
                          value={shift.maxGraceAllowed} onChange={e => updateShift(idx, 'maxGraceAllowed', parseInt(e.target.value))} />
                       <span className="text-xs text-gray-500">days allowed before Half Day penalty</span>
                   </div>
               </div>
           </div>
        </div>
      ))}

      <button 
        onClick={handleSave} 
        disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl font-bold shadow-lg flex items-center justify-center transition-all"
      >
          {saving ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2"/>}
          Save All Changes
      </button>
    </div>
  );
};