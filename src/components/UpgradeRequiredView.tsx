// src/components/UpgradeRequiredView.tsx
import React from 'react';
import { Lock, Sparkles, Shield, ArrowRight, Home, ChevronRight, HelpCircle } from 'lucide-react';
import { FeatureFlagKey, ALL_FEATURE_FLAGS } from '../types/featureFlags';
import { useAuth } from '../contexts/AuthContext';
import { useEntitlements } from '../contexts/EntitlementContext';
import { ScreenName } from '../types/index';

interface Props {
  featureKey: FeatureFlagKey;
  onNavigate?: (screen: ScreenName) => void;
}

export const UpgradeRequiredView: React.FC<Props> = ({ featureKey, onNavigate }) => {
  const { profile, tenantPlan } = useAuth();
  const { getResolution } = useEntitlements();
  const resolution = getResolution(featureKey);

  const featureDef = ALL_FEATURE_FLAGS.find(f => f.key === featureKey) || {
    key: featureKey,
    label: featureKey.replace(/_/g, ' '),
    description: 'This feature is restricted by your subscription plan entitlements.',
    category: 'CORE',
    minRecommendedTier: 'PRO',
  };

  const isOwner = profile?.role === 'FACTORY_OWNER';
  const isReseller = profile?.role === 'RESELLER';

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200/80 shadow-xl p-8 text-center relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-100 rounded-full blur-3xl opacity-60 pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-100 rounded-full blur-3xl opacity-60 pointer-events-none" />

        {/* Lock Icon */}
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-600 flex items-center justify-center mx-auto mb-5 shadow-xs">
          <Lock size={32} />
        </div>

        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold uppercase tracking-wider mb-3">
          <Sparkles size={12} className="text-amber-500" />
          <span>Plan Entitlement Gated</span>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          {featureDef.label}
        </h2>

        {/* Description */}
        <p className="text-sm text-slate-600 leading-relaxed mb-6">
          {featureDef.description}
        </p>

        {/* Resolution Precedence Box */}
        <div className="bg-slate-50 rounded-2xl p-4 text-left border border-slate-200/80 mb-6 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Current Plan:</span>
            <span className="font-bold text-slate-800 uppercase px-2 py-0.5 rounded bg-slate-200/70 font-mono text-[11px]">
              {tenantPlan}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Minimum Tier Required:</span>
            <span className="font-bold text-blue-700 uppercase px-2 py-0.5 rounded bg-blue-100/70 font-mono text-[11px]">
              {featureDef.minRecommendedTier}
            </span>
          </div>
          <div className="pt-2 border-t border-slate-200/60 flex items-start gap-1.5 text-[11px] text-slate-500">
            <HelpCircle size={13} className="shrink-0 mt-0.5 text-slate-400" />
            <span>
              Evaluation source: <strong className="text-slate-700">{resolution.source}</strong> ({resolution.reason || 'Not included in active plan tier'}).
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2.5">
          {isOwner && onNavigate && (
            <button
              onClick={() => onNavigate('BILLING')}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 group text-sm"
            >
              <span>Upgrade to {featureDef.minRecommendedTier} Plan</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
          )}

          {isReseller && onNavigate && (
            <button
              onClick={() => onNavigate('RESELLER_DASHBOARD')}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm"
            >
              <span>Manage Client Plan in Partner Dashboard</span>
              <ChevronRight size={16} />
            </button>
          )}

          {!isOwner && !isReseller && (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-xs leading-relaxed mb-2">
              To access this module, please request your factory owner or administrator to upgrade the subscription tier.
            </div>
          )}

          {onNavigate && (
            <button
              onClick={() => onNavigate('DASHBOARD')}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-colors text-xs flex items-center justify-center gap-1.5"
            >
              <Home size={14} />
              <span>Return to Dashboard</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
