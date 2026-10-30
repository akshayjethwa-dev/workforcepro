// src/components/ClientEntitlementsModal.tsx
import React, { useState, useEffect } from 'react';
import { 
  X, Check, Lock, Shield, Layers, Clock, AlertTriangle, ArrowUpRight, Sparkles 
} from 'lucide-react';
import { 
  FeatureFlagKey, 
  ALL_FEATURE_FLAGS, 
  FeatureResolution, 
  PendingDowngrade 
} from '../types/featureFlags';
import { SubscriptionTier } from '../types/index';
import { entitlementService } from '../services/entitlementService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tenant: any;
  onUpgradePlan?: (tenantId: string, newPlan: SubscriptionTier) => void;
}

export const ClientEntitlementsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  tenant,
  onUpgradePlan,
}) => {
  const [resolutions, setResolutions] = useState<Record<FeatureFlagKey, FeatureResolution> | null>(null);
  const [pendingDowngrade, setPendingDowngrade] = useState<PendingDowngrade | null>(null);
  const [loading, setLoading] = useState(true);

  const tenantId = tenant?.tenantId || tenant?.id;

  useEffect(() => {
    if (isOpen && tenantId) {
      loadEntitlements();
    }
  }, [isOpen, tenantId]);

  const loadEntitlements = async () => {
    setLoading(true);
    try {
      const payload = await entitlementService.getTenantEntitlements(tenantId, tenant?.plan || 'FREE', true);
      setResolutions(payload.resolutions);
      setPendingDowngrade(payload.pendingDowngrade || null);
    } catch (err) {
      console.warn('Failed to load client entitlements:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !tenant) return null;

  const currentPlan: SubscriptionTier = tenant.plan || 'FREE';
  const enabledCount = resolutions 
    ? Object.values(resolutions).filter(r => r.enabled).length 
    : 0;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-xl">
              <Layers size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base leading-tight">
                  {tenant.branding?.appName || tenant.companyName || 'Client'} Entitlements
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full uppercase font-mono font-bold bg-blue-600 text-white">
                  {currentPlan}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {enabledCount} of {ALL_FEATURE_FLAGS.length} features active for this tenant
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 scrollbar-thin">
          {/* Grace Period Notice if present */}
          {pendingDowngrade && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs flex items-start gap-3">
              <Clock size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-amber-900">
                  Downgrade Grace Period Active
                </div>
                <p className="text-amber-800 mt-0.5 leading-relaxed">
                  This tenant is scheduled to downgrade from <strong>{pendingDowngrade.currentPlan}</strong> to{' '}
                  <strong>{pendingDowngrade.targetPlan}</strong> on{' '}
                  <strong>{new Date(pendingDowngrade.effectiveDate).toLocaleDateString()}</strong>. Features remain 
                  accessible until that date.
                </p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              Resolving tenant feature entitlements...
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
              {ALL_FEATURE_FLAGS.map((flag) => {
                const res = resolutions?.[flag.key];
                const isEnabled = Boolean(res?.enabled);

                return (
                  <div
                    key={flag.key}
                    className="p-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                        isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {isEnabled ? <Check size={14} strokeWidth={3} /> : <Lock size={14} />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 text-xs truncate">
                          {flag.label}
                        </div>
                        <div className="text-[11px] text-slate-500 line-clamp-1">
                          {flag.description}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                          <span>Source: <strong className="text-slate-600">{res?.source || 'PLAN_OVERRIDE'}</strong></span>
                          <span>•</span>
                          <span>Min: <strong className="text-slate-600">{flag.minRecommendedTier}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono ${
                        isEnabled 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>
                        {isEnabled ? 'ACTIVE' : 'LOCKED'}
                      </span>

                      {!isEnabled && onUpgradePlan && (
                        <button
                          onClick={() => {
                            onUpgradePlan(tenantId, flag.minRecommendedTier);
                            onClose();
                          }}
                          className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold transition-colors"
                        >
                          Unlock
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs">
          <div className="text-slate-500 text-[11px]">
            Server-enforced via Firestore rules & Entitlement engine
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
