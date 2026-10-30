import React, { useState, useEffect } from 'react';
import { 
  X, Building2, Users, Clock, LogOut, ChevronRight, User, Shield, 
  History, FileText, CreditCard, PieChart, IdCard, Headset, FileCheck, 
  Trash2, AlertTriangle, Loader2, Home, Camera, Sparkles, Settings, IndianRupee, BookOpen, Inbox, Calendar
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';
import { useEntitlements } from '../contexts/EntitlementContext';
import { ScreenName } from '../types/index';
import { dbService } from '../services/db';
import { inboxService } from '../services/inboxService';
import { auth } from '../lib/firebase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentScreen: ScreenName;
  onNavigate: (screen: ScreenName) => void;
  onLogout: () => void;
  isDesktop?: boolean;
  onOpenGuide?: () => void;
}

export const Sidebar: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  currentScreen, 
  onNavigate, 
  onLogout, 
  isDesktop = false,
  onOpenGuide
}) => {
  const { profile, limits } = useAuth(); 
  const { toast } = useToast();
  const { effectiveBranding } = useTheme();
  const { isEntitled } = useEntitlements();
  const isOwner = profile?.role === 'FACTORY_OWNER';
  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';
  const isReseller = profile?.role === 'RESELLER';

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);

  useEffect(() => {
    if (profile?.tenantId) {
      inboxService.getPendingCount(profile.tenantId, profile)
        .then(count => setInboxCount(count))
        .catch(() => {});
    }
  }, [profile?.tenantId, currentScreen]);

  const handleSupportClick = () => {
    const adminPhone = "918460852903"; 
    const message = encodeURIComponent(`Hello WorkforcePro Support, I need some help regarding my organization (${profile?.companyName || 'Not Set'}).`);
    window.open(`https://wa.me/${adminPhone}?text=${message}`, '_blank');
    if (!isDesktop) onClose();
  };

  const handleDeleteAccount = async () => {
    if (!profile?.tenantId || !auth.currentUser) {
      toast.error('Unable to delete account: user credentials missing.');
      return;
    }
    
    setIsDeleting(true);
    try {
      await dbService.deleteTenantAccount(profile.tenantId, auth.currentUser.uid);
      await auth.currentUser.delete();
      setShowDeleteModal(false);
      toast.success('Your organization account has been deleted.');
      onLogout();
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/requires-recent-login') {
        toast.error('For security, please log out and log back in before deleting account.');
      } else {
        toast.error('Failed to delete account. Please contact technical support.');
      }
      setIsDeleting(false);
    }
  };

  const NavItem = ({ 
    icon: Icon, 
    label, 
    screen, 
    onClick,
    badge
  }: { 
    icon: any; 
    label: string; 
    screen?: ScreenName; 
    onClick?: () => void;
    badge?: string;
  }) => {
    const isActive = screen ? currentScreen === screen : false;
    return (
      <button 
        onClick={() => { 
          if (onClick) {
            onClick();
          } else if (screen) {
            onNavigate(screen); 
            if (!isDesktop) onClose(); 
          }
        }}
        className={`flex items-center w-full px-3 py-2.5 rounded-xl transition-all duration-150 text-xs font-medium group ${
          isActive 
            ? 'bg-blue-600 text-white shadow-xs font-semibold' 
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
        }`}
      >
        <div className={`p-1.5 rounded-lg mr-2.5 shrink-0 transition-colors ${
          isActive 
            ? 'bg-white/15 text-white' 
            : 'text-slate-500 group-hover:text-slate-900'
        }`}>
          <Icon size={16} />
        </div>
        <span className="flex-1 text-left truncate">{label}</span>
        {badge && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
            isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {badge}
          </span>
        )}
      </button>
    );
  };

  const content = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 select-none">
      {/* Brand & Workspace Tile */}
      <div className="p-4 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {effectiveBranding.logoUrl ? (
            <div className="w-10 h-10 rounded-xl bg-white p-1 border border-slate-700 flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
              <img src={effectiveBranding.logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base text-white shadow-md shadow-blue-900/40 shrink-0"
              style={{ backgroundColor: effectiveBranding.primaryColor || '#2563eb' }}
            >
              {(effectiveBranding.appName || profile?.companyName || 'W').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="font-bold text-sm leading-tight text-white truncate">
              {effectiveBranding.appName || profile?.companyName || (isSuperAdmin ? 'Admin Console' : isReseller ? 'Partner Portal' : 'WorkForce Pro')}
            </h2>
            <div className="text-[11px] text-slate-400 font-medium mt-0.5 truncate flex items-center gap-1.5">
              <span>{isSuperAdmin ? 'Super Admin' : isReseller ? 'Channel Partner' : isOwner ? 'Factory Admin' : 'Supervisor'}</span>
              {effectiveBranding.customDomain?.domain && (
                <span className="text-[9px] px-1 rounded bg-slate-800 text-blue-300 font-mono">
                  {effectiveBranding.customDomain.status === 'VERIFIED' ? 'Custom Domain' : 'DNS Pending'}
                </span>
              )}
            </div>
          </div>
        </div>

        {!isDesktop && (
          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors ml-2"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-5 scrollbar-thin">
        {/* SUPER ADMIN CONSOLE */}
        {isSuperAdmin && (
          <div className="space-y-1">
            <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Master Admin
            </div>
            <NavItem icon={Shield} label="Tenants & SaaS Matrix" screen="SUPER_ADMIN_DASHBOARD" />
            <NavItem icon={CreditCard} label="Billing Plans" screen="BILLING" />
          </div>
        )}

        {/* RESELLER DASHBOARD */}
        {isReseller && (
          <div className="space-y-1">
            <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Partner Agency
            </div>
            <NavItem icon={Building2} label="Client Factories" screen="RESELLER_DASHBOARD" />
            <NavItem icon={CreditCard} label="Partner Commission" screen="RESELLER_DASHBOARD" />
          </div>
        )}

        {/* STANDARD TENANT MENU */}
        {!isSuperAdmin && (
          <>
            <div className="space-y-1">
              <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Core Operations
              </div>
              <NavItem icon={Home} label="Overview Dashboard" screen="DASHBOARD" />
              <NavItem 
                icon={Inbox} 
                label="Action Inbox" 
                screen="INBOX" 
                badge={inboxCount > 0 ? `${inboxCount}` : undefined} 
              />
              <NavItem icon={Users} label="Workers Directory" screen="WORKERS" />
              <NavItem icon={Clock} label="Attendance Logs" screen="ATTENDANCE" />
              <NavItem icon={Calendar} label="Shift Roster & Publish" screen="ROSTER" />
              <NavItem 
                icon={Camera} 
                label="Kiosk Scanner" 
                screen="ATTENDANCE_KIOSK" 
                badge={!isEntitled('KIOSK_MODE') ? 'Upgrade' : 'Live'} 
              />
            </div>

            <div className="space-y-1">
              <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Payroll & Wages
              </div>
              <NavItem 
                icon={IndianRupee} 
                label="Monthly Payroll" 
                screen="PAYROLL" 
                badge={!isEntitled('ADVANCED_PAYROLL') ? 'Pro' : undefined}
              />
              <NavItem icon={History} label="Daily Wage Logs" screen="DAILY_LOGS" />
              <NavItem 
                icon={IdCard} 
                label="Digital ID Cards" 
                screen="ID_CARDS" 
                badge={!isEntitled('DIGITAL_ID_CARDS') ? 'Starter' : undefined}
              />
              <NavItem icon={PieChart} label="Factory Reports" screen="REPORTS" />
            </div>

            {isOwner && (
              <div className="space-y-1">
                <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Administration
                </div>
                <NavItem icon={Settings} label="Factory & Shift Setup" screen="SETTINGS" />
                <NavItem icon={Users} label="Supervisor Team" screen="TEAM" />
                <NavItem icon={CreditCard} label="Plan & Subscription" screen="BILLING" />
              </div>
            )}
          </>
        )}

        {/* Support & Legal */}
        <div className="space-y-1 pt-2 border-t border-slate-100">
          <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            Help & Guidance
          </div>
          <NavItem 
            icon={BookOpen} 
            label="Factory Setup Guide" 
            onClick={() => {
              if (onOpenGuide) onOpenGuide();
              if (!isDesktop) onClose();
            }} 
            badge="Guide" 
          />
          <NavItem icon={Headset} label="Support Center" onClick={handleSupportClick} />
          <NavItem icon={FileCheck} label="Terms of Service" screen="TERMS" />
          <NavItem icon={Shield} label="Privacy Policy" screen="PRIVACY" />
        </div>

        {/* Danger zone */}
        {isOwner && !isSuperAdmin && (
          <div className="pt-2 border-t border-rose-100">
            <button
              onClick={() => { setShowDeleteModal(true); if (!isDesktop) onClose(); }}
              className="flex items-center w-full px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
            >
              <Trash2 size={15} className="mr-2 text-rose-500" />
              <span>Delete Organization</span>
            </button>
          </div>
        )}
      </div>

      {/* Account / Logout Footer */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/70">
        <div className="flex items-center justify-between gap-2 p-2 rounded-xl hover:bg-white transition-colors border border-transparent hover:border-slate-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
              <User size={15} />
            </div>
            <div className="min-w-0 truncate">
              <div className="text-xs font-bold text-slate-900 truncate">
                {(profile as any)?.name || profile?.email?.split('@')[0] || 'User'}
              </div>
              <div className="text-[10px] text-slate-400 truncate">{profile?.email}</div>
            </div>
          </div>
          <button
            onClick={onLogout}
            title="Sign Out"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 rounded-lg transition-colors shrink-0"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {isDesktop ? (
        <aside className="hidden lg:block w-64 shrink-0 h-dvh sticky top-0 z-30">
          {content}
        </aside>
      ) : (
        <>
          <div 
            className={`fixed inset-0 bg-slate-950/50 z-40 transition-opacity duration-300 lg:hidden ${
              isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`} 
            onClick={onClose} 
          />
          <div 
            className={`fixed inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl z-50 transform transition-transform duration-300 ease-in-out lg:hidden ${
              isOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            {content}
          </div>
        </>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-slate-950/60 z-60 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl relative">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <AlertTriangle size={24} />
            </div>
            
            <h2 className="text-lg font-bold text-center text-slate-900 mb-1">Delete Organization?</h2>
            <p className="text-xs text-slate-500 text-center mb-4">
              All workers, biometric records, advances, and payroll sheets will be permanently removed.
            </p>

            <div className="flex gap-2">
              <button 
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-rose-600 text-white font-semibold rounded-xl text-xs hover:bg-rose-700 transition-colors flex items-center justify-center"
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : 'Confirm Deletion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};