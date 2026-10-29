// src/workers/reportWorker.ts
// Compliant with Indian Statutory Standards:
// 1. EPFO ECR 2.0 (Unified Portal #~# delimited 11-column format & EPF Monthly Return with Accounts 1, 2, 10, 21)
// 2. ESIC Monthly Contribution Return (Official 6-column upload template for esic.gov.in & Contribution Register with 0.75% + 3.25%)
// 3. Form T Monthly Muster Roll (Rule 24(1) Code on Wages & Ease of Compliance Rules 2017)

self.onmessage = (e) => {
  const { action, payload, id } = e.data;

  try {
    let result: any;

    // ========================================================
    // 1. AGGREGATE STATUTORY REPORT & FULL FORM T MUSTER ROLL
    // ========================================================
    if (action === 'AGGREGATE_REPORT') {
      const { workers, monthAttendance, orgSettings, reportMonth } = payload;
      const [yearStr, monthStr] = (reportMonth || new Date().toISOString().slice(0, 7)).split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const daysInMonth = new Date(year, month, 0).getDate();

      const pfSettings = orgSettings?.compliance || {
        capPfDeduction: true,
        dailyWagePfPercentage: 100,
        pfContributionRate: 12,
        epsContributionRate: 8.33,
        epfWageCeiling: 15000
      };

      const workerRows: any[] = [];

      // Global aggregators
      let totalStaff = 0;
      let totalPresentDays = 0;
      let totalHalfDays = 0;
      let totalWeeklyOffDays = 0;
      let totalPaidHolidayDays = 0;
      let totalPaidLeaveDays = 0;
      let totalUnpaidLeaveDays = 0;
      let totalPayableDays = 0;
      let totalAbsentDays = 0;
      let totalOTHours = 0;
      let totalLateArrivals = 0;
      let totalGeofenceViolations = 0;

      // EPFO Summary Aggregators
      let epfCoveredWorkers = 0;
      let epfTotalGrossWages = 0;
      let epfTotalEpfWages = 0;
      let epfTotalEpsWages = 0;
      let epfTotalEdliWages = 0;
      let epfTotalEeShare = 0;
      let epfTotalEpsShare = 0;
      let epfTotalErEpfShare = 0;

      // ESIC Summary Aggregators
      let esicCoveredWorkers = 0;
      let esicExemptWorkers = 0;
      let esicTotalWages = 0;
      let esicTotalEeShare = 0;
      let esicTotalErShare = 0;

      workers.forEach((worker: any) => {
        totalStaff++;
        const workerRecords = monthAttendance.filter((r: any) => r.workerId === worker.id);

        const joiningDate = (worker.joinedDate || worker.dateOfJoining || '').slice(0, 10);
        const exitDate = (worker.dateOfExit || '').slice(0, 10);

        // Daily map for Form T Muster Roll
        const dailyAttendance: Record<number, any> = {};
        const dailyStatuses = new Map<number, string>();

        let present = 0;
        let halfDay = 0;
        let weeklyOff = 0;
        let paidHoliday = 0;
        let unpaidHoliday = 0;
        let holidayWorked = 0;
        let paidLeave = 0;
        let unpaidLeave = 0;
        let absent = 0;
        let notEmployed = 0;
        let otHours = 0;
        let late = 0;
        let geofenceViolations = 0;

        // Check each day 1..daysInMonth
        for (let day = 1; day <= daysInMonth; day++) {
          const dayStr = String(day).padStart(2, '0');
          const dateStr = `${yearStr}-${monthStr}-${dayStr}`;
          const dayDate = new Date(year, month - 1, day);
          const dayOfWeek = dayDate.getDay(); // 0 = Sunday, 6 = Saturday

          // 1. Employment Range Check
          if ((joiningDate && dateStr < joiningDate) || (exitDate && dateStr > exitDate)) {
            dailyStatuses.set(day, 'NOT_EMPLOYED');
            dailyAttendance[day] = {
              day,
              date: dateStr,
              dayOfWeek,
              status: 'NOT_EMPLOYED',
              code: '-',
              label: 'Not Employed',
              inTime: '',
              outTime: '',
              otHours: 0,
              isLate: false,
              isOutOfGeofence: false
            };
            notEmployed++;
            continue;
          }

          // Check for attendance record on this day
          const rec = workerRecords.find((r: any) => r.date === dateStr);
          const holiday = orgSettings?.holidays?.find((h: any) => h.date === dateStr);

          // Check weekly off
          let isWeeklyOff = false;
          if (worker.weeklyOffOverride && Array.isArray(worker.weeklyOffOverride) && worker.weeklyOffOverride.length > 0) {
            isWeeklyOff = worker.weeklyOffOverride.includes(dayOfWeek);
          } else if (orgSettings?.weeklyOffs?.defaultDays) {
            if (orgSettings.weeklyOffs.defaultDays.includes(dayOfWeek)) {
              if (dayOfWeek === 6 && orgSettings.weeklyOffs.saturdayRule) {
                const occurrence = Math.ceil(day / 7);
                switch (orgSettings.weeklyOffs.saturdayRule) {
                  case 'NONE': isWeeklyOff = false; break;
                  case 'ALL': isWeeklyOff = true; break;
                  case 'ALTERNATE': isWeeklyOff = (occurrence % 2 === 0); break;
                  case 'FIRST_THIRD': isWeeklyOff = (occurrence === 1 || occurrence === 3); break;
                  case 'SECOND_FOURTH': isWeeklyOff = (occurrence === 2 || occurrence === 4); break;
                  default: isWeeklyOff = true;
                }
              } else {
                isWeeklyOff = true;
              }
            }
          } else {
            isWeeklyOff = (dayOfWeek === 0); // Default Sunday
          }

          let code = 'A';
          let status = 'ABSENT';
          let dayOt = 0;
          let isLate = false;
          let isOutGeofence = false;
          let inTimeStr = '';
          let outTimeStr = '';

          if (rec) {
            // Overtime
            dayOt = rec.hours?.overtime || rec.overtimeHours || rec.calculatedHours?.overtimeHours || 0;
            otHours += dayOt;

            // Late status
            if (rec.lateStatus?.isLate) {
              late++;
              isLate = true;
            }

            // Geofence check
            if (rec.timeline && Array.isArray(rec.timeline)) {
              rec.timeline.forEach((punch: any) => {
                if (punch.isOutOfGeofence) {
                  geofenceViolations++;
                  isOutGeofence = true;
                }
                if (punch.type === 'IN' && !inTimeStr) {
                  inTimeStr = punch.timestamp ? new Date(punch.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                }
                if (punch.type === 'OUT') {
                  outTimeStr = punch.timestamp ? new Date(punch.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                }
              });
            } else {
              inTimeStr = rec.checkIn || '';
              outTimeStr = rec.checkOut || '';
            }

            if (rec.status === 'PRESENT' || (rec.timeline && rec.timeline.length > 0 && rec.status !== 'HALF_DAY' && rec.status !== 'ON_LEAVE')) {
              if (holiday || isWeeklyOff) {
                status = 'HOLIDAY_WORKED';
                code = 'HW';
                holidayWorked++;
              } else {
                status = 'PRESENT';
                code = 'P';
                present++;
              }
            } else if (rec.status === 'HALF_DAY') {
              status = 'HALF_DAY';
              code = 'HD';
              halfDay++;
            } else if (rec.status === 'ON_LEAVE') {
              const lType = rec.leaveInfo?.type || 'PL';
              const isPaid = rec.leaveInfo?.isPaid !== false;
              status = 'ON_LEAVE';
              code = lType;
              if (isPaid) paidLeave++;
              else unpaidLeave++;
            } else if (rec.status === 'WEEKLY_OFF') {
              status = 'WEEKLY_OFF';
              code = 'WO';
              weeklyOff++;
            } else if (rec.status === 'PUBLIC_HOLIDAY') {
              status = 'PUBLIC_HOLIDAY';
              code = 'PH';
              paidHoliday++;
            } else {
              status = 'ABSENT';
              code = 'A';
              absent++;
            }
          } else {
            // No record for this day
            if (holiday) {
              if (holiday.isPaid) {
                status = 'PUBLIC_HOLIDAY';
                code = 'PH';
                paidHoliday++;
              } else {
                status = 'UNPAID_HOLIDAY';
                code = 'A';
                unpaidHoliday++;
              }
            } else if (isWeeklyOff) {
              status = 'WEEKLY_OFF';
              code = 'WO';
              weeklyOff++;
            } else {
              status = 'ABSENT';
              code = 'A';
              absent++;
            }
          }

          dailyStatuses.set(day, status);
          dailyAttendance[day] = {
            day,
            date: dateStr,
            dayOfWeek,
            status,
            code,
            inTime: inTimeStr,
            outTime: outTimeStr,
            otHours: dayOt,
            isLate,
            isOutOfGeofence: isOutGeofence
          };
        }

        // Apply Sandwich Rule if enabled in orgSettings
        if (orgSettings?.enableSandwichRule) {
          for (let day = 1; day <= daysInMonth; day++) {
            const st = dailyStatuses.get(day);
            if (st === 'WEEKLY_OFF' || st === 'PUBLIC_HOLIDAY') {
              const prev = day > 1 ? dailyStatuses.get(day - 1) : null;
              const next = day < daysInMonth ? dailyStatuses.get(day + 1) : null;
              if ((prev === 'ABSENT' || prev === 'UNPAID_HOLIDAY') && (next === 'ABSENT' || next === 'UNPAID_HOLIDAY')) {
                dailyStatuses.set(day, 'UNPAID_HOLIDAY');
                if (dailyAttendance[day]) {
                  dailyAttendance[day].status = 'UNPAID_HOLIDAY';
                  dailyAttendance[day].code = 'A';
                }
                if (st === 'WEEKLY_OFF') { weeklyOff--; unpaidHoliday++; }
                else if (st === 'PUBLIC_HOLIDAY') { paidHoliday--; unpaidHoliday++; }
              }
            }
          }
        }

        // Statutory Payable Days under Indian Labour Law:
        // Payable Days = Present + (Half Days * 0.5) + Weekly Offs + Paid Holidays + Paid Leaves + Holiday Worked
        const payableDays = present + (halfDay * 0.5) + weeklyOff + paidHoliday + paidLeave + holidayWorked;
        const ncpDays = Math.max(0, daysInMonth - Math.floor(payableDays));

        // Wage Computations
        const isMonthly = worker.wageConfig?.type === 'MONTHLY' || worker.category === 'Monthly';
        const workingDaysPerMonth = worker.wageConfig?.workingDaysPerMonth || 26;

        let monthlyNominalGross = 0;
        let monthlyBasic = 0;
        let earnedGrossWage = 0;
        let earnedBasicWage = 0;

        if (isMonthly) {
          monthlyNominalGross = worker.wageConfig?.amount || worker.monthlySalary || 20500;
          monthlyBasic = worker.wageConfig?.monthlyBreakdown?.basic || Math.round(monthlyNominalGross * 0.5);
          const perDayGross = monthlyNominalGross / workingDaysPerMonth;
          const perDayBasic = monthlyBasic / workingDaysPerMonth;
          earnedGrossWage = Math.round(perDayGross * payableDays);
          earnedBasicWage = Math.round(perDayBasic * payableDays);
        } else {
          const dailyRate = worker.wageConfig?.amount || worker.dailyWage || 650;
          monthlyNominalGross = dailyRate * workingDaysPerMonth;
          earnedGrossWage = Math.round(dailyRate * payableDays);
          const dailyWagePfPercentage = (pfSettings.dailyWagePfPercentage || 100) / 100;
          earnedBasicWage = Math.round(earnedGrossWage * dailyWagePfPercentage);
        }

        // ----------------------------------------------------
        // EPFO Statutory Calculations (Indian Standards)
        // ----------------------------------------------------
        const epfWageCeiling = pfSettings.epfWageCeiling || 15000;
        let epfWage = earnedBasicWage;
        if (pfSettings.capPfDeduction && epfWage > epfWageCeiling) {
          epfWage = epfWageCeiling;
        }

        // EPS age rule (Para 6(a) EPS 1995: Member ceases EPS upon reaching 58 years)
        let isAge58OrAbove = false;
        const dob = worker.dob || worker.dateOfBirth;
        if (dob) {
          const birthYear = parseInt(dob.split('-')[0], 10);
          const birthMonth = parseInt(dob.split('-')[1] || '1', 10);
          const age = year - birthYear - (month < birthMonth ? 1 : 0);
          if (age >= 58) isAge58OrAbove = true;
        }

        let epsWage = epfWage > epfWageCeiling ? epfWageCeiling : epfWage;
        if (isAge58OrAbove) epsWage = 0;

        const edliWage = epfWage > epfWageCeiling ? epfWageCeiling : epfWage;

        const pfRate = (pfSettings.pfContributionRate || 12) / 100;
        const epsRate = (pfSettings.epsContributionRate || 8.33) / 100;

        const epfEEShare = Math.round(epfWage * pfRate);
        const epsShare = isAge58OrAbove ? 0 : Math.min(1250, Math.round(epsWage * epsRate));
        const epfERShare = epfEEShare - epsShare; // approx 3.67%

        if (worker.uan) {
          epfCoveredWorkers++;
          epfTotalGrossWages += earnedGrossWage;
          epfTotalEpfWages += epfWage;
          epfTotalEpsWages += epsWage;
          epfTotalEdliWages += edliWage;
          epfTotalEeShare += epfEEShare;
          epfTotalEpsShare += epsShare;
          epfTotalErEpfShare += epfERShare;
        }

        // ----------------------------------------------------
        // ESIC Statutory Calculations (Indian Standards)
        // ----------------------------------------------------
        // Ceiling: Gross monthly wage <= ₹21,000 (ESI Act Rule 50)
        const isEsicEligible = monthlyNominalGross <= 21000;
        let esicWages = 0;
        let eeEsic = 0;
        let erEsic = 0;
        let totalEsic = 0;

        if (isEsicEligible && worker.esicIp) {
          esicCoveredWorkers++;
          esicWages = earnedGrossWage;

          // Rule: Employees earning average daily wage <= ₹176 are exempt from employee share
          const avgDailyWage = payableDays > 0 ? (earnedGrossWage / payableDays) : 0;
          eeEsic = avgDailyWage <= 176 ? 0 : Math.round(earnedGrossWage * 0.0075);
          erEsic = Math.round(earnedGrossWage * 0.0325);
          totalEsic = eeEsic + erEsic;

          esicTotalWages += esicWages;
          esicTotalEeShare += eeEsic;
          esicTotalErShare += erEsic;
        } else if (!isEsicEligible) {
          esicExemptWorkers++;
        }

        // Global counters
        totalPresentDays += present;
        totalHalfDays += halfDay;
        totalWeeklyOffDays += weeklyOff;
        totalPaidHolidayDays += paidHoliday;
        totalPaidLeaveDays += paidLeave;
        totalUnpaidLeaveDays += unpaidLeave;
        totalPayableDays += payableDays;
        totalAbsentDays += absent;
        totalOTHours += otHours;
        totalLateArrivals += late;
        totalGeofenceViolations += geofenceViolations;

        workerRows.push({
          id: worker.id,
          name: worker.name,
          fatherName: worker.fatherName || '-',
          gender: worker.gender || 'Male',
          designation: worker.designation || 'Worker',
          department: worker.department || 'Production',
          category: worker.category || (isMonthly ? 'Monthly' : 'Daily Wage'),
          uan: worker.uan || '',
          esicIp: worker.esicIp || '',
          phone: worker.phone || '',
          dob: worker.dob || worker.dateOfBirth || '',
          joinedDate: worker.joinedDate || worker.dateOfJoining || '',
          dailyAttendance,
          present,
          halfDay,
          weeklyOff,
          paidHoliday,
          paidLeave,
          unpaidLeave,
          holidayWorked,
          payableDays,
          absent,
          otHours: otHours.toFixed(1),
          late,
          geofenceViolations,
          // Statutory Wage metrics
          monthlyNominalGross,
          earnedGrossWage,
          earnedBasicWage,
          epfWage,
          epsWage,
          edliWage,
          epfEEShare,
          epsShare,
          epfERShare,
          ncpDays,
          isAge58OrAbove,
          isEsicEligible,
          esicWages,
          eeEsic,
          erEsic,
          totalEsic
        });
      });

      // Calculate EPFO Administrative & EDLI charges (Account 2 & 21)
      // Account 2: EPF Admin charges @ 0.50% (Minimum ₹500/month)
      const epfAdminCharges = epfCoveredWorkers > 0 ? Math.max(500, Math.round(epfTotalEpfWages * 0.005)) : 0;
      // Account 21: EDLI charges @ 0.50%
      const edliCharges = Math.round(epfTotalEdliWages * 0.005);
      const totalEpfoChallan = epfTotalEeShare + epfTotalErEpfShare + epfTotalEpsShare + epfAdminCharges + edliCharges;

      // ESIC Challan Summary
      const totalEsicChallan = esicTotalEeShare + esicTotalErShare;

      result = {
        summary: {
          reportMonth,
          daysInMonth,
          totalStaff,
          totalPresentDays,
          totalHalfDays,
          totalWeeklyOffDays,
          totalPaidHolidayDays,
          totalPaidLeaveDays,
          totalUnpaidLeaveDays,
          totalPayableDays,
          totalAbsentDays,
          totalOTHours: totalOTHours.toFixed(1),
          totalLateArrivals,
          totalGeofenceViolations,
          epfo: {
            coveredWorkers: epfCoveredWorkers,
            totalGrossWages: epfTotalGrossWages,
            totalEpfWages: epfTotalEpfWages,
            totalEpsWages: epfTotalEpsWages,
            totalEdliWages: epfTotalEdliWages,
            totalEeShare: epfTotalEeShare,
            totalEpsShare: epfTotalEpsShare,
            totalErEpfShare: epfTotalErEpfShare,
            adminCharges: epfAdminCharges,
            edliCharges: edliCharges,
            totalChallanAmount: totalEpfoChallan
          },
          esic: {
            coveredWorkers: esicCoveredWorkers,
            exemptWorkers: esicExemptWorkers,
            totalWages: esicTotalWages,
            totalEeContribution: esicTotalEeShare,
            totalErContribution: esicTotalErShare,
            totalChallanAmount: totalEsicChallan
          }
        },
        workerRows
      };
    }

    // ========================================================
    // 2. CSV EXPORT OF FORM T MUSTER ROLL (Day 1..31 + Totals)
    // ========================================================
    if (action === 'GENERATE_CSV') {
      const { workerRows, daysInMonth, reportMonth } = payload;

      let dayHeaders = '';
      for (let d = 1; d <= daysInMonth; d++) {
        dayHeaders += `,Day ${d}`;
      }

      const headers = `Sl No,Employee Code,Workman Name,Father/Husband Name,Gender,Designation,Category,UAN,ESIC IP${dayHeaders},Days Worked (P),Half Days (HD),Weekly Offs (WO),Paid Holidays (PH),Paid Leaves (L),Payable Days,Absent Days (A),OT Hours,Late Marks,Geofence Flags\n`;

      const rows = workerRows.map((r: any, idx: number) => {
        let dayMarks = '';
        for (let d = 1; d <= daysInMonth; d++) {
          const mark = r.dailyAttendance?.[d]?.code || '-';
          dayMarks += `,${mark}`;
        }
        return `${idx + 1},"${r.id}","${r.name}","${r.fatherName}","${r.gender}","${r.designation}","${r.category}","${r.uan}","${r.esicIp}"${dayMarks},${r.present},${r.halfDay},${r.weeklyOff},${r.paidHoliday},${r.paidLeave},${r.payableDays},${r.absent},${r.otHours},${r.late},${r.geofenceViolations}`;
      }).join('\n');

      result = `# FORM T - MUSTER ROLL (Code on Wages, 2019 / Ease of Compliance Rules, 2017)\n# Month: ${reportMonth}\n` + headers + rows;
    }

    // ========================================================
    // 3. OFFICIAL EPFO ECR 2.0 TEXT FILE (11-Column #~# Format)
    // ========================================================
    if (action === 'GENERATE_ECR') {
      const { workers, monthAttendance, pfSettings, daysInMonth } = payload;
      const textLines: string[] = [];
      const ecrTableRows: any[] = [];
      let processedCount = 0;
      let skippedCount = 0;

      let sumGross = 0;
      let sumEpfWages = 0;
      let sumEpsWages = 0;
      let sumEdliWages = 0;
      let sumEeShare = 0;
      let sumEpsShare = 0;
      let sumErEpfShare = 0;

      workers.forEach((worker: any) => {
        if (!worker.uan) {
          skippedCount++;
          return;
        }

        const workerRecords = monthAttendance.filter((r: any) => r.workerId === worker.id);
        const presentDays = workerRecords.filter((r: any) => r.status === 'PRESENT').length;
        const halfDays = workerRecords.filter((r: any) => r.status === 'HALF_DAY').length;
        const weeklyOffs = workerRecords.filter((r: any) => r.status === 'WEEKLY_OFF').length;
        const paidHolidays = workerRecords.filter((r: any) => r.status === 'PUBLIC_HOLIDAY').length;
        const paidLeaves = workerRecords.filter((r: any) => r.status === 'ON_LEAVE' && r.leaveInfo?.isPaid !== false).length;
        const holidayWorked = workerRecords.filter((r: any) => r.status === 'HOLIDAY_WORKED').length;

        const payableDays = presentDays + (halfDays * 0.5) + weeklyOffs + paidHolidays + paidLeaves + holidayWorked;
        const ncpDays = Math.max(0, daysInMonth - Math.floor(payableDays));

        const isMonthly = worker.wageConfig?.type === 'MONTHLY' || worker.category === 'Monthly';
        const workingDays = worker.wageConfig?.workingDaysPerMonth || 26;

        let grossWage = 0;
        let epfWage = 0;

        if (isMonthly) {
          const monthlyGross = worker.wageConfig?.amount || worker.monthlySalary || 20500;
          const monthlyBasic = worker.wageConfig?.monthlyBreakdown?.basic || Math.round(monthlyGross * 0.5);
          grossWage = Math.round((monthlyGross / workingDays) * payableDays);
          epfWage = Math.round((monthlyBasic / workingDays) * payableDays);
        } else {
          const dailyRate = worker.wageConfig?.amount || worker.dailyWage || 650;
          grossWage = Math.round(dailyRate * payableDays);
          const pfPct = (pfSettings.dailyWagePfPercentage || 100) / 100;
          epfWage = Math.round(grossWage * pfPct);
        }

        const wageCeiling = pfSettings.epfWageCeiling || 15000;
        if (pfSettings.capPfDeduction && epfWage > wageCeiling) {
          epfWage = wageCeiling;
        }

        // EPS 58 years rule
        let isAge58 = false;
        const dob = worker.dob || worker.dateOfBirth;
        if (dob) {
          const birthYear = parseInt(dob.split('-')[0], 10);
          const currentYear = new Date().getFullYear();
          if (currentYear - birthYear >= 58) isAge58 = true;
        }

        const epsWage = isAge58 ? 0 : (epfWage > wageCeiling ? wageCeiling : epfWage);
        const edliWage = epfWage > wageCeiling ? wageCeiling : epfWage;

        const pfRate = (pfSettings.pfContributionRate || 12) / 100;
        const epsRate = (pfSettings.epsContributionRate || 8.33) / 100;

        const epfEEDue = Math.round(epfWage * pfRate);
        const epsDue = isAge58 ? 0 : Math.min(1250, Math.round(epsWage * epsRate));
        const epfERDue = epfEEDue - epsDue; // approx 3.67%

        sumGross += grossWage;
        sumEpfWages += epfWage;
        sumEpsWages += epsWage;
        sumEdliWages += edliWage;
        sumEeShare += epfEEDue;
        sumEpsShare += epsDue;
        sumErEpfShare += epfERDue;

        // OFFICIAL EPFO ECR 2.0 (UNIFIED PORTAL SPECIFICATION)
        // Exactly 11 fields separated by '#~#'
        // 1. Member UAN (12 digits)
        // 2. Member Name
        // 3. Gross Wages (in ₹)
        // 4. EPF Wages (in ₹)
        // 5. EPS Wages (in ₹)
        // 6. EDLI Wages (in ₹)
        // 7. EE Share Remitted (12% of EPF)
        // 8. EPS Share Remitted (8.33% of EPS, capped at 1250)
        // 9. ER Share Remitted (Difference: EE Share - EPS Share)
        // 10. NCP Days (Non-Contributory Period)
        // 11. Refund of Advances (0)
        const ecrFields = [
          worker.uan.trim(),
          worker.name.trim(),
          grossWage.toString(),
          epfWage.toString(),
          epsWage.toString(),
          edliWage.toString(),
          epfEEDue.toString(),
          epsDue.toString(),
          epfERDue.toString(),
          ncpDays.toString(),
          '0'
        ];

        textLines.push(ecrFields.join('#~#'));

        ecrTableRows.push({
          'UAN': worker.uan,
          'Member Name': worker.name,
          'Gross Wages': grossWage,
          'EPF Wages': epfWage,
          'EPS Wages': epsWage,
          'EDLI Wages': edliWage,
          'EE Share (12%)': epfEEDue,
          'EPS Share (8.33%)': epsDue,
          'ER EPF Share (3.67%)': epfERDue,
          'NCP Days': ncpDays,
          'Refund of Advances': 0
        });

        processedCount++;
      });

      const adminCharges = processedCount > 0 ? Math.max(500, Math.round(sumEpfWages * 0.005)) : 0;
      const edliCharges = Math.round(sumEdliWages * 0.005);
      const totalChallanDues = sumEeShare + sumErEpfShare + sumEpsShare + adminCharges + edliCharges;

      result = {
        textContent: textLines.join('\n'),
        ecrTableRows,
        challanSummary: {
          processedCount,
          sumGross,
          sumEpfWages,
          sumEpsWages,
          sumEdliWages,
          account1_EE: sumEeShare,
          account1_ER: sumErEpfShare,
          account2_Admin: adminCharges,
          account10_EPS: sumEpsShare,
          account21_EDLI: edliCharges,
          totalChallanDues
        },
        processedCount,
        skippedCount
      };
    }

    // ========================================================
    // 4. OFFICIAL ESIC MONTHLY RETURN & CONTRIBUTION REGISTER
    // ========================================================
    if (action === 'GENERATE_ESIC') {
      const { workers, monthAttendance, daysInMonth } = payload;
      const portalUploadData: any[] = [];
      const contributionStatementData: any[] = [];
      let processedCount = 0;
      let skippedCount = 0;
      let ineligibleCount = 0;

      let totalGross = 0;
      let totalEeContribution = 0;
      let totalErContribution = 0;

      workers.forEach((worker: any) => {
        if (!worker.esicIp) {
          skippedCount++;
          return;
        }

        const isMonthly = worker.wageConfig?.type === 'MONTHLY' || worker.category === 'Monthly';
        const workingDays = worker.wageConfig?.workingDaysPerMonth || 26;

        const baseMonthlyGross = isMonthly
          ? (worker.wageConfig?.amount || worker.monthlySalary || 0)
          : ((worker.wageConfig?.amount || worker.dailyWage || 0) * workingDays);

        // ESIC Statutory Wage Ceiling: ₹21,000 per month
        if (baseMonthlyGross > 21000) {
          ineligibleCount++;
          return;
        }

        const workerRecords = monthAttendance.filter((r: any) => r.workerId === worker.id);
        const presentDays = workerRecords.filter((r: any) => r.status === 'PRESENT').length;
        const halfDays = workerRecords.filter((r: any) => r.status === 'HALF_DAY').length;
        const weeklyOffs = workerRecords.filter((r: any) => r.status === 'WEEKLY_OFF').length;
        const paidHolidays = workerRecords.filter((r: any) => r.status === 'PUBLIC_HOLIDAY').length;
        const paidLeaves = workerRecords.filter((r: any) => r.status === 'ON_LEAVE' && r.leaveInfo?.isPaid !== false).length;
        const holidayWorked = workerRecords.filter((r: any) => r.status === 'HOLIDAY_WORKED').length;

        const payableDays = presentDays + (halfDays * 0.5) + weeklyOffs + paidHolidays + paidLeaves + holidayWorked;

        let earnedGross = 0;
        if (isMonthly) {
          earnedGross = Math.round((baseMonthlyGross / workingDays) * payableDays);
        } else {
          const dailyRate = worker.wageConfig?.amount || worker.dailyWage || 0;
          earnedGross = Math.round(dailyRate * payableDays);
        }

        const avgDailyWage = payableDays > 0 ? (earnedGross / payableDays) : 0;
        // If daily wage <= ₹176, employee share is exempted (0)
        const eeShare = avgDailyWage <= 176 ? 0 : Math.round(earnedGross * 0.0075);
        const erShare = Math.round(earnedGross * 0.0325);
        const totalShare = eeShare + erShare;

        totalGross += earnedGross;
        totalEeContribution += eeShare;
        totalErContribution += erShare;

        // Reason code for zero working days:
        // 1=Left Service, 2=Retired, 3=Out of coverage, 4=Expired, 5=Non-implemented area,
        // 6=Other Act, 7=Temporary disablement, 8=Leave without pay, 9=Others
        let reasonCode = '';
        if (payableDays === 0) {
          reasonCode = (worker.status === 'INACTIVE' || worker.dateOfExit) ? '1' : '8';
        }

        let lastWorkingDay = (worker.status === 'INACTIVE' && worker.dateOfExit) ? worker.dateOfExit : '';

        // 1. OFFICIAL ESIC PORTAL EXCEL UPLOAD FORMAT (esic.gov.in)
        // Exactly 6 columns as required by ESIC online filing
        portalUploadData.push({
          'IP Number': worker.esicIp.trim(),
          'IP Name': worker.name.trim(),
          'No of Days for which wages paid/payable during the month': Math.round(payableDays),
          'Total Monthly Wages': earnedGross,
          'Reason Code for Zero working days': reasonCode,
          'Last Working Day': lastWorkingDay
        });

        // 2. DETAILED ESIC CONTRIBUTION REGISTER (AUDIT & RECONCILIATION)
        contributionStatementData.push({
          'IP Number': worker.esicIp.trim(),
          'IP Name': worker.name.trim(),
          'Designation': worker.designation || 'Staff',
          'Days Worked': presentDays,
          'Payable Days': payableDays,
          'Total Monthly Wages (₹)': earnedGross,
          'Employee Share 0.75% (₹)': eeShare,
          'Employer Share 3.25% (₹)': erShare,
          'Total ESIC 4.00% (₹)': totalShare,
          'Reason Code': reasonCode,
          'Last Working Day': lastWorkingDay
        });

        processedCount++;
      });

      result = {
        portalUploadData,
        contributionStatementData,
        challanSummary: {
          processedCount,
          totalGross,
          totalEeContribution,
          totalErContribution,
          totalRemittance: totalEeContribution + totalErContribution
        },
        processedCount,
        skippedCount,
        ineligibleCount
      };
    }

    // Send successful result back to main thread
    self.postMessage({ id, success: true, result });
  } catch (error: any) {
    self.postMessage({ id, success: false, error: error.message });
  }
};