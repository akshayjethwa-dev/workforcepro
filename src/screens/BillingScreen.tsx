import React, { useState, useEffect } from 'react';
import { Check, X, ShieldCheck, ExternalLink, MessageCircle, Info, CreditCard, Building2, Zap, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';
import { dbService } from '../services/db';
import { SubscriptionTier, PlanLimits } from '../types/index';

const FREE_TRIAL_DAYS = 7;

export const BillingScreen: React.FC = () => {
  const { profile, tenantPlan, trialDaysLeft, limits } = useAuth();
  const { toast } = useToast();
  const { branding } = useTheme();
  
  const [globalPlans, setGlobalPlans] = useState<Record<SubscriptionTier, PlanLimits> | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState<{show: boolean, planName: string, price: string}>({show: false, planName: '', price: ''});

  const adminPhone = "918460852903"; 
  const RAZORPAY_PAYMENT_LINK = "https://razorpay.me/@aapacapitalprivatelimited"; 

  useEffect(() => {
    const fetchPlans = async () => {
      const plans = await dbService.getGlobalPlanConfig();
      setGlobalPlans(plans);
    };
    fetchPlans();
  }, []);

  const isResellerManaged = !!profile?.resellerId;

  const getDisplayPlanName = (plan: string | undefined) => {
    if (!plan) return 'Unknown';
    if (plan === 'ENTERPRISE') return 'Premium Growth Plan';
    if (plan === 'FREE') return 'Micro-Team (Free)';
    if (plan === 'TRIAL') return 'Free Trial (Premium Growth)';
    if (plan === 'PRO') return 'Agency (Pro Plan)';
    if (plan === 'STARTER') return 'Site Manager';
    return plan;
  };

  const currentDisplayPlan = getDisplayPlanName(tenantPlan);
  const orgDetails = `
---
*Organization Details:*
Name: ${profile?.companyName || 'Not Set'}
Org ID: ${profile?.tenantId || 'Unknown'}
Current Plan: ${currentDisplayPlan}`;

  const enterpriseMsg = `Hi, I am interested in upgrading to the *Premium Growth Plan* for WorkForcePro. Could we discuss custom pricing and features?${orgDetails}`;
  const whatsappEnterpriseUrl = `https://wa.me/${adminPhone}?text=${encodeURIComponent(enterpriseMsg)}`;

  const paymentMsg = `Hi, I just paid ₹${showPaymentModal.price} for the *${showPaymentModal.planName} Plan* via Razorpay. Here is my receipt/screenshot.${orgDetails}`;
  const whatsappPaymentUrl = `https://wa.me/${adminPhone}?text=${encodeURIComponent(paymentMsg)}`;

  const handleUpgradeClick = (planName: string, price: string) => {
    setShowPaymentModal({ show: true, planName, price });
  };

  const PlanCard = ({ 
    title, price, desc, features, isCurrent, currentLabel, isPopular, buttonText, onUpgrade, strikePrice 
  }: { 
    title: string, price: string, desc: string, features: string[], isCurrent: boolean, currentLabel?: string, isPopular?: boolean, buttonText?: string, onUpgrade?: () => void, strikePrice?: string 
  }) => (
    <div className={`relative bg-white rounded-2xl p-6 sm:p-7 border ${
      isCurrent 
        ? 'border-emerald-500 shadow-xs ring-1 ring-emerald-500' 
        : isPopular 
          ? 'border-blue-600 shadow-sm ring-1 ring-blue-600' 
          : 'border-slate-200/80 shadow-xs'
    } flex flex-col justify-between`}>
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          {isPopular && !isCurrent && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
              Most Popular
            </span>
          )}
          {isCurrent && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
              {currentLabel || 'Current Plan'}
            </span>
          )}
        </div>
        
        <div className="mt-3 flex items-baseline text-slate-900 font-mono tabular-nums">
          <span className="text-3xl font-extrabold tracking-tight">₹{price}</span>
          {strikePrice && <span className="text-base text-slate-400 line-through ml-2">₹{strikePrice}</span>}
          <span className="text-xs text-slate-500 ml-1 font-sans font-medium">{price === '0' ? '/forever' : '/month'}</span>
        </div>
        
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">{desc}</p>
        
        <ul className="mt-6 space-y-2.5">
          {features.map((f, i) => (
            <li key={i} className="flex items-start text-xs text-slate-600">
              <Check size={15} className="text-emerald-600 mr-2 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 pt-4 border-t border-slate-100">
        {isCurrent ? (
          <button disabled className="w-full bg-emerald-50 text-emerald-700 py-2.5 rounded-xl font-semibold text-xs flex justify-center items-center gap-1.5 cursor-default">
            <ShieldCheck size={16} /> 
            <span>{currentLabel || 'Active Plan'}</span>
          </button>
        ) : (
          <button 
            onClick={onUpgrade} 
            className={`w-full py-2.5 rounded-xl font-semibold text-xs transition-all flex justify-center items-center gap-1.5 active:scale-98 shadow-xs ${
              isPopular 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            <span>{buttonText || `Upgrade to ${title}`}</span>
            <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 pb-12">
      {/* TOOLBAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Subscription & Billing</h1>
          <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
            <span>Manage organization plans, quotas, and premium add-ons</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-semibold text-slate-700">{currentDisplayPlan}</span>
          </div>
        </div>
      </div>

      {/* PLAN STATUS NOTICES */}
      {tenantPlan === 'TRIAL' && trialDaysLeft !== null && (
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white p-4 sm:p-5 rounded-2xl shadow-xs border border-indigo-900/30 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" />
              <h3 className="font-bold text-sm text-white">{trialDaysLeft} {trialDaysLeft === 1 ? 'Day' : 'Days'} Remaining in Free Organization Trial</h3>
            </div>
            <p className="text-xs text-indigo-100 mt-1 leading-relaxed max-w-2xl">
              You currently enjoy all Premium Growth features unlocked. Upgrade your plan before trial expiry to maintain uninterrupted biometric kiosk attendance & statutory compliance.
            </p>
          </div>
          <button 
            onClick={() => handleUpgradeClick('Premium Growth Plan', '1999')}
            className="bg-white hover:bg-indigo-50 text-slate-900 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 active:scale-95"
          >
            Upgrade Now
          </button>
        </div>
      )}

      {tenantPlan === 'FREE' && (
        <div className="bg-amber-50/80 border border-amber-200 p-4 sm:p-5 rounded-2xl flex items-center justify-between gap-4 text-xs">
          <div>
            <h3 className="font-bold text-amber-900 text-sm">Micro-Team Free Plan Active</h3>
            <p className="text-amber-800 text-xs mt-0.5">
              Your trial has ended. Upgrade to the Premium Growth Plan to unlock biometric face kiosks, unlimited staff, and EPFO/ESIC compliance.
            </p>
          </div>
          <button 
            onClick={() => handleUpgradeClick('Premium Growth Plan', '1999')}
            className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 active:scale-95"
          >
            Upgrade Plan
          </button>
        </div>
      )}

      {/* CURRENT QUOTA OVERVIEW */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-xs border border-slate-200/80">
        <div className="flex justify-between items-center mb-4">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Plan</span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-0.5">{currentDisplayPlan}</h2>
          </div>
          <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0 border border-blue-100">
            <CreditCard size={20} />
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100 text-xs font-mono tabular-nums">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-slate-400 text-[10px] uppercase font-sans block font-semibold">Staff Limit</span>
            <span className="font-bold text-slate-900 text-sm mt-0.5 block">
              {limits?.maxWorkers === 9999 ? 'Unlimited' : `${limits?.maxWorkers || 15} Workers`}
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-slate-400 text-[10px] uppercase font-sans block font-semibold">Supervisor Seats</span>
            <span className="font-bold text-slate-900 text-sm mt-0.5 block">
              {limits?.maxManagers === 9999 ? 'Unlimited' : `${limits?.maxManagers || 1} Managers`}
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-slate-400 text-[10px] uppercase font-sans block font-semibold">Face Scan Kiosk</span>
            <span className={`font-bold text-sm mt-0.5 block ${limits?.kioskEnabled ? 'text-emerald-700' : 'text-slate-400'}`}>
              {limits?.kioskEnabled ? 'Enabled' : 'Locked'}
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-slate-400 text-[10px] uppercase font-sans block font-semibold">Statutory Returns</span>
            <span className={`font-bold text-sm mt-0.5 block ${limits?.statutoryComplianceEnabled ? 'text-emerald-700' : 'text-slate-400'}`}>
              {limits?.statutoryComplianceEnabled ? 'EPFO / ESIC' : 'Locked'}
            </span>
          </div>
        </div>
      </div>

      {/* PLAN MATRIX */}
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
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Available Subscription Plans</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <PlanCard 
              title="Micro-Team (Free)" 
              price="0" 
              desc="Best for small contracting teams and single-site pilot tests."
              features={[
                "Up to 15 Workers",
                "1 Factory / Site Location",
                "Manual Shift Attendance & Logs",
                "Basic Daily Wage Calculation Sheet",
                "Self-service CSV export"
              ]}
              isCurrent={tenantPlan === 'FREE'}
              currentLabel={tenantPlan === 'FREE' ? 'Active Plan' : undefined}
              buttonText="Active on Free"
              onUpgrade={() => toast.info('You are already on a higher tier plan. Contact support for assistance.')}
            />
            <PlanCard 
              title="Premium Growth Plan" 
              price="1999"
              strikePrice="3499"
              desc="For growing factories requiring biometric kiosk gates and official compliance."
              features={[
                "Unlimited Staff Personnel & Factory Sites",
                "Face Recognition & QR Attendance Kiosk Terminals",
                "EPFO (ECR) & ESIC Government Electronic Return Formats",
                "Wage Breakdown with Custom Overtime Multipliers",
                "Worker Advances (Kharchi) & Automatic Monthly Payslips",
                "Priority WhatsApp Concierge Support"
              ]}
              isCurrent={tenantPlan === 'ENTERPRISE' || tenantPlan === 'TRIAL'}
              currentLabel={tenantPlan === 'TRIAL' ? 'Active (Free Trial)' : 'Active Plan'}
              isPopular={true}
              onUpgrade={() => handleUpgradeClick('Premium Growth Plan', '1999')}
            />
          </div>
        </div>
      )}

      {/* RAZORPAY LINK MODAL */}
      {showPaymentModal.show && !isResellerManaged && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
                <button onClick={() => setShowPaymentModal({show:false, planName:'', price:''})} className="absolute top-4 right-4 bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200 transition-colors">
                    <X size={18} />
                </button>
                
                <div className="text-center mb-6 mt-2">
                    <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <ShieldCheck className="text-blue-600" size={24}/>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">Upgrade to {showPaymentModal.planName}</h3>
                    <p className="text-gray-500 text-sm mt-1">Amount to pay: <strong className="text-gray-900 font-black">₹{showPaymentModal.price}</strong></p>
                </div>

                <div className="space-y-4">
                    {/* INFO BANNER REGARDING AAPA CAPITAL */}
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex items-start">
                        <Info className="text-indigo-600 mt-0.5 mr-2 shrink-0" size={18} />
                        <p className="text-xs text-indigo-900 leading-relaxed">
                            <strong>Note:</strong> WorkForcePro is proudly developed and run by <strong>Aapa Capital Private Limited</strong>. Your payment will be securely processed under this company name on the Razorpay checkout page.
                        </p>
                    </div>

                    {/* Step 1: Open Razorpay Link */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Step 1</p>
                        <p className="text-sm text-gray-700 mb-3">Click below to pay securely via Razorpay. An invoice will be sent to your email.</p>
                        <a 
                            href={RAZORPAY_PAYMENT_LINK}
                            target="_blank"
                            rel="noreferrer"
                            className="w-full bg-[#3395FF] hover:bg-[#2083ef] text-white py-3 rounded-lg font-bold flex items-center justify-center transition-colors shadow-md"
                        >
                            Pay ₹{showPaymentModal.price} Securely <ExternalLink size={16} className="ml-2" />
                        </a>
                    </div>

                    {/* Step 2: Confirm on WhatsApp */}
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                        <p className="text-xs text-green-700 font-bold uppercase tracking-wider mb-2">Step 2</p>
                        <p className="text-sm text-green-800 mb-3">After successful payment, send us your receipt screenshot to activate your plan.</p>
                        <a 
                            href={whatsappPaymentUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            className="w-full bg-[#25D366] hover:bg-[#1ebd5a] text-white py-3 rounded-lg font-bold flex items-center justify-center transition-colors shadow-md shadow-green-500/20"
                        >
                            <MessageCircle size={18} className="mr-2" /> Send Receipt
                        </a>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};