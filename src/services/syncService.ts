import { dbService } from './db';

const DB_NAME = 'WorkforceOfflineDB';
const STORE_NAME = 'pendingPunches';
const DB_VERSION = 1;

export const syncService = {
  // 1. Initialize the IndexedDB
  initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // Create a store with an auto-incrementing ID
          db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
      };
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // 2. Save a failed punch to the local database
  async savePunchOffline(payload: any): Promise<boolean> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        // Add a local timestamp so we know exactly when they punched, even if synced later
        store.add({ 
            ...payload, 
            offlineTimestamp: new Date().toISOString() 
        });
        
        tx.oncomplete = () => {
           // Notify the UI that an offline punch was queued
           window.dispatchEvent(new Event('offlinePunchAdded'));
           resolve(true);
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.error("Failed to save punch offline:", error);
      return false;
    }
  },

  // 3. Get all pending offline punches
  async getPendingPunches(): Promise<any[]> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      return [];
    }
  },

  // 4. Remove a punch after it successfully syncs
  async removePunch(id: number): Promise<boolean> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },

  // 5. The core Sync function (pushes local data to Firebase)
  async syncPendingData() {
    if (!navigator.onLine) return;

    const pending = await this.getPendingPunches();
    if (pending.length === 0) return;

    // Notify UI that syncing has started
    window.dispatchEvent(new CustomEvent('syncStatus', { 
        detail: { syncing: true, count: pending.length } 
    }));

    let successCount = 0;

    for (const punch of pending) {
      try {
        // FIXED: Using markAttendance matching your db.ts file
        await dbService.markAttendance(punch);
        
        // If successful, remove it from the local queue
        await this.removePunch(punch.id);
        successCount++;
      } catch (error) {
        console.error("Firebase sync failed for punch:", error);
        // Break early if we hit an error (likely the network dropped again mid-sync)
        break;
      }
    }

    // Notify UI that syncing finished (or paused if error)
    window.dispatchEvent(new CustomEvent('syncStatus', { 
        detail: { syncing: false, count: pending.length - successCount } 
    }));
  },

  // 6. Start the Event Listeners
  initAutoSync() {
    // Sync immediately when connection is restored
    window.addEventListener('online', () => {
      this.syncPendingData();
    });
    
    // Safety net: Try to sync every 3 minutes if online, just in case a packet dropped
    setInterval(() => {
        if (navigator.onLine) this.syncPendingData();
    }, 3 * 60 * 1000);
  }
};