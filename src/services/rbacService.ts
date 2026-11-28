// src/services/rbacService.ts
import { CanonicalRole, Role, ScreenName, UserProfile } from '../types/index';

/**
 * Canonical System Roles:
 * - SUPER_ADMIN: SaaS Platform Owner (Tenants, Resellers, Revenue, System Settings)
 * - RESELLER: Channel Partner / CA Agency (Partner Dashboard, Client List, Commission Ledger)
 * - TENANT_ADMIN: SMB Owner / Factory Admin (Dashboard, Workers, Payroll, Attendance, Settings)
 * - MANAGER: Branch / HR Manager (Dashboard, Attendance [assigned branch only], Reports)
 * - WORKER: Frontline Employee (Self-service portal, own attendance & payslips)
 */
export const CANONICAL_ROLES: CanonicalRole[] = [
  'SUPER_ADMIN',
  'RESELLER',
  'TENANT_ADMIN',
  'FINANCE',
  'MANAGER',
  'WORKER',
];

export const ROLE_PRIORITY: Record<CanonicalRole, number> = {
  SUPER_ADMIN: 6,
  RESELLER: 5,
  TENANT_ADMIN: 4,
  FINANCE: 3,
  MANAGER: 2,
  WORKER: 1,
};

export interface RoleMetadata {
  role: CanonicalRole;
  label: string;
  shortLabel: string;
  description: string;
  defaultPath: string;
  defaultScreen: ScreenName;
  badgeClass: string;
}

export const ROLE_METADATA: Record<CanonicalRole, RoleMetadata> = {
  SUPER_ADMIN: {
    role: 'SUPER_ADMIN',
    label: 'Super Admin',
    shortLabel: 'Super Admin',
    description: 'Platform tenants, resellers, revenue & system governance',
    defaultPath: '/admin/tenants',
    defaultScreen: 'SUPER_ADMIN_TENANTS',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  RESELLER: {
    role: 'RESELLER',
    label: 'Reseller Partner',
    shortLabel: 'Reseller',
    description: 'Partner dashboard, client portfolio & commission ledger',
    defaultPath: '/reseller/dashboard',
    defaultScreen: 'RESELLER_DASHBOARD',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  },
  TENANT_ADMIN: {
    role: 'TENANT_ADMIN',
    label: 'Tenant Admin (Owner)',
    shortLabel: 'Tenant Admin',
    description: 'Full organization operations, workers, payroll & settings',
    defaultPath: '/dashboard',
    defaultScreen: 'DASHBOARD',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  FINANCE: {
    role: 'FINANCE',
    label: 'Finance Admin',
    shortLabel: 'Finance',
    description: 'Month-end expense verification, immutability lock, payroll & FnF payouts',
    defaultPath: '/finance',
    defaultScreen: 'FINANCE_DASHBOARD',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-200',
  },
  MANAGER: {
    role: 'MANAGER',
    label: 'Branch Manager',
    shortLabel: 'Manager',
    description: 'Assigned branch dashboard, attendance & operational reports',
    defaultPath: '/dashboard',
    defaultScreen: 'DASHBOARD',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  WORKER: {
    role: 'WORKER',
    label: 'Worker',
    shortLabel: 'Worker',
    description: 'Personal attendance summary, shift schedule & payslips',
    defaultPath: '/worker-portal',
    defaultScreen: 'WORKER_PORTAL',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
  },
};

/**
 * Maps legacy or alias role values (FACTORY_OWNER, SUPERVISOR, CA) to canonical roles.
 */
export function normalizeRole(role?: string | Role | null): CanonicalRole {
  if (!role) return 'WORKER';
  const upper = String(role).trim().toUpperCase();
  switch (upper) {
    case 'SUPER_ADMIN':
      return 'SUPER_ADMIN';
    case 'RESELLER':
    case 'CA':
      return 'RESELLER';
    case 'TENANT_ADMIN':
    case 'FACTORY_OWNER':
    case 'OWNER':
    case 'ADMIN':
      return 'TENANT_ADMIN';
    case 'FINANCE':
    case 'FINANCE_ADMIN':
    case 'ACCOUNTANT':
      return 'FINANCE';
    case 'MANAGER':
    case 'SUPERVISOR':
    case 'BRANCH_MANAGER':
    case 'HR_MANAGER':
      return 'MANAGER';
    case 'WORKER':
    case 'EMPLOYEE':
    default:
      return 'WORKER';
  }
}

/**
 * Extracts all unique canonical roles granted to a user from their profile & optional token claims.
 */
export function getAvailableCanonicalRoles(
  profile?: UserProfile | null,
  tokenClaims?: Record<string, any> | null
): CanonicalRole[] {
  const roleSet = new Set<CanonicalRole>();

  if (tokenClaims) {
    if (Array.isArray(tokenClaims.roles)) {
      tokenClaims.roles.forEach((r: any) => {
        if (typeof r === 'string' && r.trim()) roleSet.add(normalizeRole(r));
      });
    }
    if (typeof tokenClaims.role === 'string' && tokenClaims.role.trim()) {
      roleSet.add(normalizeRole(tokenClaims.role));
    }
  }

  if (profile) {
    if (Array.isArray(profile.roles)) {
      profile.roles.forEach((r) => {
        if (r) roleSet.add(normalizeRole(r));
      });
    }
    if (profile.role) {
      roleSet.add(normalizeRole(profile.role));
    }
  }

  if (roleSet.size === 0) {
    return ['WORKER'];
  }

  return Array.from(roleSet).sort((a, b) => ROLE_PRIORITY[b] - ROLE_PRIORITY[a]);
}

export function isSuperAdminRole(role?: string | Role | null): boolean {
  return normalizeRole(role) === 'SUPER_ADMIN';
}

export function isResellerRole(role?: string | Role | null): boolean {
  return normalizeRole(role) === 'RESELLER';
}

export function isTenantAdminRole(role?: string | Role | null): boolean {
  return normalizeRole(role) === 'TENANT_ADMIN';
}

export function isFinanceRole(role?: string | Role | null): boolean {
  return normalizeRole(role) === 'FINANCE';
}

export function isManagerRole(role?: string | Role | null): boolean {
  return normalizeRole(role) === 'MANAGER';
}

export function isWorkerRole(role?: string | Role | null): boolean {
  return normalizeRole(role) === 'WORKER';
}

/**
 * Canonical URL path mapping for every ScreenName.
 */
export const SCREEN_TO_PATH: Record<ScreenName, string> = {
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  INBOX: '/inbox',
  FINANCE_DASHBOARD: '/finance',
  WORKERS: '/workers',
  ADD_WORKER: '/workers/add',
  ATTENDANCE: '/attendance',
  ROSTER: '/roster',
  ATTENDANCE_KIOSK: '/kiosk',
  PAYROLL: '/payroll',
  CTC_SIMULATOR: '/ctc-simulator',
  GRATUITY: '/gratuity',
  ANNUAL_BONUS: '/annual-bonus',
  POSH_ICC: '/posh-icc',
  DAILY_LOGS: '/daily-logs',
  ID_CARDS: '/id-cards',
  REPORTS: '/reports',
  SETTINGS: '/settings',
  ADVANCED_HR_SETTINGS: '/settings/advanced-hr',
  TEAM: '/team',
  BILLING: '/billing',
  WORKER_HISTORY: '/worker-history',
  WORKER_PORTAL: '/worker-portal',
  SUPER_ADMIN_DASHBOARD: '/admin/tenants',
  SUPER_ADMIN_TENANTS: '/admin/tenants',
  SUPER_ADMIN_RESELLERS: '/admin/resellers',
  SUPER_ADMIN_REVENUE: '/admin/revenue',
  SUPER_ADMIN_SETTINGS: '/admin/settings',
  RESELLER_DASHBOARD: '/reseller/dashboard',
  RESELLER_CLIENTS: '/reseller/clients',
  RESELLER_COMMISSIONS: '/reseller/commissions',
  TERMS: '/terms',
  PRIVACY: '/privacy',
};

const PATH_TO_SCREEN_ENTRIES: Array<[string, ScreenName]> = [
  ['/admin/tenants', 'SUPER_ADMIN_TENANTS'],
  ['/admin/resellers', 'SUPER_ADMIN_RESELLERS'],
  ['/admin/revenue', 'SUPER_ADMIN_REVENUE'],
  ['/admin/settings', 'SUPER_ADMIN_SETTINGS'],
  ['/admin', 'SUPER_ADMIN_TENANTS'],
  ['/reseller/dashboard', 'RESELLER_DASHBOARD'],
  ['/reseller/clients', 'RESELLER_CLIENTS'],
  ['/reseller/commissions', 'RESELLER_COMMISSIONS'],
  ['/reseller', 'RESELLER_DASHBOARD'],
  ['/dashboard', 'DASHBOARD'],
  ['/inbox', 'INBOX'],
  ['/finance', 'FINANCE_DASHBOARD'],
  ['/workers/add', 'ADD_WORKER'],
  ['/workers', 'WORKERS'],
  ['/attendance', 'ATTENDANCE'],
  ['/roster', 'ROSTER'],
  ['/kiosk', 'ATTENDANCE_KIOSK'],
  ['/payroll', 'PAYROLL'],
  ['/ctc-simulator', 'CTC_SIMULATOR'],
  ['/gratuity', 'GRATUITY'],
  ['/annual-bonus', 'ANNUAL_BONUS'],
  ['/posh-icc', 'POSH_ICC'],
  ['/daily-logs', 'DAILY_LOGS'],
  ['/id-cards', 'ID_CARDS'],
  ['/reports', 'REPORTS'],
  ['/settings/advanced-hr', 'ADVANCED_HR_SETTINGS'],
  ['/settings', 'SETTINGS'],
  ['/team', 'TEAM'],
  ['/billing', 'BILLING'],
  ['/worker-history', 'WORKER_HISTORY'],
  ['/worker-portal', 'WORKER_PORTAL'],
  ['/terms', 'TERMS'],
  ['/privacy', 'PRIVACY'],
  ['/login', 'LOGIN'],
];

export function screenToPath(screen: ScreenName): string {
  return SCREEN_TO_PATH[screen] || '/dashboard';
}

export function pathToScreen(pathname: string): ScreenName {
  const normalized = (pathname || '/').replace(/\/+$/, '') || '/';
  for (const [prefix, screen] of PATH_TO_SCREEN_ENTRIES) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return screen;
    }
  }
  return 'DASHBOARD';
}

/**
 * Strict Screen-Level RBAC Allowlist:
 * - SUPER_ADMIN: Tenants, Resellers, Revenue, System Settings (+ Billing, Legal)
 * - RESELLER: Partner Dashboard, Client List, Commission Ledger (+ Legal)
 * - TENANT_ADMIN: Dashboard, Workers, Payroll, Attendance, Settings, Operational/Statutory modules (+ Legal)
 * - MANAGER: Dashboard, Attendance (assigned branch only), Reports (+ Legal)
 * - WORKER: Worker Portal, Own Worker History (+ Legal)
 */
export const SCREEN_ALLOWED_ROLES: Record<ScreenName, CanonicalRole[]> = {
  LOGIN: CANONICAL_ROLES,
  TERMS: CANONICAL_ROLES,
  PRIVACY: CANONICAL_ROLES,

  // Super Admin routes
  SUPER_ADMIN_DASHBOARD: ['SUPER_ADMIN'],
  SUPER_ADMIN_TENANTS: ['SUPER_ADMIN'],
  SUPER_ADMIN_RESELLERS: ['SUPER_ADMIN'],
  SUPER_ADMIN_REVENUE: ['SUPER_ADMIN'],
  SUPER_ADMIN_SETTINGS: ['SUPER_ADMIN'],

  // Reseller routes
  RESELLER_DASHBOARD: ['RESELLER'],
  RESELLER_CLIENTS: ['RESELLER'],
  RESELLER_COMMISSIONS: ['RESELLER'],

  // Shared Tenant Admin + Manager routes
  DASHBOARD: ['TENANT_ADMIN', 'MANAGER'],
  ATTENDANCE: ['TENANT_ADMIN', 'MANAGER'],
  REPORTS: ['TENANT_ADMIN', 'FINANCE', 'MANAGER'],

  // Finance Verification & Payroll Lock routes (TENANT_ADMIN + FINANCE)
  FINANCE_DASHBOARD: ['TENANT_ADMIN', 'FINANCE'],
  PAYROLL: ['TENANT_ADMIN', 'FINANCE'],
  GRATUITY: ['TENANT_ADMIN', 'FINANCE'],

  // Strictly Tenant Admin only routes (Managers, Finance & Workers blocked!)
  WORKERS: ['TENANT_ADMIN'],
  ADD_WORKER: ['TENANT_ADMIN'],
  SETTINGS: ['TENANT_ADMIN'],
  ADVANCED_HR_SETTINGS: ['TENANT_ADMIN'],
  TEAM: ['TENANT_ADMIN'],
  BILLING: ['TENANT_ADMIN', 'SUPER_ADMIN'],
  INBOX: ['TENANT_ADMIN'],
  ROSTER: ['TENANT_ADMIN'],
  ATTENDANCE_KIOSK: ['TENANT_ADMIN'],
  DAILY_LOGS: ['TENANT_ADMIN'],
  ID_CARDS: ['TENANT_ADMIN'],
  CTC_SIMULATOR: ['TENANT_ADMIN'],
  ANNUAL_BONUS: ['TENANT_ADMIN'],
  POSH_ICC: ['TENANT_ADMIN'],

  // Worker self-service routes
  WORKER_PORTAL: ['WORKER'],
  WORKER_HISTORY: ['TENANT_ADMIN', 'WORKER'],
};

export function canAccessScreen(role: CanonicalRole, screen: ScreenName): boolean {
  const allowed = SCREEN_ALLOWED_ROLES[screen];
  if (!allowed) return false;
  return allowed.includes(role);
}

export function canAccessPath(role: CanonicalRole, pathname: string): boolean {
  const screen = pathToScreen(pathname);
  return canAccessScreen(role, screen);
}

export function getDefaultPathForRole(role: CanonicalRole): string {
  return ROLE_METADATA[role]?.defaultPath || '/dashboard';
}

export function getDefaultScreenForRole(role: CanonicalRole): ScreenName {
  return ROLE_METADATA[role]?.defaultScreen || 'DASHBOARD';
}

/**
 * Resolves branch scoping constraints for a user profile.
 * Managers are strictly scoped to their assigned branch(es).
 */
export interface BranchScope {
  isBranchScoped: boolean;
  primaryBranchId?: string;
  allowedBranchIds: string[];
  branchName?: string;
}

export function getBranchScopeForUser(
  profile?: UserProfile | null,
  activeRole?: CanonicalRole
): BranchScope {
  const role = activeRole || normalizeRole(profile?.activeRole || profile?.role);
  if (role !== 'MANAGER') {
    return {
      isBranchScoped: false,
      allowedBranchIds: [],
    };
  }

  const branchIds = new Set<string>();
  if (profile?.branchId) branchIds.add(profile.branchId);
  if (Array.isArray(profile?.assignedBranchIds)) {
    profile.assignedBranchIds.forEach((b) => {
      if (b) branchIds.add(b);
    });
  }

  // Default fallback branch if a legacy manager record has no explicit branchId yet
  if (branchIds.size === 0) {
    branchIds.add('default');
  }

  const list = Array.from(branchIds);
  return {
    isBranchScoped: true,
    primaryBranchId: list[0],
    allowedBranchIds: list,
    branchName: profile?.branchName || (list[0] === 'branch-anand' ? 'Anand Manufacturing Unit' : 'Main Branch (Head Office)'),
  };
}

/**
 * Cross-tab / Demo role override store so Super Admin demotions propagate mid-session
 * even in offline/demo sandbox environments.
 */
const ROLE_OVERRIDE_STORAGE_KEY = 'workforce_mid_session_role_overrides_v1';

export interface MidSessionRoleOverride {
  uid: string;
  role: CanonicalRole;
  roles?: CanonicalRole[];
  branchId?: string;
  branchName?: string;
  isActive?: boolean;
  roleVersion: number;
  updatedAt: string;
  updatedBy?: string;
}

export function getMidSessionRoleOverride(uid: string): MidSessionRoleOverride | null {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    const raw = window.localStorage.getItem(ROLE_OVERRIDE_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, MidSessionRoleOverride>;
    return map[uid] || null;
  } catch {
    return null;
  }
}

export function setMidSessionRoleOverride(override: MidSessionRoleOverride): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(ROLE_OVERRIDE_STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, MidSessionRoleOverride>) : {};
    map[override.uid] = override;
    window.localStorage.setItem(ROLE_OVERRIDE_STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent('workforce:role-override-changed', { detail: override }));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearMidSessionRoleOverride(uid: string): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    const raw = window.localStorage.getItem(ROLE_OVERRIDE_STORAGE_KEY);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, MidSessionRoleOverride>;
    delete map[uid];
    window.localStorage.setItem(ROLE_OVERRIDE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore
  }
}
