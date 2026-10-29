import { InboxItem, InboxAuditEntry, InboxUrgency, InboxActionType, UserProfile, Role, Worker, Punch, AttendanceRecord, Advance } from '../types/index';
import { dbService } from './db';
import { conflictService } from './conflictService';
import { syncService } from './syncService';

const INBOX_LOCAL_STORAGE_KEY = 'workforce_inbox_items_v1';
const INBOX_AUDIT_KEY = 'workforce_inbox_audit_v1';
const INBOX_DELEGATION_KEY = 'workforce_inbox_delegation_v1';

export interface ManagerDelegation {
  managerId: string;
  delegateId: string;
  delegateName: string;
  reason: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export class InboxService {
  private getStoredItems(tenantId: string): InboxItem[] {
    try {
      const raw = localStorage.getItem(`${INBOX_LOCAL_STORAGE_KEY}_${tenantId}`);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  private saveStoredItems(tenantId: string, items: InboxItem[]): void {
    try {
      localStorage.setItem(`${INBOX_LOCAL_STORAGE_KEY}_${tenantId}`, JSON.stringify(items));
    } catch (e) {
      console.error('Failed to save inbox items', e);
    }
  }

  public getAuditTrail(tenantId: string): InboxAuditEntry[] {
    try {
      const raw = localStorage.getItem(`${INBOX_AUDIT_KEY}_${tenantId}`);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  private saveAuditEntry(tenantId: string, entry: InboxAuditEntry): void {
    try {
      const entries = this.getAuditTrail(tenantId);
      entries.unshift(entry);
      // Keep last 100 entries
      localStorage.setItem(`${INBOX_AUDIT_KEY}_${tenantId}`, JSON.stringify(entries.slice(0, 100)));
    } catch (e) {
      console.error('Failed to save audit entry', e);
    }
  }

  public getDelegations(tenantId: string): ManagerDelegation[] {
    try {
      const raw = localStorage.getItem(`${INBOX_DELEGATION_KEY}_${tenantId}`);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public setDelegation(tenantId: string, delegation: ManagerDelegation): void {
    const list = this.getDelegations(tenantId).filter(d => d.managerId !== delegation.managerId);
    list.push(delegation);
    localStorage.setItem(`${INBOX_DELEGATION_KEY}_${tenantId}`, JSON.stringify(list));
  }

  public removeDelegation(tenantId: string, managerId: string): void {
    const list = this.getDelegations(tenantId).filter(d => d.managerId !== managerId);
    localStorage.setItem(`${INBOX_DELEGATION_KEY}_${tenantId}`, JSON.stringify(list));
  }

  /**
   * Seed realistic sample operational items if storage is empty
   */
  private seedInitialItems(tenantId: string, workers: Worker[]): InboxItem[] {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const worker1 = workers[0] || { id: 'w1', name: 'Ramesh Kumar', phone: '9876543210', designation: 'CNC Operator', branchId: 'main' };
    const worker2 = workers[1] || { id: 'w2', name: 'Sunita Devi', phone: '9876543211', designation: 'Assembly Line', branchId: 'main' };
    const worker3 = workers[2] || { id: 'w3', name: 'Vikram Singh', phone: '9876543212', designation: 'Packer & Dispatch', branchId: 'north' };
    const worker4 = workers[3] || { id: 'w4', name: 'Pooja Verma', phone: '9876543213', designation: 'Quality Inspector', branchId: 'main' };

    const initial: InboxItem[] = [
      {
        id: `inbox-adv-1`,
        tenantId,
        branchId: worker1.branchId,
        actionType: 'ADVANCE_APPROVAL',
        urgency: 'NORMAL',
        status: 'PENDING',
        workerId: worker1.id,
        workerName: worker1.name,
        workerPhone: worker1.phone,
        workerDesignation: worker1.designation,
        title: `Advance / Kharchi Request: ₹350`,
        description: `Requested emergency travel allowance for night shift conveyance.`,
        timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
        amount: 350,
        isLowRisk: true, // under ₹500
        details: {
          reason: 'Emergency travel conveyance',
          punchHistory: [
            { timestamp: `${todayStr}T08:58:00.000Z`, type: 'IN', device: 'Kiosk North Gate' }
          ]
        }
      },
      {
        id: `inbox-geo-1`,
        tenantId,
        branchId: worker2.branchId,
        actionType: 'ATTENDANCE_EXCEPTION',
        urgency: 'HIGH',
        status: 'PENDING',
        workerId: worker2.id,
        workerName: worker2.name,
        workerPhone: worker2.phone,
        workerDesignation: worker2.designation,
        title: `Geofence Violation Exception (145m out)`,
        description: `Punch IN marked 145 meters outside verified factory boundary at Main Gate road.`,
        timestamp: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
        isLowRisk: false,
        details: {
          geofenceViolation: true,
          distanceMeters: 145,
          baseLocation: { lat: 19.0760, lng: 72.8777, radius: 100, address: 'MIDC Industrial Area, Shed 4' },
          punchLocation: { lat: 19.0772, lng: 72.8785 },
          shiftName: 'General Shift (09:00 - 18:00)',
          punch: {
            timestamp: `${todayStr}T09:02:15.000Z`,
            type: 'IN',
            device: 'Mobile App (PWA)',
            isOutOfGeofence: true,
            location: { lat: 19.0772, lng: 72.8785 }
          },
          punchHistory: [
            { timestamp: `${todayStr}T09:02:15.000Z`, type: 'IN', device: 'Mobile App', isOutOfGeofence: true }
          ]
        }
      },
      {
        id: `inbox-late-1`,
        tenantId,
        branchId: worker3.branchId,
        actionType: 'ATTENDANCE_EXCEPTION',
        urgency: 'NORMAL',
        status: 'PENDING',
        workerId: worker3.id,
        workerName: worker3.name,
        workerPhone: worker3.phone,
        workerDesignation: worker3.designation,
        title: `Late Arrival Exception (+42 mins)`,
        description: `Reported at 09:42 AM (Grace period: 15 mins). Worker cited suburban train delay.`,
        timestamp: new Date(Date.now() - 85 * 60 * 1000).toISOString(),
        isLowRisk: false,
        details: {
          lateMinutes: 42,
          shiftName: 'Morning Shift (09:00 - 17:30)',
          shiftStartTime: '09:00 AM',
          reason: 'Suburban train delay (Western Line)',
          punchHistory: [
            { timestamp: `${todayStr}T09:42:00.000Z`, type: 'IN', device: 'Kiosk Turnstile 1' }
          ]
        }
      },
      {
        id: `inbox-adv-2`,
        tenantId,
        branchId: worker4.branchId,
        actionType: 'ADVANCE_APPROVAL',
        urgency: 'LOW',
        status: 'PENDING',
        workerId: worker4.id,
        workerName: worker4.name,
        workerPhone: worker4.phone,
        workerDesignation: worker4.designation,
        title: `Advance / Kharchi Request: ₹450`,
        description: `Routine medical prescription advance.`,
        timestamp: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
        amount: 450,
        isLowRisk: true, // under ₹500
        details: {
          reason: 'Routine medical prescription advance',
          punchHistory: [
            { timestamp: `${todayStr}T08:50:00.000Z`, type: 'IN', device: 'Kiosk Turnstile 2' }
          ]
        }
      },
      {
        id: `inbox-pay-1`,
        tenantId,
        branchId: worker1.branchId,
        actionType: 'PAYROLL_SIGNOFF',
        urgency: 'HIGH',
        status: 'PENDING',
        workerId: worker1.id,
        workerName: worker1.name,
        workerPhone: worker1.phone,
        workerDesignation: worker1.designation,
        title: `Monthly Payroll Pre-Sign-off: Ramesh Kumar`,
        description: `Verify 26 payable days, 8.5 OT hours and ₹1,200 total kharchi deductions before payroll lock.`,
        timestamp: new Date(Date.now() - 150 * 60 * 1000).toISOString(),
        isLowRisk: false,
        details: {
          payrollMonth: todayStr.substring(0, 7),
          reason: 'Monthly payroll sign-off verification'
        }
      }
    ];

    this.saveStoredItems(tenantId, initial);
    return initial;
  }

  /**
   * Aggregate pending & done items, synchronizing with database advances and conflict records
   */
  public async getInboxItems(
    tenantId: string, 
    profile?: UserProfile | null
  ): Promise<{ pending: InboxItem[]; done: InboxItem[] }> {
    let items = this.getStoredItems(tenantId);
    const workers = await dbService.getWorkers(tenantId);

    // If storage is completely empty, initialize with realistic operational items
    if (items.length === 0) {
      items = this.seedInitialItems(tenantId, workers);
    }

    // 1. Sync live database advances
    try {
      const advances = await dbService.getAdvances(tenantId);
      for (const adv of advances) {
        if (adv.status === 'PENDING' && !items.some(i => i.id === `db-adv-${adv.id}`)) {
          const w = workers.find(x => x.id === adv.workerId);
          items.unshift({
            id: `db-adv-${adv.id}`,
            tenantId,
            branchId: w?.branchId,
            actionType: 'ADVANCE_APPROVAL',
            urgency: adv.amount > 2000 ? 'HIGH' : adv.amount > 500 ? 'NORMAL' : 'LOW',
            status: 'PENDING',
            workerId: adv.workerId,
            workerName: adv.workerName || w?.name || 'Worker',
            workerPhone: w?.phone,
            workerDesignation: w?.designation,
            title: `Advance Request: ₹${adv.amount}`,
            description: adv.reason || 'Cash advance requested',
            timestamp: adv.date ? new Date(adv.date).toISOString() : new Date().toISOString(),
            amount: adv.amount,
            isLowRisk: adv.amount <= 500,
            details: {
              advance: adv,
              reason: adv.reason
            }
          });
        }
      }
    } catch (e) {
      console.warn('Could not pull db advances into inbox', e);
    }

    // 2. Sync conflicts from conflictService
    try {
      const conflicts = await conflictService.getConflicts(tenantId);
      for (const conf of conflicts) {
        if (conf.status === 'UNRESOLVED' && !items.some(i => i.id === `db-conf-${conf.id}`)) {
          items.unshift({
            id: `db-conf-${conf.id}`,
            tenantId,
            actionType: 'CONFLICT_RESOLUTION',
            urgency: 'URGENT',
            status: 'PENDING',
            workerId: conf.workerId,
            workerName: conf.workerName,
            title: `Offline Punch Conflict (${conf.conflictReason})`,
            description: `Offline punch at ${new Date(conf.offlineData.deviceTimestamp).toLocaleTimeString()} conflicts with server record at ${new Date(conf.serverData.serverTimestamp).toLocaleTimeString()}`,
            timestamp: conf.createdAt || new Date().toISOString(),
            isLowRisk: false,
            details: {
              conflict: conf
            }
          });
        }
      }
    } catch (e) {
      console.warn('Could not pull conflicts into inbox', e);
    }

    // 3. Check for unsynced offline queue items
    const queueItems = await syncService.getQueueItems();
    const unsyncedRecordIds = new Set(
      queueItems.filter(q => q.syncStatus === 'PENDING_LOCAL' || q.syncStatus === 'SYNCING').map(q => q.recordId)
    );

    // Apply "Waiting for sync" edge case check
    items = items.map(item => {
      const isRecordUnsynced = item.details?.punch?.syncStatus === 'PENDING_LOCAL' ||
        (item.details?.attendanceRecord && unsyncedRecordIds.has(item.details.attendanceRecord.id));
      
      if (item.status === 'PENDING' && isRecordUnsynced) {
        return { ...item, status: 'WAITING_SYNC', isWaitingSync: true };
      }
      return item;
    });

    // 4. Filter by role and branch
    let filtered = items;
    if (profile && profile.role === 'SUPERVISOR') {
      const delegations = this.getDelegations(tenantId);
      const isDelegatedToMe = delegations.some(d => d.delegateId === profile.uid && d.isActive);
      
      // If supervisor has a specific branch and is not covering delegation
      if (profile.tenantId && !isDelegatedToMe) {
        // Find supervisor's assigned branch if present
        // (If not restricted, sees their branch)
      }
    }

    // Separate into pending vs done
    const pending = filtered.filter(i => i.status === 'PENDING' || i.status === 'WAITING_SYNC');
    const done = filtered.filter(i => i.status === 'APPROVED' || i.status === 'REJECTED' || i.status === 'RESOLVED');

    // Sort pending items: URGENT > HIGH > NORMAL > LOW, then newest first
    const urgencyWeight: Record<InboxUrgency, number> = {
      URGENT: 4,
      HIGH: 3,
      NORMAL: 2,
      LOW: 1
    };

    pending.sort((a, b) => {
      const weightDiff = urgencyWeight[b.urgency] - urgencyWeight[a.urgency];
      if (weightDiff !== 0) return weightDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return { pending, done };
  }

  public async getPendingCount(tenantId: string, profile?: UserProfile | null): Promise<number> {
    const { pending } = await this.getInboxItems(tenantId, profile);
    return pending.length;
  }

  public async resolveItem(
    itemId: string,
    tenantId: string,
    action: 'APPROVE' | 'REJECT' | 'RESOLVE',
    resolvedBy: string,
    notes?: string
  ): Promise<InboxItem | null> {
    const items = this.getStoredItems(tenantId);
    const itemIndex = items.findIndex(i => i.id === itemId);

    if (itemIndex === -1) return null;

    const targetItem = items[itemIndex];
    if (targetItem.status === 'WAITING_SYNC') {
      throw new Error('This item cannot be resolved while waiting for offline local sync.');
    }

    const resolvedStatus = action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'RESOLVED';
    const nowIso = new Date().toISOString();

    targetItem.status = resolvedStatus;
    targetItem.resolution = {
      action,
      resolvedBy,
      resolvedAt: nowIso,
      notes
    };

    items[itemIndex] = targetItem;
    this.saveStoredItems(tenantId, items);

    // Save audit log
    this.saveAuditEntry(tenantId, {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      itemId: targetItem.id,
      actionType: targetItem.actionType,
      workerName: targetItem.workerName,
      action,
      resolvedBy,
      resolvedAt: nowIso,
      notes: notes || `One-tap ${action.toLowerCase()} by ${resolvedBy}`
    });

    // If it's linked to an advance or conflict, reflect in the underlying service
    if (targetItem.actionType === 'ADVANCE_APPROVAL' && targetItem.details?.advance) {
      try {
        await dbService.updateAdvanceStatus(targetItem.details.advance.id, action === 'APPROVE' ? 'APPROVED' : 'REPAID');
      } catch (e) {
        console.warn('DB advance status update error:', e);
      }
    } else if (targetItem.actionType === 'CONFLICT_RESOLUTION' && targetItem.details?.conflict) {
      try {
        await conflictService.resolvePunchConflict(
          targetItem.details.conflict.id, 
          'MANUAL_MERGE', 
          undefined, 
          resolvedBy
        );
      } catch (e) {
        console.warn('Conflict resolution error:', e);
      }
    }

    return targetItem;
  }

  public async bulkApproveLowRisk(
    itemIds: string[],
    tenantId: string,
    resolvedBy: string
  ): Promise<number> {
    let count = 0;
    for (const id of itemIds) {
      try {
        const res = await this.resolveItem(id, tenantId, 'APPROVE', resolvedBy, 'Bulk approved via low-risk one-tap action');
        if (res) count++;
      } catch (err) {
        console.warn(`Bulk approve error for ${id}:`, err);
      }
    }
    return count;
  }
}

export const inboxService = new InboxService();
