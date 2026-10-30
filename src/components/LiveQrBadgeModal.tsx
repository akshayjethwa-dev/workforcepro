// src/components/LiveQrBadgeModal.tsx
import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { X, RefreshCw, ShieldCheck, Timer, QrCode } from 'lucide-react';
import { Worker } from '../types/index';
import { quickSwitchService } from '../services/quickSwitchService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  worker: Worker;
  tenantId: string;
}

export const LiveQrBadgeModal: React.FC<Props> = ({
  isOpen,
  onClose,
  worker,
  tenantId
}) => {
  const [token, setToken] = useState<string>('');
  const [secondsRemaining, setSecondsRemaining] = useState<number>(60);

  const refreshToken = () => {
    const newToken = quickSwitchService.generateShortLivedQrToken(tenantId, worker);
    setToken(newToken);
    setSecondsRemaining(60);
  };

  useEffect(() => {
    if (isOpen) {
      refreshToken();
    }
  }, [isOpen, worker.id, tenantId]);

  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          refreshToken();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, worker.id, tenantId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 text-white text-center shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <QrCode size={18} className="text-blue-400" />
            <h3 className="font-bold text-base">Short-Lived Worker QR Badge</h3>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Worker Info */}
        <div className="mb-4">
          <div className="font-black text-lg text-white">{worker.name}</div>
          <div className="text-xs text-slate-400 font-mono">
            ID: {worker.id} · {worker.designation || 'Staff'}
          </div>
        </div>

        {/* QR Display Frame */}
        <div className="p-4 bg-white rounded-2xl inline-block shadow-inner mb-4">
          {token ? (
            <QRCode 
              value={token} 
              size={190} 
              level="M" 
            />
          ) : (
            <div className="w-[190px] h-[190px] flex items-center justify-center text-slate-400 text-xs">
              Generating...
            </div>
          )}
        </div>

        {/* Countdown Ticker Bar (≤ 60s) */}
        <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-800 mb-4 text-xs font-mono">
          <div className="flex items-center gap-2 text-amber-400">
            <Timer size={16} className="animate-spin" />
            <span>Valid for: <strong className="text-white text-sm tabular-nums">{secondsRemaining}s</strong></span>
          </div>

          <button
            type="button"
            onClick={refreshToken}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] active:scale-95 transition-all cursor-pointer shadow-md"
          >
            <RefreshCw size={12} />
            <span>Refresh</span>
          </button>
        </div>

        {/* 2FA Notice */}
        <div className="p-3 bg-blue-950/40 border border-blue-800/60 rounded-xl text-left text-xs text-blue-200 flex items-start gap-2.5">
          <ShieldCheck size={16} className="text-blue-400 shrink-0 mt-0.5" />
          <div>
            <strong className="block text-white font-bold mb-0.5">Two-Factor Handover Enforced</strong>
            When scanned at the kiosk, worker must confirm their 4-digit PIN as a second factor before attendance loads.
          </div>
        </div>
      </div>
    </div>
  );
};
