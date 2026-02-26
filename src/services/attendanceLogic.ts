// src/services/attendanceLogic.ts
import { AttendanceRecord, ShiftConfig, Punch } from '../types/index';

export const attendanceLogic = {
  
  /**
   * Calculates total hours based on actual punched segments (IN to OUT)
   * This ensures gaps between check-outs and check-ins are NEVER counted as work time.
   */
  calculateHours: (timeline: Punch[], breakTrackingEnabled: boolean): number => {
    if (!timeline || timeline.length === 0) return 0;

    // Sort punches chronologically
    const sorted = [...timeline].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const now = new Date().getTime();

    // Work Time = Sum of all actual (OUT - IN) segments
    let totalMs = 0;
    let lastInTime: number | null = null;

    sorted.forEach(punch => {
      const time = new Date(punch.timestamp).getTime();
      
      if (punch.type === 'IN') {
        // Prevent accidental double-INs from resetting the timer
        if (lastInTime === null) {
          lastInTime = time;
        }
      } else if (punch.type === 'OUT' && lastInTime !== null) {
        // Add the segment time and reset
        totalMs += (time - lastInTime);
        lastInTime = null; 
      }
    });

    // If the worker is currently checked IN (no OUT punch yet), add the "Live" time up to right now
    if (lastInTime !== null) {
        totalMs += (now - lastInTime);
    }

    return Math.max(0, totalMs / (1000 * 60 * 60)); // Return exact hours
  },

  /**
   * The Master Function: Decides Status based on Logic Rules
   */
  processDailyStatus: (
    record: AttendanceRecord, 
    shift: ShiftConfig, 
    lateCountThisMonth: number,
    breakTrackingEnabled: boolean
  ): AttendanceRecord => {
    
    // 1. Get First Punch
    const firstPunch = record.timeline?.find(p => p.type === 'IN');
    
    // FIX: If timeline is empty or no IN punch, fully reset the status
    if (!firstPunch) {
        return {
            ...record,
            status: 'ABSENT',
            lateStatus: { isLate: false, lateByMins: 0, penaltyApplied: false },
            hours: { gross: 0, net: 0, overtime: 0 }
        };
    }

    // 2. Calculate Lateness
    const punchTime = new Date(firstPunch.timestamp);
    const [shiftHour, shiftMin] = shift.startTime.split(':').map(Number);
    const shiftStartTime = new Date(punchTime);
    shiftStartTime.setHours(shiftHour, shiftMin, 0, 0);

    const diffMs = punchTime.getTime() - shiftStartTime.getTime();
    const lateByMins = Math.max(0, Math.floor(diffMs / (1000 * 60)));

    let isLate = lateByMins > (shift.gracePeriodMins || 15);
    let penaltyApplied = false;

    // 3. Calculate exact Net Hours based on punches
    const netHours = attendanceLogic.calculateHours(record.timeline, breakTrackingEnabled);

    // 4. Determine Status (ADVANCED LOGIC)
    let status: 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'ON_LEAVE' = 'ABSENT';

    if (netHours < 4) {
        status = 'ABSENT'; 
    } else if (netHours >= 4 && netHours < 6) {
        status = 'HALF_DAY';
    } else {
        status = 'PRESENT';
    }

    // Grace Period Penalty Override
    if (status === 'PRESENT' && isLate && lateCountThisMonth >= (shift.maxGraceAllowed || 3)) {
        status = 'HALF_DAY';
        penaltyApplied = true;
    }

    // 5. Calculate Exact Shift Duration safely
    const [endH, endM] = shift.endTime.split(':').map(Number);
    let shiftDurationMins = (endH * 60 + endM) - (shiftHour * 60 + shiftMin);
    if (shiftDurationMins < 0) shiftDurationMins += 24 * 60; // Handle overnight shifts safely
    const shiftDurationHours = shiftDurationMins / 60;

    // --- NEW: CALCULATE OVERTIME WITH THRESHOLD ---
    const extraHours = Math.max(0, netHours - shiftDurationHours);
    const minOtThresholdHours = (shift.minOvertimeMins || 0) / 60;
    
    let overtime = 0;
    if (extraHours >= minOtThresholdHours) {
        overtime = extraHours; 
    }

    return {
      ...record,
      status: status,
      lateStatus: {
        isLate,
        lateByMins,
        penaltyApplied
      },
      hours: {
        gross: netHours, 
        net: parseFloat(netHours.toFixed(2)),
        overtime: parseFloat(overtime.toFixed(2))
      }
    };
  }
}