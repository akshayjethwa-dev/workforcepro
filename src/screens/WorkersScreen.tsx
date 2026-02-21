import React, { useState, useEffect } from 'react';
import { Plus, Search, Phone, Edit2, Trash2, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { Worker } from '../types/index';

interface Props {
  onAddWorker: () => void;
  onEditWorker: (worker: Worker) => void; // New Prop
}

export const WorkersScreen: React.FC<Props> = ({ onAddWorker, onEditWorker }) => {
  // PULL LIMITS FROM AUTH CONTEXT
  const { profile, limits } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Helper to refresh list
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

  const handleDelete = async (worker: Worker) => {
    if (!window.confirm(`Are you sure you want to remove ${worker.name}? This cannot be undone.`)) return;
    
    try {
      await dbService.deleteWorker(worker.id);
      setWorkers(prev => prev.filter(w => w.id !== worker.id)); // Optimistic update
      alert("Worker removed.");
    } catch (e) {
      alert("Error deleting worker.");
    }
  };

  // --- NEW: CHECK LIMIT BEFORE ADDING ---
  const handleAddWorkerClick = () => {
    if (limits && workers.length >= limits.maxWorkers) {
        alert(`Your current plan limits you to ${limits.maxWorkers} workers. Please upgrade your plan to add more.`);
        return;
    }
    onAddWorker();
  };

  const filteredWorkers = workers.filter(w => 
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.phone.includes(searchTerm)
  );

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
              
              {/* ACTION BUTTONS */}
              <div className="flex space-x-2">
                <button 
                    onClick={() => onEditWorker(worker)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full"
                >
                    <Edit2 size={18} />
                </button>
                
                {/* ONLY FACTORY OWNER CAN DELETE */}
                {profile?.role === 'FACTORY_OWNER' && (
                    <button 
                        onClick={() => handleDelete(worker)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full"
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
    </div>
  );
};