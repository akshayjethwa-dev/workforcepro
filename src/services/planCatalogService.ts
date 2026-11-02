// src/services/planCatalogService.ts
import { 
  Plan, 
  PlanVersion, 
  Subscription, 
  PlanMutationAuditLog, 
  InvoiceCalculationResult 
} from '../types/planCatalog';
import { tenantSecurityService } from './tenantSecurityService';

const PLANS_STORAGE_KEY = 'workforce_plan_catalog_v1';
const SUBSCRIPTIONS_STORAGE_KEY = 'workforce_tenant_subscriptions_v1';
const PLAN_AUDIT_STORAGE_KEY = 'workforce_plan_audit_logs_v1';

// Launch Configuration Baseline Seed Data
const INITIAL_LAUNCH_PLANS: Plan[] = [
  {
    id: 'plan-free-10',
    code: 'FREE',
    name: 'Free Starter',
    description: 'Essential biometric attendance and shift logging for single-site pilot teams and micro-contractors.',
    category: 'STANDARD',
    currency: 'INR',
    isPublic: true,
    isActive: true,
    isDeleted: false,
    currentVersion: 1,
    sortOrder: 1,
    badge: 'Free Forever',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    versions: [
      {
        version: 1,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: null,
        monthlyPrice: 0,
        annualPrice: 0,
        employeeCap: 10,
        overageRate: 0,
        gstRate: 18,
        featureFlags: ['attendance', 'reports_basic', 'kiosk'],
        changeNotes: 'Initial launch seed configuration for micro teams.',
        createdBy: 'system-seed'
      }
    ]
  },
  {
    id: 'plan-growth-50',
    code: 'GROWTH',
    name: 'Growth Business',
    description: 'Automated payroll processing, salary advances, and shift scheduling designed for expanding factories.',
    category: 'STANDARD',
    currency: 'INR',
    isPublic: true,
    isActive: true,
    isDeleted: false,
    currentVersion: 1,
    sortOrder: 2,
    badge: 'Most Popular',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    versions: [
      {
        version: 1,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: null,
        monthlyPrice: 1999,
        annualPrice: 19990, // 2 months free (10 months price)
        employeeCap: 50,
        overageRate: 45,
        gstRate: 18,
        featureFlags: [
          'attendance', 
          'reports_basic', 
          'kiosk', 
          'payroll_basic', 
          'advances', 
          'scheduling', 
          'exports'
        ],
        changeNotes: 'Initial launch configuration with 2 months free on annual subscription.',
        createdBy: 'system-seed'
      }
    ]
  },
  {
    id: 'plan-pro-100',
    code: 'PRO',
    name: 'Agency Pro',
    description: 'Complete statutory returns (PF/ESIC), multi-branch coordination, AI anomaly detection, and WhatsApp alerts.',
    category: 'STANDARD',
    currency: 'INR',
    isPublic: true,
    isActive: true,
    isDeleted: false,
    currentVersion: 1,
    sortOrder: 3,
    badge: 'Best Value',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    versions: [
      {
        version: 1,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: null,
        monthlyPrice: 3999,
        annualPrice: 39990, // 2 months free
        employeeCap: 100,
        overageRate: 40,
        gstRate: 18,
        featureFlags: [
          'attendance', 
          'reports_basic', 
          'kiosk', 
          'payroll_basic', 
          'advances', 
          'scheduling', 
          'exports', 
          'payroll_statutory', 
          'multi_branch', 
          'anomaly_detection', 
          'whatsapp', 
          'action_inbox'
        ],
        changeNotes: 'Initial launch configuration for high-volume staffing agencies & multi-site plants.',
        createdBy: 'system-seed'
      }
    ]
  },
  {
    id: 'plan-enterprise-custom',
    code: 'ENTERPRISE',
    name: 'Enterprise Scale',
    description: 'Custom SLA, white-label portals, SAML SSO, REST API access, and tailored compliance workflows.',
    category: 'STANDARD',
    currency: 'INR',
    isPublic: true,
    isActive: true,
    isDeleted: false,
    currentVersion: 1,
    sortOrder: 4,
    badge: 'Custom Scale',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    versions: [
      {
        version: 1,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: null,
        monthlyPrice: null, // Quote
        annualPrice: null, // Quote
        employeeCap: null, // Unlimited/Custom
        overageRate: null,
        gstRate: 18,
        featureFlags: [
          'attendance', 
          'reports_basic', 
          'kiosk', 
          'payroll_basic', 
          'advances', 
          'scheduling', 
          'exports', 
          'payroll_statutory', 
          'multi_branch', 
          'anomaly_detection', 
          'whatsapp', 
          'action_inbox', 
          'api_access', 
          'sso', 
          'white_label', 
          'custom_sla'
        ],
        changeNotes: 'Initial launch seed configuration for enterprise multi-entity operations.',
        createdBy: 'system-seed'
      }
    ]
  }
];

