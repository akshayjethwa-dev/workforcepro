// src/services/conflictService.ts
import { dbService } from './db';
import { syncService } from './syncService';
import { 
  PunchConflict, 
  ConflictAuditEntry, 
  AttendanceRecord, 
  Punch, 
  Worker, 
  OfflineQueueItem 
} from '../types/index';

/** Default conflict window in milliseconds (15 minutes) */
export const CONFLICT_WINDOW_MS = 15 * 60 * 1000;

const CONFLICTS_STORAGE_KEY = 'workforce_punch_conflicts';
const AUDIT_STORAGE_KEY = 'workforce_conflict_audit_trail';

const getStoredConflicts = (): PunchConflict[] => {
  try {
    const raw = localStorage.getItem(CONFLICTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const setStoredConflicts = (conflicts: PunchConflict[]) => {
  try {
    localStorage.setItem(CONFLICTS_STORAGE_KEY, JSON.stringify(conflicts));
    window.dispatchEvent(new CustomEvent('punchConflictsChanged', { detail: { conflicts } }));
  } catch (e) {
    console.error('Error saving conflicts:', e);
  }
};

const getStoredAuditTrail = (): ConflictAuditEntry[] => {
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const appendAuditEntry = (entry: ConflictAuditEntry) => {
  try {
    const current = getStoredAuditTrail();
    const updated = [entry, ...current].slice(0, 100);
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('conflictAuditChanged', { detail: { auditTrail: updated } }));
  } catch (e) {
    console.error('Error appending audit entry:', e);
  }
};

export const conflictService = {
  // 1. Get all punch conflicts for a tenant
  async getConflicts(tenantId: string): Promise<PunchConflict[]> {
    const all = getStoredConflicts();
    return all.filter((c) => c.tenantId === tenantId);
  },

  // 2. Get unresolved conflicts blocking a specific payroll month ('YYYY-MM')
  async getUnresolvedPayrollConflicts(tenantId: string, payPeriodMonth: string): Promise<PunchConflict[]> {
    const all = await this.getConflicts(tenantId);
    return all.filter(
      (c) => c.status === 'UNRESOLVED' && c.payPeriod.startsWith(payPeriodMonth)
    );
  },

  // 3. Save or update a punch conflict
  async saveConflict(conflict: PunchConflict): Promise<void> {
    const all = getStoredConflicts();
    const index = all.findIndex((c) => c.id === conflict.id);
    if (index >= 0) {
      all[index] = conflict;
    } else {
      all.unshift(conflict);
    }
    setStoredConflicts(all);
  },

  // 4. Get conflict audit trail
  async getAuditTrail(tenantId: string): Promise<ConflictAuditEntry[]> {
    const all = getStoredAuditTrail();
    return all.filter((a) => a.tenantId === tenantId);
  },

  // 5. Detect if an incoming offline punch conflicts with server state
  detectPunchConflict(
    offlineRecord: AttendanceRecord,
    serverRecord: AttendanceRecord | undefined,
    deviceId = 'Mobile App (Worker Device)'
  ): PunchConflict | null {
    if (!serverRecord || !serverRecord.timeline || serverRecord.timeline.length === 0) {
      return null;
    }

    const offlineTimeline = offlineRecord.timeline || [];
    const latestOfflinePunch = offlineTimeline[offlineTimeline.length - 1];
    if (!latestOfflinePunch) return null;

    const serverTimeline = serverRecord.timeline;
    const latestServerPunch = serverTimeline[serverTimeline.length - 1];
    if (!latestServerPunch) return null;

    const offlineTime = new Date(latestOfflinePunch.timestamp).getTime();
    const serverTime = new Date(latestServerPunch.timestamp).getTime();
    const timeDiff = Math.abs(serverTime - offlineTime);
    const clockSkewMs = serverTime - offlineTime;

    // Condition A: Conflicting punches recorded on different devices within the conflict window (e.g. 15 mins)
    const isDifferentDevice = latestOfflinePunch.device !== latestServerPunch.device;
    const isWithinWindow = timeDiff <= CONFLICT_WINDOW_MS;

    // Condition B: Contradictory punch sequence or duplicate punch
    const isContradictory =
      (latestOfflinePunch.type === latestServerPunch.type && isWithinWindow) ||
      (isDifferentDevice && isWithinWindow);

    if (isContradictory) {
      const payPeriod = offlineRecord.date.slice(0, 7);
      const conflictReason = isDifferentDevice
        ? `Dual-device conflict: ${latestOfflinePunch.device} recorded ${latestOfflinePunch.type} while ${latestServerPunch.device} recorded ${latestServerPunch.type} within ${(timeDiff / 60000).toFixed(1)} mins.`
        : `Duplicate or overlapping punch within ${(timeDiff / 60000).toFixed(1)} minutes of existing server record.`;

      const conflict: PunchConflict = {
        id: `conflict_${offlineRecord.tenantId}_${offlineRecord.workerId}_${Date.now()}`,
        recordId: offlineRecord.id,
        tenantId: offlineRecord.tenantId,
        workerId: offlineRecord.workerId,
        workerName: offlineRecord.workerName,
        payPeriod,
        conflictReason,
        offlineData: {
          punchType: latestOfflinePunch.type,
          deviceTimestamp: latestOfflinePunch.timestamp,
          deviceId: latestOfflinePunch.device || deviceId,
          location: latestOfflinePunch.location,
          notes: 'Offline punch recorded locally on field device',
        },
        serverData: {
          punchType: latestServerPunch.type,
          serverTimestamp: latestServerPunch.timestamp,
          deviceId: latestServerPunch.device || 'Kiosk Terminal (Gate 1)',
          location: latestServerPunch.location,
          notes: 'Server-authoritative attendance state',
        },
        clockSkewMs,
        status: 'UNRESOLVED',
        createdAt: new Date().toISOString(),
      };

      return conflict;
    }

    return null;
  },

  // 6. Field-Level Three-Way Merge for independent worker/supervisor fields
  fieldLevelMerge<T extends Record<string, any>>(
    base: T,
    local: Partial<T>,
    server: Partial<T>,
    scalarKeysAllowedLWW: (keyof T)[] = [],
    context = { tenantId: 'default', entityId: 'entity', workerName: 'Staff', resolvedBy: 'System' }
  ): { merged: T; conflictingKeys: (keyof T)[]; auditEntries: ConflictAuditEntry[] } {
    const merged = { ...base };
    const conflictingKeys: (keyof T)[] = [];
    const auditEntries: ConflictAuditEntry[] = [];
    const allKeys = Array.from(new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(server)])) as (keyof T)[];

    for (const key of allKeys) {
      const baseVal = base[key];
      const localVal = local[key];
      const serverVal = server[key];

      const localChanged = localVal !== undefined && localVal !== baseVal;
      const serverChanged = serverVal !== undefined && serverVal !== baseVal;

      if (localChanged && !serverChanged) {
        // Safe independent field merge: Local changed offline, server didn't touch it. Keep local!
        merged[key] = localVal as any;
      } else if (!localChanged && serverChanged) {
        // Safe independent field merge: Server changed online, local didn't touch it. Keep server!
        merged[key] = serverVal as any;
      } else if (localChanged && serverChanged) {
        if (localVal === serverVal) {
          // Both changed to the exact same value: clean merge
          merged[key] = localVal as any;
        } else if (scalarKeysAllowedLWW.includes(key)) {
          // Last-write-wins allowed only for designated scalar values with audit trail
          merged[key] = serverVal as any; // Server authoritative timestamp wins scalar preference

          const auditEntry: ConflictAuditEntry = {
            id: `audit_${Date.now()}_${String(key)}`,
            tenantId: context.tenantId,
            entityType: 'PREFERENCE',
            entityId: context.entityId,
            workerName: context.workerName,
            field: String(key),
            strategy: 'LAST_WRITE_WINS',
            winningValue: serverVal,
            discardedValue: localVal,
            serverTimestamp: new Date().toISOString(),
            resolvedBy: context.resolvedBy,
            resolvedAt: new Date().toISOString(),
            notes: `Last-write-wins applied for independent scalar preference: ${String(key)}`,
          };
          appendAuditEntry(auditEntry);
          auditEntries.push(auditEntry);
        } else {
          // True conflict on the same field: requires supervisor resolution
          conflictingKeys.push(key);
        }
      }
    }

    return { merged, conflictingKeys, auditEntries };
  },

  // 7. Resolve Attendance Punch Conflict with Supervisor Action
  async resolvePunchConflict(
    conflictId: string,
    strategy: 'KEEP_OFFLINE' | 'KEEP_SERVER' | 'MANUAL_MERGE',
    manualData?: { finalTimestamp: string; finalPunchType: 'IN' | 'OUT'; finalNotes?: string },
    resolvedBy = 'Site Supervisor'
  ): Promise<PunchConflict | null> {
    const all = getStoredConflicts();
    const conflict = all.find((c) => c.id === conflictId);
    if (!conflict) return null;

    const now = new Date().toISOString();
    let finalTimestamp = conflict.serverData.serverTimestamp;
    let finalPunchType = conflict.serverData.punchType;
    let finalNotes = conflict.serverData.notes;
    let winningDeviceId = conflict.serverData.deviceId;

    // Rule: "Clock skew: Use server timestamps for final resolution; device timestamps are stored as metadata only."
    if (strategy === 'KEEP_OFFLINE') {
      finalPunchType = conflict.offlineData.punchType;
      // Use server timestamp to protect against device clock skew, but annotate device metadata
      finalTimestamp = now;
      winningDeviceId = conflict.offlineData.deviceId;
      finalNotes = `Resolved keeping offline punch (Device Clock was: ${conflict.offlineData.deviceTimestamp}, Skew: ${conflict.clockSkewMs}ms)`;
    } else if (strategy === 'KEEP_SERVER') {
      finalPunchType = conflict.serverData.punchType;
      finalTimestamp = conflict.serverData.serverTimestamp;
      winningDeviceId = conflict.serverData.deviceId;
      finalNotes = 'Resolved keeping server-authoritative punch';
    } else if (strategy === 'MANUAL_MERGE' && manualData) {
      finalTimestamp = manualData.finalTimestamp || now;
      finalPunchType = manualData.finalPunchType;
      finalNotes = manualData.finalNotes || 'Manually merged by supervisor';
      winningDeviceId = 'Supervisor Manual Resolution';
    }

    conflict.status = 'RESOLVED';
    conflict.resolution = {
      strategy,
      resolvedBy,
      resolvedAt: now,
      finalTimestamp,
      finalPunchType,
      finalNotes,
    };

    // Update attendance record on server with resolved punch
    try {
      const todayAttendance = await dbService.getTodayAttendance(conflict.tenantId);
      const existing = todayAttendance.find((r) => r.id === conflict.recordId);
      if (existing) {
        const resolvedPunch: Punch = {
          timestamp: finalTimestamp,
          type: finalPunchType,
          device: `${winningDeviceId} (Resolved Conflict)`,
          location: strategy === 'KEEP_OFFLINE' ? conflict.offlineData.location : conflict.serverData.location,
          syncStatus: 'SYNCED',
        };

        const updatedTimeline = [...existing.timeline, resolvedPunch];
        const updatedRecord: AttendanceRecord = {
          ...existing,
          timeline: updatedTimeline,
          syncStatus: 'SYNCED',
        };

        await dbService.markAttendance(updatedRecord);
      }
    } catch (err) {
      console.warn('[ConflictService] Error writing resolved attendance record:', err);
    }

    // Append to immutable audit trail
    const auditEntry: ConflictAuditEntry = {
      id: `audit_${Date.now()}`,
      tenantId: conflict.tenantId,
      entityType: 'ATTENDANCE',
      entityId: conflict.recordId,
      workerName: conflict.workerName,
      field: 'timeline.punch',
      strategy,
      winningValue: {
        punchType: finalPunchType,
        timestamp: finalTimestamp,
        device: winningDeviceId,
      },
      discardedValue:
        strategy === 'KEEP_OFFLINE'
          ? conflict.serverData
          : strategy === 'KEEP_SERVER'
          ? conflict.offlineData
          : { offline: conflict.offlineData, server: conflict.serverData },
      serverTimestamp: conflict.serverData.serverTimestamp,
      deviceTimestamp: conflict.offlineData.deviceTimestamp,
      deviceId: winningDeviceId,
      resolvedBy,
      resolvedAt: now,
      notes: finalNotes,
    };
    appendAuditEntry(auditEntry);

    // Save updated conflict in storage
    await this.saveConflict(conflict);

    // Also update any matching item in IndexedDB queue
    const queueItems = await syncService.getQueueItems();
    const matchingItem = queueItems.find(
      (i) => i.recordId === conflict.recordId && (i.syncStatus === 'CONFLICT' || i.syncStatus === 'FAILED')
    );
    if (matchingItem && matchingItem.id) {
      await syncService.removeItem(matchingItem.id);
    }

    return conflict;
  },

  // 8. Seed a demo dual-device conflict for testing and supervisor verification
  async seedDemoConflict(tenantId: string, workerName = 'Ramesh Kumar', workerId = 'worker-1'): Promise<PunchConflict> {
    const now = new Date();
    const payPeriod = now.toISOString().slice(0, 7);
    const today = now.toISOString().split('T')[0];
    const recordId = `${tenantId}_${workerId}_${today}`;

    // Shared kiosk punch at 08:30 vs Personal mobile punch at 08:32
    const serverTime = new Date(now.getTime() - 25 * 60 * 1000).toISOString();
    const deviceTime = new Date(now.getTime() - 22 * 60 * 1000).toISOString();

    const conflict: PunchConflict = {
      id: `conflict_demo_${Date.now()}`,
      recordId,
      tenantId,
      workerId,
      workerName,
      payPeriod,
      conflictReason:
        'Dual-device conflict: Shared Kiosk Terminal punched IN at 08:30 AM, but Worker Personal Mobile punched IN at 08:32 AM with a 2-minute clock skew.',
      offlineData: {
        punchType: 'IN',
        deviceTimestamp: deviceTime,
        deviceId: 'Worker Personal Phone (Android 14)',
        location: { lat: 28.6139, lng: 77.209 },
        notes: 'Punched via personal app in queue at gate',
      },
      serverData: {
        punchType: 'IN',
        serverTimestamp: serverTime,
        deviceId: 'Gate 1 Turnstile Kiosk Terminal',
        location: { lat: 28.6138, lng: 77.2089 },
        notes: 'Biometric face scan on entry kiosk',
      },
      clockSkewMs: 120000, // 2 minutes
      status: 'UNRESOLVED',
      createdAt: now.toISOString(),
    };

    await this.saveConflict(conflict);
    return conflict;
  },
};
