// src/components/CommandPalette.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Users, CalendarCheck, IndianRupee, Settings, Shield, 
  Building2, CreditCard, PieChart, IdCard, UserPlus, Camera, 
  HelpCircle, ArrowRight, CornerDownLeft, Sparkles, X, History,
  Layers, BookOpen, FileSpreadsheet, Inbox
} from 'lucide-react';
import { ScreenName, Role } from '../types/index';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (screen: ScreenName) => void;
  onLogout: () => void;
  onOpenGuide?: () => void;
}

interface CommandItem {
  id: string;
  title: string;
  category: 'Navigation' | 'Actions' | 'System';
  icon: any;
  shortcut?: string;
  action: () => void;
  keywords?: string[];
}

export const CommandPalette: React.FC<Props> = ({ isOpen, onClose, onNavigate, onLogout, onOpenGuide }) => {
  const { profile, loginDemo } = useAuth();
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

  const items: CommandItem[] = [
    {
      id: 'act-setup-guide',
      title: 'Factory Setup & Operational Guide',
      category: 'Actions',
      icon: BookOpen,
      shortcut: '?',
      action: () => { 
        if (onOpenGuide) onOpenGuide();
        onClose(); 
      },
      keywords: ['help', 'manual', 'wizard', 'walkthrough', 'faq', 'onboarding', 'instructions', 'guide']
    },
    {
      id: 'act-muster-roll',
      title: 'Form T Monthly Muster Roll',
      category: 'Actions',
      icon: FileSpreadsheet,
      action: () => { onNavigate('REPORTS'); onClose(); },
      keywords: ['form t', 'muster', 'attendance register', 'monthly attendance', 'excel', 'export', 'csv']
    },
    {
      id: 'act-statutory-returns',
      title: 'Government Statutory Returns (EPFO ECR & ESIC)',
      category: 'Actions',
      icon: Shield,
      action: () => { onNavigate('REPORTS'); onClose(); },
      keywords: ['epfo', 'pf', 'esic', 'esi', 'ecr', 'challan', 'statutory', 'unified portal', 'monthly return']
    },
    {
      id: 'nav-dashboard',
      title: 'Dashboard Overview',
      category: 'Navigation',
      icon: Layers,
      shortcut: 'G D',
      action: () => { onNavigate('DASHBOARD'); onClose(); },
      keywords: ['home', 'overview', 'summary', 'live', 'stats']
    },
    {
      id: 'nav-inbox',
      title: 'Action Inbox (Approvals & Exceptions)',
      category: 'Navigation',
      icon: Inbox,
      shortcut: 'G I',
      action: () => { onNavigate('INBOX'); onClose(); },
      keywords: ['inbox', 'pending', 'approvals', 'exceptions', 'kharchi', 'advances', 'conflicts', 'actions']
    },
    {
      id: 'nav-workers',
      title: 'Workers Directory',
      category: 'Navigation',
      icon: Users,
      shortcut: 'G W',
      action: () => { onNavigate('WORKERS'); onClose(); },
      keywords: ['employees', 'staff', 'labour', 'list', 'people']
    },
    {
      id: 'act-add-worker',
      title: 'Add New Worker',
      category: 'Actions',
      icon: UserPlus,
      shortcut: 'N W',
      action: () => { onNavigate('ADD_WORKER'); onClose(); },
      keywords: ['create', 'register', 'employee', 'hire']
    },
    {
      id: 'nav-kiosk',
      title: 'Open Attendance Kiosk / Face Scanner',
      category: 'Actions',
      icon: Camera,
      shortcut: 'K',
      action: () => { onNavigate('ATTENDANCE_KIOSK'); onClose(); },
      keywords: ['scan', 'face', 'camera', 'check-in', 'punch']
    },
    {
      id: 'nav-attendance',
      title: 'Attendance Records & Logs',
      category: 'Navigation',
      icon: CalendarCheck,
      shortcut: 'G A',
      action: () => { onNavigate('ATTENDANCE'); onClose(); },
      keywords: ['punches', 'timesheet', 'history', 'daily']
    },
    {
      id: 'nav-payroll',
      title: 'Monthly Payroll & Payslips',
      category: 'Navigation',
      icon: IndianRupee,
      shortcut: 'G P',
      action: () => { onNavigate('PAYROLL'); onClose(); },
      keywords: ['salary', 'wages', 'payout', 'advances', 'kharchi', 'slips']
    },
    {
      id: 'nav-daily-logs',
      title: 'Daily Wage Calculations',
      category: 'Navigation',
      icon: History,
      action: () => { onNavigate('DAILY_LOGS'); onClose(); },
      keywords: ['overtime', 'per day', 'rates']
    },
    {
      id: 'nav-id-cards',
      title: 'Digital Worker ID Cards',
      category: 'Navigation',
      icon: IdCard,
      action: () => { onNavigate('ID_CARDS'); onClose(); },
      keywords: ['badge', 'qr', 'print', 'card']
    },
    {
      id: 'nav-reports',
      title: 'Factory & Compliance Reports',
      category: 'Navigation',
      icon: PieChart,
      action: () => { onNavigate('REPORTS'); onClose(); },
      keywords: ['analytics', 'download', 'pdf', 'excel', 'export', 'pf', 'esic']
    },
    {
      id: 'nav-billing',
      title: 'Subscription & Plan Limits',
      category: 'Navigation',
      icon: CreditCard,
      action: () => { onNavigate('BILLING'); onClose(); },
      keywords: ['upgrade', 'plan', 'pricing', 'payment', 'trial']
    },
    {
      id: 'nav-settings',
      title: 'Settings, Shifts & Geofencing',
      category: 'Navigation',
      icon: Settings,
      shortcut: 'G S',
      action: () => { onNavigate('SETTINGS'); onClose(); },
      keywords: ['shifts', 'company', 'organization', 'rules', 'branches', 'departments']
    },
    {
      id: 'nav-team',
      title: 'Manage Supervisors & Team',
      category: 'Navigation',
      icon: Users,
      action: () => { onNavigate('TEAM'); onClose(); },
      keywords: ['managers', 'supervisors', 'invite']
    },
    // Platform Demo
    {
      id: 'act-reset-demo',
      title: 'Reload Platform Demo Data',
      category: 'System',
      icon: Sparkles,
      action: () => { loginDemo('FACTORY_OWNER'); onNavigate('DASHBOARD'); onClose(); },
      keywords: ['demo', 'reset', 'sample data', 'factory']
    }
  ];

  const filteredItems = items.filter((item) => {
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
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
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
            placeholder="Type a screen name or action (e.g. workers, kiosk, payroll, shift)..."
            className="w-full bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
          />
          {query && (
            <button 
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
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
              <p className="text-xs text-slate-500 font-medium">No commands found matching "{query}"</p>
              <p className="text-[11px] text-slate-400 mt-1">Try searching for workers, payroll, shifts, or kiosk</p>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors text-xs ${
                    isSelected ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-1.5 rounded-lg shrink-0 ${
                      isSelected ? 'bg-white text-blue-600 shadow-xs' : 'bg-slate-100 text-slate-500'
                    }`}>
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
                    {isSelected && (
                      <CornerDownLeft size={13} className="text-slate-400" />
                    )}
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
              <kbd className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-2xs">↑</kbd>
              <kbd className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-2xs">↓</kbd>
              <span>navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-2xs">↵</kbd>
              <span>select</span>
            </span>
          </div>
          <span className="text-[10px] font-medium text-slate-400">WorkForce Command Bar</span>
        </div>
      </div>
    </div>
  );
};
