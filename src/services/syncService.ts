import { AttendanceRecord } from '../types/index';

const QUEUE_KEY = 'workforce_sync_queue';

export const syncService = {
  enqueue: (record: AttendanceRecord) => {
    const queue = syncService.getQueue();
    // Prevent duplicates by overriding existing record for the same ID
    const existingIdx = queue.findIndex(r => r.id === record.id);
    if (existingIdx > -1) {
        queue[existingIdx] = record;
    } else {
        queue.push(record);
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new Event('sync-queue-updated'));
  },
  
  getQueue: (): AttendanceRecord[] => {
    try {
        const data = localStorage.getItem(QUEUE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
  },
  
  saveQueue: (queue: AttendanceRecord[]) => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new Event('sync-queue-updated'));
  },

  clearQueue: () => {
    localStorage.removeItem(QUEUE_KEY);
    window.dispatchEvent(new Event('sync-queue-updated'));
  }
};