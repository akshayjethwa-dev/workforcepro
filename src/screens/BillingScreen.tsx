import React, { useState, useEffect } from 'react';
import { 
  Check, X, ShieldCheck, ExternalLink, MessageCircle, Info, CreditCard, 
  Building2, ArrowRight, Sparkles, AlertCircle, RefreshCw, Layers, Calendar, 
  Tag, HelpCircle, CheckCircle2 
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';
import { planCatalogService } from '../services/planCatalogService';
import { Plan, PlanVersion, Subscription, CATALOG_FEATURE_FLAGS } from '../types/planCatalog';
import { employeeCapGuard, EmployeeCapStatus } from '../services/employeeCapGuard';
import { dbService } from '../services/db';
import { entitlementService } from '../services/entitlementService';

export const BillingScreen: React.FC = () => {
  const { profile, tenantPlan, trialDaysLeft, limits } = useAuth();
  const { toast } = useToast();
  const { branding } = useTheme();

  const [publicPlans, setPublicPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [billingInterval, setBillingInterval] = useState<'MONTHLY' | 'ANNUAL'>('ANNUAL');
  const [tenantSub, setTenantSub] = useState<Subscription | null>(null);
  const [capStatus, setCapStatus] = useState<EmployeeCapStatus | null>(null);
  
  const [showPaymentModal, setShowPaymentModal] = useState<{
    show: boolean;
    planName: string;
    planCode: string;
    version: number;
    price: string;
    interval: 'MONTHLY' | 'ANNUAL';
    gstRate: number;
  }>({
    show: false,
    planName: '',
    planCode: '',
    version: 1,
    price: '',
    interval: 'ANNUAL',
    gstRate: 18
  });

  const adminPhone = "918460852903"; 
  const RAZORPAY_PAYMENT_LINK = "https://razorpay.me/@aapacapitalprivatelimited"; 

  const isResellerManaged = !!profile?.resellerId;
  const tenantId = profile?.tenantId || 'demo-tenant-1';

  useEffect(() => {
    loadPricingData();
  }, [tenantId]);

  const loadPricingData = async () => {
    try {
      setLoading(true);
      const [plans, sub, cap] = await Promise.all([
        planCatalogService.getPublicPlans(),
        planCatalogService.getTenantSubscription(tenantId),
        employeeCapGuard.getTenantCapStatus(tenantId)
      ]);
      setPublicPlans(plans);
      setTenantSub(sub);
      setCapStatus(cap);
    } catch (err) {
      console.error('Error loading public pricing plans:', err);
      toast.error('Failed to load plan catalog');
    } finally {
      setLoading(false);
    }
  };

  const getFlagLabel = (code: string) => {
    const found = CATALOG_FEATURE_FLAGS.find(f => f.code === code);
    return found ? found.label : code.replace(/_/g, ' ').toUpperCase();
  };

  const currentDisplayPlan = tenantSub?.planCode 
    ? `${tenantSub.planCode} (v${tenantSub.planVersion})`
    : (tenantPlan || 'Standard');

  const orgDetails = `
---
*Organization Details:*
Name: ${profile?.companyName || 'Not Set'}
Org ID: ${tenantId}
Current Plan: ${currentDisplayPlan}`;

  const enterpriseMsg = `Hi, I am interested in upgrading to the *Enterprise Custom Scale* plan for WorkForcePro. Could we discuss custom pricing, employee cap, and SLA terms?${orgDetails}`;
  const whatsappEnterpriseUrl = `https://wa.me/${adminPhone}?text=${encodeURIComponent(enterpriseMsg)}`;

  const paymentMsg = `Hi, I just processed payment of ₹${showPaymentModal.price} for the *${showPaymentModal.planName} Plan* (${showPaymentModal.interval}) via Razorpay. Here is my transaction receipt.${orgDetails}`;
  const whatsappPaymentUrl = `https://wa.me/${adminPhone}?text=${encodeURIComponent(paymentMsg)}`;

  const handleUpgradeClick = (plan: Plan, version: PlanVersion) => {
    const isQuote = version.monthlyPrice === null;
    if (isQuote) {
      window.open(whatsappEnterpriseUrl, '_blank');
      return;
    }

    const price = billingInterval === 'ANNUAL'
      ? (version.annualPrice !== null ? version.annualPrice.toLocaleString('en-IN') : (version.monthlyPrice! * 10).toLocaleString('en-IN'))
      : version.monthlyPrice!.toLocaleString('en-IN');

    setShowPaymentModal({
      show: true,
      planName: plan.name,
      planCode: plan.code,
      version: version.version,
      price,
      interval: billingInterval,
      gstRate: version.gstRate || 18
    });
  };

  const handleImmediateActivation = async (planCode: string, planVersion: number) => {
    try {
      setLoading(true);
      await dbService.updateTenantPlan(tenantId, planCode as any);
      await entitlementService.handlePlanUpgrade(tenantId, planCode as any);
      await planCatalogService.subscribeTenant(
        tenantId,
        planCode,
        billingInterval,
        {
          uid: profile?.uid || 'user-admin',
          email: profile?.email || 'admin@tenant.com',
          role: profile?.role || 'FACTORY_OWNER'
        }
      );
      setShowPaymentModal({ show: false, planName: '', planCode: '', version: 1, price: '', interval: 'ANNUAL', gstRate: 18 });
      toast.success(`Plan upgraded to ${planCode}! All features unlocked immediately.`);
      await loadPricingData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update plan');
    } finally {
      setLoading(false);
    }
  };

  // Check if tenant has a grandfathered price
  const isTenantGrandfathered = tenantSub && publicPlans.some(p => {
    if (p.code !== tenantSub.planCode) return false;
    const curVer = planCatalogService.getCurrentVersion(p);
    return curVer.version > tenantSub.planVersion;
  });

  return (
    <div className="space-y-6 pb-16">
      {/* TOOLBAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Subscription &amp; Plans</h1>
          <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
            <span>Dynamic catalog pricing, workforce limits, and compliance modules</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-semibold text-slate-700">{currentDisplayPlan}</span>
          </div>
        </div>

        {/* BILLING INTERVAL SWITCH */}
        {!isResellerManaged && (
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
            <button
              onClick={() => setBillingInterval('MONTHLY')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                billingInterval === 'MONTHLY' 
                  ? 'bg-white text-slate-900 shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setBillingInterval('ANNUAL')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                billingInterval === 'ANNUAL' 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Annual Billing</span>
              <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded-md ${
                billingInterval === 'ANNUAL' ? 'bg-blue-800 text-blue-100' : 'bg-emerald-100 text-emerald-800'
              }`}>
                2 Months Free
              </span>
            </button>
          </div>
        )}
      </div>

      {/* GRANDFATHERED PRICING ALERT (EDGE CASE HANDLED) */}
      {isTenantGrandfathered && tenantSub && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="font-bold text-amber-950 text-sm flex items-center gap-2">
                Grandfathered Price Protection Active
                <span className="text-[10px] bg-amber-200 text-amber-900 font-extrabold px-2 py-0.5 rounded-md font-mono">
                  LOCKED v{tenantSub.planVersion}
                </span>
              </h3>
              <p className="text-amber-800 text-xs mt-1 leading-relaxed max-w-2xl">
                Your subscription is locked at your agreed legacy price of{' '}
                <strong className="text-amber-950">
                  {tenantSub.priceLockedAt.monthlyPrice === null ? 'Quote' : `₹${tenantSub.priceLockedAt.monthlyPrice}/month`}
                </strong>{' '}
                (with {tenantSub.priceLockedAt.gstRate}% GST rate lock). You will not be charged modern catalog rate increases unless you explicitly choose to migrate.
              </p>
            </div>
          </div>
          <button
            onClick={() => toast.info('Your locked grandfathered rate is guaranteed for the duration of your billing term.')}
            className="px-3.5 py-2 bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs rounded-xl shadow-xs whitespace-nowrap shrink-0"
          >
            Review Protection Terms
          </button>
        </div>
      )}

      {/* TRIAL & FREE STATUS NOTICES */}
      {tenantPlan === 'TRIAL' && trialDaysLeft !== null && (
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white p-4 sm:p-5 rounded-2xl shadow-xs border border-indigo-900/30 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" />
              <h3 className="font-bold text-sm text-white">{trialDaysLeft} {trialDaysLeft === 1 ? 'Day' : 'Days'} Remaining in Free Organization Trial</h3>
            </div>
            <p className="text-xs text-indigo-100 mt-1 leading-relaxed max-w-2xl">
              You currently enjoy all Premium Growth and Statutory Compliance features unlocked. Upgrade your plan before trial expiry to maintain uninterrupted biometric kiosk attendance.
            </p>
          </div>
          <button 
            onClick={() => {
              const growth = publicPlans.find(p => p.code === 'GROWTH');
              if (growth) handleUpgradeClick(growth, planCatalogService.getCurrentVersion(growth));
            }}
            className="bg-white hover:bg-indigo-50 text-slate-900 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 active:scale-95"
          >
            Upgrade Now
          </button>
        </div>
      )}

      {/* CURRENT QUOTA OVERVIEW */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-xs border border-slate-200/80">
        <div className="flex justify-between items-center mb-4">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Organization Plan</span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-0.5">
              {tenantSub ? `${tenantSub.planCode} Plan (v${tenantSub.planVersion})` : currentDisplayPlan}
            </h2>
          </div>
          <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0 border border-blue-100">
            <CreditCard size={20} />
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100 text-xs font-mono tabular-nums">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-slate-400 text-[10px] uppercase font-sans block font-semibold">Employee Cap</span>
            <span className="font-bold text-slate-900 text-sm mt-0.5 block">
              {limits?.maxWorkers === 9999 ? 'Unlimited' : `${limits?.maxWorkers || 15} Workers`}
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-slate-400 text-[10px] uppercase font-sans block font-semibold">Billing Frequency</span>
            <span className="font-bold text-slate-900 text-sm mt-0.5 block font-sans">
              {tenantSub?.billingInterval || 'Monthly'}
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-slate-400 text-[10px] uppercase font-sans block font-semibold">Face Scan Kiosk</span>
            <span className={`font-bold text-sm mt-0.5 block font-sans ${limits?.kioskEnabled ? 'text-emerald-700' : 'text-slate-400'}`}>
              {limits?.kioskEnabled ? 'Enabled' : 'Locked'}
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-slate-400 text-[10px] uppercase font-sans block font-semibold">Statutory Compliance</span>
            <span className={`font-bold text-sm mt-0.5 block font-sans ${limits?.statutoryComplianceEnabled ? 'text-emerald-700' : 'text-slate-400'}`}>
              {limits?.statutoryComplianceEnabled ? 'EPFO / ESIC' : 'Locked'}
            </span>
          </div>
        </div>
      </div>

      {/* ITEMIZED CURRENT BILLING PERIOD INVOICE STATEMENT (E16-S4) */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-xs border border-slate-200/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Itemized Billing Statement</span>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">
              Current Billing Cycle Statement (E16-S4)
            </h3>
            <p className="text-xs text-slate-500">
              Period: {new Date(capStatus?.billingPeriod.start || Date.now()).toLocaleDateString()} &ndash; {new Date(capStatus?.billingPeriod.end || Date.now()).toLocaleDateString()}
            </p>
          </div>
          <span className="text-xs font-mono font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg self-start sm:self-auto">
            {capStatus?.activeCount || 0} Distinct Active Workers
          </span>
        </div>

        {(() => {
          const invoice = planCatalogService.calculateInvoice(
            tenantSub?.priceLockedAt || {
              monthlyPrice: 0,
              annualPrice: 0,
              gstRate: 18,
              overageRate: 0,
              employeeCap: 10
            },
            tenantSub?.billingInterval || 'MONTHLY',
            capStatus?.activeCount || 0
          );

          return (
            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left divide-y divide-slate-200">
                <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">Line Item</th>
                    <th className="py-2.5 px-4 text-center">Quantity / Rate</th>
                    <th className="py-2.5 px-4 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  <tr>
                    <td className="py-3 px-4 font-sans">
                      <span className="font-bold text-slate-900 block">
                        Base Subscription: {tenantSub ? tenantSub.planCode : tenantPlan}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Cap: {capStatus?.cap === null ? 'Unlimited' : `${capStatus?.cap} workers`} • {tenantSub?.billingInterval || 'Monthly'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-sans text-slate-600">
                      1 cycle
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      ₹{invoice.baseAmount.toLocaleString('en-IN')}
                    </td>
                  </tr>

                  {/* ITEMIZE OVERAGE EXPLICITLY (NEVER ROLLED INTO BASE) */}
                  <tr className={invoice.overageCount > 0 ? 'bg-amber-50/60' : ''}>
                    <td className="py-3 px-4 font-sans">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900">Overage Surcharge</span>
                        {invoice.overageCount > 0 && (
                          <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-amber-200 text-amber-900">
                            Soft Cap Active
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500">
                        Billed separately for distinct workers above plan cap
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-sans text-slate-600">
                      {invoice.overageCount > 0 ? (
                        <span>{invoice.overageCount} employee(s) × ₹{capStatus?.overageRate}</span>
                      ) : (
                        <span className="text-slate-400">0 workers over cap</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      ₹{invoice.overageAmount.toLocaleString('en-IN')}
                    </td>
                  </tr>

                  <tr className="bg-slate-50/50">
                    <td colSpan={2} className="py-2.5 px-4 font-sans text-right font-semibold text-slate-600">
                      Subtotal
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                      ₹{invoice.subtotal.toLocaleString('en-IN')}
                    </td>
                  </tr>

                  <tr>
                    <td colSpan={2} className="py-2.5 px-4 font-sans text-right font-semibold text-slate-600">
                      Applicable GST ({invoice.gstRate}% Statutory)
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                      ₹{invoice.gstAmount.toLocaleString('en-IN')}
                    </td>
                  </tr>

                  <tr className="bg-slate-900 text-white font-sans">
                    <td colSpan={2} className="py-3 px-4 text-right font-bold text-sm">
                      Total Invoice Amount
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-base text-emerald-400">
                      ₹{invoice.totalAmount.toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      {/* DYNAMIC PUBLIC PRICING MATRIX (NO HARDCODED COPY) */}
      {isResellerManaged ? (
        <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-6 text-center">
          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-xs border border-indigo-100">
            <Building2 className="text-indigo-600" size={26} />
          </div>
          <h3 className="text-base font-bold text-indigo-950">Enterprise Managed Account</h3>
          <p className="text-xs text-indigo-700 mt-1 max-w-sm mx-auto leading-relaxed">
            Your organization subscription, limits, and billing are managed directly by your channel partner.
          </p>
          <div className="mt-4 bg-white p-4 rounded-xl inline-block text-left shadow-xs border border-indigo-100">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">To request additional quota or features:</p>
            <p className="text-xs font-medium text-slate-800">
              Please contact your <strong>{branding?.appName || 'Authorized Partner'}</strong> administrator.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Live Catalog Pricing Plans</h3>
              <p className="text-xs text-slate-500">
                Rendered live from active plan catalog records (<code>isPublic = true &amp;&amp; isActive = true</code>).
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Prices exclude {publicPlans[0]?.versions[0]?.gstRate || 18}% GST
            </span>
          </div>

          {loading ? (
            <div className="py-16 text-center bg-white rounded-2xl border border-slate-200">
              <RefreshCw size={24} className="animate-spin mx-auto text-blue-600 mb-2" />
              <p className="text-xs text-slate-500">Loading catalog plans...</p>
            </div>
          ) : publicPlans.length === 0 ? (
            <div className="py-12 text-center bg-white rounded-2xl border border-slate-200">
              <AlertCircle size={28} className="mx-auto text-amber-500 mb-2" />
              <p className="text-sm font-bold text-slate-800">No public plans active</p>
              <p className="text-xs text-slate-500 mt-1">Super Admin must publish at least one plan with isPublic=true and isActive=true.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
              {publicPlans.map((plan) => {
                const currentVersion = planCatalogService.getCurrentVersion(plan);
                const isCurrent = tenantSub 
                  ? tenantSub.planCode.toUpperCase() === plan.code.toUpperCase()
                  : tenantPlan?.toUpperCase() === plan.code.toUpperCase();

                const isQuote = currentVersion.monthlyPrice === null;
                const isFree = currentVersion.monthlyPrice === 0;

                const displayPrice = isQuote 
                  ? 'Custom' 
                  : billingInterval === 'ANNUAL'
                    ? (currentVersion.annualPrice !== null 
                        ? currentVersion.annualPrice.toLocaleString('en-IN') 
                        : (currentVersion.monthlyPrice! * 10).toLocaleString('en-IN'))
                    : currentVersion.monthlyPrice!.toLocaleString('en-IN');

                const monthlyEquivalent = isQuote || isFree
                  ? null
                  : billingInterval === 'ANNUAL'
                    ? Math.round((currentVersion.annualPrice ?? (currentVersion.monthlyPrice! * 10)) / 12).toLocaleString('en-IN')
                    : null;

                const isPopular = plan.badge === 'Most Popular' || plan.code === 'GROWTH';

                return (
                  <div
                    key={plan.id}
                    className={`relative bg-white rounded-2xl p-5 sm:p-6 border flex flex-col justify-between transition-all ${
                      isCurrent
                        ? 'border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                        : isPopular
                          ? 'border-blue-600 shadow-sm ring-1 ring-blue-600'
                          : 'border-slate-200 hover:border-slate-300 shadow-xs'
                    }`}
                  >
                    <div>
                      {/* HEADER & BADGE */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-base font-bold text-slate-900">{plan.name}</h4>
                            <span className="text-[10px] font-mono text-slate-400 font-semibold">
                              v{currentVersion.version}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block mt-0.5">
                            {plan.code}
                          </span>
                        </div>
                        {isCurrent ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md shrink-0">
                            Current
                          </span>
                        ) : plan.badge ? (
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md shrink-0 ${
                            isPopular ? 'text-blue-700 bg-blue-50' : 'text-slate-700 bg-slate-100'
                          }`}>
                            {plan.badge}
                          </span>
                        ) : null}
                      </div>

                      {/* PRICE DISPLAY */}
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        {isQuote ? (
                          <div className="flex items-baseline text-slate-900">
                            <span className="text-2xl font-black tracking-tight">Custom Quote</span>
                          </div>
                        ) : (
                          <div className="flex items-baseline text-slate-900 font-mono tabular-nums">
                            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight">₹{displayPrice}</span>
                            <span className="text-xs text-slate-500 ml-1 font-sans font-medium">
                              {isFree ? '/forever' : billingInterval === 'ANNUAL' ? '/year' : '/month'}
                            </span>
                          </div>
                        )}

                        {monthlyEquivalent && (
                          <p className="text-[11px] text-emerald-600 font-semibold font-mono mt-0.5">
                            Effective ₹{monthlyEquivalent}/mo (2 mos free)
                          </p>
                        )}

                        <p className="text-xs text-slate-500 mt-2 leading-relaxed min-h-[36px]">
                          {plan.description}
                        </p>
                      </div>

                      {/* KEY METRICS (CAP & OVERAGE) */}
                      <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-[11px]">Employee Cap</span>
                          <span className="font-bold text-slate-800 font-mono">
                            {currentVersion.employeeCap === null ? 'Unlimited Staff' : `${currentVersion.employeeCap} Workers`}
                          </span>
                        </div>
                        {currentVersion.overageRate !== null && currentVersion.overageRate > 0 && (
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-slate-500">Overage Rate</span>
                            <span className="font-semibold text-slate-700 font-mono">
                              ₹{currentVersion.overageRate}/worker/mo
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-500">GST Rate</span>
                          <span className="font-semibold text-slate-700 font-mono">
                            {currentVersion.gstRate}% standard
                          </span>
                        </div>
                      </div>

                      {/* FEATURE LIST */}
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                          Included Modules ({currentVersion.featureFlags.length})
                        </p>
                        <ul className="space-y-2">
                          {currentVersion.featureFlags.map((flag) => (
                            <li key={flag} className="flex items-start text-xs text-slate-700">
                              <Check size={14} className="text-emerald-600 mr-2 shrink-0 mt-0.5" />
                              <span className="leading-snug">{getFlagLabel(flag)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* UPGRADE BUTTON */}
                    <div className="mt-6 pt-4 border-t border-slate-100">
                      {isCurrent ? (
                        <div className="space-y-1">
                          <button
                            disabled
                            className="w-full bg-emerald-50 text-emerald-800 py-2.5 rounded-xl font-bold text-xs flex justify-center items-center gap-1.5 cursor-default border border-emerald-200"
                          >
                            <ShieldCheck size={16} />
                            <span>Active Subscription</span>
                          </button>
                          {tenantSub && tenantSub.planVersion < currentVersion.version && (
                            <p className="text-[10px] text-amber-700 text-center font-medium">
                              Grandfathered on v{tenantSub.planVersion}
                            </p>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            if (isFree) {
                              handleImmediateActivation('FREE', currentVersion.version);
                            } else {
                              handleUpgradeClick(plan, currentVersion);
                            }
                          }}
                          className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all flex justify-center items-center gap-1.5 active:scale-98 shadow-xs ${
                            isPopular
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : 'bg-slate-900 text-white hover:bg-slate-800'
                          }`}
                        >
                          <span>{isQuote ? 'Contact for Quote' : isFree ? 'Select Free Starter' : `Upgrade to ${plan.name}`}</span>
                          <ArrowRight size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* RAZORPAY PAYMENT LINK MODAL */}
      {showPaymentModal.show && !isResellerManaged && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setShowPaymentModal({ show: false, planName: '', planCode: '', version: 1, price: '', interval: 'ANNUAL', gstRate: 18 })} 
              className="absolute top-4 right-4 bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200 transition-colors"
            >
              <X size={18} />
            </button>
            
            <div className="text-center mb-5 mt-2">
              <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <ShieldCheck className="text-blue-600" size={24}/>
              </div>
              <h3 className="text-xl font-bold text-gray-900">Upgrade to {showPaymentModal.planName}</h3>
              <p className="text-xs text-gray-500 mt-1">
                Plan Code: <strong className="font-mono text-gray-800">{showPaymentModal.planCode}</strong> (v{showPaymentModal.version})
              </p>
              <div className="mt-3 p-2 bg-slate-50 rounded-xl border border-slate-100 inline-block font-mono">
                <span className="text-xs text-slate-500">Base Price: </span>
                <span className="text-base font-extrabold text-slate-900">₹{showPaymentModal.price}</span>
                <span className="text-xs text-slate-500"> + {showPaymentModal.gstRate}% GST</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex items-start">
                <Info className="text-indigo-600 mt-0.5 mr-2 shrink-0" size={18} />
                <p className="text-xs text-indigo-900 leading-relaxed">
                  <strong>Secure Processing:</strong> WorkForcePro is developed and operated by <strong>Aapa Capital Private Limited</strong>. Your payment receipt with GST compliance will be issued under this registered corporate name.
                </p>
              </div>

              {/* Step 1: Open Razorpay Link */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1.5">Step 1</p>
                <p className="text-xs text-gray-700 mb-2">Pay securely online via UPI, Credit/Debit card, or NetBanking.</p>
                <a 
                  href={RAZORPAY_PAYMENT_LINK}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full bg-[#3395FF] hover:bg-[#2083ef] text-white py-2 rounded-lg font-bold text-xs flex items-center justify-center transition-colors shadow-xs"
                >
                  Pay ₹{showPaymentModal.price} via Razorpay <ExternalLink size={13} className="ml-1.5" />
                </a>
              </div>

              {/* Step 2: Confirm on WhatsApp */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <p className="text-xs text-green-700 font-bold uppercase tracking-wider mb-1.5">Step 2</p>
                <p className="text-xs text-green-800 mb-2">Submit your payment receipt for official invoicing records.</p>
                <a 
                  href={whatsappPaymentUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="w-full bg-[#25D366] hover:bg-[#1ebd5a] text-white py-2 rounded-lg font-bold text-xs flex items-center justify-center transition-colors shadow-xs"
                >
                  <MessageCircle size={15} className="mr-1.5" /> Submit Receipt on WhatsApp
                </a>
              </div>

              {/* Step 3: Instant Mid-Period Activation */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-xs text-blue-700 font-bold uppercase tracking-wider mb-1.5">Instant Activation</p>
                <p className="text-xs text-blue-800 mb-2.5">Confirm payment to immediately unlock all {showPaymentModal.planName} features without waiting for billing period end.</p>
                <button
                  onClick={() => handleImmediateActivation(showPaymentModal.planCode, showPaymentModal.version)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-bold text-xs flex items-center justify-center transition-colors shadow-md shadow-blue-500/20"
                >
                  <Sparkles size={14} className="mr-1.5 text-amber-300" />
                  <span>Confirm &amp; Unlock Features Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};