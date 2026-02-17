// src/screens/RegisterScreen.tsx
import React, { useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, collection, addDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { dbService } from '../services/db';
import { Factory, Mail, Lock, User, Loader2, ArrowRight } from 'lucide-react';

interface Props {
  onNavigateToLogin: () => void;
}

export const RegisterScreen: React.FC<Props> = ({ onNavigateToLogin }) => {
  const [formData, setFormData] = useState({
    companyName: '',
    name: '',
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. Check for Pending Invite
      const invite = await dbService.checkInvite(formData.email.toLowerCase());

      // 2. Create Auth User
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      let finalTenantId = '';
      let finalRole = 'FACTORY_OWNER';
      let finalCompanyName = formData.companyName;

      if (invite) {
        // --- JOINING EXISTING FACTORY ---
        finalTenantId = invite.tenantId;
        finalRole = invite.role; // 'SUPERVISOR'
        finalCompanyName = "Joined via Invite"; // Placeholder
        
        // Remove invite after use
        await dbService.deleteInvite(formData.email.toLowerCase());
      } else {
        // --- CREATING NEW FACTORY ---
        const tenantRef = await addDoc(collection(db, 'tenants'), {
            name: formData.companyName,
            ownerId: user.uid,
            createdAt: new Date().toISOString(),
            subscription: 'FREE_TIER'
        });
        finalTenantId = tenantRef.id;
      }

      // 3. Create User Profile
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: formData.email,
        name: formData.name,
        role: finalRole,       
        tenantId: finalTenantId, 
        companyName: finalCompanyName
      });

      // 4. Update Auth Display Name
      await updateProfile(user, { displayName: formData.name });

      // AuthContext will automatically detect the login and redirect
    } catch (err: any) {
      console.error(err);
      setError(err.message.replace('Firebase: ', ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Setup Your Account</h1>
          <p className="text-gray-500 text-sm mt-1">Start managing your workforce today</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Company Name</label>
            <div className="relative">
              <Factory className="absolute left-3 top-3 text-gray-400" size={18} />
              <input 
                required
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Ex: Jethwa Industries"
                value={formData.companyName}
                onChange={e => setFormData({...formData, companyName: e.target.value})}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">If you were invited, this name will be ignored.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Your Name</label>
            <div className="relative">
              <User className="absolute left-3 top-3 text-gray-400" size={18} />
              <input 
                required
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Full Name"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 text-gray-400" size={18} />
              <input 
                required
                type="email"
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="admin@company.com"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-gray-400" size={18} />
              <input 
                required
                type="password"
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="••••••••"
                minLength={6}
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-lg flex items-center justify-center transition-all mt-4"
          >
            {loading ? <Loader2 className="animate-spin" /> : <>Create Account <ArrowRight size={18} className="ml-2"/></>}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-500 text-sm">
            Already have an account?{' '}
            <button onClick={onNavigateToLogin} className="text-blue-600 font-bold hover:underline">
              Login here
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};