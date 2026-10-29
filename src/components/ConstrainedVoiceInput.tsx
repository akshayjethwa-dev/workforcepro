// src/components/ConstrainedVoiceInput.tsx
import React from 'react';
import { Mic, MicOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useVoiceDictation } from '../hooks/useVoiceDictation';
import { triggerFrontlineHaptic } from '../utils/frontlineTouch';

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  label?: string;
  optionChips?: string[];
  disabled?: boolean;
  minHeight?: string;
}

export const ConstrainedVoiceInput: React.FC<Props> = ({
  value,
  onChange,
  placeholder = 'Speak or select predefined option chips below...',
  label = 'Field Notes / Reason',
  optionChips = [
    'Machining Complete',
    'Shift Overtime Approved',
    'Material Delivery Delayed',
    'Machine Maintenance',
    'Quality Inspection Passed',
    'Urgent Field Request',
  ],
  disabled = false,
  minHeight = 'min-h-[90px]',
}) => {
  const { isListening, error, isSupported, startListening, stopListening } = useVoiceDictation({
    onResult: (text) => {
      onChange(text);
    },
  });

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleChipSelect = (chip: string) => {
    triggerFrontlineHaptic('light');
    if (!value) {
      onChange(chip);
    } else if (!value.includes(chip)) {
      onChange(`${value}, ${chip}`);
    }
  };

  return (
    <div className="space-y-3 w-full">
      {/* Label & Voice Toggle Bar */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-600 font-mono flex items-center gap-1.5">
          <span>{label}</span>
          <span className="text-[10px] text-slate-400 font-normal">
            (≥18px Large Format + Voice Dictation)
          </span>
        </label>

        {/* Native Speech Dictation Button (>= 56px touch target) */}
        <button
          type="button"
          onClick={toggleListening}
          disabled={disabled}
          title={isListening ? 'Stop Recording' : 'Voice Dictate Note (Native Speech Recognizer)'}
          className={`min-h-[48px] px-3.5 py-2 rounded-2xl flex items-center gap-2 font-bold text-xs transition-all active:scale-95 cursor-pointer border-2 ${
            isListening
              ? 'bg-rose-600 text-white border-rose-400 animate-pulse shadow-md ring-2 ring-rose-500/30'
              : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300 shadow-xs'
          }`}
        >
          {isListening ? (
            <>
              <MicOff size={18} className="animate-spin text-white" />
              <span>Listening (Speak now)...</span>
            </>
          ) : (
            <>
              <Mic size={18} className="text-blue-600" />
              <span>Voice Input</span>
            </>
          )}
        </button>
      </div>

      {/* Large-Format Text Field (Font size >= 18px, full-width) */}
      <div className="relative">
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          style={{ fontSize: '18px', lineHeight: '1.4' }}
          className={`w-full ${minHeight} p-4 bg-white border-2 rounded-2xl text-slate-900 font-medium placeholder-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all shadow-xs ${
            isListening ? 'border-rose-400 ring-2 ring-rose-300/30' : 'border-slate-300'
          }`}
        />
        {isListening && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1 text-[11px] font-mono text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            Dictating...
          </div>
        )}
      </div>

      {/* Noisy Environment or Speech Error Fallback Warning */}
      {error && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle size={16} className="text-amber-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Predefined Option Chips (Guaranteed fallback for noisy environments) */}
      <div>
        <span className="text-[11px] font-bold text-slate-500 uppercase font-mono block mb-2">
          Predefined Frontline Option Chips (Tap to add):
        </span>
        <div className="flex flex-wrap gap-2">
          {optionChips.map((chip, idx) => {
            const isIncluded = value.includes(chip);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleChipSelect(chip)}
                disabled={disabled}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                  isIncluded
                    ? 'bg-blue-50 text-blue-800 border-blue-400 shadow-xs'
                    : 'bg-white text-slate-700 hover:text-slate-900 border-slate-200 hover:border-slate-300'
                }`}
              >
                {isIncluded && <CheckCircle2 size={13} className="text-blue-600" />}
                <span>{chip}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
