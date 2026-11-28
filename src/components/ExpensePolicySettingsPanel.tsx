// src/components/ExpensePolicySettingsPanel.tsx
import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Car,
  Fuel,
  Loader2,
  Receipt,
  RotateCcw,
  Save,
  ShieldAlert,
  Utensils,
} from 'lucide-react';
import { ExpenseCategory, ExpensePolicyConfig } from '../types/index';
import {
  DEFAULT_EXPENSE_POLICY_CONFIG,
  formatPaiseAsRupees,
  paiseToRupees,
  rupeesToPaise,
} from '../services/expenseService';

interface ExpensePolicySettingsPanelProps {
  policy: ExpensePolicyConfig;
  onChange: (next: ExpensePolicyConfig) => void;
  onSave?: () => void;
  onDiscard?: () => void;
  hasChanges?: boolean;
  saving?: boolean;
  showInlineSaveFooter?: boolean;
}

const CATEGORY_META: Array<{
  id: ExpenseCategory;
  label: string;
  subtitle: string;
  noun: string;
  icon: React.FC<{ size?: number; className?: string }>;
  accentBg: string;
  accentText: string;
}> = [
  {
    id: 'FOOD',
    label: 'Food',
    subtitle: 'Meals, snacks & client lunches',
    noun: 'food',
    icon: Utensils,
    accentBg: 'bg-amber-50 border-amber-200',
    accentText: 'text-amber-700',
  },
  {
    id: 'PETROL',
    label: 'Fuel (Petrol)',
    subtitle: 'Two-wheeler & field fuel bills',
    noun: 'fuel',
    icon: Fuel,
    accentBg: 'bg-teal-50 border-teal-200',
    accentText: 'text-teal-700',
  },
  {
    id: 'TRAVEL',
    label: 'Travel',
    subtitle: 'Auto, bus, train & road tolls',
    noun: 'travel',
    icon: Car,
    accentBg: 'bg-blue-50 border-blue-200',
    accentText: 'text-blue-700',
  },
  {
    id: 'OTHER',
    label: 'Other',
    subtitle: 'Site supplies & miscellaneous',
    noun: 'other',
    icon: Receipt,
    accentBg: 'bg-slate-100 border-slate-200',
    accentText: 'text-slate-700',
  },
];

function formatPaiseForInput(paise: number): string {
  const safe = Math.max(0, Math.round(paise));
  if (safe % 100 === 0) {
    return String(safe / 100);
  }
  return paiseToRupees(safe).toFixed(2);
}

