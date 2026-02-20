import React, { useState, useEffect } from 'react';
import { 
  Users, Building2, Search, Shield, Power, Activity, TrendingUp 
} from 'lucide-react';
import { dbService } from '../services/db';
import { useAuth } from '../contexts/AuthContext';

export const SuperAdminDashboard: React.FC = () => {
  const { profile } = useAuth();
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, workers: 0 });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await dbService.getAllTenants();
    
    setTenants(data);
    setStats({
      total: data.length,
      active: data.filter(t => t.isActive).length,
      workers: data.reduce((sum, t) => sum + (t.workerCount || 0), 0)
    });
    setLoading(false);
  };

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    if(!window.confirm(`Are you sure you want to ${currentStatus ? 'DEACTIVATE' : 'ACTIVATE'} this organization?`)) return;
    
    // Optimistic update
    setTenants(prev => prev.map(t => t.id === id ? { ...t, isActive: !currentStatus } : t));
    await dbService.toggleTenantStatus(id, currentStatus);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Hero Section */}
      <div className="bg-slate-900 text-white p-8 pt-10 pb-24">
         <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center space-x-3">
                    <div className="p-2 bg-indigo-500 rounded-lg">
                        <Shield size={24} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Super Admin</h1>
                        <p className="text-slate-400 text-xs tracking-wider uppercase">Master Control Panel</p>
                    </div>
                </div>
                <div className="text-right hidden sm:block">
                   <p className="text-slate-400 text-sm">System Status</p>
                   <p className="text-green-400 font-bold flex items-center justify-end">
                     <Activity size={14} className="mr-1"/> Operational
                   </p>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700 flex items-center">
                    <div className="p-3 bg-blue-500/20 rounded-xl mr-4">
                        <Building2 className="text-blue-400" size={24} />
                    </div>
                    <div>
                        <h3 className="text-3xl font-bold">{stats.total}</h3>
                        <p className="text-slate-400 text-xs uppercase font-bold">Total Organizations</p>
                    </div>
                </div>
                <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700 flex items-center">
                    <div className="p-3 bg-green-500/20 rounded-xl mr-4">
                        <Activity className="text-green-400" size={24} />
                    </div>
                    <div>
                        <h3 className="text-3xl font-bold">{stats.active}</h3>
                        <p className="text-slate-400 text-xs uppercase font-bold">Active Licenses</p>
                    </div>
                </div>
                <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700 flex items-center">
                    <div className="p-3 bg-purple-500/20 rounded-xl mr-4">
                        <Users className="text-purple-400" size={24} />
                    </div>
                    <div>
                        <h3 className="text-3xl font-bold">{stats.workers}</h3>
                        <p className="text-slate-400 text-xs uppercase font-bold">Total Workforce</p>
                    </div>
                </div>
            </div>
         </div>
      </div>

      {/* Main Content Card - Floating effect */}
      <div className="max-w-6xl mx-auto -mt-12 px-4">
         <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
             
             {/* Toolbar */}
             <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                 <h2 className="font-bold text-gray-800">Organization List</h2>
                 <div className="relative w-full sm:w-72">
                     <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                     <input 
                       type="text" 
                       placeholder="Search by name or email..." 
                       className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                     />
                 </div>
             </div>

             {/* Table */}
             <div className="overflow-x-auto">
                 <table className="w-full text-left">
                     <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold">
                         <tr>
                             <th className="p-4 pl-6">Company</th>
                             <th className="p-4">Owner Contact</th>
                             <th className="p-4 text-center">Workforce</th>
                             <th className="p-4">Joined Date</th>
                             <th className="p-4 text-center">Status</th>
                             <th className="p-4 text-right pr-6">Actions</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            <tr><td colSpan={6} className="p-8 text-center text-gray-400">Loading directory...</td></tr>
                        ) : tenants.map((tenant) => (
                            <tr key={tenant.id} className="hover:bg-gray-50 transition-colors group">
                                <td className="p-4 pl-6">
                                    <p className="font-bold text-gray-900">{tenant.companyName || 'Unnamed Company'}</p>
                                    <p className="text-xs text-gray-400 font-mono">{tenant.tenantId}</p>
                                </td>
                                <td className="p-4">
                                    <p className="text-sm text-gray-700">{tenant.name}</p>
                                    <p className="text-xs text-gray-500">{tenant.email}</p>
                                </td>
                                <td className="p-4 text-center">
                                    <span className="inline-block bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold">
                                        {tenant.workerCount}
                                    </span>
                                </td>
                                <td className="p-4 text-sm text-gray-500">
                                    {new Date(tenant.joinedAt).toLocaleDateString()}
                                </td>
                                <td className="p-4 text-center">
                                    {tenant.isActive ? (
                                        <span className="inline-flex items-center text-green-600 bg-green-50 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide">
                                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse"></span> Active
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center text-red-600 bg-red-50 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide">
                                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-1.5"></span> Inactive
                                        </span>
                                    )}
                                </td>
                                <td className="p-4 text-right pr-6">
                                    <button 
                                        onClick={() => toggleStatus(tenant.id, tenant.isActive)}
                                        className={`p-2 rounded-lg transition-all ${
                                            tenant.isActive 
                                            ? 'text-red-500 hover:bg-red-50 hover:text-red-700' 
                                            : 'text-green-500 hover:bg-green-50 hover:text-green-700'
                                        }`}
                                        title={tenant.isActive ? "Deactivate Account" : "Activate Account"}
                                    >
                                        <Power size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                     </tbody>
                 </table>
             </div>
             
             {/* Empty State */}
             {tenants.length === 0 && !loading && (
                 <div className="p-12 text-center text-gray-400">
                     <Building2 size={48} className="mx-auto mb-4 opacity-20"/>
                     <p>No organizations found.</p>
                 </div>
             )}
         </div>
      </div>
    </div>
  );
};