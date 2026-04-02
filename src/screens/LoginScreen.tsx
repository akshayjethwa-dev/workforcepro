// src/screens/LoginScreen.tsx
import React, { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail, signInAnonymously } from 'firebase/auth'; 
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'; 
import { auth, db } from '../lib/firebase'; 
import { dbService } from '../services/db';
import { Mail, Lock, Loader2, LogIn, Eye, EyeOff, MonitorSmartphone } from 'lucide-react';
import { KioskTerminal } from '../types/index';

interface Props {
  onNavigateToRegister: () => void;
  onKioskLogin: (config: KioskTerminal) => void;
}

export const LoginScreen: React.FC<Props> = ({ onNavigateToRegister, onKioskLogin }) => {
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
    <div className="min-h-dvh bg-blue-600 flex flex-col items-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-8 my-auto shrink-0 mb-6 mt-6">
        <div className="text-center mb-8">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isKioskMode ? 'bg-purple-100' : 'bg-blue-100'}`}>
            {isKioskMode ? <MonitorSmartphone className="text-purple-600" size={32} /> : <LogIn className="text-blue-600" size={32} />}
          </div>
          <h1 className="text-2xl font-bold text-gray-800">
            {isKioskMode ? 'Kiosk Terminal' : 'Welcome Back'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {isKioskMode ? 'Enter your 6-digit pairing code' : 'WorkForce Login'}
          </p>
        </div>

        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 text-center font-medium">{error}</div>}
        {successMsg && <div className="bg-green-50 text-green-600 p-3 rounded-lg text-sm mb-4 text-center font-medium">{successMsg}</div>}

        <form onSubmit={handleLogin} className="space-y-5">
          {isKioskMode ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">6-Digit Pairing Code</label>
              <input
                type="text"
                maxLength={6}
                required
                className="w-full text-center text-2xl tracking-widest p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none transition-all font-mono min-h-14"
                placeholder="------"
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value.replace(/\D/g, ''))} 
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 text-gray-400" size={20} />
                  <input
                    type="email"
                    required
                    className="w-full pl-10 pr-4 py-3.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-12"
                    placeholder="admin@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                   <label className="block text-sm font-medium text-gray-700">Password</label>
                   <button type="button" onClick={handleForgotPassword} disabled={resetLoading} className="text-xs text-blue-600 font-bold flex items-center min-h-11 px-2 -mr-2">
                      {resetLoading ? 'Sending...' : 'Forgot Password?'}
                   </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 text-gray-400" size={20} />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    className="w-full pl-10 pr-12 py-3.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-12"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-1 top-1 w-11 h-11 flex items-center justify-center text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full min-h-13 text-white font-bold rounded-lg shadow-lg transition-transform active:scale-95 flex items-center justify-center mt-2 ${
              isKioskMode ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-900 hover:bg-gray-800'
            }`}
          >
            {loading ? <Loader2 className="animate-spin" /> : (isKioskMode ? 'Launch Terminal' : 'Login to Dashboard')}
          </button>
        </form>

        {!isKioskMode && (
          <div className="mt-6 pt-6 border-t border-gray-100 text-center flex flex-col items-center">
            <p className="text-gray-500 text-sm mb-1">Don't have a factory account?</p>
            <button onClick={onNavigateToRegister} className="text-blue-600 font-bold min-h-11 px-4 flex items-center">
              Register New Company
            </button>
          </div>
        )}
      </div>

      <button 
        onClick={() => { setIsKioskMode(!isKioskMode); setError(''); setPairingCode(''); }}
        className="text-white bg-white/20 hover:bg-white/30 px-6 min-h-13 rounded-xl font-bold transition-all flex items-center justify-center shadow-sm backdrop-blur-sm shrink-0 mb-6"
      >
        {isKioskMode ? <LogIn size={18} className="mr-2"/> : <MonitorSmartphone size={18} className="mr-2"/>}
        {isKioskMode ? 'Return to Standard Login' : 'Login as Kiosk Terminal'}
      </button>
    </div>
  );
};