import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { syncService } from '../services/syncService';

export const OfflineBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  const checkPending = async () => {
    const pending = await syncService.getPendingPunches();
    setPendingCount(pending.length);
  };

  useEffect(() => {
    // Initial check and setup
    checkPending();
    syncService.initAutoSync();

    const handleOnline = () => {
        setIsOffline(false);
        syncService.syncPendingData();
    };
    
    const handleOffline = () => setIsOffline(true);
    
    const handlePunchAdded = () => checkPending();
    
    const handleSyncStatus = (e: any) => {
        const { syncing, count } = e.detail;
        setIsSyncing(syncing);
        setPendingCount(count);
        
        // If it just finished syncing and count is 0, show success briefly
        if (!syncing && count === 0 && pendingCount > 0) {
            setShowSuccessMessage(true);
            setTimeout(() => setShowSuccessMessage(false), 3000);
        }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offlinePunchAdded', handlePunchAdded);
    window.addEventListener('syncStatus', handleSyncStatus);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offlinePunchAdded', handlePunchAdded);
      window.removeEventListener('syncStatus', handleSyncStatus);
    };
  }, [pendingCount]);

  // Don't render anything if online and nothing is pending
  if (!isOffline && pendingCount === 0 && !isSyncing && !showSuccessMessage) {
      return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center w-full px-4 pt-2 pointer-events-none">
        <div className="bg-white rounded-full shadow-lg border pointer-events-auto px-4 py-2 flex items-center transition-all duration-300">
            
            {showSuccessMessage ? (
                // SUCCESS STATE
                <div className="flex items-center text-green-600 text-sm font-bold">
                    <CheckCircle2 size={18} className="mr-2" />
                    All offline punches synced!
                </div>
            ) : isSyncing ? (
                // SYNCING STATE
                <div className="flex items-center text-blue-600 text-sm font-bold">
                    <RefreshCw size={18} className="mr-2 animate-spin" />
                    Syncing {pendingCount} punches...
                </div>
            ) : isOffline ? (
                // OFFLINE STATE
                <div className="flex items-center text-amber-600 text-sm font-bold">
                    <WifiOff size={18} className="mr-2" />
                    Offline Mode
                    {pendingCount > 0 && (
                        <span className="ml-2 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-xs">
                            {pendingCount} queued
                        </span>
                    )}
                </div>
            ) : (
                // ONLINE BUT HAS PENDING (Network flaky)
                <div className="flex items-center text-orange-600 text-sm font-bold">
                    <AlertTriangle size={18} className="mr-2" />
                    {pendingCount} punches waiting to sync...
                </div>
            )}
            
        </div>
    </div>
  );
};