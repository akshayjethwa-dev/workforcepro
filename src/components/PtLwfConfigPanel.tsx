import React, { useMemo, useState } from 'react';
import { Save, ShieldCheck, RotateCcw, Search, ArrowRightLeft, Calculator } from 'lucide-react';
import {
  INDIAN_STATES,
  LwfWageCeilingMode,
  OrgSettings,
  PtLwfOrgConfig,
  StateLwfConfigOverride,
} from '../types/index';
import {
  STATE_LWF_RULES,
  StateLwfRule,
  calculateStateLwf,
  getAllStateLwfConfigRows,
  resolveStateLwfRule,
} from '../services/ptLwfDatabase';

interface PtLwfConfigPanelProps {
  orgSettings: OrgSettings;
  saving?: boolean;
  onSavePtLwfConfig: (config: PtLwfOrgConfig) => Promise<void> | void;
}

const MONTH_SHORT_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const SIMULATOR_MONTHS = [
  { value: '2026-01', label: 'January (2026-01)', monthNum: 1 },
  { value: '2026-02', label: 'February (2026-02)', monthNum: 2 },
  { value: '2026-03', label: 'March (2026-03)', monthNum: 3 },
  { value: '2026-04', label: 'April (2026-04)', monthNum: 4 },
  { value: '2026-05', label: 'May (2026-05)', monthNum: 5 },
  { value: '2026-06', label: 'June (2026-06 · H1)', monthNum: 6 },
  { value: '2026-07', label: 'July (2026-07)', monthNum: 7 },
  { value: '2026-08', label: 'August (2026-08)', monthNum: 8 },
  { value: '2026-09', label: 'September (2026-09)', monthNum: 9 },
  { value: '2026-10', label: 'October (2026-10)', monthNum: 10 },
  { value: '2026-11', label: 'November (2026-11)', monthNum: 11 },
  { value: '2026-12', label: 'December (2026-12 · H2/Annual)', monthNum: 12 },
];

export const PtLwfConfigPanel: React.FC<PtLwfConfigPanelProps> = ({
  orgSettings,
  saving = false,
  onSavePtLwfConfig,
}) => {
  const existingCfg = orgSettings.compliance?.ptLwfConfig;

  const [selectedState, setSelectedState] = useState<string>('Gujarat');
  const [gujaratFeb300, setGujaratFeb300] = useState<boolean>(
    existingCfg?.gujaratPtFeb300Adjustment !== false
  );
  const [maharashtraFeb300, setMaharashtraFeb300] = useState<boolean>(
    existingCfg?.maharashtraPtFeb300Adjustment !== false
  );
  const [midMonthProration, setMidMonthProration] = useState<boolean>(
    existingCfg?.ptMidMonthProrationEnabled !== false
  );
  const [overrides, setOverrides] = useState<Record<string, StateLwfConfigOverride>>(
    () => ({ ...(existingCfg?.lwfOverrides || {}) })
  );

  const [tableFilter, setTableFilter] = useState<'ALL' | 'ACTIVE' | 'NO_LWF'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Multi-state LWF & Mid-Year Transfer Preview state
  const [simWorkState, setSimWorkState] = useState<string>('Gujarat');
  const [simMonth, setSimMonth] = useState<string>('2026-06');
  const [simGross, setSimGross] = useState<number>(18000);
  const [simPrevState, setSimPrevState] = useState<string>('');
  const [simTransferDate, setSimTransferDate] = useState<string>('');

  const lwfStates = useMemo(() => Object.keys(STATE_LWF_RULES), []);

  const currentConfig: PtLwfOrgConfig = useMemo(
    () => ({
      gujaratPtFeb300Adjustment: gujaratFeb300,
      maharashtraPtFeb300Adjustment: maharashtraFeb300,
      ptMidMonthProrationEnabled: midMonthProration,
      lwfOverrides: overrides,
    }),
    [gujaratFeb300, maharashtraFeb300, midMonthProration, overrides]
  );

  const activeRule: StateLwfRule = useMemo(
    () => resolveStateLwfRule(selectedState, currentConfig),
    [selectedState, currentConfig]
  );

  const allConfigRows = useMemo(
    () => getAllStateLwfConfigRows(currentConfig),
    [currentConfig]
  );

  const filteredConfigRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allConfigRows.filter((row: StateLwfRule) => {
      if (tableFilter === 'ACTIVE' && (!row.enabled || row.cycle === 'NONE')) return false;
      if (tableFilter === 'NO_LWF' && row.enabled && row.cycle !== 'NONE') return false;
      if (q && !row.state.toLowerCase().includes(q) && !row.frequencyLabel.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [allConfigRows, tableFilter, searchQuery]);

  const tenantRegistrationState = useMemo(() => {
    const addr = (orgSettings.baseLocation?.address || '').toLowerCase();
    const matched = INDIAN_STATES.find((st) => addr.includes(st.toLowerCase()));
    if (matched) return matched;
    return orgSettings.branches?.[0]?.state || 'Maharashtra';
  }, [orgSettings]);

  const simMonthObj = useMemo(
    () => SIMULATOR_MONTHS.find((m) => m.value === simMonth) || SIMULATOR_MONTHS[5],
    [simMonth]
  );

  const simPreview = useMemo(() => {
    return calculateStateLwf(simWorkState, simMonthObj.monthNum, {
      ptLwfConfig: currentConfig,
      hasEarnedWages: simGross > 0,
      grossSalary: simGross,
      monthlySalary: simGross,
      previousState: simPrevState || undefined,
      stateEffectiveDate: simPrevState && simTransferDate ? simTransferDate : undefined,
      currentMonthStr: simMonth,
    });
  }, [simWorkState, simMonthObj, currentConfig, simGross, simPrevState, simTransferDate, simMonth]);

  const updateStateOverride = (patch: Partial<StateLwfConfigOverride>) => {
    const base = resolveStateLwfRule(selectedState, currentConfig);
    setOverrides((prev) => ({
      ...prev,
      [selectedState]: {
        enabled: prev[selectedState]?.enabled ?? base.enabled,
        cycle: prev[selectedState]?.cycle ?? base.cycle,
        employeeAmount: prev[selectedState]?.employeeAmount ?? base.employeeAmount,
        employerAmount: prev[selectedState]?.employerAmount ?? base.employerAmount,
        months: prev[selectedState]?.months ?? [...base.months],
        excludeContractors: prev[selectedState]?.excludeContractors ?? base.excludesContractors,
        wageCeiling:
          prev[selectedState]?.wageCeiling !== undefined
            ? prev[selectedState]?.wageCeiling
            : base.wageCeiling ?? null,
        wageCeilingMode: prev[selectedState]?.wageCeilingMode ?? base.wageCeilingMode ?? 'NONE',
        ...patch,
      },
    }));
  };

  const handleCycleChange = (nextCycle: StateLwfRule['cycle']) => {
    if (nextCycle === 'NONE') {
      updateStateOverride({
        enabled: false,
        cycle: 'NONE',
        months: [],
      });
    } else if (nextCycle === 'MONTHLY') {
      updateStateOverride({
        enabled: true,
        cycle: 'MONTHLY',
        months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      });
    } else if (nextCycle === 'HALF_YEARLY') {
      updateStateOverride({
        enabled: true,
        cycle: 'HALF_YEARLY',
        months: [6, 12],
      });
    } else {
      updateStateOverride({
        enabled: true,
        cycle: 'ANNUAL',
        months: [12],
      });
    }
  };

  const toggleMonth = (monthNum: number) => {
    const current = new Set<number>(activeRule.months);
    if (current.has(monthNum)) {
      current.delete(monthNum);
    } else {
      current.add(monthNum);
    }
    const nextMonths = Array.from(current).sort((a, b) => a - b);
    const derivedCycle: StateLwfRule['cycle'] =
      nextMonths.length === 0
        ? 'NONE'
        : nextMonths.length === 12
        ? 'MONTHLY'
        : nextMonths.length === 2
        ? 'HALF_YEARLY'
        : 'ANNUAL';
    updateStateOverride({
      months: nextMonths,
      cycle: derivedCycle,
      enabled: nextMonths.length > 0 ? activeRule.enabled : false,
    });
  };

  const resetSelectedState = () => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[selectedState];
      return next;
    });
  };

  const handleSave = async () => {
    await onSavePtLwfConfig(currentConfig);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck size={16} className="text-indigo-600" />
            <span>Professional Tax (PT) &amp; Multi-State Labour Welfare Fund (LWF) Engine</span>
          </h4>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
            Enforces LWF cycles by each employee&apos;s work location state (Half-Yearly Jun/Dec in Gujarat, Monthly ≤ ₹35 cap in Haryana, Yearly Dec in Karnataka, Nil in UP/Bihar), state wage ceilings, and mid-year transfer splits.
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="h-10 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
        >
          <Save size={14} />
          <span>{saving ? 'Saving...' : 'Save PT & LWF Config'}</span>
        </button>
      </div>

      {/* Global PT Engine Toggles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={gujaratFeb300}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGujaratFeb300(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-slate-900 rounded"
          />
          <div className="text-xs">
            <span className="font-bold text-slate-900 block">Gujarat PT Feb ₹300 Adjustment</span>
            <span className="text-[11px] text-slate-500">
              Deduct ₹300 in February (instead of ₹200) for employees &gt; ₹12,000/mo to reach ₹2,500 annual statutory total.
            </span>
          </div>
        </label>

        <label className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={maharashtraFeb300}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaharashtraFeb300(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-slate-900 rounded"
          />
          <div className="text-xs">
            <span className="font-bold text-slate-900 block">Maharashtra PT Feb ₹300 Adjustment</span>
            <span className="text-[11px] text-slate-500">
              Apply ₹300 February deduction for wages above ₹10,000/mo to hit the ₹2,500 annual ceiling.
            </span>
          </div>
        </label>

        <label className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={midMonthProration}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMidMonthProration(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-slate-900 rounded"
          />
          <div className="text-xs">
            <span className="font-bold text-slate-900 block">Mid-Month Joining PT Pro-Rating</span>
            <span className="text-[11px] text-slate-500">
              Pro-rate PT deduction by Days Worked / Days in Month when a worker joins after the 1st of the month.
            </span>
          </div>
        </label>
      </div>

      {/* State LWF Rate, Cycle & Wage Ceiling Configurator */}
      <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
              Edit State LWF Rule · {selectedState}
            </span>
            <span className="text-[11px] text-slate-500">
              {activeRule.statutoryNote}
            </span>
          </div>

          {overrides[selectedState] && (
            <button
              type="button"
              onClick={resetSelectedState}
              className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer self-start sm:self-auto shrink-0"
            >
              <RotateCcw size={12} />
              <span>Reset {selectedState}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Work State</label>
            <select
              value={selectedState}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedState(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-slate-900"
            >
              {lwfStates.map((st: string) => (
                <option key={st} value={st}>
                  {st}{overrides[st] ? ' (Custom)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Frequency</label>
            <select
              value={activeRule.enabled ? activeRule.cycle : 'NONE'}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                handleCycleChange(e.target.value as StateLwfRule['cycle'])
              }
              className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="MONTHLY">Monthly (All 12 mos)</option>
              <option value="HALF_YEARLY">Half-Yearly (Jun &amp; Dec)</option>
              <option value="ANNUAL">Yearly (December)</option>
              <option value="NONE">None (No Active LWF)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              {activeRule.employeePercentageRate ? 'EE Cap (₹)' : 'Employee Share (₹)'}
            </label>
            <input
              type="number"
              min={0}
              value={activeRule.employeeAmount}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                updateStateOverride({ employeeAmount: Math.max(0, Number(e.target.value) || 0) })
              }
              className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-mono tabular-nums font-bold text-slate-900 outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              {activeRule.employerMultiplier ? 'ER Cap (₹)' : 'Employer Share (₹)'}
            </label>
            <input
              type="number"
              min={0}
              value={activeRule.employerAmount}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                updateStateOverride({ employerAmount: Math.max(0, Number(e.target.value) || 0) })
              }
              className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-mono tabular-nums font-bold text-slate-900 outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Wage Ceiling (₹)
            </label>
            <input
              type="number"
              min={0}
              placeholder="No ceiling"
              value={activeRule.wageCeiling || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const raw = Number(e.target.value);
                if (!raw || raw <= 0) {
                  updateStateOverride({ wageCeiling: null, wageCeilingMode: 'NONE' });
                } else {
                  updateStateOverride({
                    wageCeiling: raw,
                    wageCeilingMode:
                      activeRule.wageCeilingMode && activeRule.wageCeilingMode !== 'NONE'
                        ? activeRule.wageCeilingMode
                        : 'EXEMPT_ABOVE',
                  });
                }
              }}
              className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-mono tabular-nums font-bold text-slate-900 outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Ceiling Rule
            </label>
            <select
              value={activeRule.wageCeilingMode || 'NONE'}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                updateStateOverride({
                  wageCeilingMode: e.target.value as LwfWageCeilingMode,
                  wageCeiling:
                    e.target.value === 'NONE'
                      ? null
                      : activeRule.wageCeiling || 15000,
                })
              }
              className="w-full h-10 px-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="NONE">All Wages Covered</option>
              <option value="EXEMPT_ABOVE">Cover ≤ Ceiling</option>
              <option value="EXEMPT_BELOW">Exempt &lt; Ceiling</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={activeRule.enabled}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateStateOverride({ enabled: e.target.checked })
                }
                className="w-4 h-4 accent-slate-900 rounded"
              />
              <span>LWF Active in {selectedState}</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={activeRule.excludesContractors}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateStateOverride({ excludeContractors: e.target.checked })
                }
                className="w-4 h-4 accent-slate-900 rounded"
              />
              <span>Skip for CONTRACTOR</span>
            </label>
          </div>
          <span className="text-[11px] font-mono text-slate-600">
            Active Months: {activeRule.months.map((m: number) => MONTH_SHORT_LABELS[m - 1]).join(', ') || 'None (No deduction)'}
          </span>
        </div>

        {/* Deduction Months Selector */}
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
          {MONTH_SHORT_LABELS.map((label: string, idx: number) => {
            const monthNum = idx + 1;
            const isSelected = activeRule.months.includes(monthNum);
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggleMonth(monthNum)}
                className={`h-8 rounded-lg text-[11px] font-mono font-bold border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Complete State-Specific LWF Configuration Table */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              State-Specific LWF Configuration Table ({allConfigRows.length} Jurisdictions)
            </h5>
            <p className="text-[11px] text-slate-500">
              Click any state row to edit its frequency, months, employee/employer rates, or wage ceiling above.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                placeholder="Filter state..."
                className="h-8 pl-7 pr-2.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 w-36"
              />
            </div>

            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold">
              {(['ALL', 'ACTIVE', 'NO_LWF'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTableFilter(tab)}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                    tableFilter === tab
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tab === 'ALL' ? 'All' : tab === 'ACTIVE' ? 'Active LWF' : 'No LWF'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-2xl max-h-80 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-3">State</th>
                <th className="py-2.5 px-3">Frequency</th>
                <th className="py-2.5 px-3">Deduction Months</th>
                <th className="py-2.5 px-3 text-right">Employee</th>
                <th className="py-2.5 px-3 text-right">Employer</th>
                <th className="py-2.5 px-3 text-right">Wage Ceiling</th>
                <th className="py-2.5 px-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredConfigRows.map((r: StateLwfRule) => {
                const isSelected = r.state === selectedState;
                const monthsLabel = !r.enabled || r.months.length === 0
                  ? '—'
                  : r.months.length === 12
                  ? 'All 12 mos'
                  : r.months.map((m: number) => MONTH_SHORT_LABELS[m - 1]).join(', ');

                const eeDisplay = !r.enabled || r.cycle === 'NONE'
                  ? '₹0'
                  : r.employeePercentageRate
                  ? `${Math.round(r.employeePercentageRate * 1000) / 10}% (cap ₹${r.employeeAmount})`
                  : `₹${r.employeeAmount}`;

                const erDisplay = !r.enabled || r.cycle === 'NONE'
                  ? '₹0'
                  : r.employerMultiplier
                  ? `${r.employerMultiplier}× (cap ₹${r.employerAmount})`
                  : `₹${r.employerAmount}`;

                const ceilingDisplay =
                  r.wageCeiling && r.wageCeiling > 0 && r.wageCeilingMode !== 'NONE'
                    ? r.wageCeilingMode === 'EXEMPT_BELOW'
                      ? `≥ ₹${r.wageCeiling.toLocaleString('en-IN')}`
                      : `≤ ₹${r.wageCeiling.toLocaleString('en-IN')}`
                    : 'All Wages';

                return (
                  <tr
                    key={r.state}
                    onClick={() => setSelectedState(r.state)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-indigo-50/50' : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      {r.state}
                      {overrides[r.state] ? (
                        <span className="ml-1.5 text-[10px] font-medium text-indigo-600">Custom</span>
                      ) : null}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-700">{r.frequencyLabel}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">{monthsLabel}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                      {eeDisplay}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-700">
                      {erDisplay}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[11px] text-slate-600">
                      {ceilingDisplay}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-[11px]">
                      {r.enabled && r.cycle !== 'NONE' ? (
                        <span className="text-emerald-700">Active</span>
                      ) : (
                        <span className="text-slate-400">No LWF</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Multi-State LWF & Mid-Year Transfer Preview */}
      <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calculator size={15} className="text-indigo-600" />
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Multi-State LWF &amp; Mid-Year Transfer Preview
            </span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            Tenant HQ: <strong className="text-slate-700">{tenantRegistrationState}</strong> · Uses Employee Work State
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Employee Work State
            </label>
            <select
              value={simWorkState}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSimWorkState(e.target.value)}
              className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
            >
              {lwfStates.map((st: string) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Payroll Month
            </label>
            <select
              value={simMonth}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSimMonth(e.target.value)}
              className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900"
            >
              {SIMULATOR_MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Monthly Salary (₹)
            </label>
            <input
              type="number"
              min={0}
              value={simGross}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setSimGross(Math.max(0, Number(e.target.value) || 0))
              }
              className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono tabular-nums font-bold text-slate-900"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Previous State (Transfer)
            </label>
            <select
              value={simPrevState}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSimPrevState(e.target.value)}
              className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900"
            >
              <option value="">No Mid-Year Transfer</option>
              {lwfStates.map((st: string) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Transfer Effective Date
            </label>
            <input
              type="date"
              disabled={!simPrevState}
              value={simTransferDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSimTransferDate(e.target.value)}
              className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="space-y-0.5">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              {simPreview.transferSplit && <ArrowRightLeft size={13} className="text-indigo-600" />}
              <span>{simPreview.ruleApplied}</span>
            </div>
            <div className="text-[11px] font-mono text-slate-500">
              {simPreview.calculationText}
            </div>
          </div>
          <div className="font-mono tabular-nums text-right shrink-0">
            <div className="text-slate-900 font-bold">
              EE: ₹{simPreview.employeeLwf} · ER: ₹{simPreview.employerLwf}
            </div>
            <div className="text-[11px] text-slate-500">
              Cycle: {simPreview.frequencyLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
