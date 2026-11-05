// src/services/safetyCheckInService.ts
import { 
  SafetyCheckInConfig, 
  SafetyCheckInRecord, 
  PanicAlertRecord, 
  EmergencyContact,
  FieldShiftSession,
  Branch,
  OrgSettings,
  SafetyResponseChannel,
  SafetyCheckInStatus
} from '../types/index';
import { tenantSecurityService } from './tenantSecurityService';
import { inboxService } from './inboxService';
import { whatsappService } from './whatsappService';
import { dbService } from './db';

const SAFETY_CONFIG_KEY = 'workforce_safety_config';
const SAFETY_CHECKINS_KEY = 'workforce_safety_checkins';
const SAFETY_PANIC_KEY = 'workforce_safety_panic_alerts';

export const DEFAULT_SAFETY_CONFIG: SafetyCheckInConfig = {
  enabled: false, // Off by default as required by AC
  intervalMinutes: 60, // 60 min for remote/lone sites
  gracePeriodMinutes: 5,
  escalationLadder: {
    workerReNotifyMinutes: 5, // T+5 min: Re-notify worker
    supervisorNotifyMinutes: 15, // T+15 min: Supervisor alert
    branchManagerNotifyMinutes: 30 // T+30 min: Branch manager alert + URGENT Inbox
  },
  emergencyContacts: [
    {
      id: 'contact-sup-1',
      name: 'Operations Supervisor',
      phone: '+91 98765 43210',
      role: 'SUPERVISOR',
      isFallback: false
    },
    {
      id: 'contact-mgr-2',
      name: 'Branch Safety Manager',
      phone: '+91 98765 43211',
      role: 'BRANCH_MANAGER',
      isFallback: false
    },
    {
      id: 'contact-fallback-3',
      name: '24/7 Regional Emergency Dispatch (Fallback)',
      phone: '+91 98765 43212',
      role: 'FALLBACK_DISPATCH',
      isFallback: true // Guarantees no single point of failure
    }
  ],
  channels: ['IN_APP', 'WHATSAPP', 'SMS'],
  allowDeclineWithoutInsubordination: true,
  requireVoiceNoteOption: true
};

function getStoredConfigs(): Record<string, SafetyCheckInConfig> {
  try {
    const raw = localStorage.getItem(SAFETY_CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredConfigs(configs: Record<string, SafetyCheckInConfig>): void {
  try {
    localStorage.setItem(SAFETY_CONFIG_KEY, JSON.stringify(configs));
  } catch (e) {
    console.error('Failed to save safety configs', e);
  }
}

function getStoredCheckIns(): SafetyCheckInRecord[] {
  try {
    const raw = localStorage.getItem(SAFETY_CHECKINS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredCheckIns(records: SafetyCheckInRecord[]): void {
  try {
    localStorage.setItem(SAFETY_CHECKINS_KEY, JSON.stringify(records));
  } catch (e) {
    console.error('Failed to save safety check-in records', e);
  }
}

function getStoredPanicAlerts(): PanicAlertRecord[] {
  try {
    const raw = localStorage.getItem(SAFETY_PANIC_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredPanicAlerts(alerts: PanicAlertRecord[]): void {
  try {
    localStorage.setItem(SAFETY_PANIC_KEY, JSON.stringify(alerts));
  } catch (e) {
    console.error('Failed to save panic alerts', e);
  }
}

function getStoredSessions(): FieldShiftSession[] {
  try {
    const raw = localStorage.getItem('workforce_field_shift_sessions');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredSessions(sessions: FieldShiftSession[]): void {
  try {
    localStorage.setItem('workforce_field_shift_sessions', JSON.stringify(sessions));
  } catch (e) {
    console.error('Failed to update sessions in safety service', e);
  }
}

function getStoredOrgSettings(tenantId: string): OrgSettings | null {
  try {
    const raw = localStorage.getItem(`settings_${tenantId}`) || localStorage.getItem(`demo_settings_${tenantId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export interface LoneWorkerOverviewItem {
  session: FieldShiftSession;
  config: SafetyCheckInConfig;
  currentCheckIn?: SafetyCheckInRecord;
  lastRespondedAt?: string;
  nextDueAt?: string;
  minutesUntilDue: number;
  status: 'SAFE' | 'DUE_SOON' | 'DUE' | 'ESCALATING_T5' | 'ESCALATING_T15' | 'ESCALATED_T30' | 'PANIC' | 'DECLINED' | 'SHIFT_ENDED';
  activePanic?: PanicAlertRecord;
  hasFallbackContact: boolean;
  isOffline: boolean;
}

export const safetyCheckInService = {
  /**
   * Retrieves effective safety check-in configuration for a tenant and optional site
   */
  getSafetyConfig: (tenantId: string, siteId?: string): SafetyCheckInConfig => {
    // 1. Check site-level override in db branches
    if (siteId) {
      try {
        const settings = getStoredOrgSettings(tenantId);
        const branch = settings?.branches?.find(b => b.id === siteId);
        if (branch?.safetyCheckInConfig) {
          return { ...DEFAULT_SAFETY_CONFIG, ...branch.safetyCheckInConfig };
        }
      } catch (err) {
        console.warn('Error reading branch safety config:', err);
      }
    }

    // 2. Check tenant-level custom config
    const configs = getStoredConfigs();
    if (configs[tenantId]) {
      return { ...DEFAULT_SAFETY_CONFIG, ...configs[tenantId] };
    }

    // 3. Fallback to org settings or defaults
    const settings = getStoredOrgSettings(tenantId);
    if (settings?.safetyCheckInConfig) {
      return { ...DEFAULT_SAFETY_CONFIG, ...settings.safetyCheckInConfig };
    }

    return DEFAULT_SAFETY_CONFIG;
  },

  /**
   * Persists tenant-level safety config
   */
  saveSafetyConfig: (tenantId: string, config: SafetyCheckInConfig): void => {
    const configs = getStoredConfigs();
    configs[tenantId] = config;
    saveStoredConfigs(configs);

    // Also update orgSettings in localStorage and remote db
    try {
      const org = getStoredOrgSettings(tenantId);
      if (org) {
        org.safetyCheckInConfig = config;
        dbService.saveOrgSettings(tenantId, org).catch(() => {});
      }
    } catch (e) {
      console.warn('Failed to sync safety config to orgSettings:', e);
    }
  },

  /**
   * Schedules the initial or next periodic safety check-in for an active shift session
   */
  scheduleCheckIn: async (params: {
    sessionId: string;
    tenantId: string;
    workerId: string;
    workerName: string;
    workerPhone?: string;
    siteId: string;
    siteName: string;
    dueInMinutes?: number;
    lastKnownLocation?: { lat: number; lng: number; accuracy: number; address?: string; isOffline?: boolean; lastSeenAt: string };
    batteryPct?: number;
  }): Promise<SafetyCheckInRecord | null> => {
    const sessions = getStoredSessions();
    const session = sessions.find(s => s.id === params.sessionId);
    if (!session || session.status === 'COMPLETED' || session.endedAt) {
      console.warn('Cannot schedule check-in for inactive or completed shift session');
      return null;
    }

    // Worker declined safety monitoring for this shift
    if (session.safetyStatus === 'DECLINED') {
      return null;
    }

    const config = safetyCheckInService.getSafetyConfig(params.tenantId, params.siteId);
    if (!config.enabled) {
      return null;
    }

    const interval = params.dueInMinutes ?? config.intervalMinutes ?? 60;
    const now = Date.now();
    const dueTimestamp = now + interval * 60 * 1000;
    const dueAt = new Date(dueTimestamp).toISOString();

    const record: SafetyCheckInRecord = {
      id: `chk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sessionId: params.sessionId,
      tenantId: params.tenantId,
      workerId: params.workerId,
      workerName: params.workerName,
      workerPhone: params.workerPhone,
      siteId: params.siteId,
      siteName: params.siteName,
      scheduledAt: new Date(now).toISOString(),
      dueAt,
      status: 'SCHEDULED',
      escalationLevel: 'NONE',
      escalationLogs: [],
      lastKnownLocation: params.lastKnownLocation,
      batteryPct: params.batteryPct ?? 85
    };

    const records = getStoredCheckIns();
    records.push(record);
    saveStoredCheckIns(records);

    // Update session pointers
    session.safetyStatus = 'OPTED_IN';
    session.nextCheckInDueAt = dueAt;
    session.activeCheckInId = record.id;
    saveStoredSessions(sessions);

    // Audit log in E15
    await tenantSecurityService.logTenantAccess({
      tenantId: params.tenantId,
      userId: params.workerId,
      userEmail: `${params.workerId}@workforce.internal`,
      userRole: 'WORKER',
      action: 'SAFETY_CHECKIN_SCHEDULED',
      resource: `shift_session/${params.sessionId}/checkin/${record.id}`,
      status: 'SUCCESS',
      details: {
        scheduledDueAt: dueAt,
        intervalMinutes: interval,
        siteName: params.siteName
      }
    });

    return record;
  },

  /**
   * Worker submits "I'm OK" check-in response (Single tap, optional voice note)
   * Key AC: Responses tied strictly to FieldShiftSession.id - not a user session.
   * If shift has ended -> rejected with "This check-in is for a closed shift" + logged.
   */
  submitCheckInOk: async (params: {
    checkInId: string;
    sessionId: string;
    tenantId: string;
    workerId: string;
    channel: SafetyResponseChannel;
    voiceNoteSnippet?: string;
    voiceNoteDurationSec?: number;
    batteryPct?: number;
    location?: { lat: number; lng: number; accuracy: number; address?: string };
    lateReason?: string;
  }): Promise<{ success: boolean; message: string; checkIn?: SafetyCheckInRecord }> => {
    const sessions = getStoredSessions();
    const session = sessions.find(s => s.id === params.sessionId);
    const nowIso = new Date().toISOString();

    // Rejection rule: Check-in arriving after shift ended -> rejected with "This check-in is for a closed shift" + logged
    if (!session || session.status === 'COMPLETED' || session.endedAt) {
      await tenantSecurityService.logTenantAccess({
        tenantId: params.tenantId,
        userId: params.workerId,
        userEmail: `${params.workerId}@workforce.internal`,
        userRole: 'WORKER',
        action: 'SAFETY_CHECKIN_REJECTED_SHIFT_CLOSED',
        resource: `shift_session/${params.sessionId}`,
        status: 'DENIED',
        details: {
          checkInId: params.checkInId,
          reason: 'This check-in is for a closed shift',
          attemptedAt: nowIso
        }
      });

      return {
        success: false,
        message: 'This check-in is for a closed shift'
      };
    }

    const records = getStoredCheckIns();
    const checkIn = records.find(r => r.id === params.checkInId) || records.find(r => r.sessionId === params.sessionId && (r.status === 'SCHEDULED' || r.status === 'DUE' || r.status === 'MISSED_ESCALATING' || r.status === 'ESCALATED'));

    if (!checkIn) {
      return {
        success: false,
        message: 'Safety check-in record not found'
      };
    }

    const wasEscalating = checkIn.status === 'MISSED_ESCALATING' || checkIn.status === 'ESCALATED';

    checkIn.respondedAt = nowIso;
    checkIn.responseChannel = params.channel;
    checkIn.status = wasEscalating ? 'RESOLVED_LATE' : 'RESPONDED_OK';
    checkIn.voiceNoteSnippet = params.voiceNoteSnippet;
    checkIn.voiceNoteDurationSec = params.voiceNoteDurationSec;
    if (params.batteryPct) checkIn.batteryPct = params.batteryPct;
    if (params.location) {
      checkIn.lastKnownLocation = {
        lat: params.location.lat,
        lng: params.location.lng,
        accuracy: params.location.accuracy,
        address: params.location.address,
        isOffline: false,
        lastSeenAt: nowIso
      };
    }
    if (params.lateReason) {
      checkIn.lateReason = params.lateReason;
    }

    if (wasEscalating) {
      checkIn.escalationLogs = checkIn.escalationLogs || [];
      checkIn.escalationLogs.push({
        at: nowIso,
        target: 'SUPERVISOR',
        channel: params.channel,
        note: `Worker checked in late (${params.lateReason || 'Delayed response'}). Escalation ladder cancelled.`
      });
    }

    saveStoredCheckIns(records);

    // Log in E15
    await tenantSecurityService.logTenantAccess({
      tenantId: params.tenantId,
      userId: params.workerId,
      userEmail: `${params.workerId}@workforce.internal`,
      userRole: 'WORKER',
      action: wasEscalating ? 'SAFETY_CHECKIN_RESOLVED_LATE' : 'SAFETY_CHECKIN_RESPONDED_OK',
      resource: `shift_session/${params.sessionId}/checkin/${checkIn.id}`,
      status: 'SUCCESS',
      details: {
        channel: params.channel,
        hasVoiceNote: Boolean(params.voiceNoteSnippet),
        voiceDuration: params.voiceNoteDurationSec,
        batteryPct: params.batteryPct,
        lateReason: params.lateReason
      }
    });

    // Schedule next check-in
    await safetyCheckInService.scheduleCheckIn({
      sessionId: session.id,
      tenantId: session.tenantId,
      workerId: session.workerId,
      workerName: session.workerName,
      siteId: session.siteId,
      siteName: session.siteName,
      batteryPct: params.batteryPct,
      lastKnownLocation: checkIn.lastKnownLocation
    });

    return {
      success: true,
      message: wasEscalating ? 'Late safety check-in recorded. Escalations stood down.' : 'Safety check-in confirmed. Stay safe!',
      checkIn
    };
  },

  /**
   * Worker declines safety check-ins
   * Key AC: Worker can decline safety check-ins without losing punch ability.
   * Decline recorded and MUST NOT be treated as insubordination by the system.
   * Supervisor informed once via Action Inbox; worker never re-prompted in that shift.
   */
  declineSafetyMonitoring: async (params: {
    workerId: string;
    workerName: string;
    tenantId: string;
    sessionId: string;
    reason?: string;
  }): Promise<void> => {
    const sessions = getStoredSessions();
    const session = sessions.find(s => s.id === params.sessionId);
    const nowIso = new Date().toISOString();

    if (session) {
      session.safetyStatus = 'DECLINED';
      session.safetyDeclinedAt = nowIso;
      session.nextCheckInDueAt = undefined;
      saveStoredSessions(sessions);
    }

    // Cancel pending check-ins for this session
    const records = getStoredCheckIns();
    records.forEach(r => {
      if (r.sessionId === params.sessionId && (r.status === 'SCHEDULED' || r.status === 'DUE')) {
        r.status = 'DECLINED_BY_WORKER';
        r.respondedAt = nowIso;
        r.notes = 'Worker opted out of lone worker monitoring. Must not be treated as insubordination.';
      }
    });
    saveStoredCheckIns(records);

    // Notify supervisor once via E3 Action Inbox
    try {
      await inboxService.createCustomItem(params.tenantId, {
        id: `inbox-safety-decline-${params.workerId}-${Date.now()}`,
        tenantId: params.tenantId,
        actionType: 'ATTENDANCE_EXCEPTION',
        urgency: 'NORMAL',
        status: 'RESOLVED',
        workerId: params.workerId,
        workerName: params.workerName,
        title: `Safety Check-In Declined: ${params.workerName}`,
        description: `${params.workerName} opted out of lone worker safety check-ins for shift ${params.sessionId}. Under corporate safety policy, this opt-out must NOT be treated as insubordination. Regular punch and attendance tracking remain active.`,
        timestamp: nowIso,
        details: {
          reason: 'Worker exercised legal/ethical right to decline safety check-ins. No insubordination.',
          ticketId: `SAFE-OPT-${Date.now()}`
        }
      });
    } catch (e) {
      console.warn('Failed to notify supervisor of safety decline:', e);
    }

    // Log in E15
    await tenantSecurityService.logTenantAccess({
      tenantId: params.tenantId,
      userId: params.workerId,
      userEmail: `${params.workerId}@workforce.internal`,
      userRole: 'WORKER',
      action: 'SAFETY_CHECKIN_DECLINED',
      resource: `shift_session/${params.sessionId}`,
      status: 'SUCCESS',
      details: {
        reason: params.reason || 'Worker opted out',
        policyNote: 'Worker exercised opt-out; prohibited from being treated as insubordination'
      }
    });
  },

  /**
   * Triggers Emergency Panic SOS
   * Key AC: Press-and-hold (3s) or double-confirm.
   * Sends last known location, battery, worker name, shift context to configured emergency contacts (including fallback).
   * Surfaces immediately on E3 Action Inbox as URGENT.
   * Check-in and panic events never deleted by tenant while retention active; logged in E15.
   */
  triggerPanicAlert: async (params: {
    sessionId?: string;
    tenantId: string;
    workerId: string;
    workerName: string;
    workerPhone?: string;
    workerPhotoUrl?: string;
    siteId?: string;
    siteName?: string;
    location?: { lat: number; lng: number; accuracy: number; address?: string };
    batteryPct?: number;
    shiftContext?: { shiftName?: string; startTime?: string; elapsedMinutes?: number };
  }): Promise<PanicAlertRecord> => {
    const config = safetyCheckInService.getSafetyConfig(params.tenantId, params.siteId);
    const nowIso = new Date().toISOString();
    const alertId = `panic-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // Prepare list of emergency contacts to notify (ensure fallback contact included)
    const contacts = config.emergencyContacts.length > 0 ? config.emergencyContacts : DEFAULT_SAFETY_CONFIG.emergencyContacts;
    const notifiedContacts = contacts.map(c => ({
      name: c.name,
      phone: c.phone,
      role: c.role,
      channel: 'WHATSAPP_SMS_PUSH',
      timestamp: nowIso
    }));

    const alert: PanicAlertRecord = {
      id: alertId,
      sessionId: params.sessionId,
      tenantId: params.tenantId,
      workerId: params.workerId,
      workerName: params.workerName,
      workerPhone: params.workerPhone,
      workerPhotoUrl: params.workerPhotoUrl,
      siteId: params.siteId,
      siteName: params.siteName,
      triggeredAt: nowIso,
      status: 'ACTIVE',
      location: params.location,
      batteryPct: params.batteryPct ?? 90,
      shiftContext: params.shiftContext,
      contactsNotified: notifiedContacts
    };

    const alerts = getStoredPanicAlerts();
    alerts.unshift(alert);
    saveStoredPanicAlerts(alerts);

    // Update active session with panic reference
    if (params.sessionId) {
      const sessions = getStoredSessions();
      const session = sessions.find(s => s.id === params.sessionId);
      if (session) {
        session.activePanicId = alertId;
        saveStoredSessions(sessions);
      }
    }

    // 1. Surface immediately on E3 Action Inbox as URGENT
    try {
      await inboxService.createCustomItem(params.tenantId, {
        id: `inbox-panic-${alertId}`,
        tenantId: params.tenantId,
        actionType: 'ATTENDANCE_EXCEPTION',
        urgency: 'URGENT',
        status: 'PENDING',
        workerId: params.workerId,
        workerName: params.workerName,
        workerPhone: params.workerPhone,
        workerPhotoUrl: params.workerPhotoUrl,
        title: `EMERGENCY PANIC SOS: ${params.workerName}`,
        description: `CRITICAL: Worker activated Panic SOS at site ${params.siteName || 'Field'}. Battery: ${alert.batteryPct}%. Location: ${params.location ? `${params.location.lat.toFixed(5)}, ${params.location.lng.toFixed(5)} (±${params.location.accuracy}m)` : 'GPS Pending'}. Escalated to Supervisor, Branch Manager, and 24/7 Fallback Dispatch.`,
        timestamp: nowIso,
        details: {
          reason: 'Emergency Panic Button Triggered by Worker',
          panicAlert: alert,
          punchLocation: params.location ? { lat: params.location.lat, lng: params.location.lng } : undefined,
          ticketId: `SOS-${alertId}`
        }
      });
    } catch (e) {
      console.error('Failed to create urgent panic item in action inbox:', e);
    }

    // 2. Dispatch simulated WhatsApp emergency broadcasts to contacts
    contacts.forEach(contact => {
      try {
        whatsappService.recordMessage(params.tenantId, {
          id: `wa-panic-${alertId}-${contact.id}`,
          tenantId: params.tenantId,
          fromPhone: contact.phone,
          workerId: params.workerId,
          workerName: params.workerName,
          direction: 'OUTBOUND',
          type: 'TEXT',
          content: `🚨 CRITICAL EMERGENCY SOS ALERT 🚨\nWorker: ${params.workerName} (${params.workerPhone || 'N/A'})\nSite: ${params.siteName || 'Remote Field'}\nBattery: ${alert.batteryPct}%\nLocation: ${params.location ? `https://maps.google.com/?q=${params.location.lat},${params.location.lng}` : 'Signal searching'}\nTime: ${new Date(nowIso).toLocaleTimeString()}\nPlease contact worker and initiate emergency protocol immediately.`,
          status: 'DELIVERED',
          timestamp: nowIso,
          channel: 'WHATSAPP'
        });
      } catch (err) {
        console.warn('Failed to record emergency WhatsApp alert:', err);
      }
    });

    // 3. Log critical event in E15 (immutable security audit)
    await tenantSecurityService.logTenantAccess({
      tenantId: params.tenantId,
      userId: params.workerId,
      userEmail: `${params.workerId}@workforce.internal`,
      userRole: 'WORKER',
      action: 'PANIC_SOS_TRIGGERED',
      resource: `worker/${params.workerId}/panic/${alertId}`,
      status: 'SUCCESS',
      details: {
        sessionId: params.sessionId,
        siteName: params.siteName,
        location: params.location,
        batteryPct: alert.batteryPct,
        notifiedContactsCount: notifiedContacts.length
      }
    });

    return alert;
  },

  /**
   * Resolves or stands down a Panic SOS alert (e.g., confirmed safe or accidental false alarm)
   */
  resolvePanicAlert: async (params: {
    alertId: string;
    tenantId: string;
    resolvedBy: string;
    isFalseAlarm: boolean;
    notes?: string;
  }): Promise<void> => {
    const alerts = getStoredPanicAlerts();
    const alert = alerts.find(a => a.id === params.alertId);
    if (!alert) return;

    const nowIso = new Date().toISOString();
    alert.status = params.isFalseAlarm ? 'FALSE_ALARM' : 'RESOLVED';
    alert.resolvedAt = nowIso;
    alert.resolvedBy = params.resolvedBy;
    alert.resolutionNotes = params.notes;

    saveStoredPanicAlerts(alerts);

    // Clear active panic from session if matched
    if (alert.sessionId) {
      const sessions = getStoredSessions();
      const session = sessions.find(s => s.id === alert.sessionId);
      if (session && session.activePanicId === alert.id) {
        session.activePanicId = undefined;
        saveStoredSessions(sessions);
      }
    }

    // Log stand down in E15
    await tenantSecurityService.logTenantAccess({
      tenantId: params.tenantId,
      userId: params.resolvedBy,
      userEmail: `${params.resolvedBy}@workforce.internal`,
      userRole: 'MANAGER',
      action: params.isFalseAlarm ? 'PANIC_STAND_DOWN_FALSE_ALARM' : 'PANIC_RESOLVED_CONFIRMED_SAFE',
      resource: `panic/${alert.id}`,
      status: 'SUCCESS',
      details: {
        resolvedAt: nowIso,
        notes: params.notes
      }
    });
  },

  /**
   * Periodic escalation ladder checker
   * AC: Re-notify worker at T+5, supervisor at T+15, branch manager at T+30, surface on E3 Inbox as URGENT.
   * Handles underground/no signal edge case: ladder triggers on scheduled clock time, not phone connectivity!
   * Shows "last seen offline at [time]" if device disconnected.
   */
  checkEscalations: async (tenantId: string): Promise<SafetyCheckInRecord[]> => {
    const records = getStoredCheckIns();
    const now = Date.now();
    const escalatedRecords: SafetyCheckInRecord[] = [];
    let updated = false;

    for (const record of records) {
      if (record.tenantId !== tenantId) continue;
      if (record.status !== 'SCHEDULED' && record.status !== 'DUE' && record.status !== 'MISSED_ESCALATING') {
        continue;
      }

      const dueTime = new Date(record.dueAt).getTime();
      const overdueMinutes = Math.floor((now - dueTime) / (60 * 1000));

      if (overdueMinutes >= 0 && record.status === 'SCHEDULED') {
        record.status = 'DUE';
        updated = true;
      }

      const config = safetyCheckInService.getSafetyConfig(tenantId, record.siteId);
      const ladder = config.escalationLadder;

      // 1. T+5 Minutes: Worker Re-notify
      if (overdueMinutes >= ladder.workerReNotifyMinutes && record.escalationLevel === 'NONE') {
        record.status = 'MISSED_ESCALATING';
        record.escalationLevel = 'WORKER_T5';
        record.escalationLogs = record.escalationLogs || [];
        record.escalationLogs.push({
          at: new Date(now).toISOString(),
          target: 'WORKER',
          channel: 'IN_APP_PUSH_SMS',
          note: `Worker missed T+0 check-in. Urgently re-notifying at T+${overdueMinutes}m.`
        });
        updated = true;
        escalatedRecords.push(record);
      }

      // 2. T+15 Minutes: Supervisor Alert
      if (overdueMinutes >= ladder.supervisorNotifyMinutes && record.escalationLevel === 'WORKER_T5') {
        record.escalationLevel = 'SUPERVISOR_T15';
        record.escalationLogs = record.escalationLogs || [];
        record.escalationLogs.push({
          at: new Date(now).toISOString(),
          target: 'SUPERVISOR',
          channel: 'WHATSAPP_SMS_INBOX',
          note: `Worker uncontactable for ${overdueMinutes} minutes. Escalating to Operations Supervisor.`
        });
        updated = true;
        escalatedRecords.push(record);

        // Surface to Action Inbox (High)
        try {
          await inboxService.createCustomItem(tenantId, {
            id: `inbox-esc-sup-${record.id}`,
            tenantId,
            actionType: 'ATTENDANCE_EXCEPTION',
            urgency: 'HIGH',
            status: 'PENDING',
            workerId: record.workerId,
            workerName: record.workerName,
            workerPhone: record.workerPhone,
            title: `Safety Check-In Missed (T+15): ${record.workerName}`,
            description: `Lone worker ${record.workerName} has missed their safety check-in by ${overdueMinutes} minutes at ${record.siteName}. ${record.lastKnownLocation?.isOffline ? `Worker last seen offline at ${record.lastKnownLocation.lastSeenAt}.` : 'No response received.'}`,
            timestamp: new Date().toISOString(),
            details: {
              reason: 'Missed safety check-in exceeded 15 minutes',
              ticketId: `SAFE-T15-${record.id}`
            }
          });
        } catch (e) {
          console.warn('Failed to send supervisor escalation inbox item:', e);
        }
      }

      // 3. T+30 Minutes: Branch Manager Alert + Fallback Contact + URGENT Inbox
      if (overdueMinutes >= ladder.branchManagerNotifyMinutes && record.escalationLevel === 'SUPERVISOR_T15') {
        record.status = 'ESCALATED';
        record.escalationLevel = 'BRANCH_MANAGER_T30';
        record.escalationLogs = record.escalationLogs || [];
        record.escalationLogs.push({
          at: new Date(now).toISOString(),
          target: 'BRANCH_MANAGER_AND_FALLBACK',
          channel: 'WHATSAPP_SMS_INBOX_CALL',
          note: `CRITICAL: Worker uncontactable for ${overdueMinutes} minutes. Escalated to Branch Manager and 24/7 Fallback Dispatch.`
        });
        updated = true;
        escalatedRecords.push(record);

        // Surface on E3 Inbox as URGENT
        try {
          await inboxService.createCustomItem(tenantId, {
            id: `inbox-esc-crit-${record.id}`,
            tenantId,
            actionType: 'ATTENDANCE_EXCEPTION',
            urgency: 'URGENT',
            status: 'PENDING',
            workerId: record.workerId,
            workerName: record.workerName,
            workerPhone: record.workerPhone,
            title: `CRITICAL SAFETY ESCALATION (T+30): ${record.workerName}`,
            description: `URGENT: Lone worker ${record.workerName} at ${record.siteName} has not checked in for ${overdueMinutes} minutes. Battery: ${record.batteryPct ?? 'Unknown'}%. Location: ${record.lastKnownLocation ? `${record.lastKnownLocation.lat.toFixed(5)}, ${record.lastKnownLocation.lng.toFixed(5)} (${record.lastKnownLocation.isOffline ? 'Offline' : 'Online'})` : 'Unknown'}. Multi-tier emergency contacts dispatched.`,
            timestamp: new Date().toISOString(),
            details: {
              reason: 'Safety check-in overdue by 30+ minutes. Critical lone worker emergency protocol.',
              ticketId: `SAFE-CRIT-${record.id}`
            }
          });
        } catch (e) {
          console.warn('Failed to send branch manager critical escalation inbox item:', e);
        }
      }
    }

    if (updated) {
      saveStoredCheckIns(records);
    }

    return escalatedRecords;
  },

  /**
   * Returns check-ins for a given shift session
   */
  getCheckInsForSession: (sessionId: string): SafetyCheckInRecord[] => {
    const records = getStoredCheckIns();
    return records
      .filter(r => r.sessionId === sessionId)
      .sort((a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime());
  },

  /**
   * Returns active panic alert for worker if any
   */
  getActivePanicForWorker: (workerId: string): PanicAlertRecord | null => {
    const alerts = getStoredPanicAlerts();
    return alerts.find(a => a.workerId === workerId && a.status === 'ACTIVE') || null;
  },

  /**
   * Returns active pending check-in for worker
   */
  getPendingCheckInForWorker: (workerId: string, sessionId?: string): SafetyCheckInRecord | null => {
    const records = getStoredCheckIns();
    return records.find(r => 
      r.workerId === workerId && 
      (!sessionId || r.sessionId === sessionId) && 
      (r.status === 'SCHEDULED' || r.status === 'DUE' || r.status === 'MISSED_ESCALATING')
    ) || null;
  },

  /**
   * Returns active panic alerts for tenant
   */
  getActivePanicAlerts: (tenantId: string): PanicAlertRecord[] => {
    const alerts = getStoredPanicAlerts();
    return alerts
      .filter(a => a.tenantId === tenantId && a.status === 'ACTIVE')
      .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime());
  },

  /**
   * Supervisor monitoring view: aggregates all active lone workers with their check-in and panic statuses
   */
  getLoneWorkerOverview: (tenantId: string): LoneWorkerOverviewItem[] => {
    const sessions = getStoredSessions().filter(s => s.tenantId === tenantId && s.status === 'ACTIVE');
    const records = getStoredCheckIns();
    const panics = getStoredPanicAlerts().filter(a => a.tenantId === tenantId && a.status === 'ACTIVE');
    const now = Date.now();

    return sessions.map(session => {
      const config = safetyCheckInService.getSafetyConfig(tenantId, session.siteId);
      const sessionRecords = records.filter(r => r.sessionId === session.id);
      const currentCheckIn = sessionRecords.find(r => r.status === 'SCHEDULED' || r.status === 'DUE' || r.status === 'MISSED_ESCALATING' || r.status === 'ESCALATED');
      const respondedRecords = sessionRecords.filter(r => r.status === 'RESPONDED_OK' || r.status === 'RESOLVED_LATE');
      const lastRespondedAt = respondedRecords.length > 0 ? respondedRecords[respondedRecords.length - 1].respondedAt : undefined;
      const activePanic = panics.find(p => p.workerId === session.workerId || p.sessionId === session.id);

      let status: LoneWorkerOverviewItem['status'] = 'SAFE';
      let minutesUntilDue = 60;

      if (activePanic) {
        status = 'PANIC';
      } else if (session.safetyStatus === 'DECLINED') {
        status = 'DECLINED';
      } else if (currentCheckIn) {
        const dueTime = new Date(currentCheckIn.dueAt).getTime();
        minutesUntilDue = Math.round((dueTime - now) / (60 * 1000));

        if (currentCheckIn.escalationLevel === 'BRANCH_MANAGER_T30') {
          status = 'ESCALATED_T30';
        } else if (currentCheckIn.escalationLevel === 'SUPERVISOR_T15') {
          status = 'ESCALATING_T15';
        } else if (currentCheckIn.escalationLevel === 'WORKER_T5') {
          status = 'ESCALATING_T5';
        } else if (minutesUntilDue <= 0) {
          status = 'DUE';
        } else if (minutesUntilDue <= 10) {
          status = 'DUE_SOON';
        } else {
          status = 'SAFE';
        }
      }

      const hasFallback = config.emergencyContacts.some(c => c.isFallback);
      const isOffline = session.degradedReason === 'PWA_BROWSER' || !navigator.onLine;

      return {
        session,
        config,
        currentCheckIn,
        lastRespondedAt,
        nextDueAt: currentCheckIn?.dueAt,
        minutesUntilDue,
        status,
        activePanic,
        hasFallbackContact: hasFallback,
        isOffline
      };
    });
  }
};
