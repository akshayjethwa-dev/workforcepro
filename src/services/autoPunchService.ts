// src/services/autoPunchService.ts
import { 
  Worker, 
  Branch, 
  OrgSettings, 
  Punch, 
  AttendanceRecord, 
  BoundDevice, 
  ConsentRecord,
  GeofenceEvent,
  AutoPunchSession,
  SiteDistanceInfo,
  DisambiguationChoice
} from '../types/index';
import { geoUtils } from '../utils/geo';
import { dbService } from './db';
import { inboxService } from './inboxService';
import { entitlementService } from './entitlementService';
import { syncService } from './syncService';
import { magicLinkService, getOrCreateDeviceFingerprint } from './magicLinkService';

const SESSIONS_STORAGE_KEY = 'wfpro_autopunch_sessions';
const EVENTS_STORAGE_KEY = 'wfpro_geofence_events';
const PERM_REVOKED_NOTICE_KEY = 'wfpro_perm_revoked_notified';
const DISAMBIGUATION_CHOICE_KEY = 'wfpro_site_disambiguation_choices';
const SITE_DWELL_STATE_KEY = 'wfpro_site_dwell_states';

export interface SiteDwellState {
  siteId: string;
  firstEnteredAt?: number;
  lastInsideAt?: number;
  firstExitedAt?: number;
  lastOutsideAt?: number;
  lastConfirmedStatus?: 'INSIDE' | 'OUTSIDE';
}

export interface EvaluateLocationResult {
  transitionType?: 'ENTER' | 'DWELL' | 'EXIT' | 'RE_ENTRY';
  candidateSite?: SiteDistanceInfo;
  requiresDisambiguation?: boolean;
  overlappingSites?: SiteDistanceInfo[];
  autoPunchTriggered?: boolean;
  discardedReason?: string;
  session?: AutoPunchSession;
  error?: string;
}

export class AutoPunchService {
  /**
   * Environment detection
   */
  public isNativePlatform(): boolean {
    if (typeof window === 'undefined') return false;
    const win = window as any;
    return !!(
      win.Capacitor?.isNativePlatform?.() ||
      win.AndroidGeofenceBridge ||
      win.webkit?.messageHandlers?.iOSGeofenceBridge
    );
  }

