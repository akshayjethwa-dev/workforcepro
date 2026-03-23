import React, { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
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
        const config = await dbService.verifyKioskPairingCode(pairingCode);
        if (!config) throw new Error("Invalid or expired Pairing Code.");
        onKioskLogin(config);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message.replace('Firebase: ', ''));
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
    // min-h-[100dvh] handles mobile browser toolbars correctly. 
    // overflow-y-auto ensures the form can scroll if the keyboard pushes it up.
    <div className="min-h-[100dvh] bg-blue-600 flex flex-col items-center p-4 overflow-y-auto">
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
                // Mobile Optimization: p-4 ensures > 44px height for touch target
                className="w-full text-center text-2xl tracking-widest p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none transition-all font-mono min-h-[56px]"
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
                    className="w-full pl-10 pr-4 py-3.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[48px]"
                    placeholder="admin@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                   <label className="block text-sm font-medium text-gray-700">Password</label>
                   {/* Mobile Optimization: Expanded touch area with p-2 and min-h-[44px] */}
                   <button type="button" onClick={handleForgotPassword} disabled={resetLoading} className="text-xs text-blue-600 font-bold flex items-center min-h-[44px] px-2 -mr-2">
                      {resetLoading ? 'Sending...' : 'Forgot Password?'}
                   </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 text-gray-400" size={20} />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    className="w-full pl-10 pr-12 py-3.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[48px]"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {/* Mobile Optimization: Made the eye icon a 44x44 square so it's easy to tap */}
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
            className={`w-full min-h-[52px] text-white font-bold rounded-lg shadow-lg transition-transform active:scale-95 flex items-center justify-center mt-2 ${
              isKioskMode ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-900 hover:bg-gray-800'
            }`}
          >
            {loading ? <Loader2 className="animate-spin" /> : (isKioskMode ? 'Launch Terminal' : 'Login to Dashboard')}
          </button>
        </form>

        {!isKioskMode && (
          <div className="mt-6 pt-6 border-t border-gray-100 text-center flex flex-col items-center">
            <p className="text-gray-500 text-sm mb-1">Don't have a factory account?</p>
            {/* Mobile Optimization: Expanded touch area */}
            <button onClick={onNavigateToRegister} className="text-blue-600 font-bold min-h-[44px] px-4 flex items-center">
              Register New Company
            </button>
          </div>
        )}
      </div>

      <button 
        onClick={() => { setIsKioskMode(!isKioskMode); setError(''); }}
        className="text-white bg-white/20 hover:bg-white/30 px-6 min-h-[52px] rounded-xl font-bold transition-all flex items-center justify-center shadow-sm backdrop-blur-sm shrink-0 mb-6"
      >
        {isKioskMode ? <LogIn size={18} className="mr-2"/> : <MonitorSmartphone size={18} className="mr-2"/>}
        {isKioskMode ? 'Return to Standard Login' : 'Login as Kiosk Terminal'}
      </button>
    </div>
  );
};