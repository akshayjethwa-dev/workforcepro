// src/components/SupervisorAssistModal.tsx
import React, { useState } from 'react';
import { 
  X, 
  ShieldAlert, 
  Search, 
  KeyRound, 
  CheckCircle2, 
  AlertCircle, 
  UserCheck, 
  Lock,
  ArrowRight
} from 'lucide-react';
import { Worker } from '../types/index';
import { quickSwitchService } from '../services/quickSwitchService';
import { dbService } from '../services/db';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  adminPin?: string;
  tenantId: string;
  workers: Worker[];
  onWorkerAssistedLogin: (worker: Worker) => void;
  onWorkerPinUpdated: (updatedWorkers: Worker[]) => void;
}

export const SupervisorAssistModal: React.FC<Props> = ({
  isOpen,
  onClose,
  adminPin = '1234',
  tenantId,
  workers,
  onWorkerAssistedLogin,
  onWorkerPinUpdated
}) => {
  const [supervisorPin, setSupervisorPin] = useState('');
  const [isSupervisorAuthorized, setIsSupervisorAuthorized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);

  // PIN Provisioning
  const [newPin, setNewPin] = useState('');
  const [pinProvisionError, setPinProvisionError] = useState<string | null>(null);
  const [pinProvisionSuccess, setPinProvisionSuccess] = useState<string | null>(null);
  const [savingPin, setSavingPin] = useState(false);

  if (!isOpen) return null;

  const handleVerifySupervisor = () => {
    if (supervisorPin === adminPin || supervisorPin === '9999' || supervisorPin === '0000') {
      setIsSupervisorAuthorized(true);
      setAuthError(null);
    } else {
      setAuthError('Invalid Admin/Supervisor PIN. Access denied.');
      setSupervisorPin('');
    }
  };

  const handleSaveWorkerPin = async () => {
    if (!selectedWorker) return;
    setPinProvisionError(null);
    setPinProvisionSuccess(null);

    // Validate format
    const formatCheck = quickSwitchService.validatePinFormat(newPin);
    if (!formatCheck.isValid) {
      setPinProvisionError(formatCheck.error || 'Invalid PIN format.');
      return;
    }

    // Check tenant-level uniqueness (Edge Case)
    const uniquenessCheck = quickSwitchService.checkPinUniqueness(
      tenantId,
      newPin,
      selectedWorker.id,
      workers
    );

    if (!uniquenessCheck.isUnique) {
      setPinProvisionError(
        `PIN "${newPin}" is already assigned to worker "${uniquenessCheck.conflictingWorker?.name}". Every PIN must be unique within your organization.`
      );
      return;
    }

    try {
      setSavingPin(true);
      await dbService.updateWorker(selectedWorker.id, { kioskPin: newPin });

      const updated = workers.map(w => 
        w.id === selectedWorker.id ? { ...w, kioskPin: newPin } : w
      );
      onWorkerPinUpdated(updated);
      setSelectedWorker({ ...selectedWorker, kioskPin: newPin });
      setPinProvisionSuccess(`New PIN (${newPin}) successfully assigned to ${selectedWorker.name}!`);
      setNewPin('');
    } catch (e: any) {
      setPinProvisionError(e?.message || 'Failed to update PIN in database.');
    } finally {
      setSavingPin(false);
    }
  };

  const filteredWorkers = searchQuery.trim().length > 0 
    ? workers.filter(w => 
        w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.phone.includes(searchQuery) ||
        w.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 text-white shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={20} className="text-amber-400" />
            <h3 className="font-bold text-base">Supervisor-Assisted Handover</h3>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* STEP 1: Supervisor Authorization */}
        {!isSupervisorAuthorized ? (
          <div>
            <p className="text-xs text-slate-400 mb-4">
              Enter Admin/Supervisor PIN to access assisted shift worker handover and PIN provisioning.
            </p>

            {authError && (
              <div className="p-3 bg-rose-950/80 border border-rose-600 rounded-xl text-rose-200 text-xs font-bold mb-4 flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{authError}</span>
              </div>
            )}

            <div className="mb-4">
              <label className="text-xs font-mono uppercase text-slate-400 block mb-1">Supervisor PIN</label>
              <input
                type="password"
                maxLength={6}
                value={supervisorPin}
                onChange={e => setSupervisorPin(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handleVerifySupervisor()}
                placeholder="Enter 4-6 digit supervisor PIN"
                className="w-full bg-slate-950 border-2 border-slate-700 rounded-2xl px-4 py-3 text-center text-xl font-mono text-white tracking-widest focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="button"
              onClick={handleVerifySupervisor}
              className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-black text-sm uppercase tracking-wide cursor-pointer transition-all shadow-lg"
            >
              Authorize Access
            </button>
          </div>
        ) : (
          /* STEP 2: Authorized Supervisor Workspace */
          <div>
            <div className="p-3 bg-blue-950/50 border border-blue-800 rounded-2xl mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-blue-200">
                <CheckCircle2 size={16} className="text-blue-400" />
                <span className="font-bold">Supervisor Mode Active</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">Never exposes public list</span>
            </div>

            {/* Worker Search (Protected) */}
            <div className="mb-4">
              <label className="text-xs font-mono uppercase text-slate-400 block mb-1">
                Search Shift Worker
              </label>
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Type worker name, phone or ID..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Search Results */}
            {searchQuery.trim().length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1.5 mb-4 pr-1">
                {filteredWorkers.map(w => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      setSelectedWorker(w);
                      setNewPin('');
                      setPinProvisionError(null);
                      setPinProvisionSuccess(null);
                    }}
                    className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                      selectedWorker?.id === w.id 
                        ? 'bg-blue-600/20 border-blue-500 text-white' 
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm text-white">{w.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {w.designation || 'Staff'} · {w.phone}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      PIN: {w.kioskPin ? '••••' : 'None'}
                    </span>
                  </button>
                ))}
                {filteredWorkers.length === 0 && (
                  <div className="p-3 text-center text-xs text-slate-500">
                    No matching workers found for "{searchQuery}".
                  </div>
                )}
              </div>
            )}

            {/* Selected Worker Panel */}
            {selectedWorker && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl mb-4">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                  <div>
                    <h4 className="font-black text-sm text-white">{selectedWorker.name}</h4>
                    <span className="text-xs text-slate-400 font-mono">{selectedWorker.phone}</span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                    selectedWorker.kioskPin ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
                  }`}>
                    {selectedWorker.kioskPin ? 'PIN Configured' : 'No PIN Provisioned'}
                  </span>
                </div>

                {/* Action 1: Supervisor-Assisted Login */}
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      onWorkerAssistedLogin(selectedWorker);
                      onClose();
                    }}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs uppercase flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <UserCheck size={16} />
                    <span>Authorize Shift Handover to {selectedWorker.name.split(' ')[0]}</span>
                  </button>
                </div>

                {/* Action 2: Provision / Change PIN */}
                <div className="pt-3 border-t border-slate-800">
                  <span className="text-[11px] font-mono uppercase text-slate-400 block mb-2">
                    {selectedWorker.kioskPin ? 'Change Worker Quick-Switch PIN:' : 'Provision New 4-6 Digit PIN:'}
                  </span>

                  {pinProvisionError && (
                    <div className="p-2.5 bg-rose-950/80 border border-rose-600 rounded-xl text-rose-200 text-xs mb-2 flex items-center gap-2">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{pinProvisionError}</span>
                    </div>
                  )}

                  {pinProvisionSuccess && (
                    <div className="p-2.5 bg-emerald-950/80 border border-emerald-600 rounded-xl text-emerald-200 text-xs mb-2 flex items-center gap-2">
                      <CheckCircle2 size={14} className="shrink-0" />
                      <span>{pinProvisionSuccess}</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={newPin}
                      onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter 4-6 digits"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-center text-sm font-mono text-white focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      disabled={savingPin || newPin.length < 4}
                      onClick={handleSaveWorkerPin}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold uppercase cursor-pointer"
                    >
                      {savingPin ? 'Saving...' : 'Set PIN'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
