import React, { useState, useEffect } from 'react';
import { Home, Users, CalendarCheck, IndianRupee, Menu, Bell, X } from 'lucide-react'; 
import { ScreenName, AppNotification } from '../types/index';
import { useAuth } from '../contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { dbService } from '../services/db';
import { Zap } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  currentScreen: ScreenName;
  onNavigate: (screen: ScreenName) => void;
  onLogout: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, currentScreen, onNavigate, onLogout }) => {
  const { profile } = useAuth();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  
  useEffect(() => {
    if (profile?.tenantId) {
      dbService.getNotifications(profile.tenantId).then(setNotifications);
    }
  }, [profile, showNotifications]); // Refresh when dropdown opens

  if (currentScreen === 'LOGIN') {
    return <div className="min-h-screen bg-gray-50">{children}</div>;
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.read) {
      await dbService.markNotificationRead(notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
    }
  };

  const NavItem = ({ screen, icon: Icon, label }: { screen: ScreenName; icon: any; label: string }) => {
    const isActive = currentScreen === screen;
    return (
      <button
        onClick={() => onNavigate(screen)}
        className={`flex flex-col items-center justify-center w-full py-2 ${
          isActive ? 'text-blue-600' : 'text-gray-400'
        }`}
      >
        <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
        <span className="text-[10px] mt-1 font-medium">{label}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto shadow-2xl overflow-hidden relative">
      
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      {/* --- NEW: TRIAL BANNER --- */}
      {useAuth().tenantPlan === 'TRIAL' && useAuth().trialDaysLeft !== null && (
        <div 
            onClick={() => onNavigate('BILLING')}
            className="bg-indigo-600 text-white text-[11px] font-bold px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-indigo-700 transition-colors z-20"
        >
            <div className="flex items-center">
                <Zap size={14} className="mr-1.5 text-yellow-300 fill-current"/>
                {useAuth().trialDaysLeft} Days left in Free Trial.
            </div>
            <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">Upgrade</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-blue-600 text-white p-4 shadow-md z-10 sticky top-0">
        <div className="flex justify-between items-center relative">
          <div className="flex items-center">
            <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 hover:bg-blue-700 rounded-full transition-colors">
              <Menu size={24} />
            </button>
            <div className="ml-2">
              <h1 className="text-lg font-bold tracking-tight">WorkForcePro</h1>
              <p className="text-blue-100 text-[10px] uppercase tracking-wide">
                {profile?.companyName || 'Factory Admin'}
              </p>
            </div>
          </div>

          {/* Notifications Bell */}
          <button 
            onClick={() => setShowNotifications(!showNotifications)} 
            className="p-2 relative hover:bg-blue-700 rounded-full transition-colors"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-blue-600 rounded-full"></span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="absolute top-12 right-0 w-72 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50 text-gray-800">
              <div className="flex justify-between items-center p-3 border-b border-gray-100 bg-gray-50">
                <span className="font-bold text-sm">Notifications</span>
                <button onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 py-4">No new notifications</p>
                ) : (
                  notifications.map(n => (
                    <div 
                      key={n.id} 
                      onClick={() => handleNotificationClick(n)}
                      className={`p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${!n.read ? 'bg-blue-50/30' : ''}`}
                    >
                      <div className="flex items-start justify-between">
                        <h4 className={`text-xs font-bold ${n.type === 'WARNING' ? 'text-red-600' : 'text-gray-800'}`}>{n.title}</h4>
                        {!n.read && <span className="w-2 h-2 bg-blue-500 rounded-full mt-1"></span>}
                      </div>
                      <p className="text-[10px] text-gray-600 mt-1">{n.message}</p>
                      <p className="text-[9px] text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20 scroll-smooth">
        {children}
      </main>

      <nav className="bg-white border-t border-gray-200 fixed bottom-0 w-full max-w-md pb-safe z-30">
        <div className="flex justify-around items-center h-16">
          <NavItem screen="DASHBOARD" icon={Home} label="Home" />
          <NavItem screen="WORKERS" icon={Users} label="Workers" />
          <NavItem screen="ATTENDANCE" icon={CalendarCheck} label="Scan" />
          <NavItem screen="PAYROLL" icon={IndianRupee} label="Payroll" />
        </div>
      </nav>
    </div>
  );
};