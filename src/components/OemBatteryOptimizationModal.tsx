// src/components/OemBatteryOptimizationModal.tsx
import React, { useState } from 'react';
import { 
  Battery, AlertTriangle, ShieldAlert, CheckCircle2, XCircle, 
  ChevronRight, Smartphone, Settings, ArrowRight, Zap, Info, Shield
} from 'lucide-react';
import { breadcrumbService } from '../services/breadcrumbService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  deviceId: string;
  workerId: string;
  workerName: string;
  tenantId: string;
  onCompleted: (optInSuccess: boolean) => void;
}

export const OemBatteryOptimizationModal: React.FC<Props> = ({
  isOpen,
  onClose,
  deviceId,
  workerId,
  workerName,
  tenantId,
  onCompleted
}) => {
  const [detectedOem] = useState<'XIAOMI' | 'OPPO_REALME' | 'VIVO' | 'SAMSUNG' | 'STOCK_ANDROID' | 'OTHER'>(() => 
    breadcrumbService.detectDeviceOem()
  );
  const [selectedBrand, setSelectedBrand] = useState<'XIAOMI' | 'OPPO_REALME' | 'VIVO' | 'SAMSUNG' | 'STOCK_ANDROID'>(
    detectedOem === 'OTHER' ? 'XIAOMI' : (detectedOem as any)
  );
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [saving, setSaving] = useState<boolean>(false);

  if (!isOpen) return null;

  const getBrandGuide = (brand: typeof selectedBrand) => {
    switch (brand) {
      case 'XIAOMI':
        return {
          name: 'Xiaomi / Redmi / Poco (MIUI / HyperOS)',
          color: 'text-orange-600',
          badgeBg: 'bg-orange-50 border-orange-200 text-orange-700',
          steps: [
            {
              title: 'Open App Info',
              desc: 'Long press the WorkForce app icon on your home screen and tap "App info" (ⓘ icon).',
              tag: 'Step 1'
            },
            {
              title: 'Set Battery Saver to "No restrictions"',
              desc: 'Scroll down to "Battery saver" and select "No restrictions" so MIUI does not kill background location when screen locks.',
              tag: 'Step 2'
            },
            {
              title: 'Enable Autostart',
              desc: 'Toggle ON "Autostart" to allow the app to resume shift breadcrumb heartbeats seamlessly.',
              tag: 'Step 3'
            }
          ]
        };
      case 'OPPO_REALME':
        return {
          name: 'Oppo / Realme / OnePlus (ColorOS / OxygenOS)',
          color: 'text-emerald-600',
          badgeBg: 'bg-emerald-50 border-emerald-200 text-emerald-700',
          steps: [
            {
              title: 'App Management in Settings',
              desc: 'Open phone Settings > Apps > App management > WorkForce Pro.',
              tag: 'Step 1'
            },
            {
              title: 'Battery Usage Settings',
              desc: 'Tap "Battery usage" and switch ON "Allow background activity" and "Allow auto-launch".',
              tag: 'Step 2'
            },
            {
              title: 'Don\'t Optimize',
              desc: 'Under "Optimize battery use", ensure WorkForce is set to "Don\'t optimize".',
              tag: 'Step 3'
            }
          ]
        };
      case 'VIVO':
        return {
          name: 'Vivo / iQOO (Funtouch OS / OriginOS)',
          color: 'text-blue-600',
          badgeBg: 'bg-blue-50 border-blue-200 text-blue-700',
          steps: [
            {
              title: 'App Info & Battery',
              desc: 'Go to Settings > Battery > High background power consumption.',
              tag: 'Step 1'
            },
            {
              title: 'Allow High Background Power',
              desc: 'Find "WorkForce" in the list and switch ON the toggle to prevent Funtouch OS from stopping background GPS.',
              tag: 'Step 2'
            },
            {
              title: 'Permission Autostart',
              desc: 'In Settings > Applications > Autostart, allow WorkForce.',
              tag: 'Step 3'
            }
          ]
        };
      case 'SAMSUNG':
        return {
          name: 'Samsung Galaxy (One UI)',
          color: 'text-indigo-600',
          badgeBg: 'bg-indigo-50 border-indigo-200 text-indigo-700',
          steps: [
            {
              title: 'App Battery Settings',
              desc: 'Go to Settings > Apps > WorkForce > Battery.',
              tag: 'Step 1'
            },
            {
              title: 'Set to "Unrestricted"',
              desc: 'Select "Unrestricted" (default is Optimized, which freezes location within 5 minutes of screen off).',
              tag: 'Step 2'
            },
            {
              title: 'Never Sleeping Apps',
              desc: 'In Device Care > Battery > Background usage limits, add WorkForce to "Never sleeping apps".',
              tag: 'Step 3'
            }
          ]
        };
      default:
        return {
          name: 'Standard Android (Stock / Pixel / Motorola)',
          color: 'text-slate-800',
          badgeBg: 'bg-slate-100 border-slate-200 text-slate-800',
          steps: [
            {
              title: 'App Info > App Battery Usage',
              desc: 'Long press WorkForce icon > App Info > App battery usage.',
              tag: 'Step 1'
            },
            {
              title: 'Set to "Unrestricted"',
              desc: 'Choose "Unrestricted" so Android Doze does not suppress the 8-minute shift breadcrumb pulse.',
              tag: 'Step 2'
            }
          ]
        };
    }
  };

  const guide = getBrandGuide(selectedBrand);

  const handleConfirmEnabled = async () => {
    setSaving(true);
    try {
      await breadcrumbService.saveOemBatteryOptDecision({
        deviceId,
        tenantId,
        workerId,
        workerName,
        osType: selectedBrand,
        declined: false
      });
      onCompleted(true);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDecline = async () => {
    setSaving(true);
    try {
      await breadcrumbService.saveOemBatteryOptDecision({
        deviceId,
        tenantId,
        workerId,
        workerName,
        osType: selectedBrand,
        declined: true
      });
      onCompleted(false);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-linear-to-r from-amber-600 to-orange-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Disable Battery Optimization</h3>
              <p className="text-xs text-amber-100 font-medium">Keep shift tracking active when screen turns off</p>
            </div>
          </div>
        </div>

        {/* Brand Selector */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/70">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
            Select Your Phone Brand
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'XIAOMI', label: 'Xiaomi / Poco' },
              { id: 'OPPO_REALME', label: 'Oppo / Realme' },
              { id: 'VIVO', label: 'Vivo / iQOO' },
              { id: 'SAMSUNG', label: 'Samsung' }
            ].map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBrand(b.id as any)}
                className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition-all text-center ${
                  selectedBrand === b.id 
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs' 
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content & Walkthrough Steps */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Why notice */}
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/80 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <span className="font-bold block text-amber-950 mb-0.5">Aggressive Background Killers Detected</span>
              {guide.name} aggressively freezes background apps within 5 minutes of turning the screen off. Without this setting, your route breadcrumbs will stop until you open the app again.
            </div>
          </div>

          {/* Steps Visual List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Follow These 3 Quick Steps:</span>
              <span className="text-slate-400 font-normal">Takes &lt; 30 seconds</span>
            </div>

            {guide.steps.map((st, idx) => (
              <div 
                key={idx}
                className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex items-start gap-3 shadow-2xs"
              >
                <div className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900">{st.title}</h4>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {st.tag}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{st.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Android Doze clarification */}
          <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-2.5 text-[11px] text-slate-600">
            <Info className="w-4 h-4 text-slate-500 shrink-0" />
            <span>
              Even with optimization disabled, Android Doze maintains battery health by grouping background GPS wakes to once every ~8–9 minutes.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={handleDecline}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors text-center"
          >
            Skip &amp; Use Punch-Only Mode
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={handleConfirmEnabled}
            className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>I Have Enabled Unrestricted</span>
          </button>
        </div>

      </div>
    </div>
  );
};
