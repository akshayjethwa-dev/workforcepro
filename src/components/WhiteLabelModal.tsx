// src/components/WhiteLabelModal.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, Palette, Globe, Mail, Eye, CheckCircle2, AlertTriangle, 
  RotateCcw, Sparkles, Upload, ExternalLink, ShieldCheck, 
  Smartphone, Monitor, RefreshCw, Copy, Check, ArrowRight
} from 'lucide-react';
import { BrandingConfig, CustomDomainConfig, EmailTemplateConfig } from '../types/index';
import { auditContrast, autoAdjustForWCAG_AA, getContrastRatio } from '../utils/wcagColor';
import { dbService } from '../services/db';
import { useToast } from '../contexts/ToastContext';
import { useTheme, DEFAULT_PLATFORM_BRANDING } from '../contexts/ThemeContext';

interface WhiteLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: {
    id?: string;
    tenantId: string;
    companyName: string;
    plan?: string;
    branding?: BrandingConfig;
  };
  onSaved: () => void;
}

type TabType = 'ASSETS' | 'PALETTE' | 'DOMAIN' | 'EMAIL' | 'PREVIEW';
type PreviewDevice = 'MOBILE' | 'DESKTOP';
type PreviewScreen = 'DASHBOARD' | 'KIOSK' | 'EMAIL';

