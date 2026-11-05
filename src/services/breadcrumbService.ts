// src/services/breadcrumbService.ts
import { 
  FieldShiftSession, 
  ShiftBreadcrumb, 
  RoutePlaybackAudit, 
  TrackingMode, 
  BreadcrumbsConfig, 
  Branch, 
  OrgSettings, 
  SubscriptionTier, 
  OemBatteryOptState,
  Worker,
  ConsentRecord,
  BoundDevice,
  UserProfile
} from '../types/index';
import { tenantSecurityService } from './tenantSecurityService';
import { inboxService } from './inboxService';
import { consentService } from './consentService';

const SESSIONS_STORAGE_KEY = 'wfpro_field_shift_sessions';
const BREADCRUMBS_STORAGE_KEY = 'wfpro_shift_breadcrumbs';
const OFFLINE_BUFFER_KEY = 'wfpro_offline_breadcrumbs_buffer';
const OEM_BATTERY_OPT_KEY = 'wfpro_oem_battery_opt_walkthrough';
const PLAYBACK_AUDIT_KEY = 'wfpro_route_playback_audits';

// Helper storage functions
const getStoredSessions = (): FieldShiftSession[] => {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveStoredSessions = (sessions: FieldShiftSession[]) => {
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.warn('Failed to save shift sessions:', e);
  }
};

