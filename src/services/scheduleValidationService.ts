import { 
  RosterShift, 
  RosterSchedule,
  ScheduleConflict, 
  ScheduleValidationRulesConfig, 
  ScheduleOverrideAudit,
  ScheduleImpactAlert,
  DEFAULT_SCHEDULE_RULES_CONFIG
} from '../types/scheduleValidation';
import { Worker, OrgSettings, AttendanceRecord } from '../types/index';
import { tenantSecurityService } from './tenantSecurityService';
import { dbService } from './db';

export interface ValidationContext {
  rulesConfig?: ScheduleValidationRulesConfig;
  workers: Worker[];
  settings?: OrgSettings;
  attendanceHistory?: AttendanceRecord[];
  currentOverrides?: ScheduleOverrideAudit[];
  weekStartDate?: string;
  weekEndDate?: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Parses "YYYY-MM-DD" and "HH:mm" into a JavaScript Date object
 */
export function parseShiftDateTime(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

/**
 * Calculates duration in hours between start and end time (handling overnight shifts)
 */
export function calculateShiftDurationHours(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  
  let startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;
  
  if (endMinutes <= startMinutes) {
    // Overnight shift crossing midnight
    endMinutes += 24 * 60;
  }
  
  return parseFloat(((endMinutes - startMinutes) / 60).toFixed(1));
}

class ScheduleValidationService {
  private rulesConfigKey = 'workforce_schedule_rules_config';
  private overridesKey = 'workforce_schedule_overrides';
  private rostersKey = 'workforce_published_rosters';

  getRulesConfig(tenantId?: string): ScheduleValidationRulesConfig {
    try {
      const stored = localStorage.getItem(`${this.rulesConfigKey}_${tenantId || 'default'}`);
      if (stored) {
        return { ...DEFAULT_SCHEDULE_RULES_CONFIG, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('Failed to load rules config from storage, using defaults', e);
    }
    return DEFAULT_SCHEDULE_RULES_CONFIG;
  }

  saveRulesConfig(tenantId: string, config: ScheduleValidationRulesConfig): void {
    try {
      localStorage.setItem(`${this.rulesConfigKey}_${tenantId || 'default'}`, JSON.stringify(config));
    } catch (e) {
      console.error('Failed to save rules config', e);
    }
  }

  /**
   * Run comprehensive pre-publish validation on a set of shifts
   */
  validateRoster(shifts: RosterShift[], context: ValidationContext): ScheduleConflict[] {
    const rulesConfig = context.rulesConfig || this.getRulesConfig();
    const conflicts: ScheduleConflict[] = [];
    const workerMap = new Map<string, Worker>();
    context.workers.forEach(w => workerMap.set(w.id, w));

    const activeRules = rulesConfig.rules;
    const overrides = context.currentOverrides || [];
    const overrideMap = new Map<string, ScheduleOverrideAudit>();
    overrides.forEach(o => overrideMap.set(o.conflictId, o));

    // 1. Double-Booking Check: Worker assigned to overlapping shifts
    if (activeRules.DOUBLE_BOOKING?.enabled && activeRules.DOUBLE_BOOKING.severity !== 'IGNORE') {
      const assignedShifts = shifts.filter(s => s.assignedWorkerId);
      
      for (let i = 0; i < assignedShifts.length; i++) {
        for (let j = i + 1; j < assignedShifts.length; j++) {
          const shiftA = assignedShifts[i];
          const shiftB = assignedShifts[j];

          if (shiftA.assignedWorkerId === shiftB.assignedWorkerId) {
            // Check time overlap on same date or crossing midnight
            const startA = parseShiftDateTime(shiftA.date, shiftA.startTime);
            const durationA = shiftA.durationHours || calculateShiftDurationHours(shiftA.startTime, shiftA.endTime);
            const endA = new Date(startA.getTime() + durationA * 3600 * 1000);

            const startB = parseShiftDateTime(shiftB.date, shiftB.startTime);
            const durationB = shiftB.durationHours || calculateShiftDurationHours(shiftB.startTime, shiftB.endTime);
            const endB = new Date(startB.getTime() + durationB * 3600 * 1000);

            // Overlap condition: startA < endB && startB < endA
            if (startA < endB && startB < endA) {
              const conflictId = `conflict_db_${shiftA.id}_${shiftB.id}`;
              const worker = workerMap.get(shiftA.assignedWorkerId!);
              const existingOverride = overrideMap.get(conflictId);

              conflicts.push({
                id: conflictId,
                ruleKey: 'DOUBLE_BOOKING',
                severity: activeRules.DOUBLE_BOOKING.severity,
                title: `Double-Booking: ${shiftA.assignedWorkerName || worker?.name} assigned to overlapping shifts`,
                message: `${shiftA.assignedWorkerName || worker?.name} is scheduled for both "${shiftA.shiftName}" (${shiftA.startTime}-${shiftA.endTime}) and "${shiftB.shiftName}" (${shiftB.startTime}-${shiftB.endTime}) on ${shiftA.date}.`,
                shiftId: shiftA.id,
                shiftDate: shiftA.date,
                shiftName: shiftA.shiftName,
                shiftHours: durationA,
                workerId: shiftA.assignedWorkerId,
                workerName: shiftA.assignedWorkerName || worker?.name,
                details: {
                  conflictingShiftId: shiftB.id,
                  conflictingShiftName: shiftB.shiftName,
                  conflictingShiftDate: shiftB.date,
                },
                isOverridden: !!existingOverride,
                overrideReason: existingOverride?.reason,
                overriddenBy: existingOverride?.schedulerName,
                overriddenAt: existingOverride?.timestamp,
              });
            }
          }
        }
      }
    }

    // 2. Rest-Period Violation: Minimum rest turnaround between consecutive shifts
    if (activeRules.REST_PERIOD?.enabled && activeRules.REST_PERIOD.severity !== 'IGNORE') {
      const minRestHours = rulesConfig.minRestHours || 11;
      const workerShifts = new Map<string, RosterShift[]>();

      shifts.filter(s => s.assignedWorkerId).forEach(s => {
        const list = workerShifts.get(s.assignedWorkerId!) || [];
        list.push(s);
        workerShifts.set(s.assignedWorkerId!, list);
      });

      workerShifts.forEach((shiftsList, workerId) => {
        // Sort chronologically
        const sorted = [...shiftsList].sort((a, b) => {
          return parseShiftDateTime(a.date, a.startTime).getTime() - parseShiftDateTime(b.date, b.startTime).getTime();
        });

        for (let i = 0; i < sorted.length - 1; i++) {
          const prevShift = sorted[i];
          const nextShift = sorted[i + 1];

          const prevStart = parseShiftDateTime(prevShift.date, prevShift.startTime);
          const prevDuration = prevShift.durationHours || calculateShiftDurationHours(prevShift.startTime, prevShift.endTime);
          const prevEnd = new Date(prevStart.getTime() + prevDuration * 3600 * 1000);

          const nextStart = parseShiftDateTime(nextShift.date, nextShift.startTime);
          const restMillis = nextStart.getTime() - prevEnd.getTime();
          const restHours = restMillis / (1000 * 3600);

          if (restHours >= 0 && restHours < minRestHours) {
            const conflictId = `conflict_rest_${prevShift.id}_${nextShift.id}`;
            const worker = workerMap.get(workerId);
            const existingOverride = overrideMap.get(conflictId);

            conflicts.push({
              id: conflictId,
              ruleKey: 'REST_PERIOD',
              severity: activeRules.REST_PERIOD.severity,
              title: `Rest-Period Violation: ${restHours.toFixed(1)}h rest (Min ${minRestHours}h required)`,
              message: `${worker?.name || prevShift.assignedWorkerName} finishes "${prevShift.shiftName}" on ${prevShift.date} at ${prevShift.endTime} and starts "${nextShift.shiftName}" on ${nextShift.date} at ${nextShift.startTime}, providing only ${restHours.toFixed(1)} hours turnaround rest.`,
              shiftId: nextShift.id,
              shiftDate: nextShift.date,
              shiftName: nextShift.shiftName,
              shiftHours: nextShift.durationHours,
              workerId,
              workerName: worker?.name || prevShift.assignedWorkerName,
              details: {
                conflictingShiftId: prevShift.id,
                conflictingShiftName: prevShift.shiftName,
                conflictingShiftDate: prevShift.date,
                restHoursBetween: parseFloat(restHours.toFixed(1)),
                requiredRestHours: minRestHours,
              },
              isOverridden: !!existingOverride,
              overrideReason: existingOverride?.reason,
              overriddenBy: existingOverride?.schedulerName,
              overriddenAt: existingOverride?.timestamp,
            });
          }
        }
      });
    }

    // 3. Overtime Risk: Projected weekly hours (actual attendance already worked + scheduled)
    if (activeRules.OVERTIME_RISK?.enabled && activeRules.OVERTIME_RISK.severity !== 'IGNORE') {
      const thresholdHours = rulesConfig.weeklyOvertimeThresholdHours || 48;
      const workerTotalScheduled = new Map<string, number>();

      shifts.filter(s => s.assignedWorkerId).forEach(s => {
        const dur = s.durationHours || calculateShiftDurationHours(s.startTime, s.endTime);
        const curr = workerTotalScheduled.get(s.assignedWorkerId!) || 0;
        workerTotalScheduled.set(s.assignedWorkerId!, curr + dur);
      });

      // Factor actual attendance hours already worked this week
      const actualAttendanceHours = new Map<string, number>();
      if (context.attendanceHistory && context.attendanceHistory.length > 0) {
        context.attendanceHistory.forEach(rec => {
          if (rec.workerId) {
            let hoursWorked = 0;
            if (rec.hours?.net && rec.hours.net > 0) {
              hoursWorked = rec.hours.net;
            } else if (rec.hours?.gross && rec.hours.gross > 0) {
              hoursWorked = rec.hours.gross;
            } else if (rec.timeline && rec.timeline.length >= 2) {
              // Calculate from punch timeline
              const inPunch = rec.timeline.find(p => p.type === 'IN');
              const outPunch = rec.timeline.slice().reverse().find(p => p.type === 'OUT');
              if (inPunch && outPunch) {
                const diffMs = new Date(outPunch.timestamp).getTime() - new Date(inPunch.timestamp).getTime();
                hoursWorked = Math.max(0, diffMs / (1000 * 3600));
              }
            }
            const curr = actualAttendanceHours.get(rec.workerId) || 0;
            actualAttendanceHours.set(rec.workerId, curr + hoursWorked);
          }
        });
      }

      workerTotalScheduled.forEach((scheduledHours, workerId) => {
        const actualHours = actualAttendanceHours.get(workerId) || 0;
        const projectedTotal = actualHours + scheduledHours;

        if (projectedTotal > thresholdHours) {
          const worker = workerMap.get(workerId);
          // Flag on the shift(s) of this worker
          const workerShifts = shifts.filter(s => s.assignedWorkerId === workerId);
          const targetShift = workerShifts[workerShifts.length - 1] || workerShifts[0];

          if (targetShift) {
            const conflictId = `conflict_ot_${workerId}_${targetShift.id}`;
            const existingOverride = overrideMap.get(conflictId);
            const excessHours = projectedTotal - thresholdHours;

            conflicts.push({
              id: conflictId,
              ruleKey: 'OVERTIME_RISK',
              severity: activeRules.OVERTIME_RISK.severity,
              title: `Overtime Risk: Projected ${projectedTotal.toFixed(1)}h (Cap: ${thresholdHours}h)`,
              message: `${worker?.name || targetShift.assignedWorkerName} is projected for ${projectedTotal.toFixed(1)} total weekly hours (${actualHours.toFixed(1)}h actual attendance already worked + ${scheduledHours.toFixed(1)}h scheduled). Exceeds the ${thresholdHours}h limit by ${excessHours.toFixed(1)}h.`,
              shiftId: targetShift.id,
              shiftDate: targetShift.date,
              shiftName: targetShift.shiftName,
              shiftHours: targetShift.durationHours,
              workerId,
              workerName: worker?.name || targetShift.assignedWorkerName,
              details: {
                actualHoursWorked: parseFloat(actualHours.toFixed(1)),
                scheduledHoursWorked: parseFloat(scheduledHours.toFixed(1)),
                projectedTotalHours: parseFloat(projectedTotal.toFixed(1)),
                overtimeThreshold: thresholdHours,
              },
              isOverridden: !!existingOverride,
              overrideReason: existingOverride?.reason,
              overriddenBy: existingOverride?.schedulerName,
              overriddenAt: existingOverride?.timestamp,
            });
          }
        }
      });
    }

    // 4. Availability Mismatch: Shift scheduled on declared weekly off
    if (activeRules.AVAILABILITY_MISMATCH?.enabled && activeRules.AVAILABILITY_MISMATCH.severity !== 'IGNORE') {
      const defaultWeeklyOffs = context.settings?.weeklyOffs?.defaultDays || [0]; // Sunday default

      shifts.filter(s => s.assignedWorkerId).forEach(shift => {
        const worker = workerMap.get(shift.assignedWorkerId!);
        if (worker) {
          const shiftDateObj = new Date(shift.date + 'T12:00:00');
          const dayOfWeek = shiftDateObj.getDay();
          const effectiveOffDays = worker.weeklyOffOverride && worker.weeklyOffOverride.length > 0
            ? worker.weeklyOffOverride
            : defaultWeeklyOffs;

          if (effectiveOffDays.includes(dayOfWeek)) {
            const conflictId = `conflict_avail_${shift.id}_${worker.id}`;
            const existingOverride = overrideMap.get(conflictId);
            const dayName = DAY_NAMES[dayOfWeek];

            conflicts.push({
              id: conflictId,
              ruleKey: 'AVAILABILITY_MISMATCH',
              severity: activeRules.AVAILABILITY_MISMATCH.severity,
              title: `Availability Mismatch: Scheduled on ${dayName} (Declared Off Day)`,
              message: `${worker.name} has declared ${dayName} as their rest / weekly off day. A shift is assigned on ${shift.date}.`,
              shiftId: shift.id,
              shiftDate: shift.date,
              shiftName: shift.shiftName,
              shiftHours: shift.durationHours,
              workerId: worker.id,
              workerName: worker.name,
              details: {
                declaredOffDay: dayName,
              },
              isOverridden: !!existingOverride,
              overrideReason: existingOverride?.reason,
              overriddenBy: existingOverride?.schedulerName,
              overriddenAt: existingOverride?.timestamp,
            });
          }
        }
      });
    }

    // 5. Skill / Role Mismatch: Required skill vs worker designation
    if (activeRules.SKILL_MISMATCH?.enabled && activeRules.SKILL_MISMATCH.severity !== 'IGNORE') {
      shifts.filter(s => s.assignedWorkerId && s.requiredSkill).forEach(shift => {
        const worker = workerMap.get(shift.assignedWorkerId!);
        if (worker) {
          const required = (shift.requiredSkill || '').trim().toLowerCase();
          const workerDesignation = (worker.designation || '').trim().toLowerCase();
          const workerDept = (worker.department || '').trim().toLowerCase();

          const hasSkill = workerDesignation.includes(required) || 
                           workerDept.includes(required) || 
                           required.includes(workerDesignation);

          if (!hasSkill) {
            const conflictId = `conflict_skill_${shift.id}_${worker.id}`;
            const existingOverride = overrideMap.get(conflictId);

            conflicts.push({
              id: conflictId,
              ruleKey: 'SKILL_MISMATCH',
              severity: activeRules.SKILL_MISMATCH.severity,
              title: `Skill Mismatch: Requires "${shift.requiredSkill}"`,
              message: `${worker.name} is designated as "${worker.designation || 'General'}", but shift "${shift.shiftName}" mandates specialized qualification "${shift.requiredSkill}".`,
              shiftId: shift.id,
              shiftDate: shift.date,
              shiftName: shift.shiftName,
              shiftHours: shift.durationHours,
              workerId: worker.id,
              workerName: worker.name,
              details: {
                requiredSkill: shift.requiredSkill,
                workerSkill: worker.designation,
              },
              isOverridden: !!existingOverride,
              overrideReason: existingOverride?.reason,
              overriddenBy: existingOverride?.schedulerName,
              overriddenAt: existingOverride?.timestamp,
            });
          }
        }
      });
    }

    // 6. Open Shift / Coverage Gap: Shift has no assigned worker
    if (activeRules.COVERAGE_GAP?.enabled && activeRules.COVERAGE_GAP.severity !== 'IGNORE') {
      shifts.filter(s => !s.assignedWorkerId).forEach(shift => {
        const conflictId = `conflict_coverage_${shift.id}`;
        const existingOverride = overrideMap.get(conflictId);
        
        // Find how many workers have the required skill
        const qualifiedCount = shift.requiredSkill
          ? context.workers.filter(w => 
              (w.designation || '').toLowerCase().includes(shift.requiredSkill!.toLowerCase()) ||
              (w.department || '').toLowerCase().includes(shift.requiredSkill!.toLowerCase())
            ).length
          : context.workers.length;

        conflicts.push({
          id: conflictId,
          ruleKey: 'COVERAGE_GAP',
          severity: activeRules.COVERAGE_GAP.severity,
          title: `Coverage Gap: Open Shift without Worker`,
          message: `No worker assigned to "${shift.shiftName}" on ${shift.date} (${shift.startTime}-${shift.endTime}). ${qualifiedCount} qualified worker(s) in pool.`,
          shiftId: shift.id,
          shiftDate: shift.date,
          shiftName: shift.shiftName,
          shiftHours: shift.durationHours,
          details: {
            requiredSkill: shift.requiredSkill,
          },
          isOverridden: !!existingOverride,
          overrideReason: existingOverride?.reason,
          overriddenBy: existingOverride?.schedulerName,
          overriddenAt: existingOverride?.timestamp,
        });
      });
    }

    // 7. Public Holiday: Shift on gazetted holiday with premium-pay implication
    if (activeRules.PUBLIC_HOLIDAY?.enabled && activeRules.PUBLIC_HOLIDAY.severity !== 'IGNORE') {
      const holidays = context.settings?.holidays || [];
      const holidayMultiplier = context.settings?.holidayPayMultiplier || 2.0;

      shifts.forEach(shift => {
        const matchingHoliday = holidays.find(h => h.date === shift.date);
        if (matchingHoliday) {
          const conflictId = `conflict_holiday_${shift.id}`;
          const existingOverride = overrideMap.get(conflictId);

          conflicts.push({
            id: conflictId,
            ruleKey: 'PUBLIC_HOLIDAY',
            severity: activeRules.PUBLIC_HOLIDAY.severity,
            title: `Public Holiday: ${matchingHoliday.name} (${shift.date})`,
            message: `Shift "${shift.shiftName}" is scheduled on declared public holiday "${matchingHoliday.name}". Statutory premium overtime multiplier (${holidayMultiplier}x) applies.`,
            shiftId: shift.id,
            shiftDate: shift.date,
            shiftName: shift.shiftName,
            shiftHours: shift.durationHours,
            workerId: shift.assignedWorkerId,
            workerName: shift.assignedWorkerName,
            details: {
              holidayName: matchingHoliday.name,
              holidayMultiplier,
            },
            isOverridden: !!existingOverride,
            overrideReason: existingOverride?.reason,
            overriddenBy: existingOverride?.schedulerName,
            overriddenAt: existingOverride?.timestamp,
          });
        }
      });
    }

    return conflicts;
  }

  /**
   * One-Tap Resolution 1: Unassign Worker from Shift
   */
  unassignShift(shifts: RosterShift[], shiftId: string): RosterShift[] {
    return shifts.map(s => {
      if (s.id === shiftId) {
        return {
          ...s,
          assignedWorkerId: undefined,
          assignedWorkerName: undefined,
          workerDesignation: undefined,
        };
      }
      return s;
    });
  }

  /**
   * One-Tap Resolution 2: Swap / Assign Worker to Shift
   */
  swapWorker(shifts: RosterShift[], shiftId: string, newWorker: Worker): RosterShift[] {
    return shifts.map(s => {
      if (s.id === shiftId) {
        return {
          ...s,
          assignedWorkerId: newWorker.id,
          assignedWorkerName: newWorker.name,
          workerDesignation: newWorker.designation,
          department: newWorker.department,
        };
      }
      return s;
    });
  }

  /**
   * One-Tap Resolution 3: Record Override with Mandatory Reason in Audit Trail
   */
  async overrideConflict(
    tenantId: string,
    conflict: ScheduleConflict,
    reason: string,
    user: { uid: string; email?: string; companyName?: string }
  ): Promise<ScheduleOverrideAudit> {
    const auditRecord: ScheduleOverrideAudit = {
      id: `override_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId,
      conflictId: conflict.id,
      ruleKey: conflict.ruleKey,
      ruleName: conflict.title,
      shiftId: conflict.shiftId,
      workerId: conflict.workerId,
      workerName: conflict.workerName,
      schedulerUserId: user.uid,
      schedulerName: user.companyName || user.email || 'Scheduler Admin',
      reason: reason.trim(),
      timestamp: new Date().toISOString(),
    };

    // 1. Log in Tenant Security Service audit trail
    await tenantSecurityService.logTenantAccess({
      tenantId,
      userId: user.uid,
      userEmail: user.email || 'scheduler@factory.in',
      userRole: 'SCHEDULER',
      action: `SCHEDULE_OVERRIDE_${conflict.ruleKey}`,
      resource: `shifts/${conflict.shiftId}`,
      status: 'SUCCESS',
      details: {
        conflictId: conflict.id,
        ruleKey: conflict.ruleKey,
        shiftId: conflict.shiftId,
        workerName: conflict.workerName,
        reason: reason.trim(),
        severity: conflict.severity,
      }
    });

    // 2. Persist locally for immediate reactive UI
    const existing = this.getOverrides(tenantId);
    existing.push(auditRecord);
    try {
      localStorage.setItem(`${this.overridesKey}_${tenantId}`, JSON.stringify(existing));
    } catch (e) {
      console.warn('Failed to persist override locally', e);
    }

    return auditRecord;
  }

  getOverrides(tenantId: string): ScheduleOverrideAudit[] {
    try {
      const stored = localStorage.getItem(`${this.overridesKey}_${tenantId}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /**
   * Save / Publish Roster Schedule
   */
  async publishRoster(
    tenantId: string,
    roster: RosterSchedule,
    user: { uid: string; email?: string; companyName?: string }
  ): Promise<RosterSchedule> {
    const publishedRoster: RosterSchedule = {
      ...roster,
      status: 'PUBLISHED',
      publishedAt: new Date().toISOString(),
      publishedBy: user.companyName || user.email || 'Scheduler Admin',
      shifts: roster.shifts.map(s => ({ ...s, status: 'PUBLISHED' })),
      updatedAt: new Date().toISOString(),
    };

    // Save to localStorage
    const rosters = this.getAllRosters(tenantId);
    const existingIndex = rosters.findIndex(r => r.id === roster.id);
    if (existingIndex >= 0) {
      rosters[existingIndex] = publishedRoster;
    } else {
      rosters.push(publishedRoster);
    }
    localStorage.setItem(`${this.rostersKey}_${tenantId}`, JSON.stringify(rosters));

    // Audit trail
    await tenantSecurityService.logTenantAccess({
      tenantId,
      userId: user.uid,
      userEmail: user.email || 'scheduler@factory.in',
      userRole: 'SCHEDULER',
      action: 'ROSTER_PUBLISH',
      resource: `rosters/${roster.id}`,
      status: 'SUCCESS',
      details: {
        rosterId: roster.id,
        weekStartDate: roster.weekStartDate,
        shiftCount: roster.shifts.length,
        publishedBy: publishedRoster.publishedBy,
      }
    });

    // Also send an inbox notification
    try {
      await dbService.addNotification({
        tenantId,
        title: `Roster Published: ${roster.name}`,
        message: `Shift schedule successfully published with ${roster.shifts.length} assigned shifts.`,
        type: 'INFO',
        read: false,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Notification log skipped', e);
    }

    return publishedRoster;
  }

  getAllRosters(tenantId: string): RosterSchedule[] {
    try {
      const stored = localStorage.getItem(`${this.rostersKey}_${tenantId}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /**
   * Edge Case: Worker Availability Changes After Publish
   * Detects if an active published roster is impacted and triggers alert & notification
   */
  async handleWorkerAvailabilityChange(
    tenantId: string,
    worker: Worker,
    newOffDays: number[]
  ): Promise<ScheduleImpactAlert[]> {
    const rosters = this.getAllRosters(tenantId);
    const published = rosters.filter(r => r.status === 'PUBLISHED' || r.status === 'IMPACTED');
    const newAlerts: ScheduleImpactAlert[] = [];

    published.forEach(roster => {
      let isRosterImpacted = false;
      roster.shifts.forEach(shift => {
        if (shift.assignedWorkerId === worker.id) {
          const shiftDateObj = new Date(shift.date + 'T12:00:00');
          const dayOfWeek = shiftDateObj.getDay();

          if (newOffDays.includes(dayOfWeek)) {
            isRosterImpacted = true;
            const dayName = DAY_NAMES[dayOfWeek];
            const alert: ScheduleImpactAlert = {
              id: `alert_${Date.now()}_${shift.id}`,
              tenantId,
              workerId: worker.id,
              workerName: worker.name,
              shiftId: shift.id,
              shiftDate: shift.date,
              shiftName: shift.shiftName,
              conflictType: 'AVAILABILITY_CHANGED',
              message: `${worker.name} changed availability: ${dayName} (${shift.date}) is now declared off, but is scheduled on published roster "${roster.name}".`,
              detectedAt: new Date().toISOString(),
              resolved: false,
            };
            newAlerts.push(alert);
            roster.impactAlerts = [...(roster.impactAlerts || []), alert];
          }
        }
      });

      if (isRosterImpacted) {
        roster.status = 'IMPACTED';
      }
    });

    if (newAlerts.length > 0) {
      localStorage.setItem(`${this.rostersKey}_${tenantId}`, JSON.stringify(rosters));
      
      // Route notification to scheduler
      try {
        await dbService.addNotification({
          tenantId,
          title: `Schedule Impacted: ${worker.name}`,
          message: `${newAlerts.length} published shift(s) affected by availability changes for ${worker.name}.`,
          type: 'WARNING',
          read: false,
          createdAt: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('Notification failed', e);
      }
    }

    return newAlerts;
  }
}

export const scheduleValidationService = new ScheduleValidationService();
