import { InboxItem, InboxAuditEntry, InboxUrgency, InboxActionType, UserProfile, Role, Worker, Punch, AttendanceRecord, Advance, EwaTimelineStage, EwaDetails } from '../types/index';
import { dbService } from './db';
import { conflictService } from './conflictService';
import { syncService } from './syncService';

const INBOX_LOCAL_STORAGE_KEY = 'workforce_inbox_items_v2';
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
    const ramesh =
      workers.find((w) => w.name.toLowerCase().startsWith('ramesh')) ||
      workers[0] ||
      { id: 'worker-1', name: 'Ramesh Sharma', phone: '9876543210', designation: 'CNC Operator', branchId: 'main' };
    const suresh =
      workers.find((w) => w.name.toLowerCase().startsWith('suresh')) ||
      { id: 'worker-suresh', name: 'Suresh Patel', phone: '9876543219', designation: 'Machine Helper', branchId: 'main' };
    const vikram =
      workers.find((w) => w.name.toLowerCase().startsWith('vikram')) ||
      workers[5] ||
      { id: 'worker-6', name: 'Vikram Desai', phone: '9876543215', designation: 'Packer & Dispatch', branchId: 'main' };
    const amit =
      workers.find((w) => w.name.toLowerCase().startsWith('amit')) ||
      workers[2] ||
      { id: 'worker-3', name: 'Amit Kumar', phone: '9876543212', designation: 'Field Technician', branchId: 'north' };
    const priya =
      workers.find((w) => w.name.toLowerCase().startsWith('priya')) ||
      workers[1] ||
      { id: 'worker-2', name: 'Priya Patel', phone: '9876543211', designation: 'Quality Inspector', branchId: 'main' };

    const initial: InboxItem[] = [
      {
        id: `inbox-geo-ramesh-1`,
        tenantId,
        branchId: ramesh.branchId,
        actionType: 'ATTENDANCE_EXCEPTION',
        urgency: 'HIGH',
        status: 'PENDING',
        workerId: ramesh.id,
        workerName: ramesh.name,
        workerPhone: ramesh.phone,
        workerDesignation: ramesh.designation,
        title: `Ramesh punched in 2km away from the site.`,
        description: `Recorded at 9:05 AM • General Shift`,
        timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
        isLowRisk: false,
        details: {
          geofenceViolation: true,
          distanceMeters: 2000,
          gpsAccuracyMeters: 16,
          isMockGps: false,
          siteName: 'GIDC Industrial Estate, Shed 4',
          baseLocation: { lat: 23.0225, lng: 72.5714, radius: 100, address: 'GIDC Industrial Estate, Shed 4, Ahmedabad' },
          punchLocation: { lat: 23.0405, lng: 72.5721 },
          deviceModel: 'Samsung Galaxy A14',
          deviceOs: 'Android 14',
          shiftName: 'General Shift (09:00 - 18:00)',
          punch: {
            timestamp: `${todayStr}T09:05:12.000Z`,
            type: 'IN',
            device: 'Mobile App (PWA)',
            isOutOfGeofence: true,
            location: { lat: 23.0405, lng: 72.5721 }
          },
          punchHistory: [
            { timestamp: `${todayStr}T09:05:12.000Z`, type: 'IN', device: 'Samsung Galaxy A14', isOutOfGeofence: true }
          ]
        }
      },
      {
        id: `inbox-root-suresh-1`,
        tenantId,
        branchId: suresh.branchId,
        actionType: 'ATTENDANCE_EXCEPTION',
        urgency: 'URGENT',
        status: 'PENDING',
        workerId: suresh.id,
        workerName: suresh.name,
        workerPhone: suresh.phone,
        workerDesignation: suresh.designation,
        title: `Suresh's device was rooted (unsafe).`,
        description: `Punch flagged for security review at 9:12 AM.`,
        timestamp: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
        isLowRisk: false,
        details: {
          isRootedDevice: true,
          deviceIntegrityFailed: true,
          isMockGps: false,
          gpsAccuracyMeters: 12,
          deviceModel: 'Redmi Note 11 (Magisk v27)',
          deviceOs: 'Android 13 • Bootloader Unlocked',
          deviceFingerprint: 'fp_98a4c1e0b7f231d9',
          attestationSummary: 'Play Integrity: MEETS_DEVICE_INTEGRITY = FAILED (Root binary detected)',
          siteName: 'GIDC Industrial Estate, Shed 4',
          baseLocation: { lat: 23.0225, lng: 72.5714, radius: 100, address: 'GIDC Industrial Estate, Shed 4, Ahmedabad' },
          punchLocation: { lat: 23.0228, lng: 72.5716 },
          shiftName: 'General Shift (09:00 - 18:00)',
          reason: 'Rooted device detected during punch attestation',
          punch: {
            timestamp: `${todayStr}T09:12:40.000Z`,
            type: 'IN',
            device: 'Redmi Note 11',
            location: { lat: 23.0228, lng: 72.5716 }
          },
          punchHistory: [
            { timestamp: `${todayStr}T09:12:40.000Z`, type: 'IN', device: 'Redmi Note 11 (Rooted)' }
          ]
        }
      },
      {
        id: `inbox-ot-vikram-1`,
        tenantId,
        branchId: vikram.branchId,
        actionType: 'OVERTIME_APPROVAL',
        urgency: 'NORMAL',
        status: 'PENDING',
        workerId: vikram.id,
        workerName: vikram.name,
        workerPhone: vikram.phone,
        workerDesignation: vikram.designation,
        title: `Vikram worked 2 hours extra — 1.5x Overtime (₹300)`,
        description: `2 hours overtime after General Shift. Approve to include ₹300 in payroll.`,
        timestamp: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
        amount: 300,
        isLowRisk: false,
        details: {
          overtimeHours: 2,
          overtimeMultiplier: 1.5,
          overtimeHourlyRate: 100,
          overtimePayableAmount: 300,
          shiftName: 'General Shift (09:00 - 18:00)',
          shiftStartTime: '09:00 AM',
          shiftEndTime: '06:00 PM',
          actualPunchOutTime: '08:00 PM',
          siteName: 'GIDC Industrial Estate, Shed 4',
          baseLocation: { lat: 23.0225, lng: 72.5714, radius: 100, address: 'GIDC Industrial Estate, Shed 4, Ahmedabad' },
          punchLocation: { lat: 23.0226, lng: 72.5713 },
          gpsAccuracyMeters: 9,
          punchHistory: [
            { timestamp: `${todayStr}T08:57:00.000Z`, type: 'IN', device: 'Main Gate Kiosk' },
            { timestamp: `${todayStr}T20:01:00.000Z`, type: 'OUT', device: 'Main Gate Kiosk' }
          ]
        }
      },
      {
        id: `inbox-mockgps-amit-1`,
        tenantId,
        branchId: amit.branchId,
        actionType: 'ATTENDANCE_EXCEPTION',
        urgency: 'URGENT',
        status: 'PENDING',
        workerId: amit.id,
        workerName: amit.name,
        workerPhone: amit.phone,
        workerDesignation: amit.designation,
        title: `Amit used a fake GPS app while punching in (1.9km away from the site).`,
        description: `Location spoofing was detected at 9:18 AM • Field Shift.`,
        timestamp: new Date(Date.now() - 52 * 60 * 1000).toISOString(),
        isLowRisk: false,
        details: {
          isMockGps: true,
          geofenceViolation: true,
          distanceMeters: 1850,
          gpsAccuracyMeters: 0.5,
          deviceModel: 'Poco M5',
          deviceOs: 'Android 13 • Mock Location Provider Active',
          deviceFingerprint: 'fp_77e1a2b4c9d0318a',
          attestationSummary: 'Mock Location Flag = TRUE (Fake GPS Joystick detected; GPS accuracy 0.5m synthetic)',
          siteName: 'Anand Manufacturing Unit',
          baseLocation: { lat: 22.5645, lng: 72.9289, radius: 150, address: 'Anand Manufacturing Unit, Plot 12' },
          punchLocation: { lat: 22.5811, lng: 72.9312 },
          shiftName: 'Field Shift (09:00 - 18:00)',
          punch: {
            timestamp: `${todayStr}T09:18:22.000Z`,
            type: 'IN',
            device: 'Poco M5',
            isOutOfGeofence: true,
            location: { lat: 22.5811, lng: 72.9312 }
          },
          punchHistory: [
            { timestamp: `${todayStr}T09:18:22.000Z`, type: 'IN', device: 'Poco M5 (Mock GPS)', isOutOfGeofence: true }
          ]
        }
      },
      {
        id: `inbox-adv-1`,
        tenantId,
        branchId: priya.branchId,
        actionType: 'ADVANCE_APPROVAL',
        urgency: 'LOW',
        status: 'PENDING',
        workerId: priya.id,
        workerName: priya.name,
        workerPhone: priya.phone,
        workerDesignation: priya.designation,
        title: `Advance Request: ₹350`,
        description: `Requested travel allowance for evening conveyance.`,
        timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
        amount: 350,
        isLowRisk: true,
        details: {
          reason: 'Evening travel conveyance',
          punchHistory: [
            { timestamp: `${todayStr}T08:55:00.000Z`, type: 'IN', device: 'Main Gate Kiosk' }
          ]
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

    let didMutate = false;

    // 1. Sync live database advances
    try {
      const advances = await dbService.getAdvances(tenantId);
      for (const adv of advances) {
        if (adv.status === 'PENDING' && !items.some(i => i.id === `db-adv-${adv.id}`)) {
          didMutate = true;
          const w = workers.find(x => x.id === adv.workerId);
          const isEwa = Boolean(adv.isEwa);
          const ewaDetails = adv.ewaDetails;
          const isFnF = Boolean(w?.dateOfExit || ewaDetails?.isFnFSettlement);
          const refCode = adv.id.slice(-6).toUpperCase();

          const title = isEwa 
            ? `EWA Withdrawal: ₹${adv.amount.toLocaleString()}`
            : `Advance Request: ₹${adv.amount}`;

          const description = isEwa
            ? (isFnF 
                ? `[Full & Final Settlement] EWA withdrawal of ₹${adv.amount} (${adv.reason || 'Earned wage access'})`
                : `Earned Wage Access withdrawal request of ₹${adv.amount} (${adv.reason || 'Earned wage access'})`)
            : (adv.reason || 'Cash advance requested');

          const currentAccrual = ewaDetails?.netAccruedBalance ?? (adv.amount * 2);
          const remainingAccrual = Math.max(0, currentAccrual - adv.amount);

          const deductionLineItem = isFnF
            ? `Full & Final Settlement: EWA Recovery (${adv.date}) [Ref: ${refCode}]`
            : `Earned Wage Access (${adv.date}) [Ref: ${refCode}]`;

          items.unshift({
            id: `db-adv-${adv.id}`,
            tenantId,
            branchId: w?.branchId,
            actionType: 'ADVANCE_APPROVAL',
            urgency: isEwa ? (adv.amount > 2000 ? 'HIGH' : 'NORMAL') : (adv.amount > 2000 ? 'HIGH' : adv.amount > 500 ? 'NORMAL' : 'LOW'),
            status: 'PENDING',
            workerId: adv.workerId,
            workerName: adv.workerName || w?.name || 'Worker',
            workerPhone: w?.phone,
            workerDesignation: w?.designation,
            title,
            description,
            timestamp: adv.date ? new Date(adv.date).toISOString() : new Date().toISOString(),
            amount: adv.amount,
            isLowRisk: !isEwa && adv.amount <= 500,
            details: {
              advance: adv,
              reason: adv.reason,
              isEwa,
              ewaDetails,
              accruedBalance: currentAccrual,
              payrollImpact: {
                currentNetAccrual: currentAccrual,
                withdrawalAmount: adv.amount,
                remainingAccrual,
                estimatedUpcomingPayslipNet: remainingAccrual,
                deductionLineItem,
                isFnF
              }
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
          didMutate = true;
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

    // 2.5 Sync live overtime attendance records from today into Overtime Approval cards
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const allAttendance = await dbService.getAttendanceHistory(tenantId);
      const todayAttendance = allAttendance.filter((att) => att.date === todayStr);
      for (const att of todayAttendance) {
        const rawOvertime = att.hours?.overtime || 0;
        if (rawOvertime > 0 && !items.some((i) => i.id === `db-ot-${att.id}`)) {
          const w = workers.find((x) => x.id === att.workerId);
          // Skip if there is already an overtime inbox item for this worker today
          const alreadyHasOtForWorker = items.some(
            (i) => i.actionType === 'OVERTIME_APPROVAL' && i.workerId === att.workerId
          );
          if (alreadyHasOtForWorker) continue;

          const otHours = Number(rawOvertime.toFixed(1));
          const multiplier = 1.5;
          const monthlyWage =
            w?.wageConfig?.type === 'DAILY'
              ? (w.wageConfig.amount || 800) * (w.wageConfig.dailyMultiplier || 26)
              : w?.wageConfig?.amount || 20800;
          const derivedHourlyRate =
            w?.wageConfig?.overtimeRatePerHour && w.wageConfig.overtimeRatePerHour > 0
              ? Math.round(w.wageConfig.overtimeRatePerHour / multiplier)
              : Math.max(75, Math.round(monthlyWage / (26 * 8)));
          const payableAmount = Math.round(otHours * derivedHourlyRate * multiplier);
          const firstName = (w?.name || 'Worker').split(' ')[0];
          const punches = att.timeline || [];

          didMutate = true;
          items.unshift({
            id: `db-ot-${att.id}`,
            tenantId,
            branchId: w?.branchId,
            actionType: 'OVERTIME_APPROVAL',
            urgency: 'NORMAL',
            status: 'PENDING',
            workerId: att.workerId,
            workerName: w?.name || 'Worker',
            workerPhone: w?.phone,
            workerDesignation: w?.designation,
            title: `${firstName} worked ${otHours} ${otHours === 1 ? 'hour' : 'hours'} extra — ${multiplier}x Overtime (₹${payableAmount.toLocaleString('en-IN')})`,
            description: `Approve to include ₹${payableAmount.toLocaleString('en-IN')} overtime in payroll.`,
            timestamp: punches[punches.length - 1]?.timestamp || new Date().toISOString(),
            amount: payableAmount,
            isLowRisk: false,
            details: {
              attendanceRecord: att,
              overtimeHours: otHours,
              overtimeMultiplier: multiplier,
              overtimeHourlyRate: derivedHourlyRate,
              overtimePayableAmount: payableAmount,
              punchHistory: punches
            }
          });
        }
      }
    } catch (e) {
      console.warn('Could not sync overtime attendance into inbox', e);
    }

    if (didMutate) {
      this.saveStoredItems(tenantId, items);
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
        const adv = targetItem.details.advance;
        if (adv.isEwa) {
          const newStage: EwaTimelineStage = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
          const currentTimeline = adv.ewaDetails?.timelineHistory || [];
          const updatedDetails: EwaDetails = {
            ...(adv.ewaDetails || {
              grossEarnedAccrued: targetItem.details.accruedBalance || adv.amount * 2,
              statutoryDeductionsEstimate: 0,
              existingAdvancesDeduction: 0,
              netAccruedBalance: targetItem.details.accruedBalance || adv.amount * 2,
              maxAllowedAmount: adv.amount * 2,
              requestedAmount: adv.amount,
              feeAmount: 19,
              netDisbursalAmount: Math.max(0, adv.amount - 19),
              timelineStage: newStage,
              timelineHistory: []
            }),
            timelineStage: newStage,
            timelineHistory: [
              ...currentTimeline,
              {
                stage: newStage,
                timestamp: nowIso,
                actor: resolvedBy,
                notes: notes || `One-tap ${action.toLowerCase()} via Action Inbox`
              }
            ]
          };
          const updatedAdv: Advance = {
            ...adv,
            status: action === 'APPROVE' ? 'APPROVED' as const : 'REJECTED' as const,
            repaid: false,
            ewaDetails: updatedDetails
          };
          await dbService.updateAdvanceRecord(updatedAdv);
        } else {
          await dbService.updateAdvanceStatus(targetItem.details.advance.id, action === 'APPROVE' ? 'APPROVED' : 'REPAID');
        }
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

  public async createCustomItem(tenantId: string, item: InboxItem): Promise<InboxItem> {
    const items = this.getStoredItems(tenantId);
    // Don't duplicate if already present
    const existingIdx = items.findIndex(i => i.id === item.id);
    if (existingIdx >= 0) {
      items[existingIdx] = item;
    } else {
      items.unshift(item);
    }
    this.saveStoredItems(tenantId, items);
    return item;
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
