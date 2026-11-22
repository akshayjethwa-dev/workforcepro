import { InboxItem, UserProfile } from '../types/index';

export type AnomalyKind =
  | 'GEOFENCE'
  | 'MOCK_GPS'
  | 'ROOTED_DEVICE'
  | 'EMULATOR'
  | 'CUSTOM_ROM'
  | 'OVERTIME'
  | 'LATE'
  | 'CONFLICT'
  | 'OTHER';

export interface SimplifiedInboxPresentation {
  anomalyKind: AnomalyKind;
  headline: string;
  subtext: string;
  categoryLabel: string;
  overtimeBadge?: string;
  hasTechnicalDetails: boolean;
}

/**
 * Role gate: Only CA or Super Admin (including Channel Partner/CA agency or Super Admin impersonating)
 * may open technical GPS coordinates, geofence maps, and raw attestation telemetry.
 */
export function canAccessTechnicalInboxDetails(
  profile: UserProfile | null | undefined,
  isImpersonating = false
): boolean {
  if (!profile) return false;
  return (
    profile.role === 'SUPER_ADMIN' ||
    profile.role === 'CA' ||
    profile.role === 'RESELLER' ||
    isImpersonating
  );
}

/**
 * Formats a distance in meters cleanly for manager-facing copy (e.g., 2000 -> "2km", 1450 -> "1.5km", 350 -> "350m").
 */
export function formatDistanceShort(distanceMeters: number): string {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return 'outside the site';
  if (distanceMeters >= 1000) {
    const km = distanceMeters / 1000;
    const rounded = Math.round(km * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}km`;
  }
  return `${Math.round(distanceMeters)}m`;
}

/**
 * Formats overtime pay concisely (e.g. "1.5x Overtime (₹300)").
 */
export function formatOvertimeBadge(multiplier: number, amount: number): string {
  const cleanMult = Number.isInteger(multiplier) ? `${multiplier}` : `${Number(multiplier.toFixed(2))}`;
  return `${cleanMult}x Overtime (₹${Math.round(amount).toLocaleString('en-IN')})`;
}

function getFirstName(fullName: string): string {
  const trimmed = (fullName || 'Worker').trim();
  return trimmed.split(/\s+/)[0] || 'Worker';
}

function formatClockTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  const label = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  return `${label} ${rounded === 1 ? 'hour' : 'hours'}`;
}

/**
 * Translates any Action Inbox item (geofence violation, mock GPS, rooted phone, overtime, late punch,
 * conflict, advance, etc.) into plain-English manager copy with zero raw GPS coordinates or system jargon.
 */
export function getSimplifiedInboxPresentation(item: InboxItem): SimplifiedInboxPresentation {
  const details = item.details || {};
  const firstName = getFirstName(item.workerName);
  const punchTypeVerb = details.punch?.type === 'OUT' ? 'punched out' : 'punched in';
  const combinedRawText = `${item.title || ''} ${item.description || ''} ${details.reason || ''}`.toLowerCase();

  const punchTimeText = formatClockTime(details.punch?.timestamp || item.timestamp);
  const shiftSuffix = details.shiftName ? ` • ${details.shiftName.split('(')[0].trim()}` : '';

  const hasTechnicalDetails = Boolean(
    details.geofenceViolation ||
      details.distanceMeters ||
      details.punchLocation ||
      details.baseLocation ||
      details.isMockGps ||
      details.isRootedDevice ||
      details.isEmulator ||
      details.isCustomRom ||
      details.deviceIntegrityFailed ||
      details.deviceFingerprint ||
      details.deviceModel ||
      details.overtimeHours ||
      details.conflict ||
      (details.punchHistory && details.punchHistory.length > 0) ||
      details.punch?.location
  );

  // 1. Overtime approval (Edge Case: e.g., "1.5x Overtime (₹300)")
  if (
    item.actionType === 'OVERTIME_APPROVAL' ||
    (typeof details.overtimeHours === 'number' && details.overtimeHours > 0)
  ) {
    const hours = details.overtimeHours || 2;
    const multiplier = details.overtimeMultiplier || 1.5;
    const hourlyRate = details.overtimeHourlyRate || 100;
    const payableAmount =
      typeof details.overtimePayableAmount === 'number'
        ? details.overtimePayableAmount
        : typeof item.amount === 'number'
        ? item.amount
        : Math.round(hours * hourlyRate * multiplier);

    const badge = formatOvertimeBadge(multiplier, payableAmount);

    return {
      anomalyKind: 'OVERTIME',
      headline: `${firstName} worked ${formatHours(hours)} extra — ${badge}`,
      subtext: `${details.shiftName ? details.shiftName.split('(')[0].trim() : 'Extra shift hours'} • Approve to include ₹${Math.round(payableAmount).toLocaleString('en-IN')} in payroll.`,
      categoryLabel: 'Overtime Approval',
      overtimeBadge: badge,
      hasTechnicalDetails: true,
    };
  }

  // 2. Rooted / Jailbroken device
  const isRooted =
    Boolean(details.isRootedDevice) ||
    combinedRawText.includes('rooted') ||
    combinedRawText.includes('jailbroken') ||
    combinedRawText.includes('bootloader unlocked') ||
    combinedRawText.includes('magisk');

  if (isRooted) {
    return {
      anomalyKind: 'ROOTED_DEVICE',
      headline: `${firstName}'s device was rooted (unsafe).`,
      subtext: `Punch flagged for security review${punchTimeText ? ` at ${punchTimeText}` : ''}. Approve only if you verified ${firstName} is on site.`,
      categoryLabel: 'Unsafe Device',
      hasTechnicalDetails: true,
    };
  }

  // 3. Emulator / Virtual device
  const isEmulator = Boolean(details.isEmulator) || combinedRawText.includes('emulator');
  if (isEmulator) {
    return {
      anomalyKind: 'EMULATOR',
      headline: `${firstName}'s device looks like an emulator (unsafe).`,
      subtext: `Punch blocked automatically${punchTimeText ? ` at ${punchTimeText}` : ''}. Approve only after checking in person.`,
      categoryLabel: 'Unsafe Device',
      hasTechnicalDetails: true,
    };
  }

  // 4. Custom ROM
  const isCustomRom = Boolean(details.isCustomRom) || combinedRawText.includes('lineageos') || combinedRawText.includes('custom rom');
  if (isCustomRom) {
    return {
      anomalyKind: 'CUSTOM_ROM',
      headline: `${firstName}'s phone is running a modified OS (unsafe).`,
      subtext: `Device security check did not pass${punchTimeText ? ` at ${punchTimeText}` : ''}.`,
      categoryLabel: 'Device Warning',
      hasTechnicalDetails: true,
    };
  }

  // 5. Mock GPS / Fake location app
  const isMockGps =
    Boolean(details.isMockGps) ||
    combinedRawText.includes('mock gps') ||
    combinedRawText.includes('mock location') ||
    combinedRawText.includes('spoofed location') ||
    combinedRawText.includes('fake gps');

  if (isMockGps) {
    const distanceNote =
      details.distanceMeters && details.distanceMeters > 0
        ? ` (${formatDistanceShort(details.distanceMeters)} away from the site)`
        : '';
    return {
      anomalyKind: 'MOCK_GPS',
      headline: `${firstName} used a fake GPS app while punching in${distanceNote}.`,
      subtext: `Location spoofing was detected${punchTimeText ? ` at ${punchTimeText}` : ''}${shiftSuffix}.`,
      categoryLabel: 'Fake GPS Alert',
      hasTechnicalDetails: true,
    };
  }

  // 6. Out-of-bounds / Geofence violation
  if (details.geofenceViolation || (typeof details.distanceMeters === 'number' && details.distanceMeters > 0)) {
    const distanceStr = formatDistanceShort(details.distanceMeters || 0);
    return {
      anomalyKind: 'GEOFENCE',
      headline: `${firstName} ${punchTypeVerb} ${distanceStr} away from the site.`,
      subtext: `${punchTimeText ? `Recorded at ${punchTimeText}` : 'Recorded outside site boundary'}${shiftSuffix}.`,
      categoryLabel: 'Out of Bounds',
      hasTechnicalDetails: true,
    };
  }

  // 7. Late arrival
  if (typeof details.lateMinutes === 'number' && details.lateMinutes > 0) {
    return {
      anomalyKind: 'LATE',
      headline: `${firstName} arrived ${details.lateMinutes} mins late.`,
      subtext: details.reason
        ? `Reason given: ${details.reason}`
        : `${punchTimeText ? `Punched in at ${punchTimeText}` : 'Arrived after shift grace period'}${shiftSuffix}.`,
      categoryLabel: 'Late Arrival',
      hasTechnicalDetails,
    };
  }

  // 8. Dual-device / Offline punch conflict
  if (item.actionType === 'CONFLICT_RESOLUTION' || details.conflict) {
    return {
      anomalyKind: 'CONFLICT',
      headline: `${firstName} has two conflicting punches recorded.`,
      subtext: `Approve to keep the verified shift punch, or reject to discard the duplicate entry.`,
      categoryLabel: 'Punch Conflict',
      hasTechnicalDetails: true,
    };
  }

  // 9. Unregistered / revoked device
  if (combinedRawText.includes('unregistered') || combinedRawText.includes('revoked device')) {
    return {
      anomalyKind: 'ROOTED_DEVICE',
      headline: `${firstName} punched in from an unapproved phone.`,
      subtext: `This device is not linked to ${firstName}'s profile${punchTimeText ? ` (${punchTimeText})` : ''}.`,
      categoryLabel: 'Unapproved Device',
      hasTechnicalDetails: true,
    };
  }

  // 10. Default (Advance / EWA / Payroll / Leave / FnF)
  return {
    anomalyKind: 'OTHER',
    headline: item.title,
    subtext: item.description,
    categoryLabel:
      item.actionType === 'ADVANCE_APPROVAL'
        ? 'Advance Request'
        : item.actionType === 'PAYROLL_SIGNOFF'
        ? 'Payroll Review'
        : item.actionType === 'LEAVE_REQUEST'
        ? 'Leave Request'
        : item.actionType === 'FNF_DEADLINE_BREACH'
        ? 'Final Settlement'
        : 'Attendance Alert',
    hasTechnicalDetails,
  };
}
