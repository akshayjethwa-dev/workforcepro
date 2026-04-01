// src/components/Sidebar.tsx
import React, { useState } from 'react';
import { 
  X, Building2, Users, Clock, LogOut, ChevronRight, User, Shield, History, FileText, CreditCard, PieChart, IdCard, Headset, FileCheck, Trash2, AlertTriangle, Loader2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ScreenName } from '../types/index';
import { dbService } from '../services/db';
import { auth } from '../lib/firebase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (screen: ScreenName) => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<Props> = ({ isOpen, onClose, onNavigate, onLogout }) => {
  const { profile, limits } = useAuth(); 
  const isOwner = profile?.role === 'FACTORY_OWNER';
  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Increased the bottom calculation slightly to ensure the last item is fully visible above the absolute bottom bar
  const sidebarClass = `fixed inset-y-0 left-0 w-64 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-50 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`;
  const backdropClass = `fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`;

  const handleSupportClick = () => {
    // Replace with your actual WhatsApp support number
    const adminPhone = "918460852903"; 
    const message = encodeURIComponent(`Hello WorkforcePro Support, I need some help regarding my organization (${profile?.companyName || 'Not Set'}).`);
    window.open(`https://wa.me/${adminPhone}?text=${message}`, '_blank');
    onClose();
  };

  const handleDeleteAccount = async () => {
    if (!profile?.tenantId || !auth.currentUser) return;
    
    setIsDeleting(true);
    try {
        // 1. Delete all Firestore Data
        await dbService.deleteTenantAccount(profile.tenantId, auth.currentUser.uid);
        
        // 2. Delete Firebase Auth User
        await auth.currentUser.delete();
        
        // 3. Close modal and trigger logout (which handles routing to login)
        setShowDeleteModal(false);
        onLogout();
        
    } catch (error: any) {
        console.error(error);
        if (error.code === 'auth/requires-recent-login') {
             alert("For security reasons, please log out, log back in, and try deleting your account again.");
        } else {
             alert("Failed to delete account. Please contact support.");
        }
        setIsDeleting(false);
    }
  };

  const MenuItem = ({ icon: Icon, label, screen, onClick }: { icon: any, label: string, screen?: ScreenName, onClick?: () => void }) => (
    <button 
      onClick={() => { 
          if (onClick) {
              onClick();
          } else if (screen) {
              onNavigate(screen); 
              onClose(); 
          }
      }}
      className="flex items-center w-full p-4 hover:bg-gray-50 text-gray-700 transition-colors border-b border-gray-50"
    >
      <div className="bg-blue-50 p-2 rounded-lg text-blue-600 mr-3">
        <Icon size={20} />
      </div>
      <span className="font-medium flex-1 text-left">{label}</span>
      <ChevronRight size={16} className="text-gray-300" />
    </button>
  );

  return (
    <>
      <div className={backdropClass} onClick={onClose} />
      <div className={sidebarClass}>
        <div className="p-6 bg-slate-900 text-white flex justify-between items-start">
            <div>
               <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mb-3 backdrop-blur-sm border border-white/20">
                  <User size={24} className="text-white"/>
               </div>
               <h2 className="font-bold text-lg leading-tight">{profile?.companyName || 'Super Admin'}</h2>
               <p className="text-slate-400 text-xs mt-1">{(profile as any)?.name || profile?.email}</p>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-full transition-colors">
               <X size={20} />
            </button>
        </div>

        {/* Scrollable Menu List */}
        <div className="flex flex-col h-[calc(100%-190px)] overflow-y-auto pb-6">
           {/* SUPER ADMIN MENU (Single Item) */}
           {isSuperAdmin ? (
             <>
               <div className="px-4 py-2 bg-indigo-50 text-xs font-bold text-indigo-800 uppercase tracking-wider mt-2 border-l-4 border-indigo-500">
                 Admin Console
               </div>
               <MenuItem icon={Shield} label="Master Dashboard" screen="SUPER_ADMIN_DASHBOARD" />
             </>
           ) : (
             /* REGULAR MENUS */
             <>
               {isOwner && (
                 <>
                   <div className="px-4 py-2 bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider mt-2">
                     Administration
                   </div>
                   <MenuItem icon={Building2} label="Organization Profile" screen="SETTINGS" />
                   <MenuItem icon={Clock} label="Shift & Rules" screen="SETTINGS" />
                   <MenuItem icon={Users} label="Manage Managers" screen="TEAM" />
                   <MenuItem icon={CreditCard} label="Subscription & Billing" screen="BILLING" />
                 </>
               )}
               
               <div className="px-4 py-2 bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider mt-2">
                 Management
               </div>
               <MenuItem icon={Users} label="Workers Directory" screen="WORKERS" />
               {limits?.idCardEnabled && (
                 <MenuItem icon={IdCard} label="Digital ID Cards" screen="ID_CARDS" />
               )}
               <MenuItem icon={History} label="Worker History" screen="WORKER_HISTORY" />
               <MenuItem icon={FileText} label="Payroll Reports" screen="PAYROLL" />
               <MenuItem icon={PieChart} label="Factory Reports" screen="REPORTS" />
             </>
           )}

           {/* Support & Legal Section */}
           <div className="px-4 py-2 bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider mt-2 border-t border-gray-100">
              Support & Legal
           </div>
           <MenuItem icon={Headset} label="WhatsApp Support" onClick={handleSupportClick} />
           <MenuItem icon={FileCheck} label="Terms & Conditions" screen="TERMS" />
           <MenuItem icon={Shield} label="Privacy Policy" screen="PRIVACY" />

           {/* Separate Delete Account Option in the Scrollable Area */}
           {isOwner && !isSuperAdmin && (
             <>
               <div className="px-4 py-2 bg-red-50 text-xs font-bold text-red-400 uppercase tracking-wider mt-2 border-t border-red-100">
                  Danger Zone
               </div>
               <button 
                  onClick={() => { setShowDeleteModal(true); onClose(); }}
                  className="flex items-center w-full p-4 hover:bg-red-50 text-red-600 transition-colors border-b border-gray-50"
               >
                  <div className="bg-red-100 p-2 rounded-lg text-red-600 mr-3">
                    <Trash2 size={20} />
                  </div>
                  <span className="font-bold flex-1 text-left">Delete Account</span>
               </button>
             </>
           )}
        </div>

        {/* Absolute Bottom: Full Width Logout Button */}
        <div className="absolute bottom-0 w-full p-4 border-t border-gray-100 bg-white">
            <button 
                onClick={onLogout} 
                className="flex items-center justify-center w-full p-3 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold transition-colors"
            >
                <LogOut size={18} className="mr-2" /> Logout
            </button>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 z-60 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
           <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl relative transform transition-all scale-100">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-md">
                 <AlertTriangle size={32} className="text-red-600" />
              </div>
              
              <h2 className="text-xl font-black text-center text-gray-900 mb-2">Delete Account?</h2>
              
              <div className="bg-red-50 p-4 rounded-xl border border-red-100 mb-6">
                 <p className="text-sm text-red-800 text-center font-medium">
                   This action is <span className="font-black underline">permanent and irreversible</span>.
                 </p>
                 <ul className="text-xs text-red-700 mt-3 space-y-1.5 list-disc pl-4 text-left">
                    <li>All Worker Profiles & Faces will be deleted.</li>
                    <li>All Attendance & Payroll history will be wiped.</li>
                    <li>All Kiosk Terminals will be unlinked.</li>
                    <li>All Manager accounts will be disconnected.</li>
                 </ul>
              </div>

              <div className="flex space-x-3">
                 <button 
                    onClick={() => setShowDeleteModal(false)}
                    disabled={isDeleting}
                    className="flex-1 py-3.5 bg-gray-100 text-gray-700 font-bold rounded-xl text-sm hover:bg-gray-200 transition-colors disabled:opacity-50"
                 >
                    Cancel
                 </button>
                 <button 
                    onClick={handleDeleteAccount}
                    disabled={isDeleting}
                    className="flex-1 py-3.5 bg-red-600 text-white font-bold rounded-xl text-sm shadow-lg shadow-red-200 hover:bg-red-700 transition-all flex items-center justify-center disabled:opacity-50"
                 >
                    {isDeleting ? <Loader2 size={18} className="animate-spin" /> : 'Yes, Delete Everything'}
                 </button>
              </div>
           </div>
        </div>
      )}
    </>
  );
};