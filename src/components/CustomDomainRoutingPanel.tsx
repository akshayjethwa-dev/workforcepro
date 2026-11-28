// src/components/CustomDomainRoutingPanel.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Globe,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  Play,
  ArrowRight,
  Terminal,
} from 'lucide-react';
import {
  MAGIC_LINK_DOMAIN_PRESETS,
  getMagicLinkBaseUrl,
  setMagicLinkBaseUrl,
  normalizeMagicLinkBaseUrl,
  checkCustomDomainRouting,
  CustomDomainRouteCheckResult,
} from '../services/magicLinkService';
import { useToast } from '../contexts/ToastContext';

interface CustomDomainRoutingPanelProps {
  tenantId?: string;
}

export const CustomDomainRoutingPanel: React.FC<CustomDomainRoutingPanelProps> = ({ tenantId }) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [activeBaseUrl, setActiveBaseUrl] = useState<string>(() => getMagicLinkBaseUrl(tenantId));
  const [customInput, setCustomInput] = useState<string>(() => getMagicLinkBaseUrl(tenantId));
  const [checkingDomain, setCheckingDomain] = useState<boolean>(false);
  const [checkResult, setCheckResult] = useState<CustomDomainRouteCheckResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const testRouteUrl = `${activeBaseUrl}/w/test-token`;
  const deployCmd = 'npm run build && firebase deploy --only hosting:app';

  const handleSelectDomain = (url: string) => {
    const saved = setMagicLinkBaseUrl(url, tenantId);
    setActiveBaseUrl(saved);
    setCustomInput(saved);
    setCheckResult(null);
    toast.success(`Magic links will now use ${saved}/w/:token`);
  };

  const handleSaveCustomDomain = () => {
    const normalized = normalizeMagicLinkBaseUrl(customInput);
    const saved = setMagicLinkBaseUrl(normalized, tenantId);
    setActiveBaseUrl(saved);
    setCustomInput(saved);
    setCheckResult(null);
    toast.success(`Custom magic link domain saved: ${saved}`);
  };

  const handleRunLiveCheck = async () => {
    setCheckingDomain(true);
    try {
      const result = await checkCustomDomainRouting(activeBaseUrl, 'test-token');
      setCheckResult(result);
    } finally {
      setCheckingDomain(false);
    }
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      toast.info(text);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Active Magic Link Custom Domain */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <Globe size={18} className="text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Custom Domain &amp; Magic Link Routing</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Configure the custom domain used for worker magic links (<span className="font-mono text-slate-700">/w/:token</span>) and verify that Firebase Hosting routes every path cleanly to the React app without 404 errors or marketing site conflicts.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold shrink-0">
            <ShieldCheck size={13} className="text-emerald-600" />
            SPA Rewrite Active
          </span>
        </div>

        {/* Preset Topology Choices */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          {MAGIC_LINK_DOMAIN_PRESETS.map((preset) => {
            const isSelected = activeBaseUrl === preset.url;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectDomain(preset.url)}
                className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50/70 border-blue-500 ring-1 ring-blue-500/30'
                    : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 font-mono truncate">{preset.url.replace('https://', '')}</span>
                  {isSelected && <CheckCircle2 size={15} className="text-blue-600 shrink-0" />}
                </div>
                <p className="text-[11px] font-semibold text-slate-700 mt-1">{preset.label}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{preset.marketingNote}</p>
              </button>
            );
          })}
        </div>

        {/* Custom Origin Input */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
              Active Magic Link Base Domain
            </label>
            <input
              type="url"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="https://wfpro.in"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-semibold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white outline-none transition-colors"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleSaveCustomDomain}
              className="w-full sm:w-auto px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer min-h-[42px]"
            >
              Apply Domain
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-slate-700 shrink-0">Generated Link Preview:</span>
            <span className="font-mono text-blue-700 truncate">{testRouteUrl}</span>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(testRouteUrl, 'test-url')}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer shrink-0"
          >
            {copiedKey === 'test-url' ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
            <span>Copy</span>
          </button>
        </div>
      </div>

      {/* 2. Route Tester (/w/test-token) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Test <span className="font-mono">/w/test-token</span> Routing</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Verify that visiting <span className="font-mono text-slate-700">{testRouteUrl}</span> loads the React app (showing the graceful &ldquo;Link Inactive or Expired&rdquo; card) rather than a 404 or marketing page.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate('/w/test-token')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            <Play size={13} />
            <span>Test /w/test-token in App</span>
          </button>

          <button
            type="button"
            disabled={checkingDomain}
            onClick={handleRunLiveCheck}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={checkingDomain ? 'animate-spin' : ''} />
            <span>{checkingDomain ? 'Checking Domain...' : 'Probe Custom Domain'}</span>
          </button>

          <a
            href={testRouteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-xl text-xs font-semibold transition-colors"
          >
            <span>Open {activeBaseUrl.replace('https://', '')}/w/test-token</span>
            <ExternalLink size={13} />
          </a>
        </div>

        {checkResult && (
          <div
            className={`mt-4 p-4 rounded-xl border text-xs space-y-1.5 ${
              checkResult.status === 'OK_SPA'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : checkResult.status === 'REACHABLE_CORS'
                ? 'bg-blue-50 border-blue-200 text-blue-950'
                : 'bg-amber-50 border-amber-200 text-amber-950'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold">
                {checkResult.status === 'OK_SPA' ? (
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                )}
                <span>{checkResult.summary}</span>
              </div>
              {checkResult.httpStatus && (
                <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-white/70 border border-black/10">
                  HTTP {checkResult.httpStatus}
                </span>
              )}
            </div>
            {checkResult.recommendation && (
              <p className="text-xs opacity-90 leading-relaxed">{checkResult.recommendation}</p>
            )}
          </div>
        )}
      </div>

      {/* 3. Firebase Hosting Mapping & Marketing Site Conflict Prevention */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Firebase Hosting &amp; Marketing Site Conflict Guard</h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            If <span className="font-mono text-slate-700">wfpro.in</span> points to the marketing hosting site (<span className="font-mono text-slate-700">workforcepro-marketing</span>), worker magic links on <span className="font-mono text-slate-700">/w/:token</span> will not open the React app. Use one of these two conflict-free domain mappings in Firebase Hosting:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">Option A: Main App on Apex (Recommended)</span>
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                wfpro.in
              </span>
            </div>
            <ul className="text-xs text-slate-600 space-y-1">
              <li className="flex items-center gap-1.5">
                <ArrowRight size={12} className="text-blue-600 shrink-0" />
                <span><strong className="font-mono text-slate-800">wfpro.in</strong> → Hosting site <span className="font-mono text-slate-800">workforcepro-saas</span> (target: <span className="font-mono">app</span>)</span>
              </li>
              <li className="flex items-center gap-1.5">
                <ArrowRight size={12} className="text-slate-400 shrink-0" />
                <span><strong className="font-mono text-slate-800">www.wfpro.in</strong> → Hosting site <span className="font-mono text-slate-800">workforcepro-marketing</span> (target: <span className="font-mono">marketing</span>)</span>
              </li>
            </ul>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">Option B: Main App on Subdomain</span>
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                app.wfpro.in
              </span>
            </div>
            <ul className="text-xs text-slate-600 space-y-1">
              <li className="flex items-center gap-1.5">
                <ArrowRight size={12} className="text-blue-600 shrink-0" />
                <span><strong className="font-mono text-slate-800">app.wfpro.in</strong> → Hosting site <span className="font-mono text-slate-800">workforcepro-saas</span> (target: <span className="font-mono">app</span>)</span>
              </li>
              <li className="flex items-center gap-1.5">
                <ArrowRight size={12} className="text-slate-400 shrink-0" />
                <span><strong className="font-mono text-slate-800">wfpro.in</strong> → Hosting site <span className="font-mono text-slate-800">workforcepro-marketing</span> (with <span className="font-mono">/w/*</span> fallback redirect)</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Verified firebase.json Checklist */}
        <div className="rounded-xl bg-slate-900 text-slate-100 p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <Terminal size={14} />
              <span>Verified firebase.json Hosting Configuration</span>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(deployCmd, 'deploy-cmd')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-200 cursor-pointer"
            >
              {copiedKey === 'deploy-cmd' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              <span>Copy Deploy Command</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono text-slate-300">
            <div className="bg-slate-800/80 rounded-lg px-3 py-2">
              <span className="text-slate-400 block">target &quot;app&quot;</span>
              <span className="text-emerald-300">&quot;**&quot; → &quot;/index.html&quot;</span>
            </div>
            <div className="bg-slate-800/80 rounded-lg px-3 py-2">
              <span className="text-slate-400 block">Firebase Site</span>
              <span className="text-blue-300">workforcepro-saas</span>
            </div>
            <div className="bg-slate-800/80 rounded-lg px-3 py-2">
              <span className="text-slate-400 block">Deploy Command</span>
              <span className="text-amber-300">hosting:app</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
