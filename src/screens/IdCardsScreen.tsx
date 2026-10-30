// src/screens/IdCardsScreen.tsx
import React, { useState, useEffect } from 'react';
import { Printer, IdCard, Loader2, User as UserIcon, Search, Building2, ChevronRight, ArrowLeft, Lock, QrCode } from 'lucide-react';
import QRCode from 'react-qr-code';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { Worker } from '../types';
import { LiveQrBadgeModal } from '../components/LiveQrBadgeModal';

export const IdCardsScreen: React.FC = () => {
  const { profile, limits } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // State to hold the currently selected worker for printing
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [showLiveBadge, setShowLiveBadge] = useState(false);

  useEffect(() => {
    if (profile?.tenantId) {
      dbService.getWorkers(profile.tenantId).then((data) => {
        setWorkers(data.filter(w => w.status === 'ACTIVE'));
        setLoading(false);
      });
    }
  }, [profile]);

  // ==========================================
  // PLAN RESTRICTION CHECK
  // ==========================================
  if (!limits?.idCardEnabled) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-screen bg-slate-50 p-6">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
             <Lock className="text-indigo-600" size={28} />
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">Digital ID Cards Locked</h2>
          <p className="text-sm text-slate-500 mb-6">Generating and printing Smart Digital ID Cards with QR scanning is a premium feature. Please upgrade your plan to unlock this tool.</p>
        </div>
      </div>
    );
  }

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

  const DetailRow = ({ label, value }: { label: string, value: string }) => (
    <div className="flex flex-col">
      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{label}</span>
      <span className="text-xs font-bold text-slate-800 leading-tight">{value || '-'}</span>
    </div>
  );

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
        <div className="flex-1 flex justify-center items-center p-6 no-print-bg overflow-y-auto">
          
          {/* THE ACTUAL ID CARDS (Wrapped in a special print-section class) */}
          {/* FIXED: Changed to flex-col only (removed md:flex-row) to force top-to-bottom stack */}
          <div className="print-section flex flex-col items-center justify-center gap-8 w-full max-w-md mx-auto py-4">
            
            {/* --- FRONT OF CARD --- */}
            <div className="id-card-print w-72 bg-white rounded-2xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col relative shrink-0 h-105">
              {/* Header */}
              <div className="h-28 bg-gradient-to-br from-indigo-700 via-indigo-600 to-blue-500 flex flex-col items-center justify-start pt-6 px-4 text-center shrink-0">
                <div className="flex items-center text-white/90 mb-1">
                   <Building2 size={14} className="mr-1.5" />
                   <span className="text-[10px] font-bold tracking-widest uppercase">Factory Access</span>
                </div>
                <h3 className="text-white font-black text-sm tracking-widest uppercase truncate w-full">
                  {profile?.companyName || 'FACTORY NAME'}
                </h3>
              </div>
              
              {/* Profile Picture */}
              <div className="flex justify-center -mt-12 relative z-10 shrink-0">
                <div className="w-24 h-24 rounded-full border-4 border-white bg-slate-100 flex items-center justify-center overflow-hidden shadow-md">
                  {selectedWorker.photoUrl ? (
                    <img 
                      src={selectedWorker.photoUrl} 
                      alt={selectedWorker.name} 
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover" 
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="text-xl font-bold text-slate-500 font-mono">
                      {selectedWorker.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Details & QR */}
              <div className="px-6 pt-4 pb-6 flex flex-col items-center flex-1">
                  <h4 className="font-black text-xl text-slate-800 text-center leading-tight mb-1">
                    {selectedWorker.name}
                  </h4>
                  <p className="text-sm font-bold text-indigo-600 mb-2">
                    {selectedWorker.designation || 'Factory Staff'}
                  </p>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-slate-100 border border-slate-200 text-slate-500 px-3 py-1 rounded-full mb-4">
                      {selectedWorker.department || selectedWorker.category}
                  </span>
                  
                  <div className="bg-white p-2 border-2 border-dashed border-slate-200 rounded-xl mb-2 flex items-center justify-center mt-auto">
                    <QRCode 
                       value={selectedWorker.id} 
                       size={100} 
                       level="M" 
                       bgColor="#ffffff" 
                       fgColor="#1e293b" 
                    />
                  </div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    Scan at Kiosk
                  </p>
              </div>
            </div>

            {/* --- BACK OF CARD --- */}
            <div className="id-card-print w-72 bg-white rounded-2xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col relative shrink-0 h-105">
              <div className="bg-slate-100 py-3 text-center border-b border-slate-200 shrink-0">
                <h3 className="font-black text-xs tracking-widest text-slate-600 uppercase">Employee Details</h3>
              </div>
              
              <div className="px-6 py-5 flex-1 flex flex-col">
                <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                   <DetailRow label="Phone No." value={selectedWorker.phone} />
                   <DetailRow label="Date of Birth" value={selectedWorker.dob || selectedWorker.dateOfBirth || ''} />
                   <DetailRow label="Category" value={selectedWorker.category} />
                   <DetailRow label="Date of Joining" value={selectedWorker.joinedDate || selectedWorker.dateOfJoining || ''} />
                   
                   <div className="col-span-2">
                     <DetailRow label="Guardian / Father's Name" value={selectedWorker.fatherName || 'N/A'} />
                   </div>
                   
                   <div className="col-span-2">
                     <DetailRow label="Emergency Contact" value={selectedWorker.phone} />
                   </div>
                </div>

                <div className="mt-auto pt-6 text-center">
                   <div className="w-32 border-b-2 border-slate-800 mx-auto mb-1 h-8 flex items-end justify-center">
                     {/* Space for manual signature */}
                   </div>
                   <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Authorized Signatory</p>
                </div>
              </div>

              <div className="bg-slate-800 text-white p-3 text-center shrink-0">
                <p className="text-[9px] font-medium leading-tight text-slate-300">
                  If found, please return to:<br/>
                  <strong className="text-[10px] text-white tracking-wide mt-0.5 block">
                    {profile?.companyName || 'Factory Admin'}
                  </strong>
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Action Buttons at Bottom (Hidden on Print) */}
        <div className="bg-white p-4 border-t border-slate-200 no-print sticky bottom-0 pb-safe flex flex-col sm:flex-row gap-3">
           <button 
              type="button"
              onClick={() => setShowLiveBadge(true)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3.5 rounded-xl font-black flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer"
           >
              <QrCode size={18} className="mr-2" /> Live Rotating QR (≤ 60s)
           </button>
           <button 
              type="button"
              onClick={handlePrint}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3.5 rounded-xl font-black flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer"
           >
              <Printer size={18} className="mr-2" /> Print ID Cards
           </button>
        </div>

        {/* Live Rotating QR Badge Modal */}
        {selectedWorker && profile?.tenantId && (
          <LiveQrBadgeModal
            isOpen={showLiveBadge}
            onClose={() => setShowLiveBadge(false)}
            worker={selectedWorker}
            tenantId={profile.tenantId}
          />
        )}

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
            
            /* 1. HIDE EVERYTHING IN THE ENTIRE APP */
            body * {
              visibility: hidden !important;
            }
            
            /* 2. UNHIDE ONLY THE PRINT SECTION AND ITS CHILDREN */
            .print-section, .print-section * {
              visibility: visible !important;
            }
            
            /* 3. ALIGN CARDS TOP-TO-BOTTOM ON THE PAGE */
            .print-section {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
              display: flex !important;
              flex-direction: column !important; /* FIXED: Force column layout for printing */
              justify-content: flex-start !important;
              align-items: center !important; /* Center the cards on the A4 page */
              gap: 30px !important; /* Space between front and back card */
            }

            /* Strip shadows for a clean paper print */
            .id-card-print {
              box-shadow: none !important;
              border: 1px solid #cbd5e1 !important;
              border-radius: 12px !important;
              margin: 0 !important;
              width: 260px !important;
              height: 400px !important;
              page-break-inside: avoid !important; /* Prevent card from being split across pages */
            }

            .no-print { display: none !important; }
          }
        `}} />
      </div>
    );
  }

  // ==========================================
  // VIEW 1: CLEAN RESPONSIVE DIRECTORY GRID
  // ==========================================
  return (
    <div className="space-y-6 pb-12">
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Worker ID Card Studio</h1>
          <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
            <span>Generate & print factory QR identity badges for staff</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums text-slate-600">{filteredWorkers.length} active workers</span>
          </div>
        </div>
      </div>

      {/* Clean Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3 text-slate-400" size={17} />
        <input
          type="text"
          placeholder="Search by worker name, role, or department..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all shadow-xs"
        />
      </div>

      {/* Responsive Dual Viewport Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredWorkers.map(worker => (
          <div 
            key={worker.id}
            onClick={() => setSelectedWorker(worker)}
            className="bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-slate-200/80 flex items-center justify-between gap-3 cursor-pointer active:scale-[0.99] transition-all hover:border-blue-300 hover:shadow-md group"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center group-hover:border-blue-300 transition-colors">
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
                  <span className="text-sm font-bold text-slate-600 font-mono">
                    {worker.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              
              <div className="min-w-0">
                <h4 className="font-bold text-sm text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                  {worker.name}
                </h4>
                <div className="text-xs text-slate-500 truncate mt-0.5 flex items-center gap-1.5">
                  <span>{worker.designation || 'Staff'}</span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="truncate">{worker.department || 'Floor Ops'}</span>
                </div>
              </div>
            </div>

            <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 flex items-center justify-center shrink-0 transition-colors">
              <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        ))}
      </div>

      {filteredWorkers.length === 0 && (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-xs flex flex-col items-center">
          <IdCard size={32} className="mx-auto mb-2 text-slate-300" />
          <h3 className="text-sm font-bold text-slate-800">No Workers Found</h3>
          <p className="text-xs text-slate-500 mt-1">Try clearing your search term or filter.</p>
        </div>
      )}
    </div>
  );
};