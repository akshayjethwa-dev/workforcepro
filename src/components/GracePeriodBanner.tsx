// src/components/GracePeriodBanner.tsx
import React, { useState } from 'react';
import { AlertTriangle, Clock, Calendar, X, ArrowUpRight, ShieldAlert } from 'lucide-react';
import { useEntitlements } from '../contexts/EntitlementContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { entitlementService } from '../services/entitlementService';

interface Props {
  onNavigateToBilling?: () => void;
}

export const GracePeriodBanner: React.FC<Props> = ({ onNavigateToBilling }) => {
  const { pendingDowngrade, isInGracePeriod, refreshEntitlements } = useEntitlements();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (!isInGracePeriod || !pendingDowngrade || dismissed) {
    return null;
  }

  const effectiveDateObj = new Date(pendingDowngrade.effectiveDate);
  const formattedDate = effectiveDateObj.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const now = new Date();
  const diffDays = Math.max(1, Math.ceil((effectiveDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  const handleCancelDowngrade = async () => {
    if (!profile?.tenantId) return;
    setCancelling(true);
    try {
      await entitlementService.cancelDowngrade(profile.tenantId);
      await refreshEntitlements(true);
      toast.success('Scheduled downgrade cancelled. Your plan remains uninterrupted.');
    } catch (err) {
      toast.error('Failed to cancel downgrade. Please contact support.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 text-white px-4 py-3 shadow-md relative z-30">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-xs md:text-sm">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-white/20 rounded-lg shrink-0">
            <Clock size={18} className="text-white animate-pulse" />
          </div>
          <div>
            <div className="font-semibold flex items-center gap-2">
              <span>Subscription Grace Period Active</span>
              <span className="bg-amber-800/60 text-amber-100 text-[10px] px-2 py-0.5 rounded-full font-mono font-medium">
                {diffDays} {diffDays === 1 ? 'day' : 'days'} remaining
              </span>
            </div>
            <p className="text-amber-100 text-[11px] md:text-xs mt-0.5">
              Your subscription is scheduled to downgrade to{' '}
              <strong className="text-white uppercase tracking-wide">{pendingDowngrade.targetPlan}</strong> on{' '}
              <span className="underline decoration-white/40">{formattedDate}</span>. All{' '}
              <strong className="text-white uppercase tracking-wide">{pendingDowngrade.currentPlan}</strong> features 
              remain fully accessible without interruption until your cycle ends.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          {profile?.role === 'FACTORY_OWNER' && (
            <button
              onClick={handleCancelDowngrade}
              disabled={cancelling}
              className="px-3 py-1.5 bg-white text-amber-900 hover:bg-amber-50 font-semibold rounded-lg shadow-xs transition-colors text-xs flex items-center gap-1 disabled:opacity-50"
            >
              {cancelling ? 'Reverting...' : 'Keep Current Plan'}
            </button>
          )}

          {onNavigateToBilling && (
            <button
              onClick={onNavigateToBilling}
              className="px-3 py-1.5 bg-amber-950/40 hover:bg-amber-950/60 text-white font-medium rounded-lg transition-colors text-xs flex items-center gap-1"
            >
              <span>Manage Billing</span>
              <ArrowUpRight size={13} />
            </button>
          )}

          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-amber-200 hover:text-white rounded-md hover:bg-white/10 transition-colors ml-1"
            title="Dismiss notice"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
