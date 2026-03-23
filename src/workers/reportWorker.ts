// src/workers/reportWorker.ts

self.onmessage = (e) => {
  const { action, payload, id } = e.data;

  try {
    let result;

    // 1. DASHBOARD AGGREGATION
    if (action === 'AGGREGATE_REPORT') {
      const { workers, monthAttendance } = payload;
      
      result = workers.map((worker: any) => {
        const workerRecords = monthAttendance.filter((r: any) => r.workerId === worker.id);
        let present = 0, absent = 0, late = 0, ot = 0, geofenceViolations = 0;

        workerRecords.forEach((r: any) => {
            if (r.status === 'PRESENT' || r.status === 'HALF_DAY') present++;
            if (r.status === 'ABSENT') absent++;
            if (r.lateStatus?.isLate) late++;
            ot += r.hours?.overtime || 0;
            
            if (r.timeline && Array.isArray(r.timeline)) {
                r.timeline.forEach((punch: any) => {
                    if (punch.isOutOfGeofence) geofenceViolations++;
                });
            }
        });

        return {
            name: worker.name,
            designation: worker.designation || 'Worker',
            present,
            absent,
            late,
            otHours: ot.toFixed(1),
            geofenceViolations
        };
      });
    }

    // 2. CSV STRING GENERATION
    if (action === 'GENERATE_CSV') {
        const { reportData } = payload;
        const headers = "Worker Name,Designation,Present Days,Absent Days,Late Arrivals,OT Hours,Geofence Violations\n";
        const rows = reportData.map((r: any) => 
            `"${r.name}","${r.designation}",${r.present},${r.absent},${r.late},${r.otHours},${r.geofenceViolations}`
        ).join("\n");
        result = headers + rows;
    }

    // 3. EPFO ECR GENERATION
    if (action === 'GENERATE_ECR') {
        const { workers, monthAttendance, pfSettings, daysInMonth } = payload;
        let textLines: string[] = [];
        let processedCount = 0;
        let skippedCount = 0;

        workers.forEach((worker: any) => {
            if (!worker.uan) {
                skippedCount++;
                return;
            }

            const workerRecords = monthAttendance.filter((r: any) => r.workerId === worker.id);
            const presentDays = workerRecords.filter((r: any) => 
                r.status === 'PRESENT' || r.status === 'HALF_DAY'
            ).length; 
            
            const workingDays = worker.wageConfig?.workingDaysPerMonth || daysInMonth;
            const ncpDays = Math.max(0, workingDays - presentDays);

            let grossWage = 0;
            let epfWage = 0;

            if (worker.wageConfig?.type === 'MONTHLY') {
                const fullBasic = worker.wageConfig.monthlyBreakdown?.basic || 0;
                grossWage = Math.round((worker.wageConfig.amount / workingDays) * presentDays);
                epfWage = Math.round((fullBasic / workingDays) * presentDays);
            } else {
                grossWage = Math.round((worker.wageConfig?.amount || 0) * presentDays);
                epfWage = Math.round(grossWage * ((pfSettings.dailyWagePfPercentage || 100) / 100));
            }

            const wageCeiling = pfSettings.epfWageCeiling || 15000;
            if (pfSettings.capPfDeduction && epfWage > wageCeiling) epfWage = wageCeiling;
            
            const epsWage = epfWage > wageCeiling ? wageCeiling : epfWage;
            const pfRate = (pfSettings.pfContributionRate || 12) / 100;
            const epsRate = (pfSettings.epsContributionRate || 8.33) / 100;
            
            const epfEEDue = Math.round(epfWage * pfRate); 
            const epsDue = Math.round(epsWage * epsRate); 
            const epfERDue = epfEEDue - epsDue; 

            const ecrLine = [
                worker.uan || '', worker.name || '', grossWage.toString(), epfWage.toString(),
                epsWage.toString(), epfWage.toString(), epfEEDue.toString(), epfEEDue.toString(),
                epsDue.toString(), epsDue.toString(), epfERDue.toString(), epfERDue.toString(),
                ncpDays.toString(), '0', '0', '0', '0', '0',
                worker.fatherName || worker.name,
                worker.gender?.toUpperCase() === 'FEMALE' ? 'F' : 'M',
                worker.dateOfBirth || '',
                worker.gender?.toUpperCase() === 'FEMALE' ? 'F' : 'M',
                worker.dateOfJoining || '', worker.dateOfExit || '', ''
            ].join('#~#');

            textLines.push(ecrLine);
            processedCount++;
        });

        result = { textContent: textLines.join('\n'), processedCount, skippedCount };
    }

    // 4. ESIC DATA GENERATION
    if (action === 'GENERATE_ESIC') {
        const { workers, monthAttendance, daysInMonth } = payload;
        const esicData: any[] = [];
        let processedCount = 0;
        let skippedCount = 0;
        let ineligibleCount = 0;

        workers.forEach((worker: any) => {
            if (!worker.esicIp) {
                skippedCount++;
                return;
            }

            const baseGross = worker.wageConfig?.type === 'MONTHLY' 
                 ? worker.wageConfig.amount 
                 : (worker.wageConfig?.amount || 0) * (worker.wageConfig?.workingDaysPerMonth || 26); 
                 
            if (baseGross > 21000) {
                ineligibleCount++;
                return; 
            }

            const workerRecords = monthAttendance.filter((r: any) => r.workerId === worker.id);
            const presentDays = workerRecords.filter((r: any) => 
                r.status === 'PRESENT' || r.status === 'HALF_DAY'
            ).length;
            
            let earnedGross = 0;
            if (worker.wageConfig?.type === 'MONTHLY') {
                const workingDays = worker.wageConfig.workingDaysPerMonth || daysInMonth;
                earnedGross = Math.round((worker.wageConfig.amount / workingDays) * presentDays);
            } else {
                earnedGross = Math.round((worker.wageConfig?.amount || 0) * presentDays);
            }
            
            let reasonCode = presentDays === 0 ? '2' : '';
            let lastWorkingDay = (worker.status === 'INACTIVE' && worker.dateOfExit) ? worker.dateOfExit : '';
            
            esicData.push({
                'IP Number': worker.esicIp,
                'IP Name': worker.name,
                'No of Days for which wages paid/payable during the month': presentDays,
                'Total Monthly Wages': earnedGross,
                'Reason Code for Zero working days': reasonCode,
                'Last Working Day': lastWorkingDay
            });
            
            processedCount++;
        });

        result = { esicData, processedCount, skippedCount, ineligibleCount };
    }

    // Send successful result back to main thread
    self.postMessage({ id, success: true, result });
    
  } catch (error: any) {
    // Send error back to main thread
    self.postMessage({ id, success: false, error: error.message });
  }
};