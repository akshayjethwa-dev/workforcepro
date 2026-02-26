import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Hide the banner completely if the user is online
  if (!isOffline) return null;

  return (
     <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all bg-red-600">
         <div className="flex items-center space-x-2">
             <WifiOff size={16} />
             <span>
                 YOU ARE OFFLINE - Changes will sync automatically when network is restored
             </span>
         </div>
     </div>
  );
};