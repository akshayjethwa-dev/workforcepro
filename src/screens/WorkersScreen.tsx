import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Edit2, Trash2, AlertTriangle, X, IndianRupee, Save, Lock, 
  UserCheck, Camera, Phone, MapPin, Building, Sparkles, Filter
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dbService } from '../services/db';
import { wageService } from '../services/wageService';
import { Worker, OrgSettings } from '../types/index';

interface Props {
  onAddWorker: () => void;
  onEditWorker: (worker: Worker) => void;
}

export const WorkersScreen: React.FC<Props> = ({ onAddWorker, onEditWorker }) => {
  const { profile, limits } = useAuth();
  const { toast } = useToast();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  
  // State for deletion modal
  const [workerToDelete, setWorkerToDelete] = useState<Worker | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // State for Advance (Kharchi) Modal
  const [advanceModal, setAdvanceModal] = useState({
    isOpen: false,
    worker: null as Worker | null,
    amount: '',
    date: new Date().toISOString().split('T')[0],
    reason: 'Kharchi',
    earned: 0,
    existingAdvances: 0,
    isSaving: false
  });

  const loadWorkersAndSettings = async () => {
    const tenantId = profile?.tenantId;
    if (tenantId) {
      try {
        const [workersData, settingsData] = await Promise.all([
            dbService.getWorkers(tenantId),
            dbService.getOrgSettings(tenantId)
        ]);
        setWorkers(workersData);
        setSettings(settingsData);
      } catch (error) {
        console.error("Failed to load workers data", error);
        toast.error("Failed to load workers directory");
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => { loadWorkersAndSettings(); }, [profile]);

  // Custom deletion logic handled via modal
  const confirmDelete = async () => {
    const tenantId = profile?.tenantId;
    if (!workerToDelete || !tenantId) return;
    setIsDeleting(true);
    
    try {
      await dbService.deleteWorker(tenantId, workerToDelete.id);
      setWorkers(prev => prev.filter(w => w.id !== workerToDelete.id)); 
      toast.success(`Removed ${workerToDelete.name} from records`);
      setWorkerToDelete(null);
    } catch (e) {
      console.error("Deletion failed:", e);
      toast.error("Failed to delete worker. Please check network connection.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddWorkerClick = () => {
    if (limits && workers.length >= limits.maxWorkers) {
        toast.error(`Plan limit reached (${limits.maxWorkers} workers). Please upgrade in Billing.`);
        return;
    }
    onAddWorker();
  };

  // Quick Action Logic for Advances
  const handleOpenAdvance = async (worker: Worker) => {
    const tenantId = profile?.tenantId;
    if (!tenantId) return;
    if (!limits?.allowancesAndDeductionsEnabled) {
        toast.info("Advance/Kharchi tracking is available on Pro & Enterprise plans.");
        return;
    }
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    try {
      const [attendance, advances] = await Promise.all([
        dbService.getAttendanceHistory(tenantId),
        dbService.getAdvances(tenantId)
      ]);
      
      const earned = wageService.calculateCurrentEarnings(worker, currentMonth, attendance, settings || { shifts: [], enableBreakTracking: false });
      const existingAdvances = advances
          .filter(a => a.workerId === worker.id && a.date.startsWith(currentMonth))
          .reduce((sum, a) => sum + a.amount, 0);

      setAdvanceModal({ 
          isOpen: true, 
          worker, 
          amount: '', 
          date: new Date().toISOString().split('T')[0], 
          reason: 'Kharchi', 
          earned, 
          existingAdvances, 
          isSaving: false 
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to load worker advance records");
    }
  };

  const handleSaveAdvance = async () => {
    const tenantId = profile?.tenantId;
    if (!tenantId || !advanceModal.worker || !advanceModal.amount) return;
    setAdvanceModal(prev => ({ ...prev, isSaving: true }));
    try {
      await dbService.addAdvance({
        tenantId: tenantId,
        workerId: advanceModal.worker.id,
        amount: parseFloat(advanceModal.amount),
        date: advanceModal.date,
        reason: advanceModal.reason || 'Kharchi',
        status: 'APPROVED'
      });
      toast.success(`Recorded ₹${parseFloat(advanceModal.amount).toLocaleString()} advance for ${advanceModal.worker.name}`);
      setAdvanceModal(prev => ({ ...prev, isOpen: false, isSaving: false }));
    } catch (e) {
      console.error(e);
      toast.error("Error saving worker advance.");
      setAdvanceModal(prev => ({ ...prev, isSaving: false }));
    }
  };

  const filteredWorkers = workers.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          w.phone.includes(searchTerm) ||
                          (w.designation && w.designation.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesBranch = selectedBranch === 'ALL' || (w.branchId || 'default') === selectedBranch;
    return matchesSearch && matchesBranch;
  });

  const willOverBorrow = (Number(advanceModal.amount || 0) + advanceModal.existingAdvances) > advanceModal.earned;

  return (
    <div className="space-y-6 pb-12">
      
      {/* TOOLBAR HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Workers Directory</h1>
          <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
            <span>Manage factory personnel & pay rates</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums text-slate-600">{filteredWorkers.length} of {workers.length} active</span>
          </div>
        </div>

        <button 
          onClick={handleAddWorkerClick}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs shadow-xs transition-all active:scale-95 shrink-0 self-start sm:self-auto"
        >
          <Plus size={16} />
          <span>Add New Worker</span>
        </button>
      </div>

      {/* FILTER & SEARCH ROW */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-3 text-slate-400" size={17} />
          <input 
            type="text" 
            placeholder="Search by worker name, phone number, or role..." 
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all shadow-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {settings?.branches && settings.branches.length > 1 && (
          <select
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            className="bg-white border border-slate-200 text-xs font-semibold text-slate-700 py-2.5 px-3 rounded-xl shadow-xs outline-none hover:border-slate-300 transition-colors"
          >
            <option value="ALL">All Branches</option>
            {settings.branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* LOADING STATE */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs animate-pulse space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-slate-200 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
              <div className="h-8 bg-slate-100 rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        /* RESPONSIVE DUAL-VIEWPORT WORKER GRID: 1 column on phone, 2 cols on tablet, 3 cols on desktop */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredWorkers.map(worker => {
            const hasFace = Boolean(worker.faceDescriptor);
            const daily = worker.dailyWage ?? (worker.wageConfig?.type === 'DAILY' ? worker.wageConfig?.amount : undefined);
            const monthly = worker.monthlySalary ?? (worker.wageConfig?.type === 'MONTHLY' ? worker.wageConfig?.amount : undefined);
            const rateStr = daily 
              ? `₹${daily.toLocaleString()} / day` 
              : monthly 
              ? `₹${monthly.toLocaleString()} / mo` 
              : 'Rate unassigned';

            return (
              <div 
                key={worker.id} 
                className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* WORKER HEADER ROW */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden relative shrink-0 flex items-center justify-center">
                        {worker.photoUrl ? (
                          <img 
                            src={worker.photoUrl} 
                            alt={worker.name} 
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover" 
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="text-base font-bold text-slate-600 font-mono">
                            {worker.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                          {worker.name}
                        </h3>
                        <div className="text-xs text-slate-500 truncate mt-0.5">
                          {worker.designation || 'Factory Operator'}
                        </div>
                      </div>
                    </div>

                    {/* ACTIONS: Edit & Delete */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button 
                        onClick={() => onEditWorker(worker)}
                        title="Edit profile & wage"
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 size={15} />
                      </button>
                      
                      {profile?.role === 'FACTORY_OWNER' && (
                        <button 
                          onClick={() => setWorkerToDelete(worker)}
                          title="Remove worker"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* WORKER METADATA STRIP */}
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px]">Pay Rate</span>
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {rateStr}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px]">Phone</span>
                      <span className="font-mono text-slate-600 tabular-nums">
                        {worker.phone || 'No phone recorded'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="text-slate-400">Biometric Verification</span>
                      <span className={`font-medium flex items-center gap-1 ${hasFace ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {hasFace ? (
                          <>
                            <UserCheck size={12} className="text-emerald-600" />
                            <span>Face Enrolled</span>
                          </>
                        ) : (
                          <>
                            <Camera size={12} className="text-slate-400" />
                            <span>QR Code Only</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* BOTTOM ACTION: Kharchi / Advance */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <button 
                    onClick={() => handleOpenAdvance(worker)}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-semibold transition-all active:scale-98 flex items-center justify-center gap-1.5 ${
                      limits?.allowancesAndDeductionsEnabled 
                        ? 'bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 hover:border-emerald-200' 
                        : 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
                    }`}
                  >
                    <IndianRupee size={14} />
                    <span>Issue Advance (Kharchi)</span>
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* EMPTY STATE */}
      {filteredWorkers.length === 0 && !loading && (
        <div className="text-center p-12 bg-white rounded-2xl border border-dashed border-slate-200 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Search size={22} />
          </div>
          <h3 className="font-bold text-slate-900 text-sm">No matching workers found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchTerm 
              ? `No workers match "${searchTerm}". Try a different name or clear the search filter.`
              : 'Add your factory operators and staff to begin tracking attendance and running payroll.'}
          </p>
          <button 
            onClick={handleAddWorkerClick}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs shadow-xs transition-colors"
          >
            <Plus size={15} />
            <span>Add First Worker</span>
          </button>
        </div>
      )}

      {/* ADVANCE (KHARCHI) MODAL */}
      {advanceModal.isOpen && advanceModal.worker && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden border border-slate-100">
            <div className="p-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <IndianRupee size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Issue Advance (Kharchi)</h3>
                  <p className="text-[11px] text-slate-500 truncate max-w-[200px]">{advanceModal.worker.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setAdvanceModal(prev => ({ ...prev, isOpen: false }))} 
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-center text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-500 block text-[11px]">Earned this month</span>
                  <span className="font-bold text-slate-900 font-mono tabular-nums">
                    ₹{advanceModal.earned.toLocaleString()}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block text-[11px]">Advances Taken</span>
                  <span className="font-bold text-rose-600 font-mono tabular-nums">
                    ₹{advanceModal.existingAdvances.toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Advance Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-slate-400 font-bold text-sm">₹</span>
                  <input 
                    type="number" 
                    placeholder="e.g. 1000"
                    autoFocus
                    className="w-full pl-8 pr-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-mono tabular-nums text-base font-bold text-slate-900"
                    value={advanceModal.amount}
                    onChange={(e) => setAdvanceModal(prev => ({ ...prev, amount: e.target.value }))}
                  />
                </div>
                {willOverBorrow && (
                  <p className="text-[11px] text-amber-600 font-medium mt-1 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    <span>Amount exceeds total earnings accrued this month.</span>
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Date of Advance</label>
                <input 
                  type="date" 
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-600 text-xs font-mono tabular-nums text-slate-800"
                  value={advanceModal.date}
                  onChange={(e) => setAdvanceModal(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Reason / Note</label>
                <input 
                  type="text" 
                  placeholder="Kharchi, festival advance, medical expense..."
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-600 text-xs text-slate-800"
                  value={advanceModal.reason}
                  onChange={(e) => setAdvanceModal(prev => ({ ...prev, reason: e.target.value }))}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  onClick={() => setAdvanceModal(prev => ({ ...prev, isOpen: false }))} 
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveAdvance} 
                  disabled={advanceModal.isSaving || !advanceModal.amount}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs shadow-xs transition-colors"
                >
                  {advanceModal.isSaving ? 'Recording...' : 'Confirm Advance'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETION MODAL */}
      {workerToDelete && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-100">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <AlertTriangle size={24} />
            </div>
            
            <h2 className="text-base font-bold text-center text-slate-900 mb-1">Remove Worker?</h2>
            <p className="text-xs text-slate-500 text-center mb-5">
              Are you sure you want to remove <strong>{workerToDelete.name}</strong>? Their historical attendance records and wage ledger will be permanently deleted.
            </p>

            <div className="flex gap-2">
              <button 
                onClick={() => setWorkerToDelete(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-xs transition-colors"
              >
                {isDeleting ? 'Removing...' : 'Delete Worker'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};