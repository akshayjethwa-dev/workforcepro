// src/screens/IdCardsScreen.tsx
import React, { useState, useEffect } from 'react';
import { Printer, IdCard, Loader2, User as UserIcon, Search, Building2, ChevronRight, ArrowLeft } from 'lucide-react';
import QRCode from 'react-qr-code';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { Worker } from '../types';

export const IdCardsScreen: React.FC = () => {
  const { profile } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // State to hold the currently selected worker for printing
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);

  useEffect(() => {
    if (profile?.tenantId) {
      dbService.getWorkers(profile.tenantId).then((data) => {
        setWorkers(data.filter(w => w.status === 'ACTIVE'));
        setLoading(false);
      });
    }
  }, [profile]);

  const filteredWorkers = workers.filter(w => 
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.department && w.department.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handlePrint = () => {
    // A small timeout ensures the browser has fully painted the QR code before opening the print dialog
    setTimeout(() => {
      window.print();
    }, 100);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full min-h-screen bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  // ==========================================
  // VIEW 2: INDIVIDUAL CARD PREVIEW & PRINT
  // ==========================================
  if (selectedWorker) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-100 print:bg-white relative">
        
        {/* Mobile-Friendly Top Bar (Hidden on Print) */}
        <div className="bg-white px-4 py-4 flex items-center shadow-sm border-b border-slate-200 no-print sticky top-0 z-10">
          <button 
            onClick={() => setSelectedWorker(null)}
            className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft size={24} className="text-slate-700" />
          </button>
          <h2 className="text-lg font-black text-slate-800 ml-2">Preview ID Card</h2>
        </div>

        {/* Card Preview Area */}
        <div className="flex-1 flex justify-center items-center p-6 no-print-bg">
          
          {/* THE ACTUAL ID CARD (Wrapped in a special print-section class) */}
          <div className="print-section">
            <div className="id-card-print w-70 bg-white rounded-2xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col relative">
              
              {/* Header */}
              <div className="h-28 bg-linear-to-br from-indigo-700 via-indigo-600 to-blue-500 flex flex-col items-center justify-start pt-6 px-4 text-center">
                <div className="flex items-center text-white/90 mb-1">
                   <Building2 size={14} className="mr-1.5" />
                   <span className="text-[10px] font-bold tracking-widest uppercase">Factory Access</span>
                </div>
                <h3 className="text-white font-black text-sm tracking-widest uppercase truncate w-full">
                  {profile?.companyName || 'FACTORY NAME'}
                </h3>
              </div>
              
              {/* Profile Picture */}
              <div className="flex justify-center -mt-12 relative z-10">
                <div className="w-24 h-24 rounded-full border-4 border-white bg-slate-100 flex items-center justify-center overflow-hidden shadow-md">
                  {selectedWorker.photoUrl ? (
                    <img src={selectedWorker.photoUrl} alt={selectedWorker.name} className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon size={32} className="text-slate-300" />
                  )}
                </div>
              </div>
              
              {/* Details & QR */}
              <div className="px-6 pt-5 pb-6 flex flex-col items-center flex-1">
                  <h4 className="font-black text-xl text-slate-800 text-center leading-tight mb-1">
                    {selectedWorker.name}
                  </h4>
                  <p className="text-sm font-bold text-indigo-600 mb-2">
                    {selectedWorker.designation || 'Factory Staff'}
                  </p>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-slate-100 border border-slate-200 text-slate-500 px-3 py-1 rounded-full mb-6">
                      {selectedWorker.department || selectedWorker.category}
                  </span>
                  
                  <div className="bg-white p-2 border-2 border-dashed border-slate-200 rounded-xl mb-3 flex items-center justify-center">
                    <QRCode 
                       value={selectedWorker.id} 
                       size={120} 
                       level="M" 
                       bgColor="#ffffff" 
                       fgColor="#1e293b" 
                    />
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    Scan at Kiosk
                  </p>
              </div>
            </div>
          </div>

        </div>

        {/* Sticky Print Button at Bottom (Hidden on Print) */}
        <div className="bg-white p-4 border-t border-slate-200 no-print sticky bottom-0 pb-safe">
           <button 
              onClick={handlePrint}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-4 rounded-xl font-black flex items-center justify-center shadow-lg shadow-indigo-200 active:scale-95 transition-all"
           >
              <Printer size={20} className="mr-2" /> Print This Card
           </button>
        </div>

        {/* BULLETPROOF PRINT ISOLATION CSS */}
        <style dangerouslySetInnerHTML={{__html: `
          @media print {
            @page { size: auto; margin: 10mm; }
            
            /* Force background colors to render */
            body, html { 
              background: white !important; 
              -webkit-print-color-adjust: exact !important; 
              print-color-adjust: exact !important; 
            }
            
            /* 1. HIDE EVERYTHING IN THE ENTIRE APP (This kills the Trial Banner, Sidebar, Nav, etc.) */
            body * {
              visibility: hidden !important;
            }
            
            /* 2. UNHIDE ONLY THE PRINT SECTION AND ITS CHILDREN */
            .print-section, .print-section * {
              visibility: visible !important;
            }
            
            /* 3. SNAP THE PRINT SECTION TO THE TOP LEFT OF THE PAPER */
            .print-section {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
            }

            /* Strip shadows for a clean paper print */
            .id-card-print {
              box-shadow: none !important;
              border: 2px solid #cbd5e1 !important;
              border-radius: 16px !important;
              margin: 0 !important;
            }

            .no-print { display: none !important; }
          }
        `}} />
      </div>
    );
  }

  // ==========================================
  // VIEW 1: CLEAN MOBILE DIRECTORY LIST
  // ==========================================
  return (
    <div className="p-4 sm:p-6 bg-slate-50 min-h-screen pb-24">
      
      {/* Header Area */}
      <div className="mb-6">
        <h2 className="text-2xl font-black text-slate-900 flex items-center tracking-tight">
          <IdCard className="mr-3 text-indigo-600" size={28} /> 
          Digital ID Cards
        </h2>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Select a worker to preview and print their smart badge.
        </p>
      </div>

      {/* Clean Search Bar */}
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-slate-400" />
        </div>
        <input
          type="text"
          placeholder="Search by name or department..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 shadow-sm transition-all"
        />
      </div>

      {/* Clean List View */}
      <div className="space-y-3">
        {filteredWorkers.map(worker => (
          <div 
            key={worker.id}
            onClick={() => setSelectedWorker(worker)}
            className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center cursor-pointer active:scale-[0.98] active:bg-slate-50 transition-all hover:border-indigo-100 hover:shadow-md"
          >
            {/* Small Avatar */}
            <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
              {worker.photoUrl ? (
                <img src={worker.photoUrl} alt={worker.name} className="w-full h-full object-cover" />
              ) : (
                <UserIcon size={20} className="text-slate-400" />
              )}
            </div>
            
            {/* Info */}
            <div className="ml-4 flex-1 overflow-hidden">
              <h4 className="font-bold text-slate-800 truncate">{worker.name}</h4>
              <div className="flex items-center mt-0.5">
                 <span className="text-xs text-indigo-600 font-bold truncate">{worker.designation || 'Staff'}</span>
                 <span className="text-xs text-slate-300 mx-1.5">•</span>
                 <span className="text-xs text-slate-500 truncate">{worker.department || 'General'}</span>
              </div>
            </div>

            {/* Chevron */}
            <div className="ml-3 w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
               <ChevronRight size={18} className="text-slate-400" />
            </div>
          </div>
        ))}

        {filteredWorkers.length === 0 && (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 shadow-sm flex flex-col items-center mt-6">
            <div className="bg-slate-50 p-4 rounded-full mb-4">
               <Search size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-black text-slate-800">No Workers Found</h3>
            <p className="text-slate-500 text-sm mt-1">Try adjusting your search term.</p>
          </div>
        )}
      </div>

    </div>
  );
};