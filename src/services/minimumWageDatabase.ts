import {
  INDIAN_STATES,
  MidMonthMinWageRevisionInfo,
  MinimumWageRevisionRule,
  OrgSettings,
  ScheduledEmploymentCategory,
  Worker,
  WorkerSkillCategory,
} from '../types/index';

export const SCHEDULED_EMPLOYMENT_CATEGORIES: ScheduledEmploymentCategory[] = [
  'Engineering & Manufacturing',
  'Textiles & Garments',
  'Construction & Infrastructure',
  'Shops & Commercial Establishments',
  'Logistics & Warehousing',
  'Food & Beverages',
];

export const DEFAULT_SCHEDULED_EMPLOYMENT: ScheduledEmploymentCategory =
  'Engineering & Manufacturing';

export const SKILL_LEVEL_LABELS: Record<WorkerSkillCategory, string> = {
  UNSKILLED: 'Unskilled',
  SEMI_SKILLED: 'Semi-Skilled',
  SKILLED: 'Skilled',
  HIGHLY_SKILLED: 'Highly Skilled',
};

export interface ZoneMinimumWageRates {
  zone: string;
  notificationDate: string; // YYYY-MM-DD
  notificationRef: string;
  rates: Record<WorkerSkillCategory, number>; // Monthly statutory floor in INR
}

export interface StateZoneSchedule {
  state: string;
  defaultZone: string;
  zones: ZoneMinimumWageRates[];
}

const SCHEDULED_EMPLOYMENT_FACTOR: Record<ScheduledEmploymentCategory, number> = {
  'Engineering & Manufacturing': 1.0,
  'Textiles & Garments': 1.0,
  'Construction & Infrastructure': 1.05,
  'Shops & Commercial Establishments': 0.98,
  'Logistics & Warehousing': 1.02,
  'Food & Beverages': 0.99,
};

export const STATE_ZONE_MINIMUM_WAGES: Record<string, StateZoneSchedule> = {
  Gujarat: {
    state: 'Gujarat',
    defaultZone: 'Anand',
    zones: [
      {
        zone: 'Anand',
        notificationDate: '2026-10-01',
        notificationRef: 'GJ Lab & Emp Dept Notification GHR-2026-VDA-II',
        rates: {
          UNSKILLED: 12050,
          SEMI_SKILLED: 13500,
          SKILLED: 14900,
          HIGHLY_SKILLED: 16400,
        },
      },
      {
        zone: 'Vadodara',
        notificationDate: '2026-10-01',
        notificationRef: 'GJ Lab & Emp Dept Notification GHR-2026-VDA-I',
        rates: {
          UNSKILLED: 12700,
          SEMI_SKILLED: 14200,
          SKILLED: 15800,
          HIGHLY_SKILLED: 17300,
        },
      },
      {
        zone: 'Ahmedabad & Surat (Zone I)',
        notificationDate: '2026-10-01',
        notificationRef: 'GJ Lab & Emp Dept Notification GHR-2026-VDA-I',
        rates: {
          UNSKILLED: 13100,
          SEMI_SKILLED: 14650,
          SKILLED: 16300,
          HIGHLY_SKILLED: 17900,
        },
      },
      {
        zone: 'Rest of Gujarat (Zone II)',
        notificationDate: '2026-10-01',
        notificationRef: 'GJ Lab & Emp Dept Notification GHR-2026-VDA-II',
        rates: {
          UNSKILLED: 11800,
          SEMI_SKILLED: 13200,
          SKILLED: 14600,
          HIGHLY_SKILLED: 16000,
        },
      },
    ],
  },
  Maharashtra: {
    state: 'Maharashtra',
    defaultZone: 'Zone I (Mumbai, Pune, Thane)',
    zones: [
      {
        zone: 'Zone I (Mumbai, Pune, Thane)',
        notificationDate: '2026-07-01',
        notificationRef: 'MH Gazette MWA-2026-SP-I',
        rates: {
          UNSKILLED: 12500,
          SEMI_SKILLED: 14000,
          SKILLED: 15625,
          HIGHLY_SKILLED: 17500,
        },
      },
      {
        zone: 'Zone II (Nashik, Nagpur, Aurangabad)',
        notificationDate: '2026-07-01',
        notificationRef: 'MH Gazette MWA-2026-SP-II',
        rates: {
          UNSKILLED: 11900,
          SEMI_SKILLED: 13300,
          SKILLED: 14850,
          HIGHLY_SKILLED: 16600,
        },
      },
      {
        zone: 'Zone III (Rest of Maharashtra)',
        notificationDate: '2026-07-01',
        notificationRef: 'MH Gazette MWA-2026-SP-III',
        rates: {
          UNSKILLED: 11350,
          SEMI_SKILLED: 12700,
          SKILLED: 14150,
          HIGHLY_SKILLED: 15800,
        },
      },
    ],
  },
  Karnataka: {
    state: 'Karnataka',
    defaultZone: 'Zone I (Bengaluru Urban)',
    zones: [
      {
        zone: 'Zone I (Bengaluru Urban)',
        notificationDate: '2026-04-01',
        notificationRef: 'KA Labour Dept KAE-2026-VDA-Z1',
        rates: {
          UNSKILLED: 14200,
          SEMI_SKILLED: 15900,
          SKILLED: 17750,
          HIGHLY_SKILLED: 19880,
        },
      },
      {
        zone: 'Zone II (Mysuru, Hubli-Dharwad, Mangaluru)',
        notificationDate: '2026-04-01',
        notificationRef: 'KA Labour Dept KAE-2026-VDA-Z2',
        rates: {
          UNSKILLED: 13300,
          SEMI_SKILLED: 14900,
          SKILLED: 16625,
          HIGHLY_SKILLED: 18600,
        },
      },
      {
        zone: 'Zone III (Rest of Karnataka)',
        notificationDate: '2026-04-01',
        notificationRef: 'KA Labour Dept KAE-2026-VDA-Z3',
        rates: {
          UNSKILLED: 12500,
          SEMI_SKILLED: 14000,
          SKILLED: 15600,
          HIGHLY_SKILLED: 17450,
        },
      },
    ],
  },
  Delhi: {
    state: 'Delhi',
    defaultZone: 'NCT Delhi (All Areas)',
    zones: [
      {
        zone: 'NCT Delhi (All Areas)',
        notificationDate: '2026-10-01',
        notificationRef: 'GNCTD Labour Dept F.12(142)/2026-VDA',
        rates: {
          UNSKILLED: 17494,
          SEMI_SKILLED: 19279,
          SKILLED: 21215,
          HIGHLY_SKILLED: 23040,
        },
      },
    ],
  },
  'Tamil Nadu': {
    state: 'Tamil Nadu',
    defaultZone: 'Zone A (Chennai, Coimbatore, Hosur)',
    zones: [
      {
        zone: 'Zone A (Chennai, Coimbatore, Hosur)',
        notificationDate: '2026-04-01',
        notificationRef: 'TN G.O.(2D) No. 41 Labour & Emp',
        rates: {
          UNSKILLED: 12000,
          SEMI_SKILLED: 13440,
          SKILLED: 15000,
          HIGHLY_SKILLED: 16800,
        },
      },
      {
        zone: 'Zone B (Rest of Tamil Nadu)',
        notificationDate: '2026-04-01',
        notificationRef: 'TN G.O.(2D) No. 42 Labour & Emp',
        rates: {
          UNSKILLED: 11200,
          SEMI_SKILLED: 12550,
          SKILLED: 14000,
          HIGHLY_SKILLED: 15680,
        },
      },
    ],
  },
  Haryana: {
    state: 'Haryana',
    defaultZone: 'NCR Industrial Belt (Gurugram, Faridabad)',
    zones: [
      {
        zone: 'NCR Industrial Belt (Gurugram, Faridabad)',
        notificationDate: '2026-07-01',
        notificationRef: 'HR Labour Dept Memo MW-2026-II',
        rates: {
          UNSKILLED: 11200,
          SEMI_SKILLED: 12544,
          SKILLED: 14000,
          HIGHLY_SKILLED: 15680,
        },
      },
      {
        zone: 'Rest of Haryana',
        notificationDate: '2026-07-01',
        notificationRef: 'HR Labour Dept Memo MW-2026-II',
        rates: {
          UNSKILLED: 10800,
          SEMI_SKILLED: 12100,
          SKILLED: 13500,
          HIGHLY_SKILLED: 15100,
        },
      },
    ],
  },
  Telangana: {
    state: 'Telangana',
    defaultZone: 'Zone I (Hyderabad, Ranga Reddy)',
    zones: [
      {
        zone: 'Zone I (Hyderabad, Ranga Reddy)',
        notificationDate: '2026-04-01',
        notificationRef: 'TS Commissioner of Labour VDA-2026',
        rates: {
          UNSKILLED: 11500,
          SEMI_SKILLED: 12880,
          SKILLED: 14375,
          HIGHLY_SKILLED: 16100,
        },
      },
      {
        zone: 'Zone II (Rest of Telangana)',
        notificationDate: '2026-04-01',
        notificationRef: 'TS Commissioner of Labour VDA-2026',
        rates: {
          UNSKILLED: 10850,
          SEMI_SKILLED: 12150,
          SKILLED: 13560,
          HIGHLY_SKILLED: 15190,
        },
      },
    ],
  },
  'Andhra Pradesh': {
    state: 'Andhra Pradesh',
    defaultZone: 'Industrial Estates (Visakhapatnam, Vijayawada)',
    zones: [
      {
        zone: 'Industrial Estates (Visakhapatnam, Vijayawada)',
        notificationDate: '2026-04-01',
        notificationRef: 'AP Min Wages Notification G.O. 2026',
        rates: {
          UNSKILLED: 11400,
          SEMI_SKILLED: 12768,
          SKILLED: 14250,
          HIGHLY_SKILLED: 15960,
        },
      },
    ],
  },
  'West Bengal': {
    state: 'West Bengal',
    defaultZone: 'Zone A (Kolkata, Howrah, Durgapur)',
    zones: [
      {
        zone: 'Zone A (Kolkata, Howrah, Durgapur)',
        notificationDate: '2026-07-01',
        notificationRef: 'WB Labour Commissioner Order 2026-ZA',
        rates: {
          UNSKILLED: 10500,
          SEMI_SKILLED: 11760,
          SKILLED: 13125,
          HIGHLY_SKILLED: 14700,
        },
      },
      {
        zone: 'Zone B (Rest of West Bengal)',
        notificationDate: '2026-07-01',
        notificationRef: 'WB Labour Commissioner Order 2026-ZB',
        rates: {
          UNSKILLED: 9800,
          SEMI_SKILLED: 10980,
          SKILLED: 12250,
          HIGHLY_SKILLED: 13720,
        },
      },
    ],
  },
  Kerala: {
    state: 'Kerala',
    defaultZone: 'Manufacturing & Engineering Zone',
    zones: [
      {
        zone: 'Manufacturing & Engineering Zone',
        notificationDate: '2026-06-01',
        notificationRef: 'KL Labour Dept G.O.(P) 2026',
        rates: {
          UNSKILLED: 13800,
          SEMI_SKILLED: 15456,
          SKILLED: 17250,
          HIGHLY_SKILLED: 19320,
        },
      },
    ],
  },
  'Uttar Pradesh': {
    state: 'Uttar Pradesh',
    defaultZone: 'Noida & Ghaziabad Industrial Belt',
    zones: [
      {
        zone: 'Noida & Ghaziabad Industrial Belt',
        notificationDate: '2026-10-01',
        notificationRef: 'UP Labour Commissioner VDA Oct-2026',
        rates: {
          UNSKILLED: 10700,
          SEMI_SKILLED: 11984,
          SKILLED: 13375,
          HIGHLY_SKILLED: 14980,
        },
      },
      {
        zone: 'Rest of Uttar Pradesh',
        notificationDate: '2026-10-01',
        notificationRef: 'UP Labour Commissioner VDA Oct-2026',
        rates: {
          UNSKILLED: 10200,
          SEMI_SKILLED: 11420,
          SKILLED: 12750,
          HIGHLY_SKILLED: 14280,
        },
      },
    ],
  },
  Rajasthan: {
    state: 'Rajasthan',
    defaultZone: 'Jaipur, Bhiwadi & Neemrana Belt',
    zones: [
      {
        zone: 'Jaipur, Bhiwadi & Neemrana Belt',
        notificationDate: '2026-07-01',
        notificationRef: 'RJ Labour Dept Notification 2026',
        rates: {
          UNSKILLED: 10400,
          SEMI_SKILLED: 11648,
          SKILLED: 13000,
          HIGHLY_SKILLED: 14560,
        },
      },
      {
        zone: 'Rest of Rajasthan',
        notificationDate: '2026-07-01',
        notificationRef: 'RJ Labour Dept Notification 2026',
        rates: {
          UNSKILLED: 9900,
          SEMI_SKILLED: 11090,
          SKILLED: 12375,
          HIGHLY_SKILLED: 13860,
        },
      },
    ],
  },
  Punjab: {
    state: 'Punjab',
    defaultZone: 'Ludhiana & Mohali Industrial Zone',
    zones: [
      {
        zone: 'Ludhiana & Mohali Industrial Zone',
        notificationDate: '2026-09-01',
        notificationRef: 'PB Labour Dept VDA Sept-2026',
        rates: {
          UNSKILLED: 10800,
          SEMI_SKILLED: 12096,
          SKILLED: 13500,
          HIGHLY_SKILLED: 15120,
        },
      },
    ],
  },
  'Madhya Pradesh': {
    state: 'Madhya Pradesh',
    defaultZone: 'Indore, Pithampur & Bhopal Zone',
    zones: [
      {
        zone: 'Indore, Pithampur & Bhopal Zone',
        notificationDate: '2026-10-01',
        notificationRef: 'MP Labour Dept VDA Oct-2026',
        rates: {
          UNSKILLED: 10200,
          SEMI_SKILLED: 11424,
          SKILLED: 12750,
          HIGHLY_SKILLED: 14280,
        },
      },
    ],
  },
  Odisha: {
    state: 'Odisha',
    defaultZone: 'State Industrial Zone',
    zones: [
      {
        zone: 'State Industrial Zone',
        notificationDate: '2026-10-01',
        notificationRef: 'OD Labour Gazette Oct-2026',
        rates: {
          UNSKILLED: 10100,
          SEMI_SKILLED: 11312,
          SKILLED: 12625,
          HIGHLY_SKILLED: 14140,
        },
      },
    ],
  },
  Bihar: {
    state: 'Bihar',
    defaultZone: 'State Industrial Zone',
    zones: [
      {
        zone: 'State Industrial Zone',
        notificationDate: '2026-10-01',
        notificationRef: 'BR Min Wages Revision Oct-2026',
        rates: {
          UNSKILLED: 9800,
          SEMI_SKILLED: 10976,
          SKILLED: 12250,
          HIGHLY_SKILLED: 13720,
        },
      },
    ],
  },
  Jharkhand: {
    state: 'Jharkhand',
    defaultZone: 'Jamshedpur & Ranchi Belt',
    zones: [
      {
        zone: 'Jamshedpur & Ranchi Belt',
        notificationDate: '2026-10-01',
        notificationRef: 'JH Labour Dept Oct-2026',
        rates: {
          UNSKILLED: 10200,
          SEMI_SKILLED: 11424,
          SKILLED: 12750,
          HIGHLY_SKILLED: 14280,
        },
      },
    ],
  },
  Chhattisgarh: {
    state: 'Chhattisgarh',
    defaultZone: 'Zone A (Raipur, Bhilai, Korba)',
    zones: [
      {
        zone: 'Zone A (Raipur, Bhilai, Korba)',
        notificationDate: '2026-10-01',
        notificationRef: 'CG Min Wages VDA Oct-2026',
        rates: {
          UNSKILLED: 10300,
          SEMI_SKILLED: 11536,
          SKILLED: 12875,
          HIGHLY_SKILLED: 14420,
        },
      },
    ],
  },
  Goa: {
    state: 'Goa',
    defaultZone: 'All Industrial Estates',
    zones: [
      {
        zone: 'All Industrial Estates',
        notificationDate: '2026-04-01',
        notificationRef: 'GA Min Wages Notification 2026',
        rates: {
          UNSKILLED: 12800,
          SEMI_SKILLED: 14336,
          SKILLED: 16000,
          HIGHLY_SKILLED: 17920,
        },
      },
    ],
  },
  Assam: {
    state: 'Assam',
    defaultZone: 'State Industrial Area',
    zones: [
      {
        zone: 'State Industrial Area',
        notificationDate: '2026-06-01',
        notificationRef: 'AS Labour Dept Notification 2026',
        rates: {
          UNSKILLED: 9900,
          SEMI_SKILLED: 11088,
          SKILLED: 12375,
          HIGHLY_SKILLED: 13860,
        },
      },
    ],
  },
  Uttarakhand: {
    state: 'Uttarakhand',
    defaultZone: 'SIDCUL Industrial Area',
    zones: [
      {
        zone: 'SIDCUL Industrial Area',
        notificationDate: '2026-10-01',
        notificationRef: 'UK Min Wages VDA Oct-2026',
        rates: {
          UNSKILLED: 10900,
          SEMI_SKILLED: 12208,
          SKILLED: 13625,
          HIGHLY_SKILLED: 15260,
        },
      },
    ],
  },
  'Himachal Pradesh': {
    state: 'Himachal Pradesh',
    defaultZone: 'Baddi, Barotiwala & Nalagarh Zone',
    zones: [
      {
        zone: 'Baddi, Barotiwala & Nalagarh Zone',
        notificationDate: '2026-04-01',
        notificationRef: 'HP Labour Dept Notification 2026',
        rates: {
          UNSKILLED: 10800,
          SEMI_SKILLED: 12096,
          SKILLED: 13500,
          HIGHLY_SKILLED: 15120,
        },
      },
    ],
  },
  Chandigarh: {
    state: 'Chandigarh',
    defaultZone: 'UT Chandigarh',
    zones: [
      {
        zone: 'UT Chandigarh',
        notificationDate: '2026-10-01',
        notificationRef: 'CH Labour Dept VDA Oct-2026',
        rates: {
          UNSKILLED: 13500,
          SEMI_SKILLED: 15120,
          SKILLED: 16875,
          HIGHLY_SKILLED: 18900,
        },
      },
    ],
  },
  Puducherry: {
    state: 'Puducherry',
    defaultZone: 'UT Industrial Area',
    zones: [
      {
        zone: 'UT Industrial Area',
        notificationDate: '2026-04-01',
        notificationRef: 'PY Labour Dept Notification 2026',
        rates: {
          UNSKILLED: 11000,
          SEMI_SKILLED: 12320,
          SKILLED: 13750,
          HIGHLY_SKILLED: 15400,
        },
      },
    ],
  },
};

const FALLBACK_SCHEDULE: StateZoneSchedule = {
  state: 'India Standard',
  defaultZone: 'National Floor Reference',
  zones: [
    {
      zone: 'National Floor Reference',
      notificationDate: '2026-04-01',
      notificationRef: 'Code on Wages National Floor Reference',
      rates: {
        UNSKILLED: 10000,
        SEMI_SKILLED: 11200,
        SKILLED: 12500,
        HIGHLY_SKILLED: 14000,
      },
    },
  ],
};

export function getZonesForState(stateName?: string): string[] {
  const clean = (stateName || 'Maharashtra').trim();
  const schedule = STATE_ZONE_MINIMUM_WAGES[clean];
  if (!schedule) return ['Standard State Zone'];
  return schedule.zones.map((z) => z.zone);
}

export function getDefaultZoneForState(stateName?: string): string {
  const clean = (stateName || 'Maharashtra').trim();
  const schedule = STATE_ZONE_MINIMUM_WAGES[clean];
  return schedule ? schedule.defaultZone : 'Standard State Zone';
}

export function getMinimumWageMatrixForState(
  stateName: string,
  scheduledEmployment: string = DEFAULT_SCHEDULED_EMPLOYMENT
): Array<{
  zone: string;
  notificationDate: string;
  notificationRef: string;
  rates: Record<WorkerSkillCategory, number>;
}> {
  const schedule = STATE_ZONE_MINIMUM_WAGES[stateName.trim()] || FALLBACK_SCHEDULE;
  const factor =
    SCHEDULED_EMPLOYMENT_FACTOR[scheduledEmployment as ScheduledEmploymentCategory] ?? 1.0;

  return schedule.zones.map((z) => ({
    zone: z.zone,
    notificationDate: z.notificationDate,
    notificationRef: z.notificationRef,
    rates: {
      UNSKILLED: Math.round(z.rates.UNSKILLED * factor),
      SEMI_SKILLED: Math.round(z.rates.SEMI_SKILLED * factor),
      SKILLED: Math.round(z.rates.SKILLED * factor),
      HIGHLY_SKILLED: Math.round(z.rates.HIGHLY_SKILLED * factor),
    },
  }));
}

function matchStateFromAddress(address?: string): string | undefined {
  if (!address) return undefined;
  const lower = address.toLowerCase();
  return INDIAN_STATES.find((st) => lower.includes(st.toLowerCase()));
}

function matchZoneFromAddress(stateName: string, address?: string): string | undefined {
  if (!address) return undefined;
  const lower = address.toLowerCase();
  const zones = getZonesForState(stateName);
  return zones.find((z) => {
    const primaryToken = z.split('(')[0].trim().toLowerCase();
    return lower.includes(z.toLowerCase()) || (primaryToken.length >= 4 && lower.includes(primaryToken));
  });
}

export interface ResolvedWorkLocation {
  state: string;
  wageZone: string;
  scheduledEmployment: string;
  source: 'WORKER_LOCATION' | 'BRANCH_LOCATION' | 'HEAD_OFFICE_FALLBACK';
}

/**
 * Resolves the authoritative work location for statutory minimum wage enforcement.
 * Multi-state tenant rule: Always prioritizes employee's actual work location
 * (worker explicit state/zone or assigned branch location) over tenant Head Office.
 */
export function resolveWorkerWorkLocation(
  worker: Partial<Worker>,
  orgSettings?: OrgSettings,
  evaluationMonth?: string
): ResolvedWorkLocation {
  const assignedBranch = orgSettings?.branches?.find((b) => b.id === worker.branchId);
  const branchState =
    assignedBranch?.state || matchStateFromAddress(assignedBranch?.location?.address);
  const workAddressState = matchStateFromAddress(worker.workLocationAddress);
  const headOfficeState =
    matchStateFromAddress(orgSettings?.baseLocation?.address) || 'Maharashtra';

  let activeWorkerState = worker.state;
  if (evaluationMonth && worker.stateEffectiveDate && worker.previousState) {
    const stateEffMonth = worker.stateEffectiveDate.slice(0, 7);
    if (evaluationMonth < stateEffMonth) {
      activeWorkerState = worker.previousState;
    }
  }

  let resolvedState: string;
  let source: ResolvedWorkLocation['source'];

  if (activeWorkerState && INDIAN_STATES.includes(activeWorkerState as any)) {
    resolvedState = activeWorkerState;
    source = 'WORKER_LOCATION';
  } else if (workAddressState && INDIAN_STATES.includes(workAddressState as any)) {
    resolvedState = workAddressState;
    source = 'WORKER_LOCATION';
  } else if (branchState && INDIAN_STATES.includes(branchState as any)) {
    resolvedState = branchState;
    source = 'BRANCH_LOCATION';
  } else {
    resolvedState = activeWorkerState || headOfficeState;
    source = activeWorkerState ? 'WORKER_LOCATION' : 'HEAD_OFFICE_FALLBACK';
  }

  const stateZones = getZonesForState(resolvedState);
  const rawZone =
    worker.wageZone ||
    assignedBranch?.wageZone ||
    matchZoneFromAddress(resolvedState, worker.workLocationAddress) ||
    matchZoneFromAddress(resolvedState, assignedBranch?.location?.address);

  const matchedZone =
    (rawZone &&
      stateZones.find(
        (z) =>
          z.toLowerCase() === rawZone.toLowerCase() ||
          z.toLowerCase().includes(rawZone.toLowerCase())
      )) ||
    getDefaultZoneForState(resolvedState);

  const scheduledEmployment =
    worker.scheduledEmployment ||
    assignedBranch?.scheduledEmployment ||
    DEFAULT_SCHEDULED_EMPLOYMENT;

  return {
    state: resolvedState,
    wageZone: matchedZone,
    scheduledEmployment,
    source,
  };
}

export interface ResolveMinimumWageParams {
  state?: string;
  zone?: string;
  scheduledEmployment?: string;
  skillCategory?: WorkerSkillCategory;
  evaluationDate?: string; // YYYY-MM-DD
  customRevisions?: MinimumWageRevisionRule[];
}

export interface ResolvedMinimumWageResult {
  state: string;
  zone: string;
  scheduledEmployment: string;
  skillCategory: WorkerSkillCategory;
  monthlyFloor: number;
  dailyFloor: number;
  notificationDate: string;
  notificationRef: string;
  midMonthRevisionInfo?: MidMonthMinWageRevisionInfo;
}

/**
 * Resolves applicable minimum wage floor for State × Scheduled Employment × Zone × Skill Level,
 * automatically handling mid-month minimum wage revisions via day-weighted pro-rating.
 */
export function resolveMinimumWageFloor(
  params: ResolveMinimumWageParams
): ResolvedMinimumWageResult {
  const cleanState = (params.state || 'Maharashtra').trim();
  const schedule = STATE_ZONE_MINIMUM_WAGES[cleanState] || FALLBACK_SCHEDULE;
  const skillCategory: WorkerSkillCategory = params.skillCategory || 'UNSKILLED';
  const scheduledEmployment =
    params.scheduledEmployment || DEFAULT_SCHEDULED_EMPLOYMENT;

  const zoneObj =
    (params.zone
      ? schedule.zones.find(
          (z) =>
            z.zone.toLowerCase() === params.zone!.toLowerCase() ||
            z.zone.toLowerCase().includes(params.zone!.toLowerCase())
        )
      : undefined) ||
    schedule.zones.find((z) => z.zone === schedule.defaultZone) ||
    schedule.zones[0];

  const sectorFactor =
    SCHEDULED_EMPLOYMENT_FACTOR[scheduledEmployment as ScheduledEmploymentCategory] ?? 1.0;

  let monthlyFloor = Math.round((zoneObj.rates[skillCategory] || zoneObj.rates.UNSKILLED) * sectorFactor);
  let notificationDate = zoneObj.notificationDate;
  let notificationRef = zoneObj.notificationRef;
  let midMonthRevisionInfo: MidMonthMinWageRevisionInfo | undefined;

  const evalDate = params.evaluationDate || new Date().toISOString().slice(0, 10);
  const evalMonth = evalDate.slice(0, 7);

  // Check matching custom / gazette mid-month minimum wage revisions
  const revisions = (params.customRevisions || []).filter((r) => {
    const stateMatch = r.state.trim().toLowerCase() === cleanState.toLowerCase();
    const zoneMatch =
      !r.zone ||
      r.zone === 'ALL' ||
      r.zone.trim().toLowerCase() === zoneObj.zone.toLowerCase() ||
      zoneObj.zone.toLowerCase().includes(r.zone.trim().toLowerCase());
    const skillMatch = r.skillCategory === skillCategory;
    const empMatch =
      !r.scheduledEmployment ||
      r.scheduledEmployment === 'ALL' ||
      r.scheduledEmployment === scheduledEmployment;
    return stateMatch && zoneMatch && skillMatch && empMatch;
  });

  if (revisions.length > 0) {
    // Pick the most recent effective revision relevant to evalMonth
    const sorted = [...revisions].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
    const latest = sorted[sorted.length - 1];
    const revMonth = latest.effectiveDate.slice(0, 7);

    if (evalMonth < revMonth) {
      monthlyFloor = latest.previousMonthlyFloor;
    } else if (evalMonth > revMonth) {
      monthlyFloor = latest.revisedMonthlyFloor;
      notificationDate = latest.notificationDate || latest.effectiveDate;
      notificationRef = latest.notificationRef;
    } else {
      // Revision occurs within the evaluated payroll month!
      const [yStr, mStr] = evalMonth.split('-');
      const totalDaysInMonth = new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
      const revDay = Math.min(
        totalDaysInMonth,
        Math.max(1, parseInt(latest.effectiveDate.slice(8, 10) || '1', 10))
      );

      if (revDay <= 1) {
        monthlyFloor = latest.revisedMonthlyFloor;
        notificationDate = latest.notificationDate || latest.effectiveDate;
        notificationRef = latest.notificationRef;
      } else {
        const daysAtPreviousRate = revDay - 1;
        const daysAtRevisedRate = totalDaysInMonth - daysAtPreviousRate;
        const proratedMonthlyFloor = Math.round(
          (latest.previousMonthlyFloor * daysAtPreviousRate +
            latest.revisedMonthlyFloor * daysAtRevisedRate) /
            totalDaysInMonth
        );

        monthlyFloor = proratedMonthlyFloor;
        notificationDate = latest.notificationDate || latest.effectiveDate;
        notificationRef = latest.notificationRef;
        midMonthRevisionInfo = {
          isRevisedInMonth: true,
          revisionDate: latest.effectiveDate,
          previousMonthlyFloor: latest.previousMonthlyFloor,
          revisedMonthlyFloor: latest.revisedMonthlyFloor,
          daysAtPreviousRate,
          daysAtRevisedRate,
          totalDaysInMonth,
          proratedMonthlyFloor,
        };
      }
    }
  }

  const dailyFloor = Math.round(monthlyFloor / 26);

  return {
    state: schedule === FALLBACK_SCHEDULE ? cleanState : schedule.state,
    zone: zoneObj.zone,
    scheduledEmployment,
    skillCategory,
    monthlyFloor,
    dailyFloor,
    notificationDate,
    notificationRef,
    midMonthRevisionInfo,
  };
}
