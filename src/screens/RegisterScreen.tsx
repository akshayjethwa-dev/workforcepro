// src/screens/RegisterScreen.tsx
import React, { useRef, useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, collection, addDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { dbService } from '../services/db';
import { Factory, Mail, Lock, User, Phone, Loader2, ArrowRight, Eye, EyeOff, X, Building2 } from 'lucide-react';
import { InlineFieldError } from '../components/InlineFieldError';
import {
  advanceToNextFormField,
  scrollElementAboveKeyboard,
  scrollToFirstInvalidField,
  useKeyboardAwareLayout,
} from '../hooks/useKeyboardAwareLayout';
// ---> CHANGE THIS NUMBER TO ADJUST THE FREE TRIAL DAYS <---
const FREE_TRIAL_DAYS = 7;

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { keyboardHeight } = useKeyboardAwareLayout();
  
  const [showPassword, setShowPassword] = useState(false);
  
  // New State for Legal Docs
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const clearFieldError = (field: string) => {
    setFieldErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validatePassword = (password: string) => {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return regex.test(password);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Your Name is required.';
    if (!formData.phone.trim() || !/^\d{10}$/.test(formData.phone)) {
      errors.phone = 'Valid 10-digit Phone Number is required.';
    }
    if (!formData.email.trim()) errors.email = 'Email Address is required.';
    if (!validatePassword(formData.password)) {
      errors.password = 'Password must be at least 8 characters with uppercase, lowercase, number, and special character.';
    }
    if (!agreedToTerms) {
      errors.terms = 'You must agree to the Terms & Conditions and Privacy Policy to continue.';
    }

    setFieldErrors(errors);
    const errKeys = Object.keys(errors);
    if (errKeys.length > 0) {
      window.requestAnimationFrame(() => scrollToFirstInvalidField(scrollRef.current, errKeys[0]));
      return;
    }

    setLoading(true);

    try {
      // 1. Check for invite FIRST
      const inviteData = await dbService.checkInvite(formData.email.toLowerCase());

      // 2. Enforce Company Name for public signups
      if (!inviteData && !formData.companyName.trim()) {
          setLoading(false);
          setFieldErrors({ companyName: 'Company Name is required for new public registrations.' });
          window.requestAnimationFrame(() => scrollToFirstInvalidField(scrollRef.current, 'companyName'));
          return;
      }

      // 3. Create Firebase Auth User
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email.toLowerCase(), formData.password);
      const user = userCredential.user;

      if (inviteData) {
        // ==========================================
        // SCENARIO A: USER WAS INVITED
        // ==========================================
        const role = inviteData.role;

        if (role === 'RESELLER') {
            await setDoc(doc(db, 'users', user.uid), {
                uid: user.uid,
                email: user.email,
                name: formData.name,
                phone: formData.phone,
                companyName: inviteData.companyName || formData.companyName,
                role: 'RESELLER',
                commissionRate: inviteData.commissionRate || 150,
                createdAt: new Date().toISOString()
            });
        } 
        else if (role === 'TENANT_ADMIN' || role === 'FACTORY_OWNER') {
            // Determine Trial End Date (If custom was passed by reseller, use it)
            let trialEndsAt = inviteData.trialEndsAt || null;
            if (inviteData.plan === 'TRIAL' && !trialEndsAt) {
                 const d = new Date();
                 d.setDate(d.getDate() + FREE_TRIAL_DAYS); // Configurable Trial Days
                 trialEndsAt = d.toISOString();
            }

            const tenantRef = await addDoc(collection(db, 'tenants'), {
                name: inviteData.companyName || formData.companyName,
                ownerId: user.uid,
                plan: inviteData.plan || 'STARTER',
                resellerId: inviteData.resellerId,
                trialEndsAt: trialEndsAt, 
                createdAt: new Date().toISOString(),
                isActive: true
            });

            await setDoc(doc(db, 'users', user.uid), {
                uid: user.uid,
                email: user.email,
                name: formData.name,
                phone: formData.phone,
                role: 'TENANT_ADMIN',
                roles: ['TENANT_ADMIN'],
                tenantId: tenantRef.id,
                resellerId: inviteData.resellerId,
                companyName: inviteData.companyName || formData.companyName,
                isActive: true,
                roleVersion: 1,
                createdAt: new Date().toISOString()
            });
        }
        else if (role === 'MANAGER' || role === 'SUPERVISOR') {
             await setDoc(doc(db, 'users', user.uid), {
                uid: user.uid,
                email: user.email,
                name: inviteData.name || formData.name,
                phone: formData.phone,
                role: 'MANAGER',
                roles: ['MANAGER'],
                tenantId: inviteData.tenantId,
                branchId: inviteData.branchId || 'default',
                assignedBranchIds: [inviteData.branchId || 'default'],
                branchName: inviteData.branchName || 'Main Branch (Head Office)',
                isActive: true,
                roleVersion: 1,
                createdAt: new Date().toISOString()
            });
        }

        // Clean up invite
        await dbService.deleteInvite(formData.email.toLowerCase());

      } else {
        // ==========================================
        // SCENARIO B: NORMAL PUBLIC SIGNUP
        // ==========================================
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + FREE_TRIAL_DAYS); // Configurable Trial Days

        const tenantRef = await addDoc(collection(db, 'tenants'), {
            name: formData.companyName,
            ownerId: user.uid,
            createdAt: new Date().toISOString(),
            plan: 'TRIAL',
            trialEndsAt: trialEndDate.toISOString(),
            isActive: true 
        });

        await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            email: formData.email.toLowerCase(),
            name: formData.name,
            phone: formData.phone, 
            role: 'TENANT_ADMIN',
            roles: ['TENANT_ADMIN'],
            tenantId: tenantRef.id, 
            companyName: formData.companyName,
            isActive: true,
            roleVersion: 1,
            createdAt: new Date().toISOString()
        });
      }

      await updateProfile(user, { displayName: formData.name });
      setTimeout(() => {
         window.location.reload(); 
      }, 500);

    } catch (err: any) {
      console.error(err);
      setError(err.message.replace('Firebase: ', ''));
      setLoading(false);
    }
  };

  // Reusable Modal Component for Legal Text
  const LegalModal = ({ title, isOpen, onClose, children }: any) => {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 backdrop-blur-sm">
        <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col max-h-[80vh] shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center p-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
              <X size={20} />
            </button>
          </div>
          <div className="p-4 overflow-y-auto text-sm text-gray-600 space-y-4">
            {children}
          </div>
          <div className="p-4 border-t border-gray-100">
            <button onClick={onClose} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors shadow-md">
              I Understand
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={scrollRef}
      onFocusCapture={(e) => {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
          scrollElementAboveKeyboard(target, scrollRef.current, keyboardHeight);
        }
      }}
      style={{
        paddingBottom: `calc(2rem + var(--keyboard-height, 0px) + env(safe-area-inset-bottom, 0px))`,
      }}
      className="min-h-dvh bg-gray-50 flex flex-col items-center p-4 overflow-y-auto"
    >
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6 sm:p-8 my-auto shrink-0 mb-6 mt-6">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 mb-4">
             <Building2 className="text-white" size={32} />
          </div>
          <h1 className="text-fluid-2xl font-bold text-gray-900">Setup Your Account</h1>
          <p className="text-gray-500 text-sm mt-1">Start your {FREE_TRIAL_DAYS}-day free trial today</p>
        </div>

        {error && (
          <div role="alert" className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-lg text-xs mb-6 text-center font-medium">
            {error}
          </div>
        )}

        <form
          onSubmit={handleRegister}
          noValidate
          onKeyDownCapture={(e) => {
            if (e.key === 'Enter' && e.target instanceof HTMLElement && e.target.tagName === 'INPUT') {
              const hint = e.target.getAttribute('enterkeyhint');
              if (hint === 'next') {
                e.preventDefault();
                advanceToNextFormField(e.target, scrollRef.current);
              }
            }
          }}
          className="space-y-4"
        >
          <div data-field="companyName">
            <label htmlFor="reg-company" className="block text-xs font-bold text-gray-700 uppercase mb-1 ml-1">Company Name</label>
            <div className="relative">
              <Factory className="absolute left-3 top-3.5 text-gray-400" size={18} />
              <input
                id="reg-company"
                type="text"
                autoComplete="organization"
                enterKeyHint="next"
                aria-invalid={Boolean(fieldErrors.companyName)}
                className={`w-full pl-10 pr-4 py-3.5 border rounded-lg focus:ring-2 outline-none min-h-12 ${
                  fieldErrors.companyName ? 'border-rose-400 focus:ring-rose-500' : 'border-gray-200 focus:ring-blue-500'
                }`}
                placeholder="Ex: Jethwa Industries (Optional if invited)"
                value={formData.companyName}
                onChange={e => { setFormData({...formData, companyName: e.target.value}); clearFieldError('companyName'); }}
              />
            </div>
            <InlineFieldError message={fieldErrors.companyName} />
          </div>

          <div data-field="name">
            <label htmlFor="reg-name" className="block text-xs font-bold text-gray-700 uppercase mb-1 ml-1">Your Name *</label>
            <div className="relative">
              <User className="absolute left-3 top-3.5 text-gray-400" size={18} />
              <input
                id="reg-name"
                type="text"
                autoComplete="name"
                enterKeyHint="next"
                aria-invalid={Boolean(fieldErrors.name)}
                className={`w-full pl-10 pr-4 py-3.5 border rounded-lg focus:ring-2 outline-none min-h-12 ${
                  fieldErrors.name ? 'border-rose-400 focus:ring-rose-500' : 'border-gray-200 focus:ring-blue-500'
                }`}
                placeholder="Full Name"
                value={formData.name}
                onChange={e => { setFormData({...formData, name: e.target.value}); clearFieldError('name'); }}
              />
            </div>
            <InlineFieldError message={fieldErrors.name} />
          </div>

          <div data-field="phone">
            <label htmlFor="reg-phone" className="block text-xs font-bold text-gray-700 uppercase mb-1 ml-1">Phone Number *</label>
            <div className="relative">
              <Phone className="absolute left-3 top-3.5 text-gray-400" size={18} />
              <input
                id="reg-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                enterKeyHint="next"
                maxLength={10}
                aria-invalid={Boolean(fieldErrors.phone)}
                className={`w-full pl-10 pr-4 py-3.5 border rounded-lg focus:ring-2 outline-none min-h-12 font-mono ${
                  fieldErrors.phone ? 'border-rose-400 focus:ring-rose-500' : 'border-gray-200 focus:ring-blue-500'
                }`}
                placeholder="10-digit mobile number"
                value={formData.phone}
                onChange={e => { setFormData({...formData, phone: e.target.value.replace(/\D/g, '')}); clearFieldError('phone'); }}
              />
            </div>
            <InlineFieldError message={fieldErrors.phone} />
          </div>

          <div data-field="email">
            <label htmlFor="reg-email" className="block text-xs font-bold text-gray-700 uppercase mb-1 ml-1">Email Address *</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 text-gray-400" size={18} />
              <input
                id="reg-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                enterKeyHint="next"
                aria-invalid={Boolean(fieldErrors.email)}
                className={`w-full pl-10 pr-4 py-3.5 border rounded-lg focus:ring-2 outline-none min-h-12 ${
                  fieldErrors.email ? 'border-rose-400 focus:ring-rose-500' : 'border-gray-200 focus:ring-blue-500'
                }`}
                placeholder="admin@company.com"
                value={formData.email}
                onChange={e => { setFormData({...formData, email: e.target.value}); clearFieldError('email'); }}
              />
            </div>
            <InlineFieldError message={fieldErrors.email} />
          </div>

          <div data-field="password">
            <label htmlFor="reg-password" className="block text-xs font-bold text-gray-700 uppercase mb-1 ml-1">Password *</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 text-gray-400" size={18} />
              <input
                id="reg-password"
                type={showPassword ? "text" : "password"} 
                autoComplete="new-password"
                enterKeyHint="done"
                aria-invalid={Boolean(fieldErrors.password)}
                className={`w-full pl-10 pr-12 py-3.5 border rounded-lg focus:ring-2 outline-none min-h-12 ${
                  fieldErrors.password ? 'border-rose-400 focus:ring-rose-500' : 'border-gray-200 focus:ring-blue-500'
                }`}
                placeholder="••••••••"
                value={formData.password}
                onChange={e => { setFormData({...formData, password: e.target.value}); clearFieldError('password'); }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-1 top-1 w-11 h-11 flex items-center justify-center text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <InlineFieldError message={fieldErrors.password} />
            <p className="text-[10px] text-gray-500 mt-1.5 leading-tight ml-1">Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char.</p>
          </div>

          {/* Legal Checkbox */}
          <div data-field="terms" className="mt-6 mb-2">
            <div className="flex items-start">
              <div className="flex items-center h-5 mt-0.5">
                <input
                  id="terms"
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => { setAgreedToTerms(e.target.checked); clearFieldError('terms'); }}
                  className="w-4 h-4 border border-gray-300 rounded bg-gray-50 focus:ring-3 focus:ring-blue-300 accent-blue-600 cursor-pointer"
                />
              </div>
              <label htmlFor="terms" className="ml-2 text-sm text-gray-600 cursor-pointer">
                I agree to the{' '}
                <button type="button" onClick={(e) => { e.preventDefault(); setShowTermsModal(true); }} className="text-blue-600 font-semibold hover:underline">Terms &amp; Conditions</button>
                {' '}and{' '}
                <button type="button" onClick={(e) => { e.preventDefault(); setShowPrivacyModal(true); }} className="text-blue-600 font-semibold hover:underline">Privacy Policy</button>.
              </label>
            </div>
            <InlineFieldError message={fieldErrors.terms} />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full min-h-13 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg shadow-lg shadow-blue-200 flex items-center justify-center transition-all mt-4 active:scale-95 disabled:opacity-70"
          >
            {loading ? <Loader2 className="animate-spin" /> : <>Create Account <ArrowRight size={18} className="ml-2"/></>}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-gray-100 pt-6">
          <p className="text-gray-500 text-sm mb-1">Already have an account?</p>
          <button onClick={onNavigateToLogin} className="text-blue-600 font-bold hover:underline min-h-11 px-4 flex items-center mx-auto">
            Login here
          </button>
        </div>
      </div>

      {/* Privacy Policy Modal */}
      <LegalModal title="Privacy Policy" isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)}>
        <p><strong>Last Updated: {new Date().toLocaleDateString()}</strong></p>
        <p>This Privacy Policy explains how our Workforce application collects, uses, and protects your data, including sensitive permissions required for functionality.</p>
        
        <h3 className="font-bold text-gray-900 mt-4">1. Camera and Media Permissions</h3>
        <p>Our application requires access to your device's Camera (CAMERA) and Media Library (READ_MEDIA_IMAGES, READ_MEDIA_VIDEO) to function. This is strictly used for:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Registering employee profiles and avatars.</li>
          <li>Performing secure facial recognition to log daily attendance.</li>
        </ul>

        <h3 className="font-bold text-gray-900 mt-4">2. Facial Data & Biometrics</h3>
        <p>We use localized AI models to process facial data for attendance tracking. Mathematical representations of faces (embeddings) are generated and stored securely within your tenant database. This data is <strong>never</strong> sold, shared with third-party advertisers, or used outside of attendance verification.</p>

        <h3 className="font-bold text-gray-900 mt-4">3. Data Retention</h3>
        <p>Media and facial data are retained only as long as the employee is active in your workforce system. Upon deleting an employee or closing your account, associated media and biometric data are permanently deleted from our primary servers.</p>
      </LegalModal>

      {/* Terms and Conditions Modal */}
      <LegalModal title="Terms and Conditions" isOpen={showTermsModal} onClose={() => setShowTermsModal(false)}>
        <p><strong>Last Updated: {new Date().toLocaleDateString()}</strong></p>
        <p>By registering for an account, you (the "Employer" or "Tenant") agree to these terms:</p>
        
        <h3 className="font-bold text-gray-900 mt-4">1. Acceptable Use</h3>
        <p>You agree to use this application solely for legitimate workforce management, attendance tracking, and payroll estimation. You are responsible for ensuring that you have obtained all necessary consents from your employees before capturing their photos or facial data.</p>

        <h3 className="font-bold text-gray-900 mt-4">2. Employer Responsibilities</h3>
        <p>As the account owner, you act as the Data Controller for your employees' data. You warrant that capturing photos and logging attendance via this app complies with your local labor and privacy laws.</p>

        <h3 className="font-bold text-gray-900 mt-4">3. Trial and Subscription</h3>
        <p>Upon registration, you may be granted a {FREE_TRIAL_DAYS}-day free trial. Continued use of the platform after this period requires an active subscription or an agreement with your Reseller Partner.</p>
      </LegalModal>

    </div>
  );
};