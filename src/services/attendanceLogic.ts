// src/services/attendanceLogic.ts
import { AttendanceRecord, ShiftConfig } from '../types/index';

export const attendanceLogic = {
  
  /**
   * Calculates total hours worked from a timeline of punches
   */
  calculateHours: (timeline: { timestamp: string, type: 'IN' | 'OUT' }[]) => {
    let totalMs = 0;
    let lastIn: number | null = null;

    // Sort by time just in case
    const sorted = [...timeline].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    sorted.forEach(punch => {
      const time = new Date(punch.timestamp).getTime();
      
      if (punch.type === 'IN') {
        lastIn = time;
      } else if (punch.type === 'OUT' && lastIn !== null) {
        totalMs += (time - lastIn);
        lastIn = null;
      }
    });

    // If they are currently IN (forgot to punch out), we calculate up to NOW (for live view) 
    // or ignore the last segment (for final report). Let's ignore open segments for payroll safety.
    
    return totalMs / (1000 * 60 * 60); // Return hours
  },

  /**
   * The Master Function: Decides if Late, Half Day, etc.
   */
  processDailyStatus: (
    record: AttendanceRecord, 
    shift: ShiftConfig, 
    lateCountThisMonth: number // Passed from DB
  ): AttendanceRecord => {
    
    // 1. Get First Punch
    const firstPunch = record.timeline.find(p => p.type === 'IN');
    if (!firstPunch) return record; // No data

    // 2. Calculate Timings
    const punchTime = new Date(firstPunch.timestamp);
    const [shiftHour, shiftMin] = shift.startTime.split(':').map(Number);
    
    const shiftStartTime = new Date(punchTime);
    shiftStartTime.setHours(shiftHour, shiftMin, 0, 0);

    const diffMs = punchTime.getTime() - shiftStartTime.getTime();
    const lateByMins = Math.max(0, Math.floor(diffMs / (1000 * 60)));

    // 3. Check Grace Period & Penalty
    let isLate = false;
    let penaltyApplied = false;
    let status = record.status;

    // Logic: If late > 15 mins (Grace)
    if (lateByMins > shift.gracePeriodMins) {
       isLate = true;
    }

    // Logic: "Plus or minus allowance for 3 times a month"
    // If they are late, and they have already used up their 3 allowed lates...
    if (isLate && lateCountThisMonth >= shift.maxGraceAllowed) {
        status = 'HALF_DAY'; // Auto-penalty
        penaltyApplied = true;
    }

    // 4. Calculate Hours
    const netHours = attendanceLogic.calculateHours(record.timeline);
    
    // Logic: If hours < minHalfDayHours (e.g. 4), force Half Day or Absent
    if (netHours < shift.minHalfDayHours) {
        status = netHours < 2 ? 'ABSENT' : 'HALF_DAY';
    } else if (!penaltyApplied) {
        status = 'PRESENT';
    }

    // 5. Calculate Overtime
    const shiftDuration = parseInt(shift.endTime) - parseInt(shift.startTime); // Rough calc
    const overtime = Math.max(0, netHours - shiftDuration);

    return {
      ...record,
      status: status as any,
      lateStatus: {
        isLate,
        lateByMins,
        penaltyApplied
      },
      hours: {
        gross: netHours, // Simplified for MVP
        net: parseFloat(netHours.toFixed(2)),
        overtime: parseFloat(overtime.toFixed(2))
      }
    };
  }
};