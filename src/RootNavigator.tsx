// src/RootNavigator.tsx
import React, { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { auth } from './lib/firebase';
import { Layout } from './components/Layout';
import { LoginScreen } from './screens/LoginScreen';
import { RegisterScreen } from './screens/RegisterScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { WorkersScreen } from './screens/WorkersScreen';
import { AddWorkerScreen } from './screens/AddWorkerScreen';
import { AttendanceKioskScreen } from './screens/AttendanceKioskScreen';
import { AttendanceScreen } from './screens/AttendanceScreen';
import { PayrollScreen } from './screens/PayrollScreen';
import { DailyWageScreen } from './screens/DailyWageScreen';
import { TeamScreen } from './screens/TeamScreen'; 
import { ScreenName, Worker, KioskTerminal } from './types/index';
import { SettingsScreen } from './screens/SettingsScreen';
import { WorkerHistoryScreen } from './screens/WorkerHistoryScreen';
import { SuperAdminDashboard } from './screens/SuperAdminDashboard';
import { ReportsScreen } from './screens/ReportsScreen';
import { BillingScreen } from './screens/BillingScreen';
import { IdCardsScreen } from './screens/IdCardsScreen';
import { useBackButton } from './hooks/useBackButton';

export const RootNavigator: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('DASHBOARD');
  const [isRegistering, setIsRegistering] = useState(false);
  const [workerToEdit, setWorkerToEdit] = useState<Worker | undefined>(undefined);
  const [kioskBranchId, setKioskBranchId] = useState<string>('default');

  // --- NEW: Check for Dedicated Kiosk Mode in LocalStorage ---
  const [kioskConfig, setKioskConfig] = useState<KioskTerminal | null>(() => {
    const saved = localStorage.getItem('kiosk_config');
    return saved ? JSON.parse(saved) : null;
  });

  useBackButton(() => {
    if (kioskConfig) return true; // Disable back button completely in dedicated kiosk mode
    if (!user) {
      if (isRegistering) { setIsRegistering(false); return true; }
      return false; 
    }
    if (currentScreen !== 'DASHBOARD') {
       setCurrentScreen('DASHBOARD');
       return true; 
    }
    return false;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-blue-600">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // --- DEDICATED KIOSK MODE RENDERING ---
  if (kioskConfig) {
    return (
      <AttendanceKioskScreen 
        branchId={kioskConfig.branchId} 
        isDedicatedMode={true}
        tenantId={kioskConfig.tenantId}
        adminPin={kioskConfig.adminPin}
        onExit={() => {
           localStorage.removeItem('kiosk_config');
           setKioskConfig(null);
        }} 
      />
    );
  }

  // --- LOGIN / REGISTER SCREENS ---
  if (!user) {
    if (isRegistering) {
      return <RegisterScreen onNavigateToLogin={() => setIsRegistering(false)} />;
    }
    return (
      <LoginScreen 
        onNavigateToRegister={() => setIsRegistering(true)} 
        onKioskLogin={(config) => {
           // THIS FIXES YOUR ERROR: We pass the function that saves the config and triggers the kiosk UI
           localStorage.setItem('kiosk_config', JSON.stringify(config));
           setKioskConfig(config);
        }}
      />
    );
  }

  // STANDARD IN-APP KIOSK MODE (Admin clicks from dashboard)
  if (currentScreen === 'ATTENDANCE_KIOSK') {
    return <AttendanceKioskScreen isDedicatedMode={false} onExit={() => setCurrentScreen('DASHBOARD')} branchId={kioskBranchId} />;
  }

  if (currentScreen === 'ADD_WORKER') {
    return (
      <AddWorkerScreen 
        initialData={workerToEdit}
        onBack={() => { setWorkerToEdit(undefined); setCurrentScreen('WORKERS'); }} 
        onSuccess={() => { setWorkerToEdit(undefined); setCurrentScreen('WORKERS'); }} 
      />
    );
  }

  const handleOpenKiosk = (branchId: string) => {
      setKioskBranchId(branchId);
      setCurrentScreen('ATTENDANCE_KIOSK');
  };

  const renderMainScreen = () => {
    switch (currentScreen) {
      case 'DASHBOARD': return <DashboardScreen onOpenKiosk={handleOpenKiosk} />;
      case 'WORKERS': 
        return <WorkersScreen 
                  onAddWorker={() => { setWorkerToEdit(undefined); setCurrentScreen('ADD_WORKER'); }}
                  onEditWorker={(worker) => { setWorkerToEdit(worker); setCurrentScreen('ADD_WORKER'); }} 
               />;
      case 'ID_CARDS': return <IdCardsScreen />;
      case 'PAYROLL': return <PayrollScreen />;
      case 'ATTENDANCE': return <AttendanceScreen />;
      case 'DAILY_LOGS': return <DailyWageScreen />;
      case 'TEAM': return <TeamScreen />;
      case 'SETTINGS': return <SettingsScreen />;
      case 'WORKER_HISTORY': return <WorkerHistoryScreen />;
      case 'SUPER_ADMIN_DASHBOARD': return <SuperAdminDashboard />;
      case 'REPORTS': return <ReportsScreen />;
      case 'BILLING': return <BillingScreen />;
      default: return <DashboardScreen onOpenKiosk={handleOpenKiosk} />;
    }
  };

  return (
    <Layout currentScreen={currentScreen} onNavigate={setCurrentScreen} onLogout={() => auth.signOut()}>
      {renderMainScreen()}
    </Layout>
  );
};