import React, { useState } from 'react';
import { MonthlyPayroll } from '../types/index';
import { X, Printer, Share2, Download } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

interface Props {
  data: MonthlyPayroll;
  companyName: string;
  siteAddress?: string;
  onClose: () => void;
}

// Helper to convert base64 to Blob for robust mobile downloads
const base64ToBlob = (base64: string, type = 'application/pdf'): Blob => {
  const binStr = atob(base64);
  const len = binStr.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = binStr.charCodeAt(i);
  }
  return new Blob([arr], { type });
};

export const Payslip: React.FC<Props> = ({ data, companyName, siteAddress, onClose }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Format "2026-02" to "February 2026"
  const formattedMonth = React.useMemo(() => {
     const [year, month] = data.month.split('-');
     const date = new Date(parseInt(year), parseInt(month) - 1);
     return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [data.month]);

  // Generates a formal A4 PDF matching the Web Print layout
  const getPayslipPDF = async (): Promise<string | null> => {
    const element = document.getElementById('payslip-content');
    if (!element) return null;
    
    try {
      // Force desktop width (800px) so the mobile export doesn't look squished
      const dataUrl = await toPng(element, { 
        quality: 0.95,
        pixelRatio: 2, // High resolution
        backgroundColor: '#ffffff',
        cacheBust: true,
        style: {
            width: '800px', 
            padding: '40px', // Add page margins
            margin: '0'
        }
      });

      // Get actual image dimensions to scale properly on the PDF
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => { img.onload = resolve; });

      // Create A4 PDF Document
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (img.height * pdfWidth) / img.width;

      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, imgHeight);
      
      // Return base64 data (strip the data URI prefix)
      return pdf.output('datauristring').split(',')[1];
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      return null;
    }
  };

  const handleDownload = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    
    try {
      const pdfBase64 = await getPayslipPDF();
      if (!pdfBase64) throw new Error('Failed to generate PDF');

      const fileName = `Payslip_${data.workerName.replace(/\s+/g, '_')}_${data.month}.pdf`;
      const blob = base64ToBlob(pdfBase64, 'application/pdf');

      if (Capacitor.isNativePlatform()) {
        let fileUri = '';
        try {
          const savedFile = await Filesystem.writeFile({
            path: fileName,
            data: pdfBase64,
            directory: Directory.Cache,
          });
          fileUri = savedFile.uri;
        } catch (err) {
          console.warn('Cache write failed, trying Documents:', err);
          const savedFile = await Filesystem.writeFile({
            path: fileName,
            data: pdfBase64,
            directory: Directory.Documents,
          });
          fileUri = savedFile.uri;
        }

        // Trigger native share/save dialog for maximum native mobile compatibility
        try {
          await Share.share({
            title: `Payslip - ${data.workerName}`,
            text: `Payslip for ${data.workerName} (${formattedMonth})`,
            url: fileUri,
            dialogTitle: 'Save or Share Payslip',
          });
        } catch (sErr) {
          alert('Payslip PDF downloaded and saved to your device.');
        }
      } else {
        // Web & Mobile Web fallback using Blob URL
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = fileName;
        link.href = blobUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Fallback for iOS Safari which might block dynamic downloads
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (isIOS) {
          window.open(blobUrl, '_blank');
        }

        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      }
    } catch (error: any) {
      console.error('Error downloading payslip:', error);
      alert('Failed to download the payslip: ' + (error.message || 'Please try again.'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleShare = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const pdfBase64 = await getPayslipPDF();
      if (!pdfBase64) throw new Error('Failed to generate PDF');

      const fileName = `Payslip_${data.workerName.replace(/\s+/g, '_')}_${data.month}.pdf`;

      if (Capacitor.isNativePlatform()) {
        // Save to cache directory temporarily for sharing
        const savedFile = await Filesystem.writeFile({
          path: fileName,
          data: pdfBase64,
          directory: Directory.Cache,
        });
        
        await Share.share({
          title: `Payslip - ${data.workerName}`,
          text: `Here is the payslip for ${data.workerName} for ${formattedMonth}.`,
          url: savedFile.uri,
          dialogTitle: 'Share Payslip',
        });
      } else {
        // Web Share API fallback
        const byteCharacters = atob(pdfBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        
        const file = new File([blob], fileName, { type: 'application/pdf' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `Payslip - ${data.workerName}`,
            text: `Here is the payslip for ${data.workerName} for ${formattedMonth}.`,
          });
        } else {
          alert('Sharing files is not supported on this browser. Please use the download button instead.');
        }
      }
    } catch (error) {
      console.error('Error sharing payslip:', error);
      alert('Failed to share the payslip. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Mobile Native Print uses the Share sheet, which natively contains the OS "Print" capability for PDFs
  const handlePrint = async () => {
      if (!Capacitor.isNativePlatform()) {
          window.print();
      } else {
          // Alert user and open the native print/share spooler
          alert("Preparing formal document. Please select 'Print' from the iOS/Android menu that appears.");
          await handleShare();
      }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden animate-fadeIn my-auto">
        
        {/* Actions Header */}
        <div className="bg-gray-800 text-white p-3 flex justify-between items-center print:hidden">
            <h3 className="font-bold">Payslip Preview</h3>
            <div className="flex space-x-1 sm:space-x-2">
                <button 
                  onClick={handleShare} 
                  disabled={isProcessing}
                  className={`p-2 rounded-full ${isProcessing ? 'opacity-50 cursor-wait' : 'hover:bg-gray-700'}`}
                  title="Share"
                >
                    <Share2 size={20} />
                </button>
                <button 
                  onClick={handleDownload} 
                  disabled={isProcessing}
                  className={`p-2 rounded-full ${isProcessing ? 'opacity-50 cursor-wait' : 'hover:bg-gray-700'}`}
                  title="Download PDF"
                >
                    <Download size={20} />
                </button>
                <button 
                  onClick={handlePrint} 
                  disabled={isProcessing}
                  className={`p-2 rounded-full ${isProcessing ? 'opacity-50 cursor-wait' : 'hover:bg-gray-700'}`} 
                  title="Print"
                >
                    <Printer size={20} />
                </button>
                <button onClick={onClose} className="p-2 hover:bg-red-600 bg-gray-700 ml-2 rounded-full" title="Close">
                    <X size={20} />
                </button>
            </div>
        </div>

        {/* Printable Area */}
        <div className="p-8 print:p-0 bg-white" id="payslip-content">
            {/* Header */}
            <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
                <h1 className="text-2xl font-bold uppercase tracking-wider text-gray-900">
                    {companyName || 'Factory Admin'}
                </h1>
                {siteAddress && (
                    <p className="text-sm text-gray-500 mt-1">{siteAddress}</p>
                )}
                <h2 className="text-lg font-bold mt-4 bg-gray-100 py-1 uppercase">PAYSLIP - {formattedMonth}</h2>
            </div>

            {/* Worker Info */}
            <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                <div>
                    <p className="text-gray-500">Name</p>
                    <p className="font-bold">{data.workerName}</p>
                </div>
                <div className="text-right">
                     <p className="text-gray-500">Employee ID</p>
                     <p className="font-bold text-xs font-mono">{data.workerId}</p> 
                </div>
                <div>
                    <p className="text-gray-500">Designation</p>
                    <p className="font-bold">{data.workerDesignation || 'Worker'}</p>
                </div>
                <div className="text-right">
                    <p className="text-gray-500">Department</p>
                    <p className="font-bold">{data.workerDepartment || 'General'}</p>
                </div>
            </div>

            {/* Attendance Table */}
            <div className="mb-6">
                <h3 className="font-bold text-xs uppercase text-gray-500 mb-2 border-b border-gray-200 pb-1">Attendance Summary</h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-sm">
                    <div className="bg-gray-50 p-2 rounded">
                        <span className="block text-xs text-gray-500">Total Days</span>
                        <span className="font-bold">{data.attendanceSummary.totalDays}</span>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                        <span className="block text-xs text-gray-500">Payable Days</span>
                        <span className="font-bold">{data.attendanceSummary.payableDays}</span>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                        <span className="block text-xs text-gray-500">Present</span>
                        <span className="font-bold">{data.attendanceSummary.presentDays + (data.attendanceSummary.halfDays * 0.5)}</span>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                        <span className="block text-xs text-gray-500">Absent</span>
                        <span className="font-bold">{data.attendanceSummary.absentDays}</span>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                        <span className="block text-xs text-gray-500">Paid Leaves</span>
                        <span className="font-bold">{data.attendanceSummary.paidLeaves}</span>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                        <span className="block text-xs text-gray-500">Unpaid Leaves</span>
                        <span className="font-bold">{data.attendanceSummary.unpaidLeaves}</span>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                        <span className="block text-xs text-gray-500">Holidays & W.Offs</span>
                        <span className="font-bold">{data.attendanceSummary.publicHolidays + data.attendanceSummary.weeklyOffs + data.attendanceSummary.holidayWorkedDays}</span>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                         <span className="block text-xs text-gray-500">OT Hours</span>
                         <span className="font-bold">{data.attendanceSummary.totalOvertimeHours}</span>
                    </div>
                </div>
            </div>

            {/* Earnings Table */}
            <div className="mb-6">
                 <table className="w-full text-sm">
                     <thead>
                         <tr className="border-b border-gray-300">
                             <th className="text-left py-2 text-gray-500 font-bold uppercase text-xs">Earnings</th>
                             <th className="text-right py-2 text-gray-500 font-bold uppercase text-xs">Amount (₹)</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100">
                         <tr><td className="py-2">Basic Wages</td><td className="text-right py-2">{data.earnings.basic.toFixed(2)}</td></tr>
                         <tr><td className="py-2">Overtime</td><td className="text-right py-2">{data.earnings.overtime.toFixed(2)}</td></tr>
                         <tr><td className="py-2">Allowances</td><td className="text-right py-2">{data.earnings.allowances.other.toFixed(2)}</td></tr>
                         <tr className="bg-green-50 font-bold">
                             <td className="py-2 pl-2">GROSS EARNINGS</td>
                             <td className="text-right py-2 pr-2">{data.earnings.gross.toFixed(2)}</td>
                         </tr>
                     </tbody>
                 </table>
            </div>

            {/* Deductions Table */}
            <div className="mb-6">
                 <table className="w-full text-sm">
                     <thead>
                         <tr className="border-b border-gray-300">
                             <th className="text-left py-2 text-gray-500 font-bold uppercase text-xs">Deductions</th>
                             <th className="text-right py-2 text-gray-500 font-bold uppercase text-xs">Amount (₹)</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100">
                         {data.deductions.details.map((d, i) => (
                             <tr key={i}><td className="py-2">{d.description}</td><td className="text-right py-2">{d.amount.toFixed(2)}</td></tr>
                         ))}
                         {data.deductions.total === 0 && <tr><td className="py-2 text-gray-400 italic">No deductions</td><td className="text-right py-2">-</td></tr>}
                         <tr className="bg-red-50 font-bold">
                             <td className="py-2 pl-2">TOTAL DEDUCTIONS</td>
                             <td className="text-right py-2 pr-2">{data.deductions.total.toFixed(2)}</td>
                         </tr>
                     </tbody>
                 </table>
            </div>

            {/* Net Pay */}
            <div className="bg-gray-900 text-white p-4 rounded-lg flex justify-between items-center mb-8 mt-4">
                <span className="font-bold uppercase tracking-widest text-sm">Net Payable</span>
                <span className="text-2xl font-bold">₹{data.netPayable.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
            </div>

            {/* Footer */}
            <div className="text-xs text-gray-400 text-center pt-8 border-t border-gray-200">
                <p>Payment Mode: Bank Transfer • Generated on {new Date().toLocaleDateString()}</p>
                <p className="mt-1">This is a system generated payslip.</p>
            </div>
        </div>
      </div>
      <style>{`
         @media print {
            body * { visibility: hidden; }
            #payslip-content, #payslip-content * { visibility: visible; }
            #payslip-content { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
         }
      `}</style>
    </div>
  );
};