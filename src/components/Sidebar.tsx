import React from 'react';
import { X, Building2, Users, Clock, LogOut, ChevronRight, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ScreenName } from '../types/index';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (screen: ScreenName) => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<Props> = ({ isOpen, onClose, onNavigate, onLogout }) => {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'FACTORY_OWNER';

  // CSS classes for slide animation
  const sidebarClass = `fixed inset-y-0 left-0 w-64 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-50 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`;
  const backdropClass = `fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`;

  const MenuItem = ({ icon: Icon, label, screen }: { icon: any, label: string, screen: ScreenName }) => (
    <button 
      onClick={() => { onNavigate(screen); onClose(); }}
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
      {/* Backdrop */}
      <div className={backdropClass} onClick={onClose} />

      {/* Sidebar Panel */}
      <div className={sidebarClass}>
        <div className="p-6 bg-blue-600 text-white flex justify-between items-start">
            <div>
               <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-3 backdrop-blur-sm border border-white/30">
                  <User size={24} className="text-white"/>
               </div>
               <h2 className="font-bold text-lg leading-tight">{profile?.companyName}</h2>
               <p className="text-blue-100 text-xs mt-1">{profile?.name}</p>
               <span className="inline-block mt-2 text-[10px] bg-black/20 px-2 py-0.5 rounded uppercase tracking-wider">
                  {profile?.role?.replace('_', ' ')}
               </span>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-blue-700 rounded-full transition-colors">
               <X size={20} />
            </button>
        </div>

        <div className="flex flex-col h-[calc(100%-180px)] overflow-y-auto">
           {isOwner && (
             <>
               <div className="px-4 py-2 bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider mt-2">
                 Administration
               </div>
               <MenuItem icon={Building2} label="Organization Profile" screen="SETTINGS" />
               <MenuItem icon={Clock} label="Shift & Rules" screen="SETTINGS" />
               <MenuItem icon={Users} label="Manage Managers" screen="TEAM" />
             </>
           )}
           
           <div className="px-4 py-2 bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider mt-2">
             App
           </div>
           <MenuItem icon={User} label="My Profile" screen="DASHBOARD" />
        </div>

        <div className="absolute bottom-0 w-full p-4 border-t border-gray-100 bg-white">
            <button onClick={onLogout} className="flex items-center justify-center w-full p-3 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl font-bold transition-colors">
                <LogOut size={18} className="mr-2" /> Logout
            </button>
        </div>
      </div>
    </>
  );
};