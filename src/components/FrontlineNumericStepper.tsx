// src/components/FrontlineNumericStepper.tsx
import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { triggerFrontlineHaptic } from '../utils/frontlineTouch';

interface Props {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  label?: string;
  presets?: number[];
  prefix?: string;
}

export const FrontlineNumericStepper: React.FC<Props> = ({
  value,
  onChange,
  min = 0,
  max = 100000,
  step = 1,
  unit = '',
  label = 'Amount / Value',
  presets = [],
  prefix = '',
}) => {
  const handleDecrement = () => {
    triggerFrontlineHaptic('light');
    onChange(Math.max(min, value - step));
  };

  const handleIncrement = () => {
    triggerFrontlineHaptic('light');
    onChange(Math.min(max, value + step));
  };

  const handlePreset = (val: number) => {
    triggerFrontlineHaptic('light');
    onChange(val);
  };

  return (
    <div className="space-y-3">
      {label && (
        <label className="text-xs font-bold uppercase tracking-wider text-slate-600 font-mono block">
          {label}
        </label>
      )}

      {/* Stepper Control (Large >=56px buttons, >=18px display) */}
      <div className="flex items-center gap-3">
        {/* Decrement Button */}
        <button
          type="button"
          onClick={handleDecrement}
          disabled={value <= min}
          aria-label="Decrease value"
          className="min-w-[56px] min-h-[56px] w-14 h-14 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 border-2 border-slate-300 active:scale-95 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xs cursor-pointer"
        >
          <Minus size={24} strokeWidth={2.8} />
        </button>

        {/* Large Format Value Readout (>=24px font) */}
        <div className="flex-1 min-h-[56px] bg-slate-100 rounded-2xl border-2 border-slate-200 flex items-center justify-center px-4">
          <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-slate-900 tabular-nums">
            {prefix}{value.toLocaleString()}{unit ? ` ${unit}` : ''}
          </span>
        </div>

        {/* Increment Button */}
        <button
          type="button"
          onClick={handleIncrement}
          disabled={value >= max}
          aria-label="Increase value"
          className="min-w-[56px] min-h-[56px] w-14 h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white border-2 border-blue-500 active:scale-95 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md cursor-pointer"
        >
          <Plus size={24} strokeWidth={2.8} />
        </button>
      </div>

      {/* Preset Quick-Tap Chips (>= 44px min height, 12px gap) */}
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handlePreset(preset)}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 cursor-pointer ${
                value === preset
                  ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
                  : 'bg-white text-slate-700 hover:text-slate-900 border-slate-200 hover:border-slate-300'
              }`}
            >
              {prefix}{preset.toLocaleString()}{unit ? ` ${unit}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
