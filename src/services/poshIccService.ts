// src/services/poshIccService.ts
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  AnnualPoshDistrictReport,
  EncryptedComplaintPayload,
  IccCommitteeConfig,
  IccMember,
  IccMemberRole,
  PoshActorContext,
  PoshComplaintRecord,
  PoshComplaintStatus,
  PoshComplaintView,
  PoshConfidentialDetails,
  PoshFindingOutcome,
  PoshInquiryEntry,
  PoshThresholdEvaluation,
  PoshTimelineStatus,
  PoshWorkshopRecord,
  Worker,
} from '../types/index';
import { dbService } from './db';
import { tenantSecurityService } from './tenantSecurityService';

const CONFIG_STORAGE_KEY = 'wfpro_posh_icc_configs_v1';
const COMPLAINTS_STORAGE_KEY = 'wfpro_posh_complaints_v1';
const WORKSHOPS_STORAGE_KEY = 'wfpro_posh_workshops_v1';
const SEEDED_STORAGE_KEY = 'wfpro_posh_seeded_tenants_v1';

const DAY_MS = 24 * 60 * 60 * 1000;

function isDemoTenant(tenantId: string): boolean {
  return !tenantId || tenantId === 'demo-tenant-id' || tenantId.startsWith('demo-');
}

function getStorageItem<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function setStorageItem<T>(key: string, value: T): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // ignore storage quota failures
  }
}

// In-memory store for SSR / Node verification environments where localStorage may not exist
const memoryConfigs = new Map<string, IccCommitteeConfig>();
const memoryComplaints = new Map<string, PoshComplaintRecord[]>();
const memoryWorkshops = new Map<string, PoshWorkshopRecord[]>();

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getSubtleCrypto(): SubtleCrypto {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error('Web Crypto SubtleCrypto is required for AES-256-GCM POSH complaint encryption.');
  }
  return cryptoObj.subtle;
}

async function deriveTenantAesKey(tenantId: string, keyId: string): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const encoder = new TextEncoder();
  const material = encoder.encode(`wfpro-posh-aes256-gcm::${tenantId}::${keyId}`);
  const digest = await subtle.digest('SHA-256', material);
  return subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptConfidentialPayload(
  details: PoshConfidentialDetails,
  tenantId: string,
  keyId = 'posh-key-v1'
): Promise<EncryptedComplaintPayload> {
  const subtle = getSubtleCrypto();
  const key = await deriveTenantAesKey(tenantId, keyId);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(details));
  const encryptedBuf = await subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  return {
    algorithm: 'AES-GCM-256',
    keyId,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuf)),
    encryptedAt: new Date().toISOString(),
  };
}

export async function decryptConfidentialPayload(
  envelope: EncryptedComplaintPayload,
  tenantId: string
): Promise<PoshConfidentialDetails> {
  if (!envelope || envelope.algorithm !== 'AES-GCM-256') {
    throw new Error('Unsupported or corrupted POSH encryption envelope.');
  }
  const subtle = getSubtleCrypto();
  const key = await deriveTenantAesKey(tenantId, envelope.keyId || 'posh-key-v1');
  const ivBytes = base64ToBytes(envelope.iv);
  const cipherBytes = base64ToBytes(envelope.ciphertext);
  const decryptedBuf = await subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(ivBytes) },
    key,
    new Uint8Array(cipherBytes)
  );
  const jsonText = new TextDecoder().decode(decryptedBuf);
  return JSON.parse(jsonText) as PoshConfidentialDetails;
}

function addDaysIso(isoOrDate: string, days: number): string {
  const d = new Date(isoOrDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function computePoshTimeline(
  record: Pick<
    PoshComplaintRecord,
    'filedAt' | 'status' | 'inquiryCompletedAt' | 'reportSubmittedAt'
  >,
  asOfDate: Date = new Date()
): PoshTimelineStatus {
  const filedMs = new Date(record.filedAt).getTime();
  const asOfMs = asOfDate.getTime();
  const daysElapsed = Math.max(0, Math.floor((asOfMs - filedMs) / DAY_MS));

  const inquiryDeadlineAt = addDaysIso(record.filedAt, 90);
  const inquiryDeadlineMs = new Date(inquiryDeadlineAt).getTime();
  const inquiryDaysRemaining = Math.ceil((inquiryDeadlineMs - asOfMs) / DAY_MS);

  const isDisposedOrStopped =
    record.status === 'CLOSED' ||
    record.status === 'ACTION_TAKEN' ||
    record.status === 'REFERRED_TO_LOCAL_COMMITTEE';

  const inquiryActive = !record.inquiryCompletedAt && !isDisposedOrStopped && record.status !== 'REPORT_SUBMITTED';

  const isDay60ReminderDue = inquiryActive && daysElapsed >= 60 && daysElapsed < 80;
  const isDay80EscalationDue = inquiryActive && daysElapsed >= 80 && daysElapsed <= 90;
  const isInquiryOverdue = inquiryActive && daysElapsed > 90;
  const isPendingOver90Days = !isDisposedOrStopped && daysElapsed > 90;

  let reportDeadlineAt: string | undefined;
  let reportDaysRemaining: number | undefined;
  let isReportOverdue = false;

  if (record.inquiryCompletedAt) {
    reportDeadlineAt = addDaysIso(record.inquiryCompletedAt, 10);
    const reportDeadlineMs = new Date(reportDeadlineAt).getTime();
    reportDaysRemaining = Math.ceil((reportDeadlineMs - asOfMs) / DAY_MS);
    if (!record.reportSubmittedAt && !isDisposedOrStopped && reportDaysRemaining < 0) {
      isReportOverdue = true;
    }
  }

  const employerActionDeadlineAt = record.reportSubmittedAt
    ? addDaysIso(record.reportSubmittedAt, 60)
    : undefined;

  let slaStage: PoshTimelineStatus['slaStage'] = 'ON_TRACK';
  if (isDisposedOrStopped) {
    slaStage = 'COMPLETED';
  } else if (isReportOverdue) {
    slaStage = 'REPORT_OVERDUE';
  } else if (record.inquiryCompletedAt && !record.reportSubmittedAt) {
    slaStage = 'REPORT_10D_DUE';
  } else if (isInquiryOverdue) {
    slaStage = 'INQUIRY_OVERDUE_90D';
  } else if (isDay80EscalationDue) {
    slaStage = 'DAY_80_URGENT';
  } else if (isDay60ReminderDue) {
    slaStage = 'DAY_60_REMINDER';
  }

  return {
    filedDate: record.filedAt.slice(0, 10),
    daysElapsed,
    inquiryDeadlineAt,
    inquiryDaysRemaining,
    isDay60ReminderDue,
    isDay80EscalationDue,
    isInquiryOverdue,
    isPendingOver90Days,
    inquiryCompletedAt: record.inquiryCompletedAt,
    reportDeadlineAt,
    reportSubmittedAt: record.reportSubmittedAt,
    reportDaysRemaining,
    isReportOverdue,
    employerActionDeadlineAt,
    slaStage,
  };
}

export function evaluateIccCompliance(
  iccConfig: IccCommitteeConfig | null,
  activeEmployeeCount: number
): PoshThresholdEvaluation {
  const formalIccMandatory = activeEmployeeCount >= 10;
  const hasPresidingOfficer = Boolean(iccConfig?.presidingOfficer?.isActive && iccConfig.presidingOfficer.name.trim());
  const activeInternal = (iccConfig?.internalMembers || []).filter(
    (m: IccMember) => m.isActive && m.name.trim().length > 0
  );
  const internalMembersCount = activeInternal.length;
  const hasExternalMember = Boolean(
    iccConfig?.externalMember?.isActive &&
      iccConfig.externalMember.name.trim() &&
      (iccConfig.externalMember.organization?.trim() || iccConfig.externalMember.designation.trim())
  );

  const missingRequirements: string[] = [];
  if (!hasPresidingOfficer) {
    missingRequirements.push('Presiding Officer (senior-level woman employee)');
  }
  if (internalMembersCount < 2) {
    missingRequirements.push(`At least 2 Internal Members (currently ${internalMembersCount})`);
  }
  if (!hasExternalMember) {
    missingRequirements.push('1 Mandatory External Member (NGO / women’s cause / legal specialist)');
  }

  const isIccComplete = missingRequirements.length === 0;
  const isIccValid = formalIccMandatory ? isIccComplete : true;

  let advisoryNote = '';
  if (!formalIccMandatory) {
    advisoryNote = `Workforce count is ${activeEmployeeCount} (< 10 statutory threshold). Formal ICC constitution is legally relaxed under Sec 4 of the POSH Act, 2013; complaints remain enabled and may be handled via optional ICC or referred to the District Local Committee (${iccConfig?.localCommitteeDistrict || 'District Officer'}).`;
  } else if (isIccComplete) {
    advisoryNote = `Workforce count is ${activeEmployeeCount} (>= 10 statutory threshold). Formal Internal Committee (ICC) is validly constituted with Presiding Officer, ${internalMembersCount} Internal Members, and mandatory External Member.`;
  } else {
    advisoryNote = `Mandatory ICC incomplete for ${activeEmployeeCount} employees (>= 10 threshold). Missing: ${missingRequirements.join('; ')}.`;
  }

  return {
    activeEmployeeCount,
    thresholdLimit: 10,
    formalIccMandatory,
    isIccValid,
    hasPresidingOfficer,
    internalMembersCount,
    hasExternalMember,
    missingRequirements,
    advisoryNote,
  };
}

function normalizeText(value?: string): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getAllIccMembers(iccConfig: IccCommitteeConfig | null): IccMember[] {
  if (!iccConfig) return [];
  const list: IccMember[] = [];
  if (iccConfig.presidingOfficer && iccConfig.presidingOfficer.isActive) {
    list.push(iccConfig.presidingOfficer);
  }
  iccConfig.internalMembers.forEach((m: IccMember) => {
    if (m.isActive) list.push(m);
  });
  if (iccConfig.externalMember && iccConfig.externalMember.isActive) {
    list.push(iccConfig.externalMember);
  }
  return list;
}

export function detectComplaintConflictOfInterest(params: {
  respondentName: string;
  respondentWorkerId?: string;
  iccConfig: IccCommitteeConfig | null;
}): {
  conflictOfInterest: boolean;
  recusedMemberIds: string[];
  recusedMemberNames: string[];
  routedToExternalMember: boolean;
  assignedHandlerRole: IccMemberRole | 'LOCAL_COMMITTEE';
  assignedHandlerName: string;
} {
  const members = getAllIccMembers(params.iccConfig);
  const normRespName = normalizeText(params.respondentName);

  const matched = members.filter((m: IccMember) => {
    if (params.respondentWorkerId && m.workerId && m.workerId === params.respondentWorkerId) {
      return true;
    }
    if (normRespName && normalizeText(m.name) === normRespName) {
      return true;
    }
    return false;
  });

  if (matched.length === 0) {
    const poName = params.iccConfig?.presidingOfficer?.name;
    const extName = params.iccConfig?.externalMember?.name;
    return {
      conflictOfInterest: false,
      recusedMemberIds: [],
      recusedMemberNames: [],
      routedToExternalMember: false,
      assignedHandlerRole: poName ? 'PRESIDING_OFFICER' : extName ? 'EXTERNAL_MEMBER' : 'LOCAL_COMMITTEE',
      assignedHandlerName: poName || extName || 'District Local Committee (LC)',
    };
  }

  const recusedIds = matched.map((m: IccMember) => m.id);
  const recusedNames = matched.map((m: IccMember) => m.name);
  const externalMember = params.iccConfig?.externalMember;
  const externalIsAccused = externalMember ? recusedIds.includes(externalMember.id) : false;

  if (externalMember && externalMember.isActive && !externalIsAccused) {
    return {
      conflictOfInterest: true,
      recusedMemberIds: recusedIds,
      recusedMemberNames: recusedNames,
      routedToExternalMember: true,
      assignedHandlerRole: 'EXTERNAL_MEMBER',
      assignedHandlerName: `${externalMember.name} (External Member)`,
    };
  }

  return {
    conflictOfInterest: true,
    recusedMemberIds: recusedIds,
    recusedMemberNames: recusedNames,
    routedToExternalMember: true,
    assignedHandlerRole: 'LOCAL_COMMITTEE',
    assignedHandlerName: `District Local Committee (${params.iccConfig?.localCommitteeDistrict || 'District Officer'})`,
  };
}

function createDefaultIccConfig(tenantId: string): IccCommitteeConfig {
  return {
    tenantId,
    presidingOfficer: {
      id: 'icc-po-1',
      role: 'PRESIDING_OFFICER',
      name: 'Anjali Nair',
      designation: 'Quality Assurance Lead',
      department: 'Quality',
      email: 'anjali.nair@workforcepro.demo',
      phone: '9876543216',
      workerId: 'worker-7',
      appointedDate: '2026-01-01',
      isWoman: true,
      isActive: true,
    },
    internalMembers: [
      {
        id: 'icc-int-1',
        role: 'INTERNAL_MEMBER',
        name: 'Priya Patel',
        designation: 'Quality Inspector',
        department: 'Quality',
        email: 'priya.patel@workforcepro.demo',
        phone: '9876543211',
        workerId: 'worker-2',
        appointedDate: '2026-01-01',
        isWoman: true,
        isActive: true,
      },
      {
        id: 'icc-int-2',
        role: 'INTERNAL_MEMBER',
        name: 'Vikram Desai',
        designation: 'Senior Turner',
        department: 'Production',
        email: 'vikram.desai@workforcepro.demo',
        phone: '9876543215',
        workerId: 'worker-6',
        appointedDate: '2026-01-01',
        isWoman: false,
        isActive: true,
      },
    ],
    externalMember: {
      id: 'icc-ext-1',
      role: 'EXTERNAL_MEMBER',
      name: 'Adv. Meera Joshi',
      designation: 'POSH Legal Counsel & NGO Advisor',
      organization: 'Nari Suraksha Kendra (Ahmedabad NGO)',
      email: 'meera.joshi@narisuraksha.org',
      phone: '9825011223',
      appointedDate: '2026-01-01',
      isWoman: true,
      isActive: true,
    },
    allowAnonymousComplaints: true,
    localCommitteeDistrict: 'Ahmedabad District Officer (LC)',
    localCommitteeEmail: 'lc-posh-ahmedabad@gujarat.gov.in',
    autoRemindDay60: true,
    autoRemindDay80: true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'System Initialization',
  };
}

async function ensureSeededTenantData(tenantId: string): Promise<void> {
  const seeded = getStorageItem<Record<string, boolean>>(SEEDED_STORAGE_KEY, {});
  if (seeded[tenantId] || memoryComplaints.has(tenantId)) return;

  const existingConfigs = getStorageItem<Record<string, IccCommitteeConfig>>(CONFIG_STORAGE_KEY, {});
  let config = existingConfigs[tenantId] || memoryConfigs.get(tenantId);
  if (!config) {
    config = createDefaultIccConfig(tenantId);
    existingConfigs[tenantId] = config;
    setStorageItem(CONFIG_STORAGE_KEY, existingConfigs);
    memoryConfigs.set(tenantId, config);
  }

  const existingComplaintsMap = getStorageItem<Record<string, PoshComplaintRecord[]>>(COMPLAINTS_STORAGE_KEY, {});
  if (!existingComplaintsMap[tenantId] || existingComplaintsMap[tenantId].length === 0) {
    const now = Date.now();
    const day64Ago = new Date(now - 64 * DAY_MS).toISOString();
    const day14Ago = new Date(now - 14 * DAY_MS).toISOString();
    const day120Ago = new Date(now - 120 * DAY_MS).toISOString();
    const day45Ago = new Date(now - 45 * DAY_MS).toISOString();
    const day40Ago = new Date(now - 40 * DAY_MS).toISOString();
    const day30Ago = new Date(now - 30 * DAY_MS).toISOString();

    const p1 = await encryptConfidentialPayload(
      {
        complainantName: 'Kavita Singh',
        complainantWorkerId: 'worker-5',
        complainantDepartment: 'Production',
        complainantPhone: '9876543214',
        respondentName: 'Sunil Verma',
        respondentWorkerId: 'worker-4',
        respondentRoleOrDept: 'Packaging Assistant · Packaging',
        incidentDate: day64Ago.slice(0, 10),
        incidentLocation: 'Bay 3 Packaging Corridor (Night Shift Handover)',
        incidentDescription:
          'Repeated unwelcome verbal remarks and intimidating proximity during shift handover despite verbal objection.',
        witnessDetails: 'Ramesh Sharma (CNC Operator) present near tool crib.',
        evidenceNotes: 'Shift log & corridor CCTV footage from handover window preserved.',
        conciliationRequested: false,
      },
      tenantId
    );

    const p2 = await encryptConfidentialPayload(
      {
        respondentName: 'Vikram Desai',
        respondentWorkerId: 'worker-6',
        respondentRoleOrDept: 'Senior Turner · Internal ICC Member',
        incidentDate: day14Ago.slice(0, 10),
        incidentLocation: 'Quality Inspection Cabin #2',
        incidentDescription:
          'Anonymous report alleging inappropriate comments and retaliatory shift allocation remarks during floor audit.',
        witnessDetails: 'Logged anonymously via Worker PWA Portal.',
        conciliationRequested: false,
      },
      tenantId
    );

    const p3 = await encryptConfidentialPayload(
      {
        complainantName: 'Priya Patel',
        complainantWorkerId: 'worker-2',
        complainantDepartment: 'Quality',
        respondentName: 'Contract Supervisor (Former)',
        respondentRoleOrDept: 'Contract Vendor Lead',
        incidentDate: day120Ago.slice(0, 10),
        incidentLocation: 'Loading Dock Annex',
        incidentDescription:
          'Unwanted messages and hostile language post shift hours reported to ICC for formal inquiry.',
        witnessDetails: 'Two quality team associates interviewed.',
        evidenceNotes: 'Written complaint & message transcripts verified during hearing.',
        conciliationRequested: false,
      },
      tenantId
    );

    const seededComplaints: PoshComplaintRecord[] = [
      {
        id: 'posh-case-seed-1',
        caseCode: `POSH-${new Date().getFullYear()}-001`,
        tenantId,
        filedAt: day64Ago,
        filedVia: 'WORKER_PWA',
        status: 'INQUIRY_IN_PROGRESS',
        isAnonymous: false,
        maskedComplainantAlias: 'Employee #W-005 (Confidential)',
        respondentIsIccMember: false,
        conflictOfInterest: false,
        recusedMemberIds: [],
        routedToExternalMember: false,
        assignedHandlerRole: 'PRESIDING_OFFICER',
        assignedHandlerName: 'Anjali Nair',
        encryptedPayload: p1,
        inquiryStartedAt: new Date(now - 60 * DAY_MS).toISOString(),
        findingOutcome: 'PENDING',
        reminder60SentAt: new Date(now - 4 * DAY_MS).toISOString(),
        inquiryTimeline: [
          {
            id: 'inq-1',
            loggedAt: day64Ago,
            loggedByMemberId: 'SYSTEM',
            loggedByName: 'Encrypted Intake Gateway',
            loggedByRole: 'SYSTEM',
            entryType: 'ACKNOWLEDGEMENT',
            summary: 'Encrypted complaint logged via Worker PWA. 90-day statutory inquiry clock started.',
          },
          {
            id: 'inq-2',
            loggedAt: new Date(now - 60 * DAY_MS).toISOString(),
            loggedByMemberId: 'icc-po-1',
            loggedByName: 'Anjali Nair',
            loggedByRole: 'PRESIDING_OFFICER',
            entryType: 'HEARING',
            summary: 'Notice issued to respondent under Sec 11; preliminary statements recorded.',
          },
        ],
        thresholdAtFiling: { activeEmployeeCount: 7, formalIccMandatory: false },
      },
      {
        id: 'posh-case-seed-2',
        caseCode: `POSH-${new Date().getFullYear()}-002`,
        tenantId,
        filedAt: day14Ago,
        filedVia: 'MAGIC_LINK',
        status: 'INQUIRY_IN_PROGRESS',
        isAnonymous: true,
        maskedComplainantAlias: 'Anonymous Complainant #7K2M',
        respondentIsIccMember: true,
        conflictOfInterest: true,
        recusedMemberIds: ['icc-int-2'],
        routedToExternalMember: true,
        assignedHandlerRole: 'EXTERNAL_MEMBER',
        assignedHandlerName: 'Adv. Meera Joshi (External Member)',
        encryptedPayload: p2,
        inquiryStartedAt: new Date(now - 11 * DAY_MS).toISOString(),
        findingOutcome: 'PENDING',
        inquiryTimeline: [
          {
            id: 'inq-3',
            loggedAt: day14Ago,
            loggedByMemberId: 'SYSTEM',
            loggedByName: 'POSH Governance Guard',
            loggedByRole: 'SYSTEM',
            entryType: 'CONFLICT_REASSIGNMENT',
            summary:
              'CONFLICT_OF_INTEREST detected: named respondent is an active ICC member. Member recused and docket routed directly to External Member.',
          },
        ],
        thresholdAtFiling: { activeEmployeeCount: 7, formalIccMandatory: false },
      },
      {
        id: 'posh-case-seed-3',
        caseCode: `POSH-${new Date().getFullYear()}-003`,
        tenantId,
        filedAt: day120Ago,
        filedVia: 'WEB_PORTAL',
        status: 'ACTION_TAKEN',
        isAnonymous: false,
        maskedComplainantAlias: 'Employee #W-002 (Confidential)',
        respondentIsIccMember: false,
        conflictOfInterest: false,
        recusedMemberIds: [],
        routedToExternalMember: false,
        assignedHandlerRole: 'PRESIDING_OFFICER',
        assignedHandlerName: 'Anjali Nair',
        encryptedPayload: p3,
        inquiryStartedAt: new Date(now - 115 * DAY_MS).toISOString(),
        inquiryCompletedAt: day45Ago,
        reportSubmittedAt: day40Ago,
        findingOutcome: 'SUBSTANTIATED',
        employerActionTaken: 'Vendor contract terminated & mandatory workplace conduct warning issued',
        employerActionDate: day30Ago.slice(0, 10),
        inquiryTimeline: [
          {
            id: 'inq-4',
            loggedAt: day45Ago,
            loggedByMemberId: 'icc-po-1',
            loggedByName: 'Anjali Nair',
            loggedByRole: 'PRESIDING_OFFICER',
            entryType: 'EVIDENCE_REVIEW',
            summary: 'Inquiry hearings concluded within 75 days (< 90-day statutory cap).',
          },
          {
            id: 'inq-5',
            loggedAt: day40Ago,
            loggedByMemberId: 'icc-ext-1',
            loggedByName: 'Adv. Meera Joshi',
            loggedByRole: 'EXTERNAL_MEMBER',
            entryType: 'REPORT_SUBMISSION',
            summary: 'Formal Sec 13 Inquiry Report submitted to Employer within 5 days (< 10-day SLA).',
          },
          {
            id: 'inq-6',
            loggedAt: day30Ago,
            loggedByMemberId: 'SYSTEM',
            loggedByName: 'Employer HR Head',
            loggedByRole: 'SYSTEM',
            entryType: 'EMPLOYER_ACTION',
            summary: 'Disciplinary & vendor removal action executed within 60-day employer window.',
          },
        ],
        thresholdAtFiling: { activeEmployeeCount: 7, formalIccMandatory: false },
      },
    ];

    existingComplaintsMap[tenantId] = seededComplaints;
    setStorageItem(COMPLAINTS_STORAGE_KEY, existingComplaintsMap);
    memoryComplaints.set(tenantId, seededComplaints);
  }

  const existingWorkshopsMap = getStorageItem<Record<string, PoshWorkshopRecord[]>>(WORKSHOPS_STORAGE_KEY, {});
  if (!existingWorkshopsMap[tenantId] || existingWorkshopsMap[tenantId].length === 0) {
    const yr = new Date().getFullYear();
    const seededWorkshops: PoshWorkshopRecord[] = [
      {
        id: 'ws-seed-1',
        tenantId,
        date: `${yr}-02-14`,
        title: 'POSH Act Awareness & Safe Shopfloor Conduct (Bilingual)',
        trainerName: 'Adv. Meera Joshi (Nari Suraksha Kendra)',
        attendeesCount: 24,
        mode: 'IN_PERSON',
        notes: 'Covered Sec 2 definition, confidential ICC escalation, and zero-retaliation guarantee.',
      },
      {
        id: 'ws-seed-2',
        tenantId,
        date: `${yr}-07-10`,
        title: 'ICC Members Statutory Inquiry Procedure & 90-Day SLA Refresher',
        trainerName: 'Adv. Meera Joshi',
        attendeesCount: 6,
        mode: 'ONLINE',
        notes: 'Mandatory annual capacity building for ICC Presiding Officer and members.',
      },
    ];
    existingWorkshopsMap[tenantId] = seededWorkshops;
    setStorageItem(WORKSHOPS_STORAGE_KEY, existingWorkshopsMap);
    memoryWorkshops.set(tenantId, seededWorkshops);
  }

  seeded[tenantId] = true;
  setStorageItem(SEEDED_STORAGE_KEY, seeded);
}

export const poshIccService = {
  encryptConfidentialPayload,
  decryptConfidentialPayload,
  computePoshTimeline,
  evaluateIccCompliance,
  detectComplaintConflictOfInterest,
  getAllIccMembers,

  async getIccConfig(tenantId: string): Promise<IccCommitteeConfig> {
    if (isDemoTenant(tenantId)) {
      await ensureSeededTenantData(tenantId);
    }

    const mem = memoryConfigs.get(tenantId);
    if (mem) return mem;

    const stored = getStorageItem<Record<string, IccCommitteeConfig>>(CONFIG_STORAGE_KEY, {});
    if (stored[tenantId]) {
      memoryConfigs.set(tenantId, stored[tenantId]);
      return stored[tenantId];
    }

    if (!isDemoTenant(tenantId)) {
      try {
        const snap = await getDoc(doc(db, 'posh_icc_configs', tenantId));
        if (snap.exists()) {
          const cfg = snap.data() as IccCommitteeConfig;
          memoryConfigs.set(tenantId, cfg);
          stored[tenantId] = cfg;
          setStorageItem(CONFIG_STORAGE_KEY, stored);
          return cfg;
        }
      } catch (err) {
        console.warn('Firestore getIccConfig fallback:', err);
      }
    }

    const fresh = createDefaultIccConfig(tenantId);
    memoryConfigs.set(tenantId, fresh);
    stored[tenantId] = fresh;
    setStorageItem(CONFIG_STORAGE_KEY, stored);
    return fresh;
  },

  async saveIccConfig(
    tenantId: string,
    config: IccCommitteeConfig,
    workers: Worker[],
    updatedBy = 'Admin'
  ): Promise<{ saved: IccCommitteeConfig; thresholdEvaluation: PoshThresholdEvaluation }> {
    const activeCount = workers.filter((w: Worker) => w.status !== 'INACTIVE' && w.isActive !== false).length;
    const evaluation = evaluateIccCompliance(config, activeCount);

    const payload: IccCommitteeConfig = {
      ...config,
      tenantId,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };

    memoryConfigs.set(tenantId, payload);
    const stored = getStorageItem<Record<string, IccCommitteeConfig>>(CONFIG_STORAGE_KEY, {});
    stored[tenantId] = payload;
    setStorageItem(CONFIG_STORAGE_KEY, stored);

    if (!isDemoTenant(tenantId)) {
      try {
        await setDoc(doc(db, 'posh_icc_configs', tenantId), payload, { merge: true });
      } catch (err) {
        console.warn('Firestore saveIccConfig fallback:', err);
      }
    }

    try {
      await tenantSecurityService.logTenantAccess({
        tenantId,
        userId: updatedBy,
        userEmail: updatedBy,
        userRole: 'FACTORY_OWNER',
        action: 'UPDATE_POSH_ICC_CONFIG',
        resource: `posh_icc_configs/${tenantId}`,
        status: 'SUCCESS',
        details: {
          activeEmployeeCount: activeCount,
          formalIccMandatory: evaluation.formalIccMandatory,
          isIccValid: evaluation.isIccValid,
          allowAnonymousComplaints: payload.allowAnonymousComplaints,
        },
      });
    } catch {
      // non-blocking
    }

    return { saved: payload, thresholdEvaluation: evaluation };
  },

  async getComplaints(tenantId: string): Promise<PoshComplaintRecord[]> {
    if (isDemoTenant(tenantId)) {
      await ensureSeededTenantData(tenantId);
    }

    const mem = memoryComplaints.get(tenantId);
    if (mem) return mem;

    const stored = getStorageItem<Record<string, PoshComplaintRecord[]>>(COMPLAINTS_STORAGE_KEY, {});
    if (stored[tenantId]) {
      memoryComplaints.set(tenantId, stored[tenantId]);
      return stored[tenantId];
    }

    if (!isDemoTenant(tenantId)) {
      try {
        const q = query(collection(db, 'posh_complaints'), where('tenantId', '==', tenantId));
        const snap = await getDocs(q);
        const list = snap.docs
          .map((d) => ({ ...d.data(), id: d.id } as PoshComplaintRecord))
          .sort((a: PoshComplaintRecord, b: PoshComplaintRecord) => b.filedAt.localeCompare(a.filedAt));
        memoryComplaints.set(tenantId, list);
        stored[tenantId] = list;
        setStorageItem(COMPLAINTS_STORAGE_KEY, stored);
        return list;
      } catch (err) {
        console.warn('Firestore getComplaints fallback:', err);
      }
    }

    return [];
  },

  async saveComplaints(tenantId: string, list: PoshComplaintRecord[]): Promise<void> {
    const sorted = [...list].sort((a: PoshComplaintRecord, b: PoshComplaintRecord) =>
      b.filedAt.localeCompare(a.filedAt)
    );
    memoryComplaints.set(tenantId, sorted);
    const stored = getStorageItem<Record<string, PoshComplaintRecord[]>>(COMPLAINTS_STORAGE_KEY, {});
    stored[tenantId] = sorted;
    setStorageItem(COMPLAINTS_STORAGE_KEY, stored);
  },

  async submitComplaint(params: {
    tenantId: string;
    filedVia: 'WEB_PORTAL' | 'WORKER_PWA' | 'MAGIC_LINK';
    isAnonymous: boolean;
    complainantName?: string;
    complainantWorkerId?: string;
    complainantDepartment?: string;
    complainantPhone?: string;
    respondentName: string;
    respondentWorkerId?: string;
    respondentRoleOrDept?: string;
    incidentDate: string;
    incidentLocation: string;
    incidentDescription: string;
    witnessDetails?: string;
    evidenceNotes?: string;
    conciliationRequested?: boolean;
    workers?: Worker[];
    filedAtOverride?: string;
  }): Promise<{
    success: boolean;
    error?: string;
    errorCode?: 'ANONYMOUS_DISABLED_BY_POLICY' | 'VALIDATION_ERROR';
    complaint?: PoshComplaintRecord;
    thresholdEvaluation?: PoshThresholdEvaluation;
  }> {
    if (!params.respondentName.trim() || !params.incidentDescription.trim() || !params.incidentDate) {
      return {
        success: false,
        errorCode: 'VALIDATION_ERROR',
        error: 'Respondent name, incident date, and confidential description are required.',
      };
    }

    const iccConfig = await poshIccService.getIccConfig(params.tenantId);

    if (params.isAnonymous && !iccConfig.allowAnonymousComplaints) {
      return {
        success: false,
        errorCode: 'ANONYMOUS_DISABLED_BY_POLICY',
        error:
          'Anonymous POSH filing is disabled under current organization policy. Please include complainant details or contact an ICC member directly.',
      };
    }

    if (!params.isAnonymous && !params.complainantName?.trim()) {
      return {
        success: false,
        errorCode: 'VALIDATION_ERROR',
        error: 'Complainant name is required when anonymous mode is off.',
      };
    }

    const workersList = params.workers || (await dbService.getWorkers(params.tenantId).catch((): Worker[] => []));
    const activeEmployeeCount = workersList.filter(
      (w: Worker) => w.status !== 'INACTIVE' && w.isActive !== false
    ).length;
    const thresholdEvaluation = evaluateIccCompliance(iccConfig, activeEmployeeCount);

    // Build confidential payload; strictly omit complainant identity when anonymous
    const confidentialDetails: PoshConfidentialDetails = {
      ...(params.isAnonymous
        ? {}
        : {
            complainantName: params.complainantName?.trim(),
            complainantWorkerId: params.complainantWorkerId,
            complainantDepartment: params.complainantDepartment,
            complainantPhone: params.complainantPhone,
          }),
      respondentName: params.respondentName.trim(),
      respondentWorkerId: params.respondentWorkerId,
      respondentRoleOrDept: params.respondentRoleOrDept?.trim(),
      incidentDate: params.incidentDate,
      incidentLocation: params.incidentLocation.trim() || 'Workplace Premises',
      incidentDescription: params.incidentDescription.trim(),
      witnessDetails: params.witnessDetails?.trim() || undefined,
      evidenceNotes: params.evidenceNotes?.trim() || undefined,
      conciliationRequested: Boolean(params.conciliationRequested),
    };

    const encryptedPayload = await encryptConfidentialPayload(confidentialDetails, params.tenantId);

    const conflict = detectComplaintConflictOfInterest({
      respondentName: params.respondentName,
      respondentWorkerId: params.respondentWorkerId,
      iccConfig,
    });

    const existing = await poshIccService.getComplaints(params.tenantId);
    const nowIso = params.filedAtOverride || new Date().toISOString();
    const yr = new Date(nowIso).getFullYear();
    const seq = String(existing.length + 1).padStart(3, '0');
    const randSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();

    const maskedComplainantAlias = params.isAnonymous
      ? `Anonymous Complainant #${randSuffix}`
      : params.complainantWorkerId
      ? `Employee #${params.complainantWorkerId.replace('worker-', 'W-')} (Masked)`
      : `Employee Reporter #${randSuffix} (Masked)`;

    const initialStatus: PoshComplaintStatus =
      !thresholdEvaluation.formalIccMandatory && !thresholdEvaluation.hasExternalMember && !thresholdEvaluation.hasPresidingOfficer
        ? 'REFERRED_TO_LOCAL_COMMITTEE'
        : 'FILED';

    const timelineEntries: PoshInquiryEntry[] = [
      {
        id: `inq-${Date.now()}-1`,
        loggedAt: nowIso,
        loggedByMemberId: 'SYSTEM',
        loggedByName: 'Encrypted Intake Gateway',
        loggedByRole: 'SYSTEM',
        entryType: 'ACKNOWLEDGEMENT',
        summary: `Encrypted POSH complaint logged via ${params.filedVia}. AES-256-GCM encrypted at rest. 90-day inquiry SLA initialized.`,
      },
    ];

    if (conflict.conflictOfInterest) {
      timelineEntries.push({
        id: `inq-${Date.now()}-2`,
        loggedAt: nowIso,
        loggedByMemberId: 'SYSTEM',
        loggedByName: 'POSH Governance Guard',
        loggedByRole: 'SYSTEM',
        entryType: 'CONFLICT_REASSIGNMENT',
        summary: `CONFLICT_OF_INTEREST flagged: Accused ICC member(s) recused automatically and barred from accessing record. Routed directly to ${conflict.assignedHandlerName}.`,
      });
    }

    const record: PoshComplaintRecord = {
      id: `posh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      caseCode: `POSH-${yr}-${seq}`,
      tenantId: params.tenantId,
      filedAt: nowIso,
      filedVia: params.filedVia,
      status: initialStatus,
      isAnonymous: params.isAnonymous,
      maskedComplainantAlias,
      respondentIsIccMember: conflict.conflictOfInterest,
      conflictOfInterest: conflict.conflictOfInterest,
      recusedMemberIds: conflict.recusedMemberIds,
      routedToExternalMember: conflict.routedToExternalMember,
      assignedHandlerRole: conflict.assignedHandlerRole,
      assignedHandlerName: conflict.assignedHandlerName,
      encryptedPayload,
      findingOutcome: 'PENDING',
      inquiryTimeline: timelineEntries,
      thresholdAtFiling: {
        activeEmployeeCount,
        formalIccMandatory: thresholdEvaluation.formalIccMandatory,
      },
    };

    await poshIccService.saveComplaints(params.tenantId, [record, ...existing]);

    if (!isDemoTenant(params.tenantId)) {
      try {
        await setDoc(doc(db, 'posh_complaints', record.id), record);
      } catch (err) {
        console.warn('Firestore submitComplaint fallback:', err);
      }
    }

    // Notify ONLY non-recused ICC handler (strict confidentiality — no PII or narrative in notification)
    try {
      await dbService.addNotification({
        tenantId: params.tenantId,
        title: conflict.conflictOfInterest
          ? `ICC Confidential Alert (Conflict of Interest): ${record.caseCode}`
          : `New Confidential POSH Docket: ${record.caseCode}`,
        message: conflict.conflictOfInterest
          ? `Routed exclusively to External Member (${conflict.assignedHandlerName}). Recused ICC member access blocked. 90-day inquiry SLA active.`
          : `Assigned to ICC (${conflict.assignedHandlerName}). Only authorized ICC members may decrypt dossier. 90-day inquiry deadline applies.`,
        type: conflict.conflictOfInterest ? 'WARNING' : 'ALERT',
        read: false,
        createdAt: nowIso,
      });
    } catch {
      // non-blocking
    }

    try {
      await tenantSecurityService.logTenantAccess({
        tenantId: params.tenantId,
        userId: params.isAnonymous ? 'anonymous-posh-filer' : params.complainantWorkerId || 'employee',
        userEmail: 'confidential@posh-intake.internal',
        userRole: 'WORKER',
        action: conflict.conflictOfInterest ? 'POSH_COMPLAINT_CONFLICT_ROUTED' : 'POSH_COMPLAINT_FILED',
        resource: `posh_complaints/${record.caseCode}`,
        status: 'SUCCESS',
        details: {
          caseCode: record.caseCode,
          encryptedAlgorithm: record.encryptedPayload.algorithm,
          conflictOfInterest: record.conflictOfInterest,
          routedToExternalMember: record.routedToExternalMember,
          isAnonymous: record.isAnonymous,
        },
      });
    } catch {
      // non-blocking
    }

    return {
      success: true,
      complaint: record,
      thresholdEvaluation,
    };
  },

  canActorDecryptComplaint(
    record: PoshComplaintRecord,
    iccConfig: IccCommitteeConfig | null,
    actor: PoshActorContext
  ): {
    allowed: boolean;
    redactionReason?: 'NON_ICC_ADMIN_STATUS_ONLY' | 'CONFLICT_OF_INTEREST_RECUSED';
  } {
    if (actor.actorType !== 'ICC_MEMBER') {
      return { allowed: false, redactionReason: 'NON_ICC_ADMIN_STATUS_ONLY' };
    }

    const activeMembers = getAllIccMembers(iccConfig);
    const matchedMember = activeMembers.find(
      (m: IccMember) =>
        (actor.iccMemberId && m.id === actor.iccMemberId) ||
        (actor.workerId && m.workerId && m.workerId === actor.workerId) ||
        (actor.email && m.email && normalizeText(m.email) === normalizeText(actor.email))
    );

    if (!matchedMember) {
      return { allowed: false, redactionReason: 'NON_ICC_ADMIN_STATUS_ONLY' };
    }

    if (
      record.conflictOfInterest &&
      (record.recusedMemberIds.includes(matchedMember.id) ||
        (matchedMember.workerId && record.recusedMemberIds.some((rid: string) => rid === matchedMember.id)))
    ) {
      return { allowed: false, redactionReason: 'CONFLICT_OF_INTEREST_RECUSED' };
    }

    return { allowed: true };
  },

  async projectComplaintForActor(
    record: PoshComplaintRecord,
    iccConfig: IccCommitteeConfig | null,
    actor: PoshActorContext,
    asOfDate: Date = new Date()
  ): Promise<PoshComplaintView> {
    const timeline = computePoshTimeline(record, asOfDate);
    const access = poshIccService.canActorDecryptComplaint(record, iccConfig, actor);

    if (!access.allowed) {
      return {
        record,
        timeline,
        canViewDetails: false,
        redactionReason: access.redactionReason,
        decryptedDetails: null,
        visibleComplainantLabel: record.maskedComplainantAlias,
        visibleRespondentLabel:
          access.redactionReason === 'CONFLICT_OF_INTEREST_RECUSED'
            ? '[RECUSED — CONFLICT_OF_INTEREST]'
            : '[CONFIDENTIAL — ICC EYES ONLY]',
      };
    }

    const decryptedDetails = await decryptConfidentialPayload(record.encryptedPayload, record.tenantId);

    // Enforce anonymous masking even inside ICC view if complainant filed anonymously
    const visibleComplainantLabel = record.isAnonymous
      ? `${record.maskedComplainantAlias} (Identity Masked)`
      : decryptedDetails.complainantName || record.maskedComplainantAlias;

    return {
      record,
      timeline,
      canViewDetails: true,
      decryptedDetails,
      visibleComplainantLabel,
      visibleRespondentLabel: decryptedDetails.respondentName,
    };
  },

  async projectComplaintsForActor(
    records: PoshComplaintRecord[],
    iccConfig: IccCommitteeConfig | null,
    actor: PoshActorContext,
    asOfDate: Date = new Date()
  ): Promise<PoshComplaintView[]> {
    return Promise.all(
      records.map((r: PoshComplaintRecord) =>
        poshIccService.projectComplaintForActor(r, iccConfig, actor, asOfDate)
      )
    );
  },

  async dispatchDueSlaReminders(
    tenantId: string,
    asOfDate: Date = new Date()
  ): Promise<{ day60SentCount: number; day80SentCount: number }> {
    const complaints = await poshIccService.getComplaints(tenantId);
    let day60SentCount = 0;
    let day80SentCount = 0;
    let modified = false;
    const nowIso = asOfDate.toISOString();

    const updated = await Promise.all(
      complaints.map(async (c: PoshComplaintRecord) => {
        const tl = computePoshTimeline(c, asOfDate);
        let next = { ...c };

        if (tl.isDay60ReminderDue && !c.reminder60SentAt) {
          next.reminder60SentAt = nowIso;
          day60SentCount++;
          modified = true;
          try {
            await dbService.addNotification({
              tenantId,
              title: `POSH Day 60 Statutory Reminder · ${c.caseCode}`,
              message: `60+ days elapsed on ICC inquiry assigned to ${c.assignedHandlerName}. ${tl.inquiryDaysRemaining} days remain in mandatory 90-day inquiry window.`,
              type: 'ALERT',
              read: false,
              createdAt: nowIso,
            });
          } catch {
            // ignore
          }
        }

        if (tl.isDay80EscalationDue && !c.reminder80SentAt) {
          next.reminder80SentAt = nowIso;
          day80SentCount++;
          modified = true;
          try {
            await dbService.addNotification({
              tenantId,
              title: `URGENT Day 80 POSH SLA Alert · ${c.caseCode}`,
              message: `Day 80 threshold reached on ${c.caseCode}. Mandatory 90-day inquiry completion deadline is ${tl.inquiryDeadlineAt.slice(0, 10)}.`,
              type: 'WARNING',
              read: false,
              createdAt: nowIso,
            });
          } catch {
            // ignore
          }
        }

        return next;
      })
    );

    if (modified) {
      await poshIccService.saveComplaints(tenantId, updated);
    }
    return { day60SentCount, day80SentCount };
  },

  async logInquiryAction(params: {
    tenantId: string;
    complaintId: string;
    actor: PoshActorContext;
    entryType: PoshInquiryEntry['entryType'];
    summary: string;
    actionDate?: string;
    findingOutcome?: PoshFindingOutcome;
    employerActionTaken?: string;
  }): Promise<{ success: boolean; error?: string; updated?: PoshComplaintRecord }> {
    const iccConfig = await poshIccService.getIccConfig(params.tenantId);
    const complaints = await poshIccService.getComplaints(params.tenantId);
    const idx = complaints.findIndex((c: PoshComplaintRecord) => c.id === params.complaintId);
    if (idx === -1) {
      return { success: false, error: 'Complaint docket not found.' };
    }
    const target = complaints[idx];
    const timestamp = params.actionDate ? new Date(params.actionDate).toISOString() : new Date().toISOString();

    // Employer action is recorded after ICC report submission
    if (params.entryType === 'EMPLOYER_ACTION') {
      if (target.status !== 'REPORT_SUBMITTED' && target.status !== 'ACTION_TAKEN') {
        return {
          success: false,
          error: 'Employer action can only be recorded after the ICC submits its formal Inquiry Report.',
        };
      }
      const nextRecord: PoshComplaintRecord = {
        ...target,
        status: 'ACTION_TAKEN',
        employerActionTaken: params.employerActionTaken || params.summary,
        employerActionDate: timestamp.slice(0, 10),
        inquiryTimeline: [
          ...target.inquiryTimeline,
          {
            id: `inq-${Date.now()}`,
            loggedAt: timestamp,
            loggedByMemberId: params.actor.userId || 'EMPLOYER_ADMIN',
            loggedByName: params.actor.name || 'Employer / HR Head',
            loggedByRole: 'SYSTEM',
            entryType: 'EMPLOYER_ACTION',
            summary: params.summary,
          },
        ],
      };
      complaints[idx] = nextRecord;
      await poshIccService.saveComplaints(params.tenantId, complaints);
      if (!isDemoTenant(params.tenantId)) {
        setDoc(doc(db, 'posh_complaints', nextRecord.id), nextRecord, { merge: true }).catch(() => {});
      }
      return { success: true, updated: nextRecord };
    }

    // All other inquiry actions require a non-recused ICC member
    const access = poshIccService.canActorDecryptComplaint(target, iccConfig, params.actor);
    if (!access.allowed) {
      return {
        success: false,
        error:
          access.redactionReason === 'CONFLICT_OF_INTEREST_RECUSED'
            ? 'Access blocked: You are recused due to CONFLICT_OF_INTEREST.'
            : 'Only active non-recused ICC members can conduct or update an ICC inquiry.',
      };
    }

    const updated: PoshComplaintRecord = { ...target };
    if (params.entryType === 'HEARING' || params.entryType === 'CONCILIATION') {
      if (updated.status === 'FILED') {
        updated.status = 'INQUIRY_IN_PROGRESS';
        updated.inquiryStartedAt = updated.inquiryStartedAt || timestamp;
      }
    } else if (params.entryType === 'EVIDENCE_REVIEW') {
      // Marks inquiry hearings completed -> begins 10-day Report Submission clock
      updated.inquiryCompletedAt = updated.inquiryCompletedAt || timestamp;
      if (updated.status === 'FILED') updated.status = 'INQUIRY_IN_PROGRESS';
    } else if (params.entryType === 'REPORT_SUBMISSION') {
      updated.inquiryCompletedAt = updated.inquiryCompletedAt || timestamp;
      updated.reportSubmittedAt = timestamp;
      updated.status = 'REPORT_SUBMITTED';
      if (params.findingOutcome) {
        updated.findingOutcome = params.findingOutcome;
      }
    } else if (params.entryType === 'LOCAL_COMMITTEE_REFERRAL') {
      updated.status = 'REFERRED_TO_LOCAL_COMMITTEE';
    }

    updated.inquiryTimeline = [
      ...updated.inquiryTimeline,
      {
        id: `inq-${Date.now()}`,
        loggedAt: timestamp,
        loggedByMemberId: params.actor.iccMemberId || 'ICC',
        loggedByName: params.actor.name || 'ICC Member',
        loggedByRole: params.actor.iccRole || 'INTERNAL_MEMBER',
        entryType: params.entryType,
        summary: params.summary,
      },
    ];

    complaints[idx] = updated;
    await poshIccService.saveComplaints(params.tenantId, complaints);
    if (!isDemoTenant(params.tenantId)) {
      setDoc(doc(db, 'posh_complaints', updated.id), updated, { merge: true }).catch(() => {});
    }

    return { success: true, updated };
  },

  async closeComplaintDocket(
    tenantId: string,
    complaintId: string,
    actor: PoshActorContext
  ): Promise<{ success: boolean; error?: string; updated?: PoshComplaintRecord }> {
    const iccConfig = await poshIccService.getIccConfig(tenantId);
    const complaints = await poshIccService.getComplaints(tenantId);
    const idx = complaints.findIndex((c: PoshComplaintRecord) => c.id === complaintId);
    if (idx === -1) return { success: false, error: 'Docket not found.' };
    const target = complaints[idx];
    const access = poshIccService.canActorDecryptComplaint(target, iccConfig, actor);
    if (!access.allowed && actor.actorType !== 'GENERAL_ADMIN') {
      return { success: false, error: 'Unauthorized or recused.' };
    }
    const updated: PoshComplaintRecord = {
      ...target,
      status: 'CLOSED',
    };
    complaints[idx] = updated;
    await poshIccService.saveComplaints(tenantId, complaints);
    return { success: true, updated };
  },

  async getWorkshops(tenantId: string): Promise<PoshWorkshopRecord[]> {
    if (isDemoTenant(tenantId)) {
      await ensureSeededTenantData(tenantId);
    }

    const mem = memoryWorkshops.get(tenantId);
    if (mem) return mem;

    const stored = getStorageItem<Record<string, PoshWorkshopRecord[]>>(WORKSHOPS_STORAGE_KEY, {});
    if (stored[tenantId]) {
      memoryWorkshops.set(tenantId, stored[tenantId]);
      return stored[tenantId];
    }

    if (!isDemoTenant(tenantId)) {
      try {
        const q = query(collection(db, 'posh_workshops'), where('tenantId', '==', tenantId));
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as PoshWorkshopRecord));
        memoryWorkshops.set(tenantId, list);
        stored[tenantId] = list;
        setStorageItem(WORKSHOPS_STORAGE_KEY, stored);
        return list;
      } catch (err) {
        console.warn('Firestore getWorkshops fallback:', err);
      }
    }

    return [];
  },

  async addWorkshop(
    tenantId: string,
    workshop: Omit<PoshWorkshopRecord, 'id' | 'tenantId'>
  ): Promise<PoshWorkshopRecord> {
    const existing = await poshIccService.getWorkshops(tenantId);
    const rec: PoshWorkshopRecord = {
      ...workshop,
      id: `ws-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenantId,
    };
    const next = [rec, ...existing].sort((a: PoshWorkshopRecord, b: PoshWorkshopRecord) =>
      b.date.localeCompare(a.date)
    );
    memoryWorkshops.set(tenantId, next);
    const stored = getStorageItem<Record<string, PoshWorkshopRecord[]>>(WORKSHOPS_STORAGE_KEY, {});
    stored[tenantId] = next;
    setStorageItem(WORKSHOPS_STORAGE_KEY, stored);

    if (!isDemoTenant(tenantId)) {
      setDoc(doc(db, 'posh_workshops', rec.id), rec).catch(() => {});
    }

    return rec;
  },

  generateAnnualPoshDistrictReport(params: {
    year: number;
    tenantId: string;
    companyName: string;
    iccConfig: IccCommitteeConfig;
    complaints: PoshComplaintRecord[];
    workshops: PoshWorkshopRecord[];
    activeEmployeeCount: number;
    asOfDate?: Date;
  }): AnnualPoshDistrictReport {
    const { year, tenantId, companyName, iccConfig, complaints, workshops, activeEmployeeCount } = params;
    const evaluation = evaluateIccCompliance(iccConfig, activeEmployeeCount);
    const asOfDate = params.asOfDate || new Date();

    const yearComplaints = complaints.filter(
      (c: PoshComplaintRecord) => new Date(c.filedAt).getFullYear() === year
    );
    const yearWorkshops = workshops.filter(
      (w: PoshWorkshopRecord) => new Date(w.date).getFullYear() === year
    );

    const disposedStatuses: PoshComplaintStatus[] = [
      'ACTION_TAKEN',
      'CLOSED',
      'REFERRED_TO_LOCAL_COMMITTEE',
    ];

    const complaintsReceivedCount = yearComplaints.length;
    const complaintsDisposedCount = yearComplaints.filter((c: PoshComplaintRecord) =>
      disposedStatuses.includes(c.status)
    ).length;

    const pendingComplaints = yearComplaints.filter(
      (c: PoshComplaintRecord) => !disposedStatuses.includes(c.status)
    );
    const complaintsPendingOver90DaysCount = pendingComplaints.filter((c: PoshComplaintRecord) => {
      const tl = computePoshTimeline(c, asOfDate);
      return tl.isPendingOver90Days;
    }).length;
    const complaintsPendingUnder90DaysCount = pendingComplaints.length - complaintsPendingOver90DaysCount;

    const workshopParticipantsTotal = yearWorkshops.reduce(
      (sum: number, w: PoshWorkshopRecord) => sum + (w.attendeesCount || 0),
      0
    );

    const actionCounts = new Map<string, number>();
    yearComplaints.forEach((c: PoshComplaintRecord) => {
      const label = c.employerActionTaken?.trim()
        ? c.employerActionTaken.trim()
        : c.status === 'REFERRED_TO_LOCAL_COMMITTEE'
        ? 'Referred to District Local Committee'
        : c.status === 'REPORT_SUBMITTED'
        ? 'ICC Report Submitted — Employer Action Pending'
        : c.conflictOfInterest
        ? 'Inquiry Active under External Member (Conflict Recusal)'
        : 'Inquiry in Progress (Sec 11)';
      actionCounts.set(label, (actionCounts.get(label) || 0) + 1);
    });

    const natureOfActionsSummary = Array.from(actionCounts.entries()).map(([action, count]) => ({
      action,
      count,
    }));

    const presidingOfficerName = iccConfig.presidingOfficer?.name || 'Not Constituted';
    const externalMemberName = iccConfig.externalMember?.name || 'Not Constituted';
    const generatedAt = new Date().toISOString();

    const lines = [
      '====================================================================',
      'ANNUAL REPORT UNDER SECTION 21 OF THE POSH ACT, 2013 & RULE 14',
      '(For Submission to District Officer & Inclusion in Annual Report)',
      '====================================================================',
      `Organization Name          : ${companyName}`,
      `Calendar Year              : ${year}`,
      `District Officer / LC      : ${iccConfig.localCommitteeDistrict}`,
      `Active Workforce Strength  : ${activeEmployeeCount} employees (${evaluation.formalIccMandatory ? 'Formal ICC Mandatory >= 10' : 'Below 10 threshold — Sec 4 relaxed'})`,
      `ICC Presiding Officer      : ${presidingOfficerName}`,
      `Mandatory External Member  : ${externalMemberName}`,
      `Generated At               : ${generatedAt}`,
      '--------------------------------------------------------------------',
      'STATUTORY DISCLOSURES (RULE 14):',
      `  1. Number of complaints of sexual harassment received in ${year} : ${complaintsReceivedCount}`,
      `  2. Number of complaints disposed off during ${year}               : ${complaintsDisposedCount}`,
      `  3. Number of cases pending for more than 90 days                : ${complaintsPendingOver90DaysCount}`,
      `     (Cases pending <= 90 days: ${complaintsPendingUnder90DaysCount})`,
      `  4. Number of workshops / awareness programmes carried out       : ${yearWorkshops.length} (${workshopParticipantsTotal} participants)`,
      '  5. Nature of action taken by the employer / District Officer:',
      ...(natureOfActionsSummary.length > 0
        ? natureOfActionsSummary.map((item) => `     - ${item.action} (${item.count})`)
        : ['     - Nil complaints recorded during the period']),
      '--------------------------------------------------------------------',
      'CONFIDENTIALITY NOTICE: In compliance with Section 16 of the POSH Act,',
      'identities of complainants, respondents, and witnesses are strictly',
      'excluded from this statutory return.',
      '====================================================================',
    ];

    return {
      year,
      tenantId,
      companyName,
      districtOfficerJurisdiction: iccConfig.localCommitteeDistrict,
      generatedAt,
      activeEmployeeCount,
      formalIccMandatory: evaluation.formalIccMandatory,
      iccConstituted: evaluation.hasPresidingOfficer && evaluation.hasExternalMember,
      presidingOfficerName,
      externalMemberName,
      complaintsReceivedCount,
      complaintsDisposedCount,
      complaintsPendingOver90DaysCount,
      complaintsPendingUnder90DaysCount,
      workshopsConductedCount: yearWorkshops.length,
      workshopParticipantsTotal,
      natureOfActionsSummary,
      reportText: lines.join('\n'),
    };
  },
};
