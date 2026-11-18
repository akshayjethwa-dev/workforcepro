"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditWorkerWageStructureServer = void 0;
const SERVER_STATE_ZONE_TABLES = {
    Gujarat: {
        defaultZone: 'Anand',
        zones: [
            {
                zone: 'Anand',
                notificationDate: '2026-10-01',
                notificationRef: 'GJ Lab & Emp Dept Notification GHR-2026-VDA-II',
                rates: { UNSKILLED: 12050, SEMI_SKILLED: 13500, SKILLED: 14900, HIGHLY_SKILLED: 16400 },
            },
            {
                zone: 'Vadodara',
                notificationDate: '2026-10-01',
                notificationRef: 'GJ Lab & Emp Dept Notification GHR-2026-VDA-I',
                rates: { UNSKILLED: 12700, SEMI_SKILLED: 14200, SKILLED: 15800, HIGHLY_SKILLED: 17300 },
            },
            {
                zone: 'Ahmedabad & Surat (Zone I)',
                notificationDate: '2026-10-01',
                notificationRef: 'GJ Lab & Emp Dept Notification GHR-2026-VDA-I',
                rates: { UNSKILLED: 13100, SEMI_SKILLED: 14650, SKILLED: 16300, HIGHLY_SKILLED: 17900 },
            },
            {
                zone: 'Rest of Gujarat (Zone II)',
                notificationDate: '2026-10-01',
                notificationRef: 'GJ Lab & Emp Dept Notification GHR-2026-VDA-II',
                rates: { UNSKILLED: 11800, SEMI_SKILLED: 13200, SKILLED: 14600, HIGHLY_SKILLED: 16000 },
            },
        ],
    },
    Maharashtra: {
        defaultZone: 'Zone I (Mumbai, Pune, Thane)',
        zones: [
            {
                zone: 'Zone I (Mumbai, Pune, Thane)',
                notificationDate: '2026-07-01',
                notificationRef: 'MH Gazette MWA-2026-SP-I',
                rates: { UNSKILLED: 12500, SEMI_SKILLED: 14000, SKILLED: 15625, HIGHLY_SKILLED: 17500 },
            },
            {
                zone: 'Zone II (Nashik, Nagpur, Aurangabad)',
                notificationDate: '2026-07-01',
                notificationRef: 'MH Gazette MWA-2026-SP-II',
                rates: { UNSKILLED: 11900, SEMI_SKILLED: 13300, SKILLED: 14850, HIGHLY_SKILLED: 16600 },
            },
            {
                zone: 'Zone III (Rest of Maharashtra)',
                notificationDate: '2026-07-01',
                notificationRef: 'MH Gazette MWA-2026-SP-III',
                rates: { UNSKILLED: 11350, SEMI_SKILLED: 12700, SKILLED: 14150, HIGHLY_SKILLED: 15800 },
            },
        ],
    },
    Karnataka: {
        defaultZone: 'Zone I (Bengaluru Urban)',
        zones: [
            {
                zone: 'Zone I (Bengaluru Urban)',
                notificationDate: '2026-04-01',
                notificationRef: 'KA Labour Dept KAE-2026-VDA-Z1',
                rates: { UNSKILLED: 14200, SEMI_SKILLED: 15900, SKILLED: 17750, HIGHLY_SKILLED: 19880 },
            },
            {
                zone: 'Zone II (Mysuru, Hubli-Dharwad, Mangaluru)',
                notificationDate: '2026-04-01',
                notificationRef: 'KA Labour Dept KAE-2026-VDA-Z2',
                rates: { UNSKILLED: 13300, SEMI_SKILLED: 14900, SKILLED: 16625, HIGHLY_SKILLED: 18600 },
            },
        ],
    },
    Delhi: {
        defaultZone: 'NCT Delhi (All Areas)',
        zones: [
            {
                zone: 'NCT Delhi (All Areas)',
                notificationDate: '2026-10-01',
                notificationRef: 'GNCTD Labour Dept F.12(142)/2026-VDA',
                rates: { UNSKILLED: 17494, SEMI_SKILLED: 19279, SKILLED: 21215, HIGHLY_SKILLED: 23040 },
            },
        ],
    },
};
const STATE_MIN_WAGES_MONTHLY = {
    Maharashtra: 12500,
    Karnataka: 14200,
    Gujarat: 12050,
    'Tamil Nadu': 12000,
    Delhi: 17494,
    Haryana: 11200,
    Telangana: 11500,
    'Andhra Pradesh': 11400,
    'West Bengal': 10500,
    Kerala: 13800,
    'Uttar Pradesh': 10700,
    Rajasthan: 10400,
    Punjab: 10800,
    'Madhya Pradesh': 10200,
    Odisha: 10100,
    Bihar: 9800,
    Jharkhand: 10200,
    Chhattisgarh: 10300,
    Goa: 12800,
    Assam: 9900,
    Uttarakhand: 10900,
    'Himachal Pradesh': 10800,
    Chandigarh: 13500,
    Puducherry: 11000,
};
const SKILL_MULT = {
    UNSKILLED: 1.0,
    SEMI_SKILLED: 1.12,
    SKILLED: 1.25,
    HIGHLY_SKILLED: 1.4,
};
const SECTOR_FACTOR = {
    'Engineering & Manufacturing': 1.0,
    'Textiles & Garments': 1.0,
    'Construction & Infrastructure': 1.05,
    'Shops & Commercial Establishments': 0.98,
    'Logistics & Warehousing': 1.02,
    'Food & Beverages': 0.99,
};
function round2(n) {
    return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
function matchStateFromText(text) {
    if (!text)
        return undefined;
    const lower = text.toLowerCase();
    return Object.keys(STATE_MIN_WAGES_MONTHLY).find((st) => lower.includes(st.toLowerCase()));
}
function resolveServerMinimumWage(stateName, zoneName, scheduledEmployment, skillCategory, evaluationDate, revisions = []) {
    var _a;
    const cleanState = stateName.trim();
    const zoneTable = SERVER_STATE_ZONE_TABLES[cleanState];
    const factor = (_a = SECTOR_FACTOR[scheduledEmployment]) !== null && _a !== void 0 ? _a : 1.0;
    let resolvedZone = zoneName || (zoneTable ? zoneTable.defaultZone : 'Standard State Zone');
    let notificationDate = '2026-04-01';
    let notificationRef = `${cleanState} Labour Dept Minimum Wages Notification`;
    let monthlyFloor;
    if (zoneTable) {
        const matched = (zoneName
            ? zoneTable.zones.find((z) => z.zone.toLowerCase() === zoneName.toLowerCase() ||
                z.zone.toLowerCase().includes(zoneName.toLowerCase()))
            : undefined) ||
            zoneTable.zones.find((z) => z.zone === zoneTable.defaultZone) ||
            zoneTable.zones[0];
        resolvedZone = matched.zone;
        notificationDate = matched.notificationDate;
        notificationRef = matched.notificationRef;
        monthlyFloor = Math.round((matched.rates[skillCategory] || matched.rates.UNSKILLED) * factor);
    }
    else {
        const baseFloor = STATE_MIN_WAGES_MONTHLY[cleanState] || 10000;
        monthlyFloor = Math.round(baseFloor * (SKILL_MULT[skillCategory] || 1.0) * factor);
    }
    let midMonthRevisionInfo;
    const evalMonth = evaluationDate.slice(0, 7);
    const matchingRevs = revisions.filter((r) => {
        const stOk = r.state.trim().toLowerCase() === cleanState.toLowerCase();
        const zOk = !r.zone ||
            r.zone === 'ALL' ||
            r.zone.trim().toLowerCase() === resolvedZone.toLowerCase() ||
            resolvedZone.toLowerCase().includes(r.zone.trim().toLowerCase());
        const skOk = r.skillCategory === skillCategory;
        const empOk = !r.scheduledEmployment ||
            r.scheduledEmployment === 'ALL' ||
            r.scheduledEmployment === scheduledEmployment;
        return stOk && zOk && skOk && empOk;
    });
    if (matchingRevs.length > 0) {
        const latest = [...matchingRevs].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))[matchingRevs.length - 1];
        const revMonth = latest.effectiveDate.slice(0, 7);
        if (evalMonth < revMonth) {
            monthlyFloor = latest.previousMonthlyFloor;
        }
        else if (evalMonth > revMonth) {
            monthlyFloor = latest.revisedMonthlyFloor;
            notificationDate = latest.notificationDate || latest.effectiveDate;
            notificationRef = latest.notificationRef;
        }
        else {
            const [yStr, mStr] = evalMonth.split('-');
            const totalDaysInMonth = new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
            const revDay = Math.min(totalDaysInMonth, Math.max(1, parseInt(latest.effectiveDate.slice(8, 10) || '1', 10)));
            if (revDay <= 1) {
                monthlyFloor = latest.revisedMonthlyFloor;
                notificationDate = latest.notificationDate || latest.effectiveDate;
                notificationRef = latest.notificationRef;
            }
            else {
                const daysAtPreviousRate = revDay - 1;
                const daysAtRevisedRate = totalDaysInMonth - daysAtPreviousRate;
                const proratedMonthlyFloor = Math.round((latest.previousMonthlyFloor * daysAtPreviousRate +
                    latest.revisedMonthlyFloor * daysAtRevisedRate) /
                    totalDaysInMonth);
                monthlyFloor = proratedMonthlyFloor;
                notificationDate = latest.notificationDate || latest.effectiveDate;
                notificationRef = latest.notificationRef;
                midMonthRevisionInfo = {
                    isRevisedInMonth: true,
                    revisionDate: latest.effectiveDate,
                    previousMonthlyFloor: latest.previousMonthlyFloor,
                    revisedMonthlyFloor: latest.revisedMonthlyFloor,
                    daysAtPreviousRate,
                    daysAtRevisedRate,
                    totalDaysInMonth,
                    proratedMonthlyFloor,
                };
            }
        }
    }
    return {
        zone: resolvedZone,
        notificationDate,
        notificationRef,
        monthlyFloor,
        dailyFloor: Math.round(monthlyFloor / 26),
        midMonthRevisionInfo,
    };
}
function auditWorkerWageStructureServer(worker, evaluationDate, defaultState = 'Maharashtra', ignoreRevisionCutoff = false, branches = [], minimumWageRevisions = []) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    const evaluationMonth = evaluationDate.slice(0, 7);
    let activeWageConfig = worker.wageConfig;
    let revisionApplied = Boolean(worker.salaryRevisionDate);
    if (!ignoreRevisionCutoff &&
        worker.salaryRevisionDate &&
        evaluationDate < worker.salaryRevisionDate) {
        revisionApplied = false;
        if (worker.previousWageConfig) {
            activeWageConfig = worker.previousWageConfig;
        }
        else if (typeof worker.previousWageAmount === 'number' &&
            worker.previousWageAmount > 0 &&
            worker.wageConfig) {
            activeWageConfig = Object.assign(Object.assign({}, worker.wageConfig), { amount: worker.previousWageAmount, monthlyBreakdown: undefined, dailyBreakdown: undefined });
        }
    }
    // Multi-state work location priority: Worker explicit -> Assigned Branch -> Head Office fallback
    const branch = branches.find((b) => b.id === worker.branchId);
    const branchState = (branch === null || branch === void 0 ? void 0 : branch.state) || matchStateFromText((_a = branch === null || branch === void 0 ? void 0 : branch.location) === null || _a === void 0 ? void 0 : _a.address);
    let activeWorkerState = worker.state;
    if (worker.stateEffectiveDate && worker.previousState) {
        if (evaluationMonth < worker.stateEffectiveDate.slice(0, 7)) {
            activeWorkerState = worker.previousState;
        }
    }
    let activeState;
    let workLocationSource;
    if (activeWorkerState) {
        activeState = activeWorkerState;
        workLocationSource = 'WORKER_LOCATION';
    }
    else if (branchState) {
        activeState = branchState;
        workLocationSource = 'BRANCH_LOCATION';
    }
    else {
        activeState = defaultState;
        workLocationSource = 'HEAD_OFFICE_FALLBACK';
    }
    const scheduledEmployment = worker.scheduledEmployment || (branch === null || branch === void 0 ? void 0 : branch.scheduledEmployment) || 'Engineering & Manufacturing';
    const skillCategory = worker.skillCategory || 'UNSKILLED';
    const minWage = resolveServerMinimumWage(activeState, worker.wageZone || (branch === null || branch === void 0 ? void 0 : branch.wageZone), scheduledEmployment, skillCategory, evaluationDate, minimumWageRevisions);
    const isMonthly = (activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.type) === 'MONTHLY' ||
        (!(activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.type) &&
            (worker.wageType === 'MONTHLY' || worker.category === 'Monthly'));
    const wageType = isMonthly ? 'MONTHLY' : 'DAILY';
    const dailyMultiplier = (activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.dailyMultiplier) === 30 || (activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.workingDaysPerMonth) === 30
        ? 30
        : 26;
    let basicPay = 0;
    let da = 0;
    let retainingAllowance = 0;
    let hra = 0;
    let travelAllowance = 0;
    let medicalAllowance = 0;
    let otherAllowances = 0;
    let employerPf = 0;
    let employerGratuity = 0;
    if (wageType === 'MONTHLY') {
        const mb = (activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.monthlyBreakdown) || {};
        const entered = (mb.basic || 0) +
            (mb.da || 0) +
            (mb.retainingAllowance || 0) +
            (mb.hra || 0) +
            (mb.travel || 0) +
            (mb.medical || 0) +
            (mb.others || 0);
        if (entered > 0) {
            basicPay = mb.basic || 0;
            da = mb.da || 0;
            retainingAllowance = mb.retainingAllowance || 0;
            hra = mb.hra || 0;
            travelAllowance = (_b = mb.travel) !== null && _b !== void 0 ? _b : (((_c = activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.allowances) === null || _c === void 0 ? void 0 : _c.travel) || 0);
            medicalAllowance = mb.medical || 0;
            otherAllowances =
                (mb.others || 0) +
                    (((_d = activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.allowances) === null || _d === void 0 ? void 0 : _d.food) || 0) +
                    (((_e = activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.allowances) === null || _e === void 0 ? void 0 : _e.nightShift) || 0);
            employerPf = mb.employerPf || 0;
            employerGratuity = mb.employerGratuity || 0;
        }
        else {
            const grossMonthly = (activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.amount) || worker.monthlySalary || 0;
            const pct = (_f = activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.basicPercentage) !== null && _f !== void 0 ? _f : 50;
            basicPay = round2((grossMonthly * pct) / 100);
            otherAllowances =
                round2(grossMonthly - basicPay) +
                    (((_g = activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.allowances) === null || _g === void 0 ? void 0 : _g.food) || 0) +
                    (((_h = activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.allowances) === null || _h === void 0 ? void 0 : _h.nightShift) || 0);
            travelAllowance = ((_j = activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.allowances) === null || _j === void 0 ? void 0 : _j.travel) || 0;
        }
    }
    else {
        const db = activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.dailyBreakdown;
        const dTravel = ((_k = activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.allowances) === null || _k === void 0 ? void 0 : _k.travel) || 0;
        const dFood = ((_l = activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.allowances) === null || _l === void 0 ? void 0 : _l.food) || 0;
        const dNight = ((_m = activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.allowances) === null || _m === void 0 ? void 0 : _m.nightShift) || 0;
        if (db &&
            (db.basic || 0) +
                (db.da || 0) +
                (db.retainingAllowance || 0) +
                (db.hra || 0) +
                (db.travel || 0) +
                (db.medical || 0) +
                (db.others || 0) >
                0) {
            basicPay = round2((db.basic || 0) * dailyMultiplier);
            da = round2((db.da || 0) * dailyMultiplier);
            retainingAllowance = round2((db.retainingAllowance || 0) * dailyMultiplier);
            hra = round2((db.hra || 0) * dailyMultiplier);
            travelAllowance = round2(((_o = db.travel) !== null && _o !== void 0 ? _o : dTravel) * dailyMultiplier);
            medicalAllowance = round2((db.medical || 0) * dailyMultiplier);
            otherAllowances = round2(((db.others || 0) + dFood + dNight) * dailyMultiplier);
            employerPf = round2((db.employerPf || 0) * dailyMultiplier);
            employerGratuity = round2((db.employerGratuity || 0) * dailyMultiplier);
        }
        else {
            const dailyRate = (activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.amount) || worker.dailyWage || 0;
            const monthlyEquiv = round2(dailyRate * dailyMultiplier);
            const pct = (_p = activeWageConfig === null || activeWageConfig === void 0 ? void 0 : activeWageConfig.basicPercentage) !== null && _p !== void 0 ? _p : 100;
            basicPay = round2((monthlyEquiv * pct) / 100);
            const remainder = round2(monthlyEquiv - basicPay);
            travelAllowance = round2(dTravel * dailyMultiplier);
            otherAllowances = round2(remainder + (dFood + dNight) * dailyMultiplier);
        }
    }
    const wageBase = round2(basicPay + da + retainingAllowance);
    const excludedComponents = round2(hra + travelAllowance + medicalAllowance + otherAllowances);
    const employerContributionsExcluded = round2(employerPf + employerGratuity);
    const totalRemuneration = round2(wageBase + excludedComponents);
    const totalCtcWithEmployer = round2(totalRemuneration + employerContributionsExcluded);
    const fiftyPercentThreshold = round2(totalRemuneration * 0.5);
    const isFiftyPercentNonCompliant = totalRemuneration > 0 && excludedComponents > fiftyPercentThreshold;
    const status = isFiftyPercentNonCompliant ? 'NON_COMPLIANT' : 'COMPLIANT';
    const gapAmount = isFiftyPercentNonCompliant
        ? round2(excludedComponents - fiftyPercentThreshold)
        : 0;
    const wageBasePercentage = totalRemuneration > 0 ? Math.round((wageBase / totalRemuneration) * 1000) / 10 : 0;
    const excludedPercentage = totalRemuneration > 0 ? Math.round((excludedComponents / totalRemuneration) * 1000) / 10 : 0;
    const deemedWageAddBack = gapAmount;
    const compliantWageBase = round2(wageBase + deemedWageAddBack);
    const estimatedAdditionalPfMonthly = isFiftyPercentNonCompliant
        ? Math.round(deemedWageAddBack * 0.12)
        : 0;
    const estimatedAdditionalGratuityAnnual = isFiftyPercentNonCompliant
        ? Math.round((deemedWageAddBack * 15) / 26)
        : 0;
    const estimatedAdditionalGratuityMonthly = isFiftyPercentNonCompliant
        ? Math.round(estimatedAdditionalGratuityAnnual / 12)
        : 0;
    const isOnProbation = Boolean(worker.isOnProbation);
    const probationExemptionBlockedNote = isOnProbation
        ? 'Employee is on probation — statutory minimum wage applies without exemption.'
        : undefined;
    const isMinimumWageViolation = totalRemuneration > 0 && basicPay < minWage.monthlyFloor;
    const minimumWageGap = isMinimumWageViolation
        ? round2(minWage.monthlyFloor - basicPay)
        : 0;
    const complianceFlags = [];
    if (isFiftyPercentNonCompliant)
        complianceFlags.push('NON_COMPLIANT');
    if (isMinimumWageViolation)
        complianceFlags.push('MINIMUM_WAGE_VIOLATION');
    return {
        workerId: worker.id,
        workerName: worker.name,
        workerCategory: worker.category,
        wageType,
        dailyMultiplier: wageType === 'DAILY' ? dailyMultiplier : undefined,
        state: activeState,
        wageZone: minWage.zone,
        scheduledEmployment,
        minimumWageNotificationDate: minWage.notificationDate,
        minimumWageNotificationRef: minWage.notificationRef,
        workLocationSource,
        isOnProbation,
        probationExemptionBlockedNote,
        midMonthRevisionInfo: minWage.midMonthRevisionInfo,
        skillCategory,
        evaluationDate,
        effectiveRevisionDate: worker.salaryRevisionDate,
        revisionApplied,
        basicPay,
        da,
        retainingAllowance,
        wageBase,
        hra,
        travelAllowance,
        medicalAllowance,
        otherAllowances,
        excludedComponents,
        employerPf,
        employerGratuity,
        employerContributionsExcluded,
        totalRemuneration,
        totalCtcWithEmployer,
        fiftyPercentThreshold,
        wageBasePercentage,
        excludedPercentage,
        isFiftyPercentNonCompliant,
        status,
        gapAmount,
        deemedWageAddBack,
        compliantWageBase,
        estimatedAdditionalPfMonthly,
        estimatedAdditionalGratuityMonthly,
        estimatedAdditionalGratuityAnnual,
        warningMessage: isFiftyPercentNonCompliant
            ? 'Your basic pay is less than 50% of CTC. This will increase PF/Gratuity liabilities.'
            : undefined,
        statutoryMinimumWageMonthly: minWage.monthlyFloor,
        statutoryMinimumWageDaily: minWage.dailyFloor,
        isMinimumWageViolation,
        minimumWageGap,
        minimumWageWarning: isMinimumWageViolation
            ? `MINIMUM_WAGE_VIOLATION: Basic Pay (₹${basicPay}/mo) is below ${activeState} · ${minWage.zone} (${scheduledEmployment}) floor of ₹${minWage.monthlyFloor}/mo. Shortfall: ₹${minimumWageGap}/mo · Notification Date: ${minWage.notificationDate}.`
            : undefined,
        blockingErrorCode: isMinimumWageViolation ? 'MINIMUM_WAGE_VIOLATION' : undefined,
        complianceFlags,
        hasAnyViolation: isFiftyPercentNonCompliant || isMinimumWageViolation,
        verificationSource: 'CLOUD_FUNCTION',
    };
}
exports.auditWorkerWageStructureServer = auditWorkerWageStructureServer;
//# sourceMappingURL=wageValidation.js.map