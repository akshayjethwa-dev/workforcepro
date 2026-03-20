// src/screens/BillingScreen.tsx
import React, { useState } from 'react';
import { Check, X, ShieldCheck, ExternalLink, MessageCircle, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const BillingScreen: React.FC = () => {
  const { profile, tenantPlan, trialDaysLeft } = useAuth();
  
  const [showPaymentModal, setShowPaymentModal] = useState<{show: boolean, planName: string, price: string}>({show: false, planName: '', price: ''});

  const adminPhone = "918460852903"; // Your WhatsApp business number
  
  // YOUR ACTUAL RAZORPAY PAYMENT LINK
  const RAZORPAY_PAYMENT_LINK = "https://razorpay.me/@aapacapitalprivatelimited"; 

  const orgDetails = `
---
*Organization Details:*
Name: ${profile?.companyName || 'Not Set'}
Org ID: ${profile?.tenantId || 'Unknown'}
Current Plan: ${tenantPlan}`;

  const enterpriseMsg = `Hi, I am interested in upgrading to the *Enterprise Plan* for WorkForcePro. Could we discuss custom pricing and features?${orgDetails}`;
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
    <div className={`relative bg-white rounded-2xl p-6 border-2 ${isCurrent ? 'border-green-500 shadow-green-100' : isPopular ? 'border-indigo-500 shadow-indigo-100' : 'border-gray-100'} shadow-lg flex flex-col`}>
      {isPopular && !isCurrent && <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-indigo-500 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">Most Popular</div>}
      {isCurrent && <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">{currentLabel || 'Current Plan'}</div>}
      
      <h3 className="text-xl font-bold text-gray-800">{title}</h3>
      
      <div className="mt-2 flex items-baseline text-gray-900">
        <span className="text-3xl font-black tracking-tight">₹{price}</span>
        {strikePrice && <span className="text-lg text-gray-400 line-through ml-2 font-semibold">₹{strikePrice}</span>}
        <span className="text-sm text-gray-500 ml-1 font-medium">{price === '0' ? '/forever' : '/month'}</span>
      </div>
      
      <p className="text-xs text-gray-500 mt-2">{desc}</p>
      
      <ul className="mt-6 space-y-3 flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-start">
            <Check size={16} className="text-green-500 mr-2 shrink-0 mt-0.5" />
            <span className="text-sm text-gray-600 leading-tight">{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        {isCurrent ? (
            <button disabled className="w-full bg-green-50 text-green-700 py-3 rounded-xl font-bold text-sm flex justify-center items-center">
                <ShieldCheck size={18} className="mr-2"/> {currentLabel || 'Active'}
            </button>
        ) : (
            <button 
                onClick={onUpgrade} 
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex justify-center items-center ${isPopular ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg' : 'bg-gray-900 text-white hover:bg-black'}`}
            >
                {buttonText || `Upgrade to ${title}`}
            </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-4 bg-gray-50 min-h-full pb-24">
      <div className="mb-6">
        <h2 className="text-2xl font-black text-slate-900">Subscription & Billing</h2>
        
        {tenantPlan === 'TRIAL' && trialDaysLeft !== null && (
            <div className="mt-2 bg-indigo-50 border border-indigo-200 p-3 rounded-xl flex items-center justify-between">
                <div>
                    <p className="text-indigo-800 font-bold text-sm">{trialDaysLeft} Days left in Free Trial</p>
                    <p className="text-indigo-600 text-xs mt-0.5">You currently have all 'Enterprise' features unlocked.</p>
                </div>
            </div>
        )}
        {tenantPlan === 'FREE' && trialDaysLeft === 0 && (
             <div className="mt-2 bg-red-50 border border-red-200 p-3 rounded-xl flex items-center justify-between">
                 <div>
                     <p className="text-red-800 font-bold text-sm">Trial Expired</p>
                     <p className="text-red-600 text-xs mt-0.5">Your account has been moved to the Free plan. Upgrade to restore premium features.</p>
                 </div>
             </div>
        )}
      </div>

      <div className="space-y-6">
        <PlanCard 
            title="Micro-Team (Free)" 
            price="0" 
            desc="Perfect for independent contractors testing the waters."
            features={["Up to 15 Workers", "1 Active Site", "Manual Attendance Entry", "Basic Daily Wages"]}
            isCurrent={tenantPlan === 'FREE'}
            currentLabel={tenantPlan === 'FREE' ? 'Active Plan' : undefined}
            buttonText="Start for Free"
            onUpgrade={() => alert('You are already on a higher plan. Contact support to downgrade.')}
        />
        <PlanCard 
            title="Site Manager" 
            price="1999" 
            strikePrice="2999"
            desc="Basic automation for single-site businesses."
            features={["Up to 50 Workers", "1 Active Site", "Face Recognition Kiosk Mode", "Manage Public Holidays" ,"Geofencing & Offline Sync", "Payslips & Allowances"]}
            isCurrent={tenantPlan === 'STARTER'}
            onUpgrade={() => handleUpgradeClick('Site Manager', '1999')}
        />
        <PlanCard 
            title="Agency (Pro Plan)" 
            price="3999"
            strikePrice="5299"
            desc="Multi-site control with strict HR rules and anti-spoofing."
            features={["Up to 200 Workers", "Unlimited Sites", "Liveness Anti-Spoofing (Blink Check)", "Digital ID Cards" ,"Paid Leaves (CL/SL/PL)", "Sandwich Rule Enforcement", "Break Tracking Deductions"]}
            isCurrent={tenantPlan === 'PRO'}
            isPopular={true}
            onUpgrade={() => handleUpgradeClick('Agency (Pro Plan)', '3999')}
        />
        <PlanCard 
            title="Enterprise" 
            price="7999" 
            strikePrice="9999"
            desc="For large factories requiring full statutory compliance."
            features={["Unlimited Workers & Sites", "Full PF & ESIC Compliance", "Wage Ceiling Caps & Reporting", "Custom Holiday Multipliers", "Priority WhatsApp Support"]}
            isCurrent={tenantPlan === 'ENTERPRISE' || tenantPlan === 'TRIAL'}
            currentLabel={tenantPlan === 'TRIAL' ? 'Active (Free Trial)' : 'Active Plan'}
            onUpgrade={() => handleUpgradeClick('Enterprise Plan', '7999')}
        />
      </div>

      {/* RAZORPAY LINK MODAL */}
      {showPaymentModal.show && (
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