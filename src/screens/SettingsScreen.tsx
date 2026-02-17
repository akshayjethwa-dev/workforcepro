import React, { useState, useEffect } from 'react';
import { Save, Clock, AlertTriangle, Building, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { ShiftConfig } from '../types/index';

export const SettingsScreen: React.FC = () => {
  const { profile } = useAuth();
  const [shifts, setShifts] = useState<ShiftConfig[]>([]);
  const [companyName, setCompanyName] = useState(profile?.companyName || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
     if(profile?.tenantId) {
         dbService.getShifts(profile.tenantId).then(data => {
             setShifts(data);
             setLoading(false);
         });
     }
  }, [profile]);

  const handleSave = async () => {
      if(!profile?.tenantId) return;
      setSaving(true);
      try {
        // 1. Save Shifts
        await dbService.saveShifts(profile.tenantId, shifts);
        
        // 2. Save Company Name if changed
        if (companyName !== profile.companyName) {
            await dbService.updateTenant(profile.tenantId, { name: companyName });
            // Force reload or alert user to re-login to see name change everywhere
            alert("Settings Saved! (You may need to re-login to see the new Company Name in the header)");
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
      const newShifts = [...shifts];
      newShifts[index] = { ...newShifts[index], [field]: value };
      setShifts(newShifts);
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
               <p className="text-[10px] text-gray-400 mt-1">This name appears on payslips and reports.</p>
           </div>
      </div>

      {/* SECTION 2: SHIFT RULES */}
      {shifts.map((shift, idx) => (
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