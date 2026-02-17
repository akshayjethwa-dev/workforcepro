import { Worker, AttendanceRecord, DailyWageRecord, MonthlyPayroll, Advance} from '../types/index';

export const wageService = {
  /**
   * Calculate earnings for a single day
   */
  calculateDailyWage: (worker: Worker, record: AttendanceRecord): DailyWageRecord => {
    const hours = record.calculatedHours || { 
        netWorkingHours: 0, overtimeHours: 0, grossHours: 0, 
        breakDeduction: 0, regularHours: 0, isLate: false, lateByMinutes: 0 
    };
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
      const otRate = hourlyRate * 2; // Double rate
      overtimeWage = otHours * otRate;
    }

    // 4. Calculate Allowances
    let totalAllowances = 0;
    if (record.status === 'PRESENT' || record.status === 'HALF_DAY') {
      totalAllowances += config.allowances.travel || 0;
      totalAllowances += config.allowances.food || 0;
      
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
        hoursWorked: hours.netWorkingHours || 0,
        overtimeHours: otHours,
        isOvertimeLimitExceeded: otHours > 4
      }
    };
  },

  // FIXED: Explicitly accepts 4 arguments
  generateMonthlyPayroll: (
    worker: Worker, 
    month: string, 
    dailyWages: DailyWageRecord[],
    advances: Advance[]
  ): MonthlyPayroll => {
    
    // Filter records for this month
    const monthWages = dailyWages.filter(w => w.date.startsWith(month));
    
    let presentDays = 0;
    let halfDays = 0; 
    let totalRegularHours = 0;
    let totalOvertimeHours = 0;
    
    let totalBasic = 0;
    let totalOTPay = 0;
    let totalAllowances = 0;

    monthWages.forEach(dw => {
      if (dw.breakdown.baseWage > 0) presentDays++;
      
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

    return {
      id: `payroll_${worker.id}_${month}`,
      tenantId: worker.tenantId,
      workerId: worker.id,
      workerName: worker.name,
      workerDesignation: worker.designation,
      workerDepartment: worker.department,
      month,
      attendanceSummary: {
        totalDays: worker.wageConfig.workingDaysPerMonth || 26,
        presentDays,
        absentDays: (worker.wageConfig.workingDaysPerMonth || 26) - presentDays,
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
      netPayable: parseFloat((gross - totalDeductions).toFixed(2)),
      status: 'DRAFT'
    };
  }
};