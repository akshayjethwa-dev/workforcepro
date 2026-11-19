import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '../lib/capacitorKeyboard';

export interface ModalDatePickerProps {
  value: string; // ISO YYYY-MM-DD or empty string
  onChange: (isoDate: string) => void;
  label?: string;
  placeholder?: string;
  minYear?: number;
  maxYear?: number;
  disabled?: boolean;
  hasError?: boolean;
  id?: string;
  fieldName?: string;
  className?: string;
  allowClear?: boolean;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { year: y, month: m - 1, day: d };
}

function toIsoDate(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function formatReadableDate(iso: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return '';
  const dateObj = new Date(parsed.year, parsed.month, parsed.day);
  return dateObj.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Modal & dismissible date picker that prevents native browser/OS date pickers from awkwardly
 * overlaying mobile forms. Automatically dismisses any open soft keyboard before opening.
 */
export const ModalDatePicker: React.FC<ModalDatePickerProps> = ({
  value,
  onChange,
  label = 'Select Date',
  placeholder = 'Select date',
  minYear = 1945,
  maxYear = new Date().getFullYear() + 5,
  disabled = false,
  hasError = false,
  id,
  fieldName,
  className = '',
  allowClear = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const initialParsed = useMemo(() => parseIsoDate(value), [value]);
  const today = useMemo(() => new Date(), []);

  const [viewYear, setViewYear] = useState<number>(
    initialParsed?.year ?? today.getFullYear()
  );
  const [viewMonth, setViewMonth] = useState<number>(
    initialParsed?.month ?? today.getMonth()
  );

  // Sync displayed month/year when modal opens
  useEffect(() => {
    if (isOpen) {
      const parsed = parseIsoDate(value);
      setViewYear(parsed?.year ?? today.getFullYear());
      setViewMonth(parsed?.month ?? today.getMonth());
    }
  }, [isOpen, value, today]);

  // Dismiss on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleOpen = async () => {
    if (disabled) return;
    // Dismiss open keyboard so the modal date picker never clashes with the soft keyboard
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (Capacitor.isNativePlatform()) {
      try {
        await Keyboard.hide();
      } catch {
        // Ignore
      }
    }
    setIsOpen(true);
  };

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = maxYear; y >= minYear; y--) {
      list.push(y);
    }
    return list;
  }, [minYear, maxYear]);

  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<number | null> = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(d);
    }
    return cells;
  }, [viewYear, viewMonth]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      if (viewYear > minYear) {
        setViewYear((y) => y - 1);
        setViewMonth(11);
      }
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      if (viewYear < maxYear) {
        setViewYear((y) => y + 1);
        setViewMonth(0);
      }
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    onChange(toIsoDate(viewYear, viewMonth, day));
    setIsOpen(false);
  };

  const handleToday = () => {
    const now = new Date();
    onChange(toIsoDate(now.getFullYear(), now.getMonth(), now.getDate()));
    setIsOpen(false);
  };

  const readable = formatReadableDate(value);

  return (
    <>
      <button
        id={id}
        type="button"
        disabled={disabled}
        data-date-picker-trigger="true"
        data-field={fieldName}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-invalid={hasError || undefined}
        onClick={handleOpen}
        className={`w-full min-h-[48px] px-3.5 py-3 flex items-center justify-between gap-2 text-left rounded-xl border bg-white transition-all outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          hasError
            ? 'border-rose-400 ring-1 ring-rose-300'
            : 'border-gray-200 hover:border-slate-300'
        } ${className}`}
      >
        <span
          className={`truncate text-sm font-mono tabular-nums ${
            readable ? 'text-slate-900 font-semibold' : 'text-slate-400 font-normal font-sans'
          }`}
        >
          {readable || placeholder}
        </span>
        <Calendar size={17} className="text-slate-400 shrink-0" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-label={label}
          onClick={() => setIsOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[88dvh]"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            {/* Drag Handle Affordance on Mobile */}
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
              <div className="w-10 h-1.5 rounded-full bg-slate-300" />
            </div>

            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 truncate">{label}</h3>
                <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                  {readable || 'Tap a date below'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Close date picker"
              >
                <X size={18} />
              </button>
            </div>

            {/* Month & Year Navigation */}
            <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="min-h-[40px] min-w-[40px] rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center justify-center cursor-pointer shrink-0"
                aria-label="Previous month"
              >
                <ChevronLeft size={18} />
              </button>

              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <select
                  value={viewMonth}
                  onChange={(e) => setViewMonth(Number(e.target.value))}
                  aria-label="Select month"
                  className="flex-1 min-w-0 min-h-[40px] px-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-900 outline-none focus:border-blue-500 cursor-pointer"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={name} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  value={viewYear}
                  onChange={(e) => setViewYear(Number(e.target.value))}
                  aria-label="Select year"
                  className="w-24 min-h-[40px] px-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono font-bold text-slate-900 outline-none focus:border-blue-500 cursor-pointer"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                className="min-h-[40px] min-w-[40px] rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center justify-center cursor-pointer shrink-0"
                aria-label="Next month"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Weekday Headings */}
            <div className="px-4 grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400 uppercase py-1.5">
              {WEEKDAYS.map((wd) => (
                <div key={wd}>{wd}</div>
              ))}
            </div>

            {/* Day Grid (>=40px touch target cells) */}
            <div className="px-4 pb-3 grid grid-cols-7 gap-1 overflow-y-auto">
              {calendarDays.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="h-10" />;
                }
                const iso = toIsoDate(viewYear, viewMonth, day);
                const isSelected = value === iso;
                const isToday =
                  today.getFullYear() === viewYear &&
                  today.getMonth() === viewMonth &&
                  today.getDate() === day;

                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => handleSelectDay(day)}
                    className={`h-10 rounded-xl text-xs font-mono tabular-nums font-semibold flex items-center justify-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : isToday
                        ? 'bg-blue-50 text-blue-700 border border-blue-200 font-bold'
                        : 'text-slate-800 hover:bg-slate-100 active:bg-slate-200'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Footer Controls */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToday}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Today
                </button>
                {allowClear && value && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange('');
                      setIsOpen(false);
                    }}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="min-h-[40px] px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
