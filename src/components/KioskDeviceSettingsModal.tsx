// src/components/KioskDeviceSettingsModal.tsx
import React, { useState } from 'react';
import { X, Tablet, Timer, Save, CheckCircle2, Shield } from 'lucide-react';
import { quickSwitchService } from '../services/quickSwitchService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChanged: () => void;
}

export const KioskDeviceSettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSettingsChanged
}) => {
  const [deviceId, setDeviceId] = useState(quickSwitchService.getDeviceId());
  const [deviceName, setDeviceName] = useState(quickSwitchService.getDeviceName());
  const [autoIdleSeconds, setAutoIdleSeconds] = useState(quickSwitchService.getAutoIdleTimeoutSeconds());
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    quickSwitchService.setDeviceId(deviceId);
    quickSwitchService.setDeviceName(deviceName);
    quickSwitchService.setAutoIdleTimeoutSeconds(autoIdleSeconds);
    setSavedSuccess(true);
    onSettingsChanged();
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 text-white shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <Tablet size={20} className="text-blue-400" />
            <h3 className="font-bold text-base">Shared Device & Handover Settings</h3>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {savedSuccess && (
          <div className="p-3 bg-emerald-950/80 border border-emerald-600 rounded-xl text-emerald-200 text-xs font-bold mb-4 flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>Device settings updated successfully!</span>
          </div>
        )}

        {/* Device ID */}
        <div className="mb-4">
          <label className="text-xs font-mono uppercase text-slate-400 block mb-1">
            Device Hardware ID (Attributed in Audit Trail)
          </label>
          <input
            type="text"
            value={deviceId}
            onChange={e => setDeviceId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-blue-500"
          />
          <span className="text-[10px] text-slate-500 font-mono mt-1 block">
            Used to tag every PIN/QR quick-switch in attendance audit logs.
          </span>
        </div>

        {/* Device Name */}
        <div className="mb-4">
          <label className="text-xs font-mono uppercase text-slate-400 block mb-1">
            Device Display Label
          </label>
          <input
            type="text"
            value={deviceName}
            onChange={e => setDeviceName(e.target.value)}
            placeholder="e.g. Workshop Tablet 01"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Auto-Idle Timeout (AC 4) */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-mono uppercase text-slate-400 flex items-center gap-1.5">
              <Timer size={14} className="text-amber-400" />
              <span>Auto-Return Handover Timeout</span>
            </label>
            <span className="text-xs font-black text-amber-400 font-mono">{autoIdleSeconds} seconds</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[10, 15, 30, 60].map(sec => (
              <button
                key={sec}
                type="button"
                onClick={() => setAutoIdleSeconds(sec)}
                className={`py-2 rounded-xl text-xs font-bold font-mono transition-all border cursor-pointer ${
                  autoIdleSeconds === sec 
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300' 
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {sec}s
              </button>
            ))}
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-2 block">
            App automatically returns to the idle PIN pad if untouched or handed over between workers.
          </span>
        </div>

        {/* Security Summary */}
        <div className="p-3 bg-blue-950/40 border border-blue-900 rounded-xl text-xs text-blue-200 mb-5 flex items-start gap-2">
          <Shield size={16} className="text-blue-400 shrink-0 mt-0.5" />
          <span>
            Handover security automatically clears active worker sessions when the screen is turned off or tab is backgrounded.
          </span>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-black text-sm uppercase flex items-center justify-center gap-2 cursor-pointer shadow-lg"
        >
          <Save size={16} />
          <span>Save Device Configuration</span>
        </button>
      </div>
    </div>
  );
};