  public isPwaStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
  }

  /**
   * iOS 20-region manager (Top Edge Case 3)
   * CoreLocation CLCircularRegion limits concurrent monitored regions to 20.
   * Prioritizes: 1. Scheduled site, 2. Up to 19 most recently visited / nearby sites.
   * Overflow sites fall back to foreground polling.
   */
  public getManagedGeofenceRegions(
    sites: Branch[],
    scheduledSiteId?: string,
    recentlyVisitedSiteIds: string[] = []
  ): {
    monitoredRegions: Branch[];
    overflowRegions: Branch[];
    requiresForegroundPollingForOverflow: boolean;
    iosRegionLimitReached: boolean;
  } {
    if (!sites || sites.length === 0) {
      return {
        monitoredRegions: [],
        overflowRegions: [],
        requiresForegroundPollingForOverflow: false,
        iosRegionLimitReached: false,
      };
    }

    // Filter sites that have valid coordinates
    const validSites = sites.filter(s => s.location && s.location.lat && s.location.lng);

    // Sort to prioritize scheduled site first, then recently visited, then remainder
    const sorted = [...validSites].sort((a, b) => {
      if (a.id === scheduledSiteId) return -1;
      if (b.id === scheduledSiteId) return 1;

      const aRecentIndex = recentlyVisitedSiteIds.indexOf(a.id);
      const bRecentIndex = recentlyVisitedSiteIds.indexOf(b.id);

      if (aRecentIndex !== -1 && bRecentIndex !== -1) return aRecentIndex - bRecentIndex;
      if (aRecentIndex !== -1) return -1;
      if (bRecentIndex !== -1) return 1;

      return a.name.localeCompare(b.name);
    });

    const monitoredRegions = sorted.slice(0, 20);
    const overflowRegions = sorted.slice(20);

    return {
      monitoredRegions,
      overflowRegions,
      requiresForegroundPollingForOverflow: overflowRegions.length > 0,
      iosRegionLimitReached: validSites.length > 20,
    };
  }

  /**
   * Check if tenant plan allows Geofence Auto-Punch (E16-S3: Disabled on Free/Starter, enabled on Growth/Pro/Enterprise)
   */
  public async isAutoPunchEntitled(tenantId: string): Promise<boolean> {
    try {
      const entitlements = await entitlementService.getTenantEntitlements(tenantId);
      return !!entitlements?.resolutions?.['GEOFENCE_AUTO_PUNCH']?.enabled;
    } catch {
      // Default fallback
      return false;
    }
  }

  /**
   * Permission revocation handling (Key AC 8)
   * If location permission is revoked after binding, auto-punch silently stops,
   * notifies worker + supervisor ONCE via E3 Inbox, and degrades to manual punch.
   */
  public async handlePermissionRevoked(
    tenantId: string,
    worker: Worker,
    supervisorId?: string
  ): Promise<void> {
    const noticeKey = `${PERM_REVOKED_NOTICE_KEY}_${worker.id}`;
    if (localStorage.getItem(noticeKey)) {
      // Already notified once, never nag repeatedly
      return;
    }

    localStorage.setItem(noticeKey, new Date().toISOString());

    try {
      await inboxService.createCustomItem(tenantId, {
        id: `inbox-perm-revoked-${worker.id}-${Date.now()}`,
        tenantId,
        actionType: 'ATTENDANCE_EXCEPTION',
        urgency: 'NORMAL',
        status: 'PENDING',
        workerId: worker.id,
        workerName: worker.name,
        workerPhone: worker.phone,
        workerDesignation: worker.designation,
        workerPhotoUrl: worker.photoUrl,
        title: 'Location Permission Revoked (Auto-Punch Suspended)',
        description: `${worker.name} revoked location permission after binding their phone. Auto-punch has been silently stopped and degraded to manual punch.`,
        timestamp: new Date().toISOString(),
        details: {
          reason: 'Location permission disabled in browser/device settings. Silently degraded to manual punch.',
          workerId: worker.id
        } as any
      });
    } catch (e) {
      console.warn('Failed to log permission revocation notice to supervisor:', e);
    }
  }

  /**
   * Reset permission revocation notification flag when permission is re-granted
   */
  public resetPermissionRevokedFlag(workerId: string): void {
    localStorage.removeItem(`${PERM_REVOKED_NOTICE_KEY}_${workerId}`);
  }

  /**
   * Calculate distance and geofence evaluation for all active sites
   */
  public evaluateSites(
    coords: { lat: number; lng: number; accuracy: number },
    sites: Branch[],
    defaultSiteLocation?: { lat: number; lng: number; radius: number; address?: string }
  ): SiteDistanceInfo[] {
    const list: Branch[] = [...sites];

    // If no branch defined, fallback to default base location
    if (list.length === 0 && defaultSiteLocation) {
      list.push({
        id: 'base_site',
        name: defaultSiteLocation.address || 'Main Worksite',
        location: defaultSiteLocation,
        autoPunchEnabled: true,
        dwellTimeMinutes: 2,
        enterRadius: defaultSiteLocation.radius || 100,
        exitRadius: Math.round((defaultSiteLocation.radius || 100) * 1.15)
      });
    }

    return list.map(site => {
      const loc = site.location || { lat: 28.5355, lng: 77.3910, radius: 100 };
      const dist = geoUtils.getDistanceInMeters(coords.lat, coords.lng, loc.lat, loc.lng);
      
      const enterRadius = site.enterRadius || loc.radius || 100;
      // Hysteresis buffer: exit radius is enterRadius * 1.15 (at least +15m)
      const exitRadius = site.exitRadius || Math.max(enterRadius + 15, Math.round(enterRadius * 1.15));

      return {
        siteId: site.id,
        siteName: site.name,
        distanceMeters: dist,
        radius: loc.radius || 100,
        enterRadius,
        exitRadius,
        isInsideEnter: dist <= enterRadius,
        isInsideExit: dist <= exitRadius,
        address: loc.address,
        autoPunchEnabled: site.autoPunchEnabled !== false,
        dwellTimeMinutes: site.dwellTimeMinutes || 2
      };
    });
  }

  /**
   * Resolves disambiguation choice or picks the nearest site (Top Edge Case 2: Overlapping Fences)
   */
  public resolveTargetSite(
    sitesEvaluated: SiteDistanceInfo[],
    gpsAccuracy: number,
    workerId: string
  ): {
    selectedSite?: SiteDistanceInfo;
    requiresDisambiguation: boolean;
    overlappingCandidates: SiteDistanceInfo[];
  } {
    // Only consider sites where auto-punch is enabled
    const activeSites = sitesEvaluated.filter(s => s.autoPunchEnabled);
    if (activeSites.length === 0) {
      return { requiresDisambiguation: false, overlappingCandidates: [] };
    }

    // Find sites where worker is inside the enter boundary or within accuracy radius of it
    const insideOrNear = activeSites.filter(s => 
      s.isInsideEnter || (s.distanceMeters - s.enterRadius <= Math.max(10, gpsAccuracy))
    );

    if (insideOrNear.length === 0) {
      // Find nearest site overall
      const sorted = [...activeSites].sort((a, b) => a.distanceMeters - b.distanceMeters);
      return { selectedSite: sorted[0], requiresDisambiguation: false, overlappingCandidates: [] };
    }

    if (insideOrNear.length === 1) {
      return { selectedSite: insideOrNear[0], requiresDisambiguation: false, overlappingCandidates: [] };
    }

    // Multiple sites within boundary or accuracy range: check if worker previously selected one
    const cachedChoice = this.getDisambiguationChoice(workerId);
    if (cachedChoice) {
      const match = insideOrNear.find(s => s.siteId === cachedChoice.selectedSiteId);
      if (match) {
        return { selectedSite: match, requiresDisambiguation: false, overlappingCandidates: [] };
      }
    }

    // Check if one site is substantially closer than the other beyond the GPS accuracy buffer
    const sorted = [...insideOrNear].sort((a, b) => a.distanceMeters - b.distanceMeters);
    const closest = sorted[0];
    const secondClosest = sorted[1];

    if (secondClosest.distanceMeters - closest.distanceMeters > Math.max(20, gpsAccuracy * 1.5)) {
      return { selectedSite: closest, requiresDisambiguation: false, overlappingCandidates: [] };
    }

    // Truly overlapping within GPS accuracy -> worker disambiguation required
    return {
      requiresDisambiguation: true,
      overlappingCandidates: sorted
    };
  }

  public saveDisambiguationChoice(choice: DisambiguationChoice): void {
    try {
      const existing = this.getAllDisambiguationChoices();
      existing[choice.workerId] = choice;
      localStorage.setItem(DISAMBIGUATION_CHOICE_KEY, JSON.stringify(existing));
    } catch {}
  }

  public getDisambiguationChoice(workerId: string): DisambiguationChoice | null {
    try {
      const raw = localStorage.getItem(DISAMBIGUATION_CHOICE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const item = parsed[workerId];
        // Expire choice after 4 hours
        if (item && Date.now() - new Date(item.timestamp).getTime() < 4 * 3600 * 1000) {
          return item;
        }
      }
    } catch {}
    return null;
  }

  private getAllDisambiguationChoices(): Record<string, DisambiguationChoice> {
    try {
      const raw = localStorage.getItem(DISAMBIGUATION_CHOICE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  }

  /**
   * Tracks dwell timing and hysteresis state machine per site
   */
  public updateDwellState(
    site: SiteDistanceInfo,
    workerId: string
  ): {
    dwellQualified: boolean;
    isInside: boolean;
    dwellSecondsRemaining: number;
    dwellProgressPct: number;
    dwellMinutesRequired: number;
  } {
    const states = this.getAllDwellStates(workerId);
    let state = states[site.siteId] || { siteId: site.siteId };

    const now = Date.now();
    const requiredDwellMs = (site.dwellTimeMinutes || 2) * 60 * 1000;

    // Hysteresis boundary evaluation:
    // To enter: must cross enterRadius
    // To exit: must cross exitRadius (where exitRadius > enterRadius)
    let isCurrentlyInside = false;
    if (state.lastConfirmedStatus === 'INSIDE') {
      // Worker is currently inside; remains inside until crossing exitRadius
      isCurrentlyInside = site.isInsideExit;
    } else {
      // Worker is outside; only enters by crossing enterRadius
      isCurrentlyInside = site.isInsideEnter;
    }

    if (isCurrentlyInside) {
      if (!state.firstEnteredAt) {
        state.firstEnteredAt = now;
      }
      state.lastInsideAt = now;
      state.firstExitedAt = undefined;
      state.lastConfirmedStatus = 'INSIDE';
    } else {
      if (!state.firstExitedAt) {
        state.firstExitedAt = now;
      }
      state.lastOutsideAt = now;
      state.firstEnteredAt = undefined;
      state.lastConfirmedStatus = 'OUTSIDE';
    }

    states[site.siteId] = state;
    this.saveDwellStates(workerId, states);

    const timeInside = state.firstEnteredAt ? now - state.firstEnteredAt : 0;
    const dwellQualified = isCurrentlyInside && timeInside >= requiredDwellMs;
    const dwellSecondsRemaining = Math.max(0, Math.ceil((requiredDwellMs - timeInside) / 1000));
    const dwellProgressPct = Math.min(100, Math.round((timeInside / requiredDwellMs) * 100));

    return {
      dwellQualified,
      isInside: isCurrentlyInside,
      dwellSecondsRemaining,
      dwellProgressPct,
      dwellMinutesRequired: site.dwellTimeMinutes || 2
    };
  }

  private getAllDwellStates(workerId: string): Record<string, SiteDwellState> {
    try {
      const raw = localStorage.getItem(`${SITE_DWELL_STATE_KEY}_${workerId}`);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  }

  private saveDwellStates(workerId: string, states: Record<string, SiteDwellState>): void {
    try {
      localStorage.setItem(`${SITE_DWELL_STATE_KEY}_${workerId}`, JSON.stringify(states));
    } catch {}
  }

  /**
   * Main evaluation pipeline for geofence transition and auto-punch triggering
   */
  public async processLocationUpdate(params: {
    tenantId: string;
    worker: Worker;
    boundDevice: BoundDevice | null;
    activeConsent: ConsentRecord | null;
    coords: {
      lat: number;
      lng: number;
      accuracy: number;
      isMock?: boolean;
    };
    sites: Branch[];
    defaultSiteLocation?: { lat: number; lng: number; radius: number; address?: string };
    todayRecord: AttendanceRecord | null;
    isOffline?: boolean;
    forcePunchType?: 'IN' | 'OUT';
  }): Promise<EvaluateLocationResult> {
    const { tenantId, worker, boundDevice, activeConsent, coords, sites, defaultSiteLocation, todayRecord } = params;

    // 1. Plan Check (Key AC 7: Disabled on Free plan; available on Growth/Pro)
    const isEntitled = await this.isAutoPunchEntitled(tenantId);
    if (!isEntitled) {
      return {
        autoPunchTriggered: false,
        discardedReason: 'Geofence Auto-Punch is gated on the Free plan. Upgrade to Pro/Enterprise for automatic clock-in.'
      };
    }

    // 2. Active DeviceBinding Check (Key AC 1 & Top Edge Case 4)
    if (!boundDevice || boundDevice.workerId !== worker.id) {
      return {
        autoPunchTriggered: false,
        error: 'Auto-punch failed — device not registered. Unbound devices cannot auto-punch.',
        discardedReason: 'DISCARDED_UNBOUND'
      };
    }

    // 3. DPDP Consent Check (Key AC 1: attendance_location granted)
    if (!activeConsent || !activeConsent.active || !activeConsent.purposes?.attendance_location) {
      return {
        autoPunchTriggered: false,
        discardedReason: 'Auto-punch disabled — location consent withdrawn or not granted.'
      };
    }

    // 4. Mock GPS Check
    if (coords.isMock) {
      return {
        autoPunchTriggered: false,
        error: 'Mock GPS location detected. Auto-punch blocked at API layer.',
        discardedReason: 'MOCK_LOCATION_BLOCKED'
      };
    }

    // 5. Evaluate Sites & Check Overlapping Fences (Top Edge Case 2)
    const evaluatedSites = this.evaluateSites(coords, sites, defaultSiteLocation);
    const { selectedSite, requiresDisambiguation, overlappingCandidates } = this.resolveTargetSite(
      evaluatedSites,
      coords.accuracy,
      worker.id
    );

    if (requiresDisambiguation) {
      return {
        requiresDisambiguation: true,
        overlappingSites: overlappingCandidates,
        discardedReason: 'Overlapping geofence boundaries detected. Disambiguation needed.'
      };
    }

    if (!selectedSite) {
      return {
        autoPunchTriggered: false,
        discardedReason: 'No auto-punch enabled site available.'
      };
    }

    // 6. Dwell & Hysteresis Evaluation (Key AC 1 & Top Edge Case 1)
    const dwell = this.updateDwellState(selectedSite, worker.id);

    // Determine target transition
    const lastPunch = todayRecord?.timeline?.[todayRecord.timeline.length - 1] || 
                     todayRecord?.punches?.[todayRecord.punches.length - 1];
    const isClockedIn = !!todayRecord?.checkIn && (!todayRecord?.checkOut || (lastPunch && lastPunch.type === 'IN'));

    let targetPunchType: 'IN' | 'OUT' = params.forcePunchType || (isClockedIn ? 'OUT' : 'IN');

    // If target is IN, worker must be INSIDE and dwell qualified
    // If target is OUT, worker must be OUTSIDE and dwell qualified
    if (targetPunchType === 'IN' && (!dwell.isInside || !dwell.dwellQualified)) {
      return {
        candidateSite: selectedSite,
        transitionType: dwell.isInside ? 'DWELL' : 'EXIT',
        autoPunchTriggered: false,
        discardedReason: dwell.isInside 
          ? `Dwelling inside ${selectedSite.siteName} (${dwell.dwellSecondsRemaining}s remaining)`
          : `Outside site enter boundary (${selectedSite.distanceMeters}m from ${selectedSite.siteName})`
      };
    }

    if (targetPunchType === 'OUT' && (dwell.isInside || !dwell.dwellQualified)) {
      return {
        candidateSite: selectedSite,
        transitionType: dwell.isInside ? 'DWELL' : 'EXIT',
        autoPunchTriggered: false,
        discardedReason: dwell.isInside
          ? `Still inside ${selectedSite.siteName}`
          : `Dwelling outside ${selectedSite.siteName} (${dwell.dwellSecondsRemaining}s remaining for auto-punch-out)`
      };
    }

    // 7. Manual Punch Precedence Check (Key AC 4)
    // Never overrides a manual punch — if worker punched manually within the dwell window, auto-punch is discarded
    const now = Date.now();
    const dwellMs = (selectedSite.dwellTimeMinutes || 2) * 60 * 1000;
    
    if (lastPunch) {
      const lastPunchTime = new Date(lastPunch.timestamp).getTime();
      const timeSinceLastPunch = now - lastPunchTime;

      // If last punch was manual and within the dwell window, discard auto-punch
      if (!lastPunch.isAutoPunch && timeSinceLastPunch <= dwellMs) {
        this.logGeofenceEvent({
          tenantId,
          workerId: worker.id,
          workerName: worker.name,
          siteId: selectedSite.siteId,
          siteName: selectedSite.siteName,
          type: 'DWELL',
          timestamp: new Date().toISOString(),
          location: { lat: coords.lat, lng: coords.lng },
          accuracy: coords.accuracy,
          shiftId: worker.shiftId,
          actionTaken: 'DISCARDED_MANUAL_PUNCH_EXISTS',
          details: `Manual punch occurred ${Math.round(timeSinceLastPunch / 1000)}s ago (within dwell window of ${selectedSite.dwellTimeMinutes}m). Auto-punch discarded.`
        });

        return {
          candidateSite: selectedSite,
          autoPunchTriggered: false,
          discardedReason: 'Discarded: Worker already recorded a manual punch within the dwell window.'
        };
      }
    }

    // 8. Shift Re-entry Check (Key AC 6)
    // Re-entry to same fence within shift creates GeofenceEvent only — not a second punch
    if (targetPunchType === 'IN' && isClockedIn) {
      this.logGeofenceEvent({
        tenantId,
        workerId: worker.id,
        workerName: worker.name,
        siteId: selectedSite.siteId,
        siteName: selectedSite.siteName,
        type: 'RE_ENTRY',
        timestamp: new Date().toISOString(),
        location: { lat: coords.lat, lng: coords.lng },
        accuracy: coords.accuracy,
        shiftId: worker.shiftId,
        actionTaken: 'RE_ENTRY_LOGGED',
        details: `Worker re-entered geofence ${selectedSite.siteName} during active shift. Recorded as breadcrumb event; duplicate punch suppressed.`
      });

      return {
        candidateSite: selectedSite,
        transitionType: 'RE_ENTRY',
        autoPunchTriggered: false,
        discardedReason: `Re-entry to ${selectedSite.siteName} within active shift recorded as breadcrumb event (duplicate punch suppressed).`
      };
    }

    // Check if an active provisional auto-punch session is already running
    const activeSession = this.getActiveAutoPunchSession(worker.id);
    if (activeSession && activeSession.status === 'PENDING_UNDO') {
      return {
        candidateSite: selectedSite,
        autoPunchTriggered: false,
        session: activeSession,
        discardedReason: 'Provisional auto-punch already awaiting 5-minute undo window.'
      };
    }

    // 9. Execute Provisional Auto-Punch (Key AC 3, 5, 9)
    const session = await this.triggerAutoPunch({
      tenantId,
      worker,
      boundDevice,
      site: selectedSite,
      coords,
      punchType: targetPunchType,
      isOffline: !!params.isOffline
    });

    return {
      autoPunchTriggered: true,
      candidateSite: selectedSite,
      session,
      transitionType: targetPunchType === 'IN' ? 'ENTER' : 'EXIT'
    };
  }

  /**
   * Triggers the provisional auto-punch with 5-minute undo window
   */
  public async triggerAutoPunch(params: {
    tenantId: string;
    worker: Worker;
    boundDevice: BoundDevice;
    site: SiteDistanceInfo;
    coords: { lat: number; lng: number; accuracy: number };
    punchType: 'IN' | 'OUT';
    isOffline: boolean;
  }): Promise<AutoPunchSession> {
    const { tenantId, worker, boundDevice, site, coords, punchType, isOffline } = params;
    const now = new Date();
    const serverTimestamp = now.toISOString();
    const punchId = `autopunch_${worker.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const undoExpiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // 5-minute window

    // 1. Create Punch Record marked as AUTO_PUNCH with trustScore 0.70
    const punchEntry: Punch = {
      punchId,
      timestamp: serverTimestamp,
      deviceTimestamp: serverTimestamp,
      serverTimestamp,
      type: punchType,
      device: boundDevice.deviceModel || 'Mobile Device (Auto-Punch)',
      location: { lat: coords.lat, lng: coords.lng },
      accuracy: coords.accuracy,
      siteName: site.siteName,
      deviceBindingId: boundDevice.id,
      mockLocationFlag: false,
      rootedJailbrokenFlag: false,
      batteryLevel: 90,
      batteryCharging: false,
      selfieUrl: undefined,
      livenessVerified: false,
      selfieVerificationStatus: 'VERIFIED',
      syncStatus: isOffline ? 'PENDING_LOCAL' : 'SYNCED',
      // Auto-Punch specific attributes
      method: 'AUTO_PUNCH',
      isAutoPunch: true,
      isProvisional: true,
      undoExpiresAt,
      trustScore: 0.70 // Lower-trust score in E9 review since no selfie
    };

    // 2. Persist to today's AttendanceRecord
    const today = serverTimestamp.slice(0, 10);
    const todayRecords = await dbService.getTodayAttendance(tenantId).catch(() => []);
    let todayRecord = todayRecords.find(a => a.workerId === worker.id && (a.date || '').slice(0, 10) === today);

    let recordId: string;

    if (todayRecord) {
      recordId = todayRecord.id;
      if (punchType === 'IN') {
        todayRecord.checkIn = todayRecord.checkIn || serverTimestamp;
        todayRecord.status = 'PRESENT';
      } else {
        todayRecord.checkOut = serverTimestamp;
      }
      todayRecord.punches = todayRecord.punches || [];
      todayRecord.punches.push(punchEntry);
      todayRecord.timeline = todayRecord.timeline || [];
      todayRecord.timeline.push(punchEntry);
      todayRecord.confidence = 0.70;
      await dbService.markAttendance(todayRecord);
    } else {
      recordId = `${tenantId}_${worker.id}_${today}`;
      const newRecord: AttendanceRecord = {
        id: recordId,
        tenantId,
        workerId: worker.id,
        workerName: worker.name,
        date: today,
        shiftId: worker.shiftId || 'default',
        timeline: [punchEntry],
        lateStatus: { isLate: false, lateByMins: 0, penaltyApplied: false },
        status: punchType === 'IN' ? 'PRESENT' : 'HALF_DAY',
        checkIn: punchType === 'IN' ? serverTimestamp : undefined,
        checkOut: punchType === 'OUT' ? serverTimestamp : undefined,
        hours: { gross: 0, net: 0, regular: 0, overtime: 0, breakTime: 0 },
        punches: [punchEntry],
        syncStatus: isOffline ? 'PENDING_LOCAL' : 'SYNCED',
        confidence: 0.70
      };
      await dbService.markAttendance(newRecord);
    }

    if (isOffline) {
      await syncService.enqueueRecord(
        'ATTENDANCE',
        recordId,
        tenantId,
        worker.id,
        worker.name,
        todayRecord || punchEntry
      );
    }

    // 3. Register Session
    const session: AutoPunchSession = {
      id: `session_${punchId}`,
      punchId,
      workerId: worker.id,
      workerName: worker.name,
      tenantId,
      siteId: site.siteId,
      siteName: site.siteName,
      punchType,
      triggeredAt: serverTimestamp,
      undoExpiresAt,
      status: 'PENDING_UNDO',
      recordId,
      location: { lat: coords.lat, lng: coords.lng },
      accuracy: coords.accuracy,
      mockFlag: false,
      deviceBindingId: boundDevice.id,
      isOffline,
      trustScore: 0.70
    };

    this.saveAutoPunchSession(session);

    // 4. Send System Notification (Actionable with Undo)
    this.sendNotification(
      `Auto punched ${punchType.toLowerCase()} at ${site.siteName} at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — Undo`,
      session
    );

    // 5. Log E9 Anomaly / Supervisor Inbox audit
    try {
      await inboxService.createCustomItem(tenantId, {
        id: `inbox-autopunch-${punchId}`,
        tenantId,
        actionType: 'ATTENDANCE_EXCEPTION',
        urgency: 'NORMAL',
        status: 'PENDING',
        workerId: worker.id,
        workerName: worker.name,
        workerPhone: worker.phone,
        workerDesignation: worker.designation,
        workerPhotoUrl: worker.photoUrl,
        title: `Auto-Punch ${punchType} Recorded (Trust Score: 70%)`,
        description: `${worker.name} was automatically clocked ${punchType} upon arrival at ${site.siteName} (2-min dwell verified). Provisional 5-minute undo window active.`,
        timestamp: serverTimestamp,
        details: {
          punchType,
          siteName: site.siteName,
          accuracy: coords.accuracy,
          trustScore: 0.70,
          method: 'AUTO_PUNCH',
          undoExpiresAt,
          reason: 'Geofence auto-punch arrival'
        } as any
      });
    } catch (e) {
      console.warn('Failed to log auto-punch to E9 inbox:', e);
    }

    // 6. Log GeofenceEvent
    this.logGeofenceEvent({
      tenantId,
      workerId: worker.id,
      workerName: worker.name,
      siteId: site.siteId,
      siteName: site.siteName,
      type: punchType === 'IN' ? 'ENTER' : 'EXIT',
      timestamp: serverTimestamp,
      location: { lat: coords.lat, lng: coords.lng },
      accuracy: coords.accuracy,
      shiftId: worker.shiftId,
      actionTaken: 'AUTO_PUNCH_TRIGGERED',
      details: `Auto-punch ${punchType} initiated at ${site.siteName}. 5-minute undo window started.`
    });

    return session;
  }

  /**
   * Undo Auto-Punch (Key AC 5)
   * Reverts provisional punch within the 5-minute window
   */
  public async undoAutoPunch(sessionId: string): Promise<{ success: boolean; message: string }> {
    const session = this.getAutoPunchSession(sessionId);
    if (!session) {
      return { success: false, message: 'Auto-punch session not found.' };
    }

    if (session.status === 'FINALIZED') {
      return { success: false, message: '5-minute undo window has already expired.' };
    }

    if (session.status === 'UNDONE') {
      return { success: true, message: 'Auto-punch has already been undone.' };
    }

    // Mark session as UNDONE
    session.status = 'UNDONE';
    this.saveAutoPunchSession(session);

    // Revert punch in database
    try {
      const todayRecords = await dbService.getTodayAttendance(session.tenantId).catch(() => []);
      const record = todayRecords.find(r => r.id === session.recordId || r.workerId === session.workerId);

      if (record) {
        // Remove the provisional punch
        record.punches = (record.punches || []).filter(p => p.punchId !== session.punchId);
        record.timeline = (record.timeline || []).filter(p => p.punchId !== session.punchId);

        // Adjust checkIn / checkOut if needed
        if (session.punchType === 'IN' && record.checkIn === session.triggeredAt) {
          record.checkIn = undefined;
          record.status = 'ABSENT';
        } else if (session.punchType === 'OUT' && record.checkOut === session.triggeredAt) {
          record.checkOut = undefined;
        }

        await dbService.markAttendance(record);
      }

      // Log to Supervisor E3 Inbox
      await inboxService.createCustomItem(session.tenantId, {
        id: `inbox-undo-${session.punchId}`,
        tenantId: session.tenantId,
        actionType: 'ATTENDANCE_EXCEPTION',
        urgency: 'NORMAL',
        status: 'RESOLVED',
        workerId: session.workerId,
        workerName: session.workerName,
        title: `Auto-Punch ${session.punchType} Undone by Worker`,
        description: `${session.workerName} cancelled their automatic clock-${session.punchType.toLowerCase()} at ${session.siteName} within the 5-minute grace window.`,
        timestamp: new Date().toISOString(),
        details: {
          punchId: session.punchId,
          siteName: session.siteName,
          reason: 'Worker tapped Undo within 5-minute grace window'
        } as any
      });
    } catch (e) {
      console.warn('Error reverting undone punch in database:', e);
    }

    return {
      success: true,
      message: `Auto-punch ${session.punchType.toLowerCase()} at ${session.siteName} was cancelled successfully.`
    };
  }

  /**
   * Finalize Auto-Punch after 5-minute undo window expires
   */
  public async finalizeAutoPunch(sessionId: string): Promise<void> {
    const session = this.getAutoPunchSession(sessionId);
    if (!session || session.status !== 'PENDING_UNDO') return;

    session.status = 'FINALIZED';
    this.saveAutoPunchSession(session);

    // Update attendance record isProvisional flag to false
    try {
      const todayRecords = await dbService.getTodayAttendance(session.tenantId).catch(() => []);
      const record = todayRecords.find(r => r.id === session.recordId || r.workerId === session.workerId);
      if (record) {
        if (record.punches) {
          const punch = record.punches.find(p => p.punchId === session.punchId);
          if (punch) punch.isProvisional = false;
        }
        if (record.timeline) {
          const punch = record.timeline.find(p => p.punchId === session.punchId);
          if (punch) punch.isProvisional = false;
        }
        await dbService.markAttendance(record);
      }
    } catch (e) {
      console.warn('Error finalizing punch in DB:', e);
    }
  }

  /**
   * Browser / Mobile Notification helper
   */
  private sendNotification(body: string, session: AutoPunchSession): void {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      try {
        const notif = new Notification('WorkForce Pro Auto-Punch', {
          body,
          icon: '/assets/icon.png',
          tag: `autopunch_${session.id}`,
          data: { sessionId: session.id }
        });

        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      } catch (e) {
        console.warn('System notification display error:', e);
      }
    }
  }

  /**
   * Storage helpers for AutoPunchSession
   */
  public saveAutoPunchSession(session: AutoPunchSession): void {
    try {
      const sessions = this.getAllAutoPunchSessions();
      sessions[session.id] = session;
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    } catch {}
  }

  public getAutoPunchSession(sessionId: string): AutoPunchSession | null {
    const sessions = this.getAllAutoPunchSessions();
    return sessions[sessionId] || null;
  }

  public getActiveAutoPunchSession(workerId: string): AutoPunchSession | null {
    const sessions = Object.values(this.getAllAutoPunchSessions());
    const now = Date.now();
    // Return latest pending session within 5-min window
    const active = sessions.filter(s => 
      s.workerId === workerId && 
      s.status === 'PENDING_UNDO' &&
      new Date(s.undoExpiresAt).getTime() > now
    );
    if (active.length > 0) {
      return active[active.length - 1];
    }
    return null;
  }

  public getAllAutoPunchSessions(): Record<string, AutoPunchSession> {
    try {
      const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  }

  /**
   * Breadcrumb & GeofenceEvent Logger
   */
  public logGeofenceEvent(event: Omit<GeofenceEvent, 'id'>): GeofenceEvent {
    const fullEvent: GeofenceEvent = {
      ...event,
      id: `geo_evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    };

    try {
      const raw = localStorage.getItem(EVENTS_STORAGE_KEY);
      const list: GeofenceEvent[] = raw ? JSON.parse(raw) : [];
      list.unshift(fullEvent);
      // Keep last 200 events
      localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(list.slice(0, 200)));
    } catch {}

    return fullEvent;
  }

  public getGeofenceEvents(workerId?: string): GeofenceEvent[] {
    try {
      const raw = localStorage.getItem(EVENTS_STORAGE_KEY);
      if (raw) {
        const list: GeofenceEvent[] = JSON.parse(raw);
        if (workerId) {
          return list.filter(e => e.workerId === workerId);
        }
        return list;
      }
    } catch {}
    return [];
  }
}

export const autoPunchService = new AutoPunchService();
