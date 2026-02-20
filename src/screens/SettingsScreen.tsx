import React, { useState, useEffect } from 'react';
import { 
  Save, Plus, Trash2, Clock, AlertCircle, CheckCircle, 
  Calendar, Coffee, Info 
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { OrgSettings, ShiftConfig } from '../types/index';

export const SettingsScreen: React.FC = () => {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    if (profile?.tenantId) {
      dbService.getOrgSettings(profile.tenantId).then(setSettings).finally(() => setLoading(false));
    }
  }, [profile]);

  const addShift = () => {
    if (!settings) return;
    const newShift: ShiftConfig = {
      id: `shift_${Date.now()}`,
      name: 'New Shift',
      startTime: '09:00',
      endTime: '18:00',
      gracePeriodMins: 15,
      maxGraceAllowed: 3,
      breakDurationMins: 60,
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

  const handleSave = async () => {
    if (!profile?.tenantId || !settings) return;
    setSaving(true);
    try {
      await dbService.saveOrgSettings(profile.tenantId, settings);
      setMessage({ type: 'success', text: 'Configuration updated successfully!' });
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to save changes.' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
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
            <h2 className="text-2xl font-black text-slate-900">Shift & Rules</h2>
            <p className="text-sm text-slate-500 font-medium">Configure how your factory operates</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center shadow-lg shadow-indigo-200 active:scale-95 transition-all disabled:opacity-50"
        >
          {saving ? 'Saving...' : <><Save size={18} className="mr-2"/> Save Settings</>}
        </button>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-2xl flex items-center animate-in fade-in slide-in-from-top-2 ${message.type === 'success' ? 'bg-green-600 text-white shadow-green-100' : 'bg-red-600 text-white shadow-red-100'} shadow-lg`}>
          {message.type === 'success' ? <CheckCircle size={20} className="mr-3"/> : <AlertCircle size={20} className="mr-3"/>}
          <span className="text-sm font-bold">{message.text}</span>
        </div>
      )}

      <div className="space-y-6 mb-8">
        <div className="flex justify-between items-end px-1">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Active Shift Profiles</h3>
            <button onClick={addShift} className="text-indigo-600 text-sm font-bold flex items-center bg-indigo-50 px-3 py-1.5 rounded-xl">
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
                    <input 
                        className="font-black text-slate-800 bg-transparent border-b-2 border-transparent focus:border-indigo-500 outline-none px-1"
                        value={shift.name}
                        onChange={(e) => updateShift(shift.id, { name: e.target.value })}
                        disabled={shift.id === 'default'}
                    />
                </div>
                {shift.id !== 'default' && (
                  <button onClick={() => removeShift(shift.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                    <Trash2 size={18} />
                  </button>
                )}
            </div>
            
            <div className="p-6 grid grid-cols-2 gap-x-4 gap-y-6">
                <div className="col-span-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter">Shift Start</label>
                  <input type="time" className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={shift.startTime} onChange={(e) => updateShift(shift.id, { startTime: e.target.value })} />
                </div>
                <div className="col-span-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter">Shift End</label>
                  <input type="time" className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={shift.endTime} onChange={(e) => updateShift(shift.id, { endTime: e.target.value })} />
                </div>
                
                <div className="col-span-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter">Late Grace (Mins)</label>
                  <div className="relative">
                    <input type="number" className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={shift.gracePeriodMins} onChange={(e) => updateShift(shift.id, { gracePeriodMins: parseInt(e.target.value) })} />
                    <span className="absolute right-3 top-3 text-[10px] font-bold text-slate-400">min</span>
                  </div>
                </div>

                <div className="col-span-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block tracking-tighter">Allowed Late / Month</label>
                  <div className="relative">
                    {/* FIXED: Removed border-slate-100 to resolve cssConflict with border-indigo-100 */}
                    <input type="number" className="w-full p-3 bg-slate-50 border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none border-indigo-100"
                        value={shift.maxGraceAllowed} onChange={(e) => updateShift(shift.id, { maxGraceAllowed: parseInt(e.target.value) })} />
                    <Calendar className="absolute right-3 top-3 text-indigo-300" size={14} />
                  </div>
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

      <div className="px-1 mb-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Automated Rules</h3>
      </div>
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
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
          <div className="relative inline-flex items-center cursor-pointer">
            <input 
                type="checkbox" 
                className="sr-only peer"
                checked={settings?.enableBreakTracking}
                onChange={(e) => setSettings(s => s ? {...s, enableBreakTracking: e.target.checked} : null)}
            />
            {/* FIXED: Replaced manual top-[2px] and left-[2px] with canonical top-0.5 and left-0.5 */}
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </div>
        </div>

        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <div className="flex items-center text-slate-600 mb-2">
                <Info size={14} className="mr-2 text-indigo-500" />
                <span className="text-xs font-bold">What does this do?</span>
            </div>
            <ul className="space-y-2">
                <li className="text-[11px] text-slate-500 font-medium flex items-start leading-normal">
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-1 mr-2 shrink-0" />
                    Automatically deducts 1 hour (60 mins) from total working hours to account for lunch/rest periods.
                </li>
                <li className="text-[11px] text-slate-500 font-medium flex items-start leading-normal">
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-1 mr-2 shrink-0" />
                    Workers do not need to punch out for lunch. The system handles it on the final calculation.
                </li>
            </ul>
        </div>
      </div>
    </div>
  );
};