export const ExpensePolicySettingsPanel: React.FC<ExpensePolicySettingsPanelProps> = ({
  policy,
  onChange,
  onSave,
  onDiscard,
  hasChanges = false,
  saving = false,
  showInlineSaveFooter = false,
}) => {
  const [draftInputs, setDraftInputs] = useState<Record<ExpenseCategory, string>>({
    FOOD: formatPaiseForInput(policy.dailyLimitsPaise.FOOD),
    PETROL: formatPaiseForInput(policy.dailyLimitsPaise.PETROL),
    TRAVEL: formatPaiseForInput(policy.dailyLimitsPaise.TRAVEL),
    OTHER: formatPaiseForInput(policy.dailyLimitsPaise.OTHER),
  });

  // Sync draft input strings when policy is reset/discarded or loaded asynchronously
  useEffect(() => {
    setDraftInputs((prev) => {
      const next = { ...prev };
      let changed = false;
      (['FOOD', 'PETROL', 'TRAVEL', 'OTHER'] as ExpenseCategory[]).forEach((cat) => {
        const expectedPaise = Math.max(0, Math.round(policy.dailyLimitsPaise[cat] || 0));
        const currentDraftPaise = rupeesToPaise(prev[cat]);
        if (currentDraftPaise !== expectedPaise) {
          next[cat] = formatPaiseForInput(expectedPaise);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [policy.dailyLimitsPaise]);

  const handleLimitInputChange = (cat: ExpenseCategory, raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, '');
    // Allow at most one decimal point and up to 2 decimal places (paise)
    const parts = cleaned.split('.');
    const normalized =
      parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}` : parts[0];

    setDraftInputs((prev) => ({ ...prev, [cat]: normalized }));

    const nextPaise = rupeesToPaise(normalized);
    onChange({
      ...policy,
      dailyLimitsPaise: {
        ...policy.dailyLimitsPaise,
        [cat]: nextPaise,
      },
    });
  };

  const handleResetDefaults = () => {
    const defaults = { ...DEFAULT_EXPENSE_POLICY_CONFIG.dailyLimitsPaise };
    setDraftInputs({
      FOOD: formatPaiseForInput(defaults.FOOD),
      PETROL: formatPaiseForInput(defaults.PETROL),
      TRAVEL: formatPaiseForInput(defaults.TRAVEL),
      OTHER: formatPaiseForInput(defaults.OTHER),
    });
    onChange({
      ...policy,
      enabled: true,
      requireOverrideNote: true,
      dailyLimitsPaise: defaults,
    });
  };

  const foodLimitDisplay = formatPaiseAsRupees(policy.dailyLimitsPaise.FOOD);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-6">
        {/* Header & Master Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
              <ShieldAlert size={22} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Automated Expense Policy Guardrails
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed max-w-2xl">
                Set daily per-worker limits per category. Claims exceeding the daily total are still
                created and automatically tagged with{' '}
                <code className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-bold text-[11px]">
                  POLICY_WARNING
                </code>{' '}
                for Manager review.
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center gap-2.5 cursor-pointer self-start sm:self-center shrink-0">
            <span className="text-xs font-bold text-slate-700">
              {policy.enabled ? 'Guardrails Active' : 'Guardrails Paused'}
            </span>
            <input
              type="checkbox"
              className="sr-only peer"
              checked={policy.enabled}
              onChange={(e) => onChange({ ...policy, enabled: e.target.checked })}
            />
            <div className="relative w-12 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
          </label>
        </div>

        {/* Category Daily Limit Inputs */}
        <div className={policy.enabled ? '' : 'opacity-55 pointer-events-none select-none'}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                Daily Limits per Category (Per Worker / Per Date)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                All comparisons use exact integer paise (₹1 = 100 paise) to prevent floating-point
                rounding errors. Set ₹0 to leave a category unlimited.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer shrink-0"
            >
              <RotateCcw size={13} />
              <span>Reset Defaults</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CATEGORY_META.map((cat) => {
              const Icon = cat.icon;
              const paiseValue = Math.max(0, Math.round(policy.dailyLimitsPaise[cat.id] || 0));
              const formattedRupees = formatPaiseAsRupees(paiseValue);

              return (
                <div
                  key={cat.id}
                  className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${cat.accentBg} ${cat.accentText}`}
                      >
                        <Icon size={17} />
                      </div>
                      <div className="min-w-0">
                        <label
                          htmlFor={`expense-limit-${cat.id}`}
                          className="text-sm font-bold text-slate-900 block leading-tight"
                        >
                          {cat.label} Daily Limit
                        </label>
                        <span className="text-[11px] text-slate-500 block truncate">
                          {cat.subtitle}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-lg shrink-0">
                      {paiseValue > 0 ? `${formattedRupees}/day` : 'No Limit'}
                    </span>
                  </div>

                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-sm font-black text-slate-500 pointer-events-none">
                      ₹
                    </span>
                    <input
                      id={`expense-limit-${cat.id}`}
                      type="text"
                      inputMode="decimal"
                      value={draftInputs[cat.id]}
                      onChange={(e) => handleLimitInputChange(cat.id, e.target.value)}
                      placeholder="0"
                      className="w-full pl-8 pr-20 h-11 bg-white border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none"
                    />
                    <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[11px] font-semibold text-slate-400 pointer-events-none">
                      / day
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                    <span>Stored integer: {paiseValue.toLocaleString('en-IN')} paise</span>
                    {paiseValue > 0 && (
                      <span className="text-rose-600 font-sans font-semibold">
                        Flags &gt; {formattedRupees}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mandatory Override Note Rule */}
        <div
          className={`p-4 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            policy.enabled ? '' : 'opacity-55'
          }`}
        >
          <div>
            <h4 className="text-xs font-extrabold text-slate-900">
              Mandatory Manager Override Note on Policy Warnings
            </h4>
            <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
              Over-limit claims are never blocked from submission. Managers can still approve them
              in Action Inbox by entering an audit-logged override note, or reject them with a
              mandatory reason.
            </p>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-extrabold uppercase tracking-wider shrink-0 self-start sm:self-center">
            Enforced
          </span>
        </div>

        {/* Live Preview of Manager Inbox Warning Banner & Aggregation Rule */}
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-2">
          <div className="flex items-center gap-2 text-xs font-extrabold text-rose-900">
            <AlertTriangle size={15} className="text-rose-600 shrink-0" />
            <span>Manager Inbox Preview (Multi-Claim Daily Aggregation)</span>
          </div>
          <div className="p-3 rounded-xl bg-rose-600 text-white text-xs font-bold shadow-xs">
            ⚠️ Warning: This claim exceeds the {foodLimitDisplay} food limit.
          </div>
          <p className="text-[11px] text-rose-800 leading-relaxed">
            <strong>Split-claim protection:</strong> If a worker submits 3 Food claims of ₹150 each
            on the same date (₹450 total), claims #1 and #2 stay clear while claim #3 is
            automatically tagged with <code className="font-mono font-bold">POLICY_WARNING</code>.
          </p>
        </div>

        {/* Inline Save Bar (used in Primary Settings mode) */}
        {showInlineSaveFooter && (
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              Changes apply immediately to new submissions and pending claims in the Manager Inbox.
            </span>
            <div className="flex items-center gap-2">
              {hasChanges && onDiscard && (
                <button
                  type="button"
                  onClick={onDiscard}
                  disabled={saving}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Discard
                </button>
              )}
              {onSave && (
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving || !hasChanges}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500 text-white text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  <span>{saving ? 'Saving...' : 'Save Daily Limits'}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
