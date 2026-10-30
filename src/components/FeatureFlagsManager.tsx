// src/components/FeatureFlagsManager.tsx
import React, { useState, useEffect } from 'react';
import { 
  Sliders, Shield, Layers, Building2, Check, X, AlertTriangle, 
  RefreshCw, Save, Calendar, Clock, ArrowRight, Info, CheckCircle2,
  Sparkles, Filter, Search, ChevronDown, ChevronRight
} from 'lucide-react';
import { 
  FeatureFlagKey, 
  ALL_FEATURE_FLAGS, 
  DEFAULT_PLAN_FEATURE_FLAGS, 
  FeatureResolution,
  PendingDowngrade 
} from '../types/featureFlags';
import { SubscriptionTier, TenantProfile } from '../types/index';
import { entitlementService } from '../services/entitlementService';
import { useToast } from '../contexts/ToastContext';

interface Props {
  tenants: any[];
  onRefreshData?: () => void;
}

export const FeatureFlagsManager: React.FC<Props> = ({ tenants, onRefreshData }) => {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<'GLOBAL' | 'PLANS' | 'TENANTS' | 'SIMULATOR'>('PLANS');

  // Level 1: Global Defaults
  const [globalFlags, setGlobalFlags] = useState<Record<FeatureFlagKey, boolean>>({} as any);
  const [savingGlobal, setSavingGlobal] = useState(false);

  // Level 2: Plan Matrix
  const [planMatrix, setPlanMatrix] = useState<Record<SubscriptionTier, Record<FeatureFlagKey, boolean>>>(DEFAULT_PLAN_FEATURE_FLAGS);
  const [savingPlanMatrix, setSavingPlanMatrix] = useState(false);

  // Level 3: Tenant Overrides
  const [selectedTenantId, setSelectedTenantId] = useState<string>(tenants[0]?.tenantId || tenants[0]?.id || '');
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantOverrides, setTenantOverrides] = useState<Partial<Record<FeatureFlagKey, boolean>>>({});
  const [savingTenantOverrides, setSavingTenantOverrides] = useState(false);
  const [selectedTenantEntitlements, setSelectedTenantEntitlements] = useState<Record<FeatureFlagKey, FeatureResolution> | null>(null);
  const [tenantPendingDowngrade, setTenantPendingDowngrade] = useState<PendingDowngrade | null>(null);

  // Mid-cycle downgrade state
  const [downgradeTargetPlan, setDowngradeTargetPlan] = useState<SubscriptionTier>('STARTER');
  const [downgradeCycleDate, setDowngradeCycleDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().split('T')[0];
  });
  const [schedulingDowngrade, setSchedulingDowngrade] = useState(false);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllFlags();
  }, []);

  useEffect(() => {
    if (selectedTenantId) {
      loadTenantSpecificData(selectedTenantId);
    }
  }, [selectedTenantId]);

  const loadAllFlags = async () => {
    setLoading(true);
    try {
      const [globals, plans] = await Promise.all([
        entitlementService.getGlobalFeatureFlags(),
        entitlementService.getPlanFeatureFlags(),
      ]);
      setGlobalFlags(globals);
      setPlanMatrix(plans);
    } catch (err) {
      toast.error('Failed to load feature flag configurations.');
    } finally {
      setLoading(false);
    }
  };

  const loadTenantSpecificData = async (tId: string) => {
    try {
      const payload = await entitlementService.getTenantEntitlements(tId, 'STARTER', true);
      setSelectedTenantEntitlements(payload.resolutions);
      setTenantPendingDowngrade(payload.pendingDowngrade || null);

      // Find tenant's explicit overrides if present
      const matched = tenants.find(t => (t.tenantId || t.id) === tId);
      setTenantOverrides(matched?.featureOverrides || {});
    } catch (err) {
      console.warn('Could not load tenant specific data:', err);
    }
  };

  const handleSaveGlobal = async () => {
    setSavingGlobal(true);
    try {
      await entitlementService.updateGlobalFeatureFlags(globalFlags);
      toast.success('Global feature flag defaults saved successfully.');
    } catch (err) {
      toast.error('Failed to save global feature flags.');
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleTogglePlanFeature = (tier: SubscriptionTier, key: FeatureFlagKey) => {
    setPlanMatrix(prev => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        [key]: !prev[tier][key],
      }
    }));
  };

  const handleSavePlanMatrix = async () => {
    setSavingPlanMatrix(true);
    try {
      const tiers: SubscriptionTier[] = ['FREE', 'TRIAL', 'STARTER', 'PRO', 'ENTERPRISE'];
      for (const t of tiers) {
        await entitlementService.updatePlanFeatureFlags(t, planMatrix[t]);
      }
      toast.success('Plan entitlement matrix updated across all tiers.');
    } catch (err) {
      toast.error('Failed to save plan entitlement matrix.');
    } finally {
      setSavingPlanMatrix(false);
    }
  };

  const handleSetTenantOverride = (key: FeatureFlagKey, value: 'INHERIT' | 'ENABLED' | 'DISABLED') => {
    setTenantOverrides(prev => {
      const updated = { ...prev };
      if (value === 'INHERIT') {
        delete updated[key];
      } else {
        updated[key] = value === 'ENABLED';
      }
      return updated;
    });
  };

  const handleSaveTenantOverrides = async () => {
    if (!selectedTenantId) return;
    setSavingTenantOverrides(true);
    try {
      await entitlementService.updateTenantFeatureOverrides(selectedTenantId, tenantOverrides);
      toast.success('Tenant-specific feature overrides saved.');
      await loadTenantSpecificData(selectedTenantId);
      if (onRefreshData) onRefreshData();
    } catch (err) {
      toast.error('Failed to save tenant overrides.');
    } finally {
      setSavingTenantOverrides(false);
    }
  };

  const handleScheduleDowngrade = async () => {
    if (!selectedTenantId) return;
    const matched = tenants.find(t => (t.tenantId || t.id) === selectedTenantId);
    const currentPlan: SubscriptionTier = matched?.plan || 'PRO';

    setSchedulingDowngrade(true);
    try {
      const scheduled = await entitlementService.scheduleDowngrade(
        selectedTenantId,
        currentPlan,
        downgradeTargetPlan,
        new Date(downgradeCycleDate).toISOString(),
        'SUPER_ADMIN',
        'Customer requested tier reduction at cycle renewal'
      );
      setTenantPendingDowngrade(scheduled);
      toast.success(`Downgrade to ${downgradeTargetPlan} scheduled with grace period until ${downgradeCycleDate}.`);
      await loadTenantSpecificData(selectedTenantId);
      if (onRefreshData) onRefreshData();
    } catch (err) {
      toast.error('Failed to schedule mid-cycle downgrade.');
    } finally {
      setSchedulingDowngrade(false);
    }
  };

  const handleCancelDowngrade = async () => {
    if (!selectedTenantId) return;
    try {
      await entitlementService.cancelDowngrade(selectedTenantId);
      setTenantPendingDowngrade(null);
      toast.success('Scheduled downgrade cancelled. Active plan continues uninterrupted.');
      await loadTenantSpecificData(selectedTenantId);
      if (onRefreshData) onRefreshData();
    } catch (err) {
      toast.error('Failed to cancel downgrade.');
    }
  };

  const filteredTenants = tenants.filter(t => 
    (t.companyName || t.name || '').toLowerCase().includes(tenantSearch.toLowerCase()) ||
    (t.tenantId || t.id || '').toLowerCase().includes(tenantSearch.toLowerCase())
  );

  const selectedTenantObj = tenants.find(t => (t.tenantId || t.id) === selectedTenantId);

  return (
    <div className="space-y-6">
      {/* Sub navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setSubTab('PLANS')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shrink-0 ${
              subTab === 'PLANS'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Layers size={15} />
            <span>Plan Entitlements Matrix (Level 2)</span>
          </button>

          <button
            onClick={() => setSubTab('TENANTS')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shrink-0 ${
              subTab === 'TENANTS'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Building2 size={15} />
            <span>Tenant Overrides & Grace Periods (Level 3)</span>
          </button>

          <button
            onClick={() => setSubTab('GLOBAL')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shrink-0 ${
              subTab === 'GLOBAL'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Shield size={15} />
            <span>Global Defaults (Level 1)</span>
          </button>
        </div>

        <button
          onClick={loadAllFlags}
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors text-xs flex items-center gap-1 font-medium"
          title="Refresh configurations"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Precedence Banner */}
      <div className="bg-slate-900 text-slate-200 p-4 rounded-2xl border border-slate-800 text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
            <Sliders size={18} />
          </div>
          <div>
            <div className="font-bold text-white text-sm">Server-Enforced Precedence Resolution</div>
            <div className="text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
              <span className="text-amber-400 font-semibold">1. Tenant Override</span>
              <span>&gt;</span>
              <span className="text-blue-400 font-semibold">2. Plan Tier Matrix</span>
              <span>&gt;</span>
              <span className="text-slate-300">3. Global Default</span>
              <span>&gt;</span>
              <span className="text-red-400 font-semibold">4. Fail-Closed Fallback (Deny)</span>
            </div>
          </div>
        </div>
        <div className="text-[11px] text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
          Cached client-side with 5 min TTL • Zero per-render API calls
        </div>
      </div>

      {/* SUB-TAB 1: PLAN ENTITLEMENT MATRIX */}
      {subTab === 'PLANS' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Plan-Level Feature Entitlements Matrix</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Toggle feature entitlements per subscription tier. Tenancy rules derive capabilities from this matrix unless explicitly overridden.
              </p>
            </div>
            <button
              onClick={handleSavePlanMatrix}
              disabled={savingPlanMatrix}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Save size={14} />
              <span>{savingPlanMatrix ? 'Saving Changes...' : 'Save Plan Matrix'}</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-3.5 pl-5 font-bold text-slate-700 uppercase tracking-wider text-[11px]">Feature</th>
                  <th className="p-3.5 font-bold text-slate-700 uppercase tracking-wider text-[11px] text-center w-28">FREE</th>
                  <th className="p-3.5 font-bold text-slate-700 uppercase tracking-wider text-[11px] text-center w-28 bg-blue-50/50">TRIAL</th>
                  <th className="p-3.5 font-bold text-slate-700 uppercase tracking-wider text-[11px] text-center w-28">STARTER</th>
                  <th className="p-3.5 font-bold text-slate-700 uppercase tracking-wider text-[11px] text-center w-28 bg-purple-50/50">PRO</th>
                  <th className="p-3.5 font-bold text-slate-700 uppercase tracking-wider text-[11px] text-center w-28 bg-amber-50/50 pr-5">ENTERPRISE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ALL_FEATURE_FLAGS.map((flag) => (
                  <tr key={flag.key} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 pl-5">
                      <div className="font-semibold text-slate-900">{flag.label}</div>
                      <div className="text-[11px] text-slate-500 max-w-md mt-0.5">{flag.description}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-slate-100 text-slate-600">
                          {flag.key}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Min: <strong className="text-slate-600">{flag.minRecommendedTier}</strong>
                        </span>
                      </div>
                    </td>

                    {(['FREE', 'TRIAL', 'STARTER', 'PRO', 'ENTERPRISE'] as SubscriptionTier[]).map((tier) => {
                      const isEnabled = Boolean(planMatrix[tier]?.[flag.key]);
                      return (
                        <td key={tier} className="p-3 text-center align-middle">
                          <button
                            type="button"
                            onClick={() => handleTogglePlanFeature(tier, flag.key)}
                            className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center mx-auto transition-all ${
                              isEnabled 
                                ? 'bg-emerald-500 text-white shadow-xs scale-100 hover:bg-emerald-600' 
                                : 'bg-slate-100 text-slate-300 hover:bg-slate-200'
                            }`}
                            title={`Toggle ${flag.label} for ${tier}`}
                          >
                            {isEnabled ? <Check size={16} strokeWidth={3} /> : <X size={14} />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: TENANT OVERRIDES & GRACE PERIODS */}
      {subTab === 'TENANTS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tenant Selector */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 h-fit">
            <h4 className="font-bold text-slate-900 text-sm mb-2">Select Factory / Tenant</h4>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
              <input
                type="text"
                value={tenantSearch}
                onChange={e => setTenantSearch(e.target.value)}
                placeholder="Search tenant name or ID..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1 max-h-[460px] overflow-y-auto pr-1 scrollbar-thin">
              {filteredTenants.map(t => {
                const tId = t.tenantId || t.id;
                const isSelected = tId === selectedTenantId;
                return (
                  <button
                    key={tId}
                    onClick={() => setSelectedTenantId(tId)}
                    className={`w-full text-left p-2.5 rounded-xl text-xs transition-colors border ${
                      isSelected
                        ? 'bg-blue-50 border-blue-200 text-blue-900 font-semibold'
                        : 'bg-white hover:bg-slate-50 border-transparent text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate font-medium">{t.companyName || t.name || 'Unnamed Org'}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase bg-slate-200/80 text-slate-700">
                        {t.plan || 'STARTER'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5 font-mono">
                      ID: {tId}
                    </div>
                    {t.pendingDowngrade && (
                      <div className="mt-1 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                        <Clock size={10} />
                        <span>Downgrade Pending</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Overrides & Grace Period Management */}
          <div className="lg:col-span-2 space-y-6">
            {/* Active Downgrade / Grace Period Box */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-amber-600" />
                  <h4 className="font-bold text-slate-900 text-sm">Mid-Cycle Downgrade & Grace Period</h4>
                </div>
                {tenantPendingDowngrade && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-mono">
                    GRACE PERIOD ACTIVE
                  </span>
                )}
              </div>

              {tenantPendingDowngrade ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-amber-900">
                        Scheduled Transition: {tenantPendingDowngrade.currentPlan} &rarr; {tenantPendingDowngrade.targetPlan}
                      </div>
                      <p className="text-amber-800 mt-0.5">
                        Features remain evaluated at <strong>{tenantPendingDowngrade.currentPlan}</strong> until billing cycle date:{' '}
                        <strong>{new Date(tenantPendingDowngrade.effectiveDate).toLocaleDateString()}</strong>.
                      </p>
                    </div>
                    <button
                      onClick={handleCancelDowngrade}
                      className="px-3 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-lg text-xs"
                    >
                      Cancel Downgrade
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-xs space-y-3">
                  <p className="text-slate-600">
                    Schedule a future tier downgrade at the end of the billing cycle without immediately revoking client capabilities.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Target Tier</label>
                      <select
                        value={downgradeTargetPlan}
                        onChange={e => setDowngradeTargetPlan(e.target.value as SubscriptionTier)}
                        className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                      >
                        <option value="FREE">FREE</option>
                        <option value="TRIAL">TRIAL</option>
                        <option value="STARTER">STARTER</option>
                        <option value="PRO">PRO</option>
                        <option value="ENTERPRISE">ENTERPRISE</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Cycle End Date</label>
                      <input
                        type="date"
                        value={downgradeCycleDate}
                        onChange={e => setDowngradeCycleDate(e.target.value)}
                        className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                      />
                    </div>

                    <button
                      onClick={handleScheduleDowngrade}
                      disabled={schedulingDowngrade}
                      className="w-full p-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs transition-colors"
                    >
                      {schedulingDowngrade ? 'Scheduling...' : 'Schedule Downgrade'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Overrides Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    Tenant Feature Overrides (Level 3 Precedence)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Applying an override here strictly supersedes the global default and plan tier configuration.
                  </p>
                </div>
                <button
                  onClick={handleSaveTenantOverrides}
                  disabled={savingTenantOverrides}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <Save size={14} />
                  <span>{savingTenantOverrides ? 'Saving...' : 'Save Tenant Overrides'}</span>
                </button>
              </div>

              <div className="space-y-3">
                {ALL_FEATURE_FLAGS.map((flag) => {
                  const overrideVal = tenantOverrides[flag.key];
                  const resolution = selectedTenantEntitlements?.[flag.key];
                  const isEffectiveEnabled = resolution ? resolution.enabled : false;

                  return (
                    <div
                      key={flag.key}
                      className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="max-w-md">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{flag.label}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                            isEffectiveEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {isEffectiveEnabled ? 'ENABLED' : 'DENIED'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Source: <strong className="text-slate-700">{resolution?.source || 'PLAN_OVERRIDE'}</strong>
                        </div>
                      </div>

                      {/* Tri-state button selector */}
                      <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSetTenantOverride(flag.key, 'INHERIT')}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                            overrideVal === undefined
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Inherit Plan
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetTenantOverride(flag.key, 'ENABLED')}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                            overrideVal === true
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Force Enable
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetTenantOverride(flag.key, 'DISABLED')}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                            overrideVal === false
                              ? 'bg-red-600 text-white shadow-xs'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Force Disable
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: GLOBAL DEFAULTS */}
      {subTab === 'GLOBAL' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Global Feature Flag Platform Defaults (Level 1)</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Baseline platform-wide defaults. These apply when no plan-level or tenant-level override exists.
              </p>
            </div>
            <button
              onClick={handleSaveGlobal}
              disabled={savingGlobal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Save size={14} />
              <span>{savingGlobal ? 'Saving Changes...' : 'Save Global Defaults'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ALL_FEATURE_FLAGS.map((flag) => {
              const isChecked = Boolean(globalFlags[flag.key]);
              return (
                <div
                  key={flag.key}
                  className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-start justify-between gap-4"
                >
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{flag.label}</div>
                    <div className="text-xs text-slate-500 mt-1 leading-relaxed">{flag.description}</div>
                    <div className="mt-2 text-[10px] font-mono text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200 inline-block">
                      {flag.key}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setGlobalFlags(prev => ({ ...prev, [flag.key]: !prev[flag.key] }))}
                    className={`w-12 h-6 rounded-full transition-colors relative shrink-0 p-0.5 ${
                      isChecked ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      isChecked ? 'translate-x-6' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
