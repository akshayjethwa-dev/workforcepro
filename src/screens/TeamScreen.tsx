// src/screens/TeamScreen.tsx
import React, { useState, useEffect } from 'react';
import { UserPlus, Shield, Trash2, Lock, Users, AlertTriangle, Loader2, MapPin } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dbService } from '../services/db';
import { Branch } from '../types/index';
import { TruncatedText } from '../components/TruncatedText';

export const TeamScreen: React.FC = () => {
  const { profile, limits } = useAuth();
  const { toast } = useToast();
  const [team, setTeam] = useState<any[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('default');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Member deletion modal
  const [memberToRemove, setMemberToRemove] = useState<any | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const loadTeam = async () => {
    if (profile?.tenantId) {
      try {
        const [data, settings] = await Promise.all([
          dbService.getTeam(profile.tenantId),
          dbService.getOrgSettings(profile.tenantId),
        ]);
        setTeam(data);
        const branchList = settings.branches?.length
          ? settings.branches
          : [{ id: 'default', name: 'Main Branch (Head Office)' }];
        setBranches(branchList);
        if (!branchList.some(b => b.id === selectedBranchId)) {
          setSelectedBranchId(branchList[0].id);
        }
      } catch (err) {
        console.error("Failed to load team", err);
      }
    }
  };

  useEffect(() => { loadTeam(); }, [profile]);

  if (limits?.maxManagers === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
        <div className="bg-white p-8 rounded-2xl shadow-xs border border-slate-200 text-center max-w-md w-full">
          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
            <Lock size={26} />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1.5">Team Management Locked</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Assigning additional supervisors or managers is available on Pro & Enterprise plans. Only the Factory Owner currently has administrative access.
          </p>
        </div>
      </div>
    );
  }

  const handleInvite = async () => {
    if (!email || !name) {
      toast.error("Please enter supervisor name and valid email");
      return;
    }
    
    if (limits && team.length >= limits.maxManagers) {
      toast.error(`Your current plan allows a maximum of ${limits.maxManagers} supervisor(s). Please upgrade in Billing.`);
      return;
    }

    setLoading(true);
    try {
      const assignedBranch = branches.find(b => b.id === selectedBranchId);
      await dbService.inviteManager(
        profile!.tenantId,
        email.toLowerCase().trim(),
        name.trim(),
        selectedBranchId,
        assignedBranch?.name || 'Main Branch (Head Office)'
      );
      toast.success(`Branch Manager invite sent to ${email} (${assignedBranch?.name || 'Main Branch'}).`);
      setEmail('');
      setName('');
      loadTeam();
    } catch (e: any) {
      console.error(e);
      toast.error("Error creating supervisor invitation");
    } finally {
      setLoading(false);
    }
  };

  const confirmRemove = async () => {
    if (!memberToRemove) return;
    setIsRemoving(true);
    try {
      await dbService.removeManager(memberToRemove.uid);
      setTeam(prev => prev.filter(m => m.uid !== memberToRemove.uid));
      toast.success(`Revoked access for ${memberToRemove.name}`);
      setMemberToRemove(null);
    } catch(e: any) {
      console.error(e);
      toast.error("Error revoking manager access");
    } finally {
      setIsRemoving(false);
    }
  };

  const seatsUsed = team.length;
  const maxSeats = limits?.maxManagers ?? 10;

  return (
    <div className="space-y-6 pb-12">
      {/* TOOLBAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
        <div className="min-w-0">
          <h1 className="text-fluid-xl font-bold tracking-tight text-slate-900 break-words">Supervisors &amp; Permissions</h1>
          <div className="text-fluid-xs text-slate-500 flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
            <span>Manage factory floor managers and shift operators</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums text-slate-600">{seatsUsed} of {maxSeats} seats active</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* INVITE FORM TILE */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs h-fit">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus size={18} className="text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">Add New Supervisor</h2>
          </div>
          
          {limits && team.length >= limits.maxManagers ? (
            <div className="bg-amber-50/80 text-amber-900 p-4 rounded-xl flex items-start gap-2.5 text-xs border border-amber-200">
              <Lock size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <span>You have reached the supervisor limit ({limits.maxManagers}) for your subscription plan. Upgrade in Billing to add more seats.</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Supervisor Full Name</label>
                <input 
                  type="text"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-600 transition-all" 
                  placeholder="e.g. Vikram Patel" 
                  value={name} 
                  onChange={e => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Work Email Address</label>
                <input 
                  type="email"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-600 transition-all" 
                  placeholder="vikram@factory.com" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Branch (Strict Access Scope)</label>
                <select
                  value={selectedBranchId}
                  onChange={e => setSelectedBranchId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all"
                >
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Manager can only view Dashboard, Attendance &amp; Reports for this assigned branch.
                </p>
              </div>

              <button 
                onClick={handleInvite} 
                disabled={loading} 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-4 rounded-xl font-semibold text-xs shadow-xs transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 mt-1"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                <span>{loading ? "Granting Access..." : "Grant Floor Access"}</span>
              </button>
            </div>
          )}
        </div>

        {/* ACTIVE TEAM ROSTER */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Floor Supervisors</h3>
            <span className="text-xs font-mono text-slate-500 tabular-nums">{team.length} registered</span>
          </div>

          <div className="space-y-2.5">
            {team.length === 0 ? (
              <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center text-slate-400">
                <Users size={32} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">No supervisors invited yet</p>
                <p className="text-xs text-slate-400 mt-1">Add your floor managers using the form to give them attendance punch privileges.</p>
              </div>
            ) : (
              team.map((member, i) => (
                <div 
                  key={i} 
                  className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between gap-3 hover:border-slate-300 transition-all min-w-0"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center font-bold text-fluid-sm shrink-0">
                      {member.name ? member.name.charAt(0).toUpperCase() : 'M'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="min-w-0">
                        <TruncatedText
                          text={member.name || 'Floor Supervisor'}
                          modalTitle="Supervisor Details"
                          details={[
                            { label: 'Work Email', value: member.email || '—', breakAnywhere: true },
                            { label: 'Role', value: 'Floor Supervisor' },
                          ]}
                          className="font-bold text-fluid-sm text-slate-900"
                        />
                      </div>
                      <p className="text-fluid-xs text-slate-500 break-all [overflow-wrap:anywhere] mt-0.5">
                        {member.email}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold">
                          <MapPin size={10} />
                          <span>{member.branchName || (member.branchId === 'branch-anand' ? 'Anand Manufacturing Unit' : 'Main Branch (Head Office)')}</span>
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold">
                          MANAGER
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => setMemberToRemove(member)} 
                    className="p-2 min-w-[2.5rem] min-h-[2.5rem] flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors shrink-0 cursor-pointer" 
                    title="Revoke Access"
                    aria-label={`Revoke access for ${member.name || member.email}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* CONFIRM REVOCATION MODAL */}
      {memberToRemove && (
        <div className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl relative">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <AlertTriangle size={24} />
            </div>
            
            <h2 className="text-fluid-lg font-bold text-center text-slate-900 mb-1">Revoke Supervisor Access?</h2>
            <p className="text-fluid-xs text-slate-500 text-center mb-5 leading-relaxed break-words">
              Are you sure you want to remove <strong>{memberToRemove.name}</strong>{' '}
              (<span className="break-all [overflow-wrap:anywhere] font-mono">{memberToRemove.email}</span>)? They will no longer be able to log in or record attendance.
            </p>

            <div className="flex gap-2.5">
              <button 
                onClick={() => setMemberToRemove(null)}
                disabled={isRemoving}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmRemove}
                disabled={isRemoving}
                className="flex-1 py-2.5 bg-rose-600 text-white font-semibold rounded-xl text-xs hover:bg-rose-700 transition-colors flex items-center justify-center"
              >
                {isRemoving ? <Loader2 size={14} className="animate-spin" /> : 'Confirm Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};