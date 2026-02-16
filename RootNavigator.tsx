import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { WorkersScreen } from './screens/WorkersScreen';
import { AddWorkerScreen } from './screens/AddWorkerScreen';
import { AttendanceKioskScreen } from './screens/AttendanceKioskScreen';
import { AttendanceScreen } from './screens/AttendanceScreen';
import { PayrollScreen } from './screens/PayrollScreen';
import { DailyWageScreen } from './screens/DailyWageScreen';
import { storageService } from './services/storage';
import { ScreenName } from './types';

export const RootNavigator: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('LOGIN');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = () => {
      const user = storageService.getUser();
      if (user) {
        setIsAuthenticated(true);
        // Only set dashboard if we were on login, otherwise keep current if persisted (mock logic)
        // For now, always go to dashboard on app load if auth
        setCurrentScreen('DASHBOARD');
      } else {
        setIsAuthenticated(false);
        setCurrentScreen('LOGIN');
      }
      setIsLoading(false);
    };
    checkAuth();
  }, []);

  const handleLogin = () => {
    setIsAuthenticated(true);
    setCurrentScreen('DASHBOARD');
  };

  const handleLogout = () => {
    storageService.logout();
    setIsAuthenticated(false);
    setCurrentScreen('LOGIN');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-blue-600">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // 1. Unauthenticated Stack
  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLogin} />;
  }

  // 2. Full-Screen Modal Stack (No Navigation Layout)
  if (currentScreen === 'ATTENDANCE_KIOSK') {
    return <AttendanceKioskScreen onExit={() => setCurrentScreen('DASHBOARD')} />;
  }

  if (currentScreen === 'ADD_WORKER') {
    return <AddWorkerScreen onBack={() => setCurrentScreen('WORKERS')} onSuccess={() => setCurrentScreen('WORKERS')} />;
  }

  // 3. Authenticated Main Stack (Wrapped in Layout)
  const renderMainScreen = () => {
    switch (currentScreen) {
      case 'DASHBOARD':
        return <DashboardScreen onOpenKiosk={() => setCurrentScreen('ATTENDANCE_KIOSK')} />;
      case 'WORKERS':
        return <WorkersScreen onAddWorker={() => setCurrentScreen('ADD_WORKER')} />;
      case 'PAYROLL':
        return <PayrollScreen />;
      case 'ATTENDANCE':
        return <AttendanceScreen />;
      case 'DAILY_LOGS':
        return <DailyWageScreen />;
      default:
        return <DashboardScreen onOpenKiosk={() => setCurrentScreen('ATTENDANCE_KIOSK')} />;
    }
  };

  return (
    <Layout 
      currentScreen={currentScreen} 
      onNavigate={setCurrentScreen}
      onLogout={handleLogout}
    >
      {renderMainScreen()}
    </Layout>
  );
};
