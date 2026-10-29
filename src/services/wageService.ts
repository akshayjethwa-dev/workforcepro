import { Worker, AttendanceRecord, DailyWageRecord, MonthlyPayroll, Advance, OrgSettings, WageConfig } from '../types/index';
import { attendanceLogic } from './attendanceLogic'; 
import { statutoryEngine } from './statutoryEngine';

export const ensureWageConfig = (worker: Worker): WageConfig => {
  const isMonthly = (worker as any).wageType === 'MONTHLY' || 
                    worker.wageConfig?.type === 'MONTHLY' || 
                    worker.category === 'Monthly';

  let resolvedAmount = 0;
  if (worker.wageConfig && typeof worker.wageConfig.amount === 'number' && worker.wageConfig.amount > 0) {
    resolvedAmount = worker.wageConfig.amount;
  } else if (typeof worker.dailyWage === 'number' && worker.dailyWage > 0 && !isMonthly) {
    resolvedAmount = worker.dailyWage;
  } else if (typeof worker.monthlySalary === 'number' && worker.monthlySalary > 0) {
    resolvedAmount = worker.monthlySalary;
  } else if (typeof (worker as any).wageAmount === 'number' && (worker as any).wageAmount > 0) {
    resolvedAmount = (worker as any).wageAmount;
  } else if (typeof (worker as any).amount === 'number' && (worker as any).amount > 0) {
    resolvedAmount = (worker as any).amount;
  } else {
    // Standard factory fallback rate
    resolvedAmount = isMonthly ? 25000 : 650;
  }

  const overtimeEligible = worker.wageConfig?.overtimeEligible ?? true;
  const overtimeRatePerHour = worker.wageConfig?.overtimeRatePerHour || 
                              (worker as any).overtimeRate || 
                              ((resolvedAmount / 8) * 1.5);

  return {
    type: isMonthly ? 'MONTHLY' : 'DAILY',
    amount: resolvedAmount,
    overtimeEligible,
    overtimeRatePerHour,
    workingDaysPerMonth: worker.wageConfig?.workingDaysPerMonth || 26,
    allowances: worker.wageConfig?.allowances || {
      travel: 0,
      food: 0,
      nightShift: 0
    }
  };
};

