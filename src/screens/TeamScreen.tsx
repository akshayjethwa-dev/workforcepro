import React, { useState, useEffect } from 'react';
import { UserPlus, Shield, Trash2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';

export const TeamScreen: React.FC = () => {
  const { profile } = useAuth();
  const [team, setTeam] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const loadTeam = async () => {
    if (profile?.tenantId) {
      const data = await dbService.getTeam(profile.tenantId);
      setTeam(data);
    }
  };

  useEffect(() => { loadTeam(); }, [profile]);

  const handleInvite = async () => {
    if (!email || !name) return alert("Please enter Name and Email");
    setLoading(true);
    try {
      await dbService.inviteManager(profile!.tenantId, email.toLowerCase(), name);
      alert("Invite Sent! They can now register with this email.");
      setEmail('');
      setName('');
    } catch (e) {
      alert("Error sending invite");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (member: any) => {
      // SPECIFIC WARNING MESSAGE
      const message = `Are you sure you want to remove ${member.name}?\n\nIf you remove them, the person CANNOT login and will lose all access to your factory data immediately.`;
      
      if(!window.confirm(message)) return;
      
      try {
          await dbService.removeManager(member.uid);
          setTeam(prev => prev.filter(m => m.uid !== member.uid));
      } catch(e) {
          alert("Error removing manager");
      }
  };

  return (
    <div className="p-4 bg-gray-50 min-h-screen pb-24">
      <h1 className="text-xl font-bold text-gray-800 mb-6">Manage Team</h1>
      
      {/* Invite Form */}
      <div className="bg-white p-4 rounded-xl shadow-sm mb-6 border border-gray-100">
        <h3 className="text-sm font-bold text-gray-600 mb-3 flex items-center">
            <UserPlus size={16} className="mr-2 text-blue-600"/> Add Supervisor
        </h3>
        <input className="w-full p-3 border rounded-lg mb-2 text-sm outline-none focus:border-blue-500" 
            placeholder="Supervisor Name" value={name} onChange={e => setName(e.target.value)}/>
        <input className="w-full p-3 border rounded-lg mb-2 text-sm outline-none focus:border-blue-500" 
            placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)}/>
        <button onClick={handleInvite} disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold shadow-lg mt-2">
            {loading ? "Processing..." : "Grant Access"}
        </button>
      </div>

      {/* Team List */}
      <h3 className="font-bold text-gray-700 mb-3 text-sm uppercase tracking-wider">Active Managers</h3>
      <div className="space-y-3">
        {team.length === 0 ? (
            <p className="text-gray-400 text-center text-sm py-4 italic">No supervisors added yet.</p>
        ) : (
            team.map((member, i) => (
                <div key={i} className="bg-white p-4 rounded-xl shadow-sm flex items-center justify-between border border-gray-100">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold">
                            {member.name.charAt(0)}
                        </div>
                        <div>
                            <p className="font-bold text-gray-800">{member.name}</p>
                            <p className="text-xs text-gray-500">{member.email}</p>
                        </div>
                    </div>
                    
                    <button onClick={() => handleRemove(member)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors" title="Revoke Access">
                        <Trash2 size={18} />
                    </button>
                </div>
            ))
        )}
      </div>
    </div>
  );
};