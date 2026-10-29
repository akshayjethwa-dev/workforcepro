// src/workers/statutoryExportWorker.ts
import JSZip from 'jszip';
import { Worker, MonthlyPayroll, OrgSettings } from '../types/index';
import { statutoryExportService } from '../services/statutoryExportService';
import { statutoryEngine } from '../services/statutoryEngine';

self.onmessage = async (e: MessageEvent) => {
  const { id, action, payload } = e.data;

  if (action === 'VALIDATE_ONLY') {
    try {
      const { workers, payrolls, filingCycle } = payload;
      const report = statutoryExportService.validateWorkersForFiling(workers, payrolls, filingCycle);
      self.postMessage({ id, success: true, result: report });
    } catch (err: any) {
      self.postMessage({ id, success: false, error: err.message || 'Validation failed' });
    }
    return;
  }

  if (action === 'GENERATE_ZIP_PACK') {
    try {
      const {
        workers,
        payrolls,
        orgSettings,
        quarterKey = 'Q3',
        fyStartYear = 2025,
        selectedMonth = new Date().toISOString().slice(0, 7),
        tenantName = 'Factory Organization',
        options = { validOnly: false }
      }: {
        workers: Worker[];
        payrolls: MonthlyPayroll[];
        orgSettings: OrgSettings;
        quarterKey: 'Q1' | 'Q2' | 'Q3' | 'Q4';
        fyStartYear: number;
        selectedMonth: string;
        tenantName: string;
        options: { validOnly: boolean };
      } = payload;

      // 1. Validation Report
      self.postMessage({ id, progress: 15, statusText: 'Auditing statutory data compliance...' });
      const validationReport = statutoryExportService.validateWorkersForFiling(workers, payrolls, 'QUARTERLY');

      // Filter workers if validOnly is chosen
      let activeWorkers = workers;
      if (options.validOnly) {
        const errorWorkerIds = new Set(
          validationReport.issues.filter(i => i.severity === 'ERROR').map(i => i.workerId)
        );
        activeWorkers = workers.filter(w => !errorWorkerIds.has(w.id));
      }

      const zip = new JSZip();
      const zipFolderName = `Statutory_Filing_Pack_${selectedMonth}_${quarterKey}`;
      const rootFolder = zip.folder(zipFolderName) || zip;

      // 2. Generate EPFO ECR
      self.postMessage({ id, progress: 35, statusText: 'Generating EPFO ECR 2.0 text file...' });
      const ecrResult = statutoryExportService.generateEPFO_ECR(activeWorkers, payrolls, selectedMonth, options);
      const ecrFileName = `EPFO_ECR_2.0_${selectedMonth.replace('-', '')}.txt`;
      rootFolder.file(ecrFileName, ecrResult.ecrContent);

      // 3. Generate Form 24Q Quarterly Return
      self.postMessage({ id, progress: 55, statusText: 'Compiling Form 24Q TDS quarterly file...' });
      const quarterInfo = statutoryExportService.getQuarterInfo(quarterKey, fyStartYear);
      const form24QResult = statutoryExportService.generateForm24Q_Text(
        activeWorkers,
        payrolls,
        quarterInfo,
        orgSettings,
        { name: tenantName }
      );
      const form24QFileName = `Form_24Q_${quarterKey}_${quarterInfo.financialYear.replace('-', '_')}_FVU.txt`;
      rootFolder.file(form24QFileName, form24QResult.fvuText);

      // Form 24Q CSV Annexure
      const form24QCsv = statutoryExportService.generateForm24Q_CSV(activeWorkers, payrolls, quarterInfo);
      const form24QCsvName = `Form_24Q_Annexure_Summary_${quarterKey}.csv`;
      rootFolder.file(form24QCsvName, form24QCsv);

      // 4. Generate Form 16 Certificates (Part A & Part B)
      self.postMessage({ id, progress: 75, statusText: 'Building Form 16 Part A & B employee certificates...' });
      const form16Folder = rootFolder.folder('Form16_Certificates') || rootFolder;

      let form16Count = 0;
      for (const w of activeWorkers) {
        const form16Data = statutoryEngine.generateForm16(w, payrolls, tenantName);
        const form16Html = statutoryExportService.generateForm16HTML(form16Data, w);
        const cleanName = w.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `Form16_PartA_PartB_${cleanName}_${w.pan || 'PANNOTAVBL'}.html`;
        form16Folder.file(fileName, form16Html);
        form16Count++;
      }

      // 5. Validation Audit Report
      self.postMessage({ id, progress: 90, statusText: 'Packaging Validation Audit Report...' });
      const validationReportText = statutoryExportService.generateValidationReportText(validationReport);
      rootFolder.file('Validation_Audit_Report.txt', validationReportText);

      // 6. Compress ZIP
      self.postMessage({ id, progress: 95, statusText: 'Compressing statutory package into ZIP...' });
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      // Convert Blob to ArrayBuffer for transfer back to main thread
      const arrayBuffer = await zipBlob.arrayBuffer();

      self.postMessage({
        id,
        success: true,
        progress: 100,
        result: {
          zipBuffer: arrayBuffer,
          fileName: `${zipFolderName}.zip`,
          stats: {
            ecrRecordCount: ecrResult.recordCount,
            ecrOmittedCount: ecrResult.omittedCount,
            deducteeCount: form24QResult.deducteeCount,
            totalTaxDeducted: form24QResult.totalTaxDeducted,
            form16Count,
            validationReport
          }
        }
      }, [arrayBuffer] as any);

    } catch (err: any) {
      console.error('[StatutoryWorker] Error generating pack:', err);
      self.postMessage({
        id,
        success: false,
        error: err.message || 'Failed to generate statutory export pack'
      });
    }
  }
};
