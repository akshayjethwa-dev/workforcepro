// src/services/magicLinkService.ts
import { 
  Worker, 
  WorkerAccessToken, 
  MagicLinkScope, 
  MagicLinkChannel, 
  DeviceAccessEntry,
  RevocationReason,
  BoundDevice,
  DpdpSubjectAccessReport,
  DeviceBindingOtpState,
  BoundDevicePunchResult,
  AttendanceRecord
} from '../types/index';
import { tenantSecurityService } from './tenantSecurityService';
import { dbService } from './db';
import { entitlementService } from './entitlementService';
import { inboxService } from './inboxService';

const STORAGE_KEY = 'workforce_magic_tokens';
const BOUND_DEVICES_KEY = 'workforce_bound_devices';

// In-memory cache + storage
const getStoredTokens = (): WorkerAccessToken[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Failed to parse magic tokens from storage:', e);
  }
  return [];
};

const saveStoredTokens = (tokens: WorkerAccessToken[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch (e) {
    console.warn('Failed to persist magic tokens to storage:', e);
  }
};

const getStoredDevices = (): BoundDevice[] => {
  try {
    const raw = localStorage.getItem(BOUND_DEVICES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Failed to parse bound devices from storage:', e);
  }
  return [];
};

const saveStoredDevices = (devices: BoundDevice[]) => {
  try {
    localStorage.setItem(BOUND_DEVICES_KEY, JSON.stringify(devices));
  } catch (e) {
    console.warn('Failed to persist bound devices to storage:', e);
  }
};

const OTP_STORAGE_KEY = 'workforce_punch_otp_store';

const getStoredOtpStore = (): Record<string, DeviceBindingOtpState> => {
  try {
    const raw = localStorage.getItem(OTP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    }
  } catch (e) {
    console.warn('Failed to parse OTP store:', e);
  }
  return {};
};

const saveStoredOtpStore = (store: Record<string, DeviceBindingOtpState>) => {
  try {
    localStorage.setItem(OTP_STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn('Failed to persist OTP store:', e);
  }
};

/**
 * Generates or retrieves stable device fingerprint
 * Hashed device ID + User Agent + Platform
 */
export function getOrCreateDeviceFingerprint(): {
  deviceId: string;
  deviceFingerprint: string;
  deviceModel: string;
  platform: string;
  userAgent: string;
} {
  const DEVICE_UUID_KEY = 'wfpro_bound_device_uuid';
  let uuid = '';
  try {
    if (typeof localStorage !== 'undefined') {
      uuid = localStorage.getItem(DEVICE_UUID_KEY) || '';
      if (!uuid) {
        uuid = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
        localStorage.setItem(DEVICE_UUID_KEY, uuid);
      }
    }
  } catch {
    uuid = 'dev_tmp_' + Date.now().toString(36);
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
  const platform = typeof navigator !== 'undefined' ? (navigator.platform || 'web') : 'web';

  let deviceModel = 'Field Mobile Device';
  if (/iPhone/i.test(ua)) deviceModel = 'Apple iPhone (Safari)';
  else if (/iPad/i.test(ua)) deviceModel = 'Apple iPad';
  else if (/Pixel/i.test(ua)) deviceModel = 'Google Pixel (Android 14)';
  else if (/Samsung|SM-/i.test(ua)) deviceModel = 'Samsung Galaxy (Android)';
  else if (/Redmi|Xiaomi|POCO/i.test(ua)) deviceModel = 'Xiaomi Redmi Note (Android)';
  else if (/Realme/i.test(ua)) deviceModel = 'Realme Narzo 50 (Android)';
  else if (/Vivo/i.test(ua)) deviceModel = 'Vivo Y-Series (Android)';
  else if (/Android/i.test(ua)) deviceModel = 'Android Smartphone';
  else if (/Windows/i.test(ua)) deviceModel = 'Windows PC (Chrome)';
  else if (/Macintosh/i.test(ua)) deviceModel = 'MacBook (Chrome / Safari)';
  else if (/Linux/i.test(ua)) deviceModel = 'Linux Desktop';

  let hash = 0;
  const raw = `${uuid}__${ua}__${platform}`;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  const deviceFingerprint = 'dfp_' + Math.abs(hash).toString(16) + '_' + uuid.slice(-6);

  return { deviceId: uuid, deviceFingerprint, deviceModel, platform, userAgent: ua };
}

/**
 * SHA-256 hash helper using Web Crypto API
 */
export async function computeSha256(text: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (err) {
    console.warn('Web Crypto SHA-256 failed, using fallback hash:', err);
  }
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'fallback_' + Math.abs(hash).toString(16) + text.slice(0, 16);
}

/**
 * Validates and formats an Indian or international phone number
 */
export function validateWorkerPhone(phone?: string): {
  isValid: boolean;
  cleanPhone: string;
  formattedDisplay: string;
  error?: string;
} {
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return {
      isValid: false,
      cleanPhone: '',
      formattedDisplay: '',
      error: 'No phone number on file — update in profile.'
    };
  }

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) {
    return {
      isValid: false,
      cleanPhone: digits,
      formattedDisplay: phone,
      error: 'No phone number on file — update in profile.'
    };
  }

  const cleanPhone = digits.length === 10 ? `91${digits}` : digits;
  const last10 = digits.slice(-10);
  const formattedDisplay = `+91 ${last10.slice(0, 5)} ${last10.slice(5)}`;

  return {
    isValid: true,
    cleanPhone,
    formattedDisplay
  };
}

/**
 * Formats bilingual (Hindi + English) message copy
 */
export function formatMagicMessage(
  worker: Worker,
  scope: MagicLinkScope,
  linkUrl: string,
  ttlHours: number,
  targetMonth?: string
): string {
  const currentMonthStr = targetMonth || new Date().toISOString().slice(0, 7);
  const [year, monthNum] = currentMonthStr.split('-');
  const monthDate = new Date(parseInt(year), parseInt(monthNum) - 1);
  const monthName = monthDate.toLocaleString('en-US', { month: 'short', year: 'numeric' });

  if (scope === 'PAYSLIP') {
    return `नमस्ते ${worker.name}! आपकी ${monthName} की payslip तैयार है / Your payslip is ready:\n🔗 ${linkUrl}\n(Link expires in ${ttlHours}h)`;
  } else if (scope === 'SCHEDULE') {
    return `नमस्ते ${worker.name}! आपका कार्य शेड्यूल तैयार है / Your work schedule is ready:\n🔗 ${linkUrl}\n(Link expires in ${ttlHours}h)`;
  } else if (scope === 'PUNCH' || (scope as string) === 'punch') {
    return `नमस्ते ${worker.name}! आपकी दैनिक हाजिरी (One-Tap Punch) लिंक तैयार है / Your daily punch link is ready:\n🔗 ${linkUrl}\n(Link expires in ${ttlHours}h)`;
  } else {
    return `नमस्ते ${worker.name}! आपकी उपस्थिति रिपोर्ट तैयार है / Your attendance summary is ready:\n🔗 ${linkUrl}\n(Link expires in ${ttlHours}h)`;
  }
}

export const magicLinkService = {
  /**
   * Generates a secure, scoped WorkerAccessToken and WhatsApp/SMS bridges
   */
  createWorkerMagicLink: async (params: {
    tenantId: string;
    worker: Worker;
    scope: MagicLinkScope;
    channel: MagicLinkChannel;
    issuedBy: string;
    ttlHours?: number; // 24, 48, 72, 168 (default 72)
    targetMonth?: string;
    shiftId?: string;
  }): Promise<{
    token: string;
    tokenRecord: WorkerAccessToken;
    universalUrl: string;
    localUrl: string;
    whatsappUrl: string;
    smsUrl: string;
    messageText: string;
  }> => {
    const ttlHours = params.ttlHours || 72;
    const now = Date.now();
    const expiresAt = new Date(now + ttlHours * 3600 * 1000).toISOString();

    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const token = `wft_${randomHex}`;
    const tokenHash = await computeSha256(token);

    const tokenRecord: WorkerAccessToken = {
      id: `token-${now}-${Math.random().toString(36).substring(2, 7)}`,
      token,
      tokenHash,
      tenantId: params.tenantId,
      workerId: params.worker.id,
      workerName: params.worker.name,
      workerPhone: params.worker.phone,
      scope: params.scope,
      channel: params.channel,
      issuedBy: params.issuedBy,
      issuedAt: new Date(now).toISOString(),
      expiresAt,
      ttlHours,
      targetMonth: params.targetMonth || new Date().toISOString().slice(0, 7),
      shiftId: params.shiftId || params.worker.shiftId || 'default',
      accessLog: [],
      revoked: false,
      flaggedMultiDevice: false,
      deliveryStatus: 'PENDING'
    };

    const tokens = getStoredTokens();
    saveStoredTokens([tokenRecord, ...tokens]);

    const universalUrl = `https://wfpro.in/w/${token}`;
    const baseUrl = typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : 'https://wfpro.in';
    const localUrl = `${baseUrl}?w=${token}`;

    const { cleanPhone } = validateWorkerPhone(params.worker.phone);
    const messageText = formatMagicMessage(params.worker, params.scope, universalUrl, ttlHours, params.targetMonth);
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;
    const smsUrl = `sms:${cleanPhone}?body=${encodeURIComponent(messageText)}`;

    // Seed a bound device record for the worker if not existing
    magicLinkService.ensureWorkerDeviceBound(params.worker, params.tenantId);

    // Log in E15 Audit Trail
    try {
      await tenantSecurityService.logTenantAccess({
        tenantId: params.tenantId,
        userId: params.issuedBy,
        userEmail: params.issuedBy,
        userRole: 'SUPERVISOR',
        action: 'ISSUE_MAGIC_LINK',
        resource: `workers/${params.worker.id}/magic_links`,
        status: 'SUCCESS',
        details: {
          workerId: params.worker.id,
          workerName: params.worker.name,
          scope: params.scope,
          channel: params.channel,
          expiresAt,
          ttlHours,
          tokenHash,
          targetMonth: tokenRecord.targetMonth
        }
      });
    } catch (e) {
      console.warn('Failed to record E15 audit log for magic link:', e);
    }

    return {
      token,
      tokenRecord,
      universalUrl,
      localUrl,
      whatsappUrl,
      smsUrl,
      messageText
    };
  },

  /**
   * Real-time check to verify if a token is still active (used for 60s lifecycle polling)
   */
  checkTokenStatus: async (token: string): Promise<{ active: boolean; error?: string; tokenRecord?: WorkerAccessToken }> => {
    if (!token) return { active: false, error: 'No token provided' };
    const tokens = getStoredTokens();
    const record = tokens.find(t => t.token === token.trim());
    if (!record) return { active: false, error: 'Link not found' };
    if (record.revoked) return { active: false, error: 'This link has expired. Contact your manager.', tokenRecord: record };
    if (new Date() > new Date(record.expiresAt)) {
      return { active: false, error: 'This link has expired. Contact your manager.', tokenRecord: record };
    }
    return { active: true, tokenRecord: record };
  },

  /**
   * Verifies a token, checks expiry & rate-limiting, and tracks multi-device access
   */
  verifyAndTrackAccess: async (
    token: string,
    userAgentInput?: string
  ): Promise<{
    isValid: boolean;
    error?: string;
    tokenRecord?: WorkerAccessToken;
    isFlagged?: boolean;
    isProvisional?: boolean;
    distinctDeviceCount?: number;
  }> => {
    if (!token || typeof token !== 'string') {
      return { isValid: false, error: 'Invalid or missing magic link token.' };
    }

    const tokens = getStoredTokens();
    const index = tokens.findIndex(t => t.token === token.trim());
    
    if (index === -1) {
      return { 
        isValid: false, 
        error: 'Magic link not found or invalid. Please request a new link from your supervisor.' 
      };
    }

    const record = tokens[index];

    // Check revocation
    if (record.revoked) {
      return {
        isValid: false,
        error: `This link has been revoked (${record.revocationReason || 'access revoked'}). Please ask your factory manager for an updated link.`
      };
    }

    // Edge Case 3: Tenant suspended for non-payment (E17-S4)
    // Check if tenant is suspended and whether grace period has expired.
    // If within dunning window, allow access so workforce is not stranded mid-payroll.
    try {
      const entitlements = await entitlementService.getTenantEntitlements(record.tenantId);
      if (entitlements && (entitlements as any).isSuspended) {
        const inDunningWindow = entitlements.isInGracePeriod || false;
        if (!inDunningWindow) {
          return {
            isValid: false,
            error: 'Organization access suspended. Please contact your company management.'
          };
        }
      }
    } catch {}

    // Check expiration
    const now = new Date();
    const expiry = new Date(record.expiresAt);
    if (now > expiry) {
      const formattedExpiry = expiry.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
      return {
        isValid: false,
        error: `This link expired on ${formattedExpiry}. Magic links remain active for ${record.ttlHours} hours for security. Ask your manager for a new link.`
      };
    }

    // Device Fingerprint for rate limiting & link sharing detection (>2 distinct devices in 1h)
    const ua = userAgentInput || (typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown Device');
    const screenInfo = typeof window !== 'undefined' ? `${window.screen?.width || 0}x${window.screen?.height || 0}` : 'default';
    const lang = typeof navigator !== 'undefined' ? navigator.language : 'en';
    
    let deviceFp = 'fp_unknown';
    try {
      deviceFp = btoa(`${ua}__${screenInfo}__${lang}`).slice(0, 32);
    } catch {
      deviceFp = `fp_${ua.slice(0, 20)}`;
    }

    const accessEntry: DeviceAccessEntry = {
      deviceFingerprint: deviceFp,
      userAgent: ua,
      timestamp: new Date().toISOString()
    };

    record.accessLog = record.accessLog || [];
    record.accessLog.push(accessEntry);
    record.lastUsedAt = new Date().toISOString();

    // Calculate distinct devices accessed in the past 1 hour (3600000 ms)
    const oneHourAgo = Date.now() - 3600000;
    const recentVisits = record.accessLog.filter(entry => {
      const t = new Date(entry.timestamp).getTime();
      return t >= oneHourAgo;
    });

    const distinctDevices = new Set(recentVisits.map(v => v.deviceFingerprint));

    // Multi-device sharing risk threshold: >2 distinct devices within 1 hour
    let isFlagged = record.flaggedMultiDevice || false;
    if (distinctDevices.size > 2 && !record.flaggedMultiDevice) {
      record.flaggedMultiDevice = true;
      record.flaggedReason = `Shared link anomaly: Accessed from ${distinctDevices.size} distinct devices within 1 hour`;
      isFlagged = true;

      try {
        await tenantSecurityService.logTenantAccess({
          tenantId: record.tenantId,
          userId: 'worker-magic-link',
          userEmail: `worker-${record.workerId}@magiclink.wfpro`,
          userRole: 'WORKER',
          action: 'MULTI_DEVICE_MAGIC_LINK_ACCESS',
          resource: `workers/${record.workerId}/magic_links/${record.tokenHash}`,
          status: 'DENIED',
          details: {
            workerId: record.workerId,
            workerName: record.workerName,
            scope: record.scope,
            distinctDevices: distinctDevices.size,
            recentVisitsCount: recentVisits.length,
            timeWindow: '60 minutes',
            warning: 'Worker link shared across multiple distinct devices'
          }
        });
      } catch (err) {
        console.warn('Failed to log multi-device audit alert:', err);
      }

      try {
        await dbService.addNotification({
          tenantId: record.tenantId,
          title: `Security Alert: Shared Link Flagged`,
          message: `The magic link for ${record.workerName} (${record.scope}) was accessed from ${distinctDevices.size} different devices within 1 hour.`,
          type: 'ALERT',
          read: false,
          createdAt: new Date().toISOString(),
          category: 'SECURITY'
        } as any);
      } catch (err) {
        console.warn('Failed to send manager notification:', err);
      }
    }

    tokens[index] = record;
    saveStoredTokens(tokens);

    return {
      isValid: true,
      tokenRecord: record,
      isFlagged,
      distinctDeviceCount: distinctDevices.size
    };
  },

  /**
   * Retrieves all magic link tokens across all tenants or filtered by tenantId
   */
  getAllTokens: (tenantId?: string): WorkerAccessToken[] => {
    const tokens = getStoredTokens();
    if (!tenantId || tenantId === 'ALL') return tokens;
    return tokens.filter(t => t.tenantId === tenantId);
  },

  /**
   * Retrieves all issued magic link tokens for a specific tenant
   */
  getTokensForTenant: (tenantId: string): WorkerAccessToken[] => {
    const tokens = getStoredTokens();
    return tokens.filter(t => t.tenantId === tenantId);
  },

  /**
   * Retrieves all tokens (active and revoked) for a specific worker
   */
  getTokensForWorker: (workerId: string): { active: WorkerAccessToken[]; revoked: WorkerAccessToken[] } => {
    const tokens = getStoredTokens();
    const workerTokens = tokens.filter(t => t.workerId === workerId);
    const now = new Date();

    const active = workerTokens.filter(t => !t.revoked && new Date(t.expiresAt) > now);
    const revoked = workerTokens.filter(t => t.revoked || new Date(t.expiresAt) <= now);

    return { active, revoked };
  },

  /**
   * Revoke an active magic link token with audit log and reason
   * Edge Case 4: UI and API guard preventing managers from revoking their own tokens
   */
  revokeToken: async (
    token: string, 
    revokedBy: string, 
    reason: RevocationReason = 'other'
  ): Promise<boolean> => {
    const tokens = getStoredTokens();
    const match = tokens.find(t => t.token === token);
    if (!match) return false;

    // Edge Case 4: Manager tries to revoke their own token
    // Managers use Firebase session auth and have no worker tokens
    if (revokedBy === match.workerId) {
      throw new Error('Managers authenticate via corporate user accounts and have no worker access tokens to revoke.');
    }

    match.revoked = true;
    match.revokedAt = new Date().toISOString();
    match.revokedBy = revokedBy;
    match.revocationReason = reason;

    saveStoredTokens(tokens);

    // E15 Audit Trail Logging
    try {
      await tenantSecurityService.logTenantAccess({
        tenantId: match.tenantId,
        userId: revokedBy,
        userEmail: revokedBy,
        userRole: 'SUPERVISOR',
        action: 'REVOKE_MAGIC_LINK',
        resource: `workers/${match.workerId}/magic_links`,
        status: 'SUCCESS',
        details: {
          workerId: match.workerId,
          tokenHash: match.tokenHash,
          scope: match.scope,
          reason,
          revokedAt: match.revokedAt
        }
      });
    } catch {}

    return true;
  },

  /**
   * Worker-Exit Auto-Revocation:
   * When a worker is marked inactive, auto-revoke all tokens and unbind devices within 60s
   */
  revokeAllForWorker: async (
    workerId: string, 
    tenantId: string, 
    revokedBy: string, 
    reason: RevocationReason = 'worker exit'
  ): Promise<{ revokedTokensCount: number; unboundDevicesCount: number }> => {
    const tokens = getStoredTokens();
    const nowIso = new Date().toISOString();
    let revokedTokensCount = 0;

    for (const t of tokens) {
      if (t.workerId === workerId && !t.revoked) {
        t.revoked = true;
        t.revokedAt = nowIso;
        t.revokedBy = revokedBy;
        t.revocationReason = reason;
        revokedTokensCount++;
      }
    }
    saveStoredTokens(tokens);

    // Unbind all devices
    const devices = getStoredDevices();
    let unboundDevicesCount = 0;
    for (const d of devices) {
      if (d.workerId === workerId && d.status === 'BOUND') {
        d.status = 'UNBOUND';
        d.unboundAt = nowIso;
        d.unboundBy = revokedBy;
        d.unboundReason = reason;
        unboundDevicesCount++;
      }
    }
    saveStoredDevices(devices);

    // Log in E15 Audit Trail
    try {
      await tenantSecurityService.logTenantAccess({
        tenantId,
        userId: revokedBy,
        userEmail: revokedBy,
        userRole: 'SUPERVISOR',
        action: 'AUTO_REVOKE_WORKER_EXIT',
        resource: `workers/${workerId}/lifecycle`,
        status: 'SUCCESS',
        details: {
          workerId,
          revokedTokensCount,
          unboundDevicesCount,
          reason,
          effectiveImmediately: true
        }
      });
    } catch (e) {
      console.warn('Failed to record auto-revoke audit log:', e);
    }

    return { revokedTokensCount, unboundDevicesCount };
  },

  /**
   * Bound Devices Management
   */
  ensureWorkerDeviceBound: (worker: Worker, tenantId: string): BoundDevice => {
    const devices = getStoredDevices();
    const existing = devices.find(d => d.workerId === worker.id && d.status === 'BOUND');
    if (existing) return existing;

    // Seed realistic primary mobile device for the worker
    const models = [
      'Realme Narzo 50 (Chrome Mobile)',
      'Samsung Galaxy M14 5G',
      'Redmi Note 12 Pro',
      'Vivo Y200 (Android 14)',
      'Shared Production Floor Tablet #2'
    ];
    const pickedModel = models[Math.abs(worker.name.charCodeAt(0) % models.length)];

    const newDevice: BoundDevice = {
      id: `dev-${worker.id}-${Date.now().toString(36)}`,
      workerId: worker.id,
      workerName: worker.name,
      tenantId,
      deviceModel: pickedModel,
      deviceFingerprint: `fp_${worker.id}_${pickedModel.slice(0, 8)}`,
      boundAt: new Date(Date.now() - 3600000 * 24 * 7).toISOString(),
      lastPunchAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      status: 'BOUND'
    };

    devices.push(newDevice);
    saveStoredDevices(devices);
    return newDevice;
  },

  getBoundDevicesForWorker: (workerId: string): BoundDevice[] => {
    const devices = getStoredDevices();
    return devices.filter(d => d.workerId === workerId);
  },

  unbindDevice: async (
    workerId: string, 
    deviceId: string, 
    unboundBy: string, 
    reason = 'manager unbind'
  ): Promise<boolean> => {
    const devices = getStoredDevices();
    const match = devices.find(d => d.id === deviceId && d.workerId === workerId);
    if (!match) return false;

    match.status = 'UNBOUND';
    match.unboundAt = new Date().toISOString();
    match.unboundBy = unboundBy;
    match.unboundReason = reason;

    saveStoredDevices(devices);

    try {
      await tenantSecurityService.logTenantAccess({
        tenantId: match.tenantId,
        userId: unboundBy,
        userEmail: unboundBy,
        userRole: 'SUPERVISOR',
        action: 'UNBIND_WORKER_DEVICE',
        resource: `workers/${workerId}/devices/${deviceId}`,
        status: 'SUCCESS',
        details: {
          workerId,
          deviceId,
          deviceModel: match.deviceModel,
          reason
        }
      });
    } catch {}

    return true;
  },

  /**
   * Device Fingerprint Generator
   * Hashes client device UUID + User Agent + Platform
   */
  getOrCreateDeviceFingerprint: (): {
    deviceId: string;
    deviceFingerprint: string;
    deviceModel: string;
    platform: string;
    userAgent: string;
  } => {
    return getOrCreateDeviceFingerprint();
  },

  /**
   * Check if the current device is actively bound to the specified worker
   * Enforces 30-day validity window (Key AC 2)
   */
  checkDeviceBoundStatus: (
    workerId: string, 
    deviceFingerprint: string
  ): { 
    isBound: boolean; 
    device?: BoundDevice; 
    isExpired?: boolean;
    expiresAt?: string;
  } => {
    const devices = getStoredDevices();
    const match = devices.find(d => 
      d.workerId === workerId && 
      d.deviceFingerprint === deviceFingerprint && 
      d.status === 'BOUND'
    );
    if (!match) {
      return { isBound: false };
    }
    const now = new Date();
    if (match.expiresAt && new Date(match.expiresAt) <= now) {
      return { isBound: false, isExpired: true, expiresAt: match.expiresAt };
    }
    return { isBound: true, device: match, expiresAt: match.expiresAt };
  },

  /**
   * Request a 6-digit OTP to bind an unbound device to a worker (Key AC 1 & 8)
   * Enforces:
   * - Edge Case 1: Phone number match against worker registration
   * - Rate limits: 3 requests/phone/hour, 30-minute lockout on 5 failed attempts
   * - 10-minute code validity
   */
  requestPunchOtp: async (
    worker: Worker,
    inputPhone: string,
    tenantId: string
  ): Promise<{
    success: boolean;
    error?: string;
    maskedPhone?: string;
    expiresAt?: number;
    demoOtp?: string;
    message?: string;
  }> => {
    const { cleanPhone: workerClean } = validateWorkerPhone(worker.phone);
    const { cleanPhone: inputClean } = validateWorkerPhone(inputPhone);

    // Edge Case 1: Forwarded punch link opened on unbound device
    // Check that input phone matches the worker's registered phone
    if (!inputClean || inputClean.slice(-10) !== workerClean.slice(-10)) {
      return {
        success: false,
        error: 'Phone number does not match worker registration. Forwarded punch links cannot be bound by another phone. The OTP is sent only to the registered worker mobile.'
      };
    }

    const now = Date.now();
    const otpStore = getStoredOtpStore();
    const key = `phone_${inputClean.slice(-10)}`;
    const session: DeviceBindingOtpState = otpStore[key] || {
      phone: inputClean,
      workerId: worker.id,
      otpCode: '',
      sentAt: 0,
      expiresAt: 0,
      attempts: 0,
      requestTimestamps: [],
      lastRequestTime: 0
    };

    // Check 30-minute lockout
    if (session.lockUntil && now < session.lockUntil) {
      const minutesRemaining = Math.ceil((session.lockUntil - now) / 60000);
      return {
        success: false,
        error: `Device binding is locked for ${minutesRemaining} more minutes due to multiple failed OTP attempts. Please wait or contact your manager.`
      };
    }

    // Rate Limit: 3 requests per phone per hour (rolling 60 min)
    const rollingOneHour = (session.requestTimestamps || []).filter(t => t > now - 3600000);
    if (rollingOneHour.length >= 3) {
      return {
        success: false,
        error: 'Too many OTP requests. Maximum 3 requests per phone per hour. Please wait before requesting another code.'
      };
    }

    // Generate 6-digit OTP
    const generatedCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = now + 10 * 60 * 1000; // 10-minute validity

    rollingOneHour.push(now);
    session.otpCode = generatedCode;
    session.sentAt = now;
    session.expiresAt = expiresAt;
    session.attempts = 0;
    session.requestTimestamps = rollingOneHour;
    session.lastRequestTime = now;
    session.lockUntil = undefined;

    otpStore[key] = session;
    saveStoredOtpStore(otpStore);

    const maskedPhone = `+91 ******${workerClean.slice(-4)}`;

    // Log to simulated communication bridge (WhatsApp/SMS)
    console.info(`[WORKFORCE SMS/WHATSAPP GATEWAY] OTP for ${worker.name} (${inputClean}): ${generatedCode}`);

    return {
      success: true,
      maskedPhone,
      expiresAt,
      demoOtp: generatedCode,
      message: `6-digit OTP sent to registered phone ${maskedPhone}. Valid for 10 minutes.`
    };
  },

  /**
   * Verify OTP and bind the device fingerprint for 30 days (Key AC 2 & 5)
   * Enforces:
   * - 5 attempts per code, then 30-minute lock
   * - Max 2 bound devices per worker (3rd device requires manager action)
   */
  verifyPunchOtpAndBindDevice: async (params: {
    worker: Worker;
    tenantId: string;
    inputPhone: string;
    enteredOtp: string;
    deviceFingerprint: string;
    deviceModel: string;
  }): Promise<{
    success: boolean;
    error?: string;
    errorCode?: 'DEVICE_LIMIT_REACHED' | 'OTP_INVALID' | 'LOCKED' | 'EXPIRED';
    device?: BoundDevice;
    canNotifyManager?: boolean;
    existingDevices?: BoundDevice[];
    message?: string;
  }> => {
    const { cleanPhone: inputClean } = validateWorkerPhone(params.inputPhone);
    const now = Date.now();
    const otpStore = getStoredOtpStore();
    const key = `phone_${inputClean.slice(-10)}`;
    const session = otpStore[key];

    if (!session || !session.otpCode) {
      return {
        success: false,
        errorCode: 'OTP_INVALID',
        error: 'No active OTP request found. Please request a new code.'
      };
    }

    // Check lock
    if (session.lockUntil && now < session.lockUntil) {
      const minutesRemaining = Math.ceil((session.lockUntil - now) / 60000);
      return {
        success: false,
        errorCode: 'LOCKED',
        error: `Device binding is locked for ${minutesRemaining} minutes due to multiple failed attempts.`
      };
    }

    // Check expiry (10 min)
    if (now > session.expiresAt) {
      return {
        success: false,
        errorCode: 'EXPIRED',
        error: 'OTP code has expired (10-minute validity). Please request a new code.'
      };
    }

    // Validate code match
    if (params.enteredOtp.trim() !== session.otpCode) {
      session.attempts = (session.attempts || 0) + 1;
      if (session.attempts >= 5) {
        session.lockUntil = now + 30 * 60 * 1000; // 30-minute lock
        saveStoredOtpStore(otpStore);
        return {
          success: false,
          errorCode: 'LOCKED',
          error: 'Incorrect OTP. You have reached 5 failed attempts. Device binding locked for 30 minutes for security.'
        };
      }
      saveStoredOtpStore(otpStore);
      return {
        success: false,
        errorCode: 'OTP_INVALID',
        error: `Incorrect OTP code. ${5 - session.attempts} attempts remaining before a 30-minute security lock.`
      };
    }

    // OTP Verified! Clear code
    session.otpCode = '';
    saveStoredOtpStore(otpStore);

    // Check 2-device maximum limit (Key AC 5 & Edge Case 2)
    const devices = getStoredDevices();
    const activeWorkerDevices = devices.filter(d => 
      d.workerId === params.worker.id && 
      d.status === 'BOUND' && 
      (!d.expiresAt || new Date(d.expiresAt) > new Date(now))
    );

    const alreadyBoundThisDevice = activeWorkerDevices.find(d => 
      d.deviceFingerprint === params.deviceFingerprint
    );

    const expiresAtIso = new Date(now + 30 * 86400 * 1000).toISOString(); // 30-day validity
    const nowIso = new Date(now).toISOString();

    if (alreadyBoundThisDevice) {
      // Renew existing device binding for 30 days
      alreadyBoundThisDevice.expiresAt = expiresAtIso;
      alreadyBoundThisDevice.lastPunchAt = nowIso;
      saveStoredDevices(devices);
      return {
        success: true,
        device: alreadyBoundThisDevice,
        message: 'Device binding renewed successfully for 30 days.'
      };
    }

    // If new device and already at 2 devices:
    if (activeWorkerDevices.length >= 2) {
      return {
        success: false,
        errorCode: 'DEVICE_LIMIT_REACHED',
        error: 'Device limit reached: A maximum of 2 devices can be bound to this worker. Ask your manager to remove an old device first.',
        canNotifyManager: true,
        existingDevices: activeWorkerDevices
      };
    }

    // Bind new device
    const newDevice: BoundDevice = {
      id: `dev-${params.worker.id}-${Date.now().toString(36)}`,
      workerId: params.worker.id,
      workerName: params.worker.name,
      tenantId: params.tenantId,
      deviceModel: params.deviceModel || 'Worker Smartphone',
      deviceFingerprint: params.deviceFingerprint,
      boundAt: nowIso,
      expiresAt: expiresAtIso,
      lastPunchAt: nowIso,
      registeredPhone: params.worker.phone,
      platform: typeof navigator !== 'undefined' ? (navigator.platform || 'web') : 'web',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
      status: 'BOUND'
    };

    devices.push(newDevice);
    saveStoredDevices(devices);

    // E15 Audit Trail Log
    try {
      await tenantSecurityService.logTenantAccess({
        tenantId: params.tenantId,
        userId: params.worker.id,
        userEmail: `worker-${params.worker.id}@magiclink.wfpro`,
        userRole: 'WORKER',
        action: 'BIND_WORKER_DEVICE',
        resource: `workers/${params.worker.id}/devices/${newDevice.id}`,
        status: 'SUCCESS',
        details: {
          workerId: params.worker.id,
          workerName: params.worker.name,
          deviceModel: newDevice.deviceModel,
          deviceFingerprint: newDevice.deviceFingerprint,
          expiresAt: expiresAtIso,
          validityDays: 30
        }
      });
    } catch (e) {
      console.warn('Failed to record device binding audit log:', e);
    }

    return {
      success: true,
      device: newDevice,
      message: 'Device bound successfully for 30 days. You can now punch with one tap!'
    };
  },

  /**
   * One-tap Manager Notification when Worker at 2-device limit needs removal
   * (Edge Case 2)
   */
  notifyManagerDeviceLimit: async (
    worker: Worker, 
    tenantId: string, 
    deviceModel: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      await inboxService.createCustomItem(tenantId, {
        id: `inbox-devlimit-${worker.id}-${Date.now()}`,
        tenantId,
        actionType: 'ATTENDANCE_EXCEPTION',
        urgency: 'HIGH',
        status: 'PENDING',
        workerId: worker.id,
        workerName: worker.name,
        workerPhone: worker.phone,
        workerDesignation: worker.designation,
        workerPhotoUrl: worker.photoUrl,
        title: 'Device Binding Limit: Removal Requested',
        description: `${worker.name} reached the 2-device maximum limit and requested removal of an old phone to bind a new device (${deviceModel}).`,
        timestamp: new Date().toISOString(),
        details: {
          reason: 'Worker changed device. 2-device limit reached.'
        }
      });

      await tenantSecurityService.logTenantAccess({
        tenantId,
        userId: worker.id,
        userEmail: `worker-${worker.id}@magiclink.wfpro`,
        userRole: 'WORKER',
        action: 'REQUEST_DEVICE_UNBIND',
        resource: `workers/${worker.id}/devices`,
        status: 'SUCCESS',
        details: {
          workerId: worker.id,
          workerName: worker.name,
          requestedModel: deviceModel,
          reason: '2-device limit reached'
        }
      });

      return {
        success: true,
        message: 'Notification sent to your supervisor! They have been notified to remove your old device.'
      };
    } catch (err: any) {
      console.error('Failed to notify manager:', err);
      return {
        success: false,
        message: 'Could not deliver notification to manager: ' + (err.message || 'Network error')
      };
    }
  },

  /**
   * One-Tap Device-Bound Attendance Punch Execution
   * Enforces:
   * - Key AC 2 & 3: One-tap punch with bound identity; auto-renews 30 days
   * - Key AC 7: Worker-exit check (inactive worker rejected with "You are no longer active.")
   * - Edge Case 3: Manager revokes binding mid-punch -> rejected with "Your device was unregistered by your manager"
   *   + attempted punch surfaced to E3 Inbox with timestamp, location, selfie (never silently discarded)
   */
  recordBoundDevicePunch: async (params: {
    tenantId: string;
    workerId: string;
    deviceFingerprint: string;
    deviceModel: string;
    punchType: 'IN' | 'OUT';
    location?: { lat: number; lng: number; address?: string };
    photoUrl?: string;
  }): Promise<BoundDevicePunchResult> => {
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);

    // 1. Check worker existence & active status (Key AC 7)
    const allWorkers = await dbService.getWorkers(params.tenantId).catch(() => []);
    const worker = allWorkers.find(w => w.id === params.workerId);

    if (worker && (worker.status === 'INACTIVE' || worker.isActive === false)) {
      return {
        success: false,
        errorCode: 'WORKER_INACTIVE',
        error: 'You are no longer active.'
      };
    }

    const workerName = worker?.name || 'Worker';

    // 2. Check Device Binding (Key AC 2, 6 & Edge Case 3)
    const devices = getStoredDevices();
    const match = devices.find(d => 
      d.workerId === params.workerId && 
      d.deviceFingerprint === params.deviceFingerprint
    );

    const isDeviceRevokedOrUnbound = !match || match.status !== 'BOUND' || (match.expiresAt && new Date(match.expiresAt) <= new Date());

    if (isDeviceRevokedOrUnbound) {
      // Edge Case 3: Manager revokes binding mid-punch
      // Never silently discard: surface attempted punch to E3 Inbox
      try {
        await inboxService.createCustomItem(params.tenantId, {
          id: `inbox-revoked-punch-${Date.now()}`,
          tenantId: params.tenantId,
          actionType: 'ATTENDANCE_EXCEPTION',
          urgency: 'URGENT',
          status: 'PENDING',
          workerId: params.workerId,
          workerName,
          workerPhone: worker?.phone,
          workerDesignation: worker?.designation,
          workerPhotoUrl: params.photoUrl || worker?.photoUrl,
          title: 'Unregistered / Revoked Device Punch Attempt',
          description: `${workerName} attempted ${params.punchType} from an unregistered or revoked device (${params.deviceModel}). Surfaced to E3 Inbox for supervisor review.`,
          timestamp: nowIso,
          details: {
            punch: {
              timestamp: nowIso,
              type: params.punchType,
              device: params.deviceModel,
              location: params.location ? { lat: params.location.lat, lng: params.location.lng } : undefined
            },
            punchLocation: params.location,
            reason: 'Device was unregistered or revoked by manager'
          }
        });
      } catch (err) {
        console.warn('Failed to create inbox exception item:', err);
      }

      try {
        await tenantSecurityService.logTenantAccess({
          tenantId: params.tenantId,
          userId: params.workerId,
          userEmail: `worker-${params.workerId}@magiclink.wfpro`,
          userRole: 'WORKER',
          action: 'PUNCH_FROM_REVOKED_DEVICE',
          resource: `workers/${params.workerId}/attendance`,
          status: 'DENIED',
          details: {
            workerId: params.workerId,
            workerName,
            deviceFingerprint: params.deviceFingerprint,
            deviceModel: params.deviceModel,
            punchType: params.punchType,
            location: params.location,
            hasPhoto: !!params.photoUrl
          }
        });
      } catch {}

      return {
        success: false,
        errorCode: 'DEVICE_UNREGISTERED',
        error: 'Your device was unregistered by your manager'
      };
    }

    // 3. Valid Binding! Auto-renew for 30 days (Key AC 2)
    match.expiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
    match.lastPunchAt = nowIso;
    saveStoredDevices(devices);

    // 4. Record attendance punch in DB
    const currentAttendance = await dbService.getTodayAttendance(params.tenantId).catch(() => []);
    let todayRecord = currentAttendance.find(a => a.workerId === params.workerId && (a.date || '').slice(0, 10) === today);

    const punchEntry = {
      timestamp: nowIso,
      type: params.punchType,
      device: match.deviceModel || params.deviceModel || 'Mobile Device',
      location: params.location ? { lat: params.location.lat, lng: params.location.lng } : undefined
    };

    let finalRecord: AttendanceRecord;

    if (todayRecord) {
      if (params.punchType === 'IN') {
        todayRecord.checkIn = todayRecord.checkIn || nowIso;
        todayRecord.status = 'PRESENT';
      } else {
        todayRecord.checkOut = nowIso;
        if (todayRecord.checkIn) {
          const diffMs = new Date(nowIso).getTime() - new Date(todayRecord.checkIn).getTime();
          const hrs = Math.max(0, Math.round((diffMs / 3600000) * 10) / 10);
          todayRecord.hours = {
            ...todayRecord.hours,
            gross: hrs,
            net: hrs,
            regular: Math.min(8, hrs),
            overtime: Math.max(0, hrs - 8)
          };
        }
      }
      todayRecord.punches = todayRecord.punches || [];
      todayRecord.punches.push(punchEntry);
      todayRecord.timeline = todayRecord.timeline || [];
      todayRecord.timeline.push(punchEntry as any);
      finalRecord = todayRecord;
    } else {
      finalRecord = {
        id: `${params.tenantId}_${params.workerId}_${today}`,
        tenantId: params.tenantId,
        workerId: params.workerId,
        workerName,
        date: today,
        shiftId: worker?.shiftId || 'default',
        timeline: [punchEntry as any],
        lateStatus: {
          isLate: false,
          lateByMins: 0,
          penaltyApplied: false
        },
        status: params.punchType === 'IN' ? 'PRESENT' : 'HALF_DAY',
        checkIn: params.punchType === 'IN' ? nowIso : undefined,
        checkOut: params.punchType === 'OUT' ? nowIso : undefined,
        hours: { gross: 0, net: 0, regular: 0, overtime: 0, breakTime: 0 },
        punches: [punchEntry],
        syncStatus: 'SYNCED',
        confidence: 0.99
      };
    }

    try {
      await dbService.markAttendance(finalRecord);
    } catch (e) {
      console.warn('DB markAttendance error:', e);
    }

    // 5. E15 Audit Trail Log
    try {
      await tenantSecurityService.logTenantAccess({
        tenantId: params.tenantId,
        userId: params.workerId,
        userEmail: `worker-${params.workerId}@magiclink.wfpro`,
        userRole: 'WORKER',
        action: 'DEVICE_BOUND_PUNCH',
        resource: `workers/${params.workerId}/attendance/${today}`,
        status: 'SUCCESS',
        details: {
          workerId: params.workerId,
          workerName,
          punchType: params.punchType,
          deviceModel: match.deviceModel,
          deviceFingerprint: match.deviceFingerprint,
          renewedUntil: match.expiresAt,
          location: params.location,
          photoCaptured: !!params.photoUrl
        }
      });
    } catch {}

    return {
      success: true,
      punchType: params.punchType,
      punchTime: nowIso,
      record: finalRecord,
      boundDevice: match
    };
  },

  /**
   * Clear active local session binding to allow switching to another worker (Edge Case 4)
   */
  clearDeviceLocalWorkerSession: () => {
    try {
      localStorage.removeItem('wfpro_active_bound_worker_id');
    } catch {}
  },

  /**
   * Generates a complete data access report for a worker complying with India DPDP Act
   */
  generateDpdpSubjectAccessReport: async (
    worker: Worker, 
    tenantId: string
  ): Promise<DpdpSubjectAccessReport> => {
    const { active, revoked } = magicLinkService.getTokensForWorker(worker.id);
    const boundDevices = magicLinkService.getBoundDevicesForWorker(worker.id);
    const attendance = await dbService.getAttendanceHistory(tenantId).catch(() => []);
    const workerAttendance = attendance.filter(a => a.workerId === worker.id);

    // Retrieve audit trail entries for this worker
    const allAudit = await tenantSecurityService.getAuditLogs(tenantId);
    const workerAudit = (allAudit || []).filter(log => 
      log.resource?.includes(worker.id) || log.details?.workerId === worker.id
    );

    // Mask Aadhar for privacy compliance (show only last 4)
    const aadharMasked = worker.aadhar 
      ? `XXXX-XXXX-${worker.aadhar.replace(/\s+/g, '').slice(-4)}`
      : 'Not recorded';

    return {
      generatedAt: new Date().toISOString(),
      workerId: worker.id,
      workerName: worker.name,
      tenantId,
      phone: worker.phone,
      aadharMasked,
      activeTokensCount: active.length,
      revokedTokensCount: revoked.length,
      boundDevicesCount: boundDevices.filter(d => d.status === 'BOUND').length,
      punchRecordsCount: workerAttendance.length,
      tokens: [...active, ...revoked],
      boundDevices,
      auditLogs: workerAudit
    };
  }
};
