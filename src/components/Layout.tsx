import React, { useState } from 'react';
import { Home, Users, CalendarCheck, IndianRupee, Menu } from 'lucide-react'; 
import { ScreenName } from '../types/index';
import { useAuth } from '../contexts/AuthContext';
import { Sidebar } from './Sidebar'; // Ensure this file exists

interface LayoutProps {
  children: React.ReactNode;
  currentScreen: ScreenName;
  onNavigate: (screen: ScreenName) => void;
  onLogout: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, currentScreen, onNavigate, onLogout }) => {
  const { profile } = useAuth();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  
  if (currentScreen === 'LOGIN') {
    return <div className="min-h-screen bg-gray-50">{children}</div>;
  }

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
      
      {/* SIDEBAR COMPONENT - Slides in from left */}
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      {/* Header */}
      <header className="bg-blue-600 text-white p-4 shadow-md z-10 sticky top-0">
        <div className="flex justify-between items-center">
          {/* Hamburger Menu Button */}
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="p-2 -ml-2 hover:bg-blue-700 rounded-full transition-colors"
          >
            <Menu size={24} />
          </button>
          
          <div className="text-right">
            <h1 className="text-lg font-bold tracking-tight">WorkForcePro</h1>
            <p className="text-blue-100 text-[10px] uppercase tracking-wide">
              {profile?.companyName || 'Factory Admin'}
            </p>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-20 scroll-smooth">
        {children}
      </main>

      {/* Bottom Navigation - Cleaned up (4 main items) */}
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