import React, { useState, useEffect, useRef } from 'react';
import { 
  Home, Users, CalendarCheck, IndianRupee, Menu, Bell, X, Zap, 
  ChevronRight, Building2, Shield, LogOut, Camera, MoreHorizontal,
  CheckCircle2, AlertTriangle, ArrowRight, Sparkles, ExternalLink, Search, BookOpen
} from 'lucide-react';
import { ScreenName, AppNotification } from '../types/index';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';
import { SetupGuideModal } from './SetupGuideModal';
import { dbService } from '../services/db';

const FREE_TRIAL_DAYS = 7; 

interface LayoutProps {
  children: React.ReactNode;
  currentScreen: ScreenName;
  onNavigate: (screen: ScreenName) => void;
  onLogout: () => void;
}

const SCREEN_METADATA: Record<ScreenName, { title: string; category: string }> = {
  DASHBOARD: { title: 'Factory Overview', category: 'Operations' },
  INBOX: { title: 'Unified Action Inbox', category: 'Operations' },
  WORKERS: { title: 'Workers Directory', category: 'Operations' },
  ADD_WORKER: { title: 'Worker Profile Editor', category: 'Operations' },
  ATTENDANCE: { title: 'Daily Attendance & Punch Logs', category: 'Operations' },
  ROSTER: { title: 'Shift Roster & Schedule Validation', category: 'Operations' },
  ATTENDANCE_KIOSK: { title: 'Face & QR Kiosk Terminal', category: 'Operations' },
  PAYROLL: { title: 'Monthly Salary & Payroll', category: 'Payroll & Wages' },
  DAILY_LOGS: { title: 'Daily Wage Calculations', category: 'Payroll & Wages' },
  ID_CARDS: { title: 'Worker ID Card Studio', category: 'Identity' },
  REPORTS: { title: 'Factory Operations Reports', category: 'Analytics' },
  SETTINGS: { title: 'Organization & Shift Rules', category: 'Administration' },
  TEAM: { title: 'Supervisors & Permissions', category: 'Administration' },
  BILLING: { title: 'Subscription & Quota Management', category: 'Administration' },
  SUPER_ADMIN_DASHBOARD: { title: 'Multi-Tenant Master Console', category: 'Platform Admin' },
  RESELLER_DASHBOARD: { title: 'Channel Partner Command Center', category: 'Partner Network' },
  WORKER_HISTORY: { title: 'Worker Lifetime Records', category: 'Operations' },
  TERMS: { title: 'Terms & Regulatory Compliance', category: 'Legal' },
  PRIVACY: { title: 'Privacy & Data Protection', category: 'Legal' },
  LOGIN: { title: 'Authentication', category: 'Account' },
};

