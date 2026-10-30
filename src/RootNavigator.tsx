// src/RootNavigator.tsx
import React, { useState, useEffect } from 'react';
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
import { ResellerDashboard } from './screens/ResellerDashboard'; // NEW IMPORT
import { ReportsScreen } from './screens/ReportsScreen';
import { BillingScreen } from './screens/BillingScreen';
import { IdCardsScreen } from './screens/IdCardsScreen';
import { InboxScreen } from './screens/inboxScreen';
import { RosterScreen } from './screens/RosterScreen';
import { useBackButton } from './hooks/useBackButton';

// LEGAL & SUPPORT SCREENS
import { TermsScreen } from './screens/TermsScreen';
import { PrivacyScreen } from './screens/PrivacyScreen';

// ENTITLEMENTS & GATING
import { useEntitlements } from './contexts/EntitlementContext';
import { GracePeriodBanner } from './components/GracePeriodBanner';
import { UpgradeRequiredView } from './components/UpgradeRequiredView';

export const RootNavigator: React.FC = () => {
  const { user, profile, loading, logout } = useAuth();
  const { isEntitled } = useEntitlements();
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('DASHBOARD');
  const [isRegistering, setIsRegistering] = useState(false);
  const [workerToEdit, setWorkerToEdit] = useState<Worker | undefined>(undefined);
  const [kioskBranchId, setKioskBranchId] = useState<string>('default');

  const [kioskConfig, setKioskConfig] = useState<KioskTerminal | null>(() => {
    const saved = localStorage.getItem('kiosk_config');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (user && profile && currentScreen === 'DASHBOARD') {
      if (profile.role === 'SUPER_ADMIN') {
        setCurrentScreen('SUPER_ADMIN_DASHBOARD');
      } else if (profile.role === 'RESELLER') {
        setCurrentScreen('RESELLER_DASHBOARD'); // NEW ROUTING
      }
    }
  }, [user, profile, currentScreen]);

  useBackButton(() => {
    if (kioskConfig) return true; 
    if (!user) {
      if (isRegistering) { setIsRegistering(false); return true; }
      return false; 
    }
    
    // Default screen determination based on role
    let defaultScreen: ScreenName = 'DASHBOARD';
    if (profile?.role === 'SUPER_ADMIN') defaultScreen = 'SUPER_ADMIN_DASHBOARD';
    if (profile?.role === 'RESELLER') defaultScreen = 'RESELLER_DASHBOARD'; // NEW ROUTING
    
    if (currentScreen !== defaultScreen) {
       setCurrentScreen(defaultScreen);
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

  if (!user) {
    if (isRegistering) {
      return <RegisterScreen onNavigateToLogin={() => setIsRegistering(false)} />;
    }
    return (
      <LoginScreen 
        onNavigateToRegister={() => setIsRegistering(true)} 
        onKioskLogin={(config) => {
           localStorage.setItem('kiosk_config', JSON.stringify(config));
           setKioskConfig(config);
        }}
      />
    );
  }

  if (currentScreen === 'ATTENDANCE_KIOSK') {
    if (!isEntitled('KIOSK_MODE')) {
      return (
        <Layout currentScreen={currentScreen} onNavigate={setCurrentScreen} onLogout={logout}>
          <GracePeriodBanner onNavigateToBilling={() => setCurrentScreen('BILLING')} />
          <UpgradeRequiredView featureKey="KIOSK_MODE" onNavigate={setCurrentScreen} />
        </Layout>
      );
    }
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
    if (!isEntitled('KIOSK_MODE')) {
      setCurrentScreen('ATTENDANCE_KIOSK');
      return;
    }
    setKioskBranchId(branchId);
    setCurrentScreen('ATTENDANCE_KIOSK');
  };

  const renderMainScreen = () => {
    switch (currentScreen) {
      case 'DASHBOARD': return <DashboardScreen onOpenKiosk={handleOpenKiosk} onNavigate={setCurrentScreen} />;
      case 'INBOX': return <InboxScreen onNavigate={setCurrentScreen} />;
      case 'WORKERS': 
        return <WorkersScreen 
                  onAddWorker={() => { setWorkerToEdit(undefined); setCurrentScreen('ADD_WORKER'); }}
                  onEditWorker={(worker) => { setWorkerToEdit(worker); setCurrentScreen('ADD_WORKER'); }} 
               />;
      case 'ID_CARDS': 
        return isEntitled('DIGITAL_ID_CARDS') 
          ? <IdCardsScreen /> 
          : <UpgradeRequiredView featureKey="DIGITAL_ID_CARDS" onNavigate={setCurrentScreen} />;
      case 'PAYROLL': 
        return isEntitled('ADVANCED_PAYROLL') 
          ? <PayrollScreen /> 
          : <UpgradeRequiredView featureKey="ADVANCED_PAYROLL" onNavigate={setCurrentScreen} />;
      case 'ATTENDANCE': return <AttendanceScreen />;
      case 'ROSTER': return <RosterScreen />;
      case 'DAILY_LOGS': return <DailyWageScreen />;
      case 'TEAM': return <TeamScreen />;
      case 'SETTINGS': return <SettingsScreen onNavigate={setCurrentScreen} />;
      case 'WORKER_HISTORY': return <WorkerHistoryScreen />;
      
      case 'SUPER_ADMIN_DASHBOARD': 
        return profile?.role === 'SUPER_ADMIN' 
          ? <SuperAdminDashboard /> 
          : <DashboardScreen onOpenKiosk={handleOpenKiosk} />; 

      // NEW RESELLER DASHBOARD ROUTING
      case 'RESELLER_DASHBOARD': 
        return profile?.role === 'RESELLER' 
          ? <ResellerDashboard /> 
          : <DashboardScreen onOpenKiosk={handleOpenKiosk} />;

      case 'REPORTS': return <ReportsScreen />;
      case 'BILLING': return <BillingScreen />;
      
      // LEGAL SCREENS
      case 'TERMS': return <TermsScreen />;
      case 'PRIVACY': return <PrivacyScreen />;
      
      default: 
        if (profile?.role === 'SUPER_ADMIN') return <SuperAdminDashboard />;
        if (profile?.role === 'RESELLER') return <ResellerDashboard />;
        return <DashboardScreen onOpenKiosk={handleOpenKiosk} />;
    }
  };

  return (
    <Layout currentScreen={currentScreen} onNavigate={setCurrentScreen} onLogout={logout}>
      <GracePeriodBanner onNavigateToBilling={() => setCurrentScreen('BILLING')} />
      {renderMainScreen()}
    </Layout>
  );
};