// Baseline Subscriptions for existing demo tenants
const INITIAL_SUBSCRIPTIONS: Subscription[] = [
  {
    id: 'sub-tenant-1',
    tenantId: 'demo-tenant-1',
    planId: 'plan-enterprise-custom',
    planCode: 'ENTERPRISE',
    planVersion: 1,
    billingInterval: 'ANNUAL',
    priceLockedAt: {
      monthlyPrice: null,
      annualPrice: null,
      gstRate: 18,
      overageRate: null,
      employeeCap: null,
      lockedAt: '2026-01-15T08:00:00.000Z'
    },
    status: 'ACTIVE',
    currentPeriodStart: '2026-01-15T08:00:00.000Z',
    currentPeriodEnd: '2027-01-15T08:00:00.000Z',
    isGrandfathered: false,
    createdAt: '2026-01-15T08:00:00.000Z',
    updatedAt: '2026-01-15T08:00:00.000Z'
  },
  {
    id: 'sub-tenant-2',
    tenantId: 'demo-tenant-2',
    planId: 'plan-pro-100',
    planCode: 'PRO',
    planVersion: 1,
    billingInterval: 'MONTHLY',
    priceLockedAt: {
      monthlyPrice: 3999,
      annualPrice: 39990,
      gstRate: 18,
      overageRate: 40,
      employeeCap: 100,
      lockedAt: '2026-02-10T10:30:00.000Z'
    },
    status: 'ACTIVE',
    currentPeriodStart: '2026-02-10T10:30:00.000Z',
    currentPeriodEnd: '2026-03-10T10:30:00.000Z',
    isGrandfathered: false,
    createdAt: '2026-02-10T10:30:00.000Z',
    updatedAt: '2026-02-10T10:30:00.000Z'
  },
  {
    id: 'sub-tenant-3',
    tenantId: 'demo-tenant-3',
    planId: 'plan-enterprise-custom',
    planCode: 'ENTERPRISE',
    planVersion: 1,
    billingInterval: 'ANNUAL',
    priceLockedAt: {
      monthlyPrice: null,
      annualPrice: null,
      gstRate: 18,
      overageRate: null,
      employeeCap: null,
      lockedAt: '2026-03-01T09:15:00.000Z'
    },
    status: 'ACTIVE',
    currentPeriodStart: '2026-03-01T09:15:00.000Z',
    currentPeriodEnd: '2027-03-01T09:15:00.000Z',
    isGrandfathered: false,
    createdAt: '2026-03-01T09:15:00.000Z',
    updatedAt: '2026-03-01T09:15:00.000Z'
  }
];

function loadStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveStored<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error(`Error saving to localStorage key "${key}":`, err);
  }
}

export class PlanCatalogService {
  /**
   * Retrieves all plans in the system (including inactive or soft-deleted if requested).
   */
  async getAllPlans(includeDeleted = false): Promise<Plan[]> {
    const plans = loadStored<Plan[]>(PLANS_STORAGE_KEY, INITIAL_LAUNCH_PLANS);
    return includeDeleted ? plans : plans.filter(p => !p.isDeleted);
  }

