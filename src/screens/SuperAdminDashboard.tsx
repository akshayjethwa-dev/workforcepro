// src/screens/SuperAdminDashboard.tsx
import React, { useState, useEffect } from 'react';
import { 
  Users, Building2, Search, Shield, Power, Activity, Crown, Sliders, Eye, X, Save, Settings 
} from 'lucide-react';
import { dbService } from '../services/db';
import { useAuth } from '../contexts/AuthContext';
import { SubscriptionTier, PlanLimits } from '../types/index';

export const SuperAdminDashboard: React.FC = () => {
  // Pull impersonate function from context
  const { profile, impersonateTenant } = useAuth();
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, workers: 0 });
  const [searchTerm, setSearchTerm] = useState('');

  // --- NEW: Tab & Global Plans State ---
  const [activeTab, setActiveTab] = useState<'ORGS' | 'PLANS'>('ORGS');
  const [globalPlans, setGlobalPlans] = useState<Record<SubscriptionTier, PlanLimits> | null>(null);
  const [savingPlans, setSavingPlans] = useState(false);

  // --- Overrides Modal State ---
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [overrides, setOverrides] = useState<Partial<PlanLimits>>({});

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    
    // NEW: Fetch both tenants and global plan configs simultaneously
    const [tenantsData, plansData] = await Promise.all([
        dbService.getAllTenants(),
        dbService.getGlobalPlanConfig()
    ]);
    
    setTenants(tenantsData);
    setGlobalPlans(plansData as Record<SubscriptionTier, PlanLimits>);
    
    setStats({
      total: tenantsData.length,
      active: tenantsData.filter(t => t.isActive).length,
      workers: tenantsData.reduce((sum, t) => sum + (t.workerCount || 0), 0)
    });
    setLoading(false);
  };

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    if(!window.confirm(`Are you sure you want to ${currentStatus ? 'DEACTIVATE' : 'ACTIVATE'} this organization?`)) return;
    
    // Optimistic update
    setTenants(prev => prev.map(t => t.id === id ? { ...t, isActive: !currentStatus } : t));
    await dbService.toggleTenantStatus(id, currentStatus);
    loadData(); // Refresh stats
  };

  const handlePlanChange = async (tenantId: string, newPlan: SubscriptionTier) => {
    if(!window.confirm(`Are you sure you want to change this tenant's plan to ${newPlan}?`)) return;

    // Optimistic UI Update
    setTenants(prev => prev.map(t => t.tenantId === tenantId ? { ...t, plan: newPlan } : t));

    try {
        await dbService.updateTenantPlan(tenantId, newPlan);
    } catch (error) {
        console.error("Failed to update plan:", error);
        alert("Failed to update plan. Please try again.");
        loadData(); // Revert on failure
    }
  };

  const handleImpersonate = (tenant: any) => {
    if(window.confirm(`Log in and view dashboard as ${tenant.companyName}?`)) {
        impersonateTenant(tenant.tenantId, tenant.companyName);
    }
  };

  const openOverrideModal = (tenant: any) => {
      setSelectedTenant(tenant);
      setOverrides(tenant.overrides || {});
      setOverrideModalOpen(true);
  };

  const saveOverrides = async () => {
      if(!selectedTenant) return;
      await dbService.updateTenantOverrides(selectedTenant.tenantId, overrides);
      setOverrideModalOpen(false);
      loadData(); // Refresh list to get latest overrides
  };

  // --- NEW: Global Plan Handlers ---
  const handleGlobalPlanEdit = (tier: SubscriptionTier, field: keyof PlanLimits, value: any) => {
      if (!globalPlans) return;
      setGlobalPlans({
          ...globalPlans,
          [tier]: {
              ...globalPlans[tier],
              [field]: value
          }
      });
  };

  const saveGlobalPlans = async () => {
      if (!globalPlans) return;
      setSavingPlans(true);
      try {
          await dbService.updateGlobalPlanConfig(globalPlans);
          alert("Global Plans Updated Successfully!");
      } catch (error) {
          alert("Failed to save plans.");
      }
      setSavingPlans(false);
  };

  const filteredTenants = tenants.filter(t => 
    (t.companyName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (t.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20 relative">
      {/* Hero Section */}
      <div className="bg-slate-900 text-white p-6 md:p-8 pt-10 pb-24 rounded-b-3xl">
         <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center space-x-3">
                    <div className="p-2 bg-indigo-500 rounded-lg">
                        <Shield size={24} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold">Super Admin</h1>
                        <p className="text-slate-400 text-[10px] md:text-xs tracking-wider uppercase">Master Control Panel</p>
                    </div>
                </div>
                
                {/* NEW: Custom Tabs Navigation */}
                <div className="flex bg-slate-800 rounded-xl p-1 shadow-inner">
                    <button 
                        onClick={() => setActiveTab('ORGS')}
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${activeTab === 'ORGS' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                    >
                        Organizations
                    </button>
                    <button 
                        onClick={() => setActiveTab('PLANS')}
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center ${activeTab === 'PLANS' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                    >
                        <Settings size={14} className="mr-1.5" />
                        Plan Limits
                    </button>
                </div>
            </div>

            {/* Quick Stats (Only visible on ORGS tab) */}
            {activeTab === 'ORGS' && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                    <div className="bg-slate-800 p-4 md:p-5 rounded-2xl border border-slate-700 flex items-center">
                        <div className="p-2 md:p-3 bg-blue-500/20 rounded-xl mr-3 md:mr-4">
                            <Building2 className="text-blue-400" size={20} />
                        </div>
                        <div>
                            <h3 className="text-xl md:text-3xl font-bold">{stats.total}</h3>
                            <p className="text-slate-400 text-[9px] md:text-xs uppercase font-bold">Organizations</p>
                        </div>
                    </div>
                    <div className="bg-slate-800 p-4 md:p-5 rounded-2xl border border-slate-700 flex items-center">
                        <div className="p-2 md:p-3 bg-green-500/20 rounded-xl mr-3 md:mr-4">
                            <Activity className="text-green-400" size={20} />
                        </div>
                        <div>
                            <h3 className="text-xl md:text-3xl font-bold">{stats.active}</h3>
                            <p className="text-slate-400 text-[9px] md:text-xs uppercase font-bold">Active Licenses</p>
                        </div>
                    </div>
                    <div className="col-span-2 md:col-span-1 bg-slate-800 p-4 md:p-5 rounded-2xl border border-slate-700 flex items-center">
                        <div className="p-2 md:p-3 bg-purple-500/20 rounded-xl mr-3 md:mr-4">
                            <Users className="text-purple-400" size={20} />
                        </div>
                        <div>
                            <h3 className="text-xl md:text-3xl font-bold">{stats.workers}</h3>
                            <p className="text-slate-400 text-[9px] md:text-xs uppercase font-bold">Total Workforce</p>
                        </div>
                    </div>
                </div>
            )}
         </div>
      </div>

      {/* --- TAB CONTENT: ORGANIZATIONS --- */}
      {activeTab === 'ORGS' && (
          <div className="max-w-6xl mx-auto -mt-16 px-4">
             <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mb-6">
                 
                 {/* Toolbar */}
                 <div className="p-4 md:p-5 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white">
                     <h2 className="font-bold text-gray-800 text-lg w-full sm:w-auto">Organization List</h2>
                     <div className="relative w-full sm:w-72">
                         <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                         <input 
                           type="text" 
                           value={searchTerm}
                           onChange={(e) => setSearchTerm(e.target.value)}
                           placeholder="Search by name or email..." 
                           className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                         />
                     </div>
                 </div>

                 {/* RESPONSIVE CARD LIST */}
                 <div className="divide-y divide-gray-100 bg-gray-50/50">
                    {loading ? (
                        <div className="p-12 text-center text-gray-400">Loading directory...</div>
                    ) : filteredTenants.length === 0 ? (
                        <div className="p-12 text-center text-gray-400">
                            <Building2 size={48} className="mx-auto mb-4 opacity-20"/>
                            <p>No organizations found.</p>
                        </div>
                    ) : (
                        filteredTenants.map((tenant) => (
                            <div key={tenant.id} className="p-4 md:p-6 bg-white hover:bg-blue-50/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6">
                                
                                {/* Company & Contact Info */}
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="font-bold text-gray-900 text-base md:text-lg">
                                                {tenant.companyName || 'Unnamed Company'}
                                            </h3>
                                            <p className="text-[10px] md:text-xs text-gray-400 font-mono mt-0.5 tracking-wider">
                                                ID: {tenant.tenantId}
                                            </p>
                                        </div>
                                        <div className="md:hidden">
                                            {tenant.isActive ? (
                                                <span className="w-3 h-3 bg-green-500 rounded-full block shadow-sm border border-white"></span>
                                            ) : (
                                                <span className="w-3 h-3 bg-red-500 rounded-full block shadow-sm border border-white"></span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-2 text-xs md:text-sm text-gray-600 flex flex-col md:flex-row md:items-center gap-1 md:gap-3">
                                        <span className="font-medium">{tenant.name}</span>
                                        <span className="hidden md:inline text-gray-300">•</span>
                                        <span className="text-gray-500">{tenant.email}</span>
                                    </div>

                                    {/* Badge if tenant has overrides */}
                                    {Object.keys(tenant.overrides || {}).length > 0 && (
                                        <div className="mt-2">
                                            <span className="inline-block bg-orange-100 text-orange-800 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                                                Custom Toggles Active
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Stats */}
                                <div className="flex flex-row md:flex-col justify-between items-center md:items-start gap-2 bg-gray-50 md:bg-transparent p-3 md:p-0 rounded-lg border border-gray-100 md:border-none">
                                    <div className="text-center md:text-left">
                                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">Workforce</p>
                                        <span className="font-bold text-blue-700 bg-blue-100 px-2.5 py-1 rounded text-xs md:text-sm">
                                            {tenant.workerCount} Workers
                                        </span>
                                    </div>
                                    <div className="text-center md:text-left">
                                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">Joined</p>
                                        <span className="text-xs md:text-sm text-gray-700 font-medium">
                                            {new Date(tenant.joinedAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>

                                {/* Actions & Plan Control */}
                                <div className="flex flex-wrap items-center justify-between md:justify-end gap-2 w-full md:w-auto mt-2 md:mt-0 pt-3 md:pt-0 border-t md:border-none border-gray-100">
                                    
                                    {/* Plan Dropdown */}
                                    <div className="flex flex-col flex-1 md:flex-none">
                                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1 md:hidden">Current Plan</span>
                                        <div className="relative">
                                            <Crown size={14} className="absolute left-2.5 top-2 text-indigo-500" />
                                            <select
                                                value={tenant.plan || 'FREE'}
                                                onChange={(e) => handlePlanChange(tenant.tenantId, e.target.value as SubscriptionTier)}
                                                className="w-full md:w-32 pl-8 pr-8 py-1.5 bg-indigo-50/50 border border-indigo-100 text-indigo-900 text-xs font-bold rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer hover:bg-indigo-50 transition-colors"
                                            >
                                                <option value="FREE">FREE</option>
                                                <option value="TRIAL">TRIAL</option>
                                                <option value="STARTER">STARTER</option>
                                                <option value="PRO">PRO</option>
                                                <option value="ENTERPRISE">ENTERPRISE</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Desktop Status Badge */}
                                    <div className="hidden md:block w-20 text-center">
                                        {tenant.isActive ? (
                                            <span className="inline-flex items-center text-green-700 bg-green-100 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide">
                                                Active
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center text-red-700 bg-red-100 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide">
                                                Inactive
                                            </span>
                                        )}
                                    </div>

                                    {/* Grouped Action Buttons */}
                                    <div className="flex items-center space-x-1.5">
                                        <button 
                                            onClick={() => openOverrideModal(tenant)}
                                            className="p-2 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                                            title="Feature Overrides"
                                        >
                                            <Sliders size={16} />
                                        </button>
                                        
                                        <button 
                                            onClick={() => handleImpersonate(tenant)}
                                            className="p-2 bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Impersonate (Login As)"
                                        >
                                            <Eye size={16} />
                                        </button>

                                        <button 
                                            onClick={() => toggleStatus(tenant.id, tenant.isActive)}
                                            className={`p-2 rounded-lg border transition-all ${
                                                tenant.isActive 
                                                ? 'bg-white border-red-200 text-red-500 hover:bg-red-50' 
                                                : 'bg-white border-green-200 text-green-500 hover:bg-green-50'
                                            }`}
                                            title={tenant.isActive ? "Deactivate Account" : "Activate Account"}
                                        >
                                            <Power size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                 </div>
             </div>
          </div>
      )}

      {/* --- NEW TAB CONTENT: GLOBAL PLANS CONFIGURATION --- */}
      {activeTab === 'PLANS' && globalPlans && (
          <div className="max-w-6xl mx-auto -mt-16 px-4">
             <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mb-6">
                 
                 <div className="p-4 md:p-5 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white">
                     <div>
                         <h2 className="font-bold text-gray-800 text-lg">Global Pricing & Limits</h2>
                         <p className="text-xs text-gray-500 mt-1">Changes here instantly affect all users on these plans upon refresh.</p>
                     </div>
                     <button 
                         onClick={saveGlobalPlans}
                         disabled={savingPlans}
                         className="w-full md:w-auto flex justify-center items-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-md disabled:opacity-50"
                     >
                         <Save size={16} className="mr-2" />
                         {savingPlans ? 'Saving...' : 'Save All Changes'}
                     </button>
                 </div>

                 <div className="p-4 md:p-6 bg-gray-50/30">
                     <div className="flex flex-col space-y-6">
                         {(Object.keys(globalPlans) as SubscriptionTier[]).map((tier) => (
                             <div key={tier} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                 {/* Plan Header */}
                                 <div className="bg-slate-50 border-b border-gray-200 px-5 py-3 flex items-center">
                                     <Crown size={18} className="text-indigo-500 mr-2" />
                                     <h3 className="font-bold text-indigo-900 text-lg tracking-wide">{tier}</h3>
                                 </div>
                                 
                                 <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                     
                                     {/* Numeric Limits */}
                                     <div className="space-y-4">
                                         <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">Capacity Limits</h4>
                                         
                                         <div>
                                             <label className="text-sm font-medium text-gray-700 block mb-1">Max Workers</label>
                                             <input 
                                                 type="number" 
                                                 value={globalPlans[tier].maxWorkers}
                                                 onChange={e => handleGlobalPlanEdit(tier, 'maxWorkers', parseInt(e.target.value) || 0)}
                                                 className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                             />
                                         </div>
                                         <div>
                                             <label className="text-sm font-medium text-gray-700 block mb-1">Max Managers</label>
                                             <input 
                                                 type="number" 
                                                 value={globalPlans[tier].maxManagers}
                                                 onChange={e => handleGlobalPlanEdit(tier, 'maxManagers', parseInt(e.target.value) || 0)}
                                                 className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                             />
                                         </div>
                                         <div>
                                             <label className="text-sm font-medium text-gray-700 block mb-1">Max Shifts</label>
                                             <input 
                                                 type="number" 
                                                 value={globalPlans[tier].maxShifts}
                                                 onChange={e => handleGlobalPlanEdit(tier, 'maxShifts', parseInt(e.target.value) || 0)}
                                                 className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                             />
                                         </div>
                                     </div>

                                     {/* Feature Toggles Column 1 */}
                                     <div className="space-y-3.5">
                                         <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">Core Features</h4>
                                         
                                         <label className="flex items-center space-x-3 cursor-pointer">
                                             <input 
                                                 type="checkbox" 
                                                 checked={globalPlans[tier].kioskEnabled}
                                                 onChange={e => handleGlobalPlanEdit(tier, 'kioskEnabled', e.target.checked)}
                                                 className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                             />
                                             <span className="text-sm font-medium text-gray-700">Kiosk Mode</span>
                                         </label>
                                         <label className="flex items-center space-x-3 cursor-pointer">
                                             <input 
                                                 type="checkbox" 
                                                 checked={globalPlans[tier].geofencingEnabled}
                                                 onChange={e => handleGlobalPlanEdit(tier, 'geofencingEnabled', e.target.checked)}
                                                 className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                             />
                                             <span className="text-sm font-medium text-gray-700">Geofencing</span>
                                         </label>
                                         <label className="flex items-center space-x-3 cursor-pointer">
                                             <input 
                                                 type="checkbox" 
                                                 checked={globalPlans[tier].multiBranchEnabled}
                                                 onChange={e => handleGlobalPlanEdit(tier, 'multiBranchEnabled', e.target.checked)}
                                                 className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                             />
                                             <span className="text-sm font-medium text-gray-700">Multi-Branch Setup</span>
                                         </label>
                                         <label className="flex items-center space-x-3 cursor-pointer">
                                             <input 
                                                 type="checkbox" 
                                                 checked={globalPlans[tier].livenessDetectionEnabled}
                                                 onChange={e => handleGlobalPlanEdit(tier, 'livenessDetectionEnabled', e.target.checked)}
                                                 className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                             />
                                             <span className="text-sm font-medium text-gray-700">Face Liveness Detection</span>
                                         </label>
                                     </div>

                                     {/* Feature Toggles Column 2 */}
                                     <div className="space-y-3.5">
                                         <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">Advanced Modules</h4>
                                         
                                         <label className="flex items-center space-x-3 cursor-pointer">
                                             <input 
                                                 type="checkbox" 
                                                 checked={globalPlans[tier].advancedLeavesEnabled}
                                                 onChange={e => handleGlobalPlanEdit(tier, 'advancedLeavesEnabled', e.target.checked)}
                                                 className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                             />
                                             <span className="text-sm font-medium text-gray-700">Advanced Leaves (CL/SL/PL)</span>
                                         </label>
                                         <label className="flex items-center space-x-3 cursor-pointer">
                                             <input 
                                                 type="checkbox" 
                                                 checked={globalPlans[tier].allowancesAndDeductionsEnabled}
                                                 onChange={e => handleGlobalPlanEdit(tier, 'allowancesAndDeductionsEnabled', e.target.checked)}
                                                 className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                             />
                                             <span className="text-sm font-medium text-gray-700">Allowances & Deductions</span>
                                         </label>
                                         <label className="flex items-center space-x-3 cursor-pointer">
                                             <input 
                                                 type="checkbox" 
                                                 checked={globalPlans[tier].statutoryComplianceEnabled}
                                                 onChange={e => handleGlobalPlanEdit(tier, 'statutoryComplianceEnabled', e.target.checked)}
                                                 className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                             />
                                             <span className="text-sm font-medium text-gray-700">Statutory Compliance (PF/ESIC)</span>
                                         </label>
                                          <label className="flex items-center space-x-3 cursor-pointer">
                                             <input 
                                                 type="checkbox" 
                                                 checked={globalPlans[tier].bulkImportEnabled}
                                                 onChange={e => handleGlobalPlanEdit(tier, 'bulkImportEnabled', e.target.checked)}
                                                 className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                             />
                                             <span className="text-sm font-medium text-gray-700">Excel Bulk Import</span>
                                         </label>
                                     </div>
                                 </div>
                             </div>
                         ))}
                     </div>
                 </div>
             </div>
          </div>
      )}

      {/* --- OVERRIDES MODAL --- */}
      {overrideModalOpen && selectedTenant && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all">
                  
                  <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                      <div className="flex items-center">
                          <Sliders size={18} className="text-orange-500 mr-2" />
                          <h3 className="font-bold text-lg text-gray-800">Feature Overrides</h3>
                      </div>
                      <button onClick={() => setOverrideModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                          <X size={20}/>
                      </button>
                  </div>
                  
                  <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
                      <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide font-bold mb-1">Tenant</p>
                          <p className="text-sm font-medium">{selectedTenant.companyName}</p>
                          <p className="text-xs text-orange-600 mt-2 bg-orange-50 p-2.5 rounded border border-orange-100">
                              These settings will override the default limits for the <strong>{selectedTenant.plan}</strong> plan.
                          </p>
                      </div>
                      
                      {/* Number Override */}
                      <div>
                          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Max Workers Limit</label>
                          <input 
                              type="number" 
                              value={overrides.maxWorkers || ''}
                              onChange={e => setOverrides({...overrides, maxWorkers: e.target.value ? parseInt(e.target.value) : undefined})}
                              placeholder={`Leave blank to use default`}
                              className="w-full mt-1.5 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                      </div>
                      
                      {/* Boolean Toggles */}
                      <div className="space-y-3 pt-2">
                          <label className="flex items-center space-x-3 cursor-pointer">
                              <input 
                                  type="checkbox" 
                                  checked={overrides.kioskEnabled || false}
                                  onChange={e => setOverrides({...overrides, kioskEnabled: e.target.checked})}
                                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                              />
                              <span className="text-sm font-medium text-gray-700">Force Enable Kiosk Mode</span>
                          </label>
                          <label className="flex items-center space-x-3 cursor-pointer">
                              <input 
                                  type="checkbox" 
                                  checked={overrides.multiBranchEnabled || false}
                                  onChange={e => setOverrides({...overrides, multiBranchEnabled: e.target.checked})}
                                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                              />
                              <span className="text-sm font-medium text-gray-700">Force Enable Multi-Branch</span>
                          </label>
                           <label className="flex items-center space-x-3 cursor-pointer">
                              <input 
                                  type="checkbox" 
                                  checked={overrides.statutoryComplianceEnabled || false}
                                  onChange={e => setOverrides({...overrides, statutoryComplianceEnabled: e.target.checked})}
                                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                              />
                              <span className="text-sm font-medium text-gray-700">Force Enable Statutory Compliance (PF/ESIC)</span>
                          </label>
                      </div>
                  </div>

                  <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end space-x-3">
                      <button 
                          onClick={() => setOverrideModalOpen(false)} 
                          className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                          Cancel
                      </button>
                      <button 
                          onClick={saveOverrides} 
                          className="px-4 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md transition-colors"
                      >
                          Save Overrides
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};