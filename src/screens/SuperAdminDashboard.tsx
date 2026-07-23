// src/screens/SuperAdminDashboard.tsx
import React, { useState, useEffect } from 'react';
import { 
  Users, Building2, Search, Shield, Power, Activity, Crown, Sliders, Eye, X, Save, Settings, Palette, Upload, IndianRupee, Handshake, PlusCircle, MailPlus
} from 'lucide-react';
import { dbService } from '../services/db';
import { useAuth } from '../contexts/AuthContext';
import { SubscriptionTier, PlanLimits } from '../types/index';

export const SuperAdminDashboard: React.FC = () => {
  const { profile, impersonateTenant } = useAuth();
  const [tenants, setTenants] = useState<any[]>([]);
  const [resellers, setResellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, workers: 0, totalMRR: 0, totalCommission: 0 });
  const [searchTerm, setSearchTerm] = useState('');

  // --- Tabs ---
  const [activeTab, setActiveTab] = useState<'ORGS' | 'PLANS' | 'PARTNERS'>('ORGS');
  const [globalPlans, setGlobalPlans] = useState<Record<SubscriptionTier, PlanLimits> | null>(null);
  const [savingPlans, setSavingPlans] = useState(false);

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
  const [brandingData, setBrandingData] = useState<any>({ appName: '', primaryColor: '#4f46e5', logoUrl: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [tenantsData, plansData, resellersData] = await Promise.all([
        dbService.getAllTenants(),
        dbService.getGlobalPlanConfig(),
        dbService.getResellers()
    ]);
    
    setTenants(tenantsData);
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
    if(!window.confirm(`Are you sure you want to ${currentStatus ? 'DEACTIVATE' : 'ACTIVATE'} this organization?`)) return;
    setTenants(prev => prev.map(t => t.id === id ? { ...t, isActive: !currentStatus } : t));
    await dbService.toggleTenantStatus(id, currentStatus);
    loadData();
  };

  const handlePlanChange = async (tenantId: string, newPlan: SubscriptionTier) => {
    if(!window.confirm(`Are you sure you want to change this tenant's plan to ${newPlan}?`)) return;
    setTenants(prev => prev.map(t => t.tenantId === tenantId ? { ...t, plan: newPlan } : t));
    try {
        await dbService.updateTenantPlan(tenantId, newPlan);
    } catch (error) {
        alert("Failed to update plan. Please try again.");
        loadData();
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
      loadData(); 
  };

  const openBrandingModal = (tenant: any) => {
    setSelectedTenant(tenant);
    setBrandingData({
      appName: tenant.branding?.appName || tenant.companyName || '',
      primaryColor: tenant.branding?.primaryColor || '#4f46e5',
      logoUrl: tenant.branding?.logoUrl || ''
    });
    setBrandingModalOpen(true);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1048576) { 
          alert("Image is too large. Please select an image under 1MB.");
          return;
      }
      const reader = new FileReader();
      reader.onloadend = () => setBrandingData({ ...brandingData, logoUrl: reader.result as string });
      reader.readAsDataURL(file);
    }
  };

  const saveBranding = async () => {
    if(!selectedTenant) return;
    await dbService.updateTenantBranding(selectedTenant.tenantId, brandingData);
    setBrandingModalOpen(false);
    loadData(); 
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
          alert("Global Plans Updated Successfully!");
      } catch (error) { alert("Failed to save plans."); }
      setSavingPlans(false);
  };

  const handleMakeReseller = async (userId: string, companyName: string) => {
    if(window.confirm(`Upgrade ${companyName || 'this account'} to a Reseller Partner?`)) {
        await dbService.makeReseller(userId);
        alert(`${companyName || 'The account'} is now a Reseller!`);
        loadData();
    }
  };

  const updateCommission = async (userId: string, currentRate: number) => {
      const newRate = prompt("Enter new commission rate (₹ per active client/month):", currentRate.toString());
      if (newRate && !isNaN(Number(newRate))) {
          await dbService.updateResellerCommission(userId, Number(newRate));
          loadData();
      }
  };

  // --- NEW: Reseller Invite Handler ---
  const handleInviteReseller = async () => {
    if (!newReseller.companyName || !newReseller.ownerEmail) {
        return alert("Please fill in the Agency Name and Email.");
    }
    
    try {
        await dbService.inviteResellerPartner(newReseller.ownerEmail, newReseller.companyName, newReseller.commissionRate);
        alert(`Reseller invite sent to ${newReseller.ownerEmail}!\n\nWhen they register their account, they will automatically be assigned the Partner Dashboard and their ₹${newReseller.commissionRate} commission slab.`);
        setShowCreateReseller(false);
        setNewReseller({ companyName: '', ownerEmail: '', commissionRate: 150 });
    } catch (error) {
        console.error("Failed to invite reseller:", error);
        alert("Failed to send invite.");
    }
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
                                        <button onClick={() => toggleStatus(tenant.id, tenant.isActive)} className={`p-2 rounded-lg border ${tenant.isActive ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-green-200 text-green-500 hover:bg-green-50'}`}><Power size={16} /></button>
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

      {/* --- BRANDING MODAL --- */}
      {brandingModalOpen && selectedTenant && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all">
                  
                  <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                      <div className="flex items-center">
                          <Palette size={18} className="text-purple-500 mr-2" />
                          <h3 className="font-bold text-lg text-gray-800">White-Label Config</h3>
                      </div>
                      <button onClick={() => setBrandingModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                          <X size={20}/>
                      </button>
                  </div>
                  
                  <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
                      
                      <div>
                          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Application Name</label>
                          <input 
                              type="text" 
                              value={brandingData.appName}
                              onChange={e => setBrandingData({...brandingData, appName: e.target.value})}
                              placeholder="e.g. My Factory App"
                              className="w-full mt-1.5 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                      </div>

                      <div>
                          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Primary Theme Color</label>
                          <div className="flex items-center mt-1.5 space-x-3">
                              <input 
                                  type="color" 
                                  value={brandingData.primaryColor}
                                  onChange={e => setBrandingData({...brandingData, primaryColor: e.target.value})}
                                  className="h-10 w-14 rounded cursor-pointer border-0 p-0"
                              />
                              <input 
                                  type="text" 
                                  value={brandingData.primaryColor}
                                  onChange={e => setBrandingData({...brandingData, primaryColor: e.target.value})}
                                  className="flex-1 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                              />
                          </div>
                      </div>

                      <div>
                          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Brand Logo</label>
                          <div className="mt-1.5 flex items-center space-x-4">
                              {brandingData.logoUrl ? (
                                  <div className="relative group">
                                      <img src={brandingData.logoUrl} className="w-16 h-16 rounded-lg object-contain bg-gray-50 border border-gray-200 p-1" alt="Logo preview" />
                                      <button 
                                        onClick={() => setBrandingData({...brandingData, logoUrl: ''})}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                      >
                                          <X size={12} />
                                      </button>
                                  </div>
                              ) : (
                                  <div className="w-16 h-16 rounded-lg bg-gray-50 border border-gray-200 border-dashed flex items-center justify-center text-gray-400">
                                      <Upload size={20} />
                                  </div>
                              )}
                              <div className="flex-1">
                                  <input 
                                      type="file" 
                                      accept="image/*"
                                      onChange={handleLogoUpload}
                                      className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 cursor-pointer"
                                  />
                                  <p className="text-[10px] text-gray-400 mt-1">Recommended: Transparent PNG, under 1MB.</p>
                              </div>
                          </div>
                      </div>
                  </div>

                  <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end space-x-3">
                      <button 
                          onClick={() => setBrandingModalOpen(false)} 
                          className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                          Cancel
                      </button>
                      <button 
                          onClick={saveBranding} 
                          className="px-4 py-2 text-sm font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-md transition-colors"
                      >
                          Apply Branding
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};