  /**
   * Public Pricing Page query:
   * Returns plans where isPublic = true AND isActive = true AND !isDeleted
   * Strictly no hardcoded copy!
   */
  async getPublicPlans(): Promise<Plan[]> {
    const plans = await this.getAllPlans(false);
    return plans
      .filter(p => p.isPublic && p.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /**
   * Fetch a single plan by code
   */
  async getPlanByCode(code: string): Promise<Plan | null> {
    const plans = await this.getAllPlans(true);
    return plans.find(p => p.code.toUpperCase() === code.toUpperCase()) || null;
  }

  /**
   * Fetch a specific plan version
   */
  async getPlanVersion(code: string, versionNumber: number): Promise<PlanVersion | null> {
    const plan = await this.getPlanByCode(code);
    if (!plan) return null;
    return plan.versions.find(v => v.version === versionNumber) || null;
  }

  /**
   * Get the current active version of a plan
   */
  getCurrentVersion(plan: Plan): PlanVersion {
    const found = plan.versions.find(v => v.version === plan.currentVersion);
    if (found) return found;
    return plan.versions[plan.versions.length - 1];
  }

  /**
   * Create a new Plan record.
   * `code` is immutable once created.
   */
  async createPlan(
    params: {
      code: string;
      name: string;
      description: string;
      category?: Plan['category'];
      currency?: 'INR' | 'USD';
      isPublic: boolean;
      isActive: boolean;
      badge?: string;
      sortOrder?: number;
      monthlyPrice: number | null;
      annualPrice: number | null;
      employeeCap: number | null;
      overageRate: number | null;
      gstRate?: number;
      featureFlags: string[];
      changeNotes?: string;
    },
    actor: { uid: string; email: string; role: string }
  ): Promise<Plan> {
    const plans = await this.getAllPlans(true);
    const normalizedCode = params.code.trim().toUpperCase();

    if (!normalizedCode) {
      throw new Error('Plan code is required and cannot be empty.');
    }

    if (plans.some(p => p.code === normalizedCode && !p.isDeleted)) {
      throw new Error(`Plan with code "${normalizedCode}" already exists.`);
    }

    const now = new Date().toISOString();
    const planId = 'plan-' + normalizedCode.toLowerCase() + '-' + Date.now();

    const initialVersion: PlanVersion = {
      version: 1,
      effectiveFrom: now,
      effectiveTo: null,
      monthlyPrice: params.monthlyPrice,
      annualPrice: params.annualPrice,
      employeeCap: params.employeeCap,
      overageRate: params.overageRate,
      gstRate: params.gstRate ?? 18,
      featureFlags: params.featureFlags,
      changeNotes: params.changeNotes || 'Initial plan creation.',
      createdBy: actor.email
    };

    const newPlan: Plan = {
      id: planId,
      code: normalizedCode,
      name: params.name.trim(),
      description: params.description.trim(),
      category: params.category || 'STANDARD',
      currency: params.currency || 'INR',
      isPublic: params.isPublic,
      isActive: params.isActive,
      isDeleted: false,
      deletedAt: null,
      currentVersion: 1,
      versions: [initialVersion],
      badge: params.badge?.trim() || undefined,
      sortOrder: params.sortOrder ?? (plans.length + 1),
      createdAt: now,
      updatedAt: now
    };

    const updatedPlans = [...plans, newPlan];
    saveStored(PLANS_STORAGE_KEY, updatedPlans);

    // E15 Audit Trail logging
    await this.logE15Mutation({
      planId: newPlan.id,
      planCode: newPlan.code,
      versionNumber: 1,
      action: 'PLAN_CREATED',
      actorId: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      beforeState: null,
      afterState: newPlan,
      summary: `Created new plan "${newPlan.name}" (${newPlan.code}) with v1. Monthly: ${params.monthlyPrice === null ? 'Quote' : '₹' + params.monthlyPrice}, Cap: ${params.employeeCap ?? 'Unlimited'}.`,
      reason: params.changeNotes
    });

    return newPlan;
  }

  /**
   * Update an existing plan.
   * If commercial attributes (price, cap, overage, GST, features) changed,
   * creates a new PlanVersion (`effectiveFrom: now`), preserving historical versions.
   * `code` remains immutable.
   */
  async updatePlan(
    planId: string,
    updates: {
      name?: string;
      description?: string;
      category?: Plan['category'];
      isPublic?: boolean;
      isActive?: boolean;
      badge?: string;
      sortOrder?: number;
      // Versioned fields:
      monthlyPrice?: number | null;
      annualPrice?: number | null;
      employeeCap?: number | null;
      overageRate?: number | null;
      gstRate?: number;
      featureFlags?: string[];
      changeNotes?: string;
    },
    actor: { uid: string; email: string; role: string }
  ): Promise<Plan> {
    const plans = await this.getAllPlans(true);
    const existingIndex = plans.findIndex(p => p.id === planId);
    if (existingIndex === -1) {
      throw new Error(`Plan with ID "${planId}" not found.`);
    }

    const existingPlan = plans[existingIndex];
    const beforeSnapshot = JSON.parse(JSON.stringify(existingPlan));
    const currentVer = this.getCurrentVersion(existingPlan);

    const now = new Date().toISOString();

    // Check if commercial attributes have changed necessitating a new version
    const hasPriceChanged = updates.monthlyPrice !== undefined && updates.monthlyPrice !== currentVer.monthlyPrice;
    const hasAnnualChanged = updates.annualPrice !== undefined && updates.annualPrice !== currentVer.annualPrice;
    const hasCapChanged = updates.employeeCap !== undefined && updates.employeeCap !== currentVer.employeeCap;
    const hasOverageChanged = updates.overageRate !== undefined && updates.overageRate !== currentVer.overageRate;
    const hasGstChanged = updates.gstRate !== undefined && updates.gstRate !== currentVer.gstRate;
    
    const flagsChanged = updates.featureFlags !== undefined && (
      updates.featureFlags.length !== currentVer.featureFlags.length ||
      updates.featureFlags.some(f => !currentVer.featureFlags.includes(f))
    );

    const requiresNewVersion = hasPriceChanged || hasAnnualChanged || hasCapChanged || hasOverageChanged || hasGstChanged || flagsChanged;

    let updatedVersions = [...existingPlan.versions];
    let nextVersionNumber = existingPlan.currentVersion;

    if (requiresNewVersion) {
      // Supersede current version
      updatedVersions = updatedVersions.map(v => 
        v.version === existingPlan.currentVersion 
          ? { ...v, effectiveTo: now } 
          : v
      );

      nextVersionNumber = existingPlan.currentVersion + 1;
      const newVersion: PlanVersion = {
        version: nextVersionNumber,
        effectiveFrom: now,
        effectiveTo: null,
        monthlyPrice: updates.monthlyPrice !== undefined ? updates.monthlyPrice : currentVer.monthlyPrice,
        annualPrice: updates.annualPrice !== undefined ? updates.annualPrice : currentVer.annualPrice,
        employeeCap: updates.employeeCap !== undefined ? updates.employeeCap : currentVer.employeeCap,
        overageRate: updates.overageRate !== undefined ? updates.overageRate : currentVer.overageRate,
        gstRate: updates.gstRate !== undefined ? updates.gstRate : currentVer.gstRate,
        featureFlags: updates.featureFlags !== undefined ? updates.featureFlags : currentVer.featureFlags,
        changeNotes: updates.changeNotes || `Version bumped to v${nextVersionNumber} by ${actor.email}`,
        createdBy: actor.email
      };

      updatedVersions.push(newVersion);
    }

    const updatedPlan: Plan = {
      ...existingPlan,
      name: updates.name !== undefined ? updates.name.trim() : existingPlan.name,
      description: updates.description !== undefined ? updates.description.trim() : existingPlan.description,
      category: updates.category !== undefined ? updates.category : existingPlan.category,
      isPublic: updates.isPublic !== undefined ? updates.isPublic : existingPlan.isPublic,
      isActive: updates.isActive !== undefined ? updates.isActive : existingPlan.isActive,
      badge: updates.badge !== undefined ? updates.badge.trim() || undefined : existingPlan.badge,
      sortOrder: updates.sortOrder !== undefined ? updates.sortOrder : existingPlan.sortOrder,
      currentVersion: nextVersionNumber,
      versions: updatedVersions,
      updatedAt: now
      // Note: `code` is strictly immutable and never reassigned
    };

    plans[existingIndex] = updatedPlan;
    saveStored(PLANS_STORAGE_KEY, plans);

    // E15 Audit Trail Logging
    const action = requiresNewVersion ? 'PLAN_VERSION_CREATED' : 'PLAN_UPDATED';
    const summary = requiresNewVersion
      ? `Created Plan Version v${nextVersionNumber} for "${updatedPlan.name}" (${updatedPlan.code}). Price: ₹${updates.monthlyPrice ?? currentVer.monthlyPrice}/mo, Cap: ${updates.employeeCap ?? currentVer.employeeCap}. Historical subscribers remain grandfathered.`
      : `Updated metadata for "${updatedPlan.name}" (${updatedPlan.code}). Public: ${updatedPlan.isPublic}, Active: ${updatedPlan.isActive}.`;

    await this.logE15Mutation({
      planId: updatedPlan.id,
      planCode: updatedPlan.code,
      versionNumber: nextVersionNumber,
      action,
      actorId: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      beforeState: beforeSnapshot,
      afterState: updatedPlan,
      summary,
      reason: updates.changeNotes
    });

    return updatedPlan;
  }

  /**
   * Toggles active state of a plan.
   * Setting isActive = false hides from public pricing but keeps existing subscribers functioning.
   */
  async togglePlanActive(
    planId: string, 
    isActive: boolean, 
    actor: { uid: string; email: string; role: string }
  ): Promise<Plan> {
    const plans = await this.getAllPlans(true);
    const plan = plans.find(p => p.id === planId);
    if (!plan) throw new Error(`Plan "${planId}" not found.`);

    const beforeState = JSON.parse(JSON.stringify(plan));
    plan.isActive = isActive;
    plan.updatedAt = new Date().toISOString();

    saveStored(PLANS_STORAGE_KEY, plans);

    await this.logE15Mutation({
      planId: plan.id,
      planCode: plan.code,
      versionNumber: plan.currentVersion,
      action: isActive ? 'PLAN_ACTIVATED' : 'PLAN_DEACTIVATED',
      actorId: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      beforeState,
      afterState: plan,
      summary: `${isActive ? 'Activated' : 'Deactivated'} plan "${plan.name}" (${plan.code}). Public pricing visibility toggled.`
    });

    return plan;
  }

  /**
   * Toggles public pricing page visibility.
   */
  async togglePlanPublic(
    planId: string, 
    isPublic: boolean, 
    actor: { uid: string; email: string; role: string }
  ): Promise<Plan> {
    const plans = await this.getAllPlans(true);
    const plan = plans.find(p => p.id === planId);
    if (!plan) throw new Error(`Plan "${planId}" not found.`);

    const beforeState = JSON.parse(JSON.stringify(plan));
    plan.isPublic = isPublic;
    plan.updatedAt = new Date().toISOString();

    saveStored(PLANS_STORAGE_KEY, plans);

    await this.logE15Mutation({
      planId: plan.id,
      planCode: plan.code,
      versionNumber: plan.currentVersion,
      action: 'PLAN_UPDATED',
      actorId: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      beforeState,
      afterState: plan,
      summary: `Set isPublic=${isPublic} for plan "${plan.name}" (${plan.code}).`
    });

    return plan;
  }

  /**
   * Soft-deletes a plan.
   * If active subscriptions reference this plan, HARD delete is strictly blocked.
   * Soft delete sets isDeleted: true and isActive: false.
   */
  async softDeletePlan(
    planId: string, 
    actor: { uid: string; email: string; role: string }
  ): Promise<Plan> {
    const plans = await this.getAllPlans(true);
    const plan = plans.find(p => p.id === planId);
    if (!plan) throw new Error(`Plan "${planId}" not found.`);

    const beforeState = JSON.parse(JSON.stringify(plan));
    const now = new Date().toISOString();

    plan.isDeleted = true;
    plan.deletedAt = now;
    plan.isActive = false;
    plan.isPublic = false;
    plan.updatedAt = now;

    saveStored(PLANS_STORAGE_KEY, plans);

    await this.logE15Mutation({
      planId: plan.id,
      planCode: plan.code,
      versionNumber: plan.currentVersion,
      action: 'PLAN_SOFT_DELETED',
      actorId: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      beforeState,
      afterState: plan,
      summary: `Soft-deleted plan "${plan.name}" (${plan.code}). Hidden from catalog; historical subscriptions retained.`
    });

    return plan;
  }

  /**
   * Hard-deletes a plan ONLY IF ZERO subscriptions reference it.
   */
  async hardDeletePlan(
    planId: string, 
    actor: { uid: string; email: string; role: string }
  ): Promise<void> {
    const plans = await this.getAllPlans(true);
    const plan = plans.find(p => p.id === planId);
    if (!plan) throw new Error(`Plan "${planId}" not found.`);

    const activeCount = await this.getActiveSubscriptionCount(plan.id, plan.code);
    if (activeCount > 0) {
      throw new Error(
        `Cannot delete plan "${plan.code}": ${activeCount} active tenant subscriptions reference it. ` +
        `To protect tenant billing stability, plans with subscribers can only be soft-deleted or deactivated.`
      );
    }

    const beforeState = JSON.parse(JSON.stringify(plan));
    const remaining = plans.filter(p => p.id !== planId);
    saveStored(PLANS_STORAGE_KEY, remaining);

    await this.logE15Mutation({
      planId: plan.id,
      planCode: plan.code,
      versionNumber: plan.currentVersion,
      action: 'PLAN_SOFT_DELETED',
      actorId: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      beforeState,
      afterState: null,
      summary: `Permanently removed unreferenced plan "${plan.name}" (${plan.code}) from catalog.`
    });
  }

  /**
   * Check how many subscriptions reference this plan
   */
  async getActiveSubscriptionCount(planId: string, planCode?: string): Promise<number> {
    const subs = loadStored<Subscription[]>(SUBSCRIPTIONS_STORAGE_KEY, INITIAL_SUBSCRIPTIONS);
    return subs.filter(s => 
      (s.planId === planId || (planCode && s.planCode.toUpperCase() === planCode.toUpperCase())) &&
      s.status === 'ACTIVE'
    ).length;
  }

  /**
   * Get all subscriptions
   */
  async getAllSubscriptions(): Promise<Subscription[]> {
    return loadStored<Subscription[]>(SUBSCRIPTIONS_STORAGE_KEY, INITIAL_SUBSCRIPTIONS);
  }

  /**
   * Get a tenant's active subscription
   */
  async getTenantSubscription(tenantId: string): Promise<Subscription | null> {
    const subs = await this.getAllSubscriptions();
    return subs.find(s => s.tenantId === tenantId && s.status === 'ACTIVE') || null;
  }

  /**
   * Subscribes or upgrades a tenant to a plan.
   * Locks the price at current version (Grandfathering anchor).
   */
  async subscribeTenant(
    tenantId: string,
    planCode: string,
    billingInterval: 'MONTHLY' | 'ANNUAL' = 'MONTHLY',
    actor?: { uid: string; email: string; role: string }
  ): Promise<Subscription> {
    const plan = await this.getPlanByCode(planCode);
    if (!plan) throw new Error(`Plan with code "${planCode}" does not exist.`);

    const activeVersion = this.getCurrentVersion(plan);
    const now = new Date().toISOString();
    const subs = await this.getAllSubscriptions();

    // Check if tenant already has an active sub
    const existingIndex = subs.findIndex(s => s.tenantId === tenantId && s.status === 'ACTIVE');
    const existingSub = existingIndex >= 0 ? subs[existingIndex] : null;

    const newSub: Subscription = {
      id: existingSub?.id || ('sub-' + tenantId + '-' + Date.now()),
      tenantId,
      planId: plan.id,
      planCode: plan.code,
      planVersion: activeVersion.version,
      billingInterval,
      priceLockedAt: {
        monthlyPrice: activeVersion.monthlyPrice,
        annualPrice: activeVersion.annualPrice,
        gstRate: activeVersion.gstRate,
        overageRate: activeVersion.overageRate,
        employeeCap: activeVersion.employeeCap,
        lockedAt: now
      },
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: billingInterval === 'ANNUAL' 
        ? new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()
        : new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      isGrandfathered: false,
      createdAt: existingSub?.createdAt || now,
      updatedAt: now
    };

    if (existingIndex >= 0) {
      subs[existingIndex] = newSub;
    } else {
      subs.push(newSub);
    }
    saveStored(SUBSCRIPTIONS_STORAGE_KEY, subs);

    if (actor) {
      await this.logE15Mutation({
        planId: plan.id,
        planCode: plan.code,
        versionNumber: activeVersion.version,
        action: 'PLAN_UPDATED',
        actorId: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        beforeState: existingSub,
        afterState: newSub,
        summary: `Tenant "${tenantId}" subscribed to "${plan.name}" (v${activeVersion.version}) with price locked at ₹${activeVersion.monthlyPrice ?? 0}/mo (${billingInterval}).`
      });
    }

    return newSub;
  }

  /**
   * Explicitly migrate a grandfathered tenant to the latest active plan version
   */
  async migrateTenantToLatestVersion(
    tenantId: string,
    actor: { uid: string; email: string; role: string }
  ): Promise<Subscription> {
    const sub = await this.getTenantSubscription(tenantId);
    if (!sub) throw new Error(`No active subscription found for tenant "${tenantId}".`);

    const plan = await this.getPlanByCode(sub.planCode);
    if (!plan) throw new Error(`Plan "${sub.planCode}" not found.`);

    const latestVersion = this.getCurrentVersion(plan);
    const beforeState = JSON.parse(JSON.stringify(sub));
    const now = new Date().toISOString();

    sub.planVersion = latestVersion.version;
    sub.priceLockedAt = {
      monthlyPrice: latestVersion.monthlyPrice,
      annualPrice: latestVersion.annualPrice,
      gstRate: latestVersion.gstRate,
      overageRate: latestVersion.overageRate,
      employeeCap: latestVersion.employeeCap,
      lockedAt: now
    };
    sub.isGrandfathered = false;
    sub.updatedAt = now;

    const subs = await this.getAllSubscriptions();
    const idx = subs.findIndex(s => s.id === sub.id);
    if (idx >= 0) subs[idx] = sub;
    saveStored(SUBSCRIPTIONS_STORAGE_KEY, subs);

    await this.logE15Mutation({
      planId: plan.id,
      planCode: plan.code,
      versionNumber: latestVersion.version,
      action: 'TENANT_GRANDFATHERED_MIGRATION',
      actorId: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      beforeState,
      afterState: sub,
      summary: `Tenant "${tenantId}" voluntarily migrated from v${beforeState.planVersion} to latest v${latestVersion.version} of "${plan.name}". New price lock effective.`
    });

    return sub;
  }

  /**
   * Calculates an invoice breakdown with historical GST and overage rates preserved.
   */
  calculateInvoice(
    subOrVersion: {
      monthlyPrice: number | null;
      annualPrice: number | null;
      gstRate: number;
      overageRate: number | null;
      employeeCap: number | null;
    },
    billingInterval: 'MONTHLY' | 'ANNUAL',
    currentWorkers: number
  ): InvoiceCalculationResult {
    const isQuote = subOrVersion.monthlyPrice === null;
    if (isQuote) {
      return {
        baseAmount: 0,
        overageCount: 0,
        overageAmount: 0,
        subtotal: 0,
        gstRate: subOrVersion.gstRate || 18,
        gstAmount: 0,
        totalAmount: 0,
        currency: 'INR',
        billingInterval,
        isQuote: true
      };
    }

    const baseAmount = billingInterval === 'ANNUAL' 
      ? (subOrVersion.annualPrice ?? (subOrVersion.monthlyPrice! * 10)) 
      : subOrVersion.monthlyPrice!;

    const cap = subOrVersion.employeeCap ?? 999999;
    const overageCount = Math.max(0, currentWorkers - cap);
    const overageUnitRate = subOrVersion.overageRate ?? 0;
    const overageAmount = billingInterval === 'ANNUAL'
      ? overageCount * overageUnitRate * 12
      : overageCount * overageUnitRate;

    const subtotal = baseAmount + overageAmount;
    const gstRate = subOrVersion.gstRate ?? 18;
    const gstAmount = Math.round((subtotal * gstRate) / 100);
    const totalAmount = subtotal + gstAmount;

    return {
      baseAmount,
      overageCount,
      overageAmount,
      subtotal,
      gstRate,
      gstAmount,
      totalAmount,
      currency: 'INR',
      billingInterval,
      isQuote: false
    };
  }

  /**
   * Retrieves all E15 Plan Mutation Audit Logs
   */
  async getAuditLogs(planCode?: string): Promise<PlanMutationAuditLog[]> {
    const logs = loadStored<PlanMutationAuditLog[]>(PLAN_AUDIT_STORAGE_KEY, []);
    if (planCode) {
      return logs.filter(l => l.planCode.toUpperCase() === planCode.toUpperCase());
    }
    return logs;
  }

  /**
   * Internal E15 Audit Logger
   * Logs to plan-specific repository AND cross-system tenantSecurityService append-only trail.
   */
  private async logE15Mutation(
    entry: Omit<PlanMutationAuditLog, 'id' | 'timestamp'>
  ): Promise<void> {
    const id = 'e15-plan-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const timestamp = new Date().toISOString();

    const fullLog: PlanMutationAuditLog = {
      ...entry,
      id,
      timestamp
    };

    const logs = loadStored<PlanMutationAuditLog[]>(PLAN_AUDIT_STORAGE_KEY, []);
    saveStored(PLAN_AUDIT_STORAGE_KEY, [fullLog, ...logs]);

    // Also mirror into tenantSecurityService audit logs for unified compliance exploration
    try {
      await tenantSecurityService.logTenantAccess({
        tenantId: 'SYSTEM',
        userId: entry.actorId,
        userEmail: entry.actorEmail,
        userRole: entry.actorRole,
        action: `E15_${entry.action}`,
        resource: `plans/${entry.planCode}`,
        status: 'SUCCESS',
        details: {
          planId: entry.planId,
          version: entry.versionNumber,
          summary: entry.summary,
          reason: entry.reason,
          beforeState: entry.beforeState,
          afterState: entry.afterState
        }
      });
    } catch (err) {
      console.warn('Notice mirroring E15 plan log to tenantSecurityService:', err);
    }
  }
}

export const planCatalogService = new PlanCatalogService();