export const WhiteLabelModal: React.FC<WhiteLabelModalProps> = ({
  isOpen,
  onClose,
  tenant,
  onSaved,
}) => {
  const { toast } = useToast();
  const { setPreviewBranding } = useTheme();

  // Active Tab
  const [activeTab, setActiveTab] = useState<TabType>('ASSETS');
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('MOBILE');
  const [previewScreen, setPreviewScreen] = useState<PreviewScreen>('DASHBOARD');

  // Form State
  const [appName, setAppName] = useState(tenant.branding?.appName || tenant.companyName || 'WorkForce Pro');
  const [logoUrl, setLogoUrl] = useState(tenant.branding?.logoUrl || '');
  const [faviconUrl, setFaviconUrl] = useState(tenant.branding?.faviconUrl || '');
  const [primaryColor, setPrimaryColor] = useState(tenant.branding?.primaryColor || '#2563eb');
  const [backgroundColor, setBackgroundColor] = useState(tenant.branding?.backgroundColor || '#f8fafc');
  const [linkColor, setLinkColor] = useState(tenant.branding?.linkColor || '#2563eb');
  const [textColor, setTextColor] = useState(tenant.branding?.textColor || '#0f172a');

  // Domain Config
  const [customDomain, setCustomDomain] = useState<CustomDomainConfig>(() => {
    return tenant.branding?.customDomain || {
      domain: '',
      status: 'PENDING',
      verificationToken: `wf-token-${(tenant.tenantId || 'demo').slice(0, 8)}-${Math.random().toString(36).substring(2, 6)}`,
      cnameTarget: 'cname.workforcepro.app',
      dnsRecords: {
        cnameHost: 'attendance',
        cnameValue: 'cname.workforcepro.app',
        txtHost: '_workforce-verify',
        txtValue: `wf-token-${(tenant.tenantId || 'demo').slice(0, 8)}`
      }
    };
  });
  const [domainInput, setDomainInput] = useState(tenant.branding?.customDomain?.domain || '');
  const [verifyingDomain, setVerifyingDomain] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Email Config
  const [emailConfig, setEmailConfig] = useState<EmailTemplateConfig>(() => {
    return tenant.branding?.emailTemplates || {
      senderName: `${appName || tenant.companyName} Workforce Notifications`,
      replyTo: `hr@${(customDomain.domain || 'workforceapp.com')}`,
      headerText: `${appName || tenant.companyName} Operations Hub`,
      footerText: `Confidential & Proprietary • Powered by ${appName || tenant.companyName}`,
      signature: `Best regards,\nOperations & HR Management Team`,
      bannerLogoUrl: logoUrl || ''
    };
  });

  const [saving, setSaving] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  // WCAG Contrast Audits
  const contrastAudit = useMemo(() => {
    return auditContrast(primaryColor, '#ffffff');
  }, [primaryColor]);

  const bgContrastAudit = useMemo(() => {
    return auditContrast(primaryColor, backgroundColor);
  }, [primaryColor, backgroundColor]);

  // Real-time Preview Branding Object
  const currentDraftBranding: BrandingConfig = useMemo(() => ({
    appName: appName.trim() || tenant.companyName || 'WorkForce Pro',
    logoUrl,
    faviconUrl,
    primaryColor,
    backgroundColor,
    linkColor,
    textColor,
    customDomain: {
      ...customDomain,
      domain: domainInput.trim()
    },
    emailTemplates: {
      ...emailConfig,
      senderName: emailConfig.senderName || `${appName} Notifications`,
      headerText: emailConfig.headerText || `${appName} Portal`,
    }
  }), [appName, logoUrl, faviconUrl, primaryColor, backgroundColor, linkColor, textColor, customDomain, domainInput, emailConfig, tenant.companyName]);

  // Feed current draft to ThemeContext for real-time live preview
  useEffect(() => {
    if (isOpen) {
      setPreviewBranding(currentDraftBranding);
    }
    return () => {
      setPreviewBranding(null);
    };
  }, [isOpen, currentDraftBranding, setPreviewBranding]);

  if (!isOpen) return null;

  // Handle Logo Upload as Data URL
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'LOGO' | 'FAVICON') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image file must be under 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (target === 'LOGO') {
        setLogoUrl(result);
        setEmailConfig(prev => ({ ...prev, bannerLogoUrl: result }));
      } else {
        setFaviconUrl(result);
      }
      toast.success(`${target === 'LOGO' ? 'Logo' : 'Favicon'} asset loaded`);
    };
    reader.readAsDataURL(file);
  };

  // Auto-optimize WCAG 2.1 AA
  const handleAutoAdjustContrast = () => {
    const optimized = autoAdjustForWCAG_AA(primaryColor, '#ffffff', 4.55);
    setPrimaryColor(optimized);
    setLinkColor(optimized);
    toast.success(`Color optimized to ${optimized} for WCAG 2.1 AA compliance (ratio ≥ 4.5:1)!`);
  };

  // Run Custom Domain DNS Verification Check
  const handleVerifyDns = async () => {
    if (!domainInput.trim()) {
      toast.warning("Please enter a custom domain name to verify (e.g., attendance.mybrand.com).");
      return;
    }

    setVerifyingDomain(true);
    try {
      const result = await dbService.verifyTenantCustomDomain(tenant.tenantId, domainInput.trim());
      setCustomDomain(result.domainConfig);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.warning(result.message);
      }
    } catch (e: any) {
      toast.error(e.message || "DNS verification check failed");
    } finally {
      setVerifyingDomain(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.info("Copied to clipboard");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Reset to default
  const handleResetToDefault = () => {
    setAppName(tenant.companyName || DEFAULT_PLATFORM_BRANDING.appName);
    setLogoUrl('');
    setFaviconUrl('');
    setPrimaryColor(DEFAULT_PLATFORM_BRANDING.primaryColor);
    setBackgroundColor(DEFAULT_PLATFORM_BRANDING.backgroundColor || '#f8fafc');
    setLinkColor(DEFAULT_PLATFORM_BRANDING.linkColor || '#2563eb');
    setTextColor(DEFAULT_PLATFORM_BRANDING.textColor || '#0f172a');
    setDomainInput('');
    setCustomDomain({
      domain: '',
      status: 'PENDING',
      verificationToken: `wf-token-${tenant.tenantId.slice(0, 8)}`,
      cnameTarget: 'cname.workforcepro.app'
    });
    toast.info("Branding reset to default platform values.");
  };

  // Save changes
  const handleSave = async () => {
    setSaving(true);
    try {
      await dbService.updateTenantBranding(tenant.tenantId, currentDraftBranding);
      setPreviewBranding(null);
      toast.success(`White-label configuration published for ${tenant.companyName}!`);
      onSaved();
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Failed to publish white-label config");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-950/70 backdrop-blur-md overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-6xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-md font-bold text-lg text-white"
              style={{ backgroundColor: primaryColor }}
            >
              {appName ? appName.charAt(0).toUpperCase() : 'W'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg md:text-xl font-bold tracking-tight">White-Label Customization</h2>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  {tenant.companyName}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Runtime theme engine • Zero code deployment • Cross-device PWA & Capacitor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetToDefault}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              title="Reset to WorkForce Pro defaults"
            >
              <RotateCcw size={14} />
              Reset Defaults
            </button>
            <button
              onClick={() => {
                setPreviewBranding(null);
                onClose();
              }}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-4 md:px-6 pt-3 pb-2 border-b border-slate-100 bg-slate-50/70 overflow-x-auto text-xs font-medium">
          <button
            onClick={() => setActiveTab('ASSETS')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
              activeTab === 'ASSETS'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Upload size={14} />
            <span>1. Identity & Assets</span>
          </button>
          <button
            onClick={() => setActiveTab('PALETTE')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
              activeTab === 'PALETTE'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Palette size={14} />
            <span>2. Color Palette & WCAG</span>
            {!contrastAudit.passesAA && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('DOMAIN')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
              activeTab === 'DOMAIN'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Globe size={14} />
            <span>3. Custom Domain & DNS</span>
            {customDomain.status === 'VERIFIED' ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            ) : customDomain.domain ? (
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            ) : null}
          </button>
          <button
            onClick={() => setActiveTab('EMAIL')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
              activeTab === 'EMAIL'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Mail size={14} />
            <span>4. Email Templates</span>
          </button>
          <button
            onClick={() => setActiveTab('PREVIEW')}
            className={`lg:hidden flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
              activeTab === 'PREVIEW'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Eye size={14} />
            <span>Live Preview</span>
          </button>
        </div>

        {/* Modal Body: Split Editor & Interactive Live Preview */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          
          {/* Left Column: Configuration Forms (7 cols on desktop) */}
          <div className={`overflow-y-auto p-4 md:p-6 lg:border-r border-slate-100 ${
            activeTab === 'PREVIEW' ? 'hidden lg:block lg:col-span-6' : 'lg:col-span-6 xl:col-span-7'
          }`}>

            {/* TAB 1: ASSETS */}
            {activeTab === 'ASSETS' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Application Name & Branding</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Controls window titles, PWA manifest branding, navigation header, and notification sender labels.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Client Application Name
                    </label>
                    <input
                      type="text"
                      value={appName}
                      onChange={(e) => setAppName(e.target.value)}
                      placeholder="e.g. Apex Industrial Workforce"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Rendered in top navigation, mobile status bar, and reports.
                    </p>
                  </div>

                  {/* Logo Upload & Preview */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                        <Upload size={14} className="text-blue-600" />
                        Brand Logo (Header & Login Screen)
                      </label>
                      {logoUrl && (
                        <button
                          onClick={() => setLogoUrl('')}
                          className="text-[11px] text-rose-600 hover:text-rose-700 font-medium"
                        >
                          Remove Logo
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl border border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                        {logoUrl ? (
                          <img src={logoUrl} alt="Brand Logo Preview" className="max-w-full max-h-full object-contain p-1" />
                        ) : (
                          <div className="text-[10px] text-slate-400 text-center font-mono">No Logo</div>
                        )}
                      </div>

                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            ref={logoInputRef}
                            accept="image/png,image/jpeg,image/svg+xml,image/webp"
                            onChange={(e) => handleImageUpload(e, 'LOGO')}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => logoInputRef.current?.click()}
                            className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors shadow-xs"
                          >
                            Choose File (PNG, SVG, JPG)
                          </button>
                        </div>
                        <input
                          type="text"
                          value={logoUrl}
                          onChange={(e) => setLogoUrl(e.target.value)}
                          placeholder="Or paste image URL (https://...)"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Favicon Upload */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                        <Globe size={14} className="text-indigo-600" />
                        Favicon & App Icon
                      </label>
                      {faviconUrl && (
                        <button
                          onClick={() => setFaviconUrl('')}
                          className="text-[11px] text-rose-600 hover:text-rose-700 font-medium"
                        >
                          Remove Favicon
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl border border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                        {faviconUrl ? (
                          <img src={faviconUrl} alt="Favicon Preview" className="w-8 h-8 object-contain" />
                        ) : (
                          <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold">W</div>
                        )}
                      </div>

                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            ref={faviconInputRef}
                            accept="image/png,image/x-icon,image/svg+xml"
                            onChange={(e) => handleImageUpload(e, 'FAVICON')}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => faviconInputRef.current?.click()}
                            className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors shadow-xs"
                          >
                            Upload Favicon (.ico / .png)
                          </button>
                        </div>
                        <input
                          type="text"
                          value={faviconUrl}
                          onChange={(e) => setFaviconUrl(e.target.value)}
                          placeholder="Or paste favicon URL"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: PALETTE & WCAG 2.1 AA */}
            {activeTab === 'PALETTE' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Color Palette & Contrast</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Dynamically updates CSS variables (`--color-brand`, `--tenant-primary`) across desktop and mobile PWA.
                    </p>
                  </div>

                  {/* Auto-Adjust Button */}
                  {!contrastAudit.passesAA && (
                    <button
                      onClick={handleAutoAdjustContrast}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs transition-all active:scale-95 animate-bounce"
                    >
                      <Sparkles size={13} />
                      Auto-Adjust for WCAG 2.1 AA
                    </button>
                  )}
                </div>

                {/* WCAG Compliance Badge */}
                <div className={`p-4 rounded-2xl border transition-all ${
                  contrastAudit.passesAA 
                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900' 
                    : 'bg-amber-50/90 border-amber-200 text-amber-900'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      {contrastAudit.passesAA ? (
                        <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs uppercase tracking-wider">
                            {contrastAudit.passesAA ? 'WCAG 2.1 AA Compliant' : 'Low-Contrast Warning (Fails AA)'}
                          </span>
                          <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-white/80 font-semibold shadow-2xs">
                            {contrastAudit.formattedRatio}
                          </span>
                        </div>
                        <p className="text-xs mt-1 leading-relaxed opacity-90">
                          {contrastAudit.message} Normal body text requires a contrast ratio of at least 4.5:1 against white/black backgrounds.
                        </p>
                      </div>
                    </div>

                    {!contrastAudit.passesAA && (
                      <button
                        onClick={handleAutoAdjustContrast}
                        className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors shadow-xs"
                      >
                        Fix Now
                      </button>
                    )}
                  </div>
                </div>

                {/* Color Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Primary Brand Color */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Primary Brand Color
                    </label>
                    <div className="flex items-center gap-2.5">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => {
                          setPrimaryColor(e.target.value);
                          setLinkColor(e.target.value);
                        }}
                        className="w-10 h-10 rounded-xl cursor-pointer border border-slate-200 p-0.5 bg-white shrink-0"
                      />
                      <input
                        type="text"
                        value={primaryColor}
                        onChange={(e) => {
                          setPrimaryColor(e.target.value);
                          setLinkColor(e.target.value);
                        }}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                      <span>Buttons, badges & active tabs</span>
                      <span className="font-mono text-[10px]">{contrastAudit.formattedRatio}</span>
                    </div>
                  </div>

                  {/* Background Color */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Application Background
                    </label>
                    <div className="flex items-center gap-2.5">
                      <input
                        type="color"
                        value={backgroundColor}
                        onChange={(e) => setBackgroundColor(e.target.value)}
                        className="w-10 h-10 rounded-xl cursor-pointer border border-slate-200 p-0.5 bg-white shrink-0"
                      />
                      <input
                        type="text"
                        value={backgroundColor}
                        onChange={(e) => setBackgroundColor(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                      <span>Workspace canvas background</span>
                      <button
                        onClick={() => setBackgroundColor('#f8fafc')}
                        className="text-[10px] text-blue-600 hover:underline"
                      >
                        Default #f8fafc
                      </button>
                    </div>
                  </div>

                  {/* Link Accent Color */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Link & Accent Color
                    </label>
                    <div className="flex items-center gap-2.5">
                      <input
                        type="color"
                        value={linkColor}
                        onChange={(e) => setLinkColor(e.target.value)}
                        className="w-10 h-10 rounded-xl cursor-pointer border border-slate-200 p-0.5 bg-white shrink-0"
                      />
                      <input
                        type="text"
                        value={linkColor}
                        onChange={(e) => setLinkColor(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 block pt-1">
                      Clickable links, breadcrumbs, focus rings
                    </span>
                  </div>

                  {/* Text Color */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Typography / Text Color
                    </label>
                    <div className="flex items-center gap-2.5">
                      <input
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="w-10 h-10 rounded-xl cursor-pointer border border-slate-200 p-0.5 bg-white shrink-0"
                      />
                      <input
                        type="text"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 block pt-1">
                      Body copy & primary headings
                    </span>
                  </div>
                </div>

                {/* Preset Themes Quick Picker */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-700 block">
                    Curated Industrial Brand Presets (Tested WCAG 2.1 AA)
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { name: 'Corporate Blue', primary: '#1e40af', bg: '#f8fafc', text: '#0f172a' },
                      { name: 'Precision Teal', primary: '#0f766e', bg: '#f8fafc', text: '#0f172a' },
                      { name: 'Steel Emerald', primary: '#047857', bg: '#f8fafc', text: '#0f172a' },
                      { name: 'Industrial Slate', primary: '#334155', bg: '#f8fafc', text: '#0f172a' },
                      { name: 'Royal Indigo', primary: '#4338ca', bg: '#f8fafc', text: '#0f172a' },
                      { name: 'Machinery Crimson', primary: '#b91c1c', bg: '#f8fafc', text: '#0f172a' },
                      { name: 'Amber Forge', primary: '#b45309', bg: '#f8fafc', text: '#0f172a' },
                      { name: 'Graphite Dark', primary: '#2563eb', bg: '#0f172a', text: '#f8fafc' },
                    ].map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => {
                          setPrimaryColor(preset.primary);
                          setLinkColor(preset.primary);
                          setBackgroundColor(preset.bg);
                          setTextColor(preset.text);
                        }}
                        className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-left transition-colors group"
                      >
                        <div
                          className="w-4 h-4 rounded-md shrink-0 shadow-2xs group-hover:scale-110 transition-transform"
                          style={{ backgroundColor: preset.primary }}
                        />
                        <span className="text-[11px] font-medium text-slate-700 truncate">{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: CUSTOM DOMAIN & DNS VERIFICATION */}
            {activeTab === 'DOMAIN' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Custom Domain & DNS Verification</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Allow clients to access their workspace via their own brand domain (e.g. <span className="font-mono text-blue-600">attendance.clientbrand.com</span>).
                  </p>
                </div>

                {/* Domain Input & Verification Trigger */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-700 block">
                    Assigned Custom Domain
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Globe size={16} />
                      </div>
                      <input
                        type="text"
                        value={domainInput}
                        onChange={(e) => setDomainInput(e.target.value)}
                        placeholder="attendance.clientbrand.com"
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleVerifyDns}
                      disabled={verifyingDomain}
                      className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 flex items-center gap-2 shrink-0 active:scale-95"
                    >
                      {verifyingDomain ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          Checking DNS...
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={14} />
                          Verify DNS
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Domain Verification Status Banner */}
                <div className={`p-4 rounded-2xl border transition-all ${
                  customDomain.status === 'VERIFIED'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : customDomain.status === 'FAILED'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      {customDomain.status === 'VERIFIED' ? (
                        <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                      ) : customDomain.status === 'FAILED' ? (
                        <X size={18} className="text-rose-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs uppercase tracking-wider">
                            Domain Status: {customDomain.status}
                          </span>
                          {customDomain.verifiedAt && (
                            <span className="text-[10px] text-emerald-700 font-mono">
                              Verified: {new Date(customDomain.verifiedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-1 leading-relaxed opacity-90">
                          {customDomain.status === 'VERIFIED'
                            ? `SSL certificates provisioned and DNS routed to cname.workforcepro.app. Traffic to ${customDomain.domain} is active.`
                            : customDomain.errorMessage || 'DNS records not verified yet. Please configure the CNAME and TXT records below in your DNS registrar (Cloudflare, GoDaddy, Route53, etc.). Do not activate the domain until DNS resolves.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* DNS Configuration Instructions */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-blue-600" />
                    Required DNS Records for Client Domain
                  </h4>
                  <p className="text-xs text-slate-500">
                    Add the following DNS records to your DNS provider. Verification typically propagates in 5–15 minutes.
                  </p>

                  <div className="space-y-2 text-xs">
                    {/* CNAME RECORD */}
                    <div className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 font-mono text-[10px] font-bold">CNAME</span>
                          <span className="font-mono text-slate-800 font-semibold">{domainInput.split('.')[0] || 'attendance'}</span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Points to: <span className="font-mono font-medium text-slate-700">cname.workforcepro.app</span>
                        </p>
                      </div>
                      <button
                        onClick={() => copyToClipboard('cname.workforcepro.app', 'cname')}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                        title="Copy CNAME target"
                      >
                        {copiedKey === 'cname' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      </button>
                    </div>

                    {/* TXT VERIFICATION RECORD */}
                    <div className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700 font-mono text-[10px] font-bold">TXT</span>
                          <span className="font-mono text-slate-800 font-semibold">_workforce-verify</span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate max-w-xs sm:max-w-md">
                          Token: <span className="font-mono font-medium text-slate-700">{customDomain.verificationToken}</span>
                        </p>
                      </div>
                      <button
                        onClick={() => copyToClipboard(customDomain.verificationToken, 'txt')}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                        title="Copy verification token"
                      >
                        {copiedKey === 'txt' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: EMAIL TEMPLATES */}
            {activeTab === 'EMAIL' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Per-Tenant Email Templates</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Customize sender identity, reply-to routing, headers, and footer disclaimers for automated digests & payslips.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Sender Name</label>
                      <input
                        type="text"
                        value={emailConfig.senderName}
                        onChange={(e) => setEmailConfig({ ...emailConfig, senderName: e.target.value })}
                        placeholder="e.g. Apex Industrial HR"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Reply-To Address</label>
                      <input
                        type="email"
                        value={emailConfig.replyTo}
                        onChange={(e) => setEmailConfig({ ...emailConfig, replyTo: e.target.value })}
                        placeholder="hr@apexmanufacturing.com"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Header Banner Headline</label>
                    <input
                      type="text"
                      value={emailConfig.headerText}
                      onChange={(e) => setEmailConfig({ ...emailConfig, headerText: e.target.value })}
                      placeholder="e.g. Apex Industrial Workforce Management Portal"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Footer & Legal Disclaimer</label>
                    <textarea
                      rows={2}
                      value={emailConfig.footerText}
                      onChange={(e) => setEmailConfig({ ...emailConfig, footerText: e.target.value })}
                      placeholder="Confidential • This email was generated for authorized personnel of Apex Industrial..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Email Signature</label>
                    <textarea
                      rows={2}
                      value={emailConfig.signature}
                      onChange={(e) => setEmailConfig({ ...emailConfig, signature: e.target.value })}
                      placeholder="Operations & Payroll Team\nApex Manufacturing Pvt Ltd"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Live Interactive Preview Panel (5-6 cols on desktop) */}
          <div className={`p-4 md:p-6 bg-slate-900 text-slate-100 flex flex-col justify-between overflow-y-auto ${
            activeTab === 'PREVIEW' ? 'block col-span-1' : 'hidden lg:flex lg:col-span-6 xl:col-span-5'
          }`}>
            <div className="space-y-4">
              {/* Preview Header & Controls */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Eye size={16} className="text-blue-400" />
                  <span className="text-xs font-bold tracking-wider uppercase text-white">Live Runtime Preview</span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Screen Toggle */}
                  <div className="flex rounded-lg bg-slate-800 p-0.5 text-[11px]">
                    <button
                      onClick={() => setPreviewScreen('DASHBOARD')}
                      className={`px-2 py-1 rounded-md transition-colors ${
                        previewScreen === 'DASHBOARD' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      App
                    </button>
                    <button
                      onClick={() => setPreviewScreen('KIOSK')}
                      className={`px-2 py-1 rounded-md transition-colors ${
                        previewScreen === 'KIOSK' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Kiosk
                    </button>
                    <button
                      onClick={() => setPreviewScreen('EMAIL')}
                      className={`px-2 py-1 rounded-md transition-colors ${
                        previewScreen === 'EMAIL' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Email
                    </button>
                  </div>

                  {/* Device Toggle */}
                  <div className="flex rounded-lg bg-slate-800 p-0.5">
                    <button
                      onClick={() => setPreviewDevice('MOBILE')}
                      className={`p-1 rounded-md transition-colors ${
                        previewDevice === 'MOBILE' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                      title="Mobile PWA / Capacitor View"
                    >
                      <Smartphone size={14} />
                    </button>
                    <button
                      onClick={() => setPreviewDevice('DESKTOP')}
                      className={`p-1 rounded-md transition-colors ${
                        previewDevice === 'DESKTOP' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                      title="Desktop View"
                    >
                      <Monitor size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Mockup Frame */}
              <div className="flex justify-center py-2">
                {previewDevice === 'MOBILE' ? (
                  /* Mobile Phone Mockup */
                  <div className="w-[300px] h-[540px] rounded-[36px] bg-slate-950 p-2.5 shadow-2xl border-4 border-slate-700 relative overflow-hidden flex flex-col">
                    {/* Notch & Speaker */}
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-900 rounded-full z-20 flex items-center justify-center">
                      <div className="w-8 h-1 bg-slate-700 rounded-full" />
                    </div>

                    {/* App Screen Canvas */}
                    <div 
                      className="w-full h-full rounded-[28px] overflow-hidden flex flex-col text-slate-800 relative"
                      style={{ backgroundColor: backgroundColor || '#f8fafc', color: textColor || '#0f172a' }}
                    >
                      {/* Mobile Status Bar */}
                      <div 
                        className="pt-6 px-4 pb-2 text-[10px] flex justify-between items-center text-white"
                        style={{ backgroundColor: primaryColor }}
                      >
                        <span className="font-mono font-bold">09:41</span>
                        <div className="flex items-center gap-1.5 text-[9px]">
                          <span>5G</span>
                          <span>100%</span>
                        </div>
                      </div>

                      {/* Header */}
                      <div 
                        className="px-4 py-3 text-white flex items-center justify-between shadow-sm"
                        style={{ backgroundColor: primaryColor }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {logoUrl ? (
                            <img src={logoUrl} alt="Logo" className="w-7 h-7 rounded-lg object-contain bg-white/10 p-0.5" />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-xs font-bold">
                              {appName.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h5 className="font-bold text-xs truncate leading-tight">{appName}</h5>
                            <span className="text-[9px] opacity-80 block truncate">Factory Admin</span>
                          </div>
                        </div>
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      </div>

                      {/* Screen Content Preview */}
                      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-[11px]">
                        {previewScreen === 'DASHBOARD' && (
                          <>
                            {/* Metric Cards */}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                                <span className="text-[9px] text-slate-500 uppercase font-semibold">Present</span>
                                <div className="text-base font-bold font-mono text-slate-900 mt-0.5">42 / 45</div>
                                <span className="text-[9px] text-emerald-600 font-medium">93% On Duty</span>
                              </div>
                              <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                                <span className="text-[9px] text-slate-500 uppercase font-semibold">Overtime</span>
                                <div className="text-base font-bold font-mono text-slate-900 mt-0.5">14.5 hrs</div>
                                <span className="text-[9px] font-medium" style={{ color: linkColor }}>Est. ₹2,175</span>
                              </div>
                            </div>

                            {/* Action Button */}
                            <button
                              className="w-full py-2 rounded-xl text-white font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 transition-transform active:scale-95"
                              style={{ backgroundColor: primaryColor }}
                            >
                              <span>Record Face Punch</span>
                              <ArrowRight size={12} />
                            </button>

                            {/* Worker List */}
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Live Punch Stream</span>
                              {[
                                { name: 'Ramesh Sharma', time: '09:02 AM', status: 'IN' },
                                { name: 'Priya Patel', time: '09:14 AM', status: 'IN' },
                                { name: 'Kiran Desai', time: '09:20 AM', status: 'IN' },
                              ].map((w, idx) => (
                                <div key={idx} className="p-2 rounded-lg bg-white border border-slate-100 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div 
                                      className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[9px] font-bold"
                                      style={{ backgroundColor: primaryColor }}
                                    >
                                      {w.name.charAt(0)}
                                    </div>
                                    <span className="font-medium text-slate-800 text-[10px]">{w.name}</span>
                                  </div>
                                  <span className="font-mono text-[9px] text-slate-500">{w.time}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        {previewScreen === 'KIOSK' && (
                          <div className="h-full flex flex-col justify-between py-2 text-center">
                            <div className="space-y-1">
                              <span className="text-[9px] uppercase font-bold text-slate-400">Terminal Kiosk</span>
                              <h4 className="font-bold text-sm text-slate-900">{appName} Face Scanner</h4>
                              <div className="text-xl font-mono font-bold text-slate-800">10:14:32 AM</div>
                            </div>

                            {/* Camera Mockup Frame */}
                            <div className="w-36 h-36 mx-auto rounded-2xl border-2 border-dashed border-blue-500 bg-slate-900 flex items-center justify-center text-white text-[10px] relative overflow-hidden shadow-inner">
                              <div className="absolute inset-2 border border-blue-400/50 rounded-xl animate-pulse" />
                              <span>Position Face Here</span>
                            </div>

                            <button
                              className="w-full py-2.5 rounded-xl text-white font-bold text-xs shadow-md"
                              style={{ backgroundColor: primaryColor }}
                            >
                              Clock IN / OUT
                            </button>
                          </div>
                        )}

                        {previewScreen === 'EMAIL' && (
                          <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-[10px] space-y-2">
                            <div className="border-b pb-1.5 text-slate-500">
                              <div><strong>From:</strong> {emailConfig.senderName}</div>
                              <div><strong>Reply-To:</strong> {emailConfig.replyTo}</div>
                            </div>
                            <div className="font-bold text-slate-900">{emailConfig.headerText}</div>
                            <p className="text-slate-600">Daily Factory Attendance Report ready for review. 42 workers punched on shift.</p>
                            <div className="text-[9px] text-slate-400 border-t pt-1 whitespace-pre-line">{emailConfig.footerText}</div>
                          </div>
                        )}
                      </div>

                      {/* Bottom Nav Bar */}
                      <div className="h-11 bg-white border-t border-slate-200 flex items-center justify-around px-2 text-[8px] font-semibold">
                        <span className="font-bold" style={{ color: primaryColor }}>Home</span>
                        <span className="text-slate-400">Workers</span>
                        <span className="text-slate-400">Payroll</span>
                        <span className="text-slate-400">Settings</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Desktop Web Mockup */
                  <div className="w-full max-w-md h-[400px] rounded-2xl bg-white border border-slate-700 shadow-2xl flex flex-col overflow-hidden text-slate-800">
                    {/* Browser Chrome */}
                    <div className="bg-slate-800 px-3 py-2 flex items-center gap-2 border-b border-slate-700 text-white text-[10px]">
                      <div className="flex gap-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      </div>
                      <div className="flex-1 bg-slate-900 px-2 py-0.5 rounded text-center text-slate-300 font-mono text-[9px] truncate">
                        https://{customDomain.domain || `${appName.toLowerCase().replace(/\s+/g, '')}.workforcepro.app`}
                      </div>
                    </div>

                    {/* Desktop App Layout */}
                    <div className="flex-1 flex" style={{ backgroundColor: backgroundColor || '#f8fafc' }}>
                      {/* Sidebar */}
                      <div className="w-32 bg-slate-900 text-white p-2.5 flex flex-col justify-between text-[10px]">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 font-bold truncate">
                            <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center text-[9px]">
                              {appName.charAt(0)}
                            </div>
                            <span className="truncate">{appName}</span>
                          </div>
                          <div className="space-y-1 text-slate-300 text-[9px]">
                            <div className="p-1 rounded bg-white/10 font-bold">Dashboard</div>
                            <div className="p-1">Workers</div>
                            <div className="p-1">Payroll</div>
                            <div className="p-1">Settings</div>
                          </div>
                        </div>
                      </div>

                      {/* Main View */}
                      <div className="flex-1 p-3 space-y-2 text-[10px]">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-xs text-slate-900">{tenant.companyName} Portal</h4>
                          <span 
                            className="px-2 py-0.5 rounded text-white text-[9px] font-bold"
                            style={{ backgroundColor: primaryColor }}
                          >
                            Live
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-2 bg-white rounded-lg border shadow-2xs">
                            <span className="text-slate-400 text-[8px] uppercase font-bold">Active Workers</span>
                            <div className="text-xs font-bold text-slate-900">45 Employees</div>
                          </div>
                          <div className="p-2 bg-white rounded-lg border shadow-2xs">
                            <span className="text-slate-400 text-[8px] uppercase font-bold">Total Wages</span>
                            <div className="text-xs font-bold text-slate-900">₹8,42,000</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400 text-[11px]">
                Branding updates apply immediately for all users.
              </span>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl text-white font-bold text-xs shadow-md transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 flex items-center gap-2"
                style={{ backgroundColor: primaryColor }}
              >
                {saving ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    Publish Changes
                  </>
                )}
              </button>
            </div>
          </div>

        </div>

        {/* Modal Footer for Mobile / Tablets */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between lg:hidden shrink-0">
          <button
            onClick={() => {
              setPreviewBranding(null);
              onClose();
            }}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
            style={{ backgroundColor: primaryColor }}
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Publish Changes
          </button>
        </div>

      </div>
    </div>
  );
};
