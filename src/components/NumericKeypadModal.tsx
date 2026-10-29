// src/components/NumericKeypadModal.tsx
import React, { useState } from 'react';
import { X, Delete, RotateCcw, LogIn, LogOut, User, CheckCircle2, QrCode } from 'lucide-react';
import { Worker } from '../types';
import { triggerFrontlineHaptic } from '../utils/frontlineTouch';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workers: Worker[];
  onPunch: (worker: Worker, type: 'IN' | 'OUT') => void;
  title?: string;
  subtitle?: string;
}

export const NumericKeypadModal: React.FC<Props> = ({
  isOpen,
  onClose,
  workers,
  onPunch,
  title = 'Frontline Numeric Badge Pad',
  subtitle = 'Manual fallback when barcode or QR is worn / unreadable',
}) => {
  const [enteredCode, setEnteredCode] = useState('');

  if (!isOpen) return null;

  // Match workers by Badge ID (or phone number digits or worker ID)
  const matchedWorkers = workers.filter(w => {
    if (!enteredCode) return false;
    const phoneDigits = w.phone.replace(/\D/g, '');
    const idDigits = w.id.replace(/\D/g, '');
    return (
      phoneDigits.includes(enteredCode) ||
      idDigits.includes(enteredCode) ||
      (w.designation && w.designation.includes(enteredCode))
    );
  }).slice(0, 3);

  const handleKeyPress = (num: string) => {
    triggerFrontlineHaptic('light');
    if (enteredCode.length < 10) {
      setEnteredCode(prev => prev + num);
    }
  };

  const handleBackspace = () => {
    triggerFrontlineHaptic('light');
    setEnteredCode(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    triggerFrontlineHaptic('light');
    setEnteredCode('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full border-2 border-slate-200 shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shrink-0 shadow-md">
              <QrCode size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight">{title}</h2>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={() => {
              triggerFrontlineHaptic('light');
              onClose();
            }}
            type="button"
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {/* Badge / Code Display Field (Large Font >= 18px) */}
          <div className="bg-slate-100 rounded-2xl p-4 border-2 border-slate-200 mb-4 text-center">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Entered Worker Badge # or Phone Digits
            </span>
            <div className="text-3xl font-black font-mono tracking-widest text-slate-900 min-h-[40px] flex items-center justify-center">
              {enteredCode ? enteredCode : <span className="text-slate-400 font-sans text-sm font-bold">Tap keypad numbers below</span>}
            </div>
          </div>

          {/* Matched Workers Card (if code matches any worker) */}
          {matchedWorkers.length > 0 && (
            <div className="mb-4 space-y-2">
              <span className="text-[11px] font-bold text-slate-600 block uppercase tracking-wider font-mono">
                Matched Personnel ({matchedWorkers.length})
              </span>
              {matchedWorkers.map(w => (
                <div 
                  key={w.id}
                  className="p-3 bg-blue-50 border-2 border-blue-300 rounded-2xl flex items-center justify-between gap-3 shadow-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shrink-0">
                      {w.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-sm text-slate-900 truncate">{w.name}</h4>
                      <p className="text-[11px] text-slate-500 font-mono truncate">{w.designation || 'Staff'} · {w.phone}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        onPunch(w, 'IN');
                        onClose();
                      }}
                      type="button"
                      className="min-h-[56px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase flex items-center gap-1 active:scale-95 shadow-sm border border-emerald-500 cursor-pointer"
                    >
                      <LogIn size={15} strokeWidth={2.5} />
                      <span>IN</span>
                    </button>
                    <button
                      onClick={() => {
                        onPunch(w, 'OUT');
                        onClose();
                      }}
                      type="button"
                      className="min-h-[56px] px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase flex items-center gap-1 active:scale-95 shadow-sm border border-rose-500 cursor-pointer"
                    >
                      <LogOut size={15} strokeWidth={2.5} />
                      <span>OUT</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Glove Safe Large Numeric Keypad (>=64x64px keys, >=12px gap) */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeyPress(num)}
                className="min-h-[64px] min-w-[64px] rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 font-black text-2xl border-2 border-slate-200 active:scale-95 flex items-center justify-center transition-all cursor-pointer shadow-xs"
              >
                {num}
              </button>
            ))}

            {/* Clear Button */}
            <button
              type="button"
              onClick={handleClear}
              className="min-h-[64px] min-w-[64px] rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-600 font-bold text-sm border-2 border-slate-200 active:scale-95 flex flex-col items-center justify-center transition-all cursor-pointer shadow-xs"
              title="Clear all digits"
            >
              <RotateCcw size={18} />
              <span className="text-[10px] uppercase font-mono mt-0.5">Clear</span>
            </button>

            {/* 0 Button */}
            <button
              type="button"
              onClick={() => handleKeyPress('0')}
              className="min-h-[64px] min-w-[64px] rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 font-black text-2xl border-2 border-slate-200 active:scale-95 flex items-center justify-center transition-all cursor-pointer shadow-xs"
            >
              0
            </button>

            {/* Backspace Button */}
            <button
              type="button"
              onClick={handleBackspace}
              className="min-h-[64px] min-w-[64px] rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-600 font-bold text-sm border-2 border-slate-200 active:scale-95 flex flex-col items-center justify-center transition-all cursor-pointer shadow-xs"
              title="Backspace"
            >
              <Delete size={20} />
              <span className="text-[10px] uppercase font-mono mt-0.5">Del</span>
            </button>
          </div>

          {/* Quick Predefined Worker Filter Chips */}
          <div className="pt-3 border-t border-slate-100">
            <span className="text-[10px] uppercase font-mono font-bold text-slate-400 block mb-2">
              Fast Personnel Select:
            </span>
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
              {workers.slice(0, 6).map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    triggerFrontlineHaptic('light');
                    setEnteredCode(w.phone.slice(-4));
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 active:scale-95 cursor-pointer"
                >
                  {w.name} ({w.phone.slice(-4)})
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
