// src/screens/ResellerDashboard.tsx
import React, { useState, useEffect } from 'react';
import { Users, Building2, Search, Power, Activity, Crown, Palette, Eye, MailPlus, IndianRupee, Download, X, Layers, Clock, Sparkles } from 'lucide-react';
import { dbService } from '../services/db';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { SubscriptionTier } from '../types/index';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import { WhiteLabelModal } from '../components/WhiteLabelModal';
import { ClientEntitlementsModal } from '../components/ClientEntitlementsModal';

// ---> CHANGE THIS NUMBER TO ADJUST THE FREE TRIAL DAYS <---
const FREE_TRIAL_DAYS = 7;
export const ResellerDashboard: React.FC = () => {
  const { user, profile, impersonateTenant } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Tabs
  const [activeTab, setActiveTab] = useState<'CLIENTS' | 'BILLING'>('CLIENTS');

  // Stats
  const [stats, setStats] = useState({ total: 0, active: 0, workers: 0 });
  const [billingStats, setBillingStats] = useState({ activePaidClients: 0, rate: 150, payout: 0 });

  // Modals
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteData, setInviteData] = useState({ email: '', companyName: '', plan: 'TRIAL' as SubscriptionTier, trialDays: FREE_TRIAL_DAYS });
  
  const [brandingModalOpen, setBrandingModalOpen] = useState(false);
  const [entitlementsModalOpen, setEntitlementsModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [brandingData, setBrandingData] = useState<any>({ appName: '', primaryColor: '#4f46e5', logoUrl: '' });
  
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => { loadData(); }, [user]);

  const loadData = async () => {
    if (!user?.uid) return;
    setLoading(true);
    const clientsData = await dbService.getResellerClients(user.uid);
    setClients(clientsData);
    
    const activeCount = clientsData.filter(c => c.isActive).length;
    const activePaidCount = clientsData.filter(c => c.isActive && c.plan !== 'FREE' && c.plan !== 'TRIAL').length;
    const rate = profile?.commissionRate || 150; 

    setStats({
      total: clientsData.length,
      active: activeCount,
      workers: clientsData.reduce((sum, c) => sum + (c.workerCount || 0), 0)
    });

    setBillingStats({
        activePaidClients: activePaidCount,
        rate: rate,
        payout: activePaidCount * rate
    });

    setLoading(false);
  };

  const handleInviteClient = async () => {
      if (!inviteData.email || !inviteData.companyName) {
        toast.warning("Please fill in both client email and company name");
        return;
      }
      await dbService.inviteResellerClient(user!.uid, inviteData.email, inviteData.companyName, inviteData.plan, inviteData.trialDays);
      toast.success(`Client invite sent to ${inviteData.email}`);
      setInviteModalOpen(false);
      setInviteData({ email: '', companyName: '', plan: 'TRIAL', trialDays: FREE_TRIAL_DAYS });
  };

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    setClients(prev => prev.map(c => c.id === id ? { ...c, isActive: !currentStatus } : c));
    await dbService.toggleTenantStatus(id, currentStatus);
    toast.success(`Client ${currentStatus ? 'deactivated' : 'activated'}`);
    loadData();
  };

  const handlePlanChange = async (tenantId: string, newPlan: SubscriptionTier) => {
    setClients(prev => prev.map(c => c.tenantId === tenantId ? { ...c, plan: newPlan } : c));
    await dbService.updateTenantPlan(tenantId, newPlan);
    toast.success(`Plan upgraded to ${newPlan}`);
    loadData(); 
  };

  const handleImpersonate = async (tenant: any) => {
    try {
      await impersonateTenant(tenant.tenantId, tenant.companyName);
      toast.info(`Switched to ${tenant.companyName} workspace`);
    } catch (err: any) {
      toast.error(err.message || "Access denied: Unauthorized tenant");
    }
  };

  const openBrandingModal = (tenant: any) => {
    setSelectedTenant(tenant);
    setBrandingModalOpen(true);
  };

  const generateInvoice = async () => {
      setIsDownloading(true);
      const element = document.getElementById('invoice-content');
      if (!element) return;
      try {
          element.style.display = 'block'; 
          const dataUrl = await toPng(element, { quality: 1.0, pixelRatio: 2, backgroundColor: '#ffffff' });
          element.style.display = 'none'; 
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
          const imgProps = pdf.getImageProperties(dataUrl);
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
          pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
          const filename = `Commission_Invoice_${new Date().toLocaleString('default', { month: 'short', year: 'numeric' })}.pdf`;
          pdf.save(filename);
          toast.success(`Downloaded ${filename}`);
      } catch (e) {
          toast.error("Failed to generate PDF invoice");
      } finally {
          setIsDownloading(false);
      }
  };

  const filteredClients = clients.filter(c => 
    (c.companyName || '').toLowerCase().includes(searchTerm.toLowerCase()) || (c.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20 relative">
      <div className="bg-blue-900 text-white p-6 md:p-8 pt-10 pb-24 rounded-b-3xl">
         <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-500 rounded-lg"><Users size={24} className="text-white" /></div>
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold">Partner Dashboard</h1>
                        <p className="text-blue-200 text-[10px] md:text-xs tracking-wider uppercase">Manage Clients & Billing</p>
                    </div>
                </div>
                <div className="flex bg-blue-800 rounded-xl p-1 shadow-inner">
                    <button onClick={() => setActiveTab('CLIENTS')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${activeTab === 'CLIENTS' ? 'bg-blue-500 text-white shadow-md' : 'text-blue-200 hover:text-white'}`}>
                        Clients
                    </button>
                    <button onClick={() => setActiveTab('BILLING')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${activeTab === 'BILLING' ? 'bg-blue-500 text-white shadow-md' : 'text-blue-200 hover:text-white'}`}>
                        Billing & Payouts
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                <div className="bg-blue-800 p-4 md:p-5 rounded-2xl border border-blue-700 flex items-center">
                    <div className="p-2 md:p-3 bg-white/10 rounded-xl mr-3 md:mr-4"><Building2 className="text-white" size={20} /></div>
                    <div>
                        <h3 className="text-xl md:text-3xl font-bold">{stats.active}</h3>
                        <p className="text-blue-200 text-[9px] md:text-xs uppercase font-bold">Active Clients (Total)</p>
                    </div>
                </div>
                <div className="bg-blue-800 p-4 md:p-5 rounded-2xl border border-blue-700 flex items-center">
                    <div className="p-2 md:p-3 bg-white/10 rounded-xl mr-3 md:mr-4"><IndianRupee className="text-white" size={20} /></div>
                    <div>
                        <h3 className="text-xl md:text-3xl font-bold text-green-400">₹{billingStats.payout}</h3>
                        <p className="text-blue-200 text-[9px] md:text-xs uppercase font-bold">Est. Monthly Payout</p>
                    </div>
                </div>
                <div className="col-span-2 md:col-span-1 bg-blue-800 p-4 md:p-5 rounded-2xl border border-blue-700 flex items-center">
                    <div className="p-2 md:p-3 bg-white/10 rounded-xl mr-3 md:mr-4"><Activity className="text-white" size={20} /></div>
                    <div>
                        <h3 className="text-xl md:text-3xl font-bold">{stats.workers}</h3>
                        <p className="text-blue-200 text-[9px] md:text-xs uppercase font-bold">Managed Workforce</p>
                    </div>
                </div>
            </div>
         </div>
      </div>

      {activeTab === 'CLIENTS' && (
          <div className="max-w-6xl mx-auto -mt-16 px-4">
             <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mb-6">
                 <div className="p-4 md:p-5 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                     <div className="relative w-full sm:w-72">
                         <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                         <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search your clients..." className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-blue-500" />
                     </div>
                     <button onClick={() => setInviteModalOpen(true)} className="w-full sm:w-auto flex items-center justify-center bg-blue-600 text-white px-4 py-2.5 rounded-lg font-bold text-sm shadow-md hover:bg-blue-700 transition-colors">
                        <MailPlus size={16} className="mr-2" /> Invite Client
                     </button>
                 </div>

                 <div className="divide-y divide-gray-100 bg-gray-50/50">
                    {loading ? <div className="p-12 text-center">Loading...</div> : 
                     filteredClients.map((client) => {
                        const plan = client.plan || 'TRIAL';
                        const hasPayroll = plan === 'PRO' || plan === 'ENTERPRISE' || plan === 'TRIAL' || client.featureOverrides?.ADVANCED_PAYROLL === true;
                        const hasKiosk = (plan !== 'FREE') || client.featureOverrides?.KIOSK_MODE === true;
                        const hasWhiteLabel = plan === 'PRO' || plan === 'ENTERPRISE' || plan === 'TRIAL' || client.featureOverrides?.WHITE_LABEL === true;
                        const hasIdCards = (plan !== 'FREE') || client.featureOverrides?.DIGITAL_ID_CARDS === true;
                        const hasAi = plan === 'ENTERPRISE' || plan === 'TRIAL' || client.featureOverrides?.AI_CHAT === true;

                        return (
                          <div key={client.id} className="p-4 md:p-6 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 border-b border-gray-100 last:border-b-0">
                              <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="font-bold text-gray-900 text-base md:text-lg truncate">
                                      {client.branding?.appName || client.companyName || 'Unnamed'}
                                    </h3>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono uppercase ${
                                      plan === 'ENTERPRISE' ? 'bg-amber-100 text-amber-800' :
                                      plan === 'PRO' ? 'bg-purple-100 text-purple-800' :
                                      plan === 'STARTER' ? 'bg-blue-100 text-blue-800' :
                                      plan === 'TRIAL' ? 'bg-emerald-100 text-emerald-800' :
                                      'bg-gray-100 text-gray-700'
                                    }`}>
                                      {plan}
                                    </span>
                                    {client.pendingDowngrade && (
                                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1 font-mono">
                                        <Clock size={10} />
                                        <span>Grace Period: &rarr; {client.pendingDowngrade.targetPlan}</span>
                                      </span>
                                    )}
                                  </div>

                                  <div className="mt-1 text-xs md:text-sm text-gray-600 flex items-center gap-2">
                                      <span className="font-medium">{client.name}</span><span className="text-gray-300">•</span><span>{client.email}</span>
                                  </div>

                                  {/* At-a-glance feature entitlements pills */}
                                  <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">
                                      Entitlements:
                                    </span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                                      hasPayroll ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-400 line-through'
                                    }`}>
                                      Payroll
                                    </span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                                      hasKiosk ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-400 line-through'
                                    }`}>
                                      Kiosk
                                    </span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                                      hasWhiteLabel ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-400 line-through'
                                    }`}>
                                      White-Label
                                    </span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                                      hasIdCards ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-400 line-through'
                                    }`}>
                                      ID Cards
                                    </span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                                      hasAi ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-400 line-through'
                                    }`}>
                                      AI Insights
                                    </span>
                                  </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                  <select value={client.plan || 'TRIAL'} onChange={(e) => handlePlanChange(client.tenantId, e.target.value as SubscriptionTier)} className="px-3 py-1.5 bg-blue-50 border border-blue-100 text-blue-900 text-xs font-bold rounded-lg focus:outline-none">
                                      <option value="FREE">FREE</option>
                                      <option value="TRIAL">TRIAL</option>
                                      <option value="STARTER">STARTER</option>
                                      <option value="PRO">PRO</option>
                                      <option value="ENTERPRISE">ENTERPRISE</option>
                                  </select>

                                  <button 
                                      onClick={() => { setSelectedTenant(client); setEntitlementsModalOpen(true); }} 
                                      className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-xs font-semibold flex items-center gap-1.5"
                                      title="View All Plan Entitlements"
                                  >
                                      <Layers size={14} className="text-blue-600" />
                                      <span className="hidden sm:inline">Entitlements</span>
                                  </button>

                                  <button onClick={() => openBrandingModal(client)} className="p-2 bg-white border border-purple-200 text-purple-600 rounded-lg hover:bg-purple-50 transition-colors" title="White-Label Branding"><Palette size={16} /></button>
                                  <button onClick={() => handleImpersonate(client)} className="p-2 bg-white border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors" title="Login As"><Eye size={16} /></button>
                                  <button onClick={() => toggleStatus(client.id, client.isActive)} className={`p-2 rounded-lg border transition-colors ${client.isActive ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-green-200 text-green-500 hover:bg-green-50'}`} title="Toggle Status"><Power size={16} /></button>
                              </div>
                          </div>
                        );
                     })}
                 </div>
             </div>
          </div>
      )}

      {activeTab === 'BILLING' && (
          <div className="max-w-6xl mx-auto -mt-16 px-4">
             <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mb-6 p-6 md:p-10">
                 <div className="text-center max-w-lg mx-auto mb-10">
                     <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                         <IndianRupee size={32} />
                     </div>
                     <h2 className="text-2xl font-black text-gray-800">Monthly Commission Statement</h2>
                     <p className="text-gray-500 mt-2 text-sm">Download your automated invoice to send to your CA for this month's partner payouts.</p>
                 </div>

                 <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-8 flex flex-col md:flex-row justify-between items-center">
                     <div className="grid grid-cols-2 md:grid-cols-3 w-full gap-6">
                         <div>
                             <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Billing Period</p>
                             <p className="text-lg font-bold text-gray-900 mt-1">{new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
                         </div>
                         <div>
                             <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Active Paid Licenses</p>
                             <p className="text-lg font-bold text-gray-900 mt-1">{billingStats.activePaidClients} Paid Clients</p>
                             <p className="text-[10px] text-gray-400 mt-0.5">(Excludes FREE and TRIAL plans)</p>
                         </div>
                         <div className="col-span-2 md:col-span-1">
                             <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Total Commission Owed</p>
                             <p className="text-2xl font-black text-green-600 mt-1">₹{billingStats.payout.toLocaleString()}</p>
                         </div>
                     </div>
                 </div>

                 <button 
                     onClick={generateInvoice}
                     disabled={isDownloading || billingStats.payout === 0}
                     className="w-full md:w-auto mx-auto flex justify-center items-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-8 py-3 rounded-xl font-bold text-lg transition-colors shadow-lg shadow-blue-200"
                 >
                     <Download size={20} className="mr-2" /> 
                     {isDownloading ? 'Generating PDF...' : 'Download Tax Invoice'}
                 </button>

                 {billingStats.payout === 0 && (
                     <p className="text-center text-sm text-orange-500 font-medium mt-4">
                         You need at least 1 active paid client to generate an invoice.
                     </p>
                 )}
             </div>
          </div>
      )}

      {/* Hidden Invoice HTML for PDF Generation */}
      <div id="invoice-content" style={{ display: 'none', width: '800px', padding: '60px', backgroundColor: '#fff', color: '#000' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '20px', marginBottom: '40px' }}>
              <div>
                  <h1 style={{ fontSize: '32px', margin: 0, color: '#1e3a8a' }}>TAX INVOICE</h1>
                  <p style={{ margin: '5px 0', color: '#666' }}>Partner Commission Statement</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                  <h2 style={{ margin: 0 }}>{profile?.companyName || 'Reseller Partner'}</h2>
                  <p style={{ margin: '5px 0', color: '#666' }}>{profile?.email}</p>
                  <p style={{ margin: '5px 0', color: '#666' }}>Date: {new Date().toLocaleDateString()}</p>
              </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px' }}>
              <thead>
                  <tr style={{ backgroundColor: '#f3f4f6', textAlign: 'left' }}>
                      <th style={{ padding: '15px', borderBottom: '1px solid #ccc' }}>Description</th>
                      <th style={{ padding: '15px', borderBottom: '1px solid #ccc', textAlign: 'right' }}>Quantity</th>
                      <th style={{ padding: '15px', borderBottom: '1px solid #ccc', textAlign: 'right' }}>Rate (₹)</th>
                      <th style={{ padding: '15px', borderBottom: '1px solid #ccc', textAlign: 'right' }}>Amount (₹)</th>
                  </tr>
              </thead>
              <tbody>
                  <tr>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>SaaS Reseller Commission - {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee', textAlign: 'right' }}>{billingStats.activePaidClients} Paid Tenants</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee', textAlign: 'right' }}>{billingStats.rate}.00</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee', textAlign: 'right' }}>{billingStats.payout.toLocaleString()}.00</td>
                  </tr>
              </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ width: '300px', backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <strong>Total Amount Due:</strong>
                      <strong style={{ fontSize: '20px', color: '#16a34a' }}>₹{billingStats.payout.toLocaleString()}.00</strong>
                  </div>
              </div>
          </div>
          <div style={{ marginTop: '80px', textAlign: 'center', color: '#888', fontSize: '12px' }}>
              <p>This is a computer generated invoice.</p>
          </div>
      </div>

      {/* --- MODALS --- */}
      
      {/* Invite Modal */}
      {inviteModalOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                  <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                      <div className="flex items-center">
                          <MailPlus size={18} className="text-blue-600 mr-2" />
                          <h3 className="font-bold text-lg text-gray-800">Invite New Client</h3>
                      </div>
                      <button onClick={() => setInviteModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={20}/></button>
                  </div>
                  
                  <div className="p-5 space-y-4">
                      <div>
                          <label className="text-xs font-bold text-gray-700 uppercase">Client Email</label>
                          <input 
                              type="email" placeholder="client@factory.com" 
                              value={inviteData.email} onChange={e => setInviteData({...inviteData, email: e.target.value})}
                              className="w-full mt-1.5 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-gray-700 uppercase">Company Name</label>
                          <input 
                              type="text" placeholder="e.g. Acme Industries" 
                              value={inviteData.companyName} onChange={e => setInviteData({...inviteData, companyName: e.target.value})}
                              className="w-full mt-1.5 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-gray-700 uppercase">Assign Initial Plan</label>
                          <select 
                              value={inviteData.plan} onChange={e => setInviteData({...inviteData, plan: e.target.value as SubscriptionTier})}
                              className="w-full mt-1.5 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                              <option value="FREE">FREE</option>
                              <option value="TRIAL">TRIAL</option>
                              <option value="STARTER">STARTER</option>
                              <option value="PRO">PRO</option>
                              <option value="ENTERPRISE">ENTERPRISE</option>
                          </select>
                      </div>

                      {/* Custom Trial Duration Selector */}
                      {inviteData.plan === 'TRIAL' && (
                          <div>
                              <label className="text-xs font-bold text-gray-700 uppercase">Trial Duration (Days)</label>
                              <input 
                                  type="number" 
                                  value={inviteData.trialDays} 
                                  onChange={e => setInviteData({...inviteData, trialDays: parseInt(e.target.value) || 0})}
                                  min={1}
                                  max={365}
                                  className="w-full mt-1.5 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                          </div>
                      )}
                  </div>
                  <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end space-x-3">
                      <button onClick={() => setInviteModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
                      <button onClick={handleInviteClient} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors">Send Invite</button>
                  </div>
              </div>
          </div>
      )}

      {/* Full-Featured White-Label & Runtime Theme Modal */}
      {brandingModalOpen && selectedTenant && (
        <WhiteLabelModal
          isOpen={brandingModalOpen}
          onClose={() => setBrandingModalOpen(false)}
          tenant={selectedTenant}
          onSaved={loadData}
        />
      )}

      {/* Per-Tenant Entitlements Inspector Modal */}
      {entitlementsModalOpen && selectedTenant && (
        <ClientEntitlementsModal
          isOpen={entitlementsModalOpen}
          onClose={() => setEntitlementsModalOpen(false)}
          tenant={selectedTenant}
          onUpgradePlan={handlePlanChange}
        />
      )}

    </div>
  );
};