export const wageService = {

  // UPDATED: Now requires orgSettings to calculate correctly with holidays & leaves
  calculateCurrentEarnings: (worker: Worker, monthStr: string, attendanceRecords: AttendanceRecord[], orgSettings: OrgSettings) => {
    const monthAttendance = attendanceRecords.filter(a => a.workerId === worker.id && a.date.startsWith(monthStr));
    let totalEarned = 0;
    monthAttendance.forEach(record => {
      const dw = wageService.calculateDailyWage(worker, record, orgSettings);
      totalEarned += dw.breakdown.total;
    });
    return totalEarned;
  },

  /**
   * Calculate earnings for a single day
   */
  calculateDailyWage: (worker: Worker, record: AttendanceRecord, orgSettings: OrgSettings): DailyWageRecord => {
    // 1. Support both the NEW timeline 'hours' and OLD 'calculatedHours' for legacy records
    const netHours = record.hours?.net || record.calculatedHours?.netWorkingHours || 0;
    const otHours = record.hours?.overtime || record.calculatedHours?.overtimeHours || 0;

    const config = ensureWageConfig(worker);
    
    // 2. Determine Daily Rate Dynamically based on the specific month
    const isMonthly = config.type === 'MONTHLY';
    let dailyRate = config.amount;
    if (isMonthly) {
      const dateParts = (record.date || '').slice(0, 10).split('-');
      const yearStr = dateParts[0] || '2026';
      const monthStr = dateParts[1] || '10';
      const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
      dailyRate = config.amount / (config.workingDaysPerMonth || daysInMonth);
    }

    // 3. Calculate Base Wage WITH HOLIDAY & LEAVE RULES
    let baseWage = 0;
    if (record.status === 'PRESENT') {
      baseWage = dailyRate; // Fully paid days
    } else if (record.status === 'WEEKLY_OFF' || record.status === 'PUBLIC_HOLIDAY') {
      baseWage = isMonthly ? dailyRate : 0;
    } else if (record.status === 'HALF_DAY') {
      baseWage = dailyRate * 0.5;
    } else if (record.status === 'HOLIDAY_WORKED') {
      const multiplier = orgSettings?.holidayPayMultiplier ?? 2.0;
      baseWage = dailyRate * multiplier; 
    } else if (record.status === 'ON_LEAVE') {
      baseWage = record.leaveInfo?.isPaid ? dailyRate : 0;
    } else if (record.status === 'ABSENT' || record.status === 'UNPAID_HOLIDAY') {
      baseWage = 0; // Unpaid days
    }

    // 4. Calculate Overtime 
    let overtimeWage = 0;
    if (config.overtimeEligible && otHours > 0) {
      // Use their custom OT Rate if you set one, otherwise fallback to standard double rate (Rate/8 * 2)
      const otRatePerHour = config.overtimeRatePerHour || ((dailyRate / 8) * 2);
      overtimeWage = otHours * otRatePerHour;
    }

    // 5. Calculate Allowances safely
    let totalAllowances = 0;
    // Allowances given if they showed up (Present, Half Day, or Holiday Worked)
    if (['PRESENT', 'HALF_DAY', 'HOLIDAY_WORKED'].includes(record.status)) {
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
   * Generate exact monthly payroll data - REWRITTEN FOR CALENDAR LOGIC & LEAVES
   */
  generateMonthlyPayroll: (
    worker: Worker, 
    month: string, 
    attendanceRecords: AttendanceRecord[],
    advances: Advance[],
    orgSettings: OrgSettings
  ): MonthlyPayroll => {
    const config = ensureWageConfig(worker);
    const [yearStr, monthStr] = month.split('-');
    const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
    const totalWorkingDays = config.workingDaysPerMonth || daysInMonth;

    // Helper to get clean YYYY-MM-DD
    const joiningDate = (worker.joinedDate || worker.dateOfJoining || '').slice(0, 10);
    const exitDate = (worker.dateOfExit || '').slice(0, 10);

    const dailyStatuses = new Map<number, string>();
    const dailyRecords = new Map<number, AttendanceRecord>();

    const isMonthly = config.type === 'MONTHLY';

    // Pass 1: Plot the calendar and establish base statuses
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${yearStr}-${monthStr}-${day.toString().padStart(2, '0')}`;
        
        // Find if an attendance record exists for this date
        const record = attendanceRecords.find(a => 
          a.workerId === worker.id && 
          (a.date || '').slice(0, 10) === dateStr
        );

        // Check if worker was employed on this date ONLY if no explicit attendance record exists
        if (!record && ((joiningDate && dateStr < joiningDate) || (exitDate && dateStr > exitDate))) {
            dailyStatuses.set(day, 'NOT_EMPLOYED');
            continue;
        }

        const isPubHol = orgSettings.holidays?.find(h => h.date === dateStr);
        const isWeekOff = attendanceLogic.isWeeklyOff(dateStr, worker, orgSettings);

        let status = 'ABSENT';
        if (record) {
          const hasPunches = (record.timeline && record.timeline.length > 0) || !!record.inTime;
          const isPresent = record.status === 'PRESENT' || record.status === 'HALF_DAY' || record.status === 'HOLIDAY_WORKED' || hasPunches;

          if (isPresent) {
            status = (isPubHol || isWeekOff) ? 'HOLIDAY_WORKED' : (record.status === 'HALF_DAY' ? 'HALF_DAY' : 'PRESENT');
            dailyRecords.set(day, { ...record, status: status as any });
          } else if (record.status === 'ON_LEAVE') {
            status = 'ON_LEAVE';
            dailyRecords.set(day, record);
          } else if (record.status === 'WEEKLY_OFF') {
            status = 'WEEKLY_OFF';
          } else if (record.status === 'PUBLIC_HOLIDAY') {
            status = 'PUBLIC_HOLIDAY';
          } else {
            status = 'ABSENT';
          }
        } else {
          // Did not work or no record on this day
          if (isPubHol) {
            status = isPubHol.isPaid ? 'PUBLIC_HOLIDAY' : 'UNPAID_HOLIDAY';
          } else if (isWeekOff) {
            status = 'WEEKLY_OFF';
          } else {
            status = 'ABSENT';
          }
        }
        dailyStatuses.set(day, status);
    }

    // Pass 2: The Sandwich Rule (If enabled, strip pay for surrounded holidays)
    if (orgSettings.enableSandwichRule) {
        for (let day = 1; day <= daysInMonth; day++) {
            const status = dailyStatuses.get(day);
            if (status === 'WEEKLY_OFF' || status === 'PUBLIC_HOLIDAY') {
                const prevDay = day > 1 ? dailyStatuses.get(day - 1) : null;
                const nextDay = day < daysInMonth ? dailyStatuses.get(day + 1) : null;
                
                // FIXED: Accept undefined to handle Map.get() return types safely
                const isUnpaidAbsence = (dStatus: string | null | undefined, dRecord: AttendanceRecord | undefined) => {
                    if (dStatus === 'ABSENT' || dStatus === 'UNPAID_HOLIDAY') return true;
                    // LWP (Leave Without Pay) counts as an absence for Sandwich Rule purposes
                    if (dStatus === 'ON_LEAVE' && dRecord?.leaveInfo?.isPaid === false) return true;
                    return false;
                };

                const prevAbsent = isUnpaidAbsence(prevDay, dailyRecords.get(day - 1));
                const nextAbsent = isUnpaidAbsence(nextDay, dailyRecords.get(day + 1));
                
                if (prevAbsent && nextAbsent) {
                    dailyStatuses.set(day, 'UNPAID_HOLIDAY');
                }
            }
        }
    }

    // Pass 3: Calculate Finances based on the final Map
    let presentDays = 0, halfDays = 0, absentDays = 0;
    let weeklyOffs = 0, publicHolidays = 0, holidayWorkedDays = 0;
    let paidLeaves = 0, unpaidLeaves = 0; // NEW TRACKERS
    let notJoinedDays = 0;
    
    let totalBasic = 0;
    let totalOTPay = 0;
    let totalAllowances = 0;
    let totalRegularHours = 0;
    let totalOvertimeHours = 0;

    for (let day = 1; day <= daysInMonth; day++) {
        const status = dailyStatuses.get(day)!;
        if (status === 'NOT_EMPLOYED') {
            notJoinedDays++;
            continue;
        }

        const dailyRate = isMonthly ? config.amount / totalWorkingDays : config.amount;
        
        let dwBaseWage = 0, dwOTWage = 0, dwAllowances = 0;

        if (status === 'PRESENT') { 
          presentDays++; 
          dwBaseWage = dailyRate; 
        } else if (status === 'HALF_DAY') { 
          halfDays++; 
          dwBaseWage = dailyRate * 0.5; 
        } else if (status === 'ABSENT' || status === 'UNPAID_HOLIDAY') { 
          absentDays++; 
        } else if (status === 'WEEKLY_OFF') { 
          weeklyOffs++; 
          dwBaseWage = isMonthly ? dailyRate : 0; 
        } else if (status === 'PUBLIC_HOLIDAY') { 
          publicHolidays++; 
          dwBaseWage = isMonthly ? dailyRate : 0; 
        } else if (status === 'HOLIDAY_WORKED') { 
          holidayWorkedDays++; 
          dwBaseWage = dailyRate * (orgSettings.holidayPayMultiplier || 2.0); 
        } else if (status === 'ON_LEAVE') {
            const lRec = dailyRecords.get(day);
            if (lRec?.leaveInfo?.isPaid) {
                paidLeaves++;
                dwBaseWage = dailyRate;
            } else {
                unpaidLeaves++;
                absentDays++; // Unpaid leave behaves like an absent day for aggregate logic
                dwBaseWage = 0;
            }
        }

        const record = dailyRecords.get(day);
        if (record && record.timeline && record.timeline.length > 0) {
            // Recalculate precisely using the engine if they worked
            const dw = wageService.calculateDailyWage(worker, record, orgSettings);
            dwBaseWage = dw.breakdown.baseWage || dwBaseWage; 
            dwOTWage = dw.breakdown.overtimeWage;
            dwAllowances = dw.breakdown.allowances;
            totalRegularHours += dw.meta.hoursWorked - dw.meta.overtimeHours;
            totalOvertimeHours += dw.meta.overtimeHours;
        } else if (status === 'PRESENT' || status === 'HALF_DAY' || status === 'HOLIDAY_WORKED') {
            totalRegularHours += status === 'HALF_DAY' ? 4 : 8;
        }

        totalBasic += dwBaseWage;
        totalOTPay += dwOTWage;
        totalAllowances += dwAllowances;
    }

    const gross = totalBasic + totalOTPay + totalAllowances;
    // Exact total of days they are receiving pay for
    const payableDays = isMonthly 
      ? (presentDays + (halfDays * 0.5) + weeklyOffs + publicHolidays + holidayWorkedDays + paidLeaves)
      : (presentDays + (halfDays * 0.5) + holidayWorkedDays + paidLeaves);

    // Deductions
    const monthAdvances = advances.filter(a => a.workerId === worker.id && a.date.startsWith(month) && a.status === 'APPROVED');
    let advanceTotal = 0;
    const deductionDetails: {description: string, amount: number}[] = [];

    monthAdvances.forEach(adv => {
        advanceTotal += adv.amount;
        deductionDetails.push({ description: `Kharchi Advance (${adv.date})`, amount: adv.amount });
    });

    // Compute Indian Statutory Deductions (PF, ESI, State PT, TDS)
    const statutoryResult = statutoryEngine.computeStatutoryDeductions(
      worker,
      totalBasic,
      gross,
      totalOTPay,
      totalAllowances,
      month,
      orgSettings
    );

    // Add statutory deductions as distinct line items
    if (statutoryResult.statutory.employeePf > 0) {
      deductionDetails.push({
        description: `Provident Fund (EPF 12%${statutoryResult.statutory.isPfCapped ? ' Capped' : ''})`,
        amount: statutoryResult.statutory.employeePf
      });
    }
    if (statutoryResult.statutory.employeeEsi > 0) {
      deductionDetails.push({
        description: `Employee State Insurance (ESI 0.75%)`,
        amount: statutoryResult.statutory.employeeEsi
      });
    }
    if (statutoryResult.statutory.professionalTax > 0) {
      deductionDetails.push({
        description: `Professional Tax (${statutoryResult.statutory.state})`,
        amount: statutoryResult.statutory.professionalTax
      });
    }
    if (statutoryResult.statutory.tds > 0) {
      deductionDetails.push({
        description: `TDS Income Tax (${statutoryResult.statutory.taxRegime} Regime)`,
        amount: statutoryResult.statutory.tds
      });
    }

    const totalDeductions = advanceTotal + statutoryResult.totalEmployeeDeductions;

    // Carry Forward Logic (If Advances & Deductions taken exceed Gross Earned)
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
        absentDays,
        halfDays,
        weeklyOffs,
        publicHolidays,
        holidayWorkedDays,
        paidLeaves,      
        unpaidLeaves,    
        notJoinedDays,   
        payableDays,
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
        total: parseFloat(totalDeductions.toFixed(2)),
        details: deductionDetails
      },
      statutory: statutoryResult.statutory,
      employerCostToCompany: parseFloat(statutoryResult.employerCostToCompany.toFixed(2)),
      netPayable: parseFloat(finalNetPayable.toFixed(2)),
      carriedForwardAdvance: parseFloat(carriedForwardAdvance.toFixed(2)),
      status: 'DRAFT'
    };
  },

  calculateMonthlyPayroll: (
    worker: Worker, 
    month: string, 
    attendanceRecords: AttendanceRecord[],
    advances: Advance[],
    orgSettings: OrgSettings
  ): MonthlyPayroll => {
    return wageService.generateMonthlyPayroll(worker, month, attendanceRecords, advances, orgSettings);
  }
};