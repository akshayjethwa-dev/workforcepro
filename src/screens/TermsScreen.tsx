// src/screens/TermsScreen.tsx
import React from 'react';
import { FileCheck } from 'lucide-react';

export const TermsScreen: React.FC = () => {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto animate-in fade-in">
      <div className="flex items-center mb-6">
        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mr-4">
          <FileCheck size={24} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Terms and Conditions</h1>
          <p className="text-gray-500 mt-1">Last Updated: {new Date().toLocaleDateString()}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 space-y-6 text-gray-700 leading-relaxed">
        <p>By registering for an account and using the WorkforcePro application, you (the "Employer" or "Tenant") agree to these terms:</p>
        
        <div>
            <h3 className="font-bold text-gray-900 text-lg mb-2">1. Acceptable Use</h3>
            <p>You agree to use this application solely for legitimate workforce management, attendance tracking, and payroll estimation. You are responsible for ensuring that you have obtained all necessary consents from your employees before capturing their photos or facial data.</p>
        </div>

        <div>
            <h3 className="font-bold text-gray-900 text-lg mb-2">2. Employer Responsibilities</h3>
            <p>As the account owner, you act as the Data Controller for your employees' data. You warrant that capturing photos and logging attendance via this app complies with your local labor and privacy laws. We act only as the Data Processor providing the tool.</p>
        </div>

        <div>
            <h3 className="font-bold text-gray-900 text-lg mb-2">3. Trial and Subscription</h3>
            <p>Upon registration, you are granted a 30-day free trial. Continued use of the platform after this period requires an active subscription. We reserve the right to suspend accounts that fail to maintain an active subscription after the trial period expires.</p>
        </div>
        
        <div>
            <h3 className="font-bold text-gray-900 text-lg mb-2">4. Hardware Compatibility</h3>
            <p>Facial recognition capabilities rely on the quality of the device camera and lighting conditions. We are not liable for attendance discrepancies caused by poor hardware or environmental factors.</p>
        </div>
      </div>
    </div>
  );
};