// src/screens/PrivacyScreen.tsx
import React from 'react';
import { Shield } from 'lucide-react';

export const PrivacyScreen: React.FC = () => {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto animate-in fade-in">
      <div className="flex items-center mb-6">
        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mr-4">
          <Shield size={24} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Privacy Policy</h1>
          <p className="text-gray-500 mt-1">Last Updated: {new Date().toLocaleDateString()}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 space-y-6 text-gray-700 leading-relaxed">
        <p>This Privacy Policy explains how our Workforce application collects, uses, and protects your data, including sensitive permissions required for functionality.</p>
        
        <div>
            <h3 className="font-bold text-gray-900 text-lg mb-2">1. Camera and Media Permissions</h3>
            <p>Our application requires access to your device's Camera (CAMERA) and Media Library (READ_MEDIA_IMAGES, READ_MEDIA_VIDEO) to function. This is strictly used for:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Registering employee profiles and avatars.</li>
            <li>Performing secure facial recognition to log daily attendance.</li>
            </ul>
        </div>

        <div>
            <h3 className="font-bold text-gray-900 text-lg mb-2">2. Facial Data & Biometrics</h3>
            <p>We use localized AI models to process facial data for attendance tracking. Mathematical representations of faces (embeddings) are generated and stored securely within your tenant database. This data is <strong>never</strong> sold, shared with third-party advertisers, or used outside of attendance verification within your specific organization.</p>
        </div>

        <div>
            <h3 className="font-bold text-gray-900 text-lg mb-2">3. Location Data</h3>
            <p>If geofencing features are enabled, we may collect location data at the time of an attendance punch to verify the worker is within the authorized area. Continuous background location tracking is not performed.</p>
        </div>

        <div>
            <h3 className="font-bold text-gray-900 text-lg mb-2">4. Data Retention</h3>
            <p>Media and facial data are retained only as long as the employee is active in your workforce system. Upon deleting an employee or closing your account, associated media and biometric data are permanently deleted from our primary servers.</p>
        </div>
      </div>
    </div>
  );
};