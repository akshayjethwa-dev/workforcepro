// src/screens/RegisterScreen.tsx
import React, { useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, collection, addDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { dbService } from '../services/db';
import { Factory, Mail, Lock, User, Phone, Loader2, ArrowRight, Eye, EyeOff } from 'lucide-react';

interface Props {
  onNavigateToLogin: () => void;
}

export const RegisterScreen: React.FC<Props> = ({ onNavigateToLogin }) => {
  const [formData, setFormData] = useState({
    companyName: '',
    name: '',
    phone: '',
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);

  const validatePassword = (password: string) => {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return regex.test(password);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.companyName.trim()) return setError("Company Name is required.");
    if (!formData.name.trim()) return setError("Your Name is required.");
    if (!formData.phone.trim() || !/^\d{10}$/.test(formData.phone)) return setError("Valid 10-digit Phone Number is required.");
    if (!formData.email.trim()) return setError("Email Address is required.");
    if (!validatePassword(formData.password)) {
      return setError("Password must be at least 8 characters long, contain one uppercase letter, one lowercase letter, one number, and one special character.");
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      const invite = await dbService.checkInvite(formData.email.toLowerCase());

      let finalTenantId = '';
      let finalRole = 'FACTORY_OWNER';
      let finalCompanyName = formData.companyName;

      if (invite) {
        finalTenantId = invite.tenantId;
        finalRole = invite.role; 
        finalCompanyName = "Joined via Invite"; 
        await dbService.deleteInvite(formData.email.toLowerCase());
      } else {
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 30);

        const tenantRef = await addDoc(collection(db, 'tenants'), {
            name: formData.companyName,
            ownerId: user.uid,
            createdAt: new Date().toISOString(),
            plan: 'TRIAL',
            trialEndsAt: trialEndDate.toISOString() 
        });
        finalTenantId = tenantRef.id;
      }

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: formData.email,
        name: formData.name,
        phone: formData.phone, 
        role: finalRole,       
        tenantId: finalTenantId, 
        companyName: finalCompanyName
      });

      await updateProfile(user, { displayName: formData.name });
      setTimeout(() => {
         window.location.reload(); 
      }, 500);

    } catch (err: any) {
      console.error(err);
      setError(err.message.replace('Firebase: ', ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    // Mobile Optimization: 100dvh and safe flex scrolling
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col items-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-8 my-auto shrink-0 mb-6 mt-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Setup Your Account</h1>
          <p className="text-gray-500 text-sm mt-1">Start your 30-day free trial today</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-xs mb-6 text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1 ml-1">Company Name *</label>
            <div className="relative">
              <Factory className="absolute left-3 top-3.5 text-gray-400" size={18} />
              <input 
                className="w-full pl-10 pr-4 py-3.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[48px]"
                placeholder="Ex: Jethwa Industries"
                value={formData.companyName}
                onChange={e => setFormData({...formData, companyName: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1 ml-1">Your Name *</label>
            <div className="relative">
              <User className="absolute left-3 top-3.5 text-gray-400" size={18} />
              <input 
                className="w-full pl-10 pr-4 py-3.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[48px]"
                placeholder="Full Name"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1 ml-1">Phone Number *</label>
            <div className="relative">
              <Phone className="absolute left-3 top-3.5 text-gray-400" size={18} />
              <input 
                type="tel"
                maxLength={10}
                className="w-full pl-10 pr-4 py-3.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[48px]"
                placeholder="10-digit mobile number"
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, '')})}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1 ml-1">Email Address *</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 text-gray-400" size={18} />
              <input 
                type="email"
                className="w-full pl-10 pr-4 py-3.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[48px]"
                placeholder="admin@company.com"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1 ml-1">Password *</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 text-gray-400" size={18} />
              <input 
                type={showPassword ? "text" : "password"} 
                className="w-full pl-10 pr-12 py-3.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[48px]"
                placeholder="••••••••"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
              />
              {/* Mobile Optimization: w-11 h-11 expands the touch area for the icon */}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-1 top-1 w-11 h-11 flex items-center justify-center text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 leading-tight ml-1">Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char.</p>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full min-h-[52px] bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-lg flex items-center justify-center transition-all mt-4 active:scale-95"
          >
            {loading ? <Loader2 className="animate-spin" /> : <>Create Account <ArrowRight size={18} className="ml-2"/></>}
          </button>
        </form>

        <div className="mt-6 text-center flex flex-col items-center">
          <p className="text-gray-500 text-sm mb-1">Already have an account?</p>
          <button onClick={onNavigateToLogin} className="text-blue-600 font-bold hover:underline min-h-[44px] px-4 flex items-center">
            Login here
          </button>
        </div>
      </div>
    </div>
  );
};