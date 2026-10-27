// src/screens/ReportsScreen.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Download, MapPinOff, Clock, UserCheck, AlertCircle, Shield, FileText, 
  FileSpreadsheet, Lock, Printer, Search, CheckCircle2, ChevronRight, 
  HelpCircle, Calendar, Building2, Eye, Filter
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dbService } from '../services/db';
import * as XLSX from 'xlsx';

// Capacitor Native Support
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

// Web Worker for non-blocking calculations
import ReportWorker from '../workers/reportWorker?worker';

export const ReportsScreen: React.FC = () => {
  const { profile, limits, tenantPlan } = useAuth();
  const { toast } = useToast();
  const workerRef = useRef<Worker | null>(null);

  const getLocalMonth = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const [reportMonth, setReportMonth] = useState(getLocalMonth());
  const [reportData, setReportData] = useState<any[]>([]);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [orgSettings, setOrgSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View state: 'DAY_BY_DAY' (Form T Statutory Grid) or 'SUMMARY' (High-density Overview)
  const [viewMode, setViewMode] = useState<'DAY_BY_DAY' | 'SUMMARY'>('DAY_BY_DAY');
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');

  // Days in selected month
  const [yearStr, monthStr] = reportMonth.split('-');
  const daysInMonth = useMemo(() => {
    return new Date(parseInt(yearStr, 10), parseInt(monthStr, 10), 0).getDate();
  }, [yearStr, monthStr]);

  // Days array [1, 2, ..., daysInMonth]
  const monthDays = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  }, [daysInMonth]);

  // Initialize Web Worker
  useEffect(() => {
    workerRef.current = new ReportWorker();
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const runWorkerTask = (action: string, payload: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) return reject(new Error("Worker not initialized"));

      const id = Math.random().toString(36).substring(7);

      const handleMessage = (e: MessageEvent) => {
        if (e.data.id === id) {
          workerRef.current?.removeEventListener('message', handleMessage);
          if (e.data.success) {
            resolve(e.data.result);
          } else {
            reject(new Error(e.data.error));
          }
        }
      };

      workerRef.current.addEventListener('message', handleMessage);
      workerRef.current.postMessage({ action, payload, id });
    });
  };

  // Fetch workers, settings and attendance history
  useEffect(() => {
    const fetchReportData = async () => {
      if (!profile?.tenantId) return;
      setLoading(true);
      setError(null);

      try {
        const [workers, allAttendance, settings] = await Promise.all([
          dbService.getWorkers(profile.tenantId),
          dbService.getAttendanceHistory(profile.tenantId),
          dbService.getOrgSettings(profile.tenantId)
        ]);

        setOrgSettings(settings);

        const monthAttendance = allAttendance.filter(r => r.date && r.date.startsWith(reportMonth));

        const aggregated = await runWorkerTask('AGGREGATE_REPORT', {
          workers,
          monthAttendance,
          orgSettings: settings,
          reportMonth
        });

        setReportData(aggregated.workerRows || []);
        setSummaryData(aggregated.summary || null);

      } catch (err: any) {
        console.error("Error generating report:", err);
        setError("Failed to load statutory report data.");
        toast.error("Could not calculate muster roll metrics");
      } finally {
        setLoading(false);
      }
    };

    fetchReportData();
  }, [profile, reportMonth]);

  // Unique departments for filter
  const departments = useMemo(() => {
    const depts = new Set<string>();
    reportData.forEach(r => {
      if (r.department) depts.add(r.department);
    });
    return Array.from(depts);
  }, [reportData]);

  // Filtered workers list
  const filteredData = useMemo(() => {
    return reportData.filter(row => {
      const matchesSearch = row.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.designation.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (row.uan && row.uan.includes(searchQuery)) ||
        (row.esicIp && row.esicIp.includes(searchQuery));
      const matchesDept = departmentFilter === 'ALL' || row.department === departmentFilter;
      return matchesSearch && matchesDept;
    });
  }, [reportData, searchQuery, departmentFilter]);

  // ==========================================
  // HELPER: SAVE FILE (WEB / CAPACITOR NATIVE)
  // ==========================================
  const saveOrDownloadFile = async (fileName: string, content: string | Uint8Array, mimeType: string, isBase64: boolean = false) => {
    if (Capacitor.isNativePlatform()) {
      await Filesystem.writeFile({
        path: fileName,
        data: content as any,
        directory: Directory.Documents,
        encoding: isBase64 ? undefined : Encoding.UTF8
      });
      toast.success(`Saved to Documents: ${fileName}`);
    } else {
      let blob: Blob;
      if (typeof content === 'string') {
        blob = new Blob([content], { type: mimeType });
      } else {
        blob = new Blob([content as any], { type: mimeType });
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success(`Exported ${fileName}`);
    }
  };

  // ==========================================
  // 1. MUSTER ROLL CSV EXPORT
  // ==========================================
  const exportMusterCSV = async () => {
    if (reportData.length === 0) {
      toast.info("No attendance data to export for this month.");
      return;
    }

    try {
      setLoading(true);
      const csvContent = await runWorkerTask('GENERATE_CSV', {
        workerRows: reportData,
        daysInMonth,
        reportMonth
      });
      const fileName = `Form_T_Muster_Roll_${reportMonth.replace('-', '_')}.csv`;
      await saveOrDownloadFile(fileName, csvContent, 'text/csv');
    } catch (err: any) {
      toast.error("Failed to export Muster Roll CSV");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // 2. FORM T MUSTER ROLL EXCEL (.XLSX)
  // ==========================================
  const exportFormTExcel = async () => {
    if (reportData.length === 0) {
      toast.info("No attendance data available.");
      return;
    }

    try {
      setLoading(true);

      // Construct Form T structure matching Indian Ease of Compliance Rules 2017
      const estName = profile?.companyName || 'Industrial Manufacturing Unit';
      const pfCode = orgSettings?.compliance?.pfRegistrationNumber || 'GJ/AHM/0034821';
      const esicCode = orgSettings?.compliance?.esicCode || '3100049281';

      const excelRows: any[] = [];

      reportData.forEach((worker, idx) => {
        const row: any = {
          'Sl. No.': idx + 1,
          'Emp ID': worker.id,
          'Name of Workman': worker.name,
          "Father's / Husband's Name": worker.fatherName,
          'Gender': worker.gender,
          'Designation': worker.designation,
          'Category': worker.category,
          'EPFO UAN': worker.uan || '-',
          'ESIC IP': worker.esicIp || '-'
        };

        // Day columns
        for (let d = 1; d <= daysInMonth; d++) {
          row[`D${d}`] = worker.dailyAttendance?.[d]?.code || '-';
        }

        // Summary columns
        row['Days in Month'] = daysInMonth;
        row['Days Worked (P)'] = worker.present;
        row['Half Days (HD)'] = worker.halfDay;
        row['Weekly Offs (WO)'] = worker.weeklyOff;
        row['Paid Holidays (PH)'] = worker.paidHoliday;
        row['Paid Leaves (L)'] = worker.paidLeave;
        row['Payable Days'] = worker.payableDays;
        row['Absent Days (A)'] = worker.absent;
        row['OT Hours'] = worker.otHours;
        row['Late Marks'] = worker.late;
        row['Geofence Flags'] = worker.geofenceViolations;

        excelRows.push(row);
      });

      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Form T Muster Roll');

      const fileName = `Form_T_Muster_Roll_${reportMonth.replace('-', '_')}.xlsx`;

      if (Capacitor.isNativePlatform()) {
        const base64Excel = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
        await saveOrDownloadFile(fileName, base64Excel, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true);
      } else {
        XLSX.writeFile(workbook, fileName, { bookType: 'xlsx' });
        toast.success(`Exported ${fileName}`);
      }
    } catch (err: any) {
      toast.error(`Failed to export Form T Excel: ${err.message}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // 3. EPFO ECR 2.0 OFFICIAL TEXT FILE (#~#)
  // ==========================================
  const generateECRTextFile = async () => {
    if (!profile?.tenantId) {
      toast.error("Organization tenant ID not found");
      return;
    }

    try {
      setLoading(true);
      const [workers, allAttendance, settings] = await Promise.all([
        dbService.getWorkers(profile.tenantId),
        dbService.getAttendanceHistory(profile.tenantId),
        dbService.getOrgSettings(profile.tenantId)
      ]);

      const pfSettings = settings?.compliance || {
        capPfDeduction: true,
        dailyWagePfPercentage: 100,
        pfContributionRate: 12,
        epsContributionRate: 8.33,
        epfWageCeiling: 15000
      };

      const monthAttendance = allAttendance.filter(r => r.date && r.date.startsWith(reportMonth));

      const { textContent, processedCount, skippedCount, challanSummary } = await runWorkerTask('GENERATE_ECR', {
        workers,
        monthAttendance,
        pfSettings,
        daysInMonth
      });

      if (processedCount === 0) {
        toast.warning(`No eligible workers found. ${skippedCount} workers skipped (missing UAN).`);
        setLoading(false);
        return;
      }

      const fileName = `EPFO_ECR_2.0_${reportMonth.replace('-', '')}.txt`;
      await saveOrDownloadFile(fileName, textContent, 'text/plain;charset=utf-8');
      toast.success(`Official EPFO ECR 2.0 downloaded (${processedCount} members, ₹${challanSummary.totalChallanDues.toLocaleString('en-IN')} total dues)`);

    } catch (err: any) {
      toast.error(`Failed to generate EPFO ECR file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // 4. EPFO MONTHLY RETURN & CHALLAN SHEET (.XLSX)
  // ==========================================
  const generateEPFOSheet = async () => {
    if (!profile?.tenantId) return;

    try {
      setLoading(true);
      const [workers, allAttendance, settings] = await Promise.all([
        dbService.getWorkers(profile.tenantId),
        dbService.getAttendanceHistory(profile.tenantId),
        dbService.getOrgSettings(profile.tenantId)
      ]);

      const pfSettings = settings?.compliance || {
        capPfDeduction: true,
        dailyWagePfPercentage: 100,
        pfContributionRate: 12,
        epsContributionRate: 8.33,
        epfWageCeiling: 15000
      };

      const monthAttendance = allAttendance.filter(r => r.date && r.date.startsWith(reportMonth));

      const { ecrTableRows, challanSummary, processedCount } = await runWorkerTask('GENERATE_ECR', {
        workers,
        monthAttendance,
        pfSettings,
        daysInMonth
      });

      if (!ecrTableRows || ecrTableRows.length === 0) {
        toast.warning("No workers with valid UAN found.");
        setLoading(false);
        return;
      }

      // 1. Member sheet
      const memberSheet = XLSX.utils.json_to_sheet(ecrTableRows);

      // 2. Challan Summary sheet
      const challanRows = [
        { 'EPFO Account Description': 'A/c No. 1 - EPF Employee Share (12%)', 'Statutory Rate': '12.00%', 'Amount (₹)': challanSummary.account1_EE },
        { 'EPFO Account Description': 'A/c No. 1 - EPF Employer Share (Difference 3.67%)', 'Statutory Rate': '3.67%', 'Amount (₹)': challanSummary.account1_ER },
        { 'EPFO Account Description': 'A/c No. 2 - EPF Administrative Charges (Min ₹500)', 'Statutory Rate': '0.50%', 'Amount (₹)': challanSummary.account2_Admin },
        { 'EPFO Account Description': 'A/c No. 10 - EPS Pension Fund (Capped ₹1,250/m)', 'Statutory Rate': '8.33%', 'Amount (₹)': challanSummary.account10_EPS },
        { 'EPFO Account Description': 'A/c No. 21 - EDLI Insurance Contribution', 'Statutory Rate': '0.50%', 'Amount (₹)': challanSummary.account21_EDLI },
        { 'EPFO Account Description': 'A/c No. 22 - EDLI Administration Charges', 'Statutory Rate': '0.00%', 'Amount (₹)': 0 },
        { 'EPFO Account Description': 'TOTAL EPFO CHALLAN DUES PAYABLE (TRRN)', 'Statutory Rate': 'TOTAL', 'Amount (₹)': challanSummary.totalChallanDues }
      ];
      const challanSheet = XLSX.utils.json_to_sheet(challanRows);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, memberSheet, 'EPF Member Statement');
      XLSX.utils.book_append_sheet(workbook, challanSheet, 'EPFO Challan Summary');

      const fileName = `EPFO_Monthly_Return_${reportMonth.replace('-', '')}.xlsx`;

      if (Capacitor.isNativePlatform()) {
        const base64Excel = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
        await saveOrDownloadFile(fileName, base64Excel, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true);
      } else {
        XLSX.writeFile(workbook, fileName, { bookType: 'xlsx' });
        toast.success(`EPFO Monthly Return Sheet downloaded (${processedCount} members)`);
      }

    } catch (err: any) {
      toast.error(`Failed to export EPFO Return Sheet: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // 5. OFFICIAL ESIC PORTAL UPLOAD EXCEL (.XLSX)
  // ==========================================
  const generateESICPortalUpload = async () => {
    if (!profile?.tenantId) return;

    try {
      setLoading(true);
      const [workers, allAttendance] = await Promise.all([
        dbService.getWorkers(profile.tenantId),
        dbService.getAttendanceHistory(profile.tenantId)
      ]);

      const monthAttendance = allAttendance.filter(r => r.date && r.date.startsWith(reportMonth));

      const { portalUploadData, processedCount, skippedCount, ineligibleCount } = await runWorkerTask('GENERATE_ESIC', {
        workers,
        monthAttendance,
        daysInMonth
      });

      if (portalUploadData.length === 0) {
        toast.warning(`No eligible ESIC records. ${skippedCount} missing IP, ${ineligibleCount} exceed ₹21,000 wage ceiling.`);
        setLoading(false);
        return;
      }

      // Official ESIC Portal format: exact 6 columns
      const worksheet = XLSX.utils.json_to_sheet(portalUploadData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Monthly Contribution');
      worksheet['!cols'] = [
        { wch: 16 }, // IP Number
        { wch: 26 }, // IP Name
        { wch: 30 }, // No of Days
        { wch: 22 }, // Total Monthly Wages
        { wch: 24 }, // Reason Code
        { wch: 18 }  // Last Working Day
      ];

      const fileName = `ESIC_Portal_Upload_${reportMonth.replace('-', '')}.xlsx`;

      if (Capacitor.isNativePlatform()) {
        const base64Excel = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
        await saveOrDownloadFile(fileName, base64Excel, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true);
      } else {
        XLSX.writeFile(workbook, fileName, { bookType: 'xlsx' });
        toast.success(`Official ESIC Portal Upload file downloaded (${processedCount} IPs)`);
      }

    } catch (err: any) {
      toast.error(`Failed to generate ESIC file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // 6. ESIC CONTRIBUTION REGISTER & AUDIT (.XLSX)
  // ==========================================
  const generateESICAuditRegister = async () => {
    if (!profile?.tenantId) return;

    try {
      setLoading(true);
      const [workers, allAttendance] = await Promise.all([
        dbService.getWorkers(profile.tenantId),
        dbService.getAttendanceHistory(profile.tenantId)
      ]);

      const monthAttendance = allAttendance.filter(r => r.date && r.date.startsWith(reportMonth));

      const { contributionStatementData, challanSummary, processedCount } = await runWorkerTask('GENERATE_ESIC', {
        workers,
        monthAttendance,
        daysInMonth
      });

      if (!contributionStatementData || contributionStatementData.length === 0) {
        toast.warning("No eligible ESIC records found.");
        setLoading(false);
        return;
      }

      const registerSheet = XLSX.utils.json_to_sheet(contributionStatementData);

      const challanRows = [
        { 'Metric': 'Total Insured Persons Covered', 'Value': challanSummary.processedCount },
        { 'Metric': 'Total Insurable Gross Wages (₹)', 'Value': challanSummary.totalGross },
        { 'Metric': 'Total Employee Contribution @ 0.75% (₹)', 'Value': challanSummary.totalEeContribution },
        { 'Metric': 'Total Employer Contribution @ 3.25% (₹)', 'Value': challanSummary.totalErContribution },
        { 'Metric': 'TOTAL ESIC REMITTANCE PAYABLE (₹)', 'Value': challanSummary.totalRemittance }
      ];
      const challanSheet = XLSX.utils.json_to_sheet(challanRows);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, registerSheet, 'Contribution Register');
      XLSX.utils.book_append_sheet(workbook, challanSheet, 'ESIC Challan Summary');

      const fileName = `ESIC_Contribution_Register_${reportMonth.replace('-', '')}.xlsx`;

      if (Capacitor.isNativePlatform()) {
        const base64Excel = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
        await saveOrDownloadFile(fileName, base64Excel, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true);
      } else {
        XLSX.writeFile(workbook, fileName, { bookType: 'xlsx' });
        toast.success(`ESIC Contribution Register downloaded (${processedCount} IPs)`);
      }

    } catch (err: any) {
      toast.error(`Failed to export ESIC Register: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Helper for attendance code styling
  const getBadgeStyle = (code: string) => {
    switch (code) {
      case 'P': return 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold';
      case 'HD': return 'bg-amber-50 text-amber-700 border-amber-200 font-bold';
      case 'WO': return 'bg-slate-100 text-slate-500 font-medium';
      case 'PH': return 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold';
      case 'PL':
      case 'CL':
      case 'SL':
      case 'L': return 'bg-cyan-50 text-cyan-700 border-cyan-200 font-semibold';
      case 'HW': return 'bg-teal-50 text-teal-700 border-teal-200 font-bold';
      case 'A': return 'bg-rose-50 text-rose-700 border-rose-200 font-bold';
      default: return 'text-slate-300 font-normal';
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* TOOLBAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Factory Reports & Compliance</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              India Statutory
            </span>
          </div>
          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-1">
            <span>Form T Muster Roll (Rule 24(1) Code on Wages)</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>EPFO ECR 2.0</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>ESIC Act 1948</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums font-semibold text-slate-700">
              {new Date(reportMonth + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
            <Calendar size={15} className="text-slate-400 mr-2 shrink-0" />
            <input 
              type="month" 
              className="bg-transparent text-xs font-semibold text-slate-800 outline-none cursor-pointer"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
            />
          </div>

          <button 
            onClick={() => window.print()}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition-colors"
            title="Print Official Form T Register"
          >
            <Printer size={15} />
            <span>Print Form T</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50/80 border border-rose-200 text-rose-800 p-4 rounded-2xl flex items-center gap-2.5 text-xs">
          <AlertCircle size={16} className="text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Reported Staff</span>
            <UserCheck size={16} className="text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-2">
            {loading ? '-' : reportData.length}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Active workforce on muster</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payable Days</span>
            <FileText size={16} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-emerald-600 mt-2">
            {loading ? '-' : summaryData?.totalPayableDays?.toFixed(1) || '0'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Present + WO + Holidays + Leaves</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Shift Overtime</span>
            <Clock size={16} className="text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-amber-600 mt-2">
            {loading ? '-' : `${summaryData?.totalOTHours || '0.0'}h`}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Statutory double-rate hours</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Geofence Flags</span>
            <MapPinOff size={16} className="text-rose-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-rose-600 mt-2">
            {loading ? '-' : summaryData?.totalGeofenceViolations || 0}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Punches outside factory radius</p>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 1. GOVERNMENT STATUTORY RETURNS (EPFO & ESIC) */}
      {/* ======================================================== */}
      {limits?.statutoryComplianceEnabled ? (
        <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-sm border border-indigo-900/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/80 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-900/50">
                <Shield size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-white tracking-tight">Government Statutory Returns</h3>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                    Indian Standards
                  </span>
                </div>
                <p className="text-xs text-indigo-200 mt-0.5 leading-relaxed">
                  Official EPFO ECR 2.0 text format for Unified Portal upload and ESIC monthly contribution return sheets.
                </p>
              </div>
            </div>

            {/* Quick Statutory Dues Snapshot */}
            {summaryData && (
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-xs shrink-0 font-mono">
                <div>
                  <span className="text-indigo-300 text-[10px] block uppercase font-sans font-semibold">EPF Dues</span>
                  <span className="font-bold text-white text-sm">₹{summaryData.epfo.totalChallanAmount.toLocaleString('en-IN')}</span>
                </div>
                <div className="w-px h-6 bg-white/20" />
                <div>
                  <span className="text-teal-300 text-[10px] block uppercase font-sans font-semibold">ESIC Dues</span>
                  <span className="font-bold text-white text-sm">₹{summaryData.esic.totalChallanAmount.toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* EPFO CARD */}
            <div className="bg-white/10 backdrop-blur-xs p-4 sm:p-5 rounded-xl border border-white/10 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <FileText size={18} className="text-indigo-300 shrink-0" />
                    <div>
                      <h4 className="font-bold text-sm text-white">EPFO Returns (EPF & EPS Scheme)</h4>
                      <p className="text-[11px] text-indigo-200">Electronic Challan Cum Return 2.0 (#~# text format)</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-400/20">
                    {summaryData?.epfo.coveredWorkers || 0} Members
                  </span>
                </div>

                {/* EPFO Metric Summary Strip */}
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/10 text-center font-mono text-[11px]">
                  <div className="bg-black/20 p-2 rounded-lg">
                    <span className="text-[9px] text-indigo-300 block font-sans uppercase">EPF Wages</span>
                    <span className="font-semibold text-white">₹{(summaryData?.epfo.totalEpfWages || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="bg-black/20 p-2 rounded-lg">
                    <span className="text-[9px] text-indigo-300 block font-sans uppercase">EE Share (12%)</span>
                    <span className="font-semibold text-white">₹{(summaryData?.epfo.totalEeShare || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="bg-black/20 p-2 rounded-lg">
                    <span className="text-[9px] text-indigo-300 block font-sans uppercase">ER Share (3.67%+8.33%)</span>
                    <span className="font-semibold text-white">₹{((summaryData?.epfo.totalErEpfShare || 0) + (summaryData?.epfo.totalEpsShare || 0)).toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="mt-2 text-[10px] text-indigo-300 flex items-center justify-between">
                  <span>A/c 2 Admin (0.5% min ₹500): ₹{summaryData?.epfo.adminCharges || 0}</span>
                  <span>A/c 21 EDLI (0.5%): ₹{summaryData?.epfo.edliCharges || 0}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button 
                  onClick={generateECRTextFile}
                  disabled={loading}
                  className="w-full bg-white hover:bg-indigo-50 text-slate-900 px-3 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-98 disabled:opacity-50"
                  title="Upload this .txt file directly to unifiedportal-emp.epfindia.gov.in"
                >
                  <Download size={14} className="text-indigo-600" />
                  <span>Download ECR 2.0 (.txt)</span>
                </button>

                <button 
                  onClick={generateEPFOSheet}
                  disabled={loading}
                  className="w-full bg-indigo-600/80 hover:bg-indigo-600 text-white px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border border-indigo-400/30 active:scale-98 disabled:opacity-50"
                  title="Complete member statement and challan reconciliation sheet"
                >
                  <FileSpreadsheet size={14} />
                  <span>Audit Statement (.xlsx)</span>
                </button>
              </div>
            </div>
            
            {/* ESIC CARD */}
            <div className="bg-white/10 backdrop-blur-xs p-4 sm:p-5 rounded-xl border border-white/10 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <FileSpreadsheet size={18} className="text-teal-300 shrink-0" />
                    <div>
                      <h4 className="font-bold text-sm text-white">ESIC Monthly Return (ESI Act, 1948)</h4>
                      <p className="text-[11px] text-teal-200">Official return for employees with gross wage ≤ ₹21,000</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-500/30 text-teal-200 border border-teal-400/20">
                    {summaryData?.esic.coveredWorkers || 0} Insured Persons
                  </span>
                </div>

                {/* ESIC Metric Summary Strip */}
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/10 text-center font-mono text-[11px]">
                  <div className="bg-black/20 p-2 rounded-lg">
                    <span className="text-[9px] text-teal-300 block font-sans uppercase">ESIC Wages</span>
                    <span className="font-semibold text-white">₹{(summaryData?.esic.totalWages || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="bg-black/20 p-2 rounded-lg">
                    <span className="text-[9px] text-teal-300 block font-sans uppercase">EE Share (0.75%)</span>
                    <span className="font-semibold text-white">₹{(summaryData?.esic.totalEeContribution || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="bg-black/20 p-2 rounded-lg">
                    <span className="text-[9px] text-teal-300 block font-sans uppercase">ER Share (3.25%)</span>
                    <span className="font-semibold text-white">₹{(summaryData?.esic.totalErContribution || 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="mt-2 text-[10px] text-teal-300 flex items-center justify-between">
                  <span>Total Contribution (4.00%): ₹{(summaryData?.esic.totalChallanAmount || 0).toLocaleString('en-IN')}</span>
                  <span>Wage Ceiling: ₹21,000 / month</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button 
                  onClick={generateESICPortalUpload}
                  disabled={loading}
                  className="w-full bg-teal-500 hover:bg-teal-400 text-slate-950 px-3 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-98 disabled:opacity-50"
                  title="Exact 6-column Excel template for upload on esic.gov.in"
                >
                  <Download size={14} />
                  <span>Portal Upload Sheet (.xlsx)</span>
                </button>

                <button 
                  onClick={generateESICAuditRegister}
                  disabled={loading}
                  className="w-full bg-teal-900/60 hover:bg-teal-900 text-teal-100 px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border border-teal-500/30 active:scale-98 disabled:opacity-50"
                  title="Detailed contribution register with employee and employer breakdown"
                >
                  <FileSpreadsheet size={14} />
                  <span>Contribution Register (.xlsx)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex items-center justify-between text-slate-500">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
              <Lock size={18} />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-800">Government Statutory Returns (EPFO & ESIC)</h4>
              <p className="text-xs text-slate-500 mt-0.5">Automated compliance generator is active on Enterprise & Pro plans.</p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. MONTHLY MUSTER ROLL (FORM T - INDIAN LABOUR STANDARD) */}
      {/* ======================================================== */}
      {tenantPlan !== 'FREE' ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* MUSTER ROLL HEADER & ESTABLISHMENT DETAILS */}
          <div className="p-4 sm:px-6 border-b border-slate-100 bg-slate-50/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <UserCheck size={18} className="text-blue-600 shrink-0" />
                  <h3 className="font-bold text-sm sm:text-base text-slate-900">FORM T - Monthly Muster Roll</h3>
                  <span className="text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                    Rule 24(1) Code on Wages
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-3 mt-1">
                  <span className="flex items-center gap-1">
                    <Building2 size={13} className="text-slate-400" />
                    <strong className="text-slate-700">{profile?.companyName || 'Apex Precision Engineering'}</strong>
                  </span>
                  <span>·</span>
                  <span>Wage Period: <strong className="text-slate-700">01/{monthStr}/{yearStr} - {daysInMonth}/{monthStr}/{yearStr}</strong></span>
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button 
                  onClick={exportFormTExcel} 
                  disabled={loading || reportData.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
                  title="Download Official Form T Register in Excel"
                >
                  <FileSpreadsheet size={14} />
                  <span>Export Form T (.xlsx)</span>
                </button>

                <button 
                  onClick={exportMusterCSV} 
                  disabled={loading || reportData.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
                  title="Export as CSV"
                >
                  <Download size={14} />
                  <span>CSV</span>
                </button>
              </div>
            </div>

            {/* CONTROLS: VIEW TOGGLE & SEARCH */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-200/60">
              <div className="flex items-center gap-1 bg-slate-200/60 p-0.5 rounded-lg text-xs self-start">
                <button
                  onClick={() => setViewMode('DAY_BY_DAY')}
                  className={`px-3 py-1 rounded-md font-semibold transition-all ${viewMode === 'DAY_BY_DAY' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Day-by-Day (1 to {daysInMonth})
                </button>
                <button
                  onClick={() => setViewMode('SUMMARY')}
                  className={`px-3 py-1 rounded-md font-semibold transition-all ${viewMode === 'SUMMARY' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Executive Summary
                </button>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {departments.length > 0 && (
                  <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg text-xs px-2.5 py-1.5 text-slate-700 outline-none"
                  >
                    <option value="ALL">All Departments</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                )}

                <div className="relative flex-1 sm:w-56">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search workman / UAN..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg text-xs pl-8 pr-3 py-1.5 text-slate-800 outline-none focus:border-blue-600"
                  />
                </div>
              </div>
            </div>

            {/* ATTENDANCE NOTATION LEGEND (Indian Standard) */}
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 text-[10px] text-slate-500 border-t border-slate-200/40">
              <span className="font-semibold text-slate-700">Notation Legend:</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">P</span>
              <span>Present</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-bold">HD</span>
              <span>Half Day</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">WO</span>
              <span>Weekly Off</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">PH</span>
              <span>Paid Holiday</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-200 font-semibold">L</span>
              <span>Leave (CL/SL/PL)</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold">A</span>
              <span>Absent (LWP)</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 font-bold">HW</span>
              <span>Holiday Worked</span>
            </div>
          </div>

          {/* VIEW MODE 1: FORM T STATUTORY DAY-BY-DAY (1 TO 31) MATRIX */}
          {viewMode === 'DAY_BY_DAY' ? (
            <div className="overflow-x-auto max-w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-semibold">
                  <tr>
                    <th className="py-2.5 px-3 sticky left-0 z-10 bg-slate-50 border-r border-slate-200 min-w-[40px] text-center">#</th>
                    <th className="py-2.5 px-3 sticky left-[40px] z-10 bg-slate-50 border-r border-slate-200 min-w-[170px]">Workman</th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-200 min-w-[70px]">Category</th>
                    
                    {/* Day Columns 1 to N */}
                    {monthDays.map(d => {
                      const dayDate = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, d);
                      const isSun = dayDate.getDay() === 0;
                      return (
                        <th 
                          key={d} 
                          className={`py-2 px-1 text-center font-mono min-w-[28px] max-w-[32px] border-r border-slate-100 ${isSun ? 'bg-indigo-50/50 text-indigo-700 font-bold' : ''}`}
                          title={`${d} ${dayDate.toLocaleString('default', { month: 'short' })}`}
                        >
                          <div>{d}</div>
                          <div className="text-[8px] font-normal text-slate-400">
                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][dayDate.getDay()]}
                          </div>
                        </th>
                      );
                    })}

                    {/* Summary Columns */}
                    <th className="py-2.5 px-2 text-center bg-slate-50 font-bold text-emerald-800 border-l border-r border-slate-200 min-w-[40px]" title="Days Worked">P</th>
                    <th className="py-2.5 px-2 text-center bg-slate-50 font-semibold text-amber-800 border-r border-slate-200 min-w-[40px]" title="Half Days">HD</th>
                    <th className="py-2.5 px-2 text-center bg-slate-50 font-semibold text-slate-600 border-r border-slate-200 min-w-[40px]" title="Weekly Offs">WO</th>
                    <th className="py-2.5 px-2 text-center bg-slate-50 font-semibold text-indigo-700 border-r border-slate-200 min-w-[40px]" title="Paid Holidays">PH</th>
                    <th className="py-2.5 px-2 text-center bg-slate-50 font-semibold text-cyan-700 border-r border-slate-200 min-w-[40px]" title="Paid Leaves">L</th>
                    <th className="py-2.5 px-2.5 text-center bg-indigo-50/80 font-extrabold text-indigo-900 border-r border-slate-200 min-w-[55px]" title="Payable / Paid Days">Paid Days</th>
                    <th className="py-2.5 px-2 text-center bg-slate-50 font-semibold text-rose-700 border-r border-slate-200 min-w-[40px]" title="Absent / LWP Days">A</th>
                    <th className="py-2.5 px-2.5 text-center bg-slate-50 font-semibold text-slate-800 border-r border-slate-200 min-w-[50px]" title="Overtime Hours">OT (h)</th>
                    <th className="py-2.5 px-3 bg-slate-50 text-slate-600 min-w-[120px]">Statutory IDs</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {loading ? (
                    [1, 2, 3, 4, 5].map(i => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={daysInMonth + 12} className="py-4 px-4">
                          <div className="h-3 bg-slate-100 rounded w-full" />
                        </td>
                      </tr>
                    ))
                  ) : filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={daysInMonth + 12} className="py-12 text-center text-slate-400 font-sans">
                        <FileText size={28} className="mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold text-slate-700 text-xs">No records found for {reportMonth}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Records update automatically with punches, kiosk sync, and supervisor logs.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((row, idx) => (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 sticky left-0 z-10 bg-white hover:bg-slate-50 border-r border-slate-100 text-center font-bold text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 sticky left-[40px] z-10 bg-white hover:bg-slate-50 border-r border-slate-200 font-sans">
                          <div className="font-bold text-slate-900 text-xs truncate max-w-[150px]">{row.name}</div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[150px]">{row.designation}</div>
                        </td>
                        <td className="py-2.5 px-2 text-center border-r border-slate-100 font-sans text-[10px] text-slate-600">
                          {row.category}
                        </td>

                        {/* Day Cells */}
                        {monthDays.map(d => {
                          const dayInfo = row.dailyAttendance?.[d];
                          const code = dayInfo?.code || '-';
                          const isSun = dayInfo?.dayOfWeek === 0;

                          return (
                            <td 
                              key={d} 
                              className={`py-1 px-0.5 text-center border-r border-slate-100 ${isSun ? 'bg-indigo-50/30' : ''}`}
                              title={`Day ${d}: ${dayInfo?.status || 'No record'} ${dayInfo?.otHours ? `(OT: ${dayInfo.otHours}h)` : ''}`}
                            >
                              <span className={`inline-block w-6 h-5 leading-5 text-[10px] rounded text-center ${getBadgeStyle(code)}`}>
                                {code}
                              </span>
                            </td>
                          );
                        })}

                        {/* Summary Metrics */}
                        <td className="py-2 px-1 text-center font-bold text-emerald-700 border-l border-r border-slate-100 bg-emerald-50/20">
                          {row.present}
                        </td>
                        <td className="py-2 px-1 text-center font-medium text-amber-700 border-r border-slate-100">
                          {row.halfDay}
                        </td>
                        <td className="py-2 px-1 text-center text-slate-500 border-r border-slate-100">
                          {row.weeklyOff}
                        </td>
                        <td className="py-2 px-1 text-center text-indigo-700 border-r border-slate-100">
                          {row.paidHoliday}
                        </td>
                        <td className="py-2 px-1 text-center text-cyan-700 border-r border-slate-100">
                          {row.paidLeave}
                        </td>
                        <td className="py-2 px-1 text-center font-bold text-indigo-900 bg-indigo-50/60 border-r border-slate-100 text-xs">
                          {row.payableDays}
                        </td>
                        <td className="py-2 px-1 text-center font-medium text-rose-600 border-r border-slate-100">
                          {row.absent}
                        </td>
                        <td className="py-2 px-1 text-center text-slate-800 font-semibold border-r border-slate-100">
                          {row.otHours}h
                        </td>
                        <td className="py-2 px-3 text-[10px] font-sans text-slate-600">
                          <div><span className="text-slate-400 font-mono text-[9px]">UAN:</span> {row.uan || '-'}</div>
                          <div><span className="text-slate-400 font-mono text-[9px]">ESI:</span> {row.esicIp || '-'}</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* VIEW MODE 2: EXECUTIVE SUMMARY VIEW */
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[10px]">
                  <tr>
                    <th className="py-3 px-4 sm:px-6">Personnel</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3 text-center">Worked (P)</th>
                    <th className="py-3 px-3 text-center">Payable Days</th>
                    <th className="py-3 px-3 text-center">Absent (LWP)</th>
                    <th className="py-3 px-3 text-center">OT Hours</th>
                    <th className="py-3 px-3 text-center">Late Marks</th>
                    <th className="py-3 px-3 text-right">Geofence Flags</th>
                    <th className="py-3 px-4 sm:px-6 text-right">Statutory Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {loading ? (
                    [1, 2, 3, 4, 5].map(i => (
                      <tr key={i} className="animate-pulse">
                        <td className="py-3.5 px-4 sm:px-6">
                          <div className="h-3.5 bg-slate-200 rounded w-28 mb-1" />
                          <div className="h-2.5 bg-slate-100 rounded w-16" />
                        </td>
                        <td className="py-3.5 px-3"><div className="h-4 bg-slate-100 rounded w-16" /></td>
                        <td className="py-3.5 px-3 text-center"><div className="h-4 bg-slate-100 rounded w-6 mx-auto" /></td>
                        <td className="py-3.5 px-3 text-center"><div className="h-4 bg-slate-100 rounded w-6 mx-auto" /></td>
                        <td className="py-3.5 px-3 text-center"><div className="h-4 bg-slate-100 rounded w-6 mx-auto" /></td>
                        <td className="py-3.5 px-3 text-center"><div className="h-4 bg-slate-100 rounded w-8 mx-auto" /></td>
                        <td className="py-3.5 px-3 text-center"><div className="h-4 bg-slate-100 rounded w-6 mx-auto" /></td>
                        <td className="py-3.5 px-3 text-right"><div className="h-4 bg-slate-100 rounded w-6 ml-auto" /></td>
                        <td className="py-3.5 px-4 sm:px-6 text-right"><div className="h-4 bg-slate-100 rounded w-16 ml-auto" /></td>
                      </tr>
                    ))
                  ) : filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400 font-sans">
                        <p className="font-semibold text-slate-700 text-xs">No records found</p>
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 sm:px-6 font-sans">
                          <p className="font-bold text-slate-900 text-xs">{row.name}</p>
                          <p className="text-[11px] text-slate-500">{row.designation} · {row.department}</p>
                        </td>
                        <td className="py-3.5 px-3 font-sans text-xs text-slate-600">
                          {row.category}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-emerald-700">
                          {row.present}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-indigo-900 bg-indigo-50/40">
                          {row.payableDays}
                        </td>
                        <td className="py-3.5 px-3 text-center font-medium text-slate-500">
                          {row.absent}
                        </td>
                        <td className="py-3.5 px-3 text-center text-slate-700 font-semibold">
                          {row.otHours}h
                        </td>
                        <td className="py-3.5 px-3 text-center font-semibold text-amber-700">
                          {row.late}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          {row.geofenceViolations > 0 ? (
                            <span className="text-rose-600 font-bold inline-flex items-center gap-1">
                              <AlertCircle size={12} /> {row.geofenceViolations}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 sm:px-6 text-right font-sans text-[11px]">
                          <div className="flex items-center justify-end gap-1.5">
                            {row.uan ? (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold text-[10px]">
                                PF
                              </span>
                            ) : null}
                            {row.esicIp ? (
                              <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 font-semibold text-[10px]">
                                ESI
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* FORM T STATUTORY DECLARATION FOOTER */}
          <div className="p-4 sm:px-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
            <div>
              <span>Prescribed under <strong>The Ease of Compliance to Maintain Registers Rules, 2017</strong> (Form T) &amp; <strong>Factories Act 1948</strong>.</span>
            </div>
            <div className="flex items-center gap-6">
              <span className="hidden md:inline">Prepared by: <strong>Timekeeper / HR Incharge</strong></span>
              <span>Signature of Employer / Manager: ___________________</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex items-center gap-3 text-slate-500">
          <Lock className="text-slate-400 shrink-0" size={18} />
          <div>
            <h4 className="font-bold text-sm text-slate-800">Monthly Muster Roll Locked</h4>
            <p className="text-xs text-slate-500 mt-0.5">Upgrade subscription plan in Billing to view and export full staff muster logs.</p>
          </div>
        </div>
      )}
    </div>
  );
};