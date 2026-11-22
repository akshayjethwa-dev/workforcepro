import React, { useState, useEffect, useRef } from 'react';
import {
  Home,
  Users,
  CalendarCheck,
  IndianRupee,
  Menu,
  Bell,
  X,
  ChevronRight,
  Building2,
  Shield,
  Camera,
  MoreHorizontal,
  Search,
  BookOpen,
  Sun,
  ShieldCheck,
  MessageSquare,
  PieChart,
  Handshake,
  TrendingUp,
  Sliders,
  HardHat,
  FileText,
} from 'lucide-react';
import { ScreenName, AppNotification } from '../types/index';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Sidebar } from './Sidebar';
import { RoleSwitcher } from './RoleSwitcher';
import { CommandPalette } from './CommandPalette';
import { SetupGuideModal } from './SetupGuideModal';
import { A11yAuditModal } from './A11yAuditModal';
import { WhatsAppChatSimulator } from './WhatsAppChatSimulator';
import { dbService } from '../services/db';
import {
  scrollElementAboveKeyboard,
  useKeyboardAwareLayout,
} from '../hooks/useKeyboardAwareLayout';

const FREE_TRIAL_DAYS = 7;

interface LayoutProps {
  children: React.ReactNode;
  currentScreen: ScreenName;
  onNavigate: (screen: ScreenName) => void;
  onLogout: () => void;
}

const SCREEN_METADATA: Record<ScreenName, { title: string; category: string }> = {
  DASHBOARD: { title: 'Business Overview', category: 'Overview' },
  INBOX: { title: 'Action Inbox', category: 'Operations' },
  WORKERS: { title: 'Workers Directory', category: 'Operations' },
  ADD_WORKER: { title: 'Worker Profile Editor', category: 'Operations' },
  ATTENDANCE: { title: 'Daily Attendance & Punch Logs', category: 'Operations' },
  ROSTER: { title: 'Shift Roster & Schedule Validation', category: 'Advanced HR' },
  ATTENDANCE_KIOSK: { title: 'Face & QR Kiosk Terminal', category: 'Operations' },
  PAYROLL: { title: 'Monthly Salary & Payroll', category: 'Payroll & Wages' },
  CTC_SIMULATOR: { title: 'CTC Restructuring Simulator', category: 'Advanced HR' },
  GRATUITY: { title: 'Gratuity Accrual & FnF Settlement', category: 'Advanced HR' },
  ANNUAL_BONUS: { title: 'Annual Statutory Bonus Engine', category: 'Advanced HR' },
  POSH_ICC: { title: 'POSH Act & Internal Committee (ICC)', category: 'Advanced HR' },
  DAILY_LOGS: { title: 'Daily Wage Calculations', category: 'Advanced HR' },
  ID_CARDS: { title: 'Worker ID Card Studio', category: 'Advanced HR' },
  REPORTS: { title: 'Operations & Compliance Reports', category: 'Analytics' },
  SETTINGS: { title: 'Company Settings', category: 'Business Settings' },
  ADVANCED_HR_SETTINGS: { title: 'Advanced HR Settings', category: 'Advanced HR' },
  TEAM: { title: 'Manager Management', category: 'Business Settings' },
  BILLING: { title: 'Billing & Subscription', category: 'Business Settings' },
  SUPER_ADMIN_DASHBOARD: { title: 'Multi-Tenant Master Console', category: 'Platform Admin' },
  SUPER_ADMIN_TENANTS: { title: 'Tenants Directory', category: 'Platform Admin' },
  SUPER_ADMIN_RESELLERS: { title: 'Reseller Network', category: 'Platform Admin' },
  SUPER_ADMIN_REVENUE: { title: 'Revenue & Global Plans', category: 'Platform Admin' },
  SUPER_ADMIN_SETTINGS: { title: 'System Settings & Security', category: 'Platform Admin' },
  RESELLER_DASHBOARD: { title: 'Partner Dashboard', category: 'Partner Network' },
  RESELLER_CLIENTS: { title: 'Client Portfolio List', category: 'Partner Network' },
  RESELLER_COMMISSIONS: { title: 'Commission Ledger', category: 'Partner Network' },
  WORKER_PORTAL: { title: 'Employee Self-Service Portal', category: 'Self-Service' },
  WORKER_HISTORY: { title: 'Worker Lifetime Records', category: 'Self-Service' },
  TERMS: { title: 'Terms & Regulatory Compliance', category: 'Legal' },
  PRIVACY: { title: 'Privacy & Data Protection', category: 'Legal' },
  LOGIN: { title: 'Authentication', category: 'Account' },
};

export const Layout: React.FC<LayoutProps> = ({
  children,
  currentScreen,
  onNavigate,
  onLogout,
}) => {
  const {
    profile,
    activeRole,
    tenantPlan,
    trialDaysLeft,
    isImpersonating,
    stopImpersonating,
    limits,
  } = useAuth();
  const { effectiveBranding, isFieldMode, toggleFieldMode } = useTheme();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isGuideOpen, setGuideOpen] = useState(false);
  const [isA11yModalOpen, setA11yModalOpen] = useState(false);
  const [isWhatsAppSimulatorOpen, setWhatsAppSimulatorOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const { keyboardHeight, isKeyboardOpen } = useKeyboardAwareLayout();

  const isSuperAdmin = activeRole === 'SUPER_ADMIN';
  const isReseller = activeRole === 'RESELLER';
  const isTenantAdmin = activeRole === 'TENANT_ADMIN';
  const isManager = activeRole === 'MANAGER';
  const isWorker = activeRole === 'WORKER';

  // Keyboard shortcut listener for Command Palette (⌘K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load real notifications from Firestore
  useEffect(() => {
    if (
      profile?.tenantId &&
      (isTenantAdmin || isManager) &&
      profile.tenantId !== 'demo-tenant-id'
    ) {
      dbService
        .getNotifications(profile.tenantId)
        .then(setNotifications)
        .catch((err) => console.warn('Notifications load error:', err));
    }
  }, [profile, showNotifications, isTenantAdmin, isManager]);

  // Click outside to close notification popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  if (currentScreen === 'LOGIN') {
    return <div className="min-h-screen bg-slate-50">{children}</div>;
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.read) {
      await dbService.markNotificationRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
      );
    }
  };

  const handleClearAll = async () => {
    if (!profile?.tenantId) return;
    setNotifications([]);
    try {
      await dbService.deleteAllNotifications(profile.tenantId);
    } catch (error) {
      console.error('Failed to clear notifications', error);
    }
  };

  const screenMeta = SCREEN_METADATA[currentScreen] || {
    title: 'WorkForce Pro',
    category: 'Dashboard',
  };
  const showImpersonationBanner = Boolean(isImpersonating);
  const showTrialBanner = Boolean(
    tenantPlan === 'TRIAL' && trialDaysLeft !== null && isTenantAdmin && !isImpersonating
  );

  const MobileNavItem = ({
    screen,
    icon: Icon,
    label,
    onClick,
  }: {
    screen?: ScreenName;
    icon: any;
    label: string;
    onClick?: () => void;
  }) => {
    const isActive = screen ? currentScreen === screen : false;
    return (
      <button
        type="button"
        onClick={() => {
          if (onClick) {
            onClick();
          } else if (screen) {
            onNavigate(screen);
          }
        }}
        className={`flex flex-col items-center justify-center flex-1 min-w-0 h-full min-h-[3rem] px-0.5 py-1 transition-all duration-150 active:scale-95 ${
          isActive ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <div
          className={`p-1 rounded-xl shrink-0 transition-all ${
            isActive ? 'bg-blue-50 text-blue-600' : ''
          }`}
        >
          <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
        </div>
        <span className="text-fluid-2xs mt-0.5 tracking-tight truncate max-w-full px-0.5">
          {label}
        </span>
      </button>
    );
  };

  return (
    <div className="min-h-dvh w-full max-w-full overflow-x-clip bg-slate-50 text-slate-900 flex flex-col antialiased">
      {/* Mobile Drawer Navigation */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentScreen={currentScreen}
        onNavigate={onNavigate}
        onLogout={onLogout}
        isDesktop={false}
        onOpenGuide={() => setGuideOpen(true)}
      />

      {/* TOP NOTIFICATION BANNERS (Impersonation / Trial) */}
      {showImpersonationBanner && (
        <div
          className="bg-rose-600 shrink-0 text-white text-fluid-xs font-semibold px-3 sm:px-4 py-2 flex items-center justify-between flex-wrap gap-2 z-50 shadow-xs"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Shield size={16} className="text-rose-200 shrink-0" />
            <span className="break-words min-w-0">
              Impersonating Organization: <strong>{profile?.companyName}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={async () => {
              await stopImpersonating();
              onNavigate('SUPER_ADMIN_TENANTS');
            }}
            className="bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded text-fluid-2xs font-bold uppercase tracking-wider transition-colors shrink-0 cursor-pointer"
          >
            Exit Impersonation
          </button>
        </div>
      )}

      {showTrialBanner && (
        <div
          onClick={() => onNavigate('BILLING')}
          className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 shrink-0 text-white text-fluid-xs font-medium px-3 sm:px-4 py-2 flex items-center justify-between flex-wrap gap-2 cursor-pointer hover:brightness-105 transition-all z-40 border-b border-indigo-900/20 shadow-xs"
          style={{
            paddingTop: showImpersonationBanner
              ? '6px'
              : 'calc(env(safe-area-inset-top, 0px) + 6px)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="text-white break-words min-w-0">
              <strong className="font-semibold text-white">
                {trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'} remaining
              </strong>{' '}
              in your {FREE_TRIAL_DAYS}-day free organization trial.
            </span>
          </div>
          <span className="bg-white/20 hover:bg-white/30 text-white px-2.5 py-0.5 rounded text-fluid-2xs font-bold uppercase tracking-wider transition-colors shrink-0">
            Upgrade Plan
          </span>
        </div>
      )}

      {/* WORKSPACE CONTAINER */}
      <div className="flex-1 flex w-full max-w-full min-w-0 relative">
        {/* Desktop Persistent Sidebar */}
        <Sidebar
          isOpen={true}
          onClose={() => {}}
          currentScreen={currentScreen}
          onNavigate={onNavigate}
          onLogout={onLogout}
          isDesktop={true}
          onOpenGuide={() => setGuideOpen(true)}
        />

        {/* MAIN VIEWPORT CANVAS */}
        <div className="flex-1 flex flex-col min-w-0 w-full max-w-full min-h-dvh bg-slate-50">
          {/* TOP APP BAR */}
          <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-2.5 sm:px-6 py-2.5 sm:py-3 transition-shadow shadow-xs w-full max-w-full">
            <div className="flex items-center justify-between gap-1.5 sm:gap-4 max-w-7xl mx-auto min-w-0">
              {/* Zone 1: Brand & Breadcrumbs */}
              <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors min-w-[2.5rem] min-h-[2.5rem] flex items-center justify-center shrink-0"
                  aria-label="Open navigation menu"
                >
                  <Menu size={22} />
                </button>

                <div className="flex items-center gap-2 min-w-0 text-sm">
                  {effectiveBranding.logoUrl && (
                    <img
                      src={effectiveBranding.logoUrl}
                      alt="Brand"
                      className="w-5 h-5 object-contain rounded hidden sm:inline"
                    />
                  )}
                  <span className="font-semibold text-slate-800 whitespace-nowrap hidden sm:inline">
                    {effectiveBranding.appName || profile?.companyName || 'WorkForce Pro'}
                  </span>
                  <ChevronRight size={14} className="text-slate-400 hidden sm:inline shrink-0" />
                  <span className="font-medium text-slate-600 truncate">{screenMeta.title}</span>
                </div>
              </div>

              {/* Zone 2: Quick Command Search */}
              <div className="hidden md:flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCommandPaletteOpen(true)}
                  className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200/80 rounded-xl text-xs text-slate-500 border border-slate-200/60 shadow-2xs transition-all active:scale-98 cursor-pointer"
                  title="Search navigation & actions (⌘K / Ctrl+K)"
                >
                  <Search size={13} className="text-slate-400" />
                  <span className="font-medium text-slate-600">Quick Actions...</span>
                  <kbd className="font-mono text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs text-slate-500 font-semibold">
                    ⌘K
                  </kbd>
                </button>
              </div>

              {/* Zone 3: Role Switcher, Quick Actions, Notifications & Avatar */}
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                {/* Multi-Role Switcher Dropdown / Role Badge */}
                <RoleSwitcher />

                {/* Mobile Search Button */}
                <button
                  type="button"
                  onClick={() => setCommandPaletteOpen(true)}
                  className="md:hidden p-1.5 sm:p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors min-w-[2.25rem] min-h-[2.25rem] flex items-center justify-center"
                  aria-label="Search and command palette"
                >
                  <Search size={18} />
                </button>

                {/* High-Contrast Sunlight Field Mode Quick Switch */}
                <button
                  type="button"
                  onClick={toggleFieldMode}
                  className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl text-fluid-xs font-bold border transition-all active:scale-95 cursor-pointer min-h-[2.25rem] ${
                    isFieldMode
                      ? 'bg-black text-white border-black ring-2 ring-amber-400 shadow-md font-black'
                      : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 shadow-2xs'
                  }`}
                  title={
                    isFieldMode
                      ? 'Sunlight Field Mode ON (Contrast >= 7:1) - Tap to revert'
                      : 'Enable High-Contrast Field Mode (Optimized for Sunlight)'
                  }
                  aria-pressed={isFieldMode}
                  aria-label="Toggle High-Contrast Field Mode"
                >
                  <Sun
                    size={15}
                    className={`${isFieldMode ? 'text-amber-300' : 'text-amber-600'} shrink-0`}
                  />
                  <span className="hidden xl:inline">
                    {isFieldMode ? 'Field Mode (ON)' : 'Field Mode'}
                  </span>
                </button>

                {/* Accessibility Audit Dialog Trigger */}
                <button
                  type="button"
                  onClick={() => setA11yModalOpen(true)}
                  className="hidden xl:inline-flex p-2 text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 rounded-xl transition-colors min-w-[2.25rem] min-h-[2.25rem] items-center justify-center border border-slate-300 shadow-2xs cursor-pointer"
                  title="Run Automated Accessibility (axe-core) Audit"
                  aria-label="Accessibility and contrast audit"
                >
                  <ShieldCheck size={17} className="text-emerald-700" />
                </button>

                {/* Setup Guide button (Tenant Admin only) */}
                {isTenantAdmin && (
                  <button
                    type="button"
                    onClick={() => setGuideOpen(true)}
                    className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[2.25rem] bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 border border-indigo-200/80 rounded-xl text-fluid-xs font-semibold shadow-2xs transition-all active:scale-95 cursor-pointer"
                    title="Factory Workflow & Setup Guide"
                  >
                    <BookOpen size={14} className="text-indigo-600 shrink-0" />
                    <span>Setup Guide</span>
                  </button>
                )}

                {/* WhatsApp Bot Simulator Launcher (Tenant Admin & Manager) */}
                {(isTenantAdmin || isManager) && (
                  <button
                    type="button"
                    onClick={() => setWhatsAppSimulatorOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 min-h-[2.25rem] bg-emerald-50 hover:bg-emerald-100/80 text-emerald-800 border border-emerald-300 rounded-xl text-fluid-xs font-bold shadow-2xs transition-all active:scale-95 cursor-pointer"
                    title="WhatsApp Attendance & Notification Bot Simulator"
                  >
                    <MessageSquare size={14} className="text-emerald-600 shrink-0" />
                    <span className="hidden lg:inline">WhatsApp</span>
                    <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  </button>
                )}

                {/* Quick Kiosk Launch button (Tenant Admin only) */}
                {isTenantAdmin && limits?.kioskEnabled !== false && (
                  <button
                    type="button"
                    onClick={() => onNavigate('ATTENDANCE_KIOSK')}
                    className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[2.25rem] bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-fluid-xs font-semibold shadow-xs transition-colors active:scale-95 cursor-pointer"
                    title="Launch Face & QR Attendance Kiosk"
                  >
                    <Camera size={14} className="shrink-0" />
                    <span className="hidden md:inline">Kiosk</span>
                  </button>
                )}

                {/* Notifications Trigger & Popover */}
                {(isTenantAdmin || isManager) && (
                  <div className="relative" ref={notifRef}>
                    <button
                      type="button"
                      onClick={() => setShowNotifications(!showNotifications)}
                      className="p-1.5 sm:p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors relative min-w-[2.25rem] min-h-[2.25rem] flex items-center justify-center cursor-pointer"
                      aria-label="Notifications"
                    >
                      <Bell size={18} />
                      {unreadCount > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white" />
                      )}
                    </button>

                    {showNotifications && (
                      <div className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-1.25rem))] bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50 text-slate-800 animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-3 border-b border-slate-100 bg-slate-50/70">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-fluid-xs font-bold text-slate-900">
                              Notifications
                            </span>
                            {unreadCount > 0 && (
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-fluid-2xs font-bold rounded-md font-mono shrink-0">
                                {unreadCount} new
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {notifications.length > 0 && (
                              <button
                                type="button"
                                onClick={handleClearAll}
                                className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold transition-colors"
                              >
                                Clear all
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setShowNotifications(false)}
                              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        </div>

                        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                          {notifications.length === 0 ? (
                            <div className="py-8 text-center text-slate-400">
                              <Bell size={24} className="mx-auto mb-2 text-slate-300" />
                              <p className="text-xs font-medium">All caught up!</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                No new notifications
                              </p>
                            </div>
                          ) : (
                            notifications.map((n) => (
                              <div
                                key={n.id}
                                onClick={() => handleNotificationClick(n)}
                                className={`p-3.5 cursor-pointer transition-colors hover:bg-slate-50/80 ${
                                  !n.read ? 'bg-blue-50/40' : ''
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <h4
                                    className={`text-xs font-bold leading-snug ${
                                      n.type === 'WARNING' ? 'text-rose-600' : 'text-slate-900'
                                    }`}
                                  >
                                    {n.title}
                                  </h4>
                                  {!n.read && (
                                    <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1" />
                                  )}
                                </div>
                                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                                  {n.message}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Organization or User Avatar Badge */}
                <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                    {profile?.companyName ? profile.companyName.charAt(0).toUpperCase() : 'W'}
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* MAIN WORKSPACE CONTENT VIEWPORT */}
          <main
            ref={mainRef}
            onFocusCapture={(e) => {
              const target = e.target as HTMLElement | null;
              if (!target) return;
              const tag = target.tagName;
              if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                scrollElementAboveKeyboard(target, mainRef.current, keyboardHeight);
              }
            }}
            className="flex-1 overflow-y-auto overflow-x-clip scroll-smooth w-full max-w-full min-w-0"
          >
            <div
              className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-5 pb-24 lg:pb-8 w-full min-w-0"
              style={{
                paddingBottom: isKeyboardOpen
                  ? `calc(${keyboardHeight}px + 7.5rem)`
                  : undefined,
              }}
            >
              {children}
            </div>
          </main>

          {/* ROLE-AWARE MOBILE BOTTOM NAVIGATION BAR */}
          <nav
            aria-hidden={isKeyboardOpen}
            className={`lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 z-30 shadow-lg transition-transform duration-200 ease-out ${
              isKeyboardOpen
                ? 'translate-y-full pointer-events-none opacity-0'
                : 'translate-y-0 opacity-100'
            }`}
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div className="flex items-center justify-around h-16 max-w-md mx-auto px-2">
              {isSuperAdmin && (
                <>
                  <MobileNavItem screen="SUPER_ADMIN_TENANTS" icon={Building2} label="Tenants" />
                  <MobileNavItem screen="SUPER_ADMIN_RESELLERS" icon={Handshake} label="Resellers" />
                  <MobileNavItem screen="SUPER_ADMIN_REVENUE" icon={TrendingUp} label="Revenue" />
                  <MobileNavItem screen="SUPER_ADMIN_SETTINGS" icon={Sliders} label="Settings" />
                </>
              )}

              {isReseller && (
                <>
                  <MobileNavItem screen="RESELLER_DASHBOARD" icon={Home} label="Partner" />
                  <MobileNavItem screen="RESELLER_CLIENTS" icon={Building2} label="Clients" />
                  <MobileNavItem screen="RESELLER_COMMISSIONS" icon={IndianRupee} label="Ledger" />
                  <MobileNavItem
                    icon={MoreHorizontal}
                    label="Menu"
                    onClick={() => setSidebarOpen(true)}
                  />
                </>
              )}

              {isTenantAdmin && (
                <>
                  <MobileNavItem screen="DASHBOARD" icon={Home} label="Overview" />
                  <MobileNavItem screen="WORKERS" icon={Users} label="Workers" />
                  <MobileNavItem screen="ATTENDANCE" icon={CalendarCheck} label="Attendance" />
                  <MobileNavItem screen="PAYROLL" icon={IndianRupee} label="Payroll" />
                  <MobileNavItem
                    icon={MoreHorizontal}
                    label="Menu"
                    onClick={() => setSidebarOpen(true)}
                  />
                </>
              )}

              {isManager && (
                <>
                  <MobileNavItem screen="DASHBOARD" icon={Home} label="Dashboard" />
                  <MobileNavItem screen="ATTENDANCE" icon={CalendarCheck} label="Attendance" />
                  <MobileNavItem screen="REPORTS" icon={PieChart} label="Reports" />
                  <MobileNavItem
                    icon={MoreHorizontal}
                    label="Menu"
                    onClick={() => setSidebarOpen(true)}
                  />
                </>
              )}

              {isWorker && (
                <>
                  <MobileNavItem screen="WORKER_PORTAL" icon={HardHat} label="My Portal" />
                  <MobileNavItem screen="WORKER_HISTORY" icon={FileText} label="History" />
                  <MobileNavItem
                    icon={MoreHorizontal}
                    label="Menu"
                    onClick={() => setSidebarOpen(true)}
                  />
                </>
              )}
            </div>
          </nav>
        </div>
      </div>

      {/* Global Command Palette (⌘K) - Role-Filtered */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={onNavigate}
        onLogout={onLogout}
        onOpenGuide={() => setGuideOpen(true)}
        onOpenA11yAudit={() => setA11yModalOpen(true)}
      />

      {/* Interactive Factory Setup & Flow Guide Modal */}
      {isTenantAdmin && (
        <SetupGuideModal
          isOpen={isGuideOpen}
          onClose={() => setGuideOpen(false)}
          onNavigate={onNavigate}
        />
      )}

      {/* Automated Accessibility (axe-core) Audit Modal */}
      <A11yAuditModal isOpen={isA11yModalOpen} onClose={() => setA11yModalOpen(false)} />

      {/* WhatsApp Attendance & Notification Bot Simulator */}
      {(isTenantAdmin || isManager) && (
        <WhatsAppChatSimulator
          isOpen={isWhatsAppSimulatorOpen}
          onClose={() => setWhatsAppSimulatorOpen(false)}
          tenantId={profile?.tenantId || 'demo-tenant-id'}
        />
      )}
    </div>
  );
};