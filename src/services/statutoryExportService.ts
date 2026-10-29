import { Worker, MonthlyPayroll, OrgSettings, Form16Data } from '../types/index';
import { statutoryEngine } from './statutoryEngine';

export interface WorkerValidationIssue {
  workerId: string;
  workerName: string;
  severity: 'ERROR' | 'WARNING';
  field: 'UAN' | 'PAN' | 'ESIC_IP' | 'DOB' | 'JOIN_DATE' | 'EXIT_DATE';
  message: string;
  affectedFilings: ('ECR' | 'FORM_24Q' | 'FORM_16')[];
}

export interface FilingValidationReport {
  isFilingReady: boolean;
  totalWorkers: number;
  readyCount: number;
  warningCount: number;
  errorCount: number;
  issues: WorkerValidationIssue[];
  period: string;
  filingType: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
}

export interface Form24QQuarterInfo {
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  financialYear: string; // e.g., "2025-26"
  assessmentYear: string; // e.g., "2026-27"
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export const statutoryExportService = {

  /**
   * Determine Quarter info from a given date or quarter string
   */
  getQuarterInfo(quarterKey: 'Q1' | 'Q2' | 'Q3' | 'Q4', fyStartYear: number = 2025): Form24QQuarterInfo {
    const fyEndYear = fyStartYear + 1;
    const financialYear = `${fyStartYear}-${fyEndYear.toString().slice(2)}`;
    const assessmentYear = `${fyEndYear}-${(fyEndYear + 1).toString().slice(2)}`;

    switch (quarterKey) {
      case 'Q1':
        return { quarter: 'Q1', financialYear, assessmentYear, startDate: `${fyStartYear}-04-01`, endDate: `${fyStartYear}-06-30` };
      case 'Q2':
        return { quarter: 'Q2', financialYear, assessmentYear, startDate: `${fyStartYear}-07-01`, endDate: `${fyStartYear}-09-30` };
      case 'Q3':
        return { quarter: 'Q3', financialYear, assessmentYear, startDate: `${fyStartYear}-10-01`, endDate: `${fyStartYear}-12-31` };
      case 'Q4':
        return { quarter: 'Q4', financialYear, assessmentYear, startDate: `${fyEndYear}-01-01`, endDate: `${fyEndYear}-03-31` };
    }
  },

  /**
   * Pre-export validation audit
   */
  validateWorkersForFiling(
    workers: Worker[],
    payrolls: MonthlyPayroll[],
    filingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'
  ): FilingValidationReport {
    const issues: WorkerValidationIssue[] = [];

    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
    const uanRegex = /^[0-9]{12}$/;
    const esicRegex = /^[0-9]{10,17}$/;

    for (const w of workers) {
      // 1. PAN validation (Required for Form 24Q & Form 16)
      const cleanPan = (w.pan || '').trim().toUpperCase();
      if (!cleanPan) {
        issues.push({
          workerId: w.id,
          workerName: w.name,
          severity: 'ERROR',
          field: 'PAN',
          message: 'Missing Permanent Account Number (PAN). TRACES will reject or apply 20% higher TDS rate under Section 206AA.',
          affectedFilings: ['FORM_24Q', 'FORM_16']
        });
      } else if (!panRegex.test(cleanPan)) {
        issues.push({
          workerId: w.id,
          workerName: w.name,
          severity: 'ERROR',
          field: 'PAN',
          message: `Invalid PAN format "${cleanPan}". Expected 10 alphanumeric characters (e.g. ABCDE1234F).`,
          affectedFilings: ['FORM_24Q', 'FORM_16']
        });
      }

      // 2. EPFO UAN validation (Required for PF ECR)
      const cleanUan = (w.uan || '').trim().replace(/[^0-9]/g, '');
      if (!w.pfOptOut) {
        if (!cleanUan) {
          issues.push({
            workerId: w.id,
            workerName: w.name,
            severity: 'ERROR',
            field: 'UAN',
            message: 'Missing 12-digit Universal Account Number (UAN). Worker cannot be included in official EPFO ECR upload.',
            affectedFilings: ['ECR']
          });
        } else if (!uanRegex.test(cleanUan)) {
          issues.push({
            workerId: w.id,
            workerName: w.name,
            severity: 'ERROR',
            field: 'UAN',
            message: `Invalid UAN "${cleanUan}". Must be exactly 12 numerical digits.`,
            affectedFilings: ['ECR']
          });
        }
      }

      // 3. ESIC IP Number validation (for employees earning <= 21,000)
      const isMonthly = w.wageType === 'MONTHLY' || w.wageConfig?.type === 'MONTHLY' || w.category === 'Monthly';
      const wage = isMonthly ? (w.wageConfig?.amount || w.monthlySalary || 0) : ((w.wageConfig?.amount || w.dailyWage || 0) * 26);
      if (!w.esiOptOut && wage <= 21000) {
        const cleanEsic = (w.esicIp || '').trim().replace(/[^0-9]/g, '');
        if (!cleanEsic) {
          issues.push({
            workerId: w.id,
            workerName: w.name,
            severity: 'WARNING',
            field: 'ESIC_IP',
            message: 'Missing ESIC Insurance Person (IP) number. ESI contributions cannot be reconciled on esic.gov.in.',
            affectedFilings: ['ECR']
          });
        }
      }

      // 4. Date of Joining
      const doj = w.joinedDate || w.dateOfJoining;
      if (!doj) {
        issues.push({
          workerId: w.id,
          workerName: w.name,
          severity: 'WARNING',
          field: 'JOIN_DATE',
          message: 'Missing Date of Joining (DOJ). Defaulting to beginning of statutory period.',
          affectedFilings: ['FORM_24Q', 'FORM_16']
        });
      }
    }

    const errorCount = issues.filter(i => i.severity === 'ERROR').length;
    const warningCount = issues.filter(i => i.severity === 'WARNING').length;
    const workersWithErrors = new Set(issues.filter(i => i.severity === 'ERROR').map(i => i.workerId)).size;
    const readyCount = Math.max(0, workers.length - workersWithErrors);

    return {
      isFilingReady: errorCount === 0,
      totalWorkers: workers.length,
      readyCount,
      warningCount,
      errorCount,
      issues,
      period: new Date().toISOString().slice(0, 7),
      filingType: filingCycle
    };
  },

  /**
   * Generate official EPFO ECR text format with Zero-Deduction and NCP days compliance
   * Official 11-column #~# delimited format:
   * UAN#~#MEMBER_NAME#~#GROSS#~#EPF_WAGES#~#EPS_WAGES#~#EDLI_WAGES#~#EE_SHARE#~#EPS_SHARE#~#ER_EPF_SHARE#~#NCP_DAYS#~#REFUND_ADVANCE
   */
  generateEPFO_ECR(
    workers: Worker[],
    payrolls: MonthlyPayroll[],
    periodMonthStr: string,
    options: { validOnly?: boolean } = {}
  ): { ecrContent: string; recordCount: number; omittedCount: number } {
    const lines: string[] = [];
    const workerMap = new Map(workers.map(w => [w.id, w]));

    const [yearStr, monthNumStr] = periodMonthStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthNumStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    let recordCount = 0;
    let omittedCount = 0;

    for (const w of workers) {
      if (w.pfOptOut) continue;

      const cleanUan = (w.uan || '').trim().replace(/[^0-9]/g, '');
      if (!cleanUan || cleanUan.length !== 12) {
        if (options.validOnly) {
          omittedCount++;
          continue;
        }
      }

      const uanToUse = cleanUan.length === 12 ? cleanUan : '000000000000';
      const memberName = (w.name || 'EMPLOYEE').toUpperCase().replace(/[^A-Z\s]/g, '').slice(0, 50);

      const payroll = payrolls.find(p => p.workerId === w.id);

      // Edge Case: Zero-deduction months:
      // Worker is enrolled in PF, but was absent all month or received 0 wage.
      // Must be included with 0 wages, 0 contributions, and NCP Days = total days in month.
      if (!payroll || payroll.earnings.gross <= 0) {
        lines.push(`${uanToUse}#~#${memberName}#~#0#~#0#~#0#~#0#~#0#~#0#~#0#~#${daysInMonth}#~#0`);
        recordCount++;
        continue;
      }

      const gross = Math.round(payroll.earnings.gross);
      const epfWages = Math.round(payroll.statutory?.pfWageBase || Math.min(payroll.earnings.basic, 15000));
      const epsWages = Math.min(epfWages, 15000);
      const edliWages = epsWages;
      const eeShare = Math.round(payroll.statutory?.employeePf || 0);
      const epsShare = Math.round(payroll.statutory?.employerEps || 0);
      const erEpfShare = Math.round(payroll.statutory?.employerEpf || 0);
      
      // NCP (Non-Contributing Period) Days = Absent days without pay
      const ncpDays = Math.min(daysInMonth, Math.max(0, payroll.attendanceSummary.absentDays));
      const refund = 0;

      lines.push(`${uanToUse}#~#${memberName}#~#${gross}#~#${epfWages}#~#${epsWages}#~#${edliWages}#~#${eeShare}#~#${epsShare}#~#${erEpfShare}#~#${ncpDays}#~#${refund}`);
      recordCount++;
    }

    return {
      ecrContent: lines.join('\r\n'),
      recordCount,
      omittedCount
    };
  },

  /**
   * Generate Form 24Q Quarterly Return Text File for TRACES / NSDL FVU
   * Handles mid-quarter employee exits
   */
  generateForm24Q_Text(
    workers: Worker[],
    payrolls: MonthlyPayroll[],
    quarterInfo: Form24QQuarterInfo,
    orgSettings: OrgSettings,
    tenantProfile?: { name?: string; address?: string }
  ): { fvuText: string; totalTaxDeducted: number; deducteeCount: number } {
    const lines: string[] = [];
    const now = new Date();
    const fileCreationDate = now.toLocaleDateString('en-GB').replace(/\//g, ''); // DDMMYYYY

    const employerName = (tenantProfile?.name || 'ORGANIZATION PVT LTD').toUpperCase().slice(0, 75);
    const employerTan = (orgSettings.compliance?.pfRegistrationNumber?.slice(0, 10) || 'MUMB12345E').toUpperCase();
    const employerPan = 'AAACM1234F';

    // Filter workers who were active during any part of this quarter
    // Edge case: Employee exited BEFORE this quarter started -> exclude!
    // Edge case: Employee exited DURING this quarter -> include with exit date!
    const activeQuarterWorkers = workers.filter(w => {
      if (w.dateOfExit && w.dateOfExit < quarterInfo.startDate) {
        return false;
      }
      return true;
    });

    let totalQuarterGross = 0;
    let totalQuarterTds = 0;

    const deducteeRecords: string[] = [];
    let deducteeIdx = 1;

    for (const w of activeQuarterWorkers) {
      const workerPayrolls = payrolls.filter(p => p.workerId === w.id);
      const workerGross = workerPayrolls.reduce((sum, p) => sum + p.earnings.gross, 0);
      const workerTds = workerPayrolls.reduce((sum, p) => sum + (p.statutory?.tds || 0), 0);

      totalQuarterGross += workerGross;
      totalQuarterTds += workerTds;

      const pan = (w.pan || 'PANNOTAVBL').toUpperCase();
      const panStatus = pan === 'PANNOTAVBL' ? 'C' : 'G';
      const cleanName = w.name.toUpperCase().replace(/[^A-Z\s]/g, '').slice(0, 75);
      
      const doj = (w.joinedDate || w.dateOfJoining || quarterInfo.startDate).slice(0, 10).replace(/-/g, '');
      const doe = (w.dateOfExit && w.dateOfExit >= quarterInfo.startDate && w.dateOfExit <= quarterInfo.endDate) 
        ? w.dateOfExit.slice(0, 10).replace(/-/g, '') 
        : '';

      // Line format: Deductee Record (DD)
      // DD^RecordNo^PAN^PANStatus^DeducteeName^PaymentDate^AmountPaid^TaxDeducted^Cess^TotalTax^Reason^DateOfExit
      deducteeRecords.push(`DD^${deducteeIdx}^${pan}^${panStatus}^${cleanName}^${quarterInfo.endDate.replace(/-/g, '')}^${Math.round(workerGross)}^${Math.round(workerTds)}^0^${Math.round(workerTds)}^${workerTds === 0 ? 'Y' : ''}^${doe}`);
      deducteeIdx++;
    }

    // File Header (FH)
    lines.push(`FH^NSDL-TDS-24Q-R8.2^${fileCreationDate}^1^${employerTan}^${employerPan}`);
    // Batch Header (BH)
    lines.push(`BH^1^${deducteeRecords.length}^24Q^${quarterInfo.quarter}^${quarterInfo.financialYear}^${quarterInfo.assessmentYear}^${employerName}^${employerTan}^${employerPan}^${Math.round(totalQuarterGross)}^${Math.round(totalQuarterTds)}`);
    // Challan Details (CD)
    lines.push(`CD^1^0021^0020101^${fileCreationDate}^10012^${Math.round(totalQuarterTds)}^0^0^0^${Math.round(totalQuarterTds)}^N`);
    // Deductee Details (DD)
    lines.push(...deducteeRecords);

    return {
      fvuText: lines.join('\r\n'),
      totalTaxDeducted: totalQuarterTds,
      deducteeCount: deducteeRecords.length
    };
  },

  /**
   * Generate Form 24Q CSV Annexure for human auditing and accountant records
   */
  generateForm24Q_CSV(
    workers: Worker[],
    payrolls: MonthlyPayroll[],
    quarterInfo: Form24QQuarterInfo
  ): string {
    const headers = [
      'Sl No',
      'Worker ID',
      'Employee Name',
      'PAN',
      'PAN Status',
      'Department',
      'Designation',
      'Date of Joining',
      'Date of Exit (Mid-Quarter)',
      'Gross Salary Paid (₹)',
      'Reported Standard Deduction (₹)',
      'Chapter VI-A Deductions (₹)',
      'Taxable Income (₹)',
      'TDS Deducted (₹)',
      'Filing Quarter',
      'Financial Year'
    ];

    const rows: string[][] = [];
    let idx = 1;

    for (const w of workers) {
      if (w.dateOfExit && w.dateOfExit < quarterInfo.startDate) continue;

      const workerPayrolls = payrolls.filter(p => p.workerId === w.id);
      const gross = workerPayrolls.reduce((sum, p) => sum + p.earnings.gross, 0);
      const tds = workerPayrolls.reduce((sum, p) => sum + (p.statutory?.tds || 0), 0);

      const isExitInQuarter = w.dateOfExit && w.dateOfExit >= quarterInfo.startDate && w.dateOfExit <= quarterInfo.endDate;
      const exitNote = isExitInQuarter ? w.dateOfExit : (w.dateOfExit ? 'Exited outside quarter' : 'Active');

      const standardDeduction = (w.taxRegime === 'OLD' ? 50000 : 75000) / 4; // Quarterly equivalent
      const chapterVIA = ((w.taxDeclarations?.section80C || 0) + (w.taxDeclarations?.section80D || 0)) / 4;
      const taxable = Math.max(0, gross - standardDeduction - chapterVIA);

      rows.push([
        idx.toString(),
        `"${w.id}"`,
        `"${w.name}"`,
        `"${w.pan || 'PANNOTAVBL'}"`,
        `"${w.pan ? 'VALID' : 'MISSING (Section 206AA Applies)'}"`,
        `"${w.department}"`,
        `"${w.designation}"`,
        `"${w.joinedDate || w.dateOfJoining || ''}"`,
        `"${exitNote}"`,
        Math.round(gross).toString(),
        Math.round(standardDeduction).toString(),
        Math.round(chapterVIA).toString(),
        Math.round(taxable).toString(),
        Math.round(tds).toString(),
        quarterInfo.quarter,
        quarterInfo.financialYear
      ]);
      idx++;
    }

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  },

  /**
   * Generate official Form 16 Part A & Part B HTML printable certificate
   */
  generateForm16HTML(data: Form16Data, worker: Worker): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Form 16 Certificate - ${worker.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 24px; color: #1e293b; background: #fff; font-size: 12px; }
    .certificate { max-width: 800px; margin: 0 auto; border: 2px solid #0f172a; padding: 24px; }
    .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
    .header h1 { font-size: 16px; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }
    .header h2 { font-size: 13px; margin: 4px 0 0 0; color: #475569; font-weight: 600; }
    .header p { margin: 4px 0 0 0; font-size: 10px; color: #64748b; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 10px; text-transform: uppercase; background: #f1f5f9; border: 1px solid #cbd5e1; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; margin-bottom: 16px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
    th { background: #f8fafc; font-weight: 700; font-size: 11px; text-transform: uppercase; color: #334155; }
    .text-right { text-align: right; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .section-title { font-weight: 800; font-size: 12px; text-transform: uppercase; background: #f1f5f9; padding: 6px 10px; border: 1px solid #cbd5e1; border-bottom: none; margin-top: 16px; }
    .verification { margin-top: 24px; border: 1px solid #cbd5e1; padding: 12px; font-size: 10px; line-height: 1.5; color: #475569; }
    .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 36px; padding-top: 12px; }
    .sign-box { border-top: 1px dashed #94a3b8; text-align: center; padding-top: 6px; font-size: 11px; font-weight: 600; }
    @media print {
      body { padding: 0; }
      .certificate { border: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="certificate">
    <div class="header">
      <h1>FORM NO. 16</h1>
      <p>[See rule 31(1)(a)]</p>
      <h2>PART A &amp; PART B CERTIFICATE UNDER SECTION 203 OF THE INCOME-TAX ACT, 1961</h2>
      <p>Certificate for tax deducted at source on salary paid to an employee</p>
    </div>

    <!-- Deductor & Deductee Header -->
    <table>
      <tr>
        <th colspan="2">Name and Address of Employer (Deductor)</th>
        <th colspan="2">Name and Designation of Employee (Deductee)</th>
      </tr>
      <tr>
        <td colspan="2" style="vertical-align: top;">
          <strong>${data.employerName}</strong><br>
          TAN: <span class="font-mono"><strong>${data.employerTan || 'MUMB12345E'}</strong></span><br>
          PAN: <span class="font-mono"><strong>${data.employerPan || 'AAACM1234F'}</strong></span>
        </td>
        <td colspan="2" style="vertical-align: top;">
          <strong>${worker.name}</strong><br>
          Designation: ${worker.designation || 'Staff'} (${worker.department})<br>
          PAN: <span class="font-mono"><strong>${worker.pan || 'PANNOTAVBL'}</strong></span><br>
          Tax Regime: <span class="badge">${data.regime} Regime (Sec 115BAC)</span>
        </td>
      </tr>
      <tr>
        <th>Assessment Year</th>
        <th class="font-mono">${data.assessmentYear}</th>
        <th>Period with the Employer</th>
        <th class="font-mono">${data.periodFrom} to ${data.periodTo}</th>
      </tr>
    </table>

    <!-- PART B: Details of Salary Paid and Tax Computed -->
    <div class="section-title">PART B: Details of Salary Paid and any other income and tax deducted</div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="text-right">Amount (₹)</th>
          <th class="text-right">Deduction (₹)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>1. Gross Salary under section 17(1)</td>
          <td class="text-right font-mono"><strong>₹${data.grossSalary.toLocaleString()}</strong></td>
          <td class="text-right font-mono">-</td>
        </tr>
        <tr>
          <td>2. Standard Deduction under section 16(ia)</td>
          <td class="text-right font-mono">-</td>
          <td class="text-right font-mono text-emerald-700">₹${data.standardDeduction.toLocaleString()}</td>
        </tr>
        <tr>
          <td>3. Chapter VI-A Deductions (Section 80C, 80D, NPS)</td>
          <td class="text-right font-mono">-</td>
          <td class="text-right font-mono text-emerald-700">₹${(data.section80C + data.section80D + data.otherExemptions).toLocaleString()}</td>
        </tr>
        <tr style="background: #f8fafc; font-weight: bold;">
          <td>4. Total Taxable Income (1 - 2 - 3)</td>
          <td colspan="2" class="text-right font-mono"><strong>₹${data.taxableIncome.toLocaleString()}</strong></td>
        </tr>
        <tr>
          <td>5. Tax Computed on Total Income</td>
          <td colspan="2" class="text-right font-mono">₹${data.taxOnTotalIncome.toLocaleString()}</td>
        </tr>
        <tr>
          <td>6. Rebate under Section 87A</td>
          <td colspan="2" class="text-right font-mono">₹${data.rebate87A.toLocaleString()}</td>
        </tr>
        <tr>
          <td>7. Health and Education Cess @ 4%</td>
          <td colspan="2" class="text-right font-mono">₹${data.healthAndEduCess.toLocaleString()}</td>
        </tr>
        <tr style="background: #f1f5f9; font-weight: 800; font-size: 13px;">
          <td>8. Net Tax Deducted at Source (TDS Deposited with Central Govt)</td>
          <td colspan="2" class="text-right font-mono" style="color: #047857;"><strong>₹${data.taxDeductedAtSource.toLocaleString()}</strong></td>
        </tr>
      </tbody>
    </table>

    <div class="verification">
      <strong>Verification:</strong> I, authorized signatory on behalf of <strong>${data.employerName}</strong>, do hereby certify that a sum of ₹${data.taxDeductedAtSource.toLocaleString()} has been deducted and deposited to the credit of the Central Government. I further certify that the information given above is true, complete and correct based on the books of account, documents, TDS statements, and tax credit records.
    </div>

    <div class="signature-grid">
      <div class="sign-box">
        Date: ${new Date().toLocaleDateString('en-GB')}<br>
        Place: Factory Unit / Admin HQ
      </div>
      <div class="sign-box">
        Signature of Person Responsible for Deducting Tax<br>
        <strong>Authorized Signatory</strong>
      </div>
    </div>
  </div>
</body>
</html>`;
  },

  /**
   * Pre-export Validation Audit Report text file content
   */
  generateValidationReportText(report: FilingValidationReport): string {
    const lines: string[] = [
      '================================================================================',
      'WORKFORCEPRO STATUTORY FILING VALIDATION AUDIT REPORT',
      `Filing Period: ${report.period} | Cycle: ${report.filingType}`,
      `Generated At: ${new Date().toISOString()}`,
      '================================================================================',
      '',
      `Total Employees Audited : ${report.totalWorkers}`,
      `Filing-Ready Employees  : ${report.readyCount}`,
      `Employees with Warnings : ${report.warningCount}`,
      `Employees with Errors   : ${report.errorCount}`,
      `Overall Filing Health   : ${report.isFilingReady ? '100% READY (PASS)' : 'ATTENTION REQUIRED'}`,
      '',
      '--------------------------------------------------------------------------------',
      'ITEMIZED COMPLIANCE FINDINGS BY EMPLOYEE',
      '--------------------------------------------------------------------------------'
    ];

    if (report.issues.length === 0) {
      lines.push('No issues detected! All workers possess valid 12-digit UAN, 10-character PAN, and complete records.');
    } else {
      report.issues.forEach((issue, index) => {
        lines.push(`[${index + 1}] [${issue.severity}] Worker: ${issue.workerName} (${issue.workerId})`);
        lines.push(`    Field: ${issue.field} | Affected: ${issue.affectedFilings.join(', ')}`);
        lines.push(`    Detail: ${issue.message}`);
        lines.push('');
      });
    }

    lines.push('--------------------------------------------------------------------------------');
    lines.push('FILING INSTRUCTIONS FOR HR ADMIN:');
    lines.push('1. EPFO ECR: Upload the .txt file directly to unifiedportal-emp.epfindia.gov.in (ECR 2.0 Upload).');
    lines.push('2. Form 24Q: Use the .txt file with NSDL e-TDS File Validation Utility (FVU) or provide the CSV to your CA.');
    lines.push('3. Form 16: Distribute the generated Part A & Part B certificates to employees by July 15.');
    lines.push('================================================================================');

    return lines.join('\r\n');
  }
};