export const Layout: React.FC<LayoutProps> = ({ children, currentScreen, onNavigate, onLogout }) => {
  const { profile, tenantPlan, trialDaysLeft, isImpersonating, stopImpersonating, limits } = useAuth();
  const { effectiveBranding } = useTheme();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isGuideOpen, setGuideOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';
  const isReseller = profile?.role === 'RESELLER';

  // Keyboard shortcut listener for Command Palette (⌘K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load real notifications from Firestore
  useEffect(() => {
    if (profile?.tenantId && !isSuperAdmin && profile.tenantId !== 'demo-tenant-id') {
      dbService.getNotifications(profile.tenantId)
        .then(setNotifications)
        .catch((err) => console.warn("Notifications load error:", err));
    }
  }, [profile, showNotifications, isSuperAdmin]);

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

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.read) {
      await dbService.markNotificationRead(notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
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

  const screenMeta = SCREEN_METADATA[currentScreen] || { title: 'WorkForce Pro', category: 'Dashboard' };
  const showImpersonationBanner = Boolean(isImpersonating);
  const showTrialBanner = Boolean(tenantPlan === 'TRIAL' && trialDaysLeft !== null && !isSuperAdmin && !isImpersonating);

  const MobileNavItem = ({ 
    screen, 
    icon: Icon, 
    label,
    onClick
  }: { 
    screen?: ScreenName; 
    icon: any; 
    label: string;
    onClick?: () => void;
  }) => {
    const isActive = screen ? currentScreen === screen : false;
    return (
      <button
        onClick={() => {
          if (onClick) {
            onClick();
          } else if (screen) {
            onNavigate(screen);
          }
        }}
        className={`flex flex-col items-center justify-center flex-1 h-full min-h-[48px] py-1 transition-all duration-150 active:scale-95 ${
          isActive ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <div className={`p-1 rounded-xl transition-all ${isActive ? 'bg-blue-50 text-blue-600' : ''}`}>
          <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
        </div>
        <span className="text-[10px] mt-0.5 tracking-tight truncate max-w-[64px]">{label}</span>
      </button>
    );
  };

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 flex flex-col antialiased">
      
      {/* Mobile Drawer Navigation (Drawer on small screens) */}
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
          className="bg-rose-600 shrink-0 text-white text-xs font-semibold px-4 py-2 flex items-center justify-between z-50 shadow-xs"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}
        >
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-rose-200" />
            <span>Impersonating Organization: <strong>{profile?.companyName}</strong></span>
          </div>
          <button
            onClick={async () => {
              await stopImpersonating();
              onNavigate('SUPER_ADMIN_DASHBOARD');
            }}
            className="bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider transition-colors"
          >
            Exit Impersonation
          </button>
        </div>
      )}

      {showTrialBanner && (
        <div
          onClick={() => onNavigate('BILLING')}
          className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 shrink-0 text-white text-xs font-medium px-4 py-2 flex items-center justify-between cursor-pointer hover:brightness-105 transition-all z-40 border-b border-indigo-900/20 shadow-xs"
          style={{ paddingTop: showImpersonationBanner ? '6px' : 'calc(env(safe-area-inset-top, 0px) + 6px)' }}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-white">
              <strong className="font-semibold text-white">{trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'} remaining</strong> in your {FREE_TRIAL_DAYS}-day free organization trial.
            </span>
          </div>
          <span className="bg-white/20 hover:bg-white/30 text-white px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider transition-colors shrink-0 ml-3">
            Upgrade Plan
          </span>
        </div>
      )}

      {/* WORKSPACE CONTAINER: Full Desktop Layout with Sidebar + Fluid Main */}
      <div className="flex-1 flex w-full relative">
        
        {/* Desktop Persistent Sidebar (Only visible on lg: screens >= 1024px) */}
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
        <div className="flex-1 flex flex-col min-w-0 min-h-dvh bg-slate-50">
          
          {/* TOP APP BAR (Dual Viewport: Responsive Header conforming to the 3-Zone Contract) */}
          <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 py-3 transition-shadow shadow-xs">
            <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
              
              {/* Zone 1: Brand & Breadcrumbs */}
              <div className="flex items-center gap-3 min-w-0">
                {/* Mobile Hamburger Button */}
                <button 
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
                  aria-label="Open navigation menu"
                >
                  <Menu size={22} />
                </button>

                {/* Desktop Breadcrumbs Trail */}
                <div className="flex items-center gap-2 min-w-0 text-sm">
                  {effectiveBranding.logoUrl && (
                    <img src={effectiveBranding.logoUrl} alt="Brand" className="w-5 h-5 object-contain rounded hidden sm:inline" />
                  )}
                  <span className="font-semibold text-slate-800 whitespace-nowrap hidden sm:inline">
                    {effectiveBranding.appName || profile?.companyName || 'WorkForce Pro'}
                  </span>
                  <ChevronRight size={14} className="text-slate-400 hidden sm:inline shrink-0" />
                  <span className="font-medium text-slate-600 truncate">
                    {screenMeta.title}
                  </span>
                </div>
              </div>

              {/* Zone 2: Middle Status or Branch context + Quick Command Search */}
              <div className="hidden md:flex items-center gap-3">
                <button
                  onClick={() => setCommandPaletteOpen(true)}
                  className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200/80 rounded-xl text-xs text-slate-500 border border-slate-200/60 shadow-2xs transition-all active:scale-98"
                  title="Search navigation & actions (⌘K / Ctrl+K)"
                >
                  <Search size={13} className="text-slate-400" />
                  <span className="font-medium text-slate-600">Quick Actions...</span>
                  <kbd className="font-mono text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs text-slate-500 font-semibold">⌘K</kbd>
                </button>
                <div className="flex items-center gap-2 text-xs text-slate-400 border-l border-slate-200 pl-3">
                  <span>{screenMeta.category}</span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="font-mono text-slate-600 tabular-nums">
                    {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                </div>
              </div>

              {/* Zone 3: Quick Action, Notifications & User Avatar */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Mobile Search Button */}
                <button
                  onClick={() => setCommandPaletteOpen(true)}
                  className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
                  aria-label="Search and command palette"
                >
                  <Search size={19} />
                </button>

                {/* Interactive Setup & Flow Guide button */}
                {!isSuperAdmin && (
                  <button
                    onClick={() => setGuideOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 border border-indigo-200/80 rounded-xl text-xs font-semibold shadow-2xs transition-all active:scale-95"
                    title="Factory Workflow & Setup Guide"
                  >
                    <BookOpen size={14} className="text-indigo-600 shrink-0" />
                    <span className="hidden sm:inline">Setup Guide</span>
                  </button>
                )}

                {/* Quick Kiosk Launch button (if tenant enabled) */}
                {!isSuperAdmin && !isReseller && limits?.kioskEnabled !== false && (
                  <button
                    onClick={() => onNavigate('ATTENDANCE_KIOSK')}
                    className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors active:scale-95"
                    title="Launch Face & QR Attendance Kiosk"
                  >
                    <Camera size={14} />
                    <span>Launch Kiosk</span>
                  </button>
                )}

                {/* Notifications Trigger & Popover */}
                {!isSuperAdmin && (
                  <div className="relative" ref={notifRef}>
                    <button
                      onClick={() => setShowNotifications(!showNotifications)}
                      className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors relative min-w-[40px] min-h-[40px] flex items-center justify-center"
                      aria-label="Notifications"
                    >
                      <Bell size={19} />
                      {unreadCount > 0 && (
                        <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white" />
                      )}
                    </button>

                    {showNotifications && (
                      <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50 text-slate-800 animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">Notifications</span>
                            {unreadCount > 0 && (
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-md font-mono">
                                {unreadCount} new
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {notifications.length > 0 && (
                              <button 
                                onClick={handleClearAll} 
                                className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold transition-colors"
                              >
                                Clear all
                              </button>
                            )}
                            <button 
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
                              <p className="text-[11px] text-slate-400 mt-0.5">No new factory notifications</p>
                            </div>
                          ) : (
                            notifications.map(n => (
                              <div
                                key={n.id}
                                onClick={() => handleNotificationClick(n)}
                                className={`p-3.5 cursor-pointer transition-colors hover:bg-slate-50/80 ${
                                  !n.read ? 'bg-blue-50/40' : ''
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className={`text-xs font-bold leading-snug ${
                                    n.type === 'WARNING' ? 'text-rose-600' : 'text-slate-900'
                                  }`}>
                                    {n.title}
                                  </h4>
                                  {!n.read && (
                                    <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1" />
                                  )}
                                </div>
                                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{n.message}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Organization or User Badge */}
                <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                    {profile?.companyName ? profile.companyName.charAt(0).toUpperCase() : 'W'}
                  </div>
                </div>

              </div>
            </div>
          </header>

          {/* MAIN WORKSPACE CONTENT VIEWPORT */}
          <main className="flex-1 overflow-y-auto scroll-smooth w-full">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 pb-24 lg:pb-8">
              {children}
            </div>
          </main>

          {/* MOBILE BOTTOM NAVIGATION BAR (Hidden on lg: screens >= 1024px) */}
          {!isSuperAdmin && (
            <nav 
              className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 z-30 shadow-lg"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              <div className="flex items-center justify-around h-16 max-w-md mx-auto px-2">
                <MobileNavItem screen="DASHBOARD" icon={Home} label="Overview" />
                <MobileNavItem screen="WORKERS" icon={Users} label="Workers" />
                <MobileNavItem screen="ATTENDANCE" icon={CalendarCheck} label="Attendance" />
                <MobileNavItem screen="PAYROLL" icon={IndianRupee} label="Payroll" />
                <MobileNavItem 
                  icon={MoreHorizontal} 
                  label="Menu" 
                  onClick={() => setSidebarOpen(true)} 
                />
              </div>
            </nav>
          )}

        </div>
      </div>

      {/* Global Command Palette (⌘K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={onNavigate}
        onLogout={onLogout}
        onOpenGuide={() => setGuideOpen(true)}
      />

      {/* Interactive Factory Setup & Flow Guide Modal */}
      <SetupGuideModal
        isOpen={isGuideOpen}
        onClose={() => setGuideOpen(false)}
        onNavigate={onNavigate}
      />
    </div>
  );
};