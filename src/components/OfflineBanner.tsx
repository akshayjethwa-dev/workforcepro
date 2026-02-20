import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { syncService } from '../services/syncService';
import { dbService } from '../services/db';

export const OfflineBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [queueSize, setQueueSize] = useState(syncService.getQueue().length);
  const [isSyncing, setIsSyncing] = useState(false);

  // Core Sync Function
  const handleSync = async () => {
     if (isSyncing || !navigator.onLine) return;
     
     const queue = syncService.getQueue();
     if (queue.length === 0) return;
     
     setIsSyncing(true);
     const failedQueue = [];

     for (const record of queue) {
         try {
             await dbService.markAttendanceOnline(record);
         } catch (e) {
             failedQueue.push(record); // Keep failed records in queue
         }
     }
     
     if (failedQueue.length === 0) {
         syncService.clearQueue();
     } else {
         syncService.saveQueue(failedQueue);
     }
     setIsSyncing(false);
  };

  useEffect(() => {
    const handleOnline = () => {
       setIsOffline(false);
       // Auto-sync quickly after network returns
       setTimeout(handleSync, 2000); 
    };
    const handleOffline = () => setIsOffline(true);
    const updateQueue = () => setQueueSize(syncService.getQueue().length);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sync-queue-updated', updateQueue);

    // Backup interval: Try syncing every 60 seconds if online
    const syncInterval = setInterval(() => {
       if (navigator.onLine && syncService.getQueue().length > 0) {
           handleSync();
       }
    }, 60000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sync-queue-updated', updateQueue);
      clearInterval(syncInterval);
    };
  }, [isSyncing]); // Added isSyncing dependency

  if (!isOffline && queueSize === 0) return null;

  return (
     <div className={`fixed top-0 left-0 right-0 z-100 flex items-center justify-between px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all ${isOffline ? 'bg-red-600' : 'bg-orange-500'}`}>
         <div className="flex items-center space-x-2">
             {isOffline ? <WifiOff size={16} /> : <AlertTriangle size={16} />}
             <span>
                 {isOffline ? 'OFFLINE MODE - ' : 'NETWORK RESTORED - '}
                 {queueSize} records pending sync
             </span>
         </div>
         
         {!isOffline && queueSize > 0 && (
             <button 
                onClick={handleSync} 
                disabled={isSyncing}
                className="flex items-center bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
             >
                 <RefreshCw size={14} className={`mr-1.5 ${isSyncing ? 'animate-spin' : ''}`} />
                 {isSyncing ? 'Syncing...' : 'Sync Now'}
             </button>
         )}
     </div>
  );
};