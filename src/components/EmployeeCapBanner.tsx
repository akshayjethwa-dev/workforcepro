// src/components/EmployeeCapBanner.tsx
import React, { useState, useEffect } from 'react';
import { AlertTriangle, ShieldAlert, ArrowRight, X, Sparkles, Building2 } from 'lucide-react';
import { employeeCapGuard, EmployeeCapStatus } from '../services/employeeCapGuard';

interface EmployeeCapBannerProps {
  tenantId: string;
  onNavigateToBilling: () => void;
  className?: string;
  onStatusChange?: (status: EmployeeCapStatus) => void;
}

export const EmployeeCapBanner: React.FC<EmployeeCapBannerProps> = ({
  tenantId,
  onNavigateToBilling,
  className = '',
  onStatusChange
}) => {
  const [capStatus, setCapStatus] = useState<EmployeeCapStatus | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    const checkCap = async () => {
      if (!tenantId) return;
      try {
        const status = await employeeCapGuard.getTenantCapStatus(tenantId);
        if (mounted) {
          setCapStatus(status);
          if (onStatusChange) onStatusChange(status);
        }
      } catch (err) {
        console.warn('Notice checking employee cap status:', err);
      }
    };

    checkCap();
    const interval = setInterval(checkCap, 10000); // Poll status periodically

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [tenantId, onStatusChange]);

  if (!capStatus || dismissed) return null;
  if (!capStatus.isSoftCap && !capStatus.isHardCapExceeded) return null;

  // HARD CAP ALERT (> 110%)
  if (capStatus.isHardCapExceeded) {
    return (
      <div className={`p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${className}`}>
        <div className="flex items-start gap-3">
          <div className="p-2 bg-rose-100 text-rose-700 rounded-xl shrink-0 mt-0.5">
            <ShieldAlert size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-rose-950 text-sm">
                Workforce Hard Cap Exceeded ({capStatus.activeCount} / {capStatus.hardCapLimit} Workers)
              </h3>
              <span className="text-[10px] bg-rose-200 text-rose-900 font-extrabold px-2 py-0.2 rounded-md font-mono">
                WRITES BLOCKED
              </span>
            </div>
            <p className="text-rose-800 text-xs mt-1 leading-relaxed max-w-2xl">
              You have exceeded the 110% fair-usage tolerance on the <strong>{capStatus.planName}</strong> ({capStatus.cap} worker base cap). Direct employee registrations and bulk imports are currently rejected.
            </p>
          </div>
        </div>

        <button
          onClick={onNavigateToBilling}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 shrink-0 whitespace-nowrap"
        >
          <span>Upgrade Plan Now</span>
          <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  // SOFT CAP WARNING (100% - 110%)
  if (capStatus.isSoftCap) {
    return (
      <div className={`p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${className}`}>
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5">
            <AlertTriangle size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-amber-950 text-sm">
                You&apos;re {capStatus.overageCount} {capStatus.overageCount === 1 ? 'employee' : 'employees'} over your {capStatus.planName}
              </h3>
              <span className="text-[10px] bg-amber-200 text-amber-900 font-extrabold px-2 py-0.2 rounded-md font-mono">
                {capStatus.activeCount} / {capStatus.cap} ACTIVE
              </span>
            </div>
            <p className="text-amber-800 text-xs mt-1 leading-relaxed max-w-2xl">
              Additional workers are covered under fair-usage tolerance. An overage rate of{' '}
              <strong className="text-amber-950 font-mono">₹{capStatus.overageRate}/worker</strong>{' '}
              will be itemized on your next invoice. Upgrade to eliminate overage surcharges.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onNavigateToBilling}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>Upgrade Plan</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  return null;
};
