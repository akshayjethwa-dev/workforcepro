// src/services/migrationService.ts
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  MigrationProgress,
  DEFAULT_MIGRATION_STEPS,
} from '../types/index';

const COLLECTION = 'tenant_settings';

/**
 * Sentinel tenant ID used across the app for demo / unauthenticated mode.
 * The Migration Wizard must NOT attempt any Firestore writes for this tenant
 * because there is no real tenant doc and the rules will reject the write.
 */
export const DEMO_TENANT_ID = 'demo-tenant-id';

/**
 * Returns true when the given tenantId is a demo/placeholder value
 * OR when it is missing entirely. All migration functions short-circuit
 * on this value so demo users never hit Firestore for migration data.
 */
export const isDemoTenant = (tenantId?: string | null): boolean => {
  return !tenantId || tenantId === DEMO_TENANT_ID;
};

/**
 * Synthetic "already complete" progress used for demo tenants so that
 * every downstream consumer (Layout banner, Dashboard payroll gate,
 * RootNavigator redirect) behaves as if migration is fully done.
 */
const createCompletedMigration = (): MigrationProgress => ({
  steps: DEFAULT_MIGRATION_STEPS.map((s) => ({
    ...s,
    status: 'COMPLETED' as const,
  })),
  currentStepIndex: DEFAULT_MIGRATION_STEPS.length - 1,
  completedAt: new Date().toISOString(),
});

/**
 * Get the migration progress document for a tenant.
 *
 * - Demo / missing tenant → returns a synthetic COMPLETED progress
 *   (so the wizard never opens, the banner never shows, payroll is unlocked).
 * - Real tenant, doc exists → returns the stored progress.
 * - Real tenant, no doc yet → returns null (wizard may initialise).
 * - Real tenant, read error → returns null (caller must handle).
 */
export const getMigrationProgress = async (
  tenantId: string
): Promise<MigrationProgress | null> => {
  if (isDemoTenant(tenantId)) {
    return createCompletedMigration();
  }
  try {
    const ref = doc(db, COLLECTION, tenantId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return (data.migration as MigrationProgress | null) ?? null;
    }
    return null;
  } catch (error: any) {
    console.error('[migrationService] getMigrationProgress failed:', {
      tenantId,
      code: error?.code,
      message: error?.message,
    });
    return null;
  }
};

/**
 * Save (or merge) the migration progress for a tenant.
 *
 * - Demo tenant → no-op (never touches Firestore).
 * - Real tenant → Firestore write with detailed error mapping.
 */
export const saveMigrationProgress = async (
  tenantId: string,
  progress: MigrationProgress
): Promise<void> => {
  // Demo/unauthenticated mode — skip entirely.
  if (isDemoTenant(tenantId)) {
    return;
  }

  try {
    const ref = doc(db, COLLECTION, tenantId);
    await setDoc(ref, { migration: progress }, { merge: true });
  } catch (error: any) {
    console.error('[migrationService] saveMigrationProgress failed:', {
      tenantId,
      code: error?.code,
      message: error?.message,
    });

    if (error?.code === 'permission-denied') {
      throw new Error(
        `Permission denied while saving migration progress for tenant "${tenantId}". ` +
          'Check that firestore.rules allows Tenant Admins to write to tenant_settings/{tenantId} ' +
          'and that this tenant actually exists in your tenants collection.'
      );
    }
    if (error?.code === 'unavailable') {
      throw new Error(
        'Network unavailable. Please check your internet connection and try again.'
      );
    }
    throw new Error(error?.message || 'Failed to save migration progress.');
  }
};

/**
 * Update the status of a single step and optionally advance the current step.
 * (No-op for demo tenants.)
 */
export const updateStepStatus = async (
  tenantId: string,
  stepId: number,
  status: MigrationProgress['steps'][number]['status'],
  advanceToNext = false
): Promise<MigrationProgress> => {
  if (isDemoTenant(tenantId)) {
    return createCompletedMigration();
  }

  const current = (await getMigrationProgress(tenantId)) ?? {
    steps: DEFAULT_MIGRATION_STEPS.map((s) => ({ ...s })),
    currentStepIndex: 0,
  };

  const updatedSteps = current.steps.map((s) =>
    s.id === stepId ? { ...s, status } : s
  );

  let nextIndex = current.currentStepIndex;
  if (advanceToNext) {
    nextIndex = Math.min(nextIndex + 1, updatedSteps.length - 1);
  }

  const updatedProgress: MigrationProgress = {
    ...current,
    steps: updatedSteps,
    currentStepIndex: nextIndex,
  };

  await saveMigrationProgress(tenantId, updatedProgress);
  return updatedProgress;
};

/**
 * Mark the whole migration as complete (Go‑Live).
 * (No-op for demo tenants.)
 */
export const completeMigration = async (tenantId: string): Promise<void> => {
  if (isDemoTenant(tenantId)) {
    return;
  }

  const current = (await getMigrationProgress(tenantId)) ?? {
    steps: DEFAULT_MIGRATION_STEPS.map((s) => ({ ...s })),
    currentStepIndex: 0,
  };

  const updated: MigrationProgress = {
    ...current,
    completedAt: new Date().toISOString(),
    steps: current.steps.map((s) =>
      s.id === 5 ? { ...s, status: 'COMPLETED' } : s
    ),
  };

  await saveMigrationProgress(tenantId, updated);
};

/**
 * Initialise a fresh migration progress document (called when the wizard
 * is first opened).
 *
 * - Demo tenant → returns synthetic COMPLETED (never writes to Firestore).
 * - Real tenant, doc exists → returns it.
 * - Real tenant, no doc → creates it in Firestore.
 */
export const initialiseMigration = async (
  tenantId: string
): Promise<MigrationProgress> => {
  if (isDemoTenant(tenantId)) {
    return createCompletedMigration();
  }

  const existing = await getMigrationProgress(tenantId);
  if (existing) return existing;

  const progress: MigrationProgress = {
    steps: DEFAULT_MIGRATION_STEPS.map((s) => ({ ...s })),
    currentStepIndex: 0,
  };

  await saveMigrationProgress(tenantId, progress);
  return progress;
};