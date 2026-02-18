// src/services/attendanceLogic.ts
import { AttendanceRecord, ShiftConfig, Punch } from '../types/index';

export const attendanceLogic = {
  
  /**
   * Calculates total hours based on Org Settings (Break Tracking ON/OFF)
   */
  calculateHours: (timeline: Punch[], breakTrackingEnabled: boolean): number => {
    if (!timeline || timeline.length === 0) return 0;

    // Sort punches by time
    const sorted = [...timeline].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const firstPunch = sorted[0];
    const lastPunch = sorted[sorted.length - 1];
    const now = new Date().getTime();

    // --- LOGIC 1: BREAK TRACKING OFF (Simple) ---
    // Work Time = Last Checkout (or Now) - First Checkin
    if (!breakTrackingEnabled) {
        const start = new Date(firstPunch.timestamp).getTime();
        
        let end = now; // Default to NOW if currently IN
        if (lastPunch.type === 'OUT') {
            end = new Date(lastPunch.timestamp).getTime();
        }

        const durationMs = end - start;
        return Math.max(0, durationMs / (1000 * 60 * 60)); // Return hours
    }

    // --- LOGIC 2: BREAK TRACKING ON (Advanced) ---
    // Work Time = Sum of all (OUT - IN) segments
    let totalMs = 0;
    let lastInTime: number | null = null;

    sorted.forEach(punch => {
      const time = new Date(punch.timestamp).getTime();
      
      if (punch.type === 'IN') {
        lastInTime = time;
      } else if (punch.type === 'OUT' && lastInTime !== null) {
        totalMs += (time - lastInTime);
        lastInTime = null; // Reset segment
      }
    });

    // If currently IN, add "Live" time
    if (lastInTime !== null) {
        totalMs += (now - lastInTime);
    }

    return totalMs / (1000 * 60 * 60);
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
    const firstPunch = record.timeline.find(p => p.type === 'IN');
    if (!firstPunch) return record; // No data

    // 2. Calculate Lateness
    const punchTime = new Date(firstPunch.timestamp);
    const [shiftHour, shiftMin] = shift.startTime.split(':').map(Number);
    const shiftStartTime = new Date(punchTime);
    shiftStartTime.setHours(shiftHour, shiftMin, 0, 0);

    const diffMs = punchTime.getTime() - shiftStartTime.getTime();
    const lateByMins = Math.max(0, Math.floor(diffMs / (1000 * 60)));

    let isLate = lateByMins > shift.gracePeriodMins;
    let penaltyApplied = false;

    // 3. Calculate Net Hours
    const netHours = attendanceLogic.calculateHours(record.timeline, breakTrackingEnabled);

    // 4. Determine Status (ADVANCED LOGIC)
    // < 4 hrs : ABSENT
    // 4 - 6 hrs : HALF DAY
    // > 6 hrs : PRESENT (FULL DAY)

    let status: 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'ON_LEAVE' = 'ABSENT';

    if (netHours < 4) {
        status = 'ABSENT'; 
    } else if (netHours >= 4 && netHours < 6) {
        status = 'HALF_DAY';
    } else {
        status = 'PRESENT';
    }

    // Grace Period Penalty Override
    // If they worked full day but were late too many times -> Downgrade to Half Day
    if (status === 'PRESENT' && isLate && lateCountThisMonth >= shift.maxGraceAllowed) {
        status = 'HALF_DAY';
        penaltyApplied = true;
    }

    // 5. Calculate Overtime
    const shiftDuration = parseInt(shift.endTime) - parseInt(shift.startTime);
    const overtime = Math.max(0, netHours - shiftDuration);

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
};