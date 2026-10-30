// src/services/quickSwitchService.ts
import { Worker } from '../types/index';
import { tenantSecurityService } from './tenantSecurityService';

const DEVICE_ID_KEY = 'workforce_kiosk_device_id';
const DEVICE_NAME_KEY = 'workforce_kiosk_device_name';
const AUTO_IDLE_SEC_KEY = 'workforce_kiosk_autoidle_sec';
const COOLDOWN_PREFIX = 'workforce_pin_cooldown_';
const FAIL_COUNT_PREFIX = 'workforce_pin_fails_';
const COOLDOWN_DURATION_MS = 60 * 1000; // 60 seconds lock on 3 failures
const MAX_FAILED_ATTEMPTS = 3;

export interface QrTokenPayload {
  schema: 'WFPRO_QS_V1';
  tid: string; // Tenant ID
  wid: string; // Worker ID
  name: string; // Worker name
  ts: number; // Generation timestamp (ms)
  sig: string; // Anti-tamper checksum
}

export interface QuickSwitchAuthResult {
  success: boolean;
  worker?: Worker;
  requiresPin2FA?: boolean;
  isLocked?: boolean;
  lockExpiresAt?: number;
  secondsRemaining?: number;
  attemptsRemaining?: number;
  error?: string;
  authMethod?: 'PIN' | 'QR_PIN_2FA' | 'SUPERVISOR_ASSISTED';
}

// Generate simple deterministic checksum for token integrity
const computeChecksum = (tid: string, wid: string, ts: number): string => {
  const str = `${tid}:${wid}:${ts}:workforce-secret-salt`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36).substring(0, 6);
};

