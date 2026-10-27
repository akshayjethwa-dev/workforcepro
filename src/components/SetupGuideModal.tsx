// src/components/SetupGuideModal.tsx
import React, { useState } from 'react';
import { 
  X, BookOpen, CheckCircle2, ChevronRight, ArrowRight, Shield, 
  Building2, Clock, Users, Camera, IndianRupee, PieChart, 
  FileText, HelpCircle, Sparkles, AlertCircle, Laptop, WifiOff,
  ExternalLink, Layers, GitBranch, Calendar
} from 'lucide-react';
import { ScreenName } from '../types/index';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (screen: ScreenName) => void;
  initialStep?: number;
}

export const SetupGuideModal: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  onNavigate,
  initialStep = 0
}) => {
  const [activeStep, setActiveStep] = useState(initialStep);
  const [activeSection, setActiveSection] = useState<'STEPS' | 'FAQS' | 'FLOW'>('STEPS');

  const handleCloseGuide = () => {
    try {
      localStorage.setItem('workforce_guide_completed', 'true');
      localStorage.setItem('hide_factory_checklist', 'true');
    } catch {}
    onClose();
  };

  if (!isOpen) return null;

  const STEPS = [
    {
      id: 0,
      title: 'Factory Profile & Geofence',
      subtitle: 'Set up your site coordinates, radius and branches',
      icon: Building2,
      color: 'blue',
      screen: 'SETTINGS' as ScreenName,
      screenLabel: 'Go to Settings',
      content: {
        summary: 'Define your physical factory premises to ensure workers are physically present when punching.',
        keyPoints: [
          'Capture your exact factory GPS latitude and longitude with 1-click in Settings -> Locations.',
          'Set a geofence radius (e.g. 100m to 250m) around the factory perimeter.',
          'Punches recorded outside this radius are automatically flagged with a Geofence Warning on your dashboard and muster roll without blocking the worker.',
          'If you operate multiple manufacturing plants or warehouses, configure secondary branches with their own independent coordinates.'
        ],
        tip: 'Best Practice: Stand near the factory entrance gate when clicking "Use Current Location" to get the most accurate GPS lock.'
      }
    },
    {
      id: 1,
      title: 'Shifts, Grace & Overtime Rules',
      subtitle: 'Configure daily schedules, lunch auto-deductions and OT',
      icon: Clock,
      color: 'indigo',
      screen: 'SETTINGS' as ScreenName,
      screenLabel: 'Configure Shifts',
      content: {
        summary: 'Create custom shifts for day, general, or night operations with automatic break deductions.',
        keyPoints: [
          'Define Shift Start and End times (e.g. 09:00 to 18:00).',
          'Grace Period: Allow 10–15 minutes of grace before a punch is marked as "Late Arrival".',
          'Auto-Break Deduction: When enabled in General Settings, 1 hour (60 mins) is automatically deducted from gross hours to reflect lunch/rest intervals.',
          'Half-Day Threshold: Define minimum hours (e.g. 4 hours) required to earn a half-day wage.',
          'Overtime Rules: Set minimum OT threshold (e.g. 60 mins). In accordance with the Indian Factories Act, overtime is computed at double the standard hourly rate.'
        ],
        tip: 'Night Shifts: Punches spanning past midnight are automatically grouped under the shift date when checked out before 5 AM.'
      }
    },
    {
      id: 2,
      title: 'Add Workers & Enroll Face / QR',
      subtitle: 'Onboard workforce, set wage structures & print ID cards',
      icon: Users,
      color: 'emerald',
      screen: 'WORKERS' as ScreenName,
      screenLabel: 'Open Workers Directory',
      content: {
        summary: 'Add both daily wage laborers and monthly salaried staff with statutory compliance IDs.',
        keyPoints: [
          'Choose wage type: "Daily Wage" (paid per shift worked) or "Monthly" (fixed salary with daily pro-rating).',
          'Basic Breakdown: Enter basic wage and allowances. Under the Indian Code on Wages, basic pay should be at least 50% of gross pay.',
          'Statutory IDs: Enter the worker\'s 12-digit EPFO UAN and 10-digit ESIC IP number for automated monthly returns.',
          'Biometric Face Enrollment: Capture 1 webcam or phone photo. The AI biometric engine generates an embedded face descriptor in seconds.',
          'Digital ID Cards: Head over to ID Card Studio to print durable QR badge cards with photo and barcode.'
        ],
        tip: 'Quick Tip: Workers can punch using either facial recognition OR their personalized QR code badge.'
      }
    },
    {
      id: 3,
      title: 'Pair Gate Kiosk Terminals',
      subtitle: 'Mount any tablet or smartphone at the factory gate',
      icon: Camera,
      color: 'purple',
      screen: 'SETTINGS' as ScreenName,
      screenLabel: 'View Kiosk Terminals',
      content: {
        summary: 'Turn any budget Android tablet, iPad, or mobile phone into a tamper-proof biometric gate scanner.',
        keyPoints: [
          'In Settings -> Terminals, generate a 6-digit pairing code and assign a 4-digit supervisor admin PIN.',
          'On the factory floor tablet, open the app, click "Kiosk Mode", and enter the pairing code.',
          'The tablet locks into full-screen scanning mode. Workers simply glance at the camera for zero-touch punch verification in under 1 second.',
          'Offline Continuity: If factory Wi-Fi drops, the kiosk continues scanning and securely queues all punches locally, syncing automatically once internet is restored.'
        ],
        tip: 'Security Tip: Supervisors can exit Kiosk Mode at any time using their private 4-digit PIN.'
      }
    },
    {
      id: 4,
      title: 'Daily Attendance & Supervisor Logs',
      subtitle: 'Monitor real-time punches, late marks & leave requests',
      icon: CheckCircle2,
      color: 'teal',
      screen: 'ATTENDANCE' as ScreenName,
      screenLabel: 'View Attendance Logs',
      content: {
        summary: 'Track live attendance, filter by shift or branch, and apply supervisor adjustments.',
        keyPoints: [
          'Live Punch Timeline: Inspect real-time in and out punches with exact timestamps and device IDs.',
          'Late Arrivals & Half Days: Automatically categorized based on shift grace minutes and net working hours.',
          'Supervisor Overrides: Managers can mark approved leaves (CL/SL/PL), mark half-days, or regulate missed punches.',
          'Geofence Audit: Instantly see if a worker punched outside the designated factory perimeter.'
        ],
        tip: 'Pro Tip: Use the search bar to quickly check an individual worker\'s attendance history for any date.'
      }
    },
    {
      id: 5,
      title: 'Advances, Daily Wages & Payroll',
      subtitle: 'Track worker advances, piece rates & monthly payslips',
      icon: IndianRupee,
      color: 'amber',
      screen: 'PAYROLL' as ScreenName,
      screenLabel: 'Open Monthly Payroll',
      content: {
        summary: 'Complete wage engine supporting cash advances, daily earnings, and automated monthly payslips.',
        keyPoints: [
          'Worker Advances: Record festival or emergency cash advances with approval notes.',
          'Auto-Deduction: Approved advances are automatically deducted from the month\'s final gross earnings.',
          'Advance Carry-Forward: If advances exceed monthly earnings, the remaining balance carries forward automatically into next month\'s ledger.',
          'Bilingual Payslips: Generate and print clean, professional payslips (English & Hindi) ready for worker signature and payout confirmation.'
        ],
        tip: 'Daily Logs Screen: Use "Daily Wage Logs" for contractors and daily laborers to review earnings calculated shift-by-shift.'
      }
    },
    {
      id: 6,
      title: 'Indian Statutory Compliance (EPFO, ESIC, Form T)',
      subtitle: 'Download ECR 2.0 text file, ESIC sheets & Form T muster roll',
      icon: PieChart,
      color: 'rose',
      screen: 'REPORTS' as ScreenName,
      screenLabel: 'Open Statutory Reports',
      content: {
        summary: 'Fully compliant with Indian Labour Laws, EPFO Unified Portal, and ESIC electronic returns.',
        keyPoints: [
          'Official EPFO ECR 2.0 (.txt): 1-click download of the 11-column #~# text file ready for instant upload to unifiedportal-emp.epfindia.gov.in.',
          'EPF Challan Statement: Complete audit schedule calculating A/c 1 (12% EE + 3.67% ER), A/c 2 Admin charges (0.5%, min ₹500), A/c 10 EPS (8.33%, max ₹1,250), and A/c 21 EDLI.',
          'ESIC Portal Upload Sheet (.xlsx): Formatted to the exact 6-column specification for direct upload to esic.gov.in for workers earning ≤ ₹21,000/month.',
          'Form T Monthly Muster Roll: Official day-by-day (1 to 31) attendance register prescribed under the Code on Wages 2019 / Ease of Compliance Rules 2017, exportable to Excel or printable format.'
        ],
        tip: 'Statutory Verification: Member wages are automatically capped at statutory ceilings (₹15,000 for EPF, ₹21,000 for ESIC) and EPS stops automatically for workers aged 58+.'
      }
    }
  ];

  const FAQS = [
    {
      q: 'What is the "Sandwich Rule" in Calendar settings?',
      a: 'Under Indian industrial standards, the Sandwich Rule specifies that if a worker is absent on both the working day immediately preceding AND immediately following a weekly off or public holiday, that holiday is treated as an unpaid absence (loss of pay) rather than a paid holiday.'
    },
    {
      q: 'Who is eligible for ESIC coverage?',
      a: 'Under the ESI Act 1948, any employee earning a gross monthly wage of ₹21,000 or less (₹25,000 for persons with disabilities) is mandatorily covered. Employee contribution is 0.75% and employer contribution is 3.25% (total 4.00%). Employees with average daily wage ≤ ₹176 are exempt from employee share.'
    },
    {
      q: 'How does EPFO wage ceiling capping work?',
      a: 'Under the EPF Scheme, the statutory wage ceiling is ₹15,000/month. When "Cap PF at Statutory Ceiling" is enabled, both EPF and EPS contributions are calculated on a maximum of ₹15,000, limiting the employee share to ₹1,800/month and EPS pension share to ₹1,250/month.'
    },
    {
      q: 'Can workers punch when factory internet goes down?',
      a: 'Yes! The attendance kiosk works 100% offline. Facial recognition runs entirely in the browser on the tablet. Punches are stored securely on the device and sync to the cloud database automatically as soon as internet connection resumes.'
    },
    {
      q: 'How are "Payable Days" computed on Form T Muster Roll?',
      a: 'Under Indian labor law: Payable Days = Present Days + (0.5 × Half Days) + Weekly Offs + Paid National/Festival Holidays + Approved Paid Leaves (CL/SL/PL) + Holiday Worked Days. This exact figure determines gross monthly salary.'
    },
    {
      q: 'How do I add supervisors/managers with limited access?',
      a: 'Go to Administration -> Supervisor Team. Enter your manager\'s email to invite them. Supervisors can log into their own account to view attendance and register worker punches without seeing business billing or owner settings.'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-6 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/90 text-white flex items-center justify-center shadow-md shadow-indigo-950/50 shrink-0">
              <BookOpen size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base sm:text-lg text-white tracking-tight">Factory Setup & Workflow Guide</h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  New User Guide
                </span>
              </div>
              <p className="text-xs text-indigo-200 mt-0.5">
                Step-by-step instructions to configure shifts, kiosks, workforce, payroll & Indian statutory compliance.
              </p>
            </div>
          </div>

          <button 
            onClick={handleCloseGuide}
            className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
            aria-label="Close guide"
          >
            <X size={20} />
          </button>
        </div>

        {/* SECTION NAV TABS */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50 px-4 sm:px-6 shrink-0 text-xs font-semibold">
          <button
            onClick={() => setActiveSection('STEPS')}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center gap-2 ${
              activeSection === 'STEPS' 
                ? 'border-indigo-600 text-indigo-600 bg-white font-bold' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>7-Step Workflow Guide</span>
          </button>
          <button
            onClick={() => setActiveSection('FLOW')}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center gap-2 ${
              activeSection === 'FLOW' 
                ? 'border-indigo-600 text-indigo-600 bg-white font-bold' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Factory Architecture Flow</span>
          </button>
          <button
            onClick={() => setActiveSection('FAQS')}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center gap-2 ${
              activeSection === 'FAQS' 
                ? 'border-indigo-600 text-indigo-600 bg-white font-bold' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Compliance FAQs</span>
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin">
          {activeSection === 'STEPS' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* STEP SELECTOR (LEFT COLUMN) */}
              <div className="lg:col-span-4 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-1 mb-2">
                  Implementation Steps
                </span>
                {STEPS.map((step, idx) => {
                  const Icon = step.icon;
                  const isActive = activeStep === idx;
                  return (
                    <button
                      key={step.id}
                      onClick={() => setActiveStep(idx)}
                      className={`w-full flex items-start gap-3 p-3 rounded-2xl text-left transition-all text-xs ${
                        isActive 
                          ? 'bg-indigo-50 border border-indigo-200 text-slate-900 shadow-2xs font-bold' 
                          : 'hover:bg-slate-50 border border-transparent text-slate-600'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold ${
                        isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`truncate ${isActive ? 'text-indigo-950 font-bold' : 'font-semibold text-slate-800'}`}>
                          {step.title}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5 font-normal">
                          {step.subtitle}
                        </div>
                      </div>
                      {isActive && <ChevronRight size={14} className="text-indigo-600 shrink-0 self-center" />}
                    </button>
                  );
                })}
              </div>

              {/* STEP DETAILS (RIGHT COLUMN) */}
              <div className="lg:col-span-8 bg-slate-50/70 border border-slate-200/80 rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 pb-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 font-mono">
                        Step {activeStep + 1} of {STEPS.length}
                      </span>
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
                        {STEPS[activeStep].title}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {STEPS[activeStep].subtitle}
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        handleCloseGuide();
                        onNavigate(STEPS[activeStep].screen);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors shrink-0 active:scale-95"
                    >
                      <span>{STEPS[activeStep].screenLabel}</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed mt-4 font-medium">
                    {STEPS[activeStep].content.summary}
                  </p>

                  <div className="mt-4 space-y-2.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Key Highlights & Rules:
                    </span>
                    {STEPS[activeStep].content.keyPoints.map((pt, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-xs text-slate-600 leading-normal">
                        <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                        <span>{pt}</span>
                      </div>
                    ))}
                  </div>

                  {/* PRO TIP BOX */}
                  <div className="mt-5 p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                    <Sparkles size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold block text-[11px] uppercase tracking-wide">Helpful Tip</strong>
                      <span className="text-[11px] text-amber-800 leading-relaxed mt-0.5 block">
                        {STEPS[activeStep].content.tip}
                      </span>
                    </div>
                  </div>
                </div>

                {/* STEP NAVIGATION FOOTER */}
                <div className="flex items-center justify-between pt-5 mt-6 border-t border-slate-200/80">
                  <button
                    onClick={() => setActiveStep(prev => Math.max(0, prev - 1))}
                    disabled={activeStep === 0}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    Previous Step
                  </button>

                  <div className="flex items-center gap-1.5">
                    {STEPS.map((_, i) => (
                      <div
                        key={i}
                        className={`h-1.5 rounded-full transition-all ${
                          i === activeStep ? 'w-6 bg-indigo-600' : 'w-1.5 bg-slate-300'
                        }`}
                      />
                    ))}
                  </div>

                  {activeStep < STEPS.length - 1 ? (
                    <button
                      onClick={() => setActiveStep(prev => Math.min(STEPS.length - 1, prev + 1))}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
                    >
                      Next Step
                    </button>
                  ) : (
                    <button
                      onClick={handleCloseGuide}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 active:scale-95"
                    >
                      <CheckCircle2 size={14} />
                      <span>Finish &amp; Close Guide</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: FACTORY FLOW DIAGRAM */}
          {activeSection === 'FLOW' && (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-900 leading-relaxed">
                <strong className="block font-bold text-sm text-indigo-950 mb-1">How WorkForce Operates: End-to-End Factory Cycle</strong>
                Every factory follows a standardized 6-phase lifecycle from initial setup to month-end statutory remittance. Here is the operational architecture:
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs relative">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600 font-mono">Phase 1</div>
                  <h4 className="font-bold text-sm text-slate-900 mt-1 flex items-center gap-1.5">
                    <Building2 size={16} className="text-blue-600" />
                    <span>Configuration</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Set up factory geofence, shifts (start/end/grace), auto-break lunch deduction, and PF/ESIC employer codes.
                  </p>
                  <div className="mt-3 text-[11px] text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <strong>Result:</strong> Factory rules established and saved to Firestore cloud.
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs relative">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-purple-600 font-mono">Phase 2</div>
                  <h4 className="font-bold text-sm text-slate-900 mt-1 flex items-center gap-1.5">
                    <Camera size={16} className="text-purple-600" />
                    <span>Gate Kiosk Pairing</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Mount any budget tablet at the factory entry gate. Enter 6-digit pairing code to lock device into offline-ready scanner.
                  </p>
                  <div className="mt-3 text-[11px] text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <strong>Result:</strong> Fast zero-touch face and QR verification at the gate.
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs relative">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 font-mono">Phase 3</div>
                  <h4 className="font-bold text-sm text-slate-900 mt-1 flex items-center gap-1.5">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span>Daily Shift Punches</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Workers scan In/Out. The engine computes regular hours, overtime, late arrival grace, and geofence verification.
                  </p>
                  <div className="mt-3 text-[11px] text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <strong>Result:</strong> Live dashboard and real-time attendance timeline.
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs relative">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 font-mono">Phase 4</div>
                  <h4 className="font-bold text-sm text-slate-900 mt-1 flex items-center gap-1.5">
                    <IndianRupee size={16} className="text-amber-600" />
                    <span>Advances & Daily Logs</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Record mid-month worker cash advances and verify daily piece wages for contractors.
                  </p>
                  <div className="mt-3 text-[11px] text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <strong>Result:</strong> Transparent advance ledger with automated deduction.
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs relative">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 font-mono">Phase 5</div>
                  <h4 className="font-bold text-sm text-slate-900 mt-1 flex items-center gap-1.5">
                    <FileText size={16} className="text-indigo-600" />
                    <span>Monthly Payroll & Payslips</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Payable days computed using calendar logic (P + 0.5*HD + WO + PH + Leaves). Generate bilingual payslips.
                  </p>
                  <div className="mt-3 text-[11px] text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <strong>Result:</strong> Net payout confirmed and signed wage register.
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs relative">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-600 font-mono">Phase 6</div>
                  <h4 className="font-bold text-sm text-slate-900 mt-1 flex items-center gap-1.5">
                    <PieChart size={16} className="text-rose-600" />
                    <span>Government Returns</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Export official EPFO ECR 2.0 text file, ESIC 6-column spreadsheet, and Form T Monthly Muster Roll.
                  </p>
                  <div className="mt-3 text-[11px] text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <strong>Result:</strong> 100% compliant with Ministry of Labour & Employment.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: COMPLIANCE FAQS */}
          {activeSection === 'FAQS' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-100/80 text-xs text-slate-700 leading-relaxed flex items-center gap-3">
                <HelpCircle size={20} className="text-indigo-600 shrink-0" />
                <span>
                  Frequently asked questions regarding Indian labor regulations, statutory contribution ceilings, and automated attendance registers.
                </span>
              </div>

              <div className="space-y-3">
                {FAQS.map((faq, i) => (
                  <div key={i} className="p-4 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
                    <h4 className="font-bold text-xs sm:text-sm text-slate-900 flex items-start gap-2">
                      <span className="text-indigo-600 font-mono">Q{i + 1}.</span>
                      <span>{faq.q}</span>
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed mt-2 pl-6">
                      {faq.a}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 sm:px-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500">
            Need customized setup support? Contact <span className="font-semibold text-slate-700">WorkForce Pro Engineering Desk</span>.
          </div>
          <button
            onClick={handleCloseGuide}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
