import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, AlertTriangle, X, IndianRupee, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { wageService } from '../services/wageService';
import { Worker } from '../types/index';

interface Props {
  onAddWorker: () => void;
  onEditWorker: (worker: Worker) => void;
}

export const WorkersScreen: React.FC<Props> = ({ onAddWorker, onEditWorker }) => {
  const { profile, limits } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  // State for deletion modal
  const [workerToDelete, setWorkerToDelete] = useState<Worker | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // NEW: State for Advance (Kharchi) Modal
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

  const loadWorkers = async () => {
    if (profile?.tenantId) {
      try {
        const data = await dbService.getWorkers(profile.tenantId);
        setWorkers(data);
      } catch (error) {
        console.error("Failed to load workers", error);
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => { loadWorkers(); }, [profile]);

  // Custom deletion logic handled via modal
  const confirmDelete = async () => {
    if (!workerToDelete || !profile?.tenantId) return;
    setIsDeleting(true);
    
    try {
      // Pass BOTH the tenantId and the workerId to satisfy Firestore Security Rules
      await dbService.deleteWorker(profile.tenantId, workerToDelete.id);
      
      setWorkers(prev => prev.filter(w => w.id !== workerToDelete.id)); 
      setWorkerToDelete(null);
    } catch (e) {
      console.error("Deletion failed:", e);
      alert("Error deleting worker. Please check your network connection.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddWorkerClick = () => {
    if (limits && workers.length >= limits.maxWorkers) {
        alert(`Your current plan limits you to ${limits.maxWorkers} workers. Please upgrade your plan to add more.`);
        return;
    }
    onAddWorker();
  };

  // NEW: Quick Action Logic for Advances
  const handleOpenAdvance = async (worker: Worker) => {
    if (!profile?.tenantId) return;
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    // Quick calc for guardrail
    const attendance = await dbService.getAttendanceHistory(profile.tenantId);
    const advances = await dbService.getAdvances(profile.tenantId);
    
    const earned = wageService.calculateCurrentEarnings(worker, currentMonth, attendance);
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
  };

  const handleSaveAdvance = async () => {
    if (!profile?.tenantId || !advanceModal.worker || !advanceModal.amount) return;
    setAdvanceModal(prev => ({ ...prev, isSaving: true }));
    try {
      await dbService.addAdvance({
        tenantId: profile.tenantId,
        workerId: advanceModal.worker.id,
        amount: parseFloat(advanceModal.amount),
        date: advanceModal.date,
        reason: advanceModal.reason || 'Kharchi',
        status: 'APPROVED'
      });
      setAdvanceModal(prev => ({ ...prev, isOpen: false, isSaving: false }));
    } catch (e) {
      console.error(e);
      alert("Error saving advance.");
      setAdvanceModal(prev => ({ ...prev, isSaving: false }));
    }
  };

  const filteredWorkers = workers.filter(w => 
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.phone.includes(searchTerm)
  );

  const willOverBorrow = (Number(advanceModal.amount || 0) + advanceModal.existingAdvances) > advanceModal.earned;

  return (
    <div className="p-4 h-full relative bg-gray-50 min-h-screen">
      <div className="flex space-x-2 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Search workers..." 
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button 
          onClick={handleAddWorkerClick}
          className="bg-blue-600 text-white p-2.5 rounded-lg shadow-md hover:bg-blue-700 transition-colors"
        >
          <Plus size={24} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center mt-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="space-y-3 pb-24">
          {filteredWorkers.map(worker => (
            <div key={worker.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden border border-gray-200 relative">
                 {worker.photoUrl ? (
                    <img src={worker.photoUrl} alt="" className="w-full h-full object-cover" />
                 ) : (
                    <span className="text-xl font-bold text-gray-500">{worker.name.charAt(0)}</span>
                 )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-800 truncate">{worker.name}</h3>
                <div className="flex items-center space-x-2 mt-1">
                   <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-medium">{worker.designation || 'Worker'}</span>
                </div>
              </div>
              
              <div className="flex space-x-2">
                {/* NEW: Quick Advance Button */}
                <button 
                    onClick={() => handleOpenAdvance(worker)}
                    className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-full transition-colors"
                    title="Give Advance"
                >
                    <IndianRupee size={18} />
                </button>

                <button 
                    onClick={() => onEditWorker(worker)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                >
                    <Edit2 size={18} />
                </button>
                
                {profile?.role === 'FACTORY_OWNER' && (
                    <button 
                        onClick={() => setWorkerToDelete(worker)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                    >
                        <Trash2 size={18} />
                    </button>
                )}
              </div>
            </div>
          ))}
          
          {filteredWorkers.length === 0 && !loading && (
             <div className="text-center text-gray-400 mt-10 p-8 border-2 border-dashed border-gray-200 rounded-xl">
                <p className="font-bold">No workers found</p>
                <p className="text-xs mt-1">Tap the + button to add your first worker.</p>
             </div>
          )}
        </div>
      )}

      {/* NEW: Advance (Kharchi) Modal */}
      {advanceModal.isOpen && advanceModal.worker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
            <div className="bg-green-50 p-4 flex items-center justify-between border-b border-green-100">
              <div className="flex items-center text-green-700 font-bold">
                  <IndianRupee size={20} className="mr-2" /> Give Advance
              </div>
              <button 
                  onClick={() => setAdvanceModal(prev => ({ ...prev, isOpen: false }))} 
                  className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                  <X size={20} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div className="flex justify-between text-xs bg-gray-50 p-2 rounded-lg border border-gray-100">
                  <span className="text-gray-500">Earned so far: <span className="font-bold text-gray-800">₹{advanceModal.earned.toLocaleString()}</span></span>
                  <span className="text-gray-500">Taken: <span className="font-bold text-red-500">₹{advanceModal.existingAdvances.toLocaleString()}</span></span>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Amount (₹)</label>
                <input 
                    type="number" 
                    autoFocus 
                    value={advanceModal.amount} 
                    onChange={(e) => setAdvanceModal(prev => ({ ...prev, amount: e.target.value }))} 
                    className="w-full p-3 mt-1 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 font-bold text-lg" 
                    placeholder="e.g. 500" 
                />
              </div>

              {/* OVER-BORROWING GUARDRAIL */}
              {willOverBorrow && advanceModal.amount && (
                 <div className="flex items-start bg-orange-50 text-orange-800 p-3 rounded-lg border border-orange-200 text-xs">
                    <AlertTriangle size={16} className="mr-2 shrink-0 mt-0.5" />
                    <p><strong>Over-Borrowing Alert:</strong> The total advance taken will exceed their currently earned wages. Proceed with caution.</p>
                 </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Date</label>
                    <input 
                        type="date" 
                        value={advanceModal.date} 
                        onChange={(e) => setAdvanceModal(prev => ({ ...prev, date: e.target.value }))} 
                        className="w-full p-3 mt-1 bg-gray-50 border border-gray-200 rounded-lg outline-none font-bold text-sm" 
                    />
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Note</label>
                    <input 
                        type="text" 
                        value={advanceModal.reason} 
                        onChange={(e) => setAdvanceModal(prev => ({ ...prev, reason: e.target.value }))} 
                        className="w-full p-3 mt-1 bg-gray-50 border border-gray-200 rounded-lg outline-none font-bold text-sm" 
                        placeholder="e.g. Medical" 
                    />
                </div>
              </div>

              <button 
                  onClick={handleSaveAdvance} 
                  disabled={advanceModal.isSaving || !advanceModal.amount} 
                  className="w-full mt-4 py-3 rounded-lg font-bold text-white bg-green-600 hover:bg-green-700 transition-colors flex justify-center items-center disabled:opacity-50"
              >
                {advanceModal.isSaving ? 'Saving...' : <><Save size={18} className="mr-2" /> Save Advance</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deletion Warning Modal */}
      {workerToDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="bg-red-50 p-4 flex items-center justify-between border-b border-red-100">
              <div className="flex items-center text-red-600 font-bold">
                <AlertTriangle size={20} className="mr-2" />
                Remove Worker
              </div>
              <button 
                onClick={() => setWorkerToDelete(null)}
                className="text-red-400 hover:text-red-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Body */}
            <div className="p-5">
              <p className="text-gray-800 font-medium mb-3 text-center">
                Are you sure you want to remove <span className="font-bold">{workerToDelete.name}</span>?
              </p>
              
              <div className="bg-orange-50 text-orange-800 text-xs p-3 rounded-lg border border-orange-200 mb-4">
                <strong>Warning:</strong> This action is permanent. Deleting this worker will also completely remove their:
                <ul className="list-disc ml-5 mt-1 space-y-1">
                  <li>Attendance history & punches</li>
                  <li>Advance payments</li>
                  <li>Payroll & salary records</li>
                </ul>
              </div>

              {/* Actions */}
              <div className="flex space-x-3 mt-5">
                <button
                  onClick={() => setWorkerToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 rounded-lg font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 transition-colors flex justify-center items-center"
                >
                  {isDeleting ? 'Removing...' : 'Yes, Remove'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};