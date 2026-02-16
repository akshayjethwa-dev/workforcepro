import { Worker, AttendanceRecord, DailyWageRecord, MonthlyPayroll, Advance, ComplianceReport } from '../types';

export const wageService = {
  /**
   * Calculate earnings for a single day based on attendance and worker config
   */
  calculateDailyWage: (worker: Worker, record: AttendanceRecord): DailyWageRecord => {
    const hours = record.calculatedHours || { netWorkingHours: 0, overtimeHours: 0 };
    const config = worker.wageConfig;
    
    // 1. Determine Daily Rate
    let dailyRate = config.amount;
    if (config.type === 'MONTHLY') {
      dailyRate = config.amount / (config.workingDaysPerMonth || 26);
    }

    // 2. Calculate Base Wage
    let baseWage = 0;
    if (record.status === 'PRESENT') {
      baseWage = dailyRate;
    } else if (record.status === 'HALF_DAY') {
      baseWage = dailyRate * 0.5;
    }

    // 3. Calculate Overtime
    let overtimeWage = 0;
    let otHours = 0;
    if (config.overtimeEligible && hours.overtimeHours > 0) {
      otHours = hours.overtimeHours;
      const hourlyRate = dailyRate / 8;
      const otRate = hourlyRate * 2; // Double rate for OT
      overtimeWage = otHours * otRate;
    }

    // 4. Calculate Allowances
    // Logic: If present (even half day), give travel/food. 
    // Night shift is conditional (mocked logic: if outTime > 22:00)
    let totalAllowances = 0;
    if (record.status === 'PRESENT' || record.status === 'HALF_DAY') {
      totalAllowances += config.allowances.travel || 0;
      totalAllowances += config.allowances.food || 0;
      
      // Simple check for night shift allowance
      if (record.outTime) {
        const outHour = new Date(record.outTime.timestamp).getHours();
        if (outHour >= 22 || outHour < 5) {
          totalAllowances += config.allowances.nightShift || 0;
        }
      }
    }

    const totalEarning = baseWage + overtimeWage + totalAllowances;

    return {
      id: `wage_${record.id}`,
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
        hoursWorked: hours.netWorkingHours || 0,
        overtimeHours: otHours,
        isOvertimeLimitExceeded: otHours > 2 // Flag if > 2 hours/day
      }
    };
  },

  /**
   * Validate Overtime Compliance
   */
  checkCompliance: (dailyWages: DailyWageRecord[]): ComplianceReport => {
    const violations: string[] = [];
    let totalWeeklyOT = 0; // Mock: assumes input is a week's worth

    dailyWages.forEach(w => {
      if (w.meta.overtimeHours > 2) {
        violations.push(`Daily OT limit exceeded on ${w.date} (${w.meta.overtimeHours} hrs)`);
      }
      totalWeeklyOT += w.meta.overtimeHours;
    });

    if (totalWeeklyOT > 60) {
      violations.push(`Weekly work hours limit exceeded (Total: ${totalWeeklyOT})`);
    }

    return {
      compliant: violations.length === 0,
      violations,
      recommendation: violations.length > 0 ? "Reduce OT hours or hire additional shift workers." : undefined
    };
  },

  /**
   * Generate Monthly Payroll Object
   */
  generateMonthlyPayroll: (
    worker: Worker, 
    month: string, // YYYY-MM
    dailyWages: DailyWageRecord[],
    advances: Advance[]
  ): MonthlyPayroll => {
    // Filter records for this month
    const monthWages = dailyWages.filter(w => w.date.startsWith(month));
    
    // Initialize Summary
    let presentDays = 0;
    let halfDays = 0;
    let totalRegularHours = 0;
    let totalOvertimeHours = 0;
    
    let totalBasic = 0;
    let totalOTPay = 0;
    let totalAllowances = 0;

    monthWages.forEach(dw => {
      // Re-derive status logic roughly or pass attendance in. 
      // For simplicity, we trust the wage record totals.
      if (dw.breakdown.baseWage > 0) presentDays++; // Simplified count
      
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

    // Mock Canteen/Processing fees
    const canteen = 550; // Flat mock
    const processing = advanceTotal > 0 ? 20 : 0;
    
    if (canteen > 0) deductionDetails.push({ description: 'Canteen Charges', amount: canteen });
    if (processing > 0) deductionDetails.push({ description: 'Processing Fee', amount: processing });

    const totalDeductions = advanceTotal + canteen + processing;

    return {
      id: `payroll_${worker.id}_${month}`,
      workerId: worker.id,
      workerName: worker.name,
      workerDesignation: worker.designation,
      workerDepartment: worker.department,
      month,
      attendanceSummary: {
        totalDays: worker.wageConfig.workingDaysPerMonth || 26,
        presentDays,
        absentDays: (worker.wageConfig.workingDaysPerMonth || 26) - presentDays, // simplified
        halfDays,
        totalRegularHours: parseFloat(totalRegularHours.toFixed(1)),
        totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(1))
      },
      earnings: {
        basic: parseFloat(totalBasic.toFixed(2)),
        overtime: parseFloat(totalOTPay.toFixed(2)),
        allowances: {
            travel: 0, // already summed in totalAllowances
            food: 0,
            other: parseFloat(totalAllowances.toFixed(2))
        },
        gross: parseFloat(gross.toFixed(2))
      },
      deductions: {
        advances: advanceTotal,
        processingFee: processing,
        canteen,
        total: totalDeductions,
        details: deductionDetails
      },
      netPayable: parseFloat((gross - totalDeductions).toFixed(2)),
      status: 'DRAFT'
    };
  }
};
