export type ScheduleValidationRuleKey = 
  | 'DOUBLE_BOOKING'
  | 'REST_PERIOD'
  | 'OVERTIME_RISK'
  | 'AVAILABILITY_MISMATCH'
  | 'SKILL_MISMATCH'
  | 'COVERAGE_GAP'
  | 'PUBLIC_HOLIDAY';

export type ScheduleRuleSeverity = 'BLOCK' | 'WARN' | 'IGNORE';

export interface ScheduleRuleConfig {
  key: ScheduleValidationRuleKey;
  name: string;
  description: string;
  severity: ScheduleRuleSeverity;
  enabled: boolean;
}

export interface ScheduleValidationRulesConfig {
  rules: Record<ScheduleValidationRuleKey, ScheduleRuleConfig>;
  minRestHours: number; // Configurable minimum rest period, default 11 hours
  weeklyOvertimeThresholdHours: number; // Configurable weekly max standard hours, default 48
  allowOverrideOnBlock: boolean; // default false
}

export interface RosterShift {
  id: string;
  tenantId: string;
  rosterScheduleId?: string;
  date: string; // YYYY-MM-DD
  shiftConfigId: string;
  shiftName: string;
  startTime: string; // HH:mm (e.g. "08:00")
  endTime: string;   // HH:mm (e.g. "17:00")
  durationHours: number;
  assignedWorkerId?: string; // empty means Open Shift / Coverage Gap
  assignedWorkerName?: string;
  workerDesignation?: string;
  requiredSkill?: string;
  department?: string;
  status: 'DRAFT' | 'PUBLISHED';
  notes?: string;
}

export interface ScheduleConflictDetails {
  conflictingShiftId?: string;
  conflictingShiftName?: string;
  conflictingShiftDate?: string;
  restHoursBetween?: number;
  requiredRestHours?: number;
  actualHoursWorked?: number;
  scheduledHoursWorked?: number;
  projectedTotalHours?: number;
  overtimeThreshold?: number;
  requiredSkill?: string;
  workerSkill?: string;
  holidayName?: string;
  holidayMultiplier?: number;
  declaredOffDay?: string;
}

export interface ScheduleConflict {
  id: string;
  ruleKey: ScheduleValidationRuleKey;
  severity: ScheduleRuleSeverity;
  title: string;
  message: string;
  shiftId: string;
  shiftDate: string;
  shiftName: string;
  shiftHours: number;
  workerId?: string;
  workerName?: string;
  details: ScheduleConflictDetails;
  isOverridden?: boolean;
  overrideReason?: string;
  overriddenBy?: string;
  overriddenAt?: string;
}

export interface ScheduleOverrideAudit {
  id: string;
  tenantId: string;
  conflictId: string;
  ruleKey: ScheduleValidationRuleKey;
  ruleName: string;
  shiftId: string;
  workerId?: string;
  workerName?: string;
  schedulerUserId: string;
  schedulerName: string;
  reason: string;
  timestamp: string;
}

export interface ScheduleImpactAlert {
  id: string;
  tenantId: string;
  workerId: string;
  workerName: string;
  shiftId: string;
  shiftDate: string;
  shiftName: string;
  conflictType: 'AVAILABILITY_CHANGED' | 'OFF_DAY_MODIFIED';
  message: string;
  detectedAt: string;
  resolved: boolean;
}

export interface RosterSchedule {
  id: string;
  tenantId: string;
  name: string;
  weekStartDate: string; // YYYY-MM-DD
  weekEndDate: string;   // YYYY-MM-DD
  status: 'DRAFT' | 'PUBLISHED' | 'IMPACTED';
  shifts: RosterShift[];
  impactAlerts?: ScheduleImpactAlert[];
  overrides?: ScheduleOverrideAudit[];
  publishedAt?: string;
  publishedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_SCHEDULE_RULES_CONFIG: ScheduleValidationRulesConfig = {
  minRestHours: 11,
  weeklyOvertimeThresholdHours: 48,
  allowOverrideOnBlock: false,
  rules: {
    DOUBLE_BOOKING: {
      key: 'DOUBLE_BOOKING',
      name: 'Double-Booking Conflict',
      description: 'Worker is assigned to multiple overlapping or conflicting shifts on the same day.',
      severity: 'BLOCK',
      enabled: true,
    },
    SKILL_MISMATCH: {
      key: 'SKILL_MISMATCH',
      name: 'Skill & Role Mismatch',
      description: 'Worker lacks the specific required qualification, skill, or designation for this shift.',
      severity: 'BLOCK',
      enabled: true,
    },
    OVERTIME_RISK: {
      key: 'OVERTIME_RISK',
      name: 'Overtime Cap Violation',
      description: 'Projected weekly hours (actual attendance already worked + scheduled) exceed statutory limit.',
      severity: 'WARN',
      enabled: true,
    },
    REST_PERIOD: {
      key: 'REST_PERIOD',
      name: 'Rest-Period Violation',
      description: 'Turnaround rest time between consecutive shifts is less than the mandatory minimum (11 hrs).',
      severity: 'WARN',
      enabled: true,
    },
    AVAILABILITY_MISMATCH: {
      key: 'AVAILABILITY_MISMATCH',
      name: 'Worker Availability Mismatch',
      description: 'Shift scheduled on worker declared weekly off day or unavailable preference.',
      severity: 'WARN',
      enabled: true,
    },
    COVERAGE_GAP: {
      key: 'COVERAGE_GAP',
      name: 'Open Shift / Coverage Gap',
      description: 'Roster shift has no assigned worker or no qualified worker available.',
      severity: 'WARN',
      enabled: true,
    },
    PUBLIC_HOLIDAY: {
      key: 'PUBLIC_HOLIDAY',
      name: 'Public Holiday Implication',
      description: 'Shift scheduled on a gazetted public holiday, requiring premium/double wage multiplier.',
      severity: 'WARN',
      enabled: true,
    },
  },
};
