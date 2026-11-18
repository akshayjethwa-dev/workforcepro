import React, { useMemo, useState } from 'react';
import { Scale, Plus, Trash2, Calendar, MapPin, CheckCircle2 } from 'lucide-react';
import {
  INDIAN_STATES,
  MinimumWageRevisionRule,
  OrgSettings,
  WorkerSkillCategory,
} from '../types/index';
import {
  DEFAULT_SCHEDULED_EMPLOYMENT,
  getDefaultZoneForState,
  getMinimumWageMatrixForState,
  getZonesForState,
  SCHEDULED_EMPLOYMENT_CATEGORIES,
  SKILL_LEVEL_LABELS,
} from '../services/minimumWageDatabase';

interface Props {
  orgSettings: OrgSettings;
  onUpdateRevisions: (revisions: MinimumWageRevisionRule[]) => Promise<void> | void;
  saving?: boolean;
}

export const MinimumWageSchedulePanel: React.FC<Props> = ({
  orgSettings,
  onUpdateRevisions,
  saving = false,
}) => {
  const [selectedState, setSelectedState] = useState<string>('Gujarat');
  const [selectedEmployment, setSelectedEmployment] = useState<string>(
    DEFAULT_SCHEDULED_EMPLOYMENT
  );

  // Mid-Month Revision Form State
  const [revState, setRevState] = useState<string>('Gujarat');
  const [revZone, setRevZone] = useState<string>('Anand');
  const [revSkill, setRevSkill] = useState<WorkerSkillCategory>('SEMI_SKILLED');
  const [revEffectiveDate, setRevEffectiveDate] = useState<string>('2026-11-16');
  const [revPrevFloor, setRevPrevFloor] = useState<string>('12000');
  const [revNewFloor, setRevNewFloor] = useState<string>('15000');
  const [revNotifDate, setRevNotifDate] = useState<string>('2026-11-16');
  const [revRef, setRevRef] = useState<string>('GJ Gazette Mid-Month VDA Revision');

  const matrix = useMemo(
    () => getMinimumWageMatrixForState(selectedState, selectedEmployment),
    [selectedState, selectedEmployment]
  );

  const revisions = orgSettings.compliance?.minimumWageRevisions || [];

  const handleAddRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    const prevVal = parseFloat(revPrevFloor) || 0;
    const newVal = parseFloat(revNewFloor) || 0;
    if (!revEffectiveDate || prevVal <= 0 || newVal <= 0) return;

    const newRule: MinimumWageRevisionRule = {
      id: `mwrev_${Date.now()}`,
      state: revState,
      zone: revZone,
      scheduledEmployment: selectedEmployment,
      skillCategory: revSkill,
      effectiveDate: revEffectiveDate,
      previousMonthlyFloor: prevVal,
      revisedMonthlyFloor: newVal,
      notificationDate: revNotifDate || revEffectiveDate,
      notificationRef: revRef.trim() || 'State Gazette Notification',
    };

    await onUpdateRevisions([...revisions, newRule]);
  };

  const handleDeleteRevision = async (id: string) => {
    await onUpdateRevisions(revisions.filter((r) => r.id !== id));
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-center shrink-0 mt-0.5">
            <Scale size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              State Minimum Wage Schedule &amp; Mid-Month Revisions
            </h4>
            <p className="text-xs text-slate-500 mt-0.5 max-w-2xl leading-relaxed">
              Statutory floors indexed by State, Scheduled Employment, Zone (e.g., Anand vs Vadodara), Skill Level, and Notification Date. Mid-month revisions automatically pro-rate the floor for days on or after the notification date.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <MapPin size={13} className="text-slate-500" />
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="text-xs font-semibold text-slate-800 bg-transparent outline-none cursor-pointer"
              aria-label="Inspect State Minimum Wages"
            >
              {INDIAN_STATES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <select
            value={selectedEmployment}
            onChange={(e) => setSelectedEmployment(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none cursor-pointer"
            aria-label="Scheduled Employment Category"
          >
            {SCHEDULED_EMPLOYMENT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Zone x Skill Matrix */}
      <div className="overflow-x-auto border border-slate-200/80 rounded-2xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <th className="py-2.5 px-3">Zone / Area</th>
              <th className="py-2.5 px-3">Unskilled</th>
              <th className="py-2.5 px-3">Semi-Skilled</th>
              <th className="py-2.5 px-3">Skilled</th>
              <th className="py-2.5 px-3">Highly Skilled</th>
              <th className="py-2.5 px-3">Notification Date &amp; Ref</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {matrix.map((row) => (
              <tr key={row.zone} className="hover:bg-slate-50/70">
                <td className="py-2.5 px-3 font-semibold text-slate-900">{row.zone}</td>
                <td className="py-2.5 px-3 font-mono tabular-nums text-slate-800">
                  ₹{row.rates.UNSKILLED.toLocaleString('en-IN')}
                  <span className="block text-[10px] text-slate-400">
                    ₹{Math.round(row.rates.UNSKILLED / 26)}/d
                  </span>
                </td>
                <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-slate-900">
                  ₹{row.rates.SEMI_SKILLED.toLocaleString('en-IN')}
                  <span className="block text-[10px] font-normal text-slate-400">
                    ₹{Math.round(row.rates.SEMI_SKILLED / 26)}/d
                  </span>
                </td>
                <td className="py-2.5 px-3 font-mono tabular-nums text-slate-800">
                  ₹{row.rates.SKILLED.toLocaleString('en-IN')}
                  <span className="block text-[10px] text-slate-400">
                    ₹{Math.round(row.rates.SKILLED / 26)}/d
                  </span>
                </td>
                <td className="py-2.5 px-3 font-mono tabular-nums text-slate-800">
                  ₹{row.rates.HIGHLY_SKILLED.toLocaleString('en-IN')}
                  <span className="block text-[10px] text-slate-400">
                    ₹{Math.round(row.rates.HIGHLY_SKILLED / 26)}/d
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <span className="font-mono tabular-nums font-semibold text-slate-800 block">
                    {row.notificationDate}
                  </span>
                  <span className="text-[10px] text-slate-500">{row.notificationRef}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mid-Month State Gazette Revision Manager */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Calendar size={14} className="text-slate-600" />
              <span>Mid-Month Minimum Wage Revisions (Pro-Rated Daily Split)</span>
            </h5>
            <p className="text-[11px] text-slate-500">
              When a state revises minimum wages mid-month, the higher rate applies only to calendar days on or after the revision date.
            </p>
          </div>
          <span className="text-[11px] font-mono tabular-nums text-slate-600 font-semibold">
            {revisions.length} Active Override(s)
          </span>
        </div>

        {revisions.length > 0 && (
          <div className="space-y-2">
            {revisions.map((rev) => (
              <div
                key={rev.id}
                className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-bold text-slate-900">
                    {rev.state} · {rev.zone} · {SKILL_LEVEL_LABELS[rev.skillCategory]}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-600 mt-0.5">
                    Effective {rev.effectiveDate} · ₹{rev.previousMonthlyFloor.toLocaleString('en-IN')} →{' '}
                    <strong>₹{rev.revisedMonthlyFloor.toLocaleString('en-IN')}/mo</strong> · Notif.{' '}
                    {rev.notificationDate} ({rev.notificationRef})
                  </div>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleDeleteRevision(rev.id)}
                  className="p-2 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                  title="Remove revision rule"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={handleAddRevision}
          className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 pt-2 border-t border-slate-200/80"
        >
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">State</label>
            <select
              value={revState}
              onChange={(e) => {
                const st = e.target.value;
                setRevState(st);
                setRevZone(getDefaultZoneForState(st));
              }}
              className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
            >
              {INDIAN_STATES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Zone</label>
            <select
              value={revZone}
              onChange={(e) => setRevZone(e.target.value)}
              className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
            >
              {getZonesForState(revState).map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Skill</label>
            <select
              value={revSkill}
              onChange={(e) => setRevSkill(e.target.value as WorkerSkillCategory)}
              className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
            >
              {(Object.keys(SKILL_LEVEL_LABELS) as WorkerSkillCategory[]).map((sk) => (
                <option key={sk} value={sk}>
                  {SKILL_LEVEL_LABELS[sk]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Revision Date</label>
            <input
              type="date"
              value={revEffectiveDate}
              onChange={(e) => {
                setRevEffectiveDate(e.target.value);
                setRevNotifDate(e.target.value);
              }}
              className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-semibold"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Old → New Floor</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                value={revPrevFloor}
                onChange={(e) => setRevPrevFloor(e.target.value)}
                placeholder="Old"
                className="w-1/2 px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold"
              />
              <input
                type="number"
                min={1}
                value={revNewFloor}
                onChange={(e) => setRevNewFloor(e.target.value)}
                placeholder="New"
                className="w-1/2 px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold"
              />
            </div>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full h-9 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Plus size={14} />
              <span>Add Revision</span>
            </button>
          </div>
          <div className="sm:col-span-6">
            <input
              type="text"
              value={revRef}
              onChange={(e) => setRevRef(e.target.value)}
              placeholder="Gazette / Notification Reference"
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[11px] text-slate-700"
            />
          </div>
        </form>
      </div>
    </div>
  );
};
