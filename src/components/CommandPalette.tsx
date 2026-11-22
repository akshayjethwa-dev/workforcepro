// src/components/CommandPalette.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Users,
  CalendarCheck,
  IndianRupee,
  Settings,
  Shield,
  Building2,
  CreditCard,
  PieChart,
  IdCard,
  UserPlus,
  Camera,
  CornerDownLeft,
  X,
  History,
  Layers,
  BookOpen,
  FileSpreadsheet,
  Inbox,
  Sun,
  ShieldCheck,
  Calculator,
  Award,
  Landmark,
  Handshake,
  TrendingUp,
  Sliders,
  HardHat,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { ScreenName, CanonicalRole } from '../types/index';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { canAccessScreen } from '../services/rbacService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (screen: ScreenName) => void;
  onLogout: () => void;
  onOpenGuide?: () => void;
  onOpenA11yAudit?: () => void;
}

interface CommandItem {
  id: string;
  title: string;
  category: 'Navigation' | 'Actions' | 'System';
  icon: any;
  shortcut?: string;
  screen?: ScreenName;
  allowedRoles?: CanonicalRole[];
  action: () => void;
  keywords?: string[];
}

export const CommandPalette: React.FC<Props> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenGuide,
  onOpenA11yAudit,
}) => {
  const { activeRole, refreshSessionRole } = useAuth();
  const { isFieldMode, toggleFieldMode } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const allItems: CommandItem[] = [
    // --- SUPER_ADMIN Navigation ---
    {
      id: 'nav-sa-tenants',
      title: 'Platform Tenants Directory',
      category: 'Navigation',
      icon: Building2,
      screen: 'SUPER_ADMIN_TENANTS',
      action: () => {
        onNavigate('SUPER_ADMIN_TENANTS');
        onClose();
      },
      keywords: ['tenants', 'organizations', 'saas', 'admin'],
    },
    {
      id: 'nav-sa-resellers',
      title: 'Resellers & Partner Agencies',
      category: 'Navigation',
      icon: Handshake,
      screen: 'SUPER_ADMIN_RESELLERS',
      action: () => {
        onNavigate('SUPER_ADMIN_RESELLERS');
        onClose();
      },
      keywords: ['resellers', 'partners', 'commissions', 'agencies'],
    },
    {
      id: 'nav-sa-revenue',
      title: 'Revenue & Global Plan Matrix',
      category: 'Navigation',
      icon: TrendingUp,
      screen: 'SUPER_ADMIN_REVENUE',
      action: () => {
        onNavigate('SUPER_ADMIN_REVENUE');
        onClose();
      },
      keywords: ['revenue', 'mrr', 'plans', 'pricing', 'tiers'],
    },
    {
      id: 'nav-sa-settings',
      title: 'System Settings, Security & Role Governance',
      category: 'Navigation',
      icon: Sliders,
      screen: 'SUPER_ADMIN_SETTINGS',
      action: () => {
        onNavigate('SUPER_ADMIN_SETTINGS');
        onClose();
      },
      keywords: ['system', 'security', 'flags', 'audit', 'roles'],
    },

    // --- RESELLER Navigation ---
    {
      id: 'nav-reseller-dashboard',
      title: 'Partner Dashboard',
      category: 'Navigation',
      icon: Layers,
      screen: 'RESELLER_DASHBOARD',
      action: () => {
        onNavigate('RESELLER_DASHBOARD');
        onClose();
      },
      keywords: ['partner', 'reseller', 'overview', 'dashboard'],
    },
    {
      id: 'nav-reseller-clients',
      title: 'Client List',
      category: 'Navigation',
      icon: Building2,
      screen: 'RESELLER_CLIENTS',
      action: () => {
        onNavigate('RESELLER_CLIENTS');
        onClose();
      },
      keywords: ['clients', 'factories', 'tenants', 'portfolio'],
    },
    {
      id: 'nav-reseller-commissions',
      title: 'Commission Ledger & Payouts',
      category: 'Navigation',
      icon: IndianRupee,
      screen: 'RESELLER_COMMISSIONS',
      action: () => {
        onNavigate('RESELLER_COMMISSIONS');
        onClose();
      },
      keywords: ['commission', 'ledger', 'payout', 'invoice', 'billing'],
    },

    // --- WORKER Navigation ---
    {
      id: 'nav-worker-portal',
      title: 'My Worker Dashboard',
      category: 'Navigation',
      icon: HardHat,
      screen: 'WORKER_PORTAL',
      action: () => {
        onNavigate('WORKER_PORTAL');
        onClose();
      },
      keywords: ['portal', 'self service', 'my dashboard', 'shift'],
    },
    {
      id: 'nav-worker-history',
      title: 'My Attendance & Payslips',
      category: 'Navigation',
      icon: FileText,
      screen: 'WORKER_HISTORY',
      action: () => {
        onNavigate('WORKER_HISTORY');
        onClose();
      },
      keywords: ['history', 'payslip', 'salary', 'my attendance'],
    },

    // --- TENANT_ADMIN & MANAGER Navigation ---
    {
      id: 'nav-dashboard',
      title: 'Dashboard Overview',
      category: 'Navigation',
      icon: Layers,
      shortcut: 'G D',
      screen: 'DASHBOARD',
      action: () => {
        onNavigate('DASHBOARD');
        onClose();
      },
      keywords: ['home', 'overview', 'summary', 'live', 'stats'],
    },
    {
      id: 'nav-attendance',
      title: 'Attendance Records & Logs',
      category: 'Navigation',
      icon: CalendarCheck,
      shortcut: 'G A',
      screen: 'ATTENDANCE',
      action: () => {
        onNavigate('ATTENDANCE');
        onClose();
      },
      keywords: ['punches', 'timesheet', 'history', 'daily', 'branch'],
    },
    {
      id: 'nav-reports',
      title: 'Operations & Compliance Reports',
      category: 'Navigation',
      icon: PieChart,
      screen: 'REPORTS',
      action: () => {
        onNavigate('REPORTS');
        onClose();
      },
      keywords: ['analytics', 'download', 'pdf', 'excel', 'export', 'form t'],
    },
    {
      id: 'act-muster-roll',
      title: 'Form T Monthly Muster Roll',
      category: 'Actions',
      icon: FileSpreadsheet,
      screen: 'REPORTS',
      action: () => {
        onNavigate('REPORTS');
        onClose();
      },
      keywords: ['form t', 'muster', 'attendance register', 'monthly attendance', 'excel'],
    },

    // --- TENANT_ADMIN Only Navigation ---
    {
      id: 'nav-inbox',
      title: 'Action Inbox (Approvals & Exceptions)',
      category: 'Navigation',
      icon: Inbox,
      shortcut: 'G I',
      screen: 'INBOX',
      action: () => {
        onNavigate('INBOX');
        onClose();
      },
      keywords: ['inbox', 'pending', 'approvals', 'exceptions', 'kharchi', 'advances'],
    },
    {
      id: 'nav-workers',
      title: 'Workers Directory',
      category: 'Navigation',
      icon: Users,
      shortcut: 'G W',
      screen: 'WORKERS',
      action: () => {
        onNavigate('WORKERS');
        onClose();
      },
      keywords: ['employees', 'staff', 'labour', 'list', 'people'],
    },
    {
      id: 'act-add-worker',
      title: 'Add New Worker',
      category: 'Actions',
      icon: UserPlus,
      shortcut: 'N W',
      screen: 'ADD_WORKER',
      action: () => {
        onNavigate('ADD_WORKER');
        onClose();
      },
      keywords: ['create', 'register', 'employee', 'hire'],
    },
    {
      id: 'nav-kiosk',
      title: 'Open Attendance Kiosk / Face Scanner',
      category: 'Actions',
      icon: Camera,
      shortcut: 'K',
      screen: 'ATTENDANCE_KIOSK',
      action: () => {
        onNavigate('ATTENDANCE_KIOSK');
        onClose();
      },
      keywords: ['scan', 'face', 'camera', 'check-in', 'punch'],
    },
    {
      id: 'nav-payroll',
      title: 'Monthly Payroll & Payslips',
      category: 'Navigation',
      icon: IndianRupee,
      shortcut: 'G P',
      screen: 'PAYROLL',
      action: () => {
        onNavigate('PAYROLL');
        onClose();
      },
      keywords: ['salary', 'wages', 'payout', 'advances', 'kharchi', 'slips'],
    },
    {
      id: 'nav-ctc-simulator',
      title: 'What-If CTC Simulator (50% Rule Restructuring)',
      category: 'Actions',
      icon: Calculator,
      screen: 'CTC_SIMULATOR',
      action: () => {
        onNavigate('CTC_SIMULATOR');
        onClose();
      },
      keywords: ['ctc', 'simulator', 'restructure', '50%', 'basic', 'gratuity', 'pf'],
    },
    {
      id: 'nav-gratuity-fnf',
      title: 'Gratuity Accrual & FnF Settlement Calculator',
      category: 'Actions',
      icon: Award,
      screen: 'GRATUITY',
      action: () => {
        onNavigate('GRATUITY');
        onClose();
      },
      keywords: ['gratuity', 'fnf', 'full and final', 'settlement', 'nominee'],
    },
    {
      id: 'nav-annual-bonus',
      title: 'Annual Statutory Bonus & Forms A/B/C/D',
      category: 'Actions',
      icon: Landmark,
      screen: 'ANNUAL_BONUS',
      action: () => {
        onNavigate('ANNUAL_BONUS');
        onClose();
      },
      keywords: ['bonus', 'statutory bonus', 'form a', 'form b', 'form c', 'form d'],
    },
    {
      id: 'nav-posh-icc',
      title: 'Digital ICC & POSH Complaint Portal',
      category: 'Navigation',
      icon: ShieldCheck,
      screen: 'POSH_ICC',
      action: () => {
        onNavigate('POSH_ICC');
        onClose();
      },
      keywords: ['posh', 'icc', 'harassment', 'complaint', 'compliance'],
    },
    {
      id: 'nav-daily-logs',
      title: 'Daily Wage Calculations',
      category: 'Navigation',
      icon: History,
      screen: 'DAILY_LOGS',
      action: () => {
        onNavigate('DAILY_LOGS');
        onClose();
      },
      keywords: ['overtime', 'per day', 'rates'],
    },
    {
      id: 'nav-id-cards',
      title: 'Digital Worker ID Cards',
      category: 'Navigation',
      icon: IdCard,
      screen: 'ID_CARDS',
      action: () => {
        onNavigate('ID_CARDS');
        onClose();
      },
      keywords: ['badge', 'qr', 'print', 'card'],
    },
    {
      id: 'nav-billing',
      title: 'Subscription & Plan Limits',
      category: 'Navigation',
      icon: CreditCard,
      screen: 'BILLING',
      action: () => {
        onNavigate('BILLING');
        onClose();
      },
      keywords: ['upgrade', 'plan', 'pricing', 'payment', 'trial'],
    },
    {
      id: 'nav-settings',
      title: 'Settings (Company Profile, Billing & Managers)',
      category: 'Navigation',
      icon: Settings,
      shortcut: 'G S',
      screen: 'SETTINGS',
      action: () => {
        onNavigate('SETTINGS');
        onClose();
      },
      keywords: ['company', 'profile', 'billing', 'managers', 'settings', 'organization'],
    },
    {
      id: 'nav-advanced-hr-settings',
      title: 'Advanced HR Settings (50% Rule, Overtime, Shifts, PF/ESI)',
      category: 'Navigation',
      icon: Sliders,
      screen: 'ADVANCED_HR_SETTINGS',
      action: () => {
        onNavigate('ADVANCED_HR_SETTINGS');
        onClose();
      },
      keywords: ['advanced', 'hr', '50%', 'overtime', 'multiplier', 'shifts', 'geofence', 'statutory', 'pf', 'esi', 'leaves'],
    },
    {
      id: 'nav-team',
      title: 'Manage Branch Managers & Team',
      category: 'Navigation',
      icon: Users,
      screen: 'TEAM',
      action: () => {
        onNavigate('TEAM');
        onClose();
      },
      keywords: ['managers', 'supervisors', 'invite', 'branch'],
    },
    {
      id: 'act-setup-guide',
      title: 'Factory Setup & Operational Guide',
      category: 'Actions',
      icon: BookOpen,
      shortcut: '?',
      allowedRoles: ['TENANT_ADMIN'],
      action: () => {
        if (onOpenGuide) onOpenGuide();
        onClose();
      },
      keywords: ['help', 'manual', 'wizard', 'walkthrough', 'onboarding', 'guide'],
    },

    // --- Universal Utility Actions ---
    {
      id: 'act-field-mode',
      title: isFieldMode
        ? 'Disable Field Mode (Revert to Standard Theme)'
        : 'Enable High-Contrast Field Mode (Sunlight & Low Vision)',
      category: 'Actions',
      icon: Sun,
      shortcut: 'F M',
      action: () => {
        toggleFieldMode();
        onClose();
      },
      keywords: ['sunlight', 'field mode', 'contrast', 'high contrast', 'accessibility'],
    },
    {
      id: 'act-a11y-audit',
      title: 'Run Automated Accessibility Audit (axe-core)',
      category: 'Actions',
      icon: ShieldCheck,
      shortcut: 'A 1 1 Y',
      action: () => {
        if (onOpenA11yAudit) onOpenA11yAudit();
        onClose();
      },
      keywords: ['axe', 'wcag', 'audit', 'contrast', 'accessibility'],
    },
    {
      id: 'act-refresh-role',
      title: 'Refresh Session Token & Verify Role Permissions',
      category: 'System',
      icon: RefreshCw,
      action: () => {
        void refreshSessionRole({ forceTokenRefresh: true });
        onClose();
      },
      keywords: ['token', 'refresh', 'role', 'permissions', 'sync', 'rbac'],
    },
  ];

  // Filter strictly by activeRole RBAC before applying text search
  const permittedItems = allItems.filter((item) => {
    if (item.screen && !canAccessScreen(activeRole, item.screen)) {
      return false;
    }
    if (item.allowedRoles && !item.allowedRoles.includes(activeRole)) {
      return false;
    }
    return true;
  });

  const filteredItems = permittedItems.filter((item) => {
    if (!query) return true;
    const q = query.toLowerCase();
    const titleMatch = item.title.toLowerCase().includes(q);
    const catMatch = item.category.toLowerCase().includes(q);
    const keywordMatch = item.keywords?.some((k) => k.toLowerCase().includes(q));
    return titleMatch || catMatch || keywordMatch;
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(
        (prev) => (prev - 1 + (filteredItems.length || 1)) % (filteredItems.length || 1)
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[999] bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-4 sm:p-6 md:p-20 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col transform transition-all animate-in zoom-in-95 duration-150 mt-4 sm:mt-12"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-100 gap-3">
          <Search size={18} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search permitted screens or actions..."
            className="w-full bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 text-slate-400 hover:text-slate-600 rounded"
            >
              <X size={14} />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-[380px] overflow-y-auto p-2 divide-y divide-slate-50">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-xs text-slate-500 font-medium">
                No authorized commands found matching &ldquo;{query}&rdquo;
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Only commands permitted for your active role are shown.
              </p>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors text-xs cursor-pointer ${
                    isSelected
                      ? 'bg-slate-100 text-slate-900 font-semibold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-1.5 rounded-lg shrink-0 ${
                        isSelected
                          ? 'bg-white text-blue-600 shadow-xs'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 truncate">
                      <div className="truncate">{item.title}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{item.category}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {item.shortcut && (
                      <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {item.shortcut}
                      </span>
                    )}
                    {isSelected && <CornerDownLeft size={13} className="text-slate-400" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-2xs">
                ↑
              </kbd>
              <kbd className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-2xs">
                ↓
              </kbd>
              <span>navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-2xs">
                ↵
              </kbd>
              <span>select</span>
            </span>
          </div>
          <span className="text-[10px] font-medium text-slate-400">WorkForce Command Bar</span>
        </div>
      </div>
    </div>
  );
};