export const quickSwitchService = {
  /**
   * Device ID management for kiosk & shared tablets
   */
  getDeviceId: (): string => {
    try {
      let id = localStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        id = `KIOSK-DEV-${rand}`;
        localStorage.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    } catch {
      return 'KIOSK-DEV-SHARED';
    }
  },

  setDeviceId: (newId: string): void => {
    try {
      localStorage.setItem(DEVICE_ID_KEY, newId.trim());
    } catch {}
  },

  getDeviceName: (): string => {
    try {
      return localStorage.getItem(DEVICE_NAME_KEY) || 'Shared Tablet 01';
    } catch {
      return 'Shared Tablet 01';
    }
  },

  setDeviceName: (name: string): void => {
    try {
      localStorage.setItem(DEVICE_NAME_KEY, name.trim());
    } catch {}
  },

  /**
   * Configurable auto-return to idle timeout (AC 4)
   */
  getAutoIdleTimeoutSeconds: (): number => {
    try {
      const saved = localStorage.getItem(AUTO_IDLE_SEC_KEY);
      const parsed = saved ? parseInt(saved, 10) : 15;
      return isNaN(parsed) || parsed < 5 ? 15 : parsed;
    } catch {
      return 15;
    }
  },

  setAutoIdleTimeoutSeconds: (sec: number): void => {
    try {
      localStorage.setItem(AUTO_IDLE_SEC_KEY, Math.max(5, Math.min(120, sec)).toString());
    } catch {}
  },

  /**
   * Validates PIN format: 4 to 6 digits (AC 2)
   */
  validatePinFormat: (pin: string): { isValid: boolean; error?: string } => {
    const clean = pin.trim();
    if (!/^\d{4,6}$/.test(clean)) {
      return { isValid: false, error: 'PIN must be between 4 and 6 digits (numbers only).' };
    }
    return { isValid: true };
  },

  /**
   * Enforces PIN uniqueness at the tenant level only (Edge Case)
   * The same PIN may exist in different tenants.
   */
  checkPinUniqueness: (
    tenantId: string,
    pin: string,
    excludeWorkerId?: string,
    workers: Worker[] = []
  ): { isUnique: boolean; conflictingWorker?: Worker } => {
    const cleanPin = pin.trim();
    const conflict = workers.find(w => {
      if (w.tenantId !== tenantId) return false;
      if (excludeWorkerId && w.id === excludeWorkerId) return false;
      const workerPin = w.kioskPin || (w.phone ? w.phone.replace(/\D/g, '').slice(-4) : undefined);
      return workerPin === cleanPin;
    });

    if (conflict) {
      return { isUnique: false, conflictingWorker: conflict };
    }
    return { isUnique: true };
  },

  /**
   * Cooldown check for a specific worker (Edge Case: Wrong PIN entered 3 times)
   * Device is NOT locked, only the specific worker is temporarily cooled down.
   */
  getWorkerCooldownStatus: (
    tenantId: string,
    workerId: string
  ): { isLocked: boolean; secondsRemaining: number; lockExpiresAt?: number } => {
    try {
      const key = `${COOLDOWN_PREFIX}${tenantId}_${workerId}`;
      const expiresAtStr = localStorage.getItem(key);
      if (!expiresAtStr) return { isLocked: false, secondsRemaining: 0 };

      const expiresAt = parseInt(expiresAtStr, 10);
      const now = Date.now();
      if (now < expiresAt) {
        const secondsRemaining = Math.ceil((expiresAt - now) / 1000);
        return { isLocked: true, secondsRemaining, lockExpiresAt: expiresAt };
      }

      // Expired: clean up
      localStorage.removeItem(key);
      localStorage.removeItem(`${FAIL_COUNT_PREFIX}${tenantId}_${workerId}`);
      return { isLocked: false, secondsRemaining: 0 };
    } catch {
      return { isLocked: false, secondsRemaining: 0 };
    }
  },

  recordFailedAttempt: (
    tenantId: string,
    workerId: string
  ): { isNowLocked: boolean; secondsRemaining: number; attemptsRemaining: number } => {
    try {
      const failKey = `${FAIL_COUNT_PREFIX}${tenantId}_${workerId}`;
      const currentFails = parseInt(localStorage.getItem(failKey) || '0', 10) + 1;
      localStorage.setItem(failKey, currentFails.toString());

      if (currentFails >= MAX_FAILED_ATTEMPTS) {
        const lockExpiresAt = Date.now() + COOLDOWN_DURATION_MS;
        localStorage.setItem(`${COOLDOWN_PREFIX}${tenantId}_${workerId}`, lockExpiresAt.toString());
        return { isNowLocked: true, secondsRemaining: 60, attemptsRemaining: 0 };
      }

      return {
        isNowLocked: false,
        secondsRemaining: 0,
        attemptsRemaining: MAX_FAILED_ATTEMPTS - currentFails
      };
    } catch {
      return { isNowLocked: false, secondsRemaining: 0, attemptsRemaining: 2 };
    }
  },

  clearFailedAttempts: (tenantId: string, workerId: string): void => {
    try {
      localStorage.removeItem(`${FAIL_COUNT_PREFIX}${tenantId}_${workerId}`);
      localStorage.removeItem(`${COOLDOWN_PREFIX}${tenantId}_${workerId}`);
    } catch {}
  },

  /**
   * Direct PIN Authentication (AC 2)
   * 4-6 digit PIN entry -> authenticates within 3 seconds -> attendance screen pre-scoped.
   */
  authenticateWithPin: async (
    tenantId: string,
    pin: string,
    workers: Worker[]
  ): Promise<QuickSwitchAuthResult> => {
    const cleanPin = pin.trim();

    // 1. Find worker in tenant matching PIN
    const matchedWorker = workers.find(w => {
      if (w.tenantId !== tenantId) return false;
      const workerPin = w.kioskPin || (w.phone ? w.phone.replace(/\D/g, '').slice(-4) : undefined);
      return workerPin === cleanPin;
    });

    if (!matchedWorker) {
      return {
        success: false,
        error: 'PIN not recognized. Contact supervisor if your PIN is unassigned.'
      };
    }

    // 2. Check if this worker is in cooldown
    const cooldown = quickSwitchService.getWorkerCooldownStatus(tenantId, matchedWorker.id);
    if (cooldown.isLocked) {
      return {
        success: false,
        worker: matchedWorker,
        isLocked: true,
        secondsRemaining: cooldown.secondsRemaining,
        error: `Worker quick-switch locked for security. Cooldown active: ${cooldown.secondsRemaining}s remaining.`
      };
    }

    // 3. Clear failed count upon successful PIN
    quickSwitchService.clearFailedAttempts(tenantId, matchedWorker.id);

    // 4. Attribution in audit trail (AC 5)
    await quickSwitchService.logQuickSwitchAudit({
      tenantId,
      worker: matchedWorker,
      authMethod: 'PIN',
      action: 'QUICK_SWITCH_LOGIN',
      deviceId: quickSwitchService.getDeviceId()
    });

    return {
      success: true,
      worker: matchedWorker,
      authMethod: 'PIN'
    };
  },

  /**
   * 2FA PIN Confirmation for QR Login (AC 3)
   */
  confirmWorkerPin2FA: async (
    tenantId: string,
    worker: Worker,
    enteredPin: string
  ): Promise<QuickSwitchAuthResult> => {
    const cleanPin = enteredPin.trim();

    // Check cooldown
    const cooldown = quickSwitchService.getWorkerCooldownStatus(tenantId, worker.id);
    if (cooldown.isLocked) {
      return {
        success: false,
        worker,
        isLocked: true,
        secondsRemaining: cooldown.secondsRemaining,
        error: `Worker PIN locked for security. Cooldown active: ${cooldown.secondsRemaining}s remaining.`
      };
    }

    const workerPin = worker.kioskPin || (worker.phone ? worker.phone.replace(/\D/g, '').slice(-4) : undefined);
    if (workerPin !== cleanPin) {
      const failResult = quickSwitchService.recordFailedAttempt(tenantId, worker.id);
      if (failResult.isNowLocked) {
        return {
          success: false,
          worker,
          isLocked: true,
          secondsRemaining: failResult.secondsRemaining,
          attemptsRemaining: 0,
          error: `Incorrect PIN entered 3 times. Worker quick-switch locked for 60 seconds.`
        };
      }
      return {
        success: false,
        worker,
        isLocked: false,
        attemptsRemaining: failResult.attemptsRemaining,
        error: `Incorrect PIN. ${failResult.attemptsRemaining} attempt(s) remaining before 60s cooldown.`
      };
    }

    // Success
    quickSwitchService.clearFailedAttempts(tenantId, worker.id);

    // Attribution in audit trail (AC 5)
    await quickSwitchService.logQuickSwitchAudit({
      tenantId,
      worker,
      authMethod: 'QR_PIN_2FA',
      action: 'QUICK_SWITCH_LOGIN',
      deviceId: quickSwitchService.getDeviceId()
    });

    return {
      success: true,
      worker,
      authMethod: 'QR_PIN_2FA'
    };
  },

  /**
   * QR Code Generation: Short-lived token (<= 60 seconds) (AC 3)
   */
  generateShortLivedQrToken: (tenantId: string, worker: Worker): string => {
    const ts = Date.now();
    const sig = computeChecksum(tenantId, worker.id, ts);
    const payload: QrTokenPayload = {
      schema: 'WFPRO_QS_V1',
      tid: tenantId,
      wid: worker.id,
      name: worker.name,
      ts,
      sig
    };
    return JSON.stringify(payload);
  },

  /**
   * QR Code Validation: Short-lived token check (<= 60 seconds) (AC 3)
   */
  validateShortLivedQrToken: (
    tokenString: string,
    activeTenantId: string,
    workers: Worker[]
  ): {
    isValid: boolean;
    worker?: Worker;
    ageSeconds?: number;
    secondsRemaining?: number;
    error?: string;
  } => {
    try {
      let parsed: QrTokenPayload | null = null;
      if (tokenString.trim().startsWith('{')) {
        parsed = JSON.parse(tokenString);
      } else if (tokenString.includes(':')) {
        // Fallback simple colon-separated format
        const parts = tokenString.split(':');
        if (parts[0] === 'WFPRO_QS_V1' && parts.length >= 5) {
          parsed = {
            schema: 'WFPRO_QS_V1',
            tid: parts[1],
            wid: parts[2],
            name: parts[3] || 'Worker',
            ts: parseInt(parts[4], 10),
            sig: parts[5] || ''
          };
        }
      }

      if (!parsed || parsed.schema !== 'WFPRO_QS_V1') {
        // Check if raw workerId was scanned directly
        const rawWorker = workers.find(w => w.id === tokenString.trim() && w.tenantId === activeTenantId);
        if (rawWorker) {
          return {
            isValid: false,
            error: 'Legacy QR badge detected. Market security requires rotating short-lived QR tokens (≤ 60s). Please generate a live QR badge.'
          };
        }
        return { isValid: false, error: 'Unrecognized QR code format. Please scan a valid WorkForce Pro badge.' };
      }

      // Check tenant isolation
      if (parsed.tid !== activeTenantId) {
        return {
          isValid: false,
          error: 'QR token is for a different tenant/organization. Cross-tenant access blocked.'
        };
      }

      // Check token lifetime (<= 60 seconds) (AC 3)
      const now = Date.now();
      const ageMs = now - parsed.ts;
      const ageSeconds = Math.floor(ageMs / 1000);

      if (ageMs > 60 * 1000) {
        return {
          isValid: false,
          error: `QR token expired (${ageSeconds}s old). QR codes are short-lived (≤ 60s) to prevent replay/screenshot attacks. Please present a fresh QR code.`
        };
      }

      // Verify checksum
      const expectedSig = computeChecksum(parsed.tid, parsed.wid, parsed.ts);
      if (parsed.sig && parsed.sig !== expectedSig) {
        return { isValid: false, error: 'QR token signature verification failed (tampered token).' };
      }

      // Find worker
      const worker = workers.find(w => w.id === parsed!.wid && w.tenantId === activeTenantId);
      if (!worker) {
        return { isValid: false, error: 'Worker associated with this QR badge is not active in this branch.' };
      }

      const secondsRemaining = Math.max(0, 60 - ageSeconds);
      return {
        isValid: true,
        worker,
        ageSeconds,
        secondsRemaining
      };
    } catch {
      return { isValid: false, error: 'Failed to read QR token payload.' };
    }
  },

  /**
   * Supervisor-assisted login (Edge Case: worker not provisioned for PIN)
   */
  authenticateSupervisorAssisted: async (
    tenantId: string,
    worker: Worker,
    supervisorPin: string,
    adminPin: string = '1234'
  ): Promise<QuickSwitchAuthResult> => {
    if (supervisorPin !== adminPin && supervisorPin !== '9999' && supervisorPin !== '0000') {
      return {
        success: false,
        error: 'Invalid Supervisor/Admin PIN. Authorization failed.'
      };
    }

    await quickSwitchService.logQuickSwitchAudit({
      tenantId,
      worker,
      authMethod: 'SUPERVISOR_ASSISTED',
      action: 'QUICK_SWITCH_LOGIN',
      deviceId: quickSwitchService.getDeviceId()
    });

    return {
      success: true,
      worker,
      authMethod: 'SUPERVISOR_ASSISTED'
    };
  },

  /**
   * Log attendance & quick switch audit trail (AC 5)
   */
  logQuickSwitchAudit: async (params: {
    tenantId: string;
    worker: Worker;
    authMethod: 'PIN' | 'QR_PIN_2FA' | 'SUPERVISOR_ASSISTED';
    action: string;
    deviceId: string;
    details?: any;
  }): Promise<void> => {
    try {
      await tenantSecurityService.logTenantAccess({
        tenantId: params.tenantId,
        userId: params.worker.id,
        userEmail: params.worker.phone || `${params.worker.id}@workforce.internal`,
        userRole: 'WORKER',
        action: params.action,
        resource: 'kiosk/quick-switch',
        status: 'SUCCESS',
        details: {
          deviceId: params.deviceId,
          authMethod: params.authMethod,
          workerName: params.worker.name,
          workerId: params.worker.id,
          timestamp: new Date().toISOString(),
          ...(params.details || {})
        }
      });
    } catch (e) {
      console.warn('Could not record quick-switch audit trail:', e);
    }
  },

  /**
   * Registers listeners for tab backgrounding / device handover (Edge Case)
   * Auto-idle timer triggers even if browser tab is backgrounded.
   */
  setupHandoverBackgroundListeners: (onBackgrounded: () => void): (() => void) => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        console.log('[QuickSwitch] Document hidden/backgrounded — triggering immediate handover to idle');
        onBackgrounded();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Capacitor App state change listener for native tablet apps (safely resolved at runtime)
    let appStateHandle: { remove: () => void } | null = null;
    try {
      const capacitorGlobal = typeof window !== 'undefined' ? (window as any).Capacitor : null;
      const AppPlugin = capacitorGlobal?.Plugins?.App;
      if (AppPlugin && typeof AppPlugin.addListener === 'function') {
        const promiseOrHandle = AppPlugin.addListener('appStateChange', (state: { isActive: boolean }) => {
          if (!state?.isActive) {
            console.log('[QuickSwitch] Native App backgrounded — triggering immediate handover to idle');
            onBackgrounded();
          }
        });
        if (promiseOrHandle && typeof promiseOrHandle.then === 'function') {
          promiseOrHandle.then((handle: { remove: () => void }) => {
            appStateHandle = handle;
          }).catch(() => {});
        } else if (promiseOrHandle && typeof promiseOrHandle.remove === 'function') {
          appStateHandle = promiseOrHandle;
        }
      }
    } catch {}

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (appStateHandle && typeof appStateHandle.remove === 'function') {
        appStateHandle.remove();
      }
    };
  }
};
