import { conflictService } from './conflictService';
// src/services/syncService.ts
import { dbService } from './db';
import { SyncStatus, OfflineQueueItem, StorageHealth, AttendanceRecord } from '../types/index';

const DB_NAME = 'WorkforceOfflineDB_v2';
const QUEUE_STORE = 'offlineQueue';
const DB_VERSION = 2;

/** Configurable threshold in milliseconds for marking an unsynced punch as stale (default 4 hours) */
export const SYNC_STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000;

export const syncService = {
  dbInstance: null as IDBDatabase | null,
  isSyncingNow: false,
  listeners: new Set<(items: OfflineQueueItem[]) => void>(),

  // 1. Initialize Durable IndexedDB
  async initDB(): Promise<IDBDatabase> {
    if (this.dbInstance) return this.dbInstance;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('syncStatus', 'syncStatus', { unique: false });
          store.createIndex('tenantId', 'tenantId', { unique: false });
          store.createIndex('workerId', 'workerId', { unique: false });
          store.createIndex('recordId', 'recordId', { unique: false });
        }
      };

      request.onsuccess = () => {
        this.dbInstance = request.result;
        resolve(request.result);
      };

      request.onerror = () => reject(request.error);
    });
  },

  // 2. Request Persistent Storage (Guards against iOS WebKit Storage Eviction under memory pressure)
  async requestPersistentStorage(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        const isPersisted = await navigator.storage.persist();
        console.log(`[SyncManager] Storage persistence granted: ${isPersisted}`);
        return isPersisted;
      } catch (e) {
        console.warn('[SyncManager] Error requesting persistent storage:', e);
      }
    }
    return false;
  },

  // 3. Storage Health & Quota Diagnostics
  async getStorageHealth(): Promise<StorageHealth> {
    const health: StorageHealth = {
      isPersistent: false,
      persistedChecked: false,
      usageBytes: 0,
      quotaBytes: 0,
      percentUsed: 0,
      isLowStorage: false,
    };

    if (typeof navigator !== 'undefined' && navigator.storage) {
      try {
        if (navigator.storage.persisted) {
          health.isPersistent = await navigator.storage.persisted();
          health.persistedChecked = true;
        }

        if (navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          health.usageBytes = estimate.usage || 0;
          health.quotaBytes = estimate.quota || 0;
          if (health.quotaBytes > 0) {
            health.percentUsed = Math.round((health.usageBytes / health.quotaBytes) * 100);
            health.isLowStorage = health.percentUsed > 85;
          }
        }
      } catch (err) {
        console.warn('[SyncManager] Could not query storage estimate:', err);
      }
    }

    if (!health.isPersistent) {
      health.warning = 'Persistent storage not locked. On iOS, keep device charged to prevent cache clearing.';
    }

    return health;
  },

  // 4. Save a new punch or record to the offline queue immediately (Optimistic Local Write)
  async enqueueRecord(
    entityType: 'ATTENDANCE' | 'ADVANCE' | 'TASK',
    recordId: string,
    tenantId: string,
    workerId: string,
    workerName: string,
    payload: any
  ): Promise<OfflineQueueItem | null> {
    try {
      const db = await this.initDB();
      const now = new Date().toISOString();

      const newItem: Omit<OfflineQueueItem, 'id'> = {
        entityType,
        recordId,
        tenantId,
        workerId,
        workerName,
        payload,
        syncStatus: 'PENDING_LOCAL',
        createdAt: now,
        offlineTimestamp: now,
        attempts: 0,
      };

      return new Promise((resolve, reject) => {
        const tx = db.transaction(QUEUE_STORE, 'readwrite');
        const store = tx.objectStore(QUEUE_STORE);
        const addReq = store.add(newItem);

        addReq.onsuccess = () => {
          const queuedItem: OfflineQueueItem = {
            ...newItem,
            id: addReq.result as number,
          };
          this.notifyQueueChanged();
          resolve(queuedItem);
        };

        addReq.onerror = () => reject(addReq.error);
      });
    } catch (error) {
      console.error('[SyncManager] Failed to enqueue offline record:', error);
      return null;
    }
  },

  // Backwards compatibility helper for existing savePunchOffline calls
  async savePunchOffline(record: AttendanceRecord): Promise<boolean> {
    const item = await this.enqueueRecord(
      'ATTENDANCE',
      record.id,
      record.tenantId,
      record.workerId,
      record.workerName,
      record
    );
    return !!item;
  },

  // 5. Query all queue items
  async getQueueItems(): Promise<OfflineQueueItem[]> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(QUEUE_STORE, 'readonly');
        const store = tx.objectStore(QUEUE_STORE);
        const req = store.getAll();

        req.onsuccess = () => {
          const items: OfflineQueueItem[] = req.result || [];
          // Sort with oldest pending first
          items.sort((a, b) => new Date(a.offlineTimestamp).getTime() - new Date(b.offlineTimestamp).getTime());
          resolve(items);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.error('[SyncManager] Error getting queue items:', e);
      return [];
    }
  },

  // Backwards compatibility helper for existing getPendingPunches calls
  async getPendingPunches(): Promise<any[]> {
    const items = await this.getQueueItems();
    return items
      .filter((i) => i.syncStatus === 'PENDING_LOCAL' || i.syncStatus === 'SYNCING')
      .map((i) => ({ ...i.payload, id: i.id }));
  },

  // 6. Update single item in IndexedDB
  async updateItem(item: OfflineQueueItem): Promise<boolean> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(QUEUE_STORE, 'readwrite');
        const store = tx.objectStore(QUEUE_STORE);
        const req = store.put(item);
        req.onsuccess = () => {
          this.notifyQueueChanged();
          resolve(true);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.error('[SyncManager] Failed to update queue item:', e);
      return false;
    }
  },

  // 7. Delete an item from the queue
  async removeItem(id: number): Promise<boolean> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(QUEUE_STORE, 'readwrite');
        const store = tx.objectStore(QUEUE_STORE);
        const req = store.delete(id);
        req.onsuccess = () => {
          this.notifyQueueChanged();
          resolve(true);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.error('[SyncManager] Failed to remove queue item:', e);
      return false;
    }
  },

  // Backwards compatibility helper
  async removePunch(id: number): Promise<boolean> {
    return this.removeItem(id);
  },

  // 8. Auto-flush queue on network restoration or manual trigger
  async syncPendingData(): Promise<{ syncedCount: number; failedCount: number; conflictCount: number }> {
    if (!navigator.onLine || this.isSyncingNow) {
      return { syncedCount: 0, failedCount: 0, conflictCount: 0 };
    }

    this.isSyncingNow = true;
    let syncedCount = 0;
    let failedCount = 0;
    let conflictCount = 0;

    try {
      const allItems = await this.getQueueItems();
      const pendingItems = allItems.filter(
        (i) => i.syncStatus === 'PENDING_LOCAL' || i.syncStatus === 'SYNCING'
      );

      if (pendingItems.length === 0) {
        this.isSyncingNow = false;
        return { syncedCount: 0, failedCount: 0, conflictCount: 0 };
      }

      window.dispatchEvent(
        new CustomEvent('syncStatus', {
          detail: { syncing: true, count: pendingItems.length },
        })
      );

      for (const item of pendingItems) {
        // Transition card state: "Syncing"
        item.syncStatus = 'SYNCING';
        item.attempts += 1;
        await this.updateItem(item);

        try {
          if (item.entityType === 'ATTENDANCE') {
            // AC 1: Server-authoritative conflict strategy with user-visible review
            try {
              const serverAttendance = await dbService.getTodayAttendance(item.tenantId);
              const serverRecord = serverAttendance.find(r => r.workerId === item.workerId);
              const detectedConflict = conflictService.detectPunchConflict(
                item.payload,
                serverRecord,
                item.payload?.timeline?.slice(-1)[0]?.device
              );

              if (detectedConflict) {
                await conflictService.saveConflict(detectedConflict);
                item.syncStatus = 'CONFLICT';
                item.lastError = detectedConflict.conflictReason;
                item.conflictDetails = {
                  serverTimestamp: detectedConflict.serverData.serverTimestamp,
                  message: detectedConflict.conflictReason,
                };
                await this.updateItem(item);
                conflictCount++;
                continue; // Do NOT auto-merge or blindly overwrite; flag for supervisor review
              }
            } catch (conflictCheckErr) {
              console.warn('[SyncManager] Conflict check skipped:', conflictCheckErr);
            }

            const payloadRecord: AttendanceRecord = {
              ...item.payload,
              syncStatus: 'SYNCED',
            };

            // Attempt to write to Firebase / Server
            await dbService.markAttendance(payloadRecord);

            // Server confirmed: transition to SYNCED and remove from queue
            item.syncStatus = 'SYNCED';
            await this.updateItem(item);
            // Remove after short delay so UI can show Confirmed on server
            setTimeout(() => this.removeItem(item.id!), 2000);
            syncedCount++;
          } else if (item.entityType === 'ADVANCE') {
            await dbService.addAdvance(item.payload);
            item.syncStatus = 'SYNCED';
            await this.updateItem(item);
            setTimeout(() => this.removeItem(item.id!), 2000);
            syncedCount++;
          }
        } catch (error: any) {
          console.warn(`[SyncManager] Sync failed for item ${item.id}:`, error);

          // Detect Conflict or Permanent Server Rejection (e.g. duplicate timestamp or conflicting shift lock)
          const errorMsg = String(error?.message || error || 'Network or Server Error');
          const isConflict =
            errorMsg.includes('already exists') ||
            errorMsg.includes('duplicate') ||
            errorMsg.includes('conflict') ||
            errorMsg.includes('locked');

          if (isConflict) {
            item.syncStatus = 'CONFLICT';
            item.lastError = `Server Conflict: ${errorMsg}`;
            item.conflictDetails = {
              serverTimestamp: new Date().toISOString(),
              message: errorMsg,
            };
            conflictCount++;
          } else if (item.attempts >= 3) {
            item.syncStatus = 'FAILED';
            item.lastError = `Failed after ${item.attempts} retries: ${errorMsg}`;
            failedCount++;
          } else {
            // Keep as PENDING_LOCAL for next network pass
            item.syncStatus = 'PENDING_LOCAL';
            item.lastError = errorMsg;
            failedCount++;
          }

          await this.updateItem(item);

          // Break loop if connection dropped during sync
          if (!navigator.onLine) break;
        }
      }
    } finally {
      this.isSyncingNow = false;
      this.notifyQueueChanged();
      window.dispatchEvent(
        new CustomEvent('syncStatus', {
          detail: { syncing: false, count: 0 },
        })
      );
    }

    return { syncedCount, failedCount, conflictCount };
  },

  // 9. Manual Item Actions
  async retryItem(id: number): Promise<void> {
    const items = await this.getQueueItems();
    const item = items.find((i) => i.id === id);
    if (!item) return;

    item.syncStatus = 'PENDING_LOCAL';
    item.lastError = undefined;
    await this.updateItem(item);
    if (navigator.onLine) {
      this.syncPendingData();
    }
  },

  async retryAllFailed(): Promise<void> {
    const items = await this.getQueueItems();
    for (const item of items) {
      if (item.syncStatus === 'FAILED' || item.syncStatus === 'CONFLICT') {
        item.syncStatus = 'PENDING_LOCAL';
        item.lastError = undefined;
        await this.updateItem(item);
      }
    }
    if (navigator.onLine) {
      this.syncPendingData();
    }
  },

  async forceOverrideServer(id: number): Promise<boolean> {
    const items = await this.getQueueItems();
    const item = items.find((i) => i.id === id);
    if (!item) return false;

    try {
      if (item.entityType === 'ATTENDANCE') {
        const payloadRecord: AttendanceRecord = {
          ...item.payload,
          syncStatus: 'SYNCED',
        };
        await dbService.markAttendance(payloadRecord);
      }
      await this.removeItem(id);
      return true;
    } catch (e: any) {
      item.syncStatus = 'FAILED';
      item.lastError = `Manual override rejected: ${e?.message || e}`;
      await this.updateItem(item);
      return false;
    }
  },

  // 10. Check if an item is stale beyond the configured shift threshold
  isItemStale(item: OfflineQueueItem, thresholdMs = SYNC_STALE_THRESHOLD_MS): boolean {
    const age = Date.now() - new Date(item.offlineTimestamp).getTime();
    return age > thresholdMs;
  },

  // 11. Event Subscriptions & Auto-Sync Initializer
  subscribe(listener: (items: OfflineQueueItem[]) => void): () => void {
    this.listeners.add(listener);
    this.getQueueItems().then((items) => listener(items));
    return () => this.listeners.delete(listener);
  },

  notifyQueueChanged() {
    this.getQueueItems().then((items) => {
      this.listeners.forEach((listener) => {
        try {
          listener(items);
        } catch (e) {
          console.warn('[SyncManager] Error in listener:', e);
        }
      });
      window.dispatchEvent(new CustomEvent('offlineQueueChanged', { detail: { items } }));
    });
  },

  // Recovers pending entries on launch, requests persistent storage, binds network listeners
  async initAutoSync(): Promise<void> {
    await this.requestPersistentStorage();
    await this.initDB();

    // Recover queue from IndexedDB on launch: reset any items that were left in 'SYNCING' state back to 'PENDING_LOCAL'
    const items = await this.getQueueItems();
    for (const item of items) {
      if (item.syncStatus === 'SYNCING') {
        item.syncStatus = 'PENDING_LOCAL';
        await this.updateItem(item);
      }
    }

    // Auto-flush when network is restored
    window.addEventListener('online', () => {
      console.log('[SyncManager] Network restored! Auto-flushing offline queue...');
      this.syncPendingData();
    });

    window.addEventListener('offline', () => {
      console.log('[SyncManager] Device went offline. Queueing writes to IndexedDB.');
      this.notifyQueueChanged();
    });

    // Initial flush if online on boot
    if (navigator.onLine) {
      this.syncPendingData();
    }

    // Background heartbeat check (every 2 minutes)
    setInterval(() => {
      if (navigator.onLine && !this.isSyncingNow) {
        this.syncPendingData();
      }
    }, 2 * 60 * 1000);
  },
};
