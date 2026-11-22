// src/components/RoleProtectedRoute.tsx
import React, { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { CanonicalRole } from '../types/index';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getDefaultPathForRole } from '../services/rbacService';
import { tenantSecurityService } from '../services/tenantSecurityService';

interface RoleProtectedRouteProps {
  allowedRoles: CanonicalRole[];
  children: React.ReactNode;
  redirectTo?: string;
}

/**
 * React Router-level Route Guard.
 * Blocks unauthorized URL navigation (including direct address-bar entry like /payroll or /settings),
 * emits an "Access Denied." toast notification, logs an audit trail entry, and redirects cleanly
 * to the user's authorized home route (e.g. /dashboard for MANAGER / TENANT_ADMIN).
 */
export const RoleProtectedRoute: React.FC<RoleProtectedRouteProps> = ({
  allowedRoles,
  children,
  redirectTo,
}) => {
  const { user, profile, activeRole, loading } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const lastDeniedKeyRef = useRef<string | null>(null);

  const isAuthorized = Boolean(user) && allowedRoles.includes(activeRole);
  const fallbackPath = redirectTo || getDefaultPathForRole(activeRole);

  useEffect(() => {
    if (loading || !user || isAuthorized) {
      lastDeniedKeyRef.current = null;
      return;
    }

    const denialKey = `${activeRole}:${location.pathname}`;
    if (lastDeniedKeyRef.current === denialKey) {
      return;
    }
    lastDeniedKeyRef.current = denialKey;

    toast.error('Access Denied.', 'Restricted Route');

    // Append security audit record for compliance visibility
    if (profile) {
      tenantSecurityService
        .logTenantAccess({
          tenantId: profile.tenantId || 'system',
          userId: profile.uid,
          userEmail: profile.email || 'unknown',
          userRole: activeRole,
          action: 'ROUTE_ACCESS_DENIED',
          resource: location.pathname,
          status: 'DENIED',
          details: {
            attemptedPath: location.pathname,
            activeRole,
            requiredRoles: allowedRoles,
          },
        })
        .catch(() => {});
    }
  }, [loading, user, isAuthorized, activeRole, location.pathname, allowedRoles, profile, toast]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-blue-600">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!isAuthorized) {
    return (
      <Navigate
        to={fallbackPath}
        replace
        state={{ accessDeniedFrom: location.pathname }}
      />
    );
  }

  return <>{children}</>;
};
