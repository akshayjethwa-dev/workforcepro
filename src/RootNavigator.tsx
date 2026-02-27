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
import { ScreenName, Worker } from './types/index';
import { SettingsScreen } from './screens/SettingsScreen';
import { WorkerHistoryScreen } from './screens/WorkerHistoryScreen';
import { SuperAdminDashboard } from './screens/SuperAdminDashboard';
import { ReportsScreen } from './screens/ReportsScreen';
import { BillingScreen } from './screens/BillingScreen';
import { useBackButton } from './hooks/useBackButton'; // Added hook

export const RootNavigator: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('DASHBOARD');
  const [isRegistering, setIsRegistering] = useState(false);
  
  // State to hold the worker currently being edited
  const [workerToEdit, setWorkerToEdit] = useState<Worker | undefined>(undefined);
  
  // NEW: State to hold the selected branch ID for the Kiosk
  const [kioskBranchId, setKioskBranchId] = useState<string>('default');

  // --- GLOBAL BACK BUTTON INTERCEPTOR ---
  useBackButton(() => {
    // 1. If not logged in and on Register screen, go back to Login
    if (!user) {
      if (isRegistering) {
        setIsRegistering(false);
        return true; // Handled
      }
      return false; // Let app exit if on Login
    }

    // 2. If logged in and NOT on Dashboard, go to Dashboard
    if (currentScreen !== 'DASHBOARD') {
       // Kiosk and AddWorker handle their own specific back actions first,
       // but if they aren't mounted, this catches the rest (like Settings, Payroll, etc.)
       setCurrentScreen('DASHBOARD');
       return true; // Handled
    }

    // 3. If on Dashboard, let Android close the app natively
    return false;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-blue-600">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    if (isRegistering) {
      return <RegisterScreen onNavigateToLogin={() => setIsRegistering(false)} />;
    }
    return <LoginScreen onNavigateToRegister={() => setIsRegistering(true)} />;
  }

  // FIX: Pass the branchId to the AttendanceKioskScreen
  if (currentScreen === 'ATTENDANCE_KIOSK') {
    return <AttendanceKioskScreen onExit={() => setCurrentScreen('DASHBOARD')} branchId={kioskBranchId} />;
  }

  // Pass initialData if we are editing
  if (currentScreen === 'ADD_WORKER') {
    return (
      <AddWorkerScreen 
        initialData={workerToEdit}
        onBack={() => {
            setWorkerToEdit(undefined); // Clear edit state on back
            setCurrentScreen('WORKERS');
        }} 
        onSuccess={() => {
            setWorkerToEdit(undefined); // Clear edit state on success
            setCurrentScreen('WORKERS');
        }} 
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
                  onAddWorker={() => {
                      setWorkerToEdit(undefined); // Ensure we are in "Add" mode
                      setCurrentScreen('ADD_WORKER');
                  }}
                  onEditWorker={(worker) => {
                      setWorkerToEdit(worker); // Set "Edit" mode
                      setCurrentScreen('ADD_WORKER');
                  }} 
               />;
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