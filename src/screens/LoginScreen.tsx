// src/screens/LoginScreen.tsx
import React, { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail, signInAnonymously } from 'firebase/auth'; 
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'; 
import { auth, db } from '../lib/firebase'; 
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, Loader2, LogIn, Eye, EyeOff, MonitorSmartphone, Sparkles } from 'lucide-react';
import { KioskTerminal } from '../types/index';
import { dbService } from '../services/db';

interface Props {
  onNavigateToRegister: () => void;
  onKioskLogin: (config: KioskTerminal) => void;
}

export const LoginScreen: React.FC<Props> = ({ onNavigateToRegister, onKioskLogin }) => {
  const { loginDemo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [isKioskMode, setIsKioskMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      if (isKioskMode) {
        if (pairingCode.length !== 6) throw new Error("Pairing code must be 6 digits.");
        
        // 1. Verify the code (Now permitted by updated Firestore rules allow get: if true)
        const config = await dbService.verifyKioskPairingCode(pairingCode);
        if (!config) throw new Error("Invalid or expired Pairing Code.");

        // 2. Sign in the tablet silently so it gets an official Firebase Auth session
        // NOTE: This WILL FAIL if Anonymous Sign-in is not enabled in Firebase Console!
        const { user } = await signInAnonymously(auth);

        // 3. Register this tablet in the 'users' collection 
        // This makes sure getUserData().tenantId in your Firestore Rules recognizes the tablet!
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: `kiosk_${pairingCode}@local.device`, // Dummy email for context in your database
          name: config.name || 'Kiosk Terminal',
          role: 'KIOSK',
          tenantId: config.tenantId,
          kioskId: config.id || pairingCode,
          createdAt: serverTimestamp() // Better than toISOString() for Firebase!
        }, { merge: true });

        // 4. Proceed to launch the Kiosk UI
        onKioskLogin(config);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error("Login Error: ", err);
      
      // Explicitly catch the Anonymous Auth disabled error
      if (err.code === 'auth/admin-restricted-operation' || err.code === 'auth/operation-not-allowed') {
        setError("System Error: Anonymous Sign-In is disabled. Please enable it in the Firebase Console under Authentication -> Sign-in method.");
      } else if (err.code === 'permission-denied') {
        setError("Permission Denied: Your database rules blocked this action.");
      } else {
        setError(err.message.replace('Firebase: ', ''));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Please enter your email address first.");
      return;
    }
    setResetLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccessMsg("Password reset email sent!");
    } catch (err: any) {
      setError(err.message.replace('Firebase: ', ''));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex flex-col items-center justify-center p-4 py-8 overflow-y-auto antialiased">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-7 sm:p-8 my-auto shrink-0 border border-slate-100">
        
        {/* BRAND LOCKUP */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center mx-auto mb-3 shadow-md shadow-slate-900/30">
            {isKioskMode ? <MonitorSmartphone className="text-blue-400" size={24} /> : <LogIn className="text-blue-400" size={24} />}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {isKioskMode ? 'Kiosk Terminal Login' : 'WorkForce Pro'}
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            {isKioskMode ? 'Enter the 6-digit pairing code assigned to this tablet' : 'Industrial Attendance & Factory Payroll'}
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-xs mb-4 font-medium leading-relaxed">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-xs mb-4 font-medium leading-relaxed">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          {isKioskMode ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">6-Digit Pairing Code</label>
              <input
                type="text"
                maxLength={6}
                required
                className="w-full text-center text-3xl tracking-widest p-3.5 border border-slate-200 rounded-xl focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-all font-mono tabular-nums min-h-14 bg-slate-50"
                placeholder="------"
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value.replace(/\D/g, ''))} 
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 text-slate-400" size={17} />
                  <input
                    type="email"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-all shadow-xs"
                    placeholder="admin@factory.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                   <label className="block text-xs font-semibold text-slate-700">Password</label>
                   <button 
                     type="button" 
                     onClick={handleForgotPassword} 
                     disabled={resetLoading} 
                     className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                   >
                      {resetLoading ? 'Sending...' : 'Forgot?'}
                   </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 text-slate-400" size={17} />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    className="w-full pl-10 pr-11 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-all shadow-xs"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)} 
                    className="absolute right-1 top-1 w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-xs transition-all active:scale-95 flex items-center justify-center bg-slate-900 hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : (isKioskMode ? 'Launch Terminal' : 'Sign In to Workspace')}
          </button>
        </form>

        {/* INSTANT DEMO EXPLORATION */}
        {!isKioskMode && (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => loginDemo('FACTORY_OWNER')}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 hover:from-blue-100 hover:to-indigo-100 text-slate-800 border border-blue-200/80 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-2xs group"
            >
              <Sparkles size={16} className="text-blue-600 group-hover:scale-110 transition-transform" />
              <span>Explore Platform Demo</span>
            </button>
            <p className="text-[11px] text-slate-400 text-center mt-1.5">
              Instant access with pre-loaded workers, biometric kiosk, daily muster &amp; payroll.
            </p>
          </div>
        )}

        {!isKioskMode && (
          <div className="mt-4 pt-4 border-t border-slate-100 text-center flex flex-col items-center">
            <p className="text-slate-500 text-xs mb-1">Setting up a new factory?</p>
            <button 
              onClick={onNavigateToRegister} 
              className="text-blue-600 hover:text-blue-800 font-bold text-xs"
            >
              Register New Organization
            </button>
          </div>
        )}
      </div>

      {/* KIOSK MODE TOGGLE */}
      <button 
        onClick={() => { setIsKioskMode(!isKioskMode); setError(''); setPairingCode(''); }}
        className="text-white/80 hover:text-white bg-white/10 hover:bg-white/15 px-5 py-2.5 rounded-xl font-semibold text-xs transition-all flex items-center justify-center shadow-xs backdrop-blur-md shrink-0 mt-3"
      >
        {isKioskMode ? <LogIn size={15} className="mr-2"/> : <MonitorSmartphone size={15} className="mr-2"/>}
        {isKioskMode ? 'Switch to Standard Management Login' : 'Pair as Face & QR Tablet Terminal'}
      </button>
    </div>
  );
};