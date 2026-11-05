import { 
  Worker, 
  AttendanceRecord, 
  Punch, 
  WhatsAppBridgeConfig, 
  WhatsAppMessage, 
  WhatsAppCommandKey, 
  WhatsAppOptOutRecord,
  WhatsAppRateLimitRecord,
  WhatsAppSharedPhoneBinding,
  AttendanceAuditTrailEntry,
  ShiftConfig,
  WorkerLanguage
} from '../types/index';
import { dbService } from './db';
import { magicLinkService, validateWorkerPhone } from './magicLinkService';
import { inboxService } from './inboxService';
import { geoUtils } from '../utils/geo';
import { entitlementService } from './entitlementService';

const WHATSAPP_CONFIG_KEY = 'workforce_whatsapp_config';
const WHATSAPP_MESSAGES_KEY = 'workforce_whatsapp_messages';
const WHATSAPP_OPTOUT_KEY = 'workforce_whatsapp_optouts';
const WHATSAPP_RATELIMIT_KEY = 'workforce_whatsapp_ratelimits';
const WHATSAPP_SHARED_BINDINGS_KEY = 'workforce_whatsapp_shared_bindings';
const WHATSAPP_LAST_INTERACTION_KEY = 'workforce_whatsapp_last_interaction';

export const DEFAULT_WHATSAPP_CONFIG: WhatsAppBridgeConfig = {
  enabled: true,
  wabaPhoneNumberId: 'waba_prod_919820012345',
  displayPhoneNumber: '+91 98200 12345',
  webhookVerifyToken: 'wfpro_waba_verify_sec_99',
  defaultLanguage: 'hi',
  enableProactiveNotifications: true,
  enableShiftReminders: true,
  enableAdvanceApprovals: true,
  enablePayslipReady: true,
  enableMissingPunchOut: true,
  requireSelfieForPunch: false,
  requireLocationForPunch: false,
  rateLimitPerHour: 10
};

// ----------------------------------------------------------------------
// Storage Helpers
// ----------------------------------------------------------------------

const getStoredConfig = (tenantId: string): WhatsAppBridgeConfig => {
  try {
    const raw = localStorage.getItem(`${WHATSAPP_CONFIG_KEY}_${tenantId}`);
    if (raw) return { ...DEFAULT_WHATSAPP_CONFIG, ...JSON.parse(raw) };
  } catch (e) {
    console.warn('Failed to parse whatsapp config:', e);
  }
  return DEFAULT_WHATSAPP_CONFIG;
};

const saveStoredConfig = (tenantId: string, config: WhatsAppBridgeConfig) => {
  try {
    localStorage.setItem(`${WHATSAPP_CONFIG_KEY}_${tenantId}`, JSON.stringify(config));
  } catch (e) {
    console.warn('Failed to save whatsapp config:', e);
  }
};

const getStoredMessages = (tenantId: string): WhatsAppMessage[] => {
  try {
    const raw = localStorage.getItem(`${WHATSAPP_MESSAGES_KEY}_${tenantId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Failed to parse whatsapp messages:', e);
  }
  return [];
};

const saveStoredMessages = (tenantId: string, messages: WhatsAppMessage[]) => {
  try {
    // Keep last 150 messages
    const trimmed = messages.slice(0, 150);
    localStorage.setItem(`${WHATSAPP_MESSAGES_KEY}_${tenantId}`, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('Failed to save whatsapp messages:', e);
  }
};

const getStoredOptOuts = (): Record<string, WhatsAppOptOutRecord> => {
  try {
    const raw = localStorage.getItem(WHATSAPP_OPTOUT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
};

const saveStoredOptOuts = (records: Record<string, WhatsAppOptOutRecord>) => {
  try {
    localStorage.setItem(WHATSAPP_OPTOUT_KEY, JSON.stringify(records));
  } catch {}
};

const getStoredSharedBindings = (): Record<string, WhatsAppSharedPhoneBinding> => {
  try {
    const raw = localStorage.getItem(WHATSAPP_SHARED_BINDINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
};

const saveStoredSharedBindings = (records: Record<string, WhatsAppSharedPhoneBinding>) => {
  try {
    localStorage.setItem(WHATSAPP_SHARED_BINDINGS_KEY, JSON.stringify(records));
  } catch {}
};

const getStoredRateLimits = (): Record<string, WhatsAppRateLimitRecord> => {
  try {
    const raw = localStorage.getItem(WHATSAPP_RATELIMIT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
};

const saveStoredRateLimits = (records: Record<string, WhatsAppRateLimitRecord>) => {
  try {
    localStorage.setItem(WHATSAPP_RATELIMIT_KEY, JSON.stringify(records));
  } catch {}
};

const getLastInteractions = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(WHATSAPP_LAST_INTERACTION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
};

const recordInteraction = (phone: string) => {
  try {
    const records = getLastInteractions();
    records[phone] = Date.now();
    localStorage.setItem(WHATSAPP_LAST_INTERACTION_KEY, JSON.stringify(records));
  } catch {}
};

// ----------------------------------------------------------------------
// NLP Multi-Language Command Recognizer
// ----------------------------------------------------------------------

export function parseWhatsAppCommand(text: string): { command: WhatsAppCommandKey; cleanText: string } {
  if (!text) return { command: 'UNKNOWN', cleanText: '' };
  const raw = text.trim().toLowerCase();
  const clean = raw.replace(/[!?,.:;'"\-_/\\]/g, ' ').replace(/\s+/g, ' ').trim();

  // Check Stop / Start opt-outs first
  if (/^(stop|unsubscribe|block|रुको|बंद|રોકો|બંધ)$/i.test(clean)) {
    return { command: 'OPT_OUT_STOP', cleanText: clean };
  }
  if (/^(start|subscribe|unblock|शुरू|चालू|ચાલુ|શરૂ)$/i.test(clean)) {
    return { command: 'OPT_IN_START', cleanText: clean };
  }

  // Punch In
  if (
    /^(in|punch in|clock in|login|checkin|check in|હાજરી આવ્યા|આવ્યા|ઇન|इन|आना|हाजिरी इन|हाजिरी|उपस्थिति)$/i.test(clean) ||
    clean.includes('punch in') ||
    clean.includes('clock in') ||
    clean.includes('हाजिरी इन') ||
    clean.includes('હાજરી આવ્યા')
  ) {
    return { command: 'PUNCH_IN', cleanText: clean };
  }

  // Punch Out
  if (
    /^(out|punch out|clock out|logout|checkout|check out|હાજરી ગયા|ગયા|આઉટ|आउट|जाना|हाजिरी आउट)$/i.test(clean) ||
    clean.includes('punch out') ||
    clean.includes('clock out') ||
    clean.includes('हाजिरी आउट') ||
    clean.includes('હાજરી ગયા')
  ) {
    return { command: 'PUNCH_OUT', cleanText: clean };
  }

  // Payslip
  if (
    /^(payslip|salary|slip|pay|payment|पगार|पेस्लिप|वेतन|वेतन पर्ची|પગારચીઠ્ઠી|પગાર)$/i.test(clean) ||
    clean.includes('payslip') ||
    clean.includes('salary') ||
    clean.includes('पेस्लिप') ||
    clean.includes('पगार') ||
    clean.includes('પગાર')
  ) {
    return { command: 'PAYSLIP', cleanText: clean };
  }

  // Schedule
  if (
    /^(schedule|shift|timing|duty|today|roster|काम|शिड्यूल|समयपत्रક|કામ|ડ્યુટી|ड्यूटी|पाली)$/i.test(clean) ||
    clean.includes('schedule') ||
    clean.includes('shift') ||
    clean.includes('शिड्यूल') ||
    clean.includes('समयपत्रક')
  ) {
    return { command: 'SCHEDULE', cleanText: clean };
  }

  // Attendance
  if (
    /^(attendance|summary|report|record|હાજરી|उपस्थिति|हाजिरी रिपोर्ट)$/i.test(clean) ||
    clean.includes('attendance') ||
    clean.includes('summary')
  ) {
    return { command: 'ATTENDANCE', cleanText: clean };
  }

  // Balance / Advances / Kharchi
  if (
    /^(balance|advance|advances|kharchi|loan|खर्ची|अग्रिम|उपाड|ઉપાડ|બાકી|बैलेंस)$/i.test(clean) ||
    clean.includes('balance') ||
    clean.includes('advance') ||
    clean.includes('kharchi') ||
    clean.includes('खर्ची') ||
    clean.includes('ઉપાડ')
  ) {
    return { command: 'BALANCE_ADVANCE', cleanText: clean };
  }

  // Leave
  if (
    /^(leave|chutti|holiday|ছুটি|छुट्टी|अवकाश|રજા|લીવ)$/i.test(clean) ||
    clean.includes('leave') ||
    clean.includes('chutti') ||
    clean.includes('छुट्टी') ||
    clean.includes('રજા')
  ) {
    return { command: 'LEAVE', cleanText: clean };
  }

  // Help / Menu
  if (
    /^(help|menu|hi|hello|namaste|नमस्ते|નમસ્તે|કેમ છો|start menu)$/i.test(clean) ||
    clean.includes('help') ||
    clean.includes('menu')
  ) {
    return { command: 'HELP_MENU', cleanText: clean };
  }

  return { command: 'UNKNOWN', cleanText: clean };
}

// ----------------------------------------------------------------------
// WhatsApp Service Implementation
// ----------------------------------------------------------------------

export const whatsappService = {
  /**
   * Get tenant WhatsApp Bridge configuration
   */
  getWhatsAppConfig: (tenantId: string): WhatsAppBridgeConfig => {
    return getStoredConfig(tenantId);
  },

  /**
   * Save tenant WhatsApp Bridge configuration
   */
  saveWhatsAppConfig: async (tenantId: string, partial: Partial<WhatsAppBridgeConfig>): Promise<WhatsAppBridgeConfig> => {
    const current = getStoredConfig(tenantId);
    const updated = { ...current, ...partial };
    saveStoredConfig(tenantId, updated);
    return updated;
  },

  /**
   * Get message history for interactive testing / dashboard preview
   */
  getMessages: (tenantId: string): WhatsAppMessage[] => {
    return getStoredMessages(tenantId);
  },

  /**
   * Check if worker phone opted out from non-essential messages
   */
  isPhoneOptedOut: (phone: string): boolean => {
    const { cleanPhone } = validateWorkerPhone(phone);
    const optOuts = getStoredOptOuts();
    return !!optOuts[cleanPhone.slice(-10)];
  },

  /**
   * Rate limiting: 10 commands per worker per rolling 1 hour
   */
  checkRateLimit: (workerId: string, phone: string, maxPerHour = 10): { isAllowed: boolean; count: number } => {
    const limits = getStoredRateLimits();
    const key = `w_${workerId}`;
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    const record: WhatsAppRateLimitRecord = limits[key] || {
      workerId,
      phone,
      timestamps: []
    };

    const validTimestamps = record.timestamps.filter(t => t > oneHourAgo);

    if (validTimestamps.length >= maxPerHour) {
      return { isAllowed: false, count: validTimestamps.length };
    }

    validTimestamps.push(now);
    record.timestamps = validTimestamps;
    limits[key] = record;
    saveStoredRateLimits(limits);

    return { isAllowed: true, count: validTimestamps.length };
  },

  /**
   * Check shared phone conflict:
   * Bind first registered worker. If a 2nd worker exists on the same phone,
   * block and route to manager resolution.
   */
  verifySharedPhoneBinding: (
    phone: string,
    allMatchingWorkers: Worker[],
    tenantId: string
  ): {
    allowedWorker?: Worker;
    conflictBlocked?: boolean;
    error?: string;
  } => {
    if (allMatchingWorkers.length === 0) {
      return { conflictBlocked: false };
    }

    const { cleanPhone } = validateWorkerPhone(phone);
    const key = cleanPhone.slice(-10);
    const sharedBindings = getStoredSharedBindings();
    const existingBinding = sharedBindings[key];

    // If only one worker has this phone, bind it if not bound yet
    if (allMatchingWorkers.length === 1) {
      const singleWorker = allMatchingWorkers[0];
      if (!existingBinding || existingBinding.boundWorkerId !== singleWorker.id) {
        sharedBindings[key] = {
          phone: cleanPhone,
          boundWorkerId: singleWorker.id,
          boundWorkerName: singleWorker.name,
          tenantId,
          boundAt: new Date().toISOString(),
          status: 'BOUND'
        };
        saveStoredSharedBindings(sharedBindings);
      }
      return { allowedWorker: singleWorker, conflictBlocked: false };
    }

    // Multiple workers share the same number!
    if (existingBinding && existingBinding.status === 'BOUND') {
      const boundWorker = allMatchingWorkers.find(w => w.id === existingBinding.boundWorkerId);
      if (boundWorker) {
        return { allowedWorker: boundWorker, conflictBlocked: false };
      }
    }

    // If unallocated and multiple exist:
    const primary = allMatchingWorkers[0];
    const secondary = allMatchingWorkers[1];
    
    // Auto-bind to primary worker, reject secondary worker access
    sharedBindings[key] = {
      phone: cleanPhone,
      boundWorkerId: primary.id,
      boundWorkerName: primary.name,
      tenantId,
      boundAt: new Date().toISOString(),
      status: 'BOUND'
    };
    saveStoredSharedBindings(sharedBindings);

    return {
      allowedWorker: primary,
      conflictBlocked: true,
      error: `Notice: This phone number is registered to both ${primary.name} and ${secondary.name}. It is currently bound exclusively to ${primary.name} to prevent buddy punching. Please contact your manager to update registered numbers.`
    };
  },

  /**
   * Main Inbound Webhook / Simulator Message Handler
   * Processes worker WhatsApp messages, performs security & anomaly checks,
   * executes commands, and returns immediate conversational responses.
   */
  handleInboundMessage: async (params: {
    tenantId: string;
    fromPhone: string;
    messageText: string;
    location?: { lat: number; lng: number; address?: string };
    photoUrl?: string;
    isSelfieMismatch?: boolean;
    bypassGeofenceWarn?: boolean;
  }): Promise<{
    replyMessage: string;
    command: WhatsAppCommandKey;
    worker?: Worker;
    scopedLink?: string;
    punchRecord?: AttendanceRecord;
    isAnomaly?: boolean;
    anomalyReason?: string;
  }> => {
    const config = getStoredConfig(params.tenantId);
    const nowIso = new Date().toISOString();
    const serverTimestamp = nowIso;
    const { cleanPhone, formattedDisplay } = validateWorkerPhone(params.fromPhone);

    // 1. Gated on E11 Bridge Live for Tenant
    const entitlements = await entitlementService.getTenantEntitlements(params.tenantId).catch(() => null);
    const isBridgeEntitled = entitlements ? (entitlements.resolutions['WHATSAPP_BRIDGE']?.enabled ?? true) : true;

    if (!config.enabled || !isBridgeEntitled) {
      const reply = "WhatsApp attendance bridge is not active for this organization. Please use the mobile app or contact your factory supervisor.";
      whatsappService.recordMessage(params.tenantId, {
        id: `msg_in_${Date.now()}`,
        tenantId: params.tenantId,
        fromPhone: cleanPhone,
        direction: 'INBOUND',
        content: params.messageText,
        timestamp: nowIso,
        type: 'TEXT',
        channel: 'WHATSAPP'
      });
      whatsappService.recordMessage(params.tenantId, {
        id: `msg_out_${Date.now()}`,
        tenantId: params.tenantId,
        fromPhone: cleanPhone,
        direction: 'OUTBOUND',
        content: reply,
        timestamp: new Date().toISOString(),
        type: 'TEXT',
        channel: 'WHATSAPP'
      });
      return { replyMessage: reply, command: 'UNKNOWN' };
    }

    // 2. First Contact: Verify phone against worker records (Unregistered Number Protection)
    const allWorkers = await dbService.getWorkers(params.tenantId).catch(() => []);
    const matchingWorkers = allWorkers.filter(w => {
      const wPhone = validateWorkerPhone(w.phone).cleanPhone;
      return wPhone.slice(-10) === cleanPhone.slice(-10);
    });

    // Record inbound message in store
    const inboundMsgId = `msg_in_${Date.now()}`;
    whatsappService.recordMessage(params.tenantId, {
      id: inboundMsgId,
      tenantId: params.tenantId,
      fromPhone: cleanPhone,
      direction: 'INBOUND',
      content: params.messageText,
      timestamp: nowIso,
      type: params.location ? 'LOCATION' : (params.photoUrl ? 'IMAGE' : 'TEXT'),
      location: params.location,
      mediaUrl: params.photoUrl,
      channel: 'WHATSAPP'
    });

    // Edge Case 1: Unregistered phone number gets generic reply
    // Never reveals whether the number exists or any worker details
    if (matchingWorkers.length === 0) {
      const genericReply = "This number is not registered. Ask your manager to update.";
      whatsappService.recordMessage(params.tenantId, {
        id: `msg_out_${Date.now()}`,
        tenantId: params.tenantId,
        fromPhone: cleanPhone,
        direction: 'OUTBOUND',
        content: genericReply,
        timestamp: new Date().toISOString(),
        type: 'TEXT',
        channel: 'WHATSAPP'
      });
      return { replyMessage: genericReply, command: 'UNKNOWN' };
    }

    // Check shared phone conflict (Edge Case 2: two workers share one number)
    const bindingResult = whatsappService.verifySharedPhoneBinding(params.fromPhone, matchingWorkers, params.tenantId);
    const worker = bindingResult.allowedWorker || matchingWorkers[0];

    // Check worker active status
    if (worker.status === 'INACTIVE' || worker.isActive === false) {
      const inactiveReply = `Hello ${worker.name}. Your employee profile is currently inactive. Please contact HR or your manager for assistance.`;
      whatsappService.recordMessage(params.tenantId, {
        id: `msg_out_${Date.now()}`,
        tenantId: params.tenantId,
        workerId: worker.id,
        workerName: worker.name,
        fromPhone: cleanPhone,
        direction: 'OUTBOUND',
        content: inactiveReply,
        timestamp: new Date().toISOString(),
        type: 'TEXT',
        channel: 'WHATSAPP'
      });
      return { replyMessage: inactiveReply, command: 'UNKNOWN', worker };
    }

    // Rate Limiting Check (10 commands/hour)
    const rateCheck = whatsappService.checkRateLimit(worker.id, cleanPhone, config.rateLimitPerHour || 10);
    if (!rateCheck.isAllowed) {
      const rateReply = `Rate limit exceeded (max 10 commands/hour). Please try again later.`;
      whatsappService.recordMessage(params.tenantId, {
        id: `msg_out_${Date.now()}`,
        tenantId: params.tenantId,
        workerId: worker.id,
        workerName: worker.name,
        fromPhone: cleanPhone,
        direction: 'OUTBOUND',
        content: rateReply,
        timestamp: new Date().toISOString(),
        type: 'TEXT',
        channel: 'WHATSAPP'
      });
      return { replyMessage: rateReply, command: 'UNKNOWN', worker };
    }

    // 24-Hour Session Window Check
    const lastInteractions = getLastInteractions();
    const lastTime = lastInteractions[cleanPhone.slice(-10)] || 0;
    const isSessionExpired = lastTime > 0 && (Date.now() - lastTime > 24 * 3600 * 1000);
    recordInteraction(cleanPhone.slice(-10));

    // Parse NLP command (English, Hindi, Gujarati)
    const { command } = parseWhatsAppCommand(params.messageText);

    // If session window expired and command is unknown/free-form:
    // Degrade gracefully to "Open the app" rather than failing silently
    if (isSessionExpired && command === 'UNKNOWN') {
      const linkRes = await magicLinkService.createWorkerMagicLink({
        tenantId: params.tenantId,
        worker,
        scope: 'ATTENDANCE_SUMMARY',
        channel: 'WHATSAPP',
        issuedBy: 'whatsapp_bot_session',
        ttlHours: 72
      });

      const sessionReply = `Your WhatsApp 24h session has expired. To access your workforce dashboard securely, open your worker link:\n🔗 ${linkRes.universalUrl}\nOr reply with a quick command: IN, OUT, payslip, schedule, attendance, balance, leave.`;
      whatsappService.recordMessage(params.tenantId, {
        id: `msg_out_${Date.now()}`,
        tenantId: params.tenantId,
        workerId: worker.id,
        workerName: worker.name,
        fromPhone: cleanPhone,
        direction: 'OUTBOUND',
        content: sessionReply,
        timestamp: new Date().toISOString(),
        type: 'TEXT',
        scopedLinkUrl: linkRes.universalUrl,
        channel: 'WHATSAPP'
      });
      return { replyMessage: sessionReply, command: 'UNKNOWN', worker, scopedLink: linkRes.universalUrl };
    }

    // Handle OPT_OUT_STOP & OPT_IN_START
    if (command === 'OPT_OUT_STOP') {
      const optOuts = getStoredOptOuts();
      optOuts[cleanPhone.slice(-10)] = {
        phone: cleanPhone,
        optedOutAt: nowIso,
        channel: 'WHATSAPP',
        scope: 'NON_ESSENTIAL'
      };
      saveStoredOptOuts(optOuts);

      const stopReply = `You have unsubscribed from non-essential reminders and alerts. You can still punch IN/OUT or request payslip and schedule anytime.\nReply START anytime to resume notifications.`;
      whatsappService.recordMessage(params.tenantId, {
        id: `msg_out_${Date.now()}`,
        tenantId: params.tenantId,
        workerId: worker.id,
        workerName: worker.name,
        fromPhone: cleanPhone,
        direction: 'OUTBOUND',
        content: stopReply,
        timestamp: new Date().toISOString(),
        type: 'TEXT',
        channel: 'WHATSAPP'
      });
      return { replyMessage: stopReply, command, worker };
    }

    if (command === 'OPT_IN_START') {
      const optOuts = getStoredOptOuts();
      delete optOuts[cleanPhone.slice(-10)];
      saveStoredOptOuts(optOuts);

      const startReply = `Notifications re-enabled! You will receive shift reminders and payslip notifications on WhatsApp.`;
      whatsappService.recordMessage(params.tenantId, {
        id: `msg_out_${Date.now()}`,
        tenantId: params.tenantId,
        workerId: worker.id,
        workerName: worker.name,
        fromPhone: cleanPhone,
        direction: 'OUTBOUND',
        content: startReply,
        timestamp: new Date().toISOString(),
        type: 'TEXT',
        channel: 'WHATSAPP'
      });
      return { replyMessage: startReply, command, worker };
    }

    // ------------------------------------------------------------------
    // COMMAND: PAYSLIP
    // Returns 72-hour scoped short token link; keeps PII out of WhatsApp store
    // ------------------------------------------------------------------
    if (command === 'PAYSLIP') {
      const targetMonth = new Date().toISOString().slice(0, 7);
      const linkRes = await magicLinkService.createWorkerMagicLink({
        tenantId: params.tenantId,
        worker,
        scope: 'PAYSLIP',
        channel: 'WHATSAPP',
        issuedBy: 'whatsapp_bot',
        ttlHours: 72,
        targetMonth
      });

      const reply = `नमस्ते ${worker.name}! आपकी ${targetMonth} की payslip तैयार है / Your payslip is ready:\n🔗 ${linkRes.universalUrl}\n(Link expires in 72h — PII kept secure outside WhatsApp)`;
      whatsappService.recordMessage(params.tenantId, {
        id: `msg_out_${Date.now()}`,
        tenantId: params.tenantId,
        workerId: worker.id,
        workerName: worker.name,
        fromPhone: cleanPhone,
        direction: 'OUTBOUND',
        content: reply,
        timestamp: new Date().toISOString(),
        type: 'TEXT',
        scopedLinkUrl: linkRes.universalUrl,
        commandRecognized: 'PAYSLIP',
        channel: 'WHATSAPP'
      });
      return { replyMessage: reply, command, worker, scopedLink: linkRes.universalUrl };
    }

    // ------------------------------------------------------------------
    // COMMAND: SCHEDULE
    // Returns today's shift info + 72-hour scoped schedule link
    // ------------------------------------------------------------------
    if (command === 'SCHEDULE') {
      const orgSettings = await dbService.getOrgSettings(params.tenantId).catch(() => null);
      const shift = orgSettings?.shifts?.find(s => s.id === worker.shiftId) || {
        name: 'General Shift',
        startTime: '09:00',
        endTime: '18:00'
      };

      const linkRes = await magicLinkService.createWorkerMagicLink({
        tenantId: params.tenantId,
        worker,
        scope: 'SCHEDULE',
        channel: 'WHATSAPP',
        issuedBy: 'whatsapp_bot',
        ttlHours: 72
      });

      const reply = `नमस्ते ${worker.name}! आज का कार्य शेड्यूल / Today's Shift:\n⏰ ${shift.name}: ${shift.startTime} - ${shift.endTime}\n📍 Worksite: Production Floor #1\n🔗 पूरा शेड्यूल देखें / View Full Roster:\n${linkRes.universalUrl}\n(Link valid for 72h)`;
      whatsappService.recordMessage(params.tenantId, {
        id: `msg_out_${Date.now()}`,
        tenantId: params.tenantId,
        workerId: worker.id,
        workerName: worker.name,
        fromPhone: cleanPhone,
        direction: 'OUTBOUND',
        content: reply,
        timestamp: new Date().toISOString(),
        type: 'TEXT',
        scopedLinkUrl: linkRes.universalUrl,
        commandRecognized: 'SCHEDULE',
        channel: 'WHATSAPP'
      });
      return { replyMessage: reply, command, worker, scopedLink: linkRes.universalUrl };
    }

    // ------------------------------------------------------------------
    // COMMAND: ATTENDANCE SUMMARY
    // Returns month-to-date presence counts + calendar link
    // ------------------------------------------------------------------
    if (command === 'ATTENDANCE') {
      const history = await dbService.getAttendanceHistory(params.tenantId).catch(() => []);
      const currentMonth = new Date().toISOString().slice(0, 7);
      const workerRecords = history.filter(r => r.workerId === worker.id && (r.date || '').startsWith(currentMonth));

      const presentCount = workerRecords.filter(r => r.status === 'PRESENT').length;
      const halfDayCount = workerRecords.filter(r => r.status === 'HALF_DAY').length;
      const otHours = workerRecords.reduce((acc, r) => acc + (r.hours?.overtime || 0), 0);

      const linkRes = await magicLinkService.createWorkerMagicLink({
        tenantId: params.tenantId,
        worker,
        scope: 'ATTENDANCE_SUMMARY',
        channel: 'WHATSAPP',
        issuedBy: 'whatsapp_bot',
        ttlHours: 72
      });

      const reply = `नमस्ते ${worker.name}! इस महीने की हाजिरी / Attendance for ${currentMonth}:\n✅ Present: ${presentCount} days\n🌓 Half-Day: ${halfDayCount} days\n⚡ Overtime: ${otHours.toFixed(1)} hrs\n🔗 विस्तृत हाजिरी देखें / View Full Calendar:\n${linkRes.universalUrl}`;
      whatsappService.recordMessage(params.tenantId, {
        id: `msg_out_${Date.now()}`,
        tenantId: params.tenantId,
        workerId: worker.id,
        workerName: worker.name,
        fromPhone: cleanPhone,
        direction: 'OUTBOUND',
        content: reply,
        timestamp: new Date().toISOString(),
        type: 'TEXT',
        scopedLinkUrl: linkRes.universalUrl,
        commandRecognized: 'ATTENDANCE',
        channel: 'WHATSAPP'
      });
      return { replyMessage: reply, command, worker, scopedLink: linkRes.universalUrl };
    }

    // ------------------------------------------------------------------
    // COMMAND: BALANCE / ADVANCES (Kharchi)
    // ------------------------------------------------------------------
    if (command === 'BALANCE_ADVANCE') {
      const advances = await dbService.getAdvances(params.tenantId).catch(() => []);
      const workerAdvances = advances.filter(a => a.workerId === worker.id);
      const pendingAdvance = workerAdvances.find(a => a.status === 'PENDING');
      const recentApproved = workerAdvances.filter(a => a.status === 'APPROVED');
      const totalApproved = recentApproved.reduce((sum, a) => sum + (a.amount || 0), 0);

      const linkRes = await magicLinkService.createWorkerMagicLink({
        tenantId: params.tenantId,
        worker,
        scope: 'ATTENDANCE_SUMMARY',
        channel: 'WHATSAPP',
        issuedBy: 'whatsapp_bot',
        ttlHours: 72
      });

      let statusMsg = `अग्रिम/खर्ची स्थिति / Advance Status:\n• Approved this month: ₹${totalApproved.toLocaleString('en-IN')}`;
      if (pendingAdvance) {
        statusMsg += `\n• Pending Request: ₹${pendingAdvance.amount.toLocaleString('en-IN')} (Under review by manager)`;
      } else {
        statusMsg += `\n• No pending advance requests.`;
      }
      statusMsg += `\n🔗 नया अग्रिम अनुरोध करें / Request Advance:\n${linkRes.universalUrl}`;

      whatsappService.recordMessage(params.tenantId, {
        id: `msg_out_${Date.now()}`,
        tenantId: params.tenantId,
        workerId: worker.id,
        workerName: worker.name,
        fromPhone: cleanPhone,
        direction: 'OUTBOUND',
        content: statusMsg,
        timestamp: new Date().toISOString(),
        type: 'TEXT',
        scopedLinkUrl: linkRes.universalUrl,
        commandRecognized: 'BALANCE_ADVANCE',
        channel: 'WHATSAPP'
      });
      return { replyMessage: statusMsg, command, worker, scopedLink: linkRes.universalUrl };
    }

    // ------------------------------------------------------------------
    // COMMAND: LEAVE
    // ------------------------------------------------------------------
    if (command === 'LEAVE') {
      const cl = worker.leaveBalances?.cl ?? 4;
      const sl = worker.leaveBalances?.sl ?? 3;
      const pl = worker.leaveBalances?.pl ?? 6;

      const linkRes = await magicLinkService.createWorkerMagicLink({
        tenantId: params.tenantId,
        worker,
        scope: 'ATTENDANCE_SUMMARY',
        channel: 'WHATSAPP',
        issuedBy: 'whatsapp_bot',
        ttlHours: 72
      });

      const reply = `नमस्ते ${worker.name}! आपकी छुट्टी बैलेंस / Leave Balances:\n• Casual Leave (CL): ${cl} days\n• Sick Leave (SL): ${sl} days\n• Privilege Leave (PL): ${pl} days\n🔗 छुट्टी आवेदन करें / Apply for Leave:\n${linkRes.universalUrl}`;
      whatsappService.recordMessage(params.tenantId, {
        id: `msg_out_${Date.now()}`,
        tenantId: params.tenantId,
        workerId: worker.id,
        workerName: worker.name,
        fromPhone: cleanPhone,
        direction: 'OUTBOUND',
        content: reply,
        timestamp: new Date().toISOString(),
        type: 'TEXT',
        scopedLinkUrl: linkRes.universalUrl,
        commandRecognized: 'LEAVE',
        channel: 'WHATSAPP'
      });
      return { replyMessage: reply, command, worker, scopedLink: linkRes.universalUrl };
    }

    // ------------------------------------------------------------------
    // COMMAND: PUNCH IN / PUNCH OUT (WhatsApp Field Attendance Punch)
    // Captures channel = 'WHATSAPP', server authoritative timestamp,
    // coordinates, checks payroll lock, duplicate punch, geofence, and anomaly engine.
    // ------------------------------------------------------------------
    if (command === 'PUNCH_IN' || command === 'PUNCH_OUT') {
      const punchType = command === 'PUNCH_IN' ? 'IN' : 'OUT';
      const todayDate = serverTimestamp.slice(0, 10);
      const timeFormatted = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

      // Top Edge Case 4: "IN" during payroll lock
      // Check if current month payroll is locked
      const currentMonth = serverTimestamp.slice(0, 7);
      const orgSettings = await dbService.getOrgSettings(params.tenantId).catch(() => null);
      if (orgSettings?.ewaConfig?.isPayrollLocked) {
        const lockReply = `Punch not available — payroll is being processed for this period.`;
        whatsappService.recordMessage(params.tenantId, {
          id: `msg_out_${Date.now()}`,
          tenantId: params.tenantId,
          workerId: worker.id,
          workerName: worker.name,
          fromPhone: cleanPhone,
          direction: 'OUTBOUND',
          content: lockReply,
          timestamp: new Date().toISOString(),
          type: 'TEXT',
          channel: 'WHATSAPP'
        });
        return { replyMessage: lockReply, command, worker };
      }

      // Fetch today's existing attendance record for duplicate punch check (Edge Case 3)
      const existingToday = await dbService.getTodayAttendance(params.tenantId).catch(() => []);
      let todayRecord = existingToday.find(r => r.workerId === worker.id);

      if (todayRecord && Array.isArray(todayRecord.timeline) && todayRecord.timeline.length > 0) {
        const lastPunch = todayRecord.timeline[todayRecord.timeline.length - 1];
        const lastPunchTime = new Date(lastPunch.timestamp).getTime();
        const nowMs = Date.now();
        // If same punch type executed within 5 minutes (300,000 ms) -> duplicate punch
        if (lastPunch.type === punchType && nowMs - lastPunchTime < 300000) {
          const dupTime = new Date(lastPunch.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
          const duplicateReply = `Duplicate punch detected: You already clocked ${punchType} at ${dupTime}. No duplicate record created.`;

          // Log in audit trail
          const auditEntry: AttendanceAuditTrailEntry = {
            id: `audit_dup_${Date.now()}`,
            channel: 'WHATSAPP',
            source: 'WhatsApp Business API Bridge',
            timestamp: serverTimestamp,
            ipOrPhone: cleanPhone,
            action: 'DUPLICATE_SUPPRESSED',
            notes: `Duplicate ${punchType} suppressed within 5m window`
          };
          todayRecord.auditTrail = todayRecord.auditTrail || [];
          todayRecord.auditTrail.push(auditEntry);
          await dbService.markAttendance(todayRecord);

          whatsappService.recordMessage(params.tenantId, {
            id: `msg_out_${Date.now()}`,
            tenantId: params.tenantId,
            workerId: worker.id,
            workerName: worker.name,
            fromPhone: cleanPhone,
            direction: 'OUTBOUND',
            content: duplicateReply,
            timestamp: new Date().toISOString(),
            type: 'TEXT',
            channel: 'WHATSAPP'
          });
          return { replyMessage: duplicateReply, command, worker, punchRecord: todayRecord };
        }
      }

      // Location / Geofence Check
      let isGeofenceViolation = false;
      let siteName = 'Plant #1 Production Site';
      const siteConfig = orgSettings?.baseLocation || { lat: 28.5355, lng: 77.3910, radius: 150, address: 'Plant #1 Production Site' };

      if (params.location) {
        const geofenceEval = geoUtils.checkGeofenceWithHysteresis(
          { lat: params.location.lat, lng: params.location.lng },
          { ...siteConfig, name: siteConfig.address || siteName }
        );
        siteName = geofenceEval.siteName;

        if (!geofenceEval.isInside) {
          isGeofenceViolation = true;
          const geofencePolicy = orgSettings?.geofencePolicy || 'WARN';

          if (geofencePolicy === 'BLOCK' && !params.bypassGeofenceWarn) {
            const blockedReply = `Outside approved site boundary (${geofenceEval.distanceMeters}m away from ${geofenceEval.siteName}). Punch blocked by organization policy.`;
            whatsappService.recordMessage(params.tenantId, {
              id: `msg_out_${Date.now()}`,
              tenantId: params.tenantId,
              workerId: worker.id,
              workerName: worker.name,
              fromPhone: cleanPhone,
              direction: 'OUTBOUND',
              content: blockedReply,
              timestamp: new Date().toISOString(),
              type: 'TEXT',
              channel: 'WHATSAPP'
            });
            return { replyMessage: blockedReply, command, worker };
          }

          // Warn policy: flag in E9 anomaly engine / route to E3 Inbox
          try {
            await inboxService.createCustomItem(params.tenantId, {
              id: `inbox-wa-geofence-${worker.id}-${Date.now()}`,
              tenantId: params.tenantId,
              actionType: 'ATTENDANCE_EXCEPTION',
              urgency: 'HIGH',
              status: 'PENDING',
              workerId: worker.id,
              workerName: worker.name,
              workerPhone: cleanPhone,
              workerDesignation: worker.designation,
              workerPhotoUrl: params.photoUrl || worker.photoUrl,
              title: `WhatsApp Punch Outside Geofence (${geofenceEval.distanceMeters}m)`,
              description: `${worker.name} clocked ${punchType} via WhatsApp ${geofenceEval.distanceMeters}m outside ${geofenceEval.siteName}. Flagged in E9 anomaly engine.`,
              timestamp: serverTimestamp,
              details: {
                geofenceViolation: true,
                distanceMeters: geofenceEval.distanceMeters,
                punchLocation: { lat: params.location.lat, lng: params.location.lng },
                reason: 'WhatsApp field punch executed outside calibrated boundary'
              }
            });
          } catch (e) {
            console.warn('Failed to route WhatsApp geofence warning to inbox:', e);
          }
        }
      }

      // Selfie Verification / Anomaly Engine Integration (Edge Case 1: selfie not theirs)
      let selfieStatus: 'VERIFIED' | 'VERIFICATION_PENDING' | 'FAILED' = 'VERIFIED';
      let isAnomaly = false;
      let anomalyReason: string | undefined;

      if (params.isSelfieMismatch) {
        selfieStatus = 'VERIFICATION_PENDING';
        isAnomaly = true;
        anomalyReason = 'Selfie mismatch detected on WhatsApp channel (buddy-punching risk)';

        try {
          await inboxService.createCustomItem(params.tenantId, {
            id: `inbox-wa-selfie-${worker.id}-${Date.now()}`,
            tenantId: params.tenantId,
            actionType: 'ATTENDANCE_EXCEPTION',
            urgency: 'URGENT',
            status: 'PENDING',
            workerId: worker.id,
            workerName: worker.name,
            workerPhone: cleanPhone,
            workerDesignation: worker.designation,
            workerPhotoUrl: params.photoUrl || worker.photoUrl,
            title: 'WhatsApp Selfie Mismatch (E9 Anomaly)',
            description: `${worker.name} clocked ${punchType} via WhatsApp with an unrecognised selfie image. Marked VERIFICATION_PENDING and routed to supervisor.`,
            timestamp: serverTimestamp,
            details: {
              reason: 'Selfie face does not match enrolled profile descriptor (WhatsApp channel)'
            } as any
          });
        } catch (e) {
          console.warn('Failed to route selfie anomaly to inbox:', e);
        }
      }

      // Build New Punch Object with channel = 'WHATSAPP'
      const clientPunchId = `wa_punch_${worker.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newPunch: Punch = {
        timestamp: serverTimestamp,
        serverTimestamp,
        type: punchType,
        device: `WhatsApp Bot (+91 ${cleanPhone.slice(-10)})`,
        method: 'WHATSAPP',
        channel: 'WHATSAPP',
        location: params.location ? { lat: params.location.lat, lng: params.location.lng } : { lat: siteConfig.lat, lng: siteConfig.lng },
        accuracy: params.location ? 20 : 65,
        siteName,
        punchId: clientPunchId,
        geofenceViolation: isGeofenceViolation,
        selfieUrl: params.photoUrl || worker.photoUrl,
        selfieVerificationStatus: selfieStatus,
        trustScore: isAnomaly ? 45 : (isGeofenceViolation ? 65 : 90)
      };

      // Build or update AttendanceRecord
      const auditTrailEntry: AttendanceAuditTrailEntry = {
        id: `audit_${Date.now()}`,
        channel: 'WHATSAPP',
        source: 'WhatsApp Business API Bridge',
        timestamp: serverTimestamp,
        ipOrPhone: cleanPhone,
        action: punchType === 'IN' ? 'PUNCH_IN' : 'PUNCH_OUT',
        notes: isGeofenceViolation ? `Punched outside geofence (${siteName})` : `Punched inside ${siteName}`
      };

      if (!todayRecord) {
        todayRecord = {
          id: `${params.tenantId}_${worker.id}_${todayDate}`,
          tenantId: params.tenantId,
          workerId: worker.id,
          workerName: worker.name,
          date: todayDate,
          shiftId: worker.shiftId || 'default',
          status: 'PRESENT',
          timeline: [newPunch],
          channel: 'WHATSAPP',
          auditTrail: [auditTrailEntry],
          lateStatus: { isLate: false, lateByMins: 0, penaltyApplied: false },
          hours: { gross: 0, net: 0, overtime: 0 }
        };
      } else {
        todayRecord.timeline = [...(todayRecord.timeline || []), newPunch];
        todayRecord.channel = 'WHATSAPP';
        todayRecord.auditTrail = [...(todayRecord.auditTrail || []), auditTrailEntry];
        if (todayRecord.status === 'ABSENT' || todayRecord.status === 'WEEKLY_OFF') {
          todayRecord.status = 'PRESENT';
        }
      }

      // Persist in DB
      await dbService.markAttendance(todayRecord);

      // Construct friendly response
      let successReply = '';
      if (punchType === 'IN') {
        successReply = `✅ Punched in at ${timeFormatted} — inside [${siteName}].\n(Channel: WhatsApp Verified • ID: ${clientPunchId.slice(-6)})`;
        if (isGeofenceViolation) {
          successReply += `\n⚠️ Note: You clocked in slightly outside calibrated site boundary. Routed to supervisor.`;
        }
        if (isAnomaly) {
          successReply += `\n⚠️ Photo verification pending supervisor review.`;
        }
      } else {
        successReply = `✅ Punched out at ${timeFormatted} — [${siteName}].\nShift recorded successfully via WhatsApp. Have a good evening!`;
      }

      whatsappService.recordMessage(params.tenantId, {
        id: `msg_out_${Date.now()}`,
        tenantId: params.tenantId,
        workerId: worker.id,
        workerName: worker.name,
        fromPhone: cleanPhone,
        direction: 'OUTBOUND',
        content: successReply,
        timestamp: new Date().toISOString(),
        type: 'TEXT',
        commandRecognized: punchType === 'IN' ? 'PUNCH_IN' : 'PUNCH_OUT',
        channel: 'WHATSAPP',
        isAnomaly,
        anomalyReason
      });

      return {
        replyMessage: successReply,
        command,
        worker,
        punchRecord: todayRecord,
        isAnomaly,
        anomalyReason
      };
    }

    // ------------------------------------------------------------------
    // COMMAND: HELP / MENU or UNRECOGNISED
    // Top Edge Case 3: Short menu reply (payslip, schedule, attendance, IN, OUT, balance, leave)
    // Never generic "I don't understand".
    // ------------------------------------------------------------------
    const menuReply = `नमस्ते ${worker.name}! WorkforcePro WhatsApp Assistant:\nSend any of these commands / इन में से कोई कमांड भेजें:\n• IN — Clock in (हाजिरी इन)\n• OUT — Clock out (हाजिरी आउट)\n• payslip — Get my payslip link\n• schedule — Today's shift & duty\n• attendance — Month's presence summary\n• balance — Advance/Kharchi status\n• leave — Leave balances & apply\n• STOP — Unsubscribe from reminders`;

    whatsappService.recordMessage(params.tenantId, {
      id: `msg_out_${Date.now()}`,
      tenantId: params.tenantId,
      workerId: worker.id,
      workerName: worker.name,
      fromPhone: cleanPhone,
      direction: 'OUTBOUND',
      content: menuReply,
      timestamp: new Date().toISOString(),
      type: 'INTERACTIVE_MENU',
      channel: 'WHATSAPP'
    });

    return { replyMessage: menuReply, command: 'HELP_MENU', worker };
  },

  /**
   * Record message to chat store for preview/simulation
   */
  recordMessage: (tenantId: string, msg: WhatsAppMessage) => {
    const list = getStoredMessages(tenantId);
    saveStoredMessages(tenantId, [msg, ...list]);
  },

  /**
   * Clear message history (for simulator reset)
   */
  clearMessages: (tenantId: string) => {
    saveStoredMessages(tenantId, []);
  },

  // --------------------------------------------------------------------
  // PROACTIVE NOTIFICATION TRIGGERS (Key ACs)
  // Shift reminders, approval outcomes, payroll-ready payslip, missing punch-out
  // --------------------------------------------------------------------

  /**
   * Shift Reminder Proactive Notification
   */
  sendShiftReminder: async (
    tenantId: string, 
    worker: Worker, 
    shift: ShiftConfig, 
    siteName = 'Production Site #1'
  ): Promise<{ delivered: boolean; reason?: string }> => {
    const config = getStoredConfig(tenantId);
    if (!config.enabled || !config.enableShiftReminders || !config.enableProactiveNotifications) {
      return { delivered: false, reason: 'Notifications disabled by tenant' };
    }
    if (whatsappService.isPhoneOptedOut(worker.phone)) {
      return { delivered: false, reason: 'Worker opted out via STOP' };
    }

    const { cleanPhone } = validateWorkerPhone(worker.phone);
    const content = `⏰ Shift Reminder / पाली की सूचना:\nनमस्ते ${worker.name}! Your shift (${shift.name}) starts at ${shift.startTime} at ${siteName}.\nSend "IN" when you arrive to punch in!`;

    whatsappService.recordMessage(tenantId, {
      id: `proactive_shift_${Date.now()}`,
      tenantId,
      workerId: worker.id,
      workerName: worker.name,
      fromPhone: cleanPhone,
      direction: 'OUTBOUND',
      content,
      timestamp: new Date().toISOString(),
      type: 'TEMPLATE',
      channel: 'WHATSAPP'
    });

    return { delivered: true };
  },

  /**
   * Advance / Request Approval Outcome Notification
   */
  sendApprovalOutcome: async (
    tenantId: string,
    worker: Worker,
    amount: number,
    status: 'APPROVED' | 'REJECTED',
    notes?: string
  ): Promise<{ delivered: boolean; reason?: string }> => {
    const config = getStoredConfig(tenantId);
    if (!config.enabled || !config.enableAdvanceApprovals || !config.enableProactiveNotifications) {
      return { delivered: false, reason: 'Notifications disabled by tenant' };
    }
    if (whatsappService.isPhoneOptedOut(worker.phone)) {
      return { delivered: false, reason: 'Worker opted out via STOP' };
    }

    const { cleanPhone } = validateWorkerPhone(worker.phone);
    const icon = status === 'APPROVED' ? '✅' : '❌';
    const statusText = status === 'APPROVED' ? 'स्वीकृत / APPROVED' : 'अस्वीकृत / REJECTED';
    let content = `${icon} Advance Request Update / खर्ची अनुरोध:\nनमस्ते ${worker.name}! Your request for ₹${amount.toLocaleString('en-IN')} has been ${statusText}.`;
    if (notes) content += `\nNote: ${notes}`;

    whatsappService.recordMessage(tenantId, {
      id: `proactive_approval_${Date.now()}`,
      tenantId,
      workerId: worker.id,
      workerName: worker.name,
      fromPhone: cleanPhone,
      direction: 'OUTBOUND',
      content,
      timestamp: new Date().toISOString(),
      type: 'TEMPLATE',
      channel: 'WHATSAPP'
    });

    return { delivered: true };
  },

  /**
   * Payroll-Ready Payslip Notification
   */
  sendPayslipReadyNotification: async (
    tenantId: string,
    worker: Worker,
    monthStr?: string
  ): Promise<{ delivered: boolean; universalUrl?: string; reason?: string }> => {
    const config = getStoredConfig(tenantId);
    if (!config.enabled || !config.enablePayslipReady || !config.enableProactiveNotifications) {
      return { delivered: false, reason: 'Notifications disabled by tenant' };
    }
    if (whatsappService.isPhoneOptedOut(worker.phone)) {
      return { delivered: false, reason: 'Worker opted out via STOP' };
    }

    const targetMonth = monthStr || new Date().toISOString().slice(0, 7);
    const linkRes = await magicLinkService.createWorkerMagicLink({
      tenantId,
      worker,
      scope: 'PAYSLIP',
      channel: 'WHATSAPP',
      issuedBy: 'payroll_engine',
      ttlHours: 72,
      targetMonth
    });

    const { cleanPhone } = validateWorkerPhone(worker.phone);
    const content = `📄 Payslip Ready / वेतन पर्ची तैयार है:\nनमस्ते ${worker.name}! Your payslip for ${targetMonth} is ready.\n🔗 Secure Link: ${linkRes.universalUrl}\n(PII kept secure outside chat • Valid for 72h)`;

    whatsappService.recordMessage(tenantId, {
      id: `proactive_payslip_${Date.now()}`,
      tenantId,
      workerId: worker.id,
      workerName: worker.name,
      fromPhone: cleanPhone,
      direction: 'OUTBOUND',
      content,
      timestamp: new Date().toISOString(),
      type: 'TEMPLATE',
      scopedLinkUrl: linkRes.universalUrl,
      channel: 'WHATSAPP'
    });

    return { delivered: true, universalUrl: linkRes.universalUrl };
  },

  /**
   * Missing Punch-Out Alert
   */
  sendMissingPunchOutAlert: async (
    tenantId: string,
    worker: Worker,
    siteName = 'Production Site #1'
  ): Promise<{ delivered: boolean; reason?: string }> => {
    const config = getStoredConfig(tenantId);
    if (!config.enabled || !config.enableMissingPunchOut || !config.enableProactiveNotifications) {
      return { delivered: false, reason: 'Notifications disabled by tenant' };
    }
    if (whatsappService.isPhoneOptedOut(worker.phone)) {
      return { delivered: false, reason: 'Worker opted out via STOP' };
    }

    const { cleanPhone } = validateWorkerPhone(worker.phone);
    const content = `⚠️ Missing Punch-Out / चेक-आउट रिमाइंडर:\nनमस्ते ${worker.name}! You punched in today at ${siteName}, but no punch-out has been recorded yet.\nIf your shift has ended, please reply "OUT" now to record your check-out.`;

    whatsappService.recordMessage(tenantId, {
      id: `proactive_missing_${Date.now()}`,
      tenantId,
      workerId: worker.id,
      workerName: worker.name,
      fromPhone: cleanPhone,
      direction: 'OUTBOUND',
      content,
      timestamp: new Date().toISOString(),
      type: 'TEMPLATE',
      channel: 'WHATSAPP'
    });

    return { delivered: true };
  }
};
