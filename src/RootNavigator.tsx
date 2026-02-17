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
import { TeamScreen } from './screens/TeamScreen'; // Ensure imported
import { ScreenName, Worker } from './types/index';
import { SettingsScreen } from './screens/SettingsScreen';

export const RootNavigator: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('DASHBOARD');
  const [isRegistering, setIsRegistering] = useState(false);
  
  // State to hold the worker currently being edited
  const [workerToEdit, setWorkerToEdit] = useState<Worker | undefined>(undefined);

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

  if (currentScreen === 'ATTENDANCE_KIOSK') {
    return <AttendanceKioskScreen onExit={() => setCurrentScreen('DASHBOARD')} />;
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

  const renderMainScreen = () => {
    switch (currentScreen) {
      case 'DASHBOARD': return <DashboardScreen onOpenKiosk={() => setCurrentScreen('ATTENDANCE_KIOSK')} />;
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
      default: return <DashboardScreen onOpenKiosk={() => setCurrentScreen('ATTENDANCE_KIOSK')} />;
    }
  };

  return (
    <Layout currentScreen={currentScreen} onNavigate={setCurrentScreen} onLogout={() => auth.signOut()}>
      {renderMainScreen()}
    </Layout>
  );
};