import { Worker, AttendanceRecord, DailyWageRecord, MonthlyPayroll, Advance} from '../types/index';

export const wageService = {

  // NEW: Helper to calculate currently earned wages mid-month (Used for Guardrail)
  calculateCurrentEarnings: (worker: Worker, monthStr: string, attendanceRecords: AttendanceRecord[]) => {
    const monthAttendance = attendanceRecords.filter(a => a.workerId === worker.id && a.date.startsWith(monthStr));
    let totalEarned = 0;
    monthAttendance.forEach(record => {
      const dw = wageService.calculateDailyWage(worker, record);
      totalEarned += dw.breakdown.total;
    });
    return totalEarned;
  },

  /**
   * Calculate earnings for a single day
   */
  calculateDailyWage: (worker: Worker, record: AttendanceRecord): DailyWageRecord => {
    // 1. Support both the NEW timeline 'hours' and OLD 'calculatedHours' for legacy records
    const netHours = record.hours?.net || record.calculatedHours?.netWorkingHours || 0;
    const otHours = record.hours?.overtime || record.calculatedHours?.overtimeHours || 0;

    const config = worker.wageConfig;
    
    // 2. Determine Daily Rate Dynamically based on the specific month
    let dailyRate = config.amount;
    if (config.type === 'MONTHLY') {
      const [yearStr, monthStr] = record.date.split('-');
      // new Date(year, month, 0) gives the exact number of days in that month!
      const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
      // Use explicit workingDaysPerMonth if set, otherwise fallback to exact calendar days (e.g., 28, 30, 31)
      dailyRate = config.amount / (config.workingDaysPerMonth || daysInMonth);
    }

    // 3. Calculate Base Wage
    let baseWage = 0;
    if (record.status === 'PRESENT') {
      baseWage = dailyRate;
    } else if (record.status === 'HALF_DAY') {
      baseWage = dailyRate * 0.5;
    }

    // 4. Calculate Overtime (Using the new Custom Rate we added)
    let overtimeWage = 0;
    if (config.overtimeEligible && otHours > 0) {
      // Use their custom OT Rate if you set one, otherwise fallback to standard double rate (Rate/8 * 2)
      const otRatePerHour = config.overtimeRatePerHour || ((dailyRate / 8) * 2);
      overtimeWage = otHours * otRatePerHour;
    }

    // 5. Calculate Allowances safely
    let totalAllowances = 0;
    if (record.status === 'PRESENT' || record.status === 'HALF_DAY') {
      totalAllowances += config.allowances?.travel || 0;
      totalAllowances += config.allowances?.food || 0;
      
      // Check if night shift applies using the new timeline array
      if (record.timeline && record.timeline.length > 0) {
        const lastPunch = record.timeline[record.timeline.length - 1];
        if (lastPunch.type === 'OUT') {
           const outHour = new Date(lastPunch.timestamp).getHours();
           if (outHour >= 22 || outHour < 5) {
             totalAllowances += config.allowances?.nightShift || 0;
           }
        }
      }
    }

    const totalEarning = baseWage + overtimeWage + totalAllowances;

    return {
      id: `wage_${record.id}`,
      tenantId: worker.tenantId,
      workerId: worker.id,
      date: record.date,
      attendanceId: record.id,
      breakdown: {
        baseWage: parseFloat(baseWage.toFixed(2)),
        overtimeWage: parseFloat(overtimeWage.toFixed(2)),
        allowances: parseFloat(totalAllowances.toFixed(2)),
        total: parseFloat(totalEarning.toFixed(2))
      },
      meta: {
        rateUsed: parseFloat(dailyRate.toFixed(2)),
        hoursWorked: netHours,
        overtimeHours: otHours,
        isOvertimeLimitExceeded: otHours > 4
      }
    };
  },

  /**
   * Generate exact monthly payroll data
   */
  generateMonthlyPayroll: (
    worker: Worker, 
    month: string, 
    attendanceRecords: AttendanceRecord[],
    advances: Advance[]
  ): MonthlyPayroll => {
    
    // Filter attendance records for this exact month and worker
    const monthAttendance = attendanceRecords.filter(a => a.workerId === worker.id && a.date.startsWith(month));
    
    let presentDays = 0;
    let halfDays = 0; 
    let absentDays = 0;
    let totalRegularHours = 0;
    let totalOvertimeHours = 0;
    
    let totalBasic = 0;
    let totalOTPay = 0;
    let totalAllowances = 0;

    monthAttendance.forEach(record => {
      // Re-calculate the exact financial implication of the record
      const dw = wageService.calculateDailyWage(worker, record);
      
      // FIX: Strictly align payroll counts with the Attendance Logic Engine
      if (record.status === 'PRESENT') {
          presentDays++;
      } else if (record.status === 'HALF_DAY') {
          halfDays++;
      } else if (record.status === 'ABSENT') {
          absentDays++;
      }

      totalBasic += dw.breakdown.baseWage;
      totalOTPay += dw.breakdown.overtimeWage;
      totalAllowances += dw.breakdown.allowances;
      
      totalRegularHours += dw.meta.hoursWorked - dw.meta.overtimeHours;
      totalOvertimeHours += dw.meta.overtimeHours;
    });

    const gross = totalBasic + totalOTPay + totalAllowances;

    // Deductions
    const monthAdvances = advances.filter(a => a.workerId === worker.id && a.date.startsWith(month) && a.status === 'APPROVED');
    let advanceTotal = 0;
    const deductionDetails: {description: string, amount: number}[] = [];

    monthAdvances.forEach(adv => {
        advanceTotal += adv.amount;
        deductionDetails.push({ description: `Advance (${adv.date})`, amount: adv.amount });
    });

    const totalDeductions = advanceTotal;

    // Dynamically calculate exact days for the selected month
    const [yearStr, monthStr] = month.split('-');
    const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
    const totalWorkingDays = worker.wageConfig.workingDaysPerMonth || daysInMonth;

    // Ensure missing calendar days without records are marked as Absent
    const missingDays = Math.max(0, totalWorkingDays - (presentDays + halfDays + absentDays));
    const finalAbsentDays = absentDays + missingDays;

    // NEW: Carry Forward Logic (If Advances taken exceed Gross Earned)
    const rawNetPayable = gross - totalDeductions;
    const carriedForwardAdvance = rawNetPayable < 0 ? Math.abs(rawNetPayable) : 0;
    const finalNetPayable = rawNetPayable < 0 ? 0 : rawNetPayable;

    return {
      id: `payroll_${worker.id}_${month}`,
      tenantId: worker.tenantId,
      workerId: worker.id,
      workerName: worker.name,
      workerDesignation: worker.designation,
      workerDepartment: worker.department,
      month,
      attendanceSummary: {
        totalDays: totalWorkingDays,
        presentDays,
        absentDays: finalAbsentDays,
        halfDays,
        totalRegularHours: parseFloat(totalRegularHours.toFixed(1)),
        totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(1))
      },
      earnings: {
        basic: parseFloat(totalBasic.toFixed(2)),
        overtime: parseFloat(totalOTPay.toFixed(2)),
        allowances: {
            travel: 0,
            food: 0,
            other: parseFloat(totalAllowances.toFixed(2))
        },
        gross: parseFloat(gross.toFixed(2))
      },
      deductions: {
        advances: advanceTotal,
        processingFee: 0,
        canteen: 0,
        total: totalDeductions,
        details: deductionDetails
      },
      netPayable: parseFloat(finalNetPayable.toFixed(2)),
      carriedForwardAdvance: parseFloat(carriedForwardAdvance.toFixed(2)),
      status: 'DRAFT'
    };
  }
};