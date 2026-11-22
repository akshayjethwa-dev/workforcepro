import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  Users,
  Clock,
  LogOut,
  User,
  Shield,
  History,
  CreditCard,
  PieChart,
  IdCard,
  Headset,
  FileCheck,
  Trash2,
  AlertTriangle,
  Loader2,
  Home,
  Camera,
  Settings,
  IndianRupee,
  BookOpen,
  Inbox,
  Calendar,
  Lock,
  Calculator,
  Award,
  Landmark,
  Handshake,
  TrendingUp,
  Sliders,
  MapPin,
  HardHat,
  FileText,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';
import { useEntitlements } from '../contexts/EntitlementContext';
import { ScreenName } from '../types/index';
import { dbService } from '../services/db';
import { inboxService } from '../services/inboxService';
import { auth } from '../lib/firebase';
import { TruncatedText } from './TruncatedText';
import { ROLE_METADATA } from '../services/rbacService';

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
  onOpenGuide,
}) => {
  const { profile, activeRole, branchScope, isImpersonating } = useAuth();
  const { toast } = useToast();
  const { effectiveBranding } = useTheme();
  const { isEntitled } = useEntitlements();

  const isSuperAdmin = activeRole === 'SUPER_ADMIN';
  const isReseller = activeRole === 'RESELLER';
  const isTenantAdmin = activeRole === 'TENANT_ADMIN';
  const isManager = activeRole === 'MANAGER';
  const isWorker = activeRole === 'WORKER';

  const activeRoleMeta = ROLE_METADATA[activeRole];

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);

  const ADVANCED_HR_SCREENS: ScreenName[] = [
    'ADVANCED_HR_SETTINGS',
    'CTC_SIMULATOR',
    'ROSTER',
    'ATTENDANCE_KIOSK',
    'GRATUITY',
    'ANNUAL_BONUS',
    'DAILY_LOGS',
    'ID_CARDS',
    'POSH_ICC',
  ];
  const isOnAdvancedHrScreen = ADVANCED_HR_SCREENS.includes(currentScreen);
  const [advancedHrOpen, setAdvancedHrOpen] = useState<boolean>(isOnAdvancedHrScreen);

  useEffect(() => {
    if (isOnAdvancedHrScreen) {
      setAdvancedHrOpen(true);
    }
  }, [isOnAdvancedHrScreen]);

  useEffect(() => {
    if (profile?.tenantId && isTenantAdmin) {
      inboxService
        .getPendingCount(profile.tenantId, profile)
        .then((count) => setInboxCount(count))
        .catch(() => {});
    } else {
      setInboxCount(0);
    }
  }, [profile?.tenantId, currentScreen, isTenantAdmin, profile]);

  const handleSupportClick = () => {
    const adminPhone = '918460852903';
    const message = encodeURIComponent(
      `Hello WorkforcePro Support, I need some help regarding my organization (${
        profile?.companyName || 'Not Set'
      }).`
    );
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
    matchScreens,
    onClick,
    badge,
    locked = false,
    availableOn,
  }: {
    icon: any;
    label: string;
    screen?: ScreenName;
    matchScreens?: ScreenName[];
    onClick?: () => void;
    badge?: string;
    locked?: boolean;
    availableOn?: string;
  }) => {
    const isActive = matchScreens
      ? matchScreens.includes(currentScreen)
      : screen
      ? currentScreen === screen
      : false;
    return (
      <button
        type="button"
        onClick={() => {
          if (onClick) {
            onClick();
          } else if (screen) {
            onNavigate(screen);
            if (!isDesktop) onClose();
          }
        }}
        className={`flex items-center gap-2 w-full min-w-0 px-3 py-2.5 rounded-xl transition-all duration-150 text-fluid-xs font-medium group cursor-pointer ${
          isActive
            ? 'bg-blue-600 text-white shadow-xs font-semibold'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
        }`}
      >
        <div
          className={`p-1.5 rounded-lg shrink-0 transition-colors ${
            isActive
              ? 'bg-white/15 text-white'
              : locked
              ? 'text-amber-600 bg-amber-50 group-hover:bg-amber-100/70'
              : 'text-slate-500 group-hover:text-slate-900'
          }`}
        >
          <Icon size={16} />
        </div>
        <span className="flex-1 min-w-0 text-left truncate" title={label}>
          {label}
        </span>
        {locked && availableOn && (
          <span className="flex items-center gap-1 shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/80 font-medium">
            <Lock size={10} className="text-amber-600 shrink-0" />
            <span>{availableOn}</span>
          </span>
        )}
        {!locked && badge && (
          <span
            className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono ${
              isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}
          >
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
              <img
                src={effectiveBranding.logoUrl}
                alt="Logo"
                className="max-w-full max-h-full object-contain"
              />
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
              {effectiveBranding.appName ||
                profile?.companyName ||
                (isSuperAdmin
                  ? 'Admin Console'
                  : isReseller
                  ? 'Partner Portal'
                  : 'WorkForce Pro')}
            </h2>
            <div className="text-[11px] text-slate-400 font-medium mt-0.5 truncate flex items-center gap-1.5">
              <span>{activeRoleMeta.label}</span>
              {effectiveBranding.customDomain?.domain && (
                <span className="text-[9px] px-1 rounded bg-slate-800 text-blue-300 font-mono">
                  {effectiveBranding.customDomain.status === 'VERIFIED'
                    ? 'Custom Domain'
                    : 'DNS Pending'}
                </span>
              )}
            </div>
          </div>
        </div>

        {!isDesktop && (
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors ml-2"
            aria-label="Close navigation menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Role-Specific Navigation List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-5 scrollbar-thin">
        {/* ============================================================
            SUPER_ADMIN: Tenants, Resellers, Revenue, System Settings
           ============================================================ */}
        {isSuperAdmin && (
          <div className="space-y-1">
            <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Platform Administration
            </div>
            <NavItem
              icon={Building2}
              label="Tenants"
              screen="SUPER_ADMIN_TENANTS"
              matchScreens={['SUPER_ADMIN_TENANTS', 'SUPER_ADMIN_DASHBOARD']}
            />
            <NavItem icon={Handshake} label="Resellers" screen="SUPER_ADMIN_RESELLERS" />
            <NavItem icon={TrendingUp} label="Revenue" screen="SUPER_ADMIN_REVENUE" />
            <NavItem icon={Sliders} label="System Settings" screen="SUPER_ADMIN_SETTINGS" />
          </div>
        )}

        {/* ============================================================
            RESELLER: Partner Dashboard, Client List, Commission Ledger
           ============================================================ */}
        {isReseller && (
          <div className="space-y-1">
            <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Partner Portal
            </div>
            <NavItem icon={Home} label="Partner Dashboard" screen="RESELLER_DASHBOARD" />
            <NavItem icon={Building2} label="Client List" screen="RESELLER_CLIENTS" />
            <NavItem icon={IndianRupee} label="Commission Ledger" screen="RESELLER_COMMISSIONS" />
          </div>
        )}

        {/* ============================================================
            TENANT_ADMIN (SMB Owner): Simplified Business View + Secondary "Advanced HR Settings" Menu
           ============================================================ */}
        {isTenantAdmin && (
          <>
            <div className="space-y-1">
              <div className="px-3 text-[11px] font-medium text-slate-400 mb-1.5">
                Business Overview
              </div>
              <NavItem icon={Home} label="Dashboard" screen="DASHBOARD" />
              <NavItem
                icon={Inbox}
                label="Action Inbox"
                screen="INBOX"
                badge={inboxCount > 0 ? `${inboxCount}` : undefined}
              />
              <NavItem icon={Users} label="Workers" screen="WORKERS" matchScreens={['WORKERS', 'ADD_WORKER']} />
              <NavItem icon={Clock} label="Attendance" screen="ATTENDANCE" />
              <NavItem
                icon={IndianRupee}
                label="Payroll"
                screen="PAYROLL"
                locked={!isEntitled('ADVANCED_PAYROLL')}
                availableOn="Pro"
              />
              <NavItem icon={PieChart} label="Reports" screen="REPORTS" />
            </div>

            <div className="space-y-1 pt-2 border-t border-slate-100">
              <div className="px-3 text-[11px] font-medium text-slate-400 mb-1.5">
                Account &amp; Access
              </div>
              <NavItem
                icon={Settings}
                label="Settings"
                screen="SETTINGS"
                matchScreens={['SETTINGS', 'BILLING', 'TEAM']}
              />
            </div>

            {/* Secondary Collapsible Menu: Advanced HR Settings (Collapsed by default for SMB clarity) */}
            <div className="space-y-1 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAdvancedHrOpen((prev) => !prev)}
                aria-expanded={advancedHrOpen}
                className={`flex items-center justify-between gap-2 w-full px-3 py-2 rounded-xl text-fluid-xs font-medium transition-colors cursor-pointer ${
                  isOnAdvancedHrScreen
                    ? 'text-slate-900 bg-slate-100 font-semibold'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Sliders size={15} className="shrink-0 text-slate-400" />
                  <span className="truncate">Advanced HR Settings</span>
                </span>
                {advancedHrOpen ? (
                  <ChevronDown size={14} className="shrink-0 text-slate-400" />
                ) : (
                  <ChevronRight size={14} className="shrink-0 text-slate-400" />
                )}
              </button>

              {advancedHrOpen && (
                <div className="pl-2 space-y-1 pt-1">
                  <NavItem
                    icon={Sliders}
                    label="HR Rules & Overtime"
                    screen="ADVANCED_HR_SETTINGS"
                  />
                  <NavItem icon={Calculator} label="CTC Simulator (50% Rule)" screen="CTC_SIMULATOR" />
                  <NavItem
                    icon={Calendar}
                    label="Shift Roster & Publish"
                    screen="ROSTER"
                    locked={!isEntitled('REGULATE_PUNCH')}
                    availableOn="Starter"
                  />
                  <NavItem
                    icon={Camera}
                    label="Kiosk Scanner"
                    screen="ATTENDANCE_KIOSK"
                    locked={!isEntitled('KIOSK_MODE')}
                    availableOn="Starter"
                  />
                  <NavItem icon={Award} label="Gratuity & FnF" screen="GRATUITY" />
                  <NavItem icon={Landmark} label="Annual Bonus" screen="ANNUAL_BONUS" />
                  <NavItem icon={History} label="Daily Wage Logs" screen="DAILY_LOGS" />
                  <NavItem
                    icon={IdCard}
                    label="Digital ID Cards"
                    screen="ID_CARDS"
                    locked={!isEntitled('DIGITAL_ID_CARDS')}
                    availableOn="Starter"
                  />
                  <NavItem icon={Shield} label="POSH & ICC" screen="POSH_ICC" />
                </div>
              )}
            </div>
          </>
        )}

        {/* ============================================================
            MANAGER (Branch/HR): Dashboard, Attendance (Assigned Branch Only), Reports
           ============================================================ */}
        {isManager && (
          <div className="space-y-3">
            {branchScope.isBranchScoped && (
              <div className="mx-1 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-900">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  <MapPin size={12} className="shrink-0" />
                  <span>Assigned Branch Scope</span>
                </div>
                <div className="text-xs font-bold mt-0.5 truncate" title={branchScope.branchName}>
                  {branchScope.branchName}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Branch Operations
              </div>
              <NavItem icon={Home} label="Dashboard" screen="DASHBOARD" />
              <NavItem icon={Clock} label="Attendance" screen="ATTENDANCE" badge="Branch" />
              <NavItem icon={PieChart} label="Reports" screen="REPORTS" />
            </div>
          </div>
        )}

        {/* ============================================================
            WORKER: Personal Self-Service Links Only
           ============================================================ */}
        {isWorker && (
          <div className="space-y-1">
            <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Employee Self-Service
            </div>
            <NavItem icon={HardHat} label="My Dashboard" screen="WORKER_PORTAL" />
            <NavItem icon={FileText} label="My Attendance & Payslips" screen="WORKER_HISTORY" />
          </div>
        )}

        {/* Support & Legal */}
        <div className="space-y-1 pt-2 border-t border-slate-100">
          <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            Help &amp; Guidance
          </div>
          {isTenantAdmin && (
            <NavItem
              icon={BookOpen}
              label="Factory Setup Guide"
              onClick={() => {
                if (onOpenGuide) onOpenGuide();
                if (!isDesktop) onClose();
              }}
              badge="Guide"
            />
          )}
          <NavItem icon={Headset} label="Support Center" onClick={handleSupportClick} />
          <NavItem icon={FileCheck} label="Terms of Service" screen="TERMS" />
          <NavItem icon={Shield} label="Privacy Policy" screen="PRIVACY" />
        </div>

        {/* Danger Zone (Tenant Admin only, never while impersonating) */}
        {isTenantAdmin && !isImpersonating && (
          <div className="pt-2 border-t border-rose-100">
            <button
              type="button"
              onClick={() => {
                setShowDeleteModal(true);
                if (!isDesktop) onClose();
              }}
              className="flex items-center w-full px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
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
            <div className="min-w-0 flex-1">
              <div className="text-fluid-xs font-bold text-slate-900 min-w-0">
                <TruncatedText
                  text={profile?.name || profile?.email?.split('@')[0] || 'User'}
                  modalTitle="Signed-In Account"
                  details={[
                    ...(profile?.email
                      ? [{ label: 'Email Address', value: profile.email, breakAnywhere: true }]
                      : []),
                    ...(profile?.companyName
                      ? [{ label: 'Organization', value: profile.companyName }]
                      : []),
                    { label: 'Active Role', value: activeRoleMeta.label },
                    ...(branchScope.isBranchScoped && branchScope.branchName
                      ? [{ label: 'Assigned Branch', value: branchScope.branchName }]
                      : []),
                  ]}
                  className="text-fluid-xs font-bold text-slate-900"
                />
              </div>
              {profile?.email && (
                <div className="text-[11px] text-slate-400 min-w-0">
                  <TruncatedText
                    text={profile.email}
                    modalTitle="Account Email"
                    breakAnywhere
                    className="text-[11px] text-slate-400"
                  />
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="Sign Out"
            aria-label="Sign Out"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 rounded-lg transition-colors shrink-0 cursor-pointer"
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
        <aside className="hidden lg:block w-64 shrink-0 h-dvh sticky top-0 z-30">{content}</aside>
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

            <h2 className="text-lg font-bold text-center text-slate-900 mb-1">
              Delete Organization?
            </h2>
            <p className="text-xs text-slate-500 text-center mb-4">
              All workers, biometric records, advances, and payroll sheets will be permanently
              removed.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
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