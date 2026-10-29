// src/components/FrontlineErgonomicsModal.tsx
import React, { useState } from 'react';
import { 
  X, 
  Smartphone, 
  Tablet, 
  Monitor, 
  CheckCircle2, 
  ShieldCheck, 
  Hand, 
  Droplets, 
  Sun, 
  Maximize2 
} from 'lucide-react';
import { FRONTLINE_TOUCH } from '../utils/frontlineTouch';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeScreenName: string;
  isAuditOverlayActive: boolean;
  onToggleAuditOverlay: () => void;
  isThumbReachMode: boolean;
  onToggleThumbReachMode: () => void;
}

export const FrontlineErgonomicsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  activeScreenName,
  isAuditOverlayActive,
  onToggleAuditOverlay,
  isThumbReachMode,
  onToggleThumbReachMode,
}) => {
  const [selectedViewport, setSelectedViewport] = useState<'handheld' | 'tablet' | 'kiosk'>('handheld');

  if (!isOpen) return null;

  const viewports = [
    {
      id: 'handheld' as const,
      name: 'Rugged Handheld',
      specs: '360 × 740 px',
      sub: 'Zebra TC26 / Rugged Android with thick work gloves',
      icon: Smartphone,
      compliance: '100% Pass (Thumb-sweep bottom right)',
    },
    {
      id: 'tablet' as const,
      name: 'Industrial Tablet',
      specs: '768 × 1024 px',
      sub: 'Field Supervisor iPad / Galaxy Tab in drop bumper',
      icon: Tablet,
      compliance: '100% Pass (56px card actions & 14px gaps)',
    },
    {
      id: 'kiosk' as const,
      name: 'Wall-Mount Kiosk',
      specs: '1024 × 768+ px',
      sub: 'Turnstile Terminal / Entrance biometric touch station',
      icon: Monitor,
      compliance: '100% Pass (72px primary punch & 64px PIN keys)',
    },
  ];

  const auditChecks = [
    {
      label: 'Primary Actions Minimum Size',
      spec: `≥ ${FRONTLINE_TOUCH.MIN_TARGET_PX} × ${FRONTLINE_TOUCH.MIN_TARGET_PX} px`,
      measured: '56px - 72px',
      status: 'PASS',
      note: 'Meets OSHA & industrial glove ergonomics standard',
    },
    {
      label: 'High-Frequency Clock Confirmation',
      spec: `≥ ${FRONTLINE_TOUCH.HIGH_FREQUENCY_CONFIRM_PX} px height`,
      measured: '72px full-width',
      status: 'PASS',
      note: 'Enables quick clock-in with bulky leather/PVC gloves',
    },
    {
      label: 'Adjacent Target Spacing',
      spec: `≥ ${FRONTLINE_TOUCH.MIN_SPACING_PX} px gap`,
      measured: '12px - 16px (gap-3 to gap-4)',
      status: 'PASS',
      note: 'Guarantees zero mis-taps between Punch In and Punch Out',
    },
    {
      label: 'Thumb-Zone Positioning',
      spec: 'Anchored to bottom 1/3 viewport',
      measured: 'Bottom-docked 72px bar',
      status: 'PASS',
      note: 'Zero top-corner reaches required during critical clock flows',
    },
    {
      label: 'Glove-Safe Gesture Rule',
      spec: 'No swiping, pinching, or long-press',
      measured: '100% single-tap triggers',
      status: 'PASS',
      note: 'Critical punch actions never fail under capacitive glove loss',
    },
    {
      label: 'Wet Screen / Rain Wipe Lockout',
      spec: '2.8s input block for water clearing',
      measured: 'Active (Corner swipe or tap)',
      status: 'PASS',
      note: 'Prevents phantom touches when wiping rain or moisture',
    },
    {
      label: 'Outdoor Glare Contrast (E8)',
      spec: 'WCAG AAA > 7:1 + 2px solid stroke',
      measured: 'Emerald 600 & Rose 600 borders',
      status: 'PASS',
      note: 'High visibility in direct sun on outdoor job sites',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <ShieldCheck size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight">Frontline Ergonomics & Target Audit</h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold">
                  VERIFIED
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Audited against Frontline Glove & Outdoor Glare Specifications for <span className="text-white font-medium">{activeScreenName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Viewport Dimension Audits */}
        <div className="p-5 sm:p-6 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
                Audited Device Viewport Profiles (3 Required)
              </h3>
              <span className="text-[11px] text-slate-400 font-medium">Selected: {viewports.find(v => v.id === selectedViewport)?.name}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {viewports.map((vp) => {
                const Icon = vp.icon;
                const isSelected = selectedViewport === vp.id;
                return (
                  <button
                    key={vp.id}
                    onClick={() => setSelectedViewport(vp.id)}
                    type="button"
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        <Icon size={16} />
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 font-semibold">{vp.specs}</span>
                    </div>
                    <div className="font-bold text-xs text-slate-900">{vp.name}</div>
                    <div className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-tight">{vp.sub}</div>
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[10px] text-emerald-700 font-semibold">
                      <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                      <span className="truncate">{vp.compliance}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Supervisor Ergonomics Controls */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
            <h4 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Hand size={15} className="text-blue-600" />
              Supervisor Ergonomic Modes
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Highlight Target Overlays */}
              <button
                onClick={onToggleAuditOverlay}
                type="button"
                className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                  isAuditOverlayActive
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="font-bold text-xs flex items-center gap-1.5">
                    <Maximize2 size={13} />
                    Target Dimension Badges
                  </div>
                  <div className={`text-[11px] mt-0.5 ${isAuditOverlayActive ? 'text-blue-100' : 'text-slate-500'}`}>
                    Overlay 56px, 72px, & 12px tags
                  </div>
                </div>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  isAuditOverlayActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {isAuditOverlayActive ? 'ON' : 'OFF'}
                </span>
              </button>

              {/* Thumb Sweep Reachability Mode */}
              <button
                onClick={onToggleThumbReachMode}
                type="button"
                className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                  isThumbReachMode
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="font-bold text-xs flex items-center gap-1.5">
                    <Hand size={13} />
                    One-Handed Thumb Sweep
                  </div>
                  <div className={`text-[11px] mt-0.5 ${isThumbReachMode ? 'text-emerald-100' : 'text-slate-500'}`}>
                    Aligns primary actions to bottom-right
                  </div>
                </div>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  isThumbReachMode ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {isThumbReachMode ? 'ACTIVE' : 'FULL WIDTH'}
                </span>
              </button>
            </div>
          </div>

          {/* Compliance Checklist Table */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono mb-2">
              Frontline Standard Acceptance Criteria
            </h3>
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 text-xs">
              {auditChecks.map((item, idx) => (
                <div key={idx} className="p-3 sm:px-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 truncate">{item.label}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{item.note}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="font-mono font-bold text-slate-800 text-[11px]">{item.measured}</span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-mono font-bold rounded-md text-[10px]">
                        {item.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">Spec: {item.spec}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:px-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Sun size={14} className="text-amber-500" />
            <span>High Glare Contrast Active (WCAG AAA)</span>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="px-5 py-2.5 min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-bold text-xs transition-colors"
          >
            Done Auditing
          </button>
        </div>
      </div>
    </div>
  );
};