const getStoredBreadcrumbs = (): ShiftBreadcrumb[] => {
  try {
    const raw = localStorage.getItem(BREADCRUMBS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveStoredBreadcrumbs = (breadcrumbs: ShiftBreadcrumb[]) => {
  try {
    localStorage.setItem(BREADCRUMBS_STORAGE_KEY, JSON.stringify(breadcrumbs));
  } catch (e) {
    console.warn('Failed to save breadcrumbs:', e);
  }
};

const getStoredOfflineBuffer = (): ShiftBreadcrumb[] => {
  try {
    const raw = localStorage.getItem(OFFLINE_BUFFER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveStoredOfflineBuffer = (buffer: ShiftBreadcrumb[]) => {
  try {
    localStorage.setItem(OFFLINE_BUFFER_KEY, JSON.stringify(buffer));
  } catch (e) {
    console.warn('Failed to save offline buffer:', e);
  }
};

const getStoredAudits = (): RoutePlaybackAudit[] => {
  try {
    const raw = localStorage.getItem(PLAYBACK_AUDIT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveStoredAudits = (audits: RoutePlaybackAudit[]) => {
  try {
    localStorage.setItem(PLAYBACK_AUDIT_KEY, JSON.stringify(audits));
  } catch (e) {
    console.warn('Failed to save playback audits:', e);
  }
};

export const breadcrumbService = {
  // Config defaults
  DEFAULT_CONFIG: {
    enabled: true,
    trackingMode: 'PUNCH_ONLY' as TrackingMode,
    movingIntervalMinutes: 8,
    stationaryIntervalMinutes: 30,
    hardCapIntervalMinutes: 5,
    privacyPauseDurationsMinutes: [15, 30, 60],
    retentionDays: 30
  },

  /**
   * Environment detection: Native Capacitor vs Browser/PWA
   * The browser cannot do reliable background location when the screen is locked.
   */
  isNativePlatform: (): boolean => {
    if (typeof window === 'undefined') return false;
    const win = window as any;
    return !!(
      win.Capacitor?.isNativePlatform?.() ||
      win.AndroidGeofenceBridge ||
      win.webkit?.messageHandlers?.iOSGeofenceBridge
    );
  },

  /**
   * Detects device OEM to provide customized battery optimization guidance
   */
  detectDeviceOem: (): 'XIAOMI' | 'OPPO_REALME' | 'VIVO' | 'SAMSUNG' | 'STOCK_ANDROID' | 'OTHER' => {
    if (typeof navigator === 'undefined') return 'OTHER';
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('xiaomi') || ua.includes('redmi') || ua.includes('miui') || ua.includes('hyperos') || ua.includes('poco')) {
      return 'XIAOMI';
    }
    if (ua.includes('oppo') || ua.includes('realme') || ua.includes('coloros')) {
      return 'OPPO_REALME';
    }
    if (ua.includes('vivo') || ua.includes('funtouch') || ua.includes('iqoo') || ua.includes('origin')) {
      return 'VIVO';
    }
    if (ua.includes('samsung') || ua.includes('sm-')) {
      return 'SAMSUNG';
    }
    if (ua.includes('android')) {
      return 'STOCK_ANDROID';
    }
    return 'OTHER';
  },

  /**
   * Resolves tracking mode for tenant based on subscription plan, org settings, and overrides
   * AC: Disabled entirely on Free; default PUNCH_ONLY on Growth/Starter; BREADCRUMB on Pro/Enterprise or via tenant override
   */
  getTenantTrackingMode: (
    tenantId: string, 
    orgSettings?: OrgSettings, 
    plan?: SubscriptionTier
  ): TrackingMode => {
    // Disabled entirely on Free plan
    if (plan === 'FREE') return 'PUNCH_ONLY';

    // Check tenant config
    const configuredMode = orgSettings?.breadcrumbsConfig?.trackingMode;
    if (configuredMode) {
      // Pro or Enterprise can use BREADCRUMB
      if (configuredMode === 'BREADCRUMB') {
        if (plan === 'PRO' || plan === 'ENTERPRISE' || plan === 'TRIAL') {
          return 'BREADCRUMB';
        }
        // Growth / Starter tenant override (E16-S3)
        if (orgSettings?.breadcrumbsConfig?.enabled) {
          return 'BREADCRUMB';
        }
      }
      return configuredMode;
    }

    // Default by plan tier
    if (plan === 'PRO' || plan === 'ENTERPRISE' || plan === 'TRIAL') {
      return 'BREADCRUMB';
    }
    return 'PUNCH_ONLY';
  },

  /**
   * Resolves site-level tracking mode with fallback to tenant mode
   * AC: Opt-in per tenant and per site
   */
  getSiteTrackingMode: (site?: Branch, tenantTrackingMode: TrackingMode = 'PUNCH_ONLY'): TrackingMode => {
    if (site?.trackingMode) {
      return site.trackingMode;
    }
    return tenantTrackingMode;
  },

  /**
   * Starts a FieldShiftSession after a successful Punch IN
   * Session key is FieldShiftSession.id, NOT a login session
   */
  startShiftSession: async (params: {
    tenantId: string;
    siteId: string;
    siteName: string;
    workerId: string;
    workerName: string;
    deviceBindingId: string;
    deviceFingerprint: string;
    punchTime: string;
    trackingMode: TrackingMode;
    initialLocation?: { lat: number; lng: number; accuracy: number };
    batteryPct?: number;
    degradedReason?: 'OEM_BATTERY_DECLINED' | 'PWA_BROWSER' | 'PERMISSION_REVOKED' | 'CONSENT_WITHDRAWN';
  }): Promise<FieldShiftSession> => {
    const sessionId = `shift-sess-${params.workerId}-${Date.now()}`;
    const sessions = getStoredSessions();

    // Close any prior dangling active session for this worker
    sessions.forEach(s => {
      if (s.workerId === params.workerId && s.status === 'ACTIVE') {
        s.status = 'COMPLETED';
        s.endedAt = params.punchTime;
      }
    });

    const newSession: FieldShiftSession = {
      id: sessionId,
      tenantId: params.tenantId,
      siteId: params.siteId,
      siteName: params.siteName,
      workerId: params.workerId,
      workerName: params.workerName,
      deviceBindingId: params.deviceBindingId,
      deviceFingerprint: params.deviceFingerprint,
      startedAt: params.punchTime,
      status: 'ACTIVE',
      pauseHistory: [],
      totalBreadcrumbsCount: 0,
      mockedDetectedCount: 0,
      trackingMode: params.trackingMode,
      degradedReason: params.degradedReason,
      lastMotionStatus: 'STATIONARY'
    };

    // If initial location provided and breadcrumb tracking active, record first point
    if (params.trackingMode === 'BREADCRUMB' && params.initialLocation && !params.degradedReason) {
      const initialBreadcrumb: ShiftBreadcrumb = {
        id: `bc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sessionId: newSession.id,
        tenantId: params.tenantId,
        workerId: params.workerId,
        siteId: params.siteId,
        lat: params.initialLocation.lat,
        lng: params.initialLocation.lng,
        accuracy: params.initialLocation.accuracy,
        capturedAt: params.punchTime,
        source: 'GPS',
        isMocked: false,
        batteryPct: params.batteryPct ?? 95,
        isMoving: false,
        eventType: 'POINT'
      };

      const breadcrumbs = getStoredBreadcrumbs();
      breadcrumbs.push(initialBreadcrumb);
      saveStoredBreadcrumbs(breadcrumbs);

      newSession.totalBreadcrumbsCount = 1;
      newSession.lastBreadcrumbAt = params.punchTime;
    }

    sessions.unshift(newSession);
    saveStoredSessions(sessions);

    return newSession;
  },

  /**
   * Retrieves active shift session for a worker
   */
  getActiveSession: (workerId: string, tenantId?: string): FieldShiftSession | null => {
    const sessions = getStoredSessions();
    const active = sessions.find(s => 
      s.workerId === workerId && 
      (!tenantId || s.tenantId === tenantId) && 
      (s.status === 'ACTIVE' || s.status === 'PAUSED_BREAK' || s.status === 'PAUSED_PRIVACY')
    );
    return active || null;
  },

  /**
   * Ends an active FieldShiftSession on Punch OUT, shift end, or timeout
   */
  endShiftSession: async (
    workerId: string, 
    tenantId: string, 
    reason: 'PUNCH_OUT' | 'SHIFT_END' | 'TIMEOUT' | 'CONSENT_WITHDRAWN' = 'PUNCH_OUT'
  ): Promise<FieldShiftSession | null> => {
    const sessions = getStoredSessions();
    const session = sessions.find(s => 
      s.workerId === workerId && 
      s.tenantId === tenantId && 
      (s.status === 'ACTIVE' || s.status === 'PAUSED_BREAK' || s.status === 'PAUSED_PRIVACY')
    );

    if (!session) return null;

    const nowIso = new Date().toISOString();
    session.endedAt = nowIso;
    session.status = reason === 'CONSENT_WITHDRAWN' ? 'CONSENT_WITHDRAWN' : 'COMPLETED';

    saveStoredSessions(sessions);
    return session;
  },

  /**
   * Pauses shift tracking for a scheduled break (visible to supervisor as PAUSE event, not a gap)
   */
  pauseForBreak: async (sessionId: string): Promise<FieldShiftSession | null> => {
    const sessions = getStoredSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return null;

    const nowIso = new Date().toISOString();
    session.status = 'PAUSED_BREAK';
    session.pauseHistory.push({
      type: 'BREAK',
      startedAt: nowIso
    });

    // Record breadcrumb event with BREAK_PAUSE marker
    const breadcrumbs = getStoredBreadcrumbs();
    breadcrumbs.push({
      id: `bc-break-${Date.now()}`,
      sessionId: session.id,
      tenantId: session.tenantId,
      workerId: session.workerId,
      siteId: session.siteId,
      lat: 0,
      lng: 0,
      accuracy: 0,
      capturedAt: nowIso,
      source: 'GPS',
      isMocked: false,
      batteryPct: 90,
      isMoving: false,
      eventType: 'BREAK_PAUSE'
    });
    saveStoredBreadcrumbs(breadcrumbs);

    saveStoredSessions(sessions);
    return session;
  },

  /**
   * Sensitive location "Privacy pause" (hospital, place of worship, competitor site)
   * Suppresses capture for a configurable period without ending shift.
   * Logs the pause event, NOT the sensitive location!
   */
  pauseForPrivacy: async (
    sessionId: string, 
    durationMinutes: number = 30, 
    reason: string = 'Personal / Sensitive Location'
  ): Promise<FieldShiftSession | null> => {
    const sessions = getStoredSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return null;

    const nowIso = new Date().toISOString();
    session.status = 'PAUSED_PRIVACY';
    session.pauseHistory.push({
      type: 'PRIVACY',
      startedAt: nowIso,
      durationMinutes,
      reason
    });

    // Record privacy pause event WITHOUT coordinates to protect worker privacy
    const breadcrumbs = getStoredBreadcrumbs();
    breadcrumbs.push({
      id: `bc-privacy-${Date.now()}`,
      sessionId: session.id,
      tenantId: session.tenantId,
      workerId: session.workerId,
      siteId: session.siteId,
      lat: 0, // Zeroed out
      lng: 0, // Zeroed out
      accuracy: 0,
      capturedAt: nowIso,
      source: 'GPS',
      isMocked: false,
      batteryPct: 90,
      isMoving: false,
      eventType: 'PRIVACY_PAUSE'
    });
    saveStoredBreadcrumbs(breadcrumbs);

    saveStoredSessions(sessions);
    return session;
  },

  /**
   * Resumes tracking after break or privacy pause
   */
  resumeTracking: async (sessionId: string): Promise<FieldShiftSession | null> => {
    const sessions = getStoredSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return null;

    const nowIso = new Date().toISOString();
    const wasPrivacy = session.status === 'PAUSED_PRIVACY';
    session.status = 'ACTIVE';

    // Update last pause in history
    if (session.pauseHistory.length > 0) {
      const lastPause = session.pauseHistory[session.pauseHistory.length - 1];
      if (!lastPause.resumedAt) {
        lastPause.resumedAt = nowIso;
      }
    }

    // Record resume breadcrumb event
    const breadcrumbs = getStoredBreadcrumbs();
    breadcrumbs.push({
      id: `bc-resume-${Date.now()}`,
      sessionId: session.id,
      tenantId: session.tenantId,
      workerId: session.workerId,
      siteId: session.siteId,
      lat: 0,
      lng: 0,
      accuracy: 0,
      capturedAt: nowIso,
      source: 'GPS',
      isMocked: false,
      batteryPct: 90,
      isMoving: false,
      eventType: wasPrivacy ? 'PRIVACY_RESUME' : 'BREAK_RESUME'
    });
    saveStoredBreadcrumbs(breadcrumbs);

    saveStoredSessions(sessions);
    return session;
  },

  /**
   * Records a verified breadcrumb point during an active shift
   * Detects motion state, flags mocked GPS, and buffers offline points
   */
  recordBreadcrumb: async (params: {
    sessionId: string;
    tenantId: string;
    workerId: string;
    siteId: string;
    lat: number;
    lng: number;
    accuracy: number;
    batteryPct?: number;
    source?: 'GPS' | 'NETWORK' | 'CELL' | 'OFFLINE_BUFFER';
    isMocked?: boolean;
    speedMps?: number;
    isOffline?: boolean;
    timestamp?: string;
  }): Promise<ShiftBreadcrumb | null> => {
    const sessions = getStoredSessions();
    const session = sessions.find(s => s.id === params.sessionId);
    if (!session || session.status !== 'ACTIVE') {
      return null; // Tracking only active during unpaused shift
    }

    const capturedAt = params.timestamp || new Date().toISOString();
    const batteryPct = params.batteryPct ?? 85;

    // Detect Mock Location (AC: Mocked breadcrumbs flagged and excluded from route reports)
    const isMocked = params.isMocked || (params.accuracy < 1 && params.speedMps === 0);

    // Compute motion state: if speed > 1.0 m/s (~3.6 km/h) -> moving, else stationary
    const isMoving = typeof params.speedMps === 'number' ? params.speedMps > 1.0 : false;

    const breadcrumb: ShiftBreadcrumb = {
      id: `bc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sessionId: params.sessionId,
      tenantId: params.tenantId,
      workerId: params.workerId,
      siteId: params.siteId,
      lat: params.lat,
      lng: params.lng,
      accuracy: params.accuracy,
      capturedAt,
      source: params.source || (params.isOffline ? 'OFFLINE_BUFFER' : 'GPS'),
      isMocked,
      batteryPct,
      isMoving,
      speedMps: params.speedMps,
      eventType: 'POINT'
    };

    if (params.isOffline) {
      // Buffer locally for offline sync
      const buffer = getStoredOfflineBuffer();
      buffer.push(breadcrumb);
      saveStoredOfflineBuffer(buffer);
      return breadcrumb;
    }

    const breadcrumbs = getStoredBreadcrumbs();
    breadcrumbs.push(breadcrumb);
    saveStoredBreadcrumbs(breadcrumbs);

    // Update session metrics
    session.lastBreadcrumbAt = capturedAt;
    session.lastMotionStatus = isMoving ? 'MOVING' : 'STATIONARY';
    session.totalBreadcrumbsCount += 1;
    if (isMocked) {
      session.mockedDetectedCount += 1;
    }
    saveStoredSessions(sessions);

    return breadcrumb;
  },

  /**
   * Flushes and synchronizes buffered offline breadcrumbs
   * AC: Worker offline mid-shift -> buffer breadcrumbs locally with timestamps;
   * on sync, upload chronologically with explicit gap markers ("No signal 10:12–10:48") — never interpolate fake route
   */
  syncOfflineBuffer: async (tenantId: string, workerId: string): Promise<{ syncedCount: number; gapsAdded: number }> => {
    const buffer = getStoredOfflineBuffer();
    const workerItems = buffer.filter(b => b.tenantId === tenantId && b.workerId === workerId);
    if (workerItems.length === 0) return { syncedCount: 0, gapsAdded: 0 };

    // Sort chronologically
    workerItems.sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());

    const breadcrumbs = getStoredBreadcrumbs();
    let gapsAdded = 0;

    for (let i = 0; i < workerItems.length; i++) {
      const current = workerItems[i];
      if (i > 0) {
        const prev = workerItems[i - 1];
        const gapMs = new Date(current.capturedAt).getTime() - new Date(prev.capturedAt).getTime();
        // If gap between points exceeds 15 minutes, insert explicit GAP_MARKER
        if (gapMs > 15 * 60 * 1000) {
          const startTimeStr = new Date(prev.capturedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
          const endTimeStr = new Date(current.capturedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
          
          breadcrumbs.push({
            id: `gap-${Date.now()}-${i}`,
            sessionId: current.sessionId,
            tenantId: current.tenantId,
            workerId: current.workerId,
            siteId: current.siteId,
            lat: 0,
            lng: 0,
            accuracy: 0,
            capturedAt: current.capturedAt,
            source: 'OFFLINE_BUFFER',
            isMocked: false,
            batteryPct: current.batteryPct,
            isMoving: false,
            eventType: 'GAP_MARKER',
            gapDetails: {
              startAt: prev.capturedAt,
              endAt: current.capturedAt,
              reason: `No signal ${startTimeStr}–${endTimeStr}`
            }
          });
          gapsAdded++;
        }
      }
      breadcrumbs.push(current);
    }

    saveStoredBreadcrumbs(breadcrumbs);

    // Remove synced items from buffer
    const remainingBuffer = buffer.filter(b => !(b.tenantId === tenantId && b.workerId === workerId));
    saveStoredOfflineBuffer(remainingBuffer);

    return { syncedCount: workerItems.length, gapsAdded };
  },

  /**
   * Consent withdrawal handler
   * AC: Tracking stops within 60 seconds -> worker switched to PUNCH_ONLY.
   * Historical breadcrumbs purged within statutory window unless legal hold.
   */
  handleConsentWithdrawal: async (workerId: string, tenantId: string): Promise<void> => {
    // 1. Immediately end active shift session
    await breadcrumbService.endShiftSession(workerId, tenantId, 'CONSENT_WITHDRAWN');

    // 2. Check if under active legal hold
    const isLegalHold = consentService.isLegalHoldActive ? consentService.isLegalHoldActive(workerId) : false;

    if (!isLegalHold) {
      // Purge historical breadcrumbs for this worker
      const breadcrumbs = getStoredBreadcrumbs();
      const retained = breadcrumbs.filter(b => b.workerId !== workerId);
      saveStoredBreadcrumbs(retained);
    }
  },

  /**
   * Retrieves list of active-shift workers for field supervisor map
   * AC: Manager map shows only active-shift workers by default.
   * Handles Android Doze edge case: displays "Last updated [X] min ago" (never claims false real-time)
   */
  getActiveShiftWorkers: (tenantId: string): Array<{
    session: FieldShiftSession;
    lastBreadcrumb?: ShiftBreadcrumb;
    minutesSinceLastUpdate: number;
    isThrottled: boolean;
    displayStatus: string;
  }> => {
    const sessions = getStoredSessions();
    const breadcrumbs = getStoredBreadcrumbs();
    const now = Date.now();

    const activeSessions = sessions.filter(s => 
      s.tenantId === tenantId && 
      (s.status === 'ACTIVE' || s.status === 'PAUSED_BREAK' || s.status === 'PAUSED_PRIVACY')
    );

    return activeSessions.map(session => {
      // Find latest valid breadcrumb for this session
      const sessionBreadcrumbs = breadcrumbs.filter(b => b.sessionId === session.id && b.eventType === 'POINT' && !b.isMocked);
      const latest = sessionBreadcrumbs.length > 0 ? sessionBreadcrumbs[sessionBreadcrumbs.length - 1] : undefined;

      const lastTime = latest ? new Date(latest.capturedAt).getTime() : new Date(session.startedAt).getTime();
      const minutesSinceLastUpdate = Math.max(0, Math.floor((now - lastTime) / (60 * 1000)));

      // Throttled by OS / Android Doze if screen off for > 8 min
      const isThrottled = minutesSinceLastUpdate >= 8;

      let displayStatus = 'Tracking Active';
      if (session.status === 'PAUSED_BREAK') {
        displayStatus = 'On Break';
      } else if (session.status === 'PAUSED_PRIVACY') {
        displayStatus = 'Privacy Pause';
      } else if (session.degradedReason === 'OEM_BATTERY_DECLINED') {
        displayStatus = 'Degraded to PUNCH_ONLY (Battery Opt Declined)';
      } else if (session.degradedReason === 'PWA_BROWSER') {
        displayStatus = 'Degraded to PUNCH_ONLY (Browser PWA)';
      }

      return {
        session,
        lastBreadcrumb: latest,
        minutesSinceLastUpdate,
        isThrottled,
        displayStatus
      };
    });
  },

  /**
   * Historical playback query limited to current + previous 30 days
   * AC: Historical playback limited to current + previous 30 days; every playback logged in E15 with viewer identity
   */
  getHistoricalSessions: (tenantId: string, daysLimit = 30): Array<{
    session: FieldShiftSession;
    breadcrumbsCount: number;
    mockedCount: number;
  }> => {
    const sessions = getStoredSessions();
    const cutoffTime = Date.now() - (daysLimit * 24 * 60 * 60 * 1000);

    return sessions
      .filter(s => s.tenantId === tenantId && new Date(s.startedAt).getTime() >= cutoffTime)
      .map(session => ({
        session,
        breadcrumbsCount: session.totalBreadcrumbsCount,
        mockedCount: session.mockedDetectedCount
      }))
      .sort((a, b) => new Date(b.session.startedAt).getTime() - new Date(a.session.startedAt).getTime());
  },

  /**
   * Retrieves full route coordinates and events for a session
   * AC: Mocked breadcrumbs flagged and EXCLUDED from route reports — never silently included!
   * Logs route playback audit entry with viewer identity (E15)
   */
  getSessionRoute: async (
    sessionId: string, 
    viewer?: { uid: string; email: string; role: string; name?: string }
  ): Promise<{
    session: FieldShiftSession | null;
    routePoints: ShiftBreadcrumb[];
    excludedMockedPoints: ShiftBreadcrumb[];
    gapMarkers: ShiftBreadcrumb[];
    pauseEvents: ShiftBreadcrumb[];
    auditId?: string;
  }> => {
    const sessions = getStoredSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (!session) {
      return { session: null, routePoints: [], excludedMockedPoints: [], gapMarkers: [], pauseEvents: [] };
    }

    const allBreadcrumbs = getStoredBreadcrumbs();
    const sessionBreadcrumbs = allBreadcrumbs.filter(b => b.sessionId === sessionId);

    // Filter valid route points (Exclude mocked coordinates from report!)
    const routePoints = sessionBreadcrumbs.filter(b => b.eventType === 'POINT' && !b.isMocked && b.lat !== 0 && b.lng !== 0);
    const excludedMockedPoints = sessionBreadcrumbs.filter(b => b.isMocked);
    const gapMarkers = sessionBreadcrumbs.filter(b => b.eventType === 'GAP_MARKER');
    const pauseEvents = sessionBreadcrumbs.filter(b => 
      b.eventType === 'BREAK_PAUSE' || 
      b.eventType === 'BREAK_RESUME' || 
      b.eventType === 'PRIVACY_PAUSE' || 
      b.eventType === 'PRIVACY_RESUME'
    );

    // E15 Audit logging: Every historical playback logged with viewer identity
    let auditId: string | undefined;
    if (viewer) {
      auditId = `audit-pb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const auditEntry: RoutePlaybackAudit = {
        id: auditId,
        tenantId: session.tenantId,
        sessionId: session.id,
        workerId: session.workerId,
        workerName: session.workerName,
        viewedAt: new Date().toISOString(),
        viewerId: viewer.uid,
        viewerName: viewer.name || viewer.email || 'Supervisor',
        viewerRole: viewer.role,
        date: session.startedAt.slice(0, 10),
        source: 'HISTORICAL_PLAYBACK'
      };

      const audits = getStoredAudits();
      audits.unshift(auditEntry);
      saveStoredAudits(audits);

      // Also record in central E15 security audit log
      try {
        await tenantSecurityService.logTenantAccess({
          tenantId: session.tenantId,
          userId: viewer.uid,
          userEmail: viewer.email,
          userRole: viewer.role,
          action: 'PLAYBACK_SHIFT_ROUTE',
          resource: `field_sessions/${session.id}/breadcrumbs`,
          status: 'SUCCESS',
          details: {
            workerId: session.workerId,
            workerName: session.workerName,
            shiftStartedAt: session.startedAt,
            pointsViewed: routePoints.length,
            mockedExcluded: excludedMockedPoints.length,
            viewerIdentity: viewer.email
          }
        });
      } catch (err) {
        console.warn('Failed to record E15 route playback audit:', err);
      }
    }

    return {
      session,
      routePoints,
      excludedMockedPoints,
      gapMarkers,
      pauseEvents,
      auditId
    };
  },

  /**
   * Retrieves playback audit history for E15 compliance check
   */
  getPlaybackAudits: (tenantId: string, sessionId?: string): RoutePlaybackAudit[] => {
    const audits = getStoredAudits();
    return audits.filter(a => a.tenantId === tenantId && (!sessionId || a.sessionId === sessionId));
  },

  /**
   * Manages OEM Battery optimization state for Xiaomi, Oppo, Vivo, Samsung devices
   * AC: First-use walkthrough with screenshots to disable battery optimisation;
   * if worker declines, degrade to PUNCH_ONLY and inform supervisor once.
   */
  getOemBatteryOptState: (deviceId: string): OemBatteryOptState | null => {
    try {
      const raw = localStorage.getItem(`${OEM_BATTERY_OPT_KEY}_${deviceId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  saveOemBatteryOptDecision: async (params: {
    deviceId: string;
    tenantId: string;
    workerId: string;
    workerName: string;
    osType: 'XIAOMI' | 'OPPO_REALME' | 'VIVO' | 'SAMSUNG' | 'STOCK_ANDROID' | 'OTHER';
    declined: boolean;
  }): Promise<void> => {
    const state: OemBatteryOptState = {
      deviceId: params.deviceId,
      osType: params.osType,
      walkthroughCompleted: true,
      declined: params.declined,
      timestamp: new Date().toISOString()
    };

    localStorage.setItem(`${OEM_BATTERY_OPT_KEY}_${params.deviceId}`, JSON.stringify(state));

    if (params.declined) {
      // Degrade active session to PUNCH_ONLY
      const sessions = getStoredSessions();
      const active = sessions.find(s => s.workerId === params.workerId && s.status === 'ACTIVE');
      if (active) {
        active.trackingMode = 'PUNCH_ONLY';
        active.degradedReason = 'OEM_BATTERY_DECLINED';
        saveStoredSessions(sessions);
      }

      // Inform supervisor once via Action Inbox
      try {
        await inboxService.createCustomItem(params.tenantId, {
          id: `inbox-oem-opt-${params.workerId}-${Date.now()}`,
          tenantId: params.tenantId,
          actionType: 'ATTENDANCE_EXCEPTION',
          urgency: 'NORMAL',
          status: 'PENDING',
          workerId: params.workerId,
          workerName: params.workerName,
          title: `Battery Optimization Declined: ${params.workerName}`,
          description: `${params.workerName} (${params.osType} device) declined battery optimization walkthrough. Worker degraded to PUNCH_ONLY mode. Background shift breadcrumbs will not be collected.`,
          timestamp: new Date().toISOString(),
          details: {
            reason: `OEM Battery optimization disabled by worker (${params.osType}). Degraded to PUNCH_ONLY.`
          }
        });
      } catch (err) {
        console.warn('Failed to notify supervisor of battery optimization decline:', err);
      }
    }
  }
};
