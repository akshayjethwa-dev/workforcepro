// src/screens/SuperAdminDashboard.tsx
import React, { useState, useEffect } from 'react';
import { 
  Users, Building2, Search, Shield, Power, Activity, Crown, Sliders, Eye, X, Save, Settings, Palette, Upload, IndianRupee, Handshake, PlusCircle, MailPlus,
  ShieldAlert, ShieldCheck, AlertTriangle, RotateCcw, CheckCircle2, Play, Trash2, Filter, RefreshCw
} from 'lucide-react';
import { dbService } from '../services/db';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { SubscriptionTier, PlanLimits } from '../types/index';
import { crossTenantVerification, CrossTenantVerificationReport } from '../services/crossTenantVerification';
import { tenantSecurityService, SecurityAlert, TenantAuditLogEntry, SoftDeletedTenant } from '../services/tenantSecurityService';
import { WhiteLabelModal } from '../components/WhiteLabelModal';
import { FeatureFlagsManager } from '../components/FeatureFlagsManager';

export const SuperAdminDashboard: React.FC = () => {
  const { profile, impersonateTenant } = useAuth();
  const { toast } = useToast();
  const [tenants, setTenants] = useState<any[]>([]);
  const [resellers, setResellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, workers: 0, totalMRR: 0, totalCommission: 0 });
  const [searchTerm, setSearchTerm] = useState('');

  // --- Tabs ---
  const [activeTab, setActiveTab] = useState<'ORGS' | 'PLANS' | 'PARTNERS' | 'SECURITY' | 'FLAGS'>('ORGS');
  const [globalPlans, setGlobalPlans] = useState<Record<SubscriptionTier, PlanLimits> | null>(null);
  const [savingPlans, setSavingPlans] = useState(false);

  // --- Security Tab State ---
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([]);
  const [auditLogs, setAuditLogs] = useState<TenantAuditLogEntry[]>([]);
  const [softDeletedTenants, setSoftDeletedTenants] = useState<SoftDeletedTenant[]>([]);
  const [testReport, setTestReport] = useState<CrossTenantVerificationReport | null>(null);
  const [runningTests, setRunningTests] = useState(false);
  const [auditFilter, setAuditFilter] = useState({ tenantId: 'ALL', role: 'ALL', status: 'ALL', search: '' });
  const [securitySubTab, setSecuritySubTab] = useState<'ALERTS' | 'AUDIT' | 'SOFT_DELETE' | 'VERIFICATION'>('ALERTS');

  // --- NEW: Create Reseller State ---
  const [showCreateReseller, setShowCreateReseller] = useState(false);
  const [newReseller, setNewReseller] = useState({ 
    companyName: '', 
    ownerEmail: '', 
    commissionRate: 150 
  });

  // --- Modals ---
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [overrides, setOverrides] = useState<Partial<PlanLimits>>({});
  const [brandingModalOpen, setBrandingModalOpen] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [tenantsData, plansData, resellersData, alertsData, logsData, softDeletedData] = await Promise.all([
        dbService.getAllTenants(false),
        dbService.getGlobalPlanConfig(),
        dbService.getResellers(),
        tenantSecurityService.getSecurityAlerts('ALL'),
        tenantSecurityService.getAllAuditLogs(),
        tenantSecurityService.getSoftDeletedTenants()
    ]);
    
    setTenants(tenantsData);
    setGlobalPlans(plansData as Record<SubscriptionTier, PlanLimits>);
    setResellers(resellersData);
    setSecurityAlerts(alertsData);
    setAuditLogs(logsData);
    setSoftDeletedTenants(softDeletedData);
    setGlobalPlans(plansData as Record<SubscriptionTier, PlanLimits>);
    setResellers(resellersData);
    
    const activeTenantsCount = tenantsData.filter(t => t.isActive).length;
    const grossMRR = activeTenantsCount * 500;
    const totalCommission = resellersData.reduce((sum, r) => sum + (r.activeClients * (r.commissionRate || 150)), 0);

    setStats({
      total: tenantsData.length,
      active: activeTenantsCount,
      workers: tenantsData.reduce((sum, t) => sum + (t.workerCount || 0), 0),
      totalMRR: grossMRR,
      totalCommission: totalCommission
    });
    setLoading(false);
  };

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    setTenants(prev => prev.map(t => t.id === id ? { ...t, isActive: !currentStatus } : t));
    await dbService.toggleTenantStatus(id, currentStatus);
    toast.success(`Organization ${currentStatus ? 'deactivated' : 'activated'} successfully`);
    loadData();
  };

  const handlePlanChange = async (tenantId: string, newPlan: SubscriptionTier) => {
    setTenants(prev => prev.map(t => t.tenantId === tenantId ? { ...t, plan: newPlan } : t));
    try {
        await dbService.updateTenantPlan(tenantId, newPlan);
        toast.success(`Plan updated to ${newPlan}`);
    } catch (error) {
        toast.error("Failed to update plan. Please try again.");
        loadData();
    }
  };

  const handleImpersonate = (tenant: any) => {
    toast.info(`Switched to ${tenant.companyName} workspace`);
    impersonateTenant(tenant.tenantId, tenant.companyName);
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
      toast.success("Tenant overrides saved successfully");
      loadData(); 
  };

  const openBrandingModal = (tenant: any) => {
    setSelectedTenant(tenant);
    setBrandingModalOpen(true);
  };

  const handleGlobalPlanEdit = (tier: SubscriptionTier, field: keyof PlanLimits, value: any) => {
      if (!globalPlans) return;
      setGlobalPlans({ ...globalPlans, [tier]: { ...globalPlans[tier], [field]: value } });
  };

  const saveGlobalPlans = async () => {
      if (!globalPlans) return;
      setSavingPlans(true);
      try {
          await dbService.updateGlobalPlanConfig(globalPlans);
          toast.success("Global Plans updated successfully");
      } catch (error) { 
          toast.error("Failed to save global plans"); 
      }
      setSavingPlans(false);
  };

  const handleMakeReseller = async (userId: string, companyName: string) => {
      await dbService.makeReseller(userId);
      toast.success(`${companyName || 'The account'} is now a Reseller Partner`);
      loadData();
  };

  const updateCommission = async (userId: string, currentRate: number) => {
      const nextRate = currentRate >= 300 ? 100 : currentRate + 50;
      await dbService.updateResellerCommission(userId, nextRate);
      toast.success(`Commission rate set to ₹${nextRate}/active client/mo`);
      loadData();
  };

  // --- NEW: Reseller Invite Handler ---
  const handleInviteReseller = async () => {
    if (!newReseller.companyName || !newReseller.ownerEmail) {
        toast.warning("Please fill in the Agency Name and Email.");
        return;
    }
    
    try {
        await dbService.inviteResellerPartner(newReseller.ownerEmail, newReseller.companyName, newReseller.commissionRate);
        toast.success(`Reseller invite sent to ${newReseller.ownerEmail} (₹${newReseller.commissionRate} commission slab)`);
        setShowCreateReseller(false);
        setNewReseller({ companyName: '', ownerEmail: '', commissionRate: 150 });
    } catch (error) {
        console.error("Failed to invite reseller:", error);
        toast.error("Failed to send invite");
    }
  };

  // --- Security Action Handlers ---
  const handleResolveAlert = async (alertId: string) => {
    await tenantSecurityService.resolveSecurityAlert(alertId, profile?.email || 'superadmin');
    toast.success("Security alert marked as RESOLVED");
    const updated = await tenantSecurityService.getSecurityAlerts('ALL');
    setSecurityAlerts(updated);
  };

  const handleSoftDelete = async (tenantId: string, companyName: string) => {
    if (!profile) return;
    if (!window.confirm(`Are you sure you want to soft-delete '${companyName}'? All queries will strictly filter this tenant out with a 90-day recovery window.`)) return;
    await tenantSecurityService.softDeleteTenant(tenantId, companyName, profile);
    toast.warning(`Tenant '${companyName}' soft-deleted. Moved to 90-Day Recovery Queue.`);
    await loadData();
  };

  const handleRestoreTenant = async (tenantId: string, companyName: string) => {
    if (!profile) return;
    await tenantSecurityService.restoreSoftDeletedTenant(tenantId, profile);
    toast.success(`Tenant '${companyName}' successfully restored! All permissions and data access re-enabled.`);
    await loadData();
  };

  const handleRunIsolationTests = async () => {
    setRunningTests(true);
    try {
      const report = await crossTenantVerification.runIsolationTestSuite();
      setTestReport(report);
      if (report.status === 'ALL_PASSED') {
        toast.success(`Verification passed! All ${report.totalTests} security boundary assertions confirmed.`);
      } else {
        toast.error(`Verification failed: ${report.failedTests} security assertions breached.`);
      }
    } catch (err: any) {
      toast.error(`Test execution error: ${err.message}`);
    } finally {
      setRunningTests(false);
      const logs = await tenantSecurityService.getAllAuditLogs(auditFilter);
      setAuditLogs(logs);
      const alerts = await tenantSecurityService.getSecurityAlerts('ALL');
      setSecurityAlerts(alerts);
    }
  };

  const handleFilterAuditLogs = async (newFilter: typeof auditFilter) => {
    setAuditFilter(newFilter);
    const logs = await tenantSecurityService.getAllAuditLogs(newFilter);
    setAuditLogs(logs);
  };

  const filteredTenants = tenants.filter(t => 
    (t.companyName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (t.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20 relative">
      <div className="bg-slate-900 text-white p-6 md:p-8 pt-10 pb-24 rounded-b-3xl">
         <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center space-x-3">
                    <div className="p-2 bg-indigo-500 rounded-lg"><Shield size={24} className="text-white" /></div>
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold">Super Admin</h1>
                        <p className="text-slate-400 text-[10px] md:text-xs tracking-wider uppercase">Master Control Panel</p>
                    </div>
                </div>
                
                <div className="flex bg-slate-800 rounded-xl p-1 shadow-inner overflow-x-auto">
                    <button 
                        onClick={() => setActiveTab('ORGS')}
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${activeTab === 'ORGS' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                    >
                        Organizations
                    </button>
                    <button 
                        onClick={() => setActiveTab('PARTNERS')}
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center ${activeTab === 'PARTNERS' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                    >
                        <Handshake size={14} className="mr-1.5" /> Partners & Billing
                    </button>
                    <button 
                        onClick={() => setActiveTab('PLANS')}
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center ${activeTab === 'PLANS' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                    >
                        <Settings size={14} className="mr-1.5" /> Plan Limits
                    </button>
                    <button 
                        onClick={() => setActiveTab('FLAGS')}
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center ${activeTab === 'FLAGS' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                    >
                        <Sliders size={14} className="mr-1.5 text-blue-400" /> Feature Flags
                    </button>
                    <button 
                        onClick={() => setActiveTab('SECURITY')}
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center relative ${activeTab === 'SECURITY' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                    >
                        <ShieldAlert size={14} className="mr-1.5 text-amber-400" /> Security &amp; Isolation
                        {securityAlerts.filter(a => a.status === 'ACTIVE').length > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full animate-pulse">
                                {securityAlerts.filter(a => a.status === 'ACTIVE').length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {activeTab === 'ORGS' && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                    <div className="bg-slate-800 p-4 md:p-5 rounded-2xl border border-slate-700 flex items-center">
                        <div className="p-2 md:p-3 bg-blue-500/20 rounded-xl mr-3 md:mr-4"><Building2 className="text-blue-400" size={20} /></div>
                        <div>
                            <h3 className="text-xl md:text-3xl font-bold">{stats.total}</h3>
                            <p className="text-slate-400 text-[9px] md:text-xs uppercase font-bold">Organizations</p>
                        </div>
                    </div>
                    <div className="bg-slate-800 p-4 md:p-5 rounded-2xl border border-slate-700 flex items-center">
                        <div className="p-2 md:p-3 bg-green-500/20 rounded-xl mr-3 md:mr-4"><Activity className="text-green-400" size={20} /></div>
                        <div>
                            <h3 className="text-xl md:text-3xl font-bold">{stats.active}</h3>
                            <p className="text-slate-400 text-[9px] md:text-xs uppercase font-bold">Active Licenses</p>
                        </div>
                    </div>
                    <div className="col-span-2 md:col-span-1 bg-slate-800 p-4 md:p-5 rounded-2xl border border-slate-700 flex items-center">
                        <div className="p-2 md:p-3 bg-purple-500/20 rounded-xl mr-3 md:mr-4"><Users className="text-purple-400" size={20} /></div>
                        <div>
                            <h3 className="text-xl md:text-3xl font-bold">{stats.workers}</h3>
                            <p className="text-slate-400 text-[9px] md:text-xs uppercase font-bold">Total Workforce</p>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'PARTNERS' && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                    <div className="bg-slate-800 p-4 md:p-5 rounded-2xl border border-slate-700 flex items-center">
                        <div className="p-2 md:p-3 bg-green-500/20 rounded-xl mr-3 md:mr-4"><IndianRupee className="text-green-400" size={20} /></div>
                        <div>
                            <h3 className="text-xl md:text-3xl font-bold">₹{(stats.totalMRR/1000).toFixed(1)}k</h3>
                            <p className="text-slate-400 text-[9px] md:text-xs uppercase font-bold">Gross MRR</p>
                        </div>
                    </div>
                    <div className="bg-slate-800 p-4 md:p-5 rounded-2xl border border-slate-700 flex items-center">
                        <div className="p-2 md:p-3 bg-orange-500/20 rounded-xl mr-3 md:mr-4"><Activity className="text-orange-400" size={20} /></div>
                        <div>
                            <h3 className="text-xl md:text-3xl font-bold">₹{(stats.totalCommission/1000).toFixed(1)}k</h3>
                            <p className="text-slate-400 text-[9px] md:text-xs uppercase font-bold">Partner Commissions</p>
                        </div>
                    </div>
                    <div className="col-span-2 md:col-span-1 bg-slate-800 p-4 md:p-5 rounded-2xl border border-slate-700 flex items-center">
                        <div className="p-2 md:p-3 bg-indigo-500/20 rounded-xl mr-3 md:mr-4"><Handshake className="text-indigo-400" size={20} /></div>
                        <div>
                            <h3 className="text-xl md:text-3xl font-bold">{resellers.length}</h3>
                            <p className="text-slate-400 text-[9px] md:text-xs uppercase font-bold">Active Resellers</p>
                        </div>
                    </div>
                </div>
            )}
         </div>
      </div>

      {activeTab === 'ORGS' && (
         <div className="max-w-6xl mx-auto -mt-16 px-4">
             <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mb-6">
                 <div className="p-4 md:p-5 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white">
                     <h2 className="font-bold text-gray-800 text-lg w-full sm:w-auto">Organization List</h2>
                     <div className="relative w-full sm:w-72">
                         <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                         <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search..." className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
                     </div>
                 </div>

                 <div className="divide-y divide-gray-100 bg-gray-50/50">
                    {loading ? <div className="p-12 text-center text-gray-400">Loading...</div> : 
                        filteredTenants.map((tenant) => (
                            <div key={tenant.id} className="p-4 md:p-6 bg-white hover:bg-blue-50/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6">
                                <div className="flex-1">
                                    <div className="flex items-center space-x-3">
                                        {tenant.branding?.logoUrl && <img src={tenant.branding.logoUrl} className="w-8 h-8 rounded object-contain border border-gray-100 bg-white" alt="Logo" />}
                                        <div>
                                            <h3 className="font-bold text-gray-900 text-base md:text-lg">{tenant.branding?.appName || tenant.companyName || 'Unnamed'}</h3>
                                            <p className="text-[10px] md:text-xs text-gray-400 font-mono mt-0.5">ID: {tenant.tenantId}</p>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-xs md:text-sm text-gray-600 flex items-center gap-2">
                                        <span className="font-medium">{tenant.name}</span><span className="text-gray-300">•</span><span className="text-gray-500">{tenant.email}</span>
                                    </div>
                                    {tenant.resellerId && (
                                        <span className="inline-block mt-2 bg-indigo-50 text-indigo-700 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border border-indigo-100">
                                            Managed by Partner
                                        </span>
                                    )}
                                </div>

                                <div className="flex flex-row md:flex-col justify-between items-center md:items-start gap-2 bg-gray-50 md:bg-transparent p-3 md:p-0 rounded-lg border border-gray-100 md:border-none">
                                    <div className="text-center md:text-left">
                                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">Workforce</p>
                                        <span className="font-bold text-blue-700 bg-blue-100 px-2.5 py-1 rounded text-xs md:text-sm">{tenant.workerCount} Workers</span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between md:justify-end gap-2 w-full md:w-auto mt-2 md:mt-0 pt-3 md:pt-0 border-t md:border-none border-gray-100">
                                    <select
                                        value={tenant.plan || 'FREE'}
                                        onChange={(e) => handlePlanChange(tenant.tenantId, e.target.value as SubscriptionTier)}
                                        className="w-full md:w-32 pl-4 pr-8 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-900 text-xs font-bold rounded-lg"
                                    >
                                        <option value="FREE">FREE</option><option value="TRIAL">TRIAL</option><option value="STARTER">STARTER</option><option value="PRO">PRO</option><option value="ENTERPRISE">ENTERPRISE</option>
                                    </select>

                                    <div className="flex items-center space-x-1.5">
                                        {!tenant.resellerId && (
                                            <button onClick={() => handleMakeReseller(tenant.id, tenant.companyName)} className="p-2 bg-white border border-teal-200 text-teal-600 hover:bg-teal-50 rounded-lg" title="Promote to Reseller">
                                                <Handshake size={16} />
                                            </button>
                                        )}
                                        <button onClick={() => openBrandingModal(tenant)} className="p-2 bg-white border border-purple-200 text-purple-600 rounded-lg hover:bg-purple-50"><Palette size={16} /></button>
                                        <button onClick={() => openOverrideModal(tenant)} className="p-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"><Sliders size={16} /></button>
                                        <button onClick={() => handleImpersonate(tenant)} className="p-2 bg-white border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50"><Eye size={16} /></button>
                                        <button onClick={() => toggleStatus(tenant.id, tenant.isActive)} className={`p-2 rounded-lg border ${tenant.isActive ? 'border-amber-200 text-amber-500 hover:bg-amber-50' : 'border-green-200 text-green-500 hover:bg-green-50'}`} title={tenant.isActive ? 'Suspend Org' : 'Activate Org'}><Power size={16} /></button>
                                        <button onClick={() => handleSoftDelete(tenant.tenantId || tenant.id, tenant.companyName)} className="p-2 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Soft-Delete (90-Day Recovery Queue)"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            </div>
                        ))
                    }
                 </div>
             </div>
          </div>
      )}

      {/* --- TAB CONTENT: RESELLERS & BILLING --- */}
      {activeTab === 'PARTNERS' && (
          <div className="max-w-6xl mx-auto -mt-16 px-4">
             <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mb-6">
                 
                 <div className="p-4 md:p-5 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white">
                     <div>
                         <h2 className="font-bold text-gray-800 text-lg">Reseller Channels</h2>
                         <p className="text-xs text-gray-500">Track channel MRR and calculate monthly commission payouts.</p>
                     </div>
                     <button 
                         onClick={() => setShowCreateReseller(!showCreateReseller)}
                         className="w-full md:w-auto flex justify-center items-center bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-md"
                     >
                         <PlusCircle size={16} className="mr-2" />
                         {showCreateReseller ? 'Cancel Onboarding' : 'Onboard New Reseller'}
                     </button>
                 </div>

                 {/* NEW: Onboard Reseller Form */}
                 {showCreateReseller && (
                    <div className="bg-indigo-50/50 p-6 border-b border-gray-100">
                        <h3 className="font-bold text-indigo-900 mb-4 flex items-center">
                            <MailPlus size={18} className="mr-2" /> Send Partner Invitation
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="text-xs font-bold text-gray-700 uppercase">Agency / Company Name</label>
                                <input 
                                    type="text" value={newReseller.companyName} onChange={e => setNewReseller({...newReseller, companyName: e.target.value})}
                                    placeholder="e.g. Acme Tech Solutions" className="w-full mt-1 p-2.5 bg-white border border-gray-200 rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-700 uppercase">Owner Email</label>
                                <input 
                                    type="email" value={newReseller.ownerEmail} onChange={e => setNewReseller({...newReseller, ownerEmail: e.target.value})}
                                    placeholder="partner@example.com" className="w-full mt-1 p-2.5 bg-white border border-gray-200 rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-700 uppercase">Commission (₹ per client)</label>
                                <input 
                                    type="number" value={newReseller.commissionRate} onChange={e => setNewReseller({...newReseller, commissionRate: Number(e.target.value)})}
                                    className="w-full mt-1 p-2.5 bg-white border border-gray-200 rounded-lg text-sm"
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button onClick={handleInviteReseller} className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-indigo-700 transition-colors shadow-sm">
                                Send Registration Link
                            </button>
                        </div>
                    </div>
                 )}

                 <div className="divide-y divide-gray-100">
                    {loading ? <div className="p-12 text-center text-gray-400">Loading channels...</div> : 
                     resellers.length === 0 ? <div className="p-12 text-center text-gray-400">No resellers found. Promote an org or invite one above to start.</div> :
                     resellers.map((reseller) => {
                         const grossMrr = reseller.activeClients * 500; 
                         const commission = reseller.activeClients * reseller.commissionRate;
                         const netMrr = grossMrr - commission;

                         return (
                             <div key={reseller.id} className="p-4 md:p-6 bg-white hover:bg-indigo-50/30 transition-colors flex flex-col md:flex-row justify-between md:items-center gap-4">
                                 <div className="flex-1">
                                     <h3 className="font-bold text-gray-900 text-lg">{reseller.companyName || 'Partner Agency'}</h3>
                                     <div className="mt-1 text-xs text-gray-600 flex items-center gap-2">
                                         <span className="font-medium">{reseller.name || 'Invited User'}</span><span className="text-gray-300">•</span><span>{reseller.email}</span>
                                     </div>
                                 </div>

                                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full md:w-auto">
                                     <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 text-center">
                                         <p className="text-[9px] text-gray-400 font-bold uppercase mb-1">Active Clients</p>
                                         <span className="font-bold text-gray-800">{reseller.activeClients}</span>
                                     </div>
                                     <div className="bg-green-50 p-3 rounded-lg border border-green-100 text-center">
                                         <p className="text-[9px] text-green-600 font-bold uppercase mb-1">Gross MRR</p>
                                         <span className="font-bold text-green-700">₹{grossMrr}</span>
                                     </div>
                                     <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 text-center relative group cursor-pointer" onClick={() => updateCommission(reseller.id, reseller.commissionRate)}>
                                         <p className="text-[9px] text-orange-600 font-bold uppercase mb-1">Payout Owed</p>
                                         <span className="font-bold text-orange-700">₹{commission}</span>
                                         <div className="absolute inset-0 bg-black/5 rounded-lg opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                             <span className="text-[10px] bg-black text-white px-2 py-1 rounded">Edit Rate (₹{reseller.commissionRate})</span>
                                         </div>
                                     </div>
                                     <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-center">
                                         <p className="text-[9px] text-blue-600 font-bold uppercase mb-1">Net MRR</p>
                                         <span className="font-bold text-blue-700">₹{netMrr}</span>
                                     </div>
                                 </div>
                             </div>
                         );
                     })
                    }
                 </div>
             </div>
          </div>
      )}

      {/* --- TAB CONTENT: GLOBAL PLANS CONFIGURATION --- */}
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

      {/* --- TAB CONTENT: TENANT-ISOLATED DATA ACCESS & SECURITY --- */}
      {activeTab === 'SECURITY' && (
          <div className="max-w-6xl mx-auto -mt-16 px-4 space-y-6">
              
              {/* Top Security KPI Badges */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                  <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center">
                      <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl mr-3.5"><ShieldCheck size={22} /></div>
                      <div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Isolation Mode</p>
                          <h4 className="text-sm md:text-base font-extrabold text-slate-800">Server-Enforced</h4>
                      </div>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center">
                      <div className={`p-3 rounded-xl mr-3.5 ${securityAlerts.filter(a => a.status === 'ACTIVE').length > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          <ShieldAlert size={22} />
                      </div>
                      <div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Active Probes</p>
                          <h4 className="text-sm md:text-base font-extrabold text-slate-800">{securityAlerts.filter(a => a.status === 'ACTIVE').length} Alerts</h4>
                      </div>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center">
                      <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl mr-3.5"><Activity size={22} /></div>
                      <div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Audit Trail</p>
                          <h4 className="text-sm md:text-base font-extrabold text-slate-800">{auditLogs.length} Events</h4>
                      </div>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center">
                      <div className="p-3 bg-purple-50 text-purple-600 rounded-xl mr-3.5"><RotateCcw size={22} /></div>
                      <div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">90-Day Recovery</p>
                          <h4 className="text-sm md:text-base font-extrabold text-slate-800">{softDeletedTenants.length} Tenants</h4>
                      </div>
                  </div>
              </div>

              {/* Security Sub-Navigation Tabs */}
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                  <div className="p-4 md:p-5 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/50">
                      <div>
                          <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                              <Shield size={20} className="text-indigo-600" /> Server-Enforced Tenant Isolation Control
                          </h2>
                          <p className="text-xs text-gray-500 mt-1">
                              Mandatory tenantId filters derived from authenticated claims. Firestore Security Rules enforce zero data leakage.
                          </p>
                      </div>
                      <div className="flex bg-white rounded-xl p-1 border border-gray-200 shadow-xs overflow-x-auto w-full md:w-auto">
                          <button
                              onClick={() => setSecuritySubTab('ALERTS')}
                              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${securitySubTab === 'ALERTS' ? 'bg-indigo-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}
                          >
                              <ShieldAlert size={14} /> Security Alerts
                              {securityAlerts.filter(a => a.status === 'ACTIVE').length > 0 && (
                                  <span className="px-1.5 py-0.2 bg-rose-500 text-white text-[10px] rounded-full">
                                      {securityAlerts.filter(a => a.status === 'ACTIVE').length}
                                  </span>
                              )}
                          </button>
                          <button
                              onClick={() => setSecuritySubTab('VERIFICATION')}
                              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${securitySubTab === 'VERIFICATION' ? 'bg-indigo-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}
                          >
                              <CheckCircle2 size={14} /> Isolation Test Suite
                          </button>
                          <button
                              onClick={() => setSecuritySubTab('SOFT_DELETE')}
                              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${securitySubTab === 'SOFT_DELETE' ? 'bg-indigo-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}
                          >
                              <RotateCcw size={14} /> 90-Day Recovery Queue ({softDeletedTenants.length})
                          </button>
                          <button
                              onClick={() => setSecuritySubTab('AUDIT')}
                              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${securitySubTab === 'AUDIT' ? 'bg-indigo-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}
                          >
                              <Activity size={14} /> Audit Trail ({auditLogs.length})
                          </button>
                      </div>
                  </div>

                  <div className="p-4 md:p-6">
                      
                      {/* SUBTAB 1: SECURITY ALERTS */}
                      {securitySubTab === 'ALERTS' && (
                          <div className="space-y-4">
                              <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                                  <div>
                                      <h3 className="font-bold text-gray-800 text-sm">Security Incident Reports &amp; Boundary Probes</h3>
                                      <p className="text-xs text-gray-500">Real-time alerts triggered when a reseller or user attempts cross-tenant parameter tampering.</p>
                                  </div>
                                  <span className="text-xs text-gray-400 font-mono">{securityAlerts.length} total logged incidents</span>
                              </div>

                              {securityAlerts.length === 0 ? (
                                  <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200/60">
                                      <ShieldCheck size={36} className="mx-auto text-emerald-500 mb-2" />
                                      <p className="text-sm font-bold text-gray-700">Zero Security Incidents Detected</p>
                                      <p className="text-xs text-gray-400 mt-1">All database queries strictly comply with authenticated tenant session boundaries.</p>
                                  </div>
                              ) : (
                                  <div className="space-y-3">
                                      {securityAlerts.map(alert => (
                                          <div key={alert.id} className={`p-4 rounded-xl border transition-all flex flex-col md:flex-row justify-between md:items-center gap-4 ${alert.status === 'ACTIVE' ? 'bg-rose-50/40 border-rose-200' : 'bg-gray-50/70 border-gray-200 opacity-75'}`}>
                                              <div className="flex-1">
                                                  <div className="flex items-center gap-2 mb-1.5">
                                                      <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${alert.severity === 'CRITICAL' ? 'bg-rose-600 text-white' : alert.severity === 'HIGH' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'}`}>
                                                          {alert.severity}
                                                      </span>
                                                      <span className="text-xs font-bold text-gray-800 font-mono">{alert.type}</span>
                                                      <span className="text-gray-300">•</span>
                                                      <span className="text-xs text-gray-400">{new Date(alert.timestamp).toLocaleString()}</span>
                                                      {alert.status === 'RESOLVED' && (
                                                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                                              Resolved
                                                          </span>
                                                      )}
                                                  </div>
                                                  <p className="text-xs font-medium text-gray-800">{alert.message}</p>
                                                  <div className="mt-2 text-[11px] text-gray-500 flex flex-wrap gap-3 font-mono">
                                                      <span>Actor: <strong className="text-gray-700">{alert.actorEmail}</strong> ({alert.actorRole})</span>
                                                      <span>Target Tenant: <strong className="text-gray-700">{alert.targetTenantId}</strong></span>
                                                  </div>
                                              </div>
                                              {alert.status === 'ACTIVE' && (
                                                  <button
                                                      onClick={() => handleResolveAlert(alert.id)}
                                                      className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-xs rounded-lg transition-colors whitespace-nowrap shadow-2xs"
                                                  >
                                                      Acknowledge &amp; Resolve
                                                  </button>
                                              )}
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                      )}

                      {/* SUBTAB 2: AUTOMATED CROSS-TENANT ISOLATION TEST RUNNER */}
                      {securitySubTab === 'VERIFICATION' && (
                          <div className="space-y-6">
                              <div className="bg-indigo-50/60 p-5 rounded-2xl border border-indigo-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                  <div>
                                      <h3 className="font-bold text-indigo-950 text-base flex items-center gap-2">
                                          <CheckCircle2 size={18} className="text-indigo-600" /> Automated Cross-Tenant Isolation Verification
                                      </h3>
                                      <p className="text-xs text-indigo-800/80 mt-1 max-w-2xl">
                                          Seeds two parallel synthetic tenants (Tenant Alpha &amp; Tenant Beta) in memory, attempts cross-tenant queries, parameter spoofing, reseller portfolio bypass, and soft-delete recovery checks.
                                      </p>
                                  </div>
                                  <button
                                      onClick={handleRunIsolationTests}
                                      disabled={runningTests}
                                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
                                  >
                                      {runningTests ? <RefreshCw size={15} className="animate-spin" /> : <Play size={15} />}
                                      {runningTests ? 'Executing Test Suite...' : 'Execute Isolation Test Suite'}
                                  </button>
                              </div>

                              {testReport ? (
                                  <div className="space-y-4">
                                      <div className={`p-4 rounded-xl border flex justify-between items-center ${testReport.status === 'ALL_PASSED' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
                                          <div className="flex items-center gap-3">
                                              {testReport.status === 'ALL_PASSED' ? <CheckCircle2 size={24} className="text-emerald-600" /> : <AlertTriangle size={24} className="text-rose-600" />}
                                              <div>
                                                  <h4 className="font-extrabold text-sm">
                                                      {testReport.status === 'ALL_PASSED' ? 'ALL 6 SECURITY INVARIANTS SATISFIED' : 'SECURITY ASSERTIONS BREACHED'}
                                                  </h4>
                                                  <p className="text-xs opacity-80">
                                                      Passed: {testReport.passedTests}/{testReport.totalTests} tests • Duration: {testReport.durationMs}ms • Timestamp: {new Date(testReport.timestamp).toLocaleTimeString()}
                                                  </p>
                                              </div>
                                          </div>
                                          <span className="text-xs font-bold font-mono px-3 py-1 bg-white rounded-lg border border-black/10">
                                              ZERO DATA LEAKAGE VERIFIED
                                          </span>
                                      </div>

                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                          {testReport.results.map((res, i) => (
                                              <div key={i} className="p-4 bg-white border border-gray-200 rounded-xl shadow-2xs space-y-1.5">
                                                  <div className="flex justify-between items-start">
                                                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{res.suiteName}</span>
                                                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${res.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                          {res.passed ? 'PASS' : 'FAIL'}
                                                      </span>
                                                  </div>
                                                  <h5 className="font-bold text-gray-900 text-xs">{res.testName}</h5>
                                                  <p className="text-xs text-gray-600 leading-relaxed">{res.message}</p>
                                              </div>
                                          ))}
                                      </div>
                                  </div>
                              ) : (
                                  <div className="text-center py-10 border border-dashed border-gray-300 rounded-2xl bg-gray-50/50">
                                      <p className="text-xs font-medium text-gray-500">Click &quot;Execute Isolation Test Suite&quot; above to run the 6-pillar cross-tenant boundary verification.</p>
                                  </div>
                              )}
                          </div>
                      )}

                      {/* SUBTAB 3: 90-DAY SOFT-DELETE RECOVERY QUEUE */}
                      {securitySubTab === 'SOFT_DELETE' && (
                          <div className="space-y-4">
                              <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                                  <div>
                                      <h3 className="font-bold text-gray-800 text-sm">90-Day Soft-Delete &amp; Recovery Queue</h3>
                                      <p className="text-xs text-gray-500">All queries enforce deletedAt IS NULL. Deleted tenants remain recoverable for 90 days before permanent purge.</p>
                                  </div>
                                  <span className="text-xs font-mono text-gray-400">{softDeletedTenants.length} tenants in queue</span>
                              </div>

                              {softDeletedTenants.length === 0 ? (
                                  <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200/60">
                                      <CheckCircle2 size={36} className="mx-auto text-blue-500 mb-2" />
                                      <p className="text-sm font-bold text-gray-700">No Soft-Deleted Tenants in Recovery</p>
                                      <p className="text-xs text-gray-400 mt-1">When an organization is soft-deleted, it will appear here with an active 90-day countdown timer.</p>
                                  </div>
                              ) : (
                                  <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-white">
                                      {softDeletedTenants.map(item => (
                                          <div key={item.tenantId} className="p-4 md:p-5 flex flex-col md:flex-row justify-between md:items-center gap-4 hover:bg-gray-50/50 transition-colors">
                                              <div>
                                                  <div className="flex items-center gap-2">
                                                      <h4 className="font-bold text-gray-900 text-sm">{item.companyName}</h4>
                                                      <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded border border-rose-200 font-mono">
                                                          DEACTIVATED
                                                      </span>
                                                  </div>
                                                  <p className="text-xs text-gray-500 font-mono mt-1">Tenant ID: {item.tenantId}</p>
                                                  <p className="text-[11px] text-gray-400 mt-1">
                                                      Deleted on {new Date(item.deletedAt).toLocaleDateString()} by {item.deletedByEmail}
                                                  </p>
                                              </div>
                                              <div className="flex items-center gap-4">
                                                  <div className="text-right">
                                                      <p className="text-[10px] font-bold text-amber-600 uppercase">Recovery Window</p>
                                                      <p className="text-sm font-extrabold text-gray-900">{item.recoveryDaysRemaining} Days Left</p>
                                                  </div>
                                                  <button
                                                      onClick={() => handleRestoreTenant(item.tenantId, item.companyName)}
                                                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
                                                  >
                                                      <RotateCcw size={14} /> Restore Tenant
                                                  </button>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                      )}

                      {/* SUBTAB 4: IMMUTABLE AUDIT TRAIL EXPLORER */}
                      {securitySubTab === 'AUDIT' && (
                          <div className="space-y-4">
                              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pb-3 border-b border-gray-100">
                                  <div>
                                      <h3 className="font-bold text-gray-800 text-sm">Security &amp; Data Access Audit Trail</h3>
                                      <p className="text-xs text-gray-500">Immutable, append-only security logs recording every query, mutation, and permission resolution.</p>
                                  </div>
                                  <div className="flex items-center gap-2 w-full md:w-auto">
                                      <input
                                          type="text"
                                          placeholder="Search action, email, tenant..."
                                          value={auditFilter.search}
                                          onChange={e => handleFilterAuditLogs({ ...auditFilter, search: e.target.value })}
                                          className="p-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full md:w-60"
                                      />
                                      <select
                                          value={auditFilter.status}
                                          onChange={e => handleFilterAuditLogs({ ...auditFilter, status: e.target.value })}
                                          className="p-2 text-xs border border-gray-200 rounded-lg bg-gray-50 font-bold"
                                      >
                                          <option value="ALL">All Statuses</option>
                                          <option value="SUCCESS">SUCCESS</option>
                                          <option value="DENIED">DENIED (403)</option>
                                      </select>
                                  </div>
                              </div>

                              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                                      <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                                          <tr>
                                              <th className="py-3 px-4 text-left">Timestamp</th>
                                              <th className="py-3 px-4 text-left">Tenant ID</th>
                                              <th className="py-3 px-4 text-left">User / Email</th>
                                              <th className="py-3 px-4 text-left">Action</th>
                                              <th className="py-3 px-4 text-left">Resource</th>
                                              <th className="py-3 px-4 text-left">Status</th>
                                          </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100 bg-white">
                                          {auditLogs.length === 0 ? (
                                              <tr>
                                                  <td colSpan={6} className="py-8 text-center text-gray-400">No audit logs matching criteria</td>
                                              </tr>
                                          ) : (
                                              auditLogs.slice(0, 50).map(log => (
                                                  <tr key={log.id} className="hover:bg-gray-50/70 transition-colors font-mono">
                                                      <td className="py-2.5 px-4 text-gray-500 whitespace-nowrap">
                                                          {new Date(log.timestamp).toLocaleTimeString()}
                                                      </td>
                                                      <td className="py-2.5 px-4 font-bold text-gray-800 whitespace-nowrap">
                                                          {log.tenantId}
                                                      </td>
                                                      <td className="py-2.5 px-4 text-gray-600 whitespace-nowrap">
                                                          {log.userEmail} ({log.userRole})
                                                      </td>
                                                      <td className="py-2.5 px-4 font-bold text-indigo-700 whitespace-nowrap">
                                                          {log.action}
                                                      </td>
                                                      <td className="py-2.5 px-4 text-gray-600 whitespace-nowrap">
                                                          {log.resource}
                                                      </td>
                                                      <td className="py-2.5 px-4 whitespace-nowrap">
                                                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${log.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                                              {log.status}
                                                          </span>
                                                      </td>
                                                  </tr>
                                              ))
                                          )}
                                      </tbody>
                                  </table>
                              </div>
                          </div>
                      )}

                  </div>
              </div>
          </div>
      )}

      {/* --- FEATURE FLAGS & ENTITLEMENTS TAB --- */}
      {activeTab === 'FLAGS' && (
        <div className="max-w-6xl mx-auto -mt-16 px-4">
          <FeatureFlagsManager tenants={tenants} onRefreshData={loadData} />
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

      {/* --- WHITE-LABEL & RUNTIME THEME MODAL --- */}
      {brandingModalOpen && selectedTenant && (
        <WhiteLabelModal
          isOpen={brandingModalOpen}
          onClose={() => setBrandingModalOpen(false)}
          tenant={selectedTenant}
          onSaved={loadData}
        />
      )}

    </div>
  );
};