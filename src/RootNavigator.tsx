// src/RootNavigator.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useToast } from './contexts/ToastContext';
import { Layout } from './components/Layout';
import { RoleProtectedRoute } from './components/RoleProtectedRoute';
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
import { WorkerSelfServiceScreen } from './screens/WorkerSelfServiceScreen';
import { SuperAdminDashboard } from './screens/SuperAdminDashboard';
import { ResellerDashboard } from './screens/ResellerDashboard';
import { ReportsScreen } from './screens/ReportsScreen';
import { BillingScreen } from './screens/BillingScreen';
import { IdCardsScreen } from './screens/IdCardsScreen';
import { InboxScreen } from './screens/inboxScreen';
import { RosterScreen } from './screens/RosterScreen';
import { CtcSimulatorScreen } from './screens/CtcSimulatorScreen';
import { GratuityScreen } from './screens/GratuityScreen';
import { AnnualBonusScreen } from './screens/AnnualBonusScreen';
import { PoshIccScreen } from './screens/PoshIccScreen';
import { useBackButton } from './hooks/useBackButton';

// LEGAL & SUPPORT SCREENS
import { TermsScreen } from './screens/TermsScreen';
import { PrivacyScreen } from './screens/PrivacyScreen';

// ENTITLEMENTS & GATING
import { useEntitlements } from './contexts/EntitlementContext';
import { GracePeriodBanner } from './components/GracePeriodBanner';
import { UpgradeRequiredView } from './components/UpgradeRequiredView';

// SCOPED MAGIC LINK PORTAL
import { WorkerMagicLinkPortalView } from './components/WorkerMagicLinkPortalView';

// MIGRATION WIZARD
import { SetupWizardScreen } from './screens/SetupWizardScreen';
import { getMigrationProgress, isDemoTenant } from './services/migrationService';

// RBAC ROUTING HELPERS
import {
  getDefaultPathForRole,
  getDefaultScreenForRole,
  pathToScreen,
  screenToPath,
} from './services/rbacService';

export const RootNavigator: React.FC = () => {
  const { user, activeRole, loading, logout, roleChangeEvent, clearRoleChangeEvent, profile } = useAuth();
  const { isEntitled } = useEntitlements();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [isRegistering, setIsRegistering] = useState(false);
  const [workerToEdit, setWorkerToEdit] = useState<Worker | undefined>(undefined);
  const [kioskBranchId, setKioskBranchId] = useState<string>('default');

  // Track which tenant we have already evaluated for migration-redirect,
  // so we only force the wizard on the first visit per tenant.
  const [migrationCheckedForTenant, setMigrationCheckedForTenant] = useState<string | null>(null);

  // Magic Link Token State: parses /w/:token, ?w=:token, or #/w/:token
  const [magicToken, setMagicToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const qToken = params.get('w') || params.get('token');
    if (qToken) return qToken;

    const pathMatch = window.location.pathname.match(/\/w\/([a-zA-Z0-9_-]+)/);
    if (pathMatch) return pathMatch[1];

    const hashMatch = window.location.hash.match(/#\/?w\/([a-zA-Z0-9_-]+)/);
    if (hashMatch) return hashMatch[1];

    return null;
  });

  const [kioskConfig, setKioskConfig] = useState<KioskTerminal | null>(() => {
    const saved = localStorage.getItem('kiosk_config');
    return saved ? JSON.parse(saved) : null;
  });

  const currentScreen: ScreenName = pathToScreen(location.pathname);

  const handleNavigate = useCallback(
    (screen: ScreenName) => {
      const targetPath = screenToPath(screen);
      if (location.pathname !== targetPath) {
        navigate(targetPath);
      }
    },
    [location.pathname, navigate]
  );

  // Surface mid-session role change / forced logout toast notifications
  useEffect(() => {
    if (!roleChangeEvent) return;
    if (roleChangeEvent.type === 'REVOKED') {
      toast.error(
        roleChangeEvent.reason || 'Your session has ended because your access was revoked.',
        'Session Terminated'
      );
    } else if (roleChangeEvent.type === 'DEMOTED') {
      toast.warning(
        roleChangeEvent.reason ||
          `Role updated to ${roleChangeEvent.toRole}. Permissions refreshed.`,
        'Permissions Updated'
      );
    } else {
      toast.info(
        roleChangeEvent.reason || 'Your workspace permissions have been refreshed.',
        'Role Updated'
      );
    }
    clearRoleChangeEvent();
  }, [roleChangeEvent, clearRoleChangeEvent, toast]);

  // Redirect payment callback (?order_id=...) to /billing when authenticated
  useEffect(() => {
    if (user && new URLSearchParams(location.search).has('order_id') && location.pathname !== '/billing') {
      navigate('/billing' + location.search, { replace: true });
    }
  }, [user, location.search, location.pathname, navigate]);

  // Redirect root '/' or '/login' to the user's canonical role home route once authenticated
  useEffect(() => {
    if (!user || loading) return;
    const normalizedPath = location.pathname.replace(/\/+$/, '') || '/';
    if (normalizedPath === '/' || normalizedPath === '/login' || normalizedPath === '/register') {
      navigate(getDefaultPathForRole(activeRole), { replace: true });
    }
  }, [user, loading, activeRole, location.pathname, navigate]);

  // ---------------------------------------------------------------
  // FIRST-LOGIN MIGRATION WIZARD REDIRECT
  // Only runs once per tenant session. If the tenant has never
  // opened the wizard (no migration doc exists), redirect them to
  // /setup-wizard. Subsequent visits are NOT forced — the persistent
  // banner in the Layout reminds them, and they can bypass freely.
  // ---------------------------------------------------------------
  useEffect(() => {
    if (magicToken || kioskConfig) return;
    if (!user || loading) return;
    if (activeRole !== 'TENANT_ADMIN') return;

    const tenantId = profile?.tenantId;

    // Demo / unauthenticated tenant sentinel → never redirect.
    if (isDemoTenant(tenantId)) {
      if (tenantId) setMigrationCheckedForTenant(tenantId);
      return;
    }

    if (!tenantId) return;
    if (migrationCheckedForTenant === tenantId) return;

    let cancelled = false;

    (async () => {
      try {
        const progress = await getMigrationProgress(tenantId);
        if (cancelled) return;

        const isWizardPath = location.pathname === '/setup-wizard';

        // Redirect only if the tenant has NEVER started the wizard.
        // (Existing/legacy tenants who already have data will have a doc,
        // or — if not — will simply see the dashboard once and the banner.)
        if (!progress && !isWizardPath) {
          navigate('/setup-wizard', { replace: true });
        }
      } catch (err) {
        console.error('Migration redirect check failed:', err);
      } finally {
        if (!cancelled) {
          setMigrationCheckedForTenant(tenantId);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    magicToken,
    kioskConfig,
    user,
    loading,
    activeRole,
    profile?.tenantId,
    location.pathname,
    navigate,
    migrationCheckedForTenant,
  ]);

  useBackButton(() => {
    if (kioskConfig) return true;
    if (!user) {
      if (isRegistering) {
        setIsRegistering(false);
        return true;
      }
      return false;
    }

    const defaultScreen = getDefaultScreenForRole(activeRole);
    if (currentScreen !== defaultScreen) {
      handleNavigate(defaultScreen);
      return true;
    }
    return false;
  });

  // Dedicated Scoped Worker Magic Link Portal (Universal Link / PWA)
  if (magicToken) {
    return (
      <WorkerMagicLinkPortalView
        token={magicToken}
        onExitToLogin={() => {
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.delete('w');
            url.searchParams.delete('token');
            const cleanPath = url.pathname.replace(/\/w\/[a-zA-Z0-9_-]+/, '');
            window.history.replaceState({}, '', (cleanPath || '/') + (url.search ? url.search : ''));
          }
          setMagicToken(null);
          navigate('/login', { replace: true });
        }}
      />
    );
  }

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
    if (isRegistering || location.pathname === '/register') {
      return (
        <RegisterScreen
          onNavigateToLogin={() => {
            setIsRegistering(false);
            navigate('/login', { replace: true });
          }}
        />
      );
    }
    return (
      <LoginScreen
        onNavigateToRegister={() => {
          setIsRegistering(true);
          navigate('/register');
        }}
        onKioskLogin={(config) => {
          localStorage.setItem('kiosk_config', JSON.stringify(config));
          setKioskConfig(config);
        }}
      />
    );
  }

  const handleOpenKiosk = (branchId: string) => {
    setKioskBranchId(branchId);
    handleNavigate('ATTENDANCE_KIOSK');
  };

  const withShell = (node: React.ReactNode) => (
    <Layout currentScreen={currentScreen} onNavigate={handleNavigate} onLogout={logout}>
      <GracePeriodBanner onNavigateToBilling={() => handleNavigate('BILLING')} />
      {node}
    </Layout>
  );

  const defaultHomePath = getDefaultPathForRole(activeRole);

  return (
    <Routes>
      {/* Root / Auth redirect */}
      <Route path="/" element={<Navigate to={defaultHomePath} replace />} />
      <Route path="/login" element={<Navigate to={defaultHomePath} replace />} />
      <Route path="/register" element={<Navigate to={defaultHomePath} replace />} />

      {/* ================================================================
          MIGRATION WIZARD (Full-page, NOT wrapped in shell)
         ================================================================ */}
      <Route
        path="/setup-wizard"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN']}>
            <SetupWizardScreen />
          </RoleProtectedRoute>
        }
      />

      {/* ================================================================
          SUPER_ADMIN ROUTES: Tenants, Resellers, Revenue, System Settings
         ================================================================ */}
      <Route
        path="/admin"
        element={
          <RoleProtectedRoute allowedRoles={['SUPER_ADMIN']}>
            <Navigate to="/admin/tenants" replace />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/admin/tenants"
        element={
          <RoleProtectedRoute allowedRoles={['SUPER_ADMIN']}>
            {withShell(<SuperAdminDashboard initialTab="ORGS" />)}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/admin/resellers"
        element={
          <RoleProtectedRoute allowedRoles={['SUPER_ADMIN']}>
            {withShell(<SuperAdminDashboard initialTab="PARTNERS" />)}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/admin/revenue"
        element={
          <RoleProtectedRoute allowedRoles={['SUPER_ADMIN']}>
            {withShell(<SuperAdminDashboard initialTab="PLANS" />)}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <RoleProtectedRoute allowedRoles={['SUPER_ADMIN']}>
            {withShell(<SuperAdminDashboard initialTab="SECURITY" />)}
          </RoleProtectedRoute>
        }
      />

      {/* ================================================================
          RESELLER ROUTES: Partner Dashboard, Client List, Commission Ledger
         ================================================================ */}
      <Route
        path="/reseller"
        element={
          <RoleProtectedRoute allowedRoles={['RESELLER']}>
            <Navigate to="/reseller/dashboard" replace />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/reseller/dashboard"
        element={
          <RoleProtectedRoute allowedRoles={['RESELLER']}>
            {withShell(<ResellerDashboard initialTab="OVERVIEW" />)}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/reseller/clients"
        element={
          <RoleProtectedRoute allowedRoles={['RESELLER']}>
            {withShell(<ResellerDashboard initialTab="CLIENTS" />)}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/reseller/commissions"
        element={
          <RoleProtectedRoute allowedRoles={['RESELLER']}>
            {withShell(<ResellerDashboard initialTab="BILLING" />)}
          </RoleProtectedRoute>
        }
      />

      {/* ================================================================
          SHARED TENANT_ADMIN + MANAGER ROUTES (Managers are Branch-Scoped)
         ================================================================ */}
      <Route
        path="/dashboard"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN', 'MANAGER']}>
            {withShell(<DashboardScreen onOpenKiosk={handleOpenKiosk} onNavigate={handleNavigate} />)}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/attendance"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN', 'MANAGER']}>
            {withShell(<AttendanceScreen />)}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN', 'MANAGER']}>
            {withShell(<ReportsScreen />)}
          </RoleProtectedRoute>
        }
      />

      {/* ================================================================
          STRICT TENANT_ADMIN ONLY ROUTES (MANAGER / WORKER / RESELLER BLOCKED)
         ================================================================ */}
      <Route
        path="/inbox"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN']}>
            {withShell(<InboxScreen onNavigate={handleNavigate} />)}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/workers"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN']}>
            {withShell(
              <WorkersScreen
                onAddWorker={() => {
                  setWorkerToEdit(undefined);
                  handleNavigate('ADD_WORKER');
                }}
                onEditWorker={(worker) => {
                  setWorkerToEdit(worker);
                  handleNavigate('ADD_WORKER');
                }}
                onNavigateToBilling={() => handleNavigate('BILLING')}
                onOpenFnfGratuity={(workerId) => {
                  if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.setItem('gratuity_fnf_worker_id', workerId);
                  }
                  handleNavigate('GRATUITY');
                }}
              />
            )}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/workers/add"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN']}>
            <AddWorkerScreen
              initialData={workerToEdit}
              onBack={() => {
                setWorkerToEdit(undefined);
                handleNavigate('WORKERS');
              }}
              onSuccess={() => {
                setWorkerToEdit(undefined);
                handleNavigate('WORKERS');
              }}
              onNavigateToBilling={() => handleNavigate('BILLING')}
            />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/kiosk"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN']}>
            {!isEntitled('KIOSK_MODE') ? (
              withShell(<UpgradeRequiredView featureKey="KIOSK_MODE" onNavigate={handleNavigate} />)
            ) : (
              <AttendanceKioskScreen
                isDedicatedMode={false}
                onExit={() => handleNavigate('DASHBOARD')}
                branchId={kioskBranchId}
              />
            )}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/payroll"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN']}>
            {withShell(
              isEntitled('ADVANCED_PAYROLL') ? (
                <PayrollScreen onNavigate={handleNavigate} />
              ) : (
                <UpgradeRequiredView featureKey="ADVANCED_PAYROLL" onNavigate={handleNavigate} />
              )
            )}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/roster"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN']}>
            {withShell(
              isEntitled('REGULATE_PUNCH') ? (
                <RosterScreen />
              ) : (
                <UpgradeRequiredView featureKey="REGULATE_PUNCH" onNavigate={handleNavigate} />
              )
            )}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/id-cards"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN']}>
            {withShell(
              isEntitled('DIGITAL_ID_CARDS') ? (
                <IdCardsScreen />
              ) : (
                <UpgradeRequiredView featureKey="DIGITAL_ID_CARDS" onNavigate={handleNavigate} />
              )
            )}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/ctc-simulator"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN']}>
            {withShell(<CtcSimulatorScreen onNavigate={handleNavigate} />)}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/gratuity"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN']}>
            {withShell(<GratuityScreen onNavigate={handleNavigate} />)}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/annual-bonus"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN']}>
            {withShell(<AnnualBonusScreen onNavigate={handleNavigate} />)}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/posh-icc"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN']}>
            {withShell(<PoshIccScreen onNavigate={handleNavigate} />)}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/daily-logs"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN']}>
            {withShell(<DailyWageScreen />)}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/team"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN']}>
            {withShell(<TeamScreen />)}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN']}>
            {withShell(<SettingsScreen mode="PRIMARY" onNavigate={handleNavigate} />)}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/settings/advanced-hr"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN']}>
            {withShell(<SettingsScreen mode="ADVANCED" onNavigate={handleNavigate} />)}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/billing"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN', 'SUPER_ADMIN']}>
            {withShell(<BillingScreen />)}
          </RoleProtectedRoute>
        }
      />

      {/* ================================================================
          WORKER SELF-SERVICE ROUTES
         ================================================================ */}
      <Route
        path="/worker-portal"
        element={
          <RoleProtectedRoute allowedRoles={['WORKER']}>
            {withShell(<WorkerSelfServiceScreen onNavigate={handleNavigate} />)}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/worker-history"
        element={
          <RoleProtectedRoute allowedRoles={['TENANT_ADMIN', 'WORKER']}>
            {withShell(<WorkerHistoryScreen />)}
          </RoleProtectedRoute>
        }
      />

      {/* ================================================================
          LEGAL ROUTES (Accessible to all signed-in roles)
         ================================================================ */}
      <Route
        path="/terms"
        element={
          <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'RESELLER', 'TENANT_ADMIN', 'MANAGER', 'WORKER']}>
            {withShell(<TermsScreen />)}
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/privacy"
        element={
          <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'RESELLER', 'TENANT_ADMIN', 'MANAGER', 'WORKER']}>
            {withShell(<PrivacyScreen />)}
          </RoleProtectedRoute>
        }
      />

      {/* Fallback for any unknown URL */}
      <Route path="*" element={<Navigate to={defaultHomePath} replace />} />
    </Routes>
  );
};