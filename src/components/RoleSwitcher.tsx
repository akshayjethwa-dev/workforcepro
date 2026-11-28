// src/components/RoleSwitcher.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  Shield,
  Handshake,
  Building2,
  Landmark,
  UserCheck,
  HardHat,
  ChevronDown,
  Check,
  RefreshCw,
  MapPin,
} from 'lucide-react';
import { CanonicalRole } from '../types/index';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getDefaultPathForRole, ROLE_METADATA } from '../services/rbacService';
import { useNavigate } from 'react-router-dom';

const ROLE_ICONS: Record<CanonicalRole, React.ComponentType<{ size?: number; className?: string }>> = {
  SUPER_ADMIN: Shield,
  RESELLER: Handshake,
  TENANT_ADMIN: Building2,
  FINANCE: Landmark,
  MANAGER: UserCheck,
  WORKER: HardHat,
};

/**
 * Top Navigation Bar Role Switcher.
 * - For users with multiple assigned roles (e.g. TENANT_ADMIN + RESELLER), renders an interactive
 *   dropdown to switch workspace context seamlessly.
 * - For single-role users, displays a concise read-only role badge (and branch scope pill for MANAGER).
 */
export const RoleSwitcher: React.FC = () => {
  const {
    activeRole,
    availableRoles,
    branchScope,
    isImpersonating,
    switchActiveRole,
    refreshSessionRole,
  } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasMultipleRoles = !isImpersonating && availableRoles.length > 1;
  const activeMeta = ROLE_METADATA[activeRole];
  const ActiveIcon = ROLE_ICONS[activeRole] || Shield;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelectRole = (nextRole: CanonicalRole) => {
    setIsOpen(false);
    if (nextRole === activeRole) return;

    const switched = switchActiveRole(nextRole);
    if (switched) {
      const targetMeta = ROLE_METADATA[nextRole];
      navigate(getDefaultPathForRole(nextRole), { replace: true });
      toast.info(`Switched active role to ${targetMeta.label}`, 'Role Changed');
    } else {
      toast.error('Access Denied.', 'Role Not Assigned');
    }
  };

  const handleManualSync = async () => {
    setIsRefreshing(true);
    try {
      const result = await refreshSessionRole({ forceTokenRefresh: true });
      if (!result.changed) {
        toast.success('Session role and token permissions verified.', 'Permissions Up to Date');
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!hasMultipleRoles) {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold tracking-tight ${activeMeta.badgeClass}`}
          title={`${activeMeta.label} — ${activeMeta.description}`}
        >
          <ActiveIcon size={13} className="shrink-0" />
          <span className="hidden sm:inline">{activeMeta.shortLabel}</span>
        </div>
        {branchScope.isBranchScoped && branchScope.branchName && (
          <div
            className="hidden xl:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-700 text-[11px] font-semibold"
            title={`Restricted to branch: ${branchScope.branchName}`}
          >
            <MapPin size={12} className="text-emerald-600 shrink-0" />
            <span className="max-w-[140px] truncate">{branchScope.branchName}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Switch workspace role"
        className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[2.25rem] rounded-xl border text-xs font-bold shadow-2xs transition-all active:scale-95 cursor-pointer ${activeMeta.badgeClass} hover:brightness-95`}
      >
        <ActiveIcon size={14} className="shrink-0" />
        <span className="hidden xs:inline max-w-[120px] truncate">{activeMeta.shortLabel}</span>
        <span className="hidden md:inline text-[10px] font-semibold opacity-75">
          ({availableRoles.length})
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Available workspace roles"
          className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2"
        >
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                Switch Active Role
              </div>
              <div className="text-[10px] text-slate-500">
                Multiple roles assigned to your account
              </div>
            </div>
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isRefreshing}
              title="Refresh token & verify roles"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="p-1.5 space-y-1">
            {availableRoles.map((roleOption) => {
              const meta = ROLE_METADATA[roleOption];
              const Icon = ROLE_ICONS[roleOption] || Shield;
              const isSelected = roleOption === activeRole;

              return (
                <button
                  key={roleOption}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelectRole(roleOption)}
                  className={`w-full flex items-start gap-2.5 p-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/90 border border-blue-200'
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div
                    className={`p-1.5 rounded-lg shrink-0 mt-0.5 border ${meta.badgeClass}`}
                  >
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {meta.label}
                      </span>
                      {isSelected && (
                        <Check size={14} className="text-blue-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                      {meta.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
