import React, { useState } from 'react';
import { Plus, Search, Phone, Filter } from 'lucide-react';
import { storageService } from '../services/storage';
import { Worker } from '../types';

interface Props {
  onAddWorker: () => void;
}

export const WorkersScreen: React.FC<Props> = ({ onAddWorker }) => {
  const [workers, setWorkers] = useState<Worker[]>(storageService.getWorkers());
  const [searchTerm, setSearchTerm] = useState('');

  const filteredWorkers = workers.filter(w => 
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.phone.includes(searchTerm)
  );

  return (
    <div className="p-4 h-full relative">
      {/* Header & Search */}
      <div className="flex space-x-2 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Search workers..." 
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button 
          onClick={onAddWorker}
          className="bg-blue-600 text-white p-2.5 rounded-lg shadow-md hover:bg-blue-700 transition-colors"
        >
          <Plus size={24} />
        </button>
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-4 hide-scrollbar mb-2">
        {['All', 'Production', 'Packaging', 'Helpers', 'Operators'].map((tag, i) => (
            <button key={i} className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${i === 0 ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                {tag}
            </button>
        ))}
      </div>

      {/* Worker List */}
      <div className="space-y-3 pb-20">
        {filteredWorkers.map(worker => (
          <div key={worker.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden border border-gray-200">
               {/* Use Avatar API for demo */}
               <img src={`https://ui-avatars.com/api/?name=${worker.name}&background=random`} alt={worker.name} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-800">{worker.name}</h3>
              <div className="flex items-center space-x-2 mt-1">
                 <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-medium">{worker.designation || 'Worker'}</span>
                 <span className="text-[10px] text-gray-400 uppercase tracking-wide">{worker.department}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center text-gray-600 text-xs mb-1 justify-end">
                <Phone size={12} className="mr-1" />
                {worker.phone}
              </div>
              <p className="text-sm font-semibold text-green-600">
                 {worker.wageConfig.type === 'DAILY' ? `₹${worker.wageConfig.amount}/d` : `₹${(worker.wageConfig.amount/1000).toFixed(1)}k/m`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
