// src/screens/BillingScreen.tsx
import React, { useState } from 'react';
import { Check, X, QrCode, MessageCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const BillingScreen: React.FC = () => {
  // Pull profile to get companyName and tenantId for the WhatsApp message
  const { profile, tenantPlan, trialDaysLeft } = useAuth();
  const [showQR, setShowQR] = useState<{show: boolean, planName: string, price: string}>({show: false, planName: '', price: ''});

  const adminPhone = "918460852903"; // Replace with your actual WhatsApp business number

  // Shared organization details to append to WhatsApp messages
  const orgDetails = `
---
*Organization Details:*
Name: ${profile?.companyName || 'Not Set'}
Org ID: ${profile?.tenantId || 'Unknown'}
Current Plan: ${tenantPlan}`;

  // WhatsApp Message for Enterprise Contact Us
  const enterpriseMsg = `Hi, I am interested in upgrading to the *Enterprise Plan* for WorkForcePro. Could we discuss custom pricing and features?${orgDetails}`;
  const whatsappEnterpriseUrl = `https://wa.me/${adminPhone}?text=${encodeURIComponent(enterpriseMsg)}`;

  // WhatsApp Message for Starter/Pro QR Payment
  const paymentMsg = `Hi, I just paid ₹${showQR.price} for the *${showQR.planName} Plan* on WorkForcePro. Here is my screenshot.${orgDetails}`;
  const whatsappPaymentUrl = `https://wa.me/${adminPhone}?text=${encodeURIComponent(paymentMsg)}`;

  const handleUpgradeClick = (planName: string, price: string) => {
    setShowQR({ show: true, planName, price });
  };

  const PlanCard = ({ 
    title, price, desc, features, isCurrent, currentLabel, isPopular, buttonText, onUpgrade 
  }: { 
    title: string, price: string, desc: string, features: string[], isCurrent: boolean, currentLabel?: string, isPopular?: boolean, buttonText?: string, onUpgrade?: () => void 
  }) => (
    <div className={`relative bg-white rounded-2xl p-6 border-2 ${isCurrent ? 'border-green-500 shadow-green-100' : isPopular ? 'border-indigo-500 shadow-indigo-100' : 'border-gray-100'} shadow-lg flex flex-col`}>
      {isPopular && !isCurrent && <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-indigo-500 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">Most Popular</div>}
      
      {isCurrent && <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">{currentLabel || 'Current Plan'}</div>}
      
      <h3 className="text-xl font-bold text-gray-800">{title}</h3>
      
      <div className="mt-2 flex items-baseline text-gray-900">
        {price === 'Custom' ? (
             <span className="text-3xl font-black tracking-tight">Custom</span>
        ) : (
             <>
                <span className="text-3xl font-black tracking-tight">₹{price}</span>
                <span className="text-sm text-gray-500 ml-1 font-medium">/month</span>
             </>
        )}
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
            <button disabled className="w-full bg-green-50 text-green-700 py-3 rounded-xl font-bold text-sm">
                {currentLabel || 'Active'}
            </button>
        ) : (
            <button onClick={onUpgrade} className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${isPopular ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg' : 'bg-gray-900 text-white hover:bg-black'}`}>
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
            <p className="text-indigo-600 font-bold text-sm mt-1 bg-indigo-50 inline-block px-3 py-1 rounded-full border border-indigo-100">
                {trialDaysLeft} Days left in Free Trial
            </p>
        )}
      </div>

      <div className="space-y-6">
        <PlanCard 
            title="Starter" 
            price="399" 
            desc="Basic manual attendance for small workshops."
            features={["Up to 25 Workers", "1 Manager Seat", "1 General Shift", "Manual Attendance Entry", "Basic Payroll Reports"]}
            isCurrent={tenantPlan === 'STARTER'}
            onUpgrade={() => handleUpgradeClick('Starter', '399')}
        />
        <PlanCard 
            title="Pro" 
            price="1,299" 
            desc="Full automation and AI features for growing factories."
            features={["Up to 100 Workers", "5 Manager Seats", "5 Shift Profiles", "AI Face Scan Kiosk", "Geofencing & GPS Validation", "Automated Overtime Rules"]}
            isCurrent={tenantPlan === 'PRO' || tenantPlan === 'TRIAL'}
            currentLabel={tenantPlan === 'TRIAL' ? 'Active (Free Trial)' : 'Active Plan'}
            isPopular={true}
            onUpgrade={() => handleUpgradeClick('Pro', '1299')}
        />
        <PlanCard 
            title="Enterprise" 
            price="Custom" 
            desc="Multi-site management for large scale operations."
            features={["Up to 250 Workers", "Unlimited Managers", "Unlimited Shifts", "Multi-Branch Support (Coming Soon)", "Priority WhatsApp Support"]}
            isCurrent={tenantPlan === 'ENTERPRISE'}
            buttonText="Contact Us"
            onUpgrade={() => window.open(whatsappEnterpriseUrl, '_blank')}
        />
      </div>

      {/* MANUAL PAYMENT QR MODAL */}
      {showQR.show && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
                <button onClick={() => setShowQR({show:false, planName:'', price:''})} className="absolute top-4 right-4 bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200 transition-colors">
                    <X size={18} />
                </button>
                
                <div className="text-center mb-6 mt-2">
                    <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <QrCode className="text-indigo-600" size={24}/>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">Upgrade to {showQR.planName}</h3>
                    <p className="text-gray-500 text-sm mt-1">Amount to pay: <strong className="text-gray-900 font-black">₹{showQR.price}</strong></p>
                </div>

                {/* --- REPLACE THE SRC BELOW WITH YOUR ACTUAL QR CODE IMAGE URL --- */}
                <div className="bg-gray-50 p-4 rounded-2xl border-2 border-dashed border-gray-200 flex justify-center items-center mb-6">
                    <img 
                      src="https://upload.wikimedia.org/wikipedia/commons/d/d0/QR_code_for_mobile_English_Wikipedia.svg" 
                      alt="Payment QR" 
                      className="w-48 h-48 rounded-xl shadow-sm mix-blend-multiply"
                    />
                </div>
                
                <div className="text-center text-sm font-bold text-gray-600 mb-6 font-mono bg-gray-100 py-2 rounded-lg">
                    UPI ID: yourname@upi
                </div>

                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800 font-medium text-left space-y-2 mb-6 leading-relaxed">
                    <p>1. Scan the QR code using GPay, PhonePe, or Paytm.</p>
                    <p>2. Send ₹{showQR.price} exactly.</p>
                    <p>3. Take a screenshot of the successful payment.</p>
                    <p>4. Send the screenshot to our WhatsApp support to activate your plan instantly.</p>
                </div>

                <a 
                    href={whatsappPaymentUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="w-full bg-[#25D366] hover:bg-[#1ebd5a] text-white py-3.5 rounded-xl font-bold flex items-center justify-center transition-colors shadow-lg shadow-green-500/30"
                >
                    <MessageCircle size={18} className="mr-2" /> Send on WhatsApp
                </a>
            </div>
        </div>
      )}
    </div>
  );
};