import { Worker, AttendanceRecord, DailyWageRecord, MonthlyPayroll, Advance} from '../types/index';

export const wageService = {
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
    dailyWages: DailyWageRecord[],
    advances: Advance[]
  ): MonthlyPayroll => {
    
    // Filter records for this exact month
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

    // Dynamically calculate exact days for the selected month
    const [yearStr, monthStr] = month.split('-');
    const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
    const totalWorkingDays = worker.wageConfig.workingDaysPerMonth || daysInMonth;

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
        absentDays: Math.max(0, totalWorkingDays - presentDays), // Ensures it never drops below 0
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