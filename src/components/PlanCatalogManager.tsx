// src/components/PlanCatalogManager.tsx
import React, { useState, useEffect } from 'react';
import { 
  Crown, Plus, Search, Shield, Lock, Eye, EyeOff, Check, X, 
  History, ArrowRight, AlertTriangle, CheckCircle2, RefreshCw, 
  FileText, IndianRupee, Layers, Tag, Percent, Trash2, Edit3, 
  ExternalLink, Sparkles, Building2, ChevronDown, ChevronRight,
  ShieldCheck, Info, Filter, Globe, Save
} from 'lucide-react';
import { planCatalogService } from '../services/planCatalogService';
import { 
  Plan, 
  PlanVersion, 
  PlanMutationAuditLog, 
  CATALOG_FEATURE_FLAGS, 
  PlanCategory 
} from '../types/planCatalog';
import { SubscriptionTier, PlanLimits } from '../types/index';
import { useToast } from '../contexts/ToastContext';

interface PlanCatalogManagerProps {
  actor: { uid: string; email: string; role: string };
  globalPlans: Record<SubscriptionTier, PlanLimits> | null;
  onSaveGlobalPlans: () => Promise<void>;
  onGlobalPlanEdit: (tier: SubscriptionTier, field: keyof PlanLimits, value: any) => void;
  savingGlobalPlans: boolean;
}

export const PlanCatalogManager: React.FC<PlanCatalogManagerProps> = ({
  actor,
  globalPlans,
  onSaveGlobalPlans,
  onGlobalPlanEdit,
  savingGlobalPlans
}) => {
  const { toast } = useToast();

  const [subTab, setSubTab] = useState<'CATALOG' | 'E15_AUDIT' | 'LEGACY_LIMITS'>('CATALOG');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [auditLogs, setAuditLogs] = useState<PlanMutationAuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [subCounts, setSubCounts] = useState<Record<string, number>>({});

  // Filter & Search
  const [filter, setFilter] = useState<'ALL' | 'PUBLIC' | 'ACTIVE' | 'ARCHIVED'>('ALL');
  const [search, setSearch] = useState<string>('');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [historyModalOpen, setHistoryModalOpen] = useState<boolean>(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  // Expanded audit diff state
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Form states
  const [createForm, setCreateForm] = useState<{
    code: string;
    name: string;
    description: string;
    category: PlanCategory;
    isPublic: boolean;
    isActive: boolean;
    isCustomQuote: boolean;
    monthlyPrice: string;
    annualPrice: string;
    isUnlimitedCap: boolean;
    employeeCap: string;
    overageRate: string;
    gstRate: string;
    badge: string;
    sortOrder: string;
    featureFlags: string[];
    changeNotes: string;
  }>({
    code: '',
    name: '',
    description: '',
    category: 'STANDARD',
    isPublic: true,
    isActive: true,
    isCustomQuote: false,
    monthlyPrice: '1999',
    annualPrice: '19990',
    isUnlimitedCap: false,
    employeeCap: '50',
    overageRate: '45',
    gstRate: '18',
    badge: '',
    sortOrder: '5',
    featureFlags: ['attendance', 'reports_basic', 'kiosk'],
    changeNotes: 'Initial plan launch configuration'
  });

  const [editForm, setEditForm] = useState<{
    name: string;
    description: string;
    category: PlanCategory;
    isPublic: boolean;
    isActive: boolean;
    isCustomQuote: boolean;
    monthlyPrice: string;
    annualPrice: string;
    isUnlimitedCap: boolean;
    employeeCap: string;
    overageRate: string;
    gstRate: string;
    badge: string;
    sortOrder: string;
    featureFlags: string[];
    changeNotes: string;
  }>({
    name: '',
    description: '',
    category: 'STANDARD',
    isPublic: true,
    isActive: true,
    isCustomQuote: false,
    monthlyPrice: '',
    annualPrice: '',
    isUnlimitedCap: false,
    employeeCap: '',
    overageRate: '',
    gstRate: '18',
    badge: '',
    sortOrder: '1',
    featureFlags: [],
    changeNotes: ''
  });

  useEffect(() => {
    loadCatalogData();
  }, []);

  const loadCatalogData = async () => {
    try {
      setLoading(true);
      const [allPlans, allLogs] = await Promise.all([
        planCatalogService.getAllPlans(true),
        planCatalogService.getAuditLogs()
      ]);

      setPlans(allPlans);
      setAuditLogs(allLogs);

      // Compute active subscribers per plan
      const counts: Record<string, number> = {};
      for (const p of allPlans) {
        counts[p.id] = await planCatalogService.getActiveSubscriptionCount(p.id, p.code);
      }
      setSubCounts(counts);
    } catch (err) {
      console.error('Error loading plan catalog data:', err);
      toast.error('Failed to load plan catalog');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (plan: Plan) => {
    setSelectedPlan(plan);
    const ver = planCatalogService.getCurrentVersion(plan);
    const isQuote = ver.monthlyPrice === null;
    const isUnlimited = ver.employeeCap === null;

    setEditForm({
      name: plan.name,
      description: plan.description,
      category: plan.category,
      isPublic: plan.isPublic,
      isActive: plan.isActive,
      isCustomQuote: isQuote,
      monthlyPrice: isQuote ? '' : String(ver.monthlyPrice ?? 0),
      annualPrice: isQuote ? '' : String(ver.annualPrice ?? (ver.monthlyPrice ? ver.monthlyPrice * 10 : 0)),
      isUnlimitedCap: isUnlimited,
      employeeCap: isUnlimited ? '' : String(ver.employeeCap ?? 10),
      overageRate: String(ver.overageRate ?? 0),
      gstRate: String(ver.gstRate ?? 18),
      badge: plan.badge || '',
      sortOrder: String(plan.sortOrder || 1),
      featureFlags: [...ver.featureFlags],
      changeNotes: ''
    });
    setEditModalOpen(true);
  };

  const handleOpenHistory = (plan: Plan) => {
    setSelectedPlan(plan);
    setHistoryModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawCode = createForm.code.trim().toUpperCase().replace(/\s+/g, '_');
    if (!rawCode) {
      toast.error('Plan code is required');
      return;
    }
    if (!createForm.name.trim()) {
      toast.error('Plan name is required');
      return;
    }

    try {
      const monthlyPrice = createForm.isCustomQuote ? null : Number(createForm.monthlyPrice);
      const annualPrice = createForm.isCustomQuote 
        ? null 
        : createForm.annualPrice 
          ? Number(createForm.annualPrice) 
          : (monthlyPrice !== null ? monthlyPrice * 10 : null);
      const employeeCap = createForm.isUnlimitedCap ? null : Number(createForm.employeeCap);
      const overageRate = createForm.isCustomQuote ? null : Number(createForm.overageRate || 0);
      const gstRate = Number(createForm.gstRate || 18);

      await planCatalogService.createPlan({
        code: rawCode,
        name: createForm.name,
        description: createForm.description,
        category: createForm.category,
        isPublic: createForm.isPublic,
        isActive: createForm.isActive,
        monthlyPrice,
        annualPrice,
        employeeCap,
        overageRate,
        gstRate,
        badge: createForm.badge,
        sortOrder: Number(createForm.sortOrder || 99),
        featureFlags: createForm.featureFlags,
        changeNotes: createForm.changeNotes
      }, actor);

      toast.success(`Plan "${rawCode}" created successfully (v1)`);
      setCreateModalOpen(false);
      loadCatalogData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create plan');
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;

    try {
      const monthlyPrice = editForm.isCustomQuote ? null : Number(editForm.monthlyPrice);
      const annualPrice = editForm.isCustomQuote 
        ? null 
        : editForm.annualPrice 
          ? Number(editForm.annualPrice) 
          : (monthlyPrice !== null ? monthlyPrice * 10 : null);
      const employeeCap = editForm.isUnlimitedCap ? null : Number(editForm.employeeCap);
      const overageRate = editForm.isCustomQuote ? null : Number(editForm.overageRate || 0);
      const gstRate = Number(editForm.gstRate || 18);

      const updated = await planCatalogService.updatePlan(selectedPlan.id, {
        name: editForm.name,
        description: editForm.description,
        category: editForm.category,
        isPublic: editForm.isPublic,
        isActive: editForm.isActive,
        badge: editForm.badge,
        sortOrder: Number(editForm.sortOrder || 1),
        monthlyPrice,
        annualPrice,
        employeeCap,
        overageRate,
        gstRate,
        featureFlags: editForm.featureFlags,
        changeNotes: editForm.changeNotes
      }, actor);

      toast.success(`Plan "${updated.code}" updated (now at v${updated.currentVersion})`);
      setEditModalOpen(false);
      loadCatalogData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update plan');
    }
  };

  const handleToggleActive = async (plan: Plan) => {
    try {
      const next = !plan.isActive;
      await planCatalogService.togglePlanActive(plan.id, next, actor);
      toast.success(`Plan ${plan.code} is now ${next ? 'Active' : 'Inactive (Hidden from public pricing)'}`);
      loadCatalogData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update plan active status');
    }
  };

  const handleTogglePublic = async (plan: Plan) => {
    try {
      const next = !plan.isPublic;
      await planCatalogService.togglePlanPublic(plan.id, next, actor);
      toast.success(`Plan ${plan.code} is now ${next ? 'Public on pricing page' : 'Private'}`);
      loadCatalogData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update public status');
    }
  };

  const handleDeletePlan = async (plan: Plan) => {
    const activeSubscribers = subCounts[plan.id] || 0;

    if (activeSubscribers > 0) {
      // Edge Case: Hard delete is blocked while Subscription references it
      const confirmSoft = window.confirm(
        `BLOCKED: Plan "${plan.code}" has ${activeSubscribers} active tenant subscriptions!\n\n` +
        `To protect tenant billing invariants, hard-deleting an in-use plan is strictly prevented.\n\n` +
        `Would you like to SOFT-DELETE this plan instead? This safely hides it from the catalog while keeping existing tenant subscriptions intact.`
      );
      if (confirmSoft) {
        try {
          await planCatalogService.softDeletePlan(plan.id, actor);
          toast.success(`Plan "${plan.code}" soft-deleted successfully.`);
          loadCatalogData();
        } catch (err: any) {
          toast.error(err.message || 'Failed to soft delete');
        }
      }
      return;
    }

    const confirmHard = window.confirm(`Permanently remove unreferenced plan "${plan.code}" from catalog?`);
    if (confirmHard) {
      try {
        await planCatalogService.hardDeletePlan(plan.id, actor);
        toast.success(`Plan "${plan.code}" deleted permanently.`);
        loadCatalogData();
      } catch (err: any) {
        toast.error(err.message || 'Failed to delete plan');
      }
    }
  };

  const toggleFlagSelection = (flagCode: string, isCreate: boolean) => {
    if (isCreate) {
      setCreateForm(prev => ({
        ...prev,
        featureFlags: prev.featureFlags.includes(flagCode)
          ? prev.featureFlags.filter(f => f !== flagCode)
          : [...prev.featureFlags, flagCode]
      }));
    } else {
      setEditForm(prev => ({
        ...prev,
        featureFlags: prev.featureFlags.includes(flagCode)
          ? prev.featureFlags.filter(f => f !== flagCode)
          : [...prev.featureFlags, flagCode]
      }));
    }
  };

  // Filter plans
  const filteredPlans = plans.filter(p => {
    if (filter === 'ACTIVE') return p.isActive && !p.isDeleted;
    if (filter === 'PUBLIC') return p.isPublic && p.isActive && !p.isDeleted;
    if (filter === 'ARCHIVED') return p.isDeleted || !p.isActive;
    return !p.isDeleted;
  }).filter(p => {
    if (!search) return true;
    const term = search.toLowerCase();
    return p.code.toLowerCase().includes(term) || p.name.toLowerCase().includes(term) || p.description.toLowerCase().includes(term);
  });

  const totalPublicActive = plans.filter(p => p.isPublic && p.isActive && !p.isDeleted).length;
  const totalSubscribers = Object.values(subCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="max-w-6xl mx-auto -mt-16 px-4 space-y-6">
      
      {/* TOP KPI SUMMARY STATS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl mr-3.5"><Layers size={22} /></div>
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Catalog Plans</p>
            <h4 className="text-base font-extrabold text-slate-800">{plans.filter(p => !p.isDeleted).length} Defined</h4>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl mr-3.5"><Globe size={22} /></div>
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Public Live Plans</p>
            <h4 className="text-base font-extrabold text-slate-800">{totalPublicActive} Live in Pricing</h4>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl mr-3.5"><Building2 size={22} /></div>
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Active Subscribers</p>
            <h4 className="text-base font-extrabold text-slate-800">{totalSubscribers} Tenant Subs</h4>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl mr-3.5"><FileText size={22} /></div>
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">E15 Audit Entries</p>
            <h4 className="text-base font-extrabold text-slate-800">{auditLogs.length} Mutations</h4>
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER */}
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        
        {/* NAV HEADER */}
        <div className="p-4 md:p-5 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/50">
          <div>
            <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
              <Crown size={20} className="text-indigo-600" /> Plan Catalog &amp; Dynamic Pricing Engine
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Create, version, and edit subscription plans without code deployments. All changes versioned and grandfathered.
            </p>
          </div>

          <div className="flex bg-white rounded-xl p-1 border border-gray-200 shadow-xs overflow-x-auto w-full md:w-auto">
            <button
              onClick={() => setSubTab('CATALOG')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                subTab === 'CATALOG' ? 'bg-indigo-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Layers size={14} /> Plan Catalog ({plans.filter(p => !p.isDeleted).length})
            </button>
            <button
              onClick={() => setSubTab('E15_AUDIT')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                subTab === 'E15_AUDIT' ? 'bg-indigo-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FileText size={14} /> E15 Mutation Audit ({auditLogs.length})
            </button>
            <button
              onClick={() => setSubTab('LEGACY_LIMITS')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                subTab === 'LEGACY_LIMITS' ? 'bg-indigo-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <ShieldCheck size={14} /> System Limit Fallbacks
            </button>
          </div>
        </div>

        {/* SUBTAB 1: PLAN CATALOG CRUD */}
        {subTab === 'CATALOG' && (
          <div className="p-4 md:p-6 space-y-6">
            
            {/* ACTION BAR & FILTER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search size={14} className="absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by code, title, tags..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <select
                  value={filter}
                  onChange={e => setFilter(e.target.value as any)}
                  className="py-2 px-3 text-xs border border-gray-200 rounded-xl bg-gray-50 font-bold text-gray-700"
                >
                  <option value="ALL">All Defined Plans</option>
                  <option value="PUBLIC">Public &amp; Active (Live on Pricing)</option>
                  <option value="ACTIVE">All Active</option>
                  <option value="ARCHIVED">Archived / Hidden</option>
                </select>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <button
                  onClick={loadCatalogData}
                  className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600"
                  title="Reload from local storage"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5"
                >
                  <Plus size={15} /> Create New Plan
                </button>
              </div>
            </div>

            {/* PLANS LIST */}
            {filteredPlans.length === 0 ? (
              <div className="text-center py-16 bg-gray-50 rounded-2xl border border-gray-200">
                <Crown size={32} className="mx-auto text-gray-400 mb-2" />
                <p className="text-sm font-bold text-gray-700">No matching plans found</p>
                <p className="text-xs text-gray-400 mt-1">Try adjusting your search criteria or create a new plan.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filteredPlans.map(plan => {
                  const currentVer = planCatalogService.getCurrentVersion(plan);
                  const isQuote = currentVer.monthlyPrice === null;
                  const subscribers = subCounts[plan.id] || 0;

                  return (
                    <div 
                      key={plan.id}
                      className={`p-5 rounded-2xl border transition-all bg-white flex flex-col justify-between ${
                        plan.isActive 
                          ? 'border-gray-200 shadow-xs hover:border-indigo-300' 
                          : 'border-gray-200 bg-gray-50/60 opacity-80'
                      }`}
                    >
                      <div>
                        {/* CARD HEADER */}
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-gray-900 text-base">{plan.name}</h3>
                              <span className="font-mono text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100 flex items-center gap-1">
                                <Lock size={10} className="text-indigo-400" /> {plan.code}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                              {plan.description}
                            </p>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-900 text-white">
                              v{currentVer.version}
                            </span>
                            {plan.badge && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                                {plan.badge}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* COMMERCIAL TERMS STRIP */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-4 p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs font-mono">
                          <div>
                            <span className="text-[10px] text-gray-400 font-sans block font-semibold uppercase">Monthly</span>
                            <span className="font-bold text-gray-900">
                              {isQuote ? 'Quote' : `₹${currentVer.monthlyPrice}`}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-gray-400 font-sans block font-semibold uppercase">Annual (2m free)</span>
                            <span className="font-bold text-gray-900">
                              {isQuote ? 'Quote' : `₹${currentVer.annualPrice ?? (currentVer.monthlyPrice ? currentVer.monthlyPrice * 10 : 0)}`}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-gray-400 font-sans block font-semibold uppercase">Employee Cap</span>
                            <span className="font-bold text-gray-900">
                              {currentVer.employeeCap === null ? 'Unlimited' : `${currentVer.employeeCap} staff`}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-gray-400 font-sans block font-semibold uppercase">Overage / GST</span>
                            <span className="font-bold text-gray-900">
                              {currentVer.overageRate ? `₹${currentVer.overageRate}` : '₹0'} / {currentVer.gstRate}%
                            </span>
                          </div>
                        </div>

                        {/* FEATURE FLAGS TAGS */}
                        <div className="space-y-1.5 mb-4">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            Active Features ({currentVer.featureFlags.length})
                          </p>
                          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                            {currentVer.featureFlags.map(f => (
                              <span key={f} className="text-[11px] font-medium px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md border border-slate-200">
                                {f}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* STATUS BADGES & SUBSCRIBERS */}
                        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100 text-xs">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            plan.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {plan.isActive ? 'Active' : 'Inactive'}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            plan.isPublic ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-700'
                          }`}>
                            {plan.isPublic ? 'Public on Pricing' : 'Private'}
                          </span>
                          <span className="text-[11px] text-gray-500 font-medium ml-auto font-mono">
                            {subscribers} {subscribers === 1 ? 'Subscriber' : 'Subscribers'}
                          </span>
                        </div>
                      </div>

                      {/* CARD ACTIONS */}
                      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleToggleActive(plan)}
                            className="px-2.5 py-1 text-[11px] font-bold border border-gray-200 hover:bg-gray-100 rounded-lg text-gray-700 transition-colors"
                            title="Toggling active to false hides from public pricing without breaking current subscribers."
                          >
                            {plan.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => handleTogglePublic(plan)}
                            className="px-2.5 py-1 text-[11px] font-bold border border-gray-200 hover:bg-gray-100 rounded-lg text-gray-700 transition-colors"
                          >
                            {plan.isPublic ? 'Hide Public' : 'Make Public'}
                          </button>
                          <button
                            onClick={() => handleOpenHistory(plan)}
                            className="px-2.5 py-1 text-[11px] font-bold border border-gray-200 hover:bg-gray-100 rounded-lg text-gray-700 transition-colors flex items-center gap-1"
                            title="View all version history"
                          >
                            <History size={12} /> {plan.versions.length} {plan.versions.length === 1 ? 'Ver' : 'Vers'}
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(plan)}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                          >
                            <Edit3 size={13} /> Edit / Version
                          </button>
                          <button
                            onClick={() => handleDeletePlan(plan)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete Plan (Blocked if subscribers exist)"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 2: E15 AUDIT TRAIL EXPLORER */}
        {subTab === 'E15_AUDIT' && (
          <div className="p-4 md:p-6 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <FileText size={16} className="text-indigo-600" /> E15 Plan Mutation Audit Trail
                </h3>
                <p className="text-xs text-gray-500">
                  Immutable records of every plan creation, version bump, price alteration, and activation with before/after state diffs.
                </p>
              </div>
              <span className="text-xs font-mono text-gray-400">{auditLogs.length} total events logged</span>
            </div>

            {auditLogs.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
                <FileText size={32} className="mx-auto text-gray-400 mb-2" />
                <p className="text-sm font-bold text-gray-700">No mutations recorded yet</p>
                <p className="text-xs text-gray-400 mt-1">Plan changes will be recorded here automatically with full beforeState/afterState.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {auditLogs.map(log => {
                  const isExpanded = expandedLogId === log.id;

                  return (
                    <div 
                      key={log.id}
                      className="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-2xs transition-all"
                    >
                      <div 
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="p-3.5 flex flex-col md:flex-row justify-between md:items-center gap-3 cursor-pointer hover:bg-gray-50/70"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-mono">
                              {log.action}
                            </span>
                            <span className="font-bold font-mono text-xs text-gray-900">
                              {log.planCode} {log.versionNumber ? `(v${log.versionNumber})` : ''}
                            </span>
                            <span className="text-gray-300">•</span>
                            <span className="text-xs text-gray-500 font-mono">
                              {new Date(log.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-gray-800">{log.summary}</p>
                          <p className="text-[11px] text-gray-500 font-mono mt-1">
                            Actor: <strong>{log.actorEmail}</strong> ({log.actorRole})
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-indigo-600 font-semibold flex items-center gap-1">
                            {isExpanded ? 'Hide State Diff' : 'Inspect State Diff'}
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                        </div>
                      </div>

                      {/* EXPANDABLE BEFORE / AFTER STATE DIFF */}
                      {isExpanded && (
                        <div className="p-4 bg-slate-900 text-slate-100 border-t border-slate-800 text-xs font-mono grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="flex items-center justify-between pb-1 mb-2 border-b border-slate-700 text-[11px] text-slate-400 font-bold uppercase">
                              <span>beforeState</span>
                              <span>{log.beforeState ? 'Snapshot' : 'Initial (null)'}</span>
                            </div>
                            <pre className="max-h-60 overflow-y-auto bg-black/40 p-3 rounded-lg text-[11px] text-amber-300 leading-tight">
                              {JSON.stringify(log.beforeState, null, 2) || '// No previous state (New creation)'}
                            </pre>
                          </div>
                          <div>
                            <div className="flex items-center justify-between pb-1 mb-2 border-b border-slate-700 text-[11px] text-slate-400 font-bold uppercase">
                              <span>afterState</span>
                              <span className="text-emerald-400">Mutated Version</span>
                            </div>
                            <pre className="max-h-60 overflow-y-auto bg-black/40 p-3 rounded-lg text-[11px] text-emerald-300 leading-tight">
                              {JSON.stringify(log.afterState, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 3: LEGACY CAPACITY MATRIX */}
        {subTab === 'LEGACY_LIMITS' && globalPlans && (
          <div className="p-4 md:p-6 space-y-6">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">System Capacity Matrix (Hardware Limits)</h3>
                <p className="text-xs text-gray-500">Fine-grained tier capacity limits for biometric kiosks, geofences, and shift managers.</p>
              </div>
              <button 
                onClick={onSaveGlobalPlans}
                disabled={savingGlobalPlans}
                className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-xs disabled:opacity-50"
              >
                {savingGlobalPlans ? 'Saving...' : 'Save Matrix'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(Object.keys(globalPlans) as SubscriptionTier[]).map((tier) => (
                <div key={tier} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="bg-slate-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
                    <span className="font-bold text-indigo-950 text-sm">{tier}</span>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Limits</span>
                  </div>
                  <div className="p-4 space-y-3 text-xs">
                    <div>
                      <label className="text-gray-600 block mb-1 font-medium">Max Workers</label>
                      <input 
                        type="number" 
                        value={globalPlans[tier].maxWorkers}
                        onChange={e => onGlobalPlanEdit(tier, 'maxWorkers', parseInt(e.target.value) || 0)}
                        className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-gray-600 block mb-1 font-medium">Max Managers</label>
                      <input 
                        type="number" 
                        value={globalPlans[tier].maxManagers}
                        onChange={e => onGlobalPlanEdit(tier, 'maxManagers', parseInt(e.target.value) || 0)}
                        className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-gray-600 block mb-1 font-medium">Max Shifts</label>
                      <input 
                        type="number" 
                        value={globalPlans[tier].maxShifts}
                        onChange={e => onGlobalPlanEdit(tier, 'maxShifts', parseInt(e.target.value) || 0)}
                        className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg font-mono"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* CREATE NEW PLAN MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-6 shadow-2xl relative my-8 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setCreateModalOpen(false)} 
              className="absolute top-4 right-4 bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200"
            >
              <X size={18} />
            </button>

            <div className="mb-5 pb-3 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Plus size={18} className="text-indigo-600" /> Create New Subscription Plan
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Define commercial pricing, workforce limits, and bundle feature flags. Code is immutable once saved.
              </p>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Plan Code <span className="text-rose-500">*</span>
                    <span className="text-[10px] text-gray-400 font-normal ml-1">(Immutable after creation)</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. REGIONAL_MUMBAI, PROMO_Q4"
                    value={createForm.code}
                    onChange={e => setCreateForm({ ...createForm, code: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
                    className="w-full p-2.5 text-xs font-mono font-bold border border-gray-200 rounded-xl bg-gray-50 uppercase focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Plan Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mumbai Regional Pilot"
                    value={createForm.name}
                    onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                    className="w-full p-2.5 text-xs font-bold border border-gray-200 rounded-xl bg-gray-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Target audience, intended factory size, and key benefit..."
                  value={createForm.description}
                  onChange={e => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full p-2.5 text-xs border border-gray-200 rounded-xl bg-gray-50 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* COMMERCIAL PRICING */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Commercial Pricing</h4>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-indigo-700">
                    <input
                      type="checkbox"
                      checked={createForm.isCustomQuote}
                      onChange={e => setCreateForm({ ...createForm, isCustomQuote: e.target.checked })}
                      className="rounded text-indigo-600"
                    />
                    Custom Quote (Enterprise)
                  </label>
                </div>

                {!createForm.isCustomQuote && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 block mb-1">Monthly Price (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={createForm.monthlyPrice}
                        onChange={e => setCreateForm({ ...createForm, monthlyPrice: e.target.value })}
                        className="w-full p-2 text-xs font-mono font-bold border border-gray-200 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 block mb-1">Annual Price (₹)</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="10x monthly (2m free)"
                        value={createForm.annualPrice}
                        onChange={e => setCreateForm({ ...createForm, annualPrice: e.target.value })}
                        className="w-full p-2 text-xs font-mono font-bold border border-gray-200 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 block mb-1">Overage / Worker (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={createForm.overageRate}
                        onChange={e => setCreateForm({ ...createForm, overageRate: e.target.value })}
                        className="w-full p-2 text-xs font-mono border border-gray-200 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 block mb-1">GST Rate (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="28"
                        value={createForm.gstRate}
                        onChange={e => setCreateForm({ ...createForm, gstRate: e.target.value })}
                        className="w-full p-2 text-xs font-mono border border-gray-200 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* CAPACITY CAP */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-gray-700">Employee Cap</label>
                    <label className="text-[10px] text-indigo-700 font-bold flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createForm.isUnlimitedCap}
                        onChange={e => setCreateForm({ ...createForm, isUnlimitedCap: e.target.checked })}
                      />
                      Unlimited
                    </label>
                  </div>
                  <input
                    type="number"
                    disabled={createForm.isUnlimitedCap}
                    value={createForm.isUnlimitedCap ? '' : createForm.employeeCap}
                    onChange={e => setCreateForm({ ...createForm, employeeCap: e.target.value })}
                    placeholder={createForm.isUnlimitedCap ? 'Unlimited' : 'e.g. 50'}
                    className="w-full p-2 text-xs font-mono border border-gray-200 rounded-xl bg-gray-50 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Marketing Badge</label>
                  <input
                    type="text"
                    placeholder="e.g. Most Popular, 30% Off"
                    value={createForm.badge}
                    onChange={e => setCreateForm({ ...createForm, badge: e.target.value })}
                    className="w-full p-2 text-xs border border-gray-200 rounded-xl bg-gray-50"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={createForm.sortOrder}
                    onChange={e => setCreateForm({ ...createForm, sortOrder: e.target.value })}
                    className="w-full p-2 text-xs font-mono border border-gray-200 rounded-xl bg-gray-50"
                  />
                </div>
              </div>

              {/* TOGGLES */}
              <div className="flex items-center gap-6 p-3 bg-gray-50 rounded-xl text-xs font-bold text-gray-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createForm.isPublic}
                    onChange={e => setCreateForm({ ...createForm, isPublic: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span>Publish to Public Pricing Page</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createForm.isActive}
                    onChange={e => setCreateForm({ ...createForm, isActive: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span>Active for Subscriptions</span>
                </label>
              </div>

              {/* FEATURE FLAGS SELECTOR */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700 block">
                  Included Feature Flags ({createForm.featureFlags.length} selected)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-2 bg-gray-50 rounded-xl border border-gray-200">
                  {CATALOG_FEATURE_FLAGS.map(flag => {
                    const isSelected = createForm.featureFlags.includes(flag.code);
                    return (
                      <label 
                        key={flag.code} 
                        className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors text-xs ${
                          isSelected ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleFlagSelection(flag.code, true)}
                          className="mt-0.5 rounded text-indigo-600"
                        />
                        <div>
                          <span className="font-bold text-gray-900 block">{flag.label}</span>
                          <span className="text-[10px] text-gray-500 font-mono">{flag.code}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Release / Change Notes (E15 Audit)</label>
                <input
                  type="text"
                  placeholder="Reason for creating this plan..."
                  value={createForm.changeNotes}
                  onChange={e => setCreateForm({ ...createForm, changeNotes: e.target.value })}
                  className="w-full p-2.5 text-xs border border-gray-200 rounded-xl bg-gray-50"
                />
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs"
                >
                  Create Plan (v1)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PLAN / CREATE NEW VERSION MODAL */}
      {editModalOpen && selectedPlan && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-6 shadow-2xl relative my-8 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setEditModalOpen(false)} 
              className="absolute top-4 right-4 bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200"
            >
              <X size={18} />
            </button>

            <div className="mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-gray-900">Edit Plan: {selectedPlan.name}</h3>
                <span className="font-mono text-xs font-bold px-2 py-0.5 bg-gray-100 text-gray-800 rounded-md border flex items-center gap-1">
                  <Lock size={10} className="text-gray-400" /> {selectedPlan.code} (Immutable)
                </span>
                <span className="font-mono text-xs font-bold px-2 py-0.5 bg-indigo-600 text-white rounded-md">
                  Current v{selectedPlan.currentVersion}
                </span>
              </div>
              
              {/* VERSION PROTECTION NOTICE */}
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Version Invariant:</strong> Modifying pricing, caps, GST rate, or feature flags will automatically increment this plan to <strong>v{selectedPlan.currentVersion + 1}</strong> effective immediately. Existing subscribers remain <strong>price-grandfathered</strong> at their original agreed rate until they voluntarily migrate.
                </p>
              </div>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Plan Display Name</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full p-2.5 text-xs font-bold border border-gray-200 rounded-xl bg-gray-50"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full p-2.5 text-xs border border-gray-200 rounded-xl bg-gray-50"
                />
              </div>

              {/* COMMERCIAL PRICING */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Versioned Pricing</h4>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-indigo-700">
                    <input
                      type="checkbox"
                      checked={editForm.isCustomQuote}
                      onChange={e => setEditForm({ ...editForm, isCustomQuote: e.target.checked })}
                      className="rounded text-indigo-600"
                    />
                    Custom Quote (Enterprise)
                  </label>
                </div>

                {!editForm.isCustomQuote && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 block mb-1">Monthly Price (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={editForm.monthlyPrice}
                        onChange={e => setEditForm({ ...editForm, monthlyPrice: e.target.value })}
                        className="w-full p-2 text-xs font-mono font-bold border border-gray-200 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 block mb-1">Annual Price (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={editForm.annualPrice}
                        onChange={e => setEditForm({ ...editForm, annualPrice: e.target.value })}
                        className="w-full p-2 text-xs font-mono font-bold border border-gray-200 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 block mb-1">Overage / Worker (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={editForm.overageRate}
                        onChange={e => setEditForm({ ...editForm, overageRate: e.target.value })}
                        className="w-full p-2 text-xs font-mono border border-gray-200 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 block mb-1">GST Rate (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="28"
                        value={editForm.gstRate}
                        onChange={e => setEditForm({ ...editForm, gstRate: e.target.value })}
                        className="w-full p-2 text-xs font-mono border border-gray-200 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* CAPACITY CAP & BADGE */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-gray-700">Employee Cap</label>
                    <label className="text-[10px] text-indigo-700 font-bold flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.isUnlimitedCap}
                        onChange={e => setEditForm({ ...editForm, isUnlimitedCap: e.target.checked })}
                      />
                      Unlimited
                    </label>
                  </div>
                  <input
                    type="number"
                    disabled={editForm.isUnlimitedCap}
                    value={editForm.isUnlimitedCap ? '' : editForm.employeeCap}
                    onChange={e => setEditForm({ ...editForm, employeeCap: e.target.value })}
                    className="w-full p-2 text-xs font-mono border border-gray-200 rounded-xl bg-gray-50 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Marketing Badge</label>
                  <input
                    type="text"
                    value={editForm.badge}
                    onChange={e => setEditForm({ ...editForm, badge: e.target.value })}
                    className="w-full p-2 text-xs border border-gray-200 rounded-xl bg-gray-50"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={editForm.sortOrder}
                    onChange={e => setEditForm({ ...editForm, sortOrder: e.target.value })}
                    className="w-full p-2 text-xs font-mono border border-gray-200 rounded-xl bg-gray-50"
                  />
                </div>
              </div>

              {/* TOGGLES */}
              <div className="flex items-center gap-6 p-3 bg-gray-50 rounded-xl text-xs font-bold text-gray-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.isPublic}
                    onChange={e => setEditForm({ ...editForm, isPublic: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span>Public on Pricing Page</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={e => setEditForm({ ...editForm, isActive: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span>Active for Subscriptions</span>
                </label>
              </div>

              {/* FEATURE FLAGS */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700 block">
                  Included Feature Flags ({editForm.featureFlags.length} active)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-2 bg-gray-50 rounded-xl border border-gray-200">
                  {CATALOG_FEATURE_FLAGS.map(flag => {
                    const isSelected = editForm.featureFlags.includes(flag.code);
                    return (
                      <label 
                        key={flag.code} 
                        className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors text-xs ${
                          isSelected ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleFlagSelection(flag.code, false)}
                          className="mt-0.5 rounded text-indigo-600"
                        />
                        <div>
                          <span className="font-bold text-gray-900 block">{flag.label}</span>
                          <span className="text-[10px] text-gray-500 font-mono">{flag.code}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Change Reason / Release Notes <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Raised employee cap to 50, added WhatsApp integration..."
                  value={editForm.changeNotes}
                  onChange={e => setEditForm({ ...editForm, changeNotes: e.target.value })}
                  className="w-full p-2.5 text-xs border border-gray-200 rounded-xl bg-gray-50"
                />
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  <Save size={14} /> Save &amp; Create Version
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VERSION HISTORY MODAL */}
      {historyModalOpen && selectedPlan && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-6 shadow-2xl relative my-8 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setHistoryModalOpen(false)} 
              className="absolute top-4 right-4 bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200"
            >
              <X size={18} />
            </button>

            <div className="mb-5 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-gray-900">Version History: {selectedPlan.name}</h3>
                <span className="font-mono text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md">
                  {selectedPlan.code}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Chronological list of all released plan versions. Historical subscribers maintain their version price lock.
              </p>
            </div>

            <div className="space-y-4">
              {selectedPlan.versions.slice().reverse().map(ver => {
                const isCurrentActive = ver.version === selectedPlan.currentVersion;
                const isQuote = ver.monthlyPrice === null;

                return (
                  <div 
                    key={ver.version} 
                    className={`p-4 rounded-2xl border transition-all ${
                      isCurrentActive 
                        ? 'border-indigo-400 bg-indigo-50/30 ring-1 ring-indigo-400' 
                        : 'border-gray-200 bg-gray-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold font-mono px-2 py-0.5 rounded bg-slate-900 text-white">
                          v{ver.version}
                        </span>
                        {isCurrentActive ? (
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            Current Active
                          </span>
                        ) : (
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                            Superseded / Legacy
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 font-mono">
                        From: {new Date(ver.effectiveFrom).toLocaleDateString()}
                        {ver.effectiveTo ? ` — To: ${new Date(ver.effectiveTo).toLocaleDateString()}` : ' (Ongoing)'}
                      </span>
                    </div>

                    <p className="text-xs text-gray-700 font-medium mb-3">
                      {ver.changeNotes || 'No release notes specified.'}
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 bg-white rounded-xl border border-gray-200 text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-gray-400 font-sans block uppercase">Monthly</span>
                        <span className="font-bold">{isQuote ? 'Quote' : `₹${ver.monthlyPrice}`}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 font-sans block uppercase">Annual</span>
                        <span className="font-bold">{isQuote ? 'Quote' : `₹${ver.annualPrice ?? (ver.monthlyPrice ? ver.monthlyPrice * 10 : 0)}`}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 font-sans block uppercase">Cap</span>
                        <span className="font-bold">{ver.employeeCap === null ? 'Unlimited' : `${ver.employeeCap} staff`}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 font-sans block uppercase">GST Rate</span>
                        <span className="font-bold">{ver.gstRate}%</span>
                      </div>
                    </div>

                    <div className="mt-2 text-[11px] text-gray-500 flex flex-wrap gap-1">
                      <span className="font-semibold text-gray-600">Flags ({ver.featureFlags.length}):</span>
                      {ver.featureFlags.map(f => (
                        <span key={f} className="text-gray-500 font-mono">{f},</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
