// src/services/db.ts
import { 
  collection, addDoc, query, where, getDocs, doc, setDoc, deleteDoc, getDoc, updateDoc 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { Worker, AttendanceRecord, Advance, ShiftConfig, OrgSettings, AppNotification, MonthlyPayroll, SubscriptionTier, PlanLimits, DEFAULT_PLAN_CONFIG } from "../types/index";

// ---> CHANGE THIS NUMBER TO ADJUST THE FREE TRIAL DAYS <---
const FREE_TRIAL_DAYS = 7; 

const getWorkersRef = () => collection(db, "workers");
const getAttendanceRef = () => collection(db, "attendance");
const getNotificationsRef = () => collection(db, "notifications");

const DEMO_TENANTS = [
  {
    id: 'demo-tenant-1',
    companyName: 'Apex Precision Engineering',
    name: 'Rajesh Patel',
    email: 'rajesh@apexeng.in',
    workerCount: 5,
    isActive: true,
    joinedAt: '2026-01-15T08:00:00.000Z',
    plan: 'ENTERPRISE',
    overrides: {},
    branding: { appName: 'Apex WorkForce', primaryColor: '#2563eb' }
  },
  {
    id: 'demo-tenant-2',
    companyName: 'Gujarat Auto Components',
    name: 'Sanjay Shah',
    email: 'sanjay@gujratauto.com',
    workerCount: 18,
    isActive: true,
    joinedAt: '2026-02-10T10:30:00.000Z',
    plan: 'PRO',
    overrides: {},
    branding: { appName: 'GAC Workforce', primaryColor: '#059669' }
  },
  {
    id: 'demo-tenant-3',
    companyName: 'Surat Textile Mills',
    name: 'Vikram Mehta',
    email: 'vikram@surattextiles.co',
    workerCount: 34,
    isActive: true,
    joinedAt: '2026-03-01T09:15:00.000Z',
    plan: 'ENTERPRISE',
    overrides: {},
    branding: { appName: 'STM Attendance', primaryColor: '#7c3aed' }
  }
];

export const normalizeWorker = (w: any): Worker => {
  const isMonthly = w.wageType === 'MONTHLY' || w.wageConfig?.type === 'MONTHLY' || w.category === 'Monthly';
  const rawAmount = typeof w.wageConfig?.amount === 'number' && w.wageConfig.amount > 0 ? w.wageConfig.amount : null;
  const fallbackAmount = isMonthly ? (w.monthlySalary || 25000) : (w.dailyWage || 650);
  const amount = rawAmount || fallbackAmount;
  return {
    ...w,
    status: w.status || 'ACTIVE',
    category: w.category || (isMonthly ? 'Monthly' : 'Daily Wage'),
    gender: w.gender || 'Male',
    dob: w.dob || '1995-01-01',
    joinedDate: w.joinedDate || w.dateOfJoining || '2025-01-01',
    wageConfig: {
      type: isMonthly ? 'MONTHLY' : 'DAILY',
      amount,
      overtimeEligible: w.wageConfig?.overtimeEligible ?? true,
      overtimeRatePerHour: w.overtimeRate || w.wageConfig?.overtimeRatePerHour || (isMonthly ? 150 : 100),
      workingDaysPerMonth: w.wageConfig?.workingDaysPerMonth || 26,
      allowances: w.wageConfig?.allowances || { travel: 50, food: 50, nightShift: 100 }
    }
  };
};

const INITIAL_DEMO_WORKERS: Worker[] = [
  {
    id: 'worker-1',
    tenantId: 'demo-tenant-id',
    name: 'Ramesh Sharma',
    fatherName: 'Dinesh Sharma',
    uan: '101234567890',
    esicIp: '3123456789',
    phone: '9876543210',
    wageType: 'DAILY',
    dailyWage: 650,
    hourlyWage: 80,
    overtimeRate: 100,
    designation: 'CNC Operator',
    department: 'Production',
    branchId: 'default',
    shiftId: 'default',
    joinedDate: '2025-06-01',
    isActive: true,
    faceEnrolled: true,
    status: 'ACTIVE',
    category: 'Daily Wage',
    gender: 'Male',
    dob: '1992-05-15',
    wageConfig: {
      type: 'DAILY',
      amount: 650,
      overtimeEligible: true,
      overtimeRatePerHour: 100,
      workingDaysPerMonth: 26,
      allowances: { travel: 50, food: 50, nightShift: 100 }
    }
  },
  {
    id: 'worker-2',
    tenantId: 'demo-tenant-id',
    name: 'Priya Patel',
    fatherName: 'Kishore Patel',
    uan: '101234567891',
    esicIp: '3123456790',
    phone: '9876543211',
    wageType: 'MONTHLY',
    monthlySalary: 20500,
    dailyWage: 788,
    hourlyWage: 98,
    overtimeRate: 150,
    designation: 'Quality Inspector',
    department: 'Quality',
    branchId: 'default',
    shiftId: 'default',
    joinedDate: '2025-04-15',
    isActive: true,
    faceEnrolled: true,
    status: 'ACTIVE',
    category: 'Monthly',
    gender: 'Female',
    dob: '1995-08-20',
    wageConfig: {
      type: 'MONTHLY',
      amount: 20500,
      basicPercentage: 60,
      monthlyBreakdown: { basic: 12300, hra: 6150, others: 2050 },
      overtimeEligible: true,
      overtimeRatePerHour: 150,
      workingDaysPerMonth: 26,
      allowances: { travel: 100, food: 100, nightShift: 150 }
    }
  },
  {
    id: 'worker-3',
    tenantId: 'demo-tenant-id',
    name: 'Amit Kumar',
    fatherName: 'Suresh Kumar',
    uan: '101234567892',
    esicIp: '3123456791',
    phone: '9876543212',
    wageType: 'DAILY',
    dailyWage: 700,
    hourlyWage: 87,
    overtimeRate: 110,
    designation: 'Maintenance Tech',
    department: 'Maintenance',
    branchId: 'default',
    shiftId: 'default',
    joinedDate: '2025-08-10',
    isActive: true,
    faceEnrolled: true,
    status: 'ACTIVE',
    category: 'Daily Wage',
    gender: 'Male',
    dob: '1990-11-12',
    wageConfig: {
      type: 'DAILY',
      amount: 700,
      overtimeEligible: true,
      overtimeRatePerHour: 110,
      workingDaysPerMonth: 26,
      allowances: { travel: 50, food: 50, nightShift: 100 }
    }
  },
  {
    id: 'worker-4',
    tenantId: 'demo-tenant-id',
    name: 'Sunil Verma',
    fatherName: 'Mahesh Verma',
    uan: '101234567893',
    esicIp: '3123456792',
    phone: '9876543213',
    wageType: 'DAILY',
    dailyWage: 520,
    hourlyWage: 65,
    overtimeRate: 80,
    designation: 'Packaging Assistant',
    department: 'Packaging',
    branchId: 'default',
    shiftId: 'default',
    joinedDate: '2025-10-01',
    isActive: true,
    faceEnrolled: false,
    status: 'ACTIVE',
    category: 'Daily Wage',
    gender: 'Male',
    dob: '1996-03-25',
    wageConfig: {
      type: 'DAILY',
      amount: 520,
      overtimeEligible: true,
      overtimeRatePerHour: 80,
      workingDaysPerMonth: 26,
      allowances: { travel: 0, food: 50, nightShift: 50 }
    }
  },
  {
    id: 'worker-5',
    tenantId: 'demo-tenant-id',
    name: 'Kavita Singh',
    fatherName: 'Rajendra Singh',
    uan: '101234567894',
    esicIp: '3123456793',
    phone: '9876543214',
    wageType: 'DAILY',
    dailyWage: 600,
    hourlyWage: 75,
    overtimeRate: 95,
    designation: 'Assembly Operator',
    department: 'Production',
    branchId: 'default',
    shiftId: 'default',
    joinedDate: '2026-01-05',
    isActive: true,
    faceEnrolled: true,
    status: 'ACTIVE',
    category: 'Daily Wage',
    gender: 'Female',
    dob: '1994-07-08',
    wageConfig: {
      type: 'DAILY',
      amount: 600,
      overtimeEligible: true,
      overtimeRatePerHour: 95,
      workingDaysPerMonth: 26,
      allowances: { travel: 50, food: 50, nightShift: 100 }
    }
  }
];

const getStoredDemoWorkers = (): Worker[] => {
  try {
    const raw = localStorage.getItem('demo_workers_list');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(normalizeWorker);
      }
    }
  } catch {}
  return INITIAL_DEMO_WORKERS.map(normalizeWorker);
};

const setStoredDemoWorkers = (list: Worker[]) => {
  try {
    localStorage.setItem('demo_workers_list', JSON.stringify(list));
  } catch {}
};

const generateMonthDemoAttendance = (tenantId: string, monthStr: string): AttendanceRecord[] => {
  const [yearStr, monthNumStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthNumStr, 10);
  const daysInMonth = new Date(year, month, 0).getDate();
  const records: AttendanceRecord[] = [];

  const demoWorkers = [
    { id: 'worker-1', name: 'Ramesh Sharma' },
    { id: 'worker-2', name: 'Priya Patel' },
    { id: 'worker-3', name: 'Amit Kumar' },
    { id: 'worker-4', name: 'Sunil Verma' },
    { id: 'worker-5', name: 'Kavita Singh' },
  ];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayDate = new Date(year, month - 1, day);
    const dayOfWeek = dayDate.getDay(); // 0 is Sunday
    const dateStr = `${yearStr}-${monthNumStr}-${String(day).padStart(2, '0')}`;

    demoWorkers.forEach((w) => {
      // Sundays are Weekly Off
      if (dayOfWeek === 0) {
        records.push({
          id: `att-${w.id}-${dateStr}`,
          tenantId,
          workerId: w.id,
          workerName: w.name,
          date: dateStr,
          shiftId: 'default',
          status: 'WEEKLY_OFF',
          timeline: [],
          lateStatus: { isLate: false, lateByMins: 0, penaltyApplied: false },
          hours: { gross: 0, net: 0, overtime: 0 }
        });
        return;
      }

      // Specific worker variations to reflect real factory dynamics
      let status: AttendanceRecord['status'] = 'PRESENT';
      let ot = 0;
      let isLate = false;
      let lateMins = 0;
      let inHour = 8;
      let inMin = 50 + (day % 10);
      let outHour = 18;
      let outMin = 5 + (day % 15);

      if (w.id === 'worker-1') {
        if (day === 12) status = 'HALF_DAY';
        else if (day === 18) {
          status = 'ON_LEAVE';
        } else if (day === 5 || day === 20) {
          ot = 1.5;
          outHour = 19;
          outMin = 35;
        }
      } else if (w.id === 'worker-2') {
        if (day === 14) status = 'ON_LEAVE';
        else if (day % 7 === 3) {
          isLate = true;
          lateMins = 18;
          inHour = 9;
          inMin = 18;
        }
      } else if (w.id === 'worker-3') {
        if (day === 8) status = 'HALF_DAY';
        else if (day === 10 || day === 22 || day === 25) {
          ot = 2.0;
          outHour = 20;
          outMin = 5;
        }
      } else if (w.id === 'worker-4') {
        if (day === 16) status = 'ABSENT';
        else if (day === 23) status = 'HALF_DAY';
      } else if (w.id === 'worker-5') {
        if (day === 9) {
          ot = 1.0;
          outHour = 19;
          outMin = 5;
        }
      }

      if (status === 'ABSENT') {
        records.push({
          id: `att-${w.id}-${dateStr}`,
          tenantId,
          workerId: w.id,
          workerName: w.name,
          date: dateStr,
          shiftId: 'default',
          status: 'ABSENT',
          timeline: [],
          lateStatus: { isLate: false, lateByMins: 0, penaltyApplied: false },
          hours: { gross: 0, net: 0, overtime: 0 }
        });
        return;
      }

      if (status === 'ON_LEAVE') {
        records.push({
          id: `att-${w.id}-${dateStr}`,
          tenantId,
          workerId: w.id,
          workerName: w.name,
          date: dateStr,
          shiftId: 'default',
          status: 'ON_LEAVE',
          timeline: [],
          leaveInfo: { type: 'CL', isPaid: true, reason: 'Personal errand' },
          lateStatus: { isLate: false, lateByMins: 0, penaltyApplied: false },
          hours: { gross: 0, net: 0, overtime: 0 }
        });
        return;
      }

      const inTimestamp = new Date(year, month - 1, day, inHour, inMin).toISOString();
      const outTimestamp = new Date(year, month - 1, day, outHour, outMin).toISOString();

      records.push({
        id: `att-${w.id}-${dateStr}`,
        tenantId,
        workerId: w.id,
        workerName: w.name,
        date: dateStr,
        shiftId: 'default',
        status,
        timeline: [
          { timestamp: inTimestamp, type: 'IN', device: 'kiosk-main', isOutOfGeofence: false },
          { timestamp: outTimestamp, type: 'OUT', device: 'kiosk-main', isOutOfGeofence: false }
        ],
        lateStatus: { isLate, lateByMins: lateMins, penaltyApplied: false },
        hours: {
          gross: status === 'HALF_DAY' ? 4.5 : (8.0 + ot),
          net: status === 'HALF_DAY' ? 4.0 : (8.0 + ot),
          overtime: ot
        }
      });
    });
  }

  return records;
};

const getStoredDemoAttendance = (tenantId: string): AttendanceRecord[] => {
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  let stored: AttendanceRecord[] = [];
  try {
    const raw = localStorage.getItem('demo_attendance_today');
    if (raw) stored = JSON.parse(raw);
  } catch {}

  // If stored doesn't have records for this month, seed full month attendance
  const hasMonthData = stored.some(r => r.date && r.date.startsWith(currentMonthStr));
  if (!hasMonthData) {
    const baseline = generateMonthDemoAttendance(tenantId, currentMonthStr);
    stored = [...stored, ...baseline];
    try {
      localStorage.setItem('demo_attendance_today', JSON.stringify(stored));
    } catch {}
  }

  return stored;
};

const saveDemoAttendanceRecord = (record: AttendanceRecord) => {
  try {
    const current = getStoredDemoAttendance(record.tenantId);
    const filtered = current.filter(r => r.workerId !== record.workerId || r.date !== record.date);
    localStorage.setItem('demo_attendance_today', JSON.stringify([record, ...filtered]));
  } catch {}
};

const getStoredDemoAdvances = (): Advance[] => {
  try {
    const raw = localStorage.getItem('demo_advances_list');
    if (raw) return JSON.parse(raw);
  } catch {}
  const today = new Date().toISOString().split('T')[0];
  return [
    {
      id: 'adv-1',
      tenantId: 'demo-tenant-id',
      workerId: 'worker-1',
      workerName: 'Ramesh Sharma',
      amount: 2000,
      date: today,
      reason: 'Medical emergency',
      repaid: false,
      status: 'APPROVED'
    },
    {
      id: 'adv-2',
      tenantId: 'demo-tenant-id',
      workerId: 'worker-4',
      workerName: 'Sunil Verma',
      amount: 1500,
      date: today,
      reason: 'Festival advance',
      repaid: false,
      status: 'APPROVED'
    }
  ];
};

const setStoredDemoAdvances = (list: Advance[]) => {
  try {
    localStorage.setItem('demo_advances_list', JSON.stringify(list));
  } catch {}
};

export const dbService = {
  
  // --- SUPER ADMIN METHODS ---

  getGlobalPlanConfig: async (): Promise<Record<SubscriptionTier, PlanLimits>> => {
    try {
      const docRef = doc(db, "system_settings", "plan_config");
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as Record<SubscriptionTier, PlanLimits>;
      }
      return DEFAULT_PLAN_CONFIG;
    } catch (error) {
      console.error("Failed to fetch global plans, falling back to default", error);
      return DEFAULT_PLAN_CONFIG;
    }
  },

  updateGlobalPlanConfig: async (config: Record<SubscriptionTier, PlanLimits>) => {
    const docRef = doc(db, "system_settings", "plan_config");
    await setDoc(docRef, config, { merge: true });
  },

  updateTenantBranding: async (tenantId: string, branding: Partial<any>) => {
    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, { branding });
  },

  getAllTenants: async () => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'FACTORY_OWNER'));
      const snapshot = await getDocs(q);
      
      const tenants = await Promise.all(snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const workersQ = query(collection(db, "workers"), where("tenantId", "==", data.tenantId));
        const workersSnap = await getDocs(workersQ);
        
        let plan = 'FREE';
        let overrides = {};
        let branding = {};
        if (data.tenantId) {
            const tenantDoc = await getDoc(doc(db, 'tenants', data.tenantId));
            if (tenantDoc.exists()) {
                plan = tenantDoc.data().plan || 'FREE';
                overrides = tenantDoc.data().overrides || {};
                branding = tenantDoc.data().branding || {};
            }
        }
        
        return {
          id: docSnap.id,
          ...data,
          workerCount: workersSnap.size,
          isActive: data.isActive !== false, 
          joinedAt: data.createdAt || new Date().toISOString(),
          plan: plan, 
          overrides: overrides,
          branding: branding
        };
      }));
      
      if (tenants.length === 0) return DEMO_TENANTS;
      return tenants;
    } catch (error) {
      console.warn("Using demo tenants:", error);
      return DEMO_TENANTS;
    }
  },

  toggleTenantStatus: async (userId: string, currentStatus: boolean) => {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { isActive: !currentStatus });
  },

  makeSuperAdmin: async (userId: string) => {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { role: 'SUPER_ADMIN' });
    return true;
  },

  updateTenantPlan: async (tenantId: string, plan: SubscriptionTier) => {
    const tenantRef = doc(db, 'tenants', tenantId);
    const updateData: any = { plan };
    
    // Auto-assign the free trial if manually switched to TRIAL from the dropdown later
    if (plan === 'TRIAL') {
        const d = new Date();
        d.setDate(d.getDate() + FREE_TRIAL_DAYS); // Configurable Trial Days
        updateData.trialEndsAt = d.toISOString();
    }
    
    await updateDoc(tenantRef, updateData);
  },

  updateTenantOverrides: async (tenantId: string, overrides: Partial<PlanLimits>) => {
    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, { overrides });
  },

  // --- RESELLER METHODS ---
  
  makeReseller: async (userId: string) => {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { role: 'RESELLER' });
    return true;
  },

  getResellers: async () => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'RESELLER'));
      const snapshot = await getDocs(q);
      
      const resellers = await Promise.all(snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const clientsQ = query(
            collection(db, 'users'), 
            where('role', '==', 'FACTORY_OWNER'), 
            where('resellerId', '==', docSnap.id)
        );
        const clientsSnap = await getDocs(clientsQ);
        const activeClients = clientsSnap.docs.filter(d => d.data().isActive !== false).length;
        
        return {
          id: docSnap.id,
          ...data,
          activeClients,
          commissionRate: data.commissionRate || 150
        };
      }));
      
      return resellers;
    } catch (error) {
      console.error("Error fetching resellers:", error);
      return [];
    }
  },

  updateResellerCommission: async (userId: string, commissionRate: number) => {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { commissionRate });
  },

  inviteResellerPartner: async (email: string, companyName: string, commissionRate: number) => {
    await setDoc(doc(db, "invites", email), {
      email, 
      companyName, 
      role: 'RESELLER',
      commissionRate: commissionRate,
      createdAt: new Date().toISOString()
    });
  },

  getResellerClients: async (resellerUid: string) => {
    try {
      const q = query(
          collection(db, 'users'), 
          where('role', '==', 'FACTORY_OWNER'),
          where('resellerId', '==', resellerUid)
      );
      const snapshot = await getDocs(q);
      
      const tenants = await Promise.all(snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const workersQ = query(collection(db, "workers"), where("tenantId", "==", data.tenantId));
        const workersSnap = await getDocs(workersQ);
        
        let plan = 'FREE';
        let branding = {};
        
        if (data.tenantId) {
            const tenantDoc = await getDoc(doc(db, 'tenants', data.tenantId));
            if (tenantDoc.exists()) {
                plan = tenantDoc.data().plan || 'FREE';
                branding = tenantDoc.data().branding || {};
            }
        }
        
        return {
          id: docSnap.id,
          ...data,
          workerCount: workersSnap.size,
          isActive: data.isActive !== false, 
          joinedAt: data.createdAt || new Date().toISOString(),
          plan: plan,
          branding: branding
        };
      }));
      if (tenants.length === 0) return DEMO_TENANTS.slice(0, 2);
      return tenants;
    } catch (error) {
      console.warn("Using demo reseller clients:", error);
      return DEMO_TENANTS.slice(0, 2);
    }
  },

  // Support for Custom Trial Days
  inviteResellerClient: async (resellerUid: string, email: string, companyName: string, plan: SubscriptionTier, trialDays: number = FREE_TRIAL_DAYS) => {
    let trialEndsAt = null;
    
    if (plan === 'TRIAL') {
        const d = new Date();
        d.setDate(d.getDate() + trialDays);
        trialEndsAt = d.toISOString();
    }

    await setDoc(doc(db, "invites", email), {
      email, 
      companyName, 
      role: 'FACTORY_OWNER', 
      resellerId: resellerUid, 
      plan: plan,
      trialEndsAt: trialEndsAt,
      createdAt: new Date().toISOString()
    });
  },

  // --- WORKER MANAGEMENT ---
  getWorkers: async (tenantId: string): Promise<Worker[]> => {
    if (!tenantId) return [];
    if (tenantId === 'demo-tenant-id') return getStoredDemoWorkers();
    try {
      const q = query(getWorkersRef(), where("tenantId", "==", tenantId));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => normalizeWorker({ id: doc.id, ...doc.data() }));
      if (list.length > 0) return list;
      return [];
    } catch (e) {
      console.warn("Firestore getWorkers fallback to demo:", e);
      return getStoredDemoWorkers();
    }
  },

  addWorker: async (worker: Omit<Worker, 'id'>) => {
    if (worker.tenantId === 'demo-tenant-id') {
      const current = getStoredDemoWorkers();
      const newWorker: Worker = {
        ...worker,
        id: 'worker-' + Date.now(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setStoredDemoWorkers([newWorker, ...current]);
      return newWorker.id;
    }
    const workerData = {
      ...worker,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      const docRef = await addDoc(getWorkersRef(), workerData);
      return docRef.id;
    } catch {
      const current = getStoredDemoWorkers();
      const newWorker: Worker = {
        ...worker,
        id: 'worker-' + Date.now(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setStoredDemoWorkers([newWorker, ...current]);
      return newWorker.id;
    }
  },

  updateWorker: async (workerId: string, data: Partial<Worker>) => {
    if (workerId.startsWith('worker-')) {
      const current = getStoredDemoWorkers();
      const updated = current.map(w => w.id === workerId ? { ...w, ...data, updatedAt: new Date().toISOString() } : w);
      setStoredDemoWorkers(updated);
      return;
    }
    try {
      const docRef = doc(db, "workers", workerId);
      const updateData = {
        ...data,
        updatedAt: new Date().toISOString(),
      };
      await updateDoc(docRef, updateData);
    } catch {
      const current = getStoredDemoWorkers();
      const updated = current.map(w => w.id === workerId ? { ...w, ...data, updatedAt: new Date().toISOString() } : w);
      setStoredDemoWorkers(updated);
    }
  },

  deleteWorker: async (tenantId: string, workerId: string) => {
    const current = getStoredDemoWorkers();
    setStoredDemoWorkers(current.filter(w => w.id !== workerId));
    if (tenantId === 'demo-tenant-id') return;

    try {
      const attendanceQ = query(collection(db, "attendance"), where("tenantId", "==", tenantId));
      const attendanceSnap = await getDocs(attendanceQ);
      const attendanceDeletes = attendanceSnap.docs
          .filter(d => d.data().workerId === workerId)
          .map(d => deleteDoc(doc(db, "attendance", d.id)));

      const advancesQ = query(collection(db, "advances"), where("tenantId", "==", tenantId));
      const advancesSnap = await getDocs(advancesQ);
      const advanceDeletes = advancesSnap.docs
          .filter(d => d.data().workerId === workerId)
          .map(d => deleteDoc(doc(db, "advances", d.id)));

      const payrollsQ = query(collection(db, "payrolls"), where("tenantId", "==", tenantId));
      const payrollsSnap = await getDocs(payrollsQ);
      const payrollDeletes = payrollsSnap.docs
          .filter(d => d.data().workerId === workerId)
          .map(d => deleteDoc(doc(db, "payrolls", d.id)));

      await Promise.all([...attendanceDeletes, ...advanceDeletes, ...payrollDeletes]);
      await deleteDoc(doc(db, "workers", workerId));
    } catch (e) {
      console.warn("deleteWorker error:", e);
    }
  },

  // --- NOTIFICATIONS ---
  addNotification: async (notification: Omit<AppNotification, 'id'>) => {
    try {
      await addDoc(getNotificationsRef(), notification);
    } catch (e) {
      console.warn("addNotification error:", e);
    }
  },

  getNotifications: async (tenantId: string): Promise<AppNotification[]> => {
    if (!tenantId || tenantId === 'demo-tenant-id') return [];
    try {
      const q = query(getNotificationsRef(), where("tenantId", "==", tenantId));
      const snapshot = await getDocs(q);
      return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as AppNotification))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (e) {
      console.warn("getNotifications error:", e);
      return [];
    }
  },

  markNotificationRead: async (notificationId: string) => {
    try {
      const docRef = doc(db, "notifications", notificationId);
      await updateDoc(docRef, { read: true });
    } catch (e) {
      console.warn("markNotificationRead error:", e);
    }
  },

  deleteAllNotifications: async (tenantId: string) => {
    if (!tenantId || tenantId === 'demo-tenant-id') return;
    try {
      const q = query(getNotificationsRef(), where("tenantId", "==", tenantId));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, "notifications", d.id)));
      await Promise.all(deletePromises);
    } catch (e) {
      console.warn("deleteAllNotifications error:", e);
    }
  },

  // --- ATTENDANCE ---
  getTodayAttendance: async (tenantId: string) => {
    if (!tenantId) return [];
    
    let localList: AttendanceRecord[] = [];
    const today = new Date().toISOString().split('T')[0];
    try {
      const raw = localStorage.getItem('demo_attendance_today');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          localList = parsed.filter(r => r.tenantId === tenantId && (r.date || '').slice(0, 10) === today);
        }
      }
    } catch {}

    if (tenantId === 'demo-tenant-id') {
      const all = getStoredDemoAttendance(tenantId);
      return all.filter(r => (r.date || '').slice(0, 10) === today);
    }

    try {
      const q = query(
        getAttendanceRef(), 
        where("tenantId", "==", tenantId),
        where("date", "==", today)
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
      
      const recordMap = new Map<string, AttendanceRecord>();
      localList.forEach(r => {
        if (r.workerId) recordMap.set(r.workerId, r);
      });
      list.forEach(r => {
        if (r.workerId) recordMap.set(r.workerId, r);
      });

      const merged = Array.from(recordMap.values());
      return merged.length > 0 ? merged : localList;
    } catch {
      return localList.length > 0 ? localList : getStoredDemoAttendance(tenantId);
    }
  },

  getAttendanceHistory: async (tenantId: string): Promise<AttendanceRecord[]> => {
    if (!tenantId) return [];
    
    let localList: AttendanceRecord[] = [];
    try {
      const raw = localStorage.getItem('demo_attendance_today');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          localList = parsed.filter(r => r.tenantId === tenantId);
        }
      }
    } catch {}

    if (tenantId === 'demo-tenant-id') {
      return getStoredDemoAttendance(tenantId);
    }

    try {
      const q = query(getAttendanceRef(), where("tenantId", "==", tenantId));
      const snapshot = await getDocs(q);
      const firestoreList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
      
      const recordMap = new Map<string, AttendanceRecord>();
      // Seed with local records
      localList.forEach(r => {
        if (r.workerId && r.date) {
          recordMap.set(`${r.workerId}_${r.date.slice(0, 10)}`, r);
        }
      });
      // Merge with Firestore records
      firestoreList.forEach(r => {
        if (r.workerId && r.date) {
          recordMap.set(`${r.workerId}_${r.date.slice(0, 10)}`, r);
        }
      });

      const merged = Array.from(recordMap.values());
      if (merged.length > 0) return merged;
      return localList.length > 0 ? localList : [];
    } catch (e) {
      console.warn("getAttendanceHistory Firestore fallback:", e);
      return localList.length > 0 ? localList : getStoredDemoAttendance(tenantId);
    }
  },

  markAttendanceOnline: async (record: AttendanceRecord) => {
    const recordId = `${record.tenantId}_${record.workerId}_${record.date}`;
    const finalRecord = { ...record, id: recordId };
    saveDemoAttendanceRecord(finalRecord);
    if (record.tenantId !== 'demo-tenant-id') {
      try {
        await setDoc(doc(db, "attendance", recordId), finalRecord, { merge: true });
      } catch (e) {
        console.warn("markAttendanceOnline offline fallback", e);
      }
    }
  },

  markAttendance: async (record: AttendanceRecord) => {
    const recordId = `${record.tenantId}_${record.workerId}_${record.date}`;
    const finalRecord = { ...record, id: recordId };
    saveDemoAttendanceRecord(finalRecord);
    if (record.tenantId !== 'demo-tenant-id') {
      try {
        await setDoc(doc(db, "attendance", recordId), finalRecord, { merge: true });
      } catch (e) {
        console.warn("markAttendance offline fallback", e);
      }
    }
  },

  // --- ADVANCES / KHARCHI ---
  getAdvances: async (tenantId: string): Promise<Advance[]> => {
    if (!tenantId) return [];
    if (tenantId === 'demo-tenant-id') return getStoredDemoAdvances();
    try {
      const q = query(collection(db, "advances"), where("tenantId", "==", tenantId));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Advance));
      if (list.length > 0) return list;
      return [];
    } catch {
      return getStoredDemoAdvances();
    }
  },

  addAdvance: async (advance: Omit<Advance, 'id'>) => {
    if (advance.tenantId === 'demo-tenant-id') {
      const current = getStoredDemoAdvances();
      const newAdv: Advance = { ...advance, id: 'adv-' + Date.now() };
      setStoredDemoAdvances([newAdv, ...current]);
      return newAdv.id;
    }
    try {
      const docRef = await addDoc(collection(db, "advances"), advance);
      return docRef.id;
    } catch {
      const current = getStoredDemoAdvances();
      const newAdv: Advance = { ...advance, id: 'adv-' + Date.now() };
      setStoredDemoAdvances([newAdv, ...current]);
      return newAdv.id;
    }
  },

  updateAdvanceStatus: async (advanceId: string, status: 'APPROVED' | 'PENDING' | 'REPAID'): Promise<void> => {
    try {
      const demoList = getStoredDemoAdvances();
      const idx = demoList.findIndex(a => a.id === advanceId);
      if (idx >= 0) {
        demoList[idx].status = status;
        if (status === 'REPAID') demoList[idx].repaid = true;
        setStoredDemoAdvances(demoList);
      }
      await updateDoc(doc(db, "advances", advanceId), { status, repaid: status === 'REPAID' });
    } catch (e) {
      console.warn("updateAdvanceStatus fallback:", e);
    }
  },

  // --- SETTINGS ---
  getOrgSettings: async (tenantId: string): Promise<OrgSettings> => {
    const defaultShifts: ShiftConfig[] = [{
      id: 'default', name: 'General Shift', startTime: '09:00', endTime: '18:00',
      gracePeriodMins: 15, maxGraceAllowed: 3, breakDurationMins: 60, minOvertimeMins:60, minHalfDayHours: 4
    }];
    const defaultDepartments = ['Production', 'Packaging', 'Maintenance', 'Loading', 'Quality'];
    const defaultBranch = { id: 'default', name: 'Main Branch' };
    const defaultWeeklyOffs: OrgSettings['weeklyOffs'] = {
      defaultDays: [0], 
      saturdayRule: 'NONE'
    };
    
    const defaultCompliance = {
      pfRegistrationNumber: '',
      esicCode: '',
      capPfDeduction: true,
      dailyWagePfPercentage: 100,
      pfContributionRate: 12,
      epsContributionRate: 8.33,
      epfWageCeiling: 15000
    };

    const fallbackSettings: OrgSettings = { 
      shifts: defaultShifts, enableBreakTracking: false, strictLiveness: false, branches: [defaultBranch], departments: defaultDepartments,
      weeklyOffs: defaultWeeklyOffs, holidays: [], enableSandwichRule: false, holidayPayMultiplier: 2.0,
      compliance: defaultCompliance
    };

    if (tenantId === 'demo-tenant-id') {
      try {
        const local = localStorage.getItem(`demo_settings_${tenantId}`);
        if (local) {
          const parsed = JSON.parse(local);
          return { ...fallbackSettings, ...parsed };
        }
      } catch {}
      return fallbackSettings;
    }

    try {
      const docRef = doc(db, "settings", tenantId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return {
          shifts: data.shifts || defaultShifts,
          enableBreakTracking: data.enableBreakTracking ?? false,
          strictLiveness: data.strictLiveness ?? false,
          baseLocation: data.baseLocation,
          branches: data.branches?.length ? data.branches : [{ ...defaultBranch, location: data.baseLocation }],
          departments: data.departments?.length ? data.departments : defaultDepartments,
          weeklyOffs: data.weeklyOffs || defaultWeeklyOffs,
          holidays: data.holidays || [],
          enableSandwichRule: data.enableSandwichRule ?? false,
          holidayPayMultiplier: data.holidayPayMultiplier ?? 2.0,
          compliance: { ...defaultCompliance, ...(data.compliance || {}) }
        };
      }
    } catch (e) {
      console.warn("getOrgSettings fallback:", e);
      try {
        const local = localStorage.getItem(`settings_${tenantId}`);
        if (local) {
          const parsed = JSON.parse(local);
          return { ...fallbackSettings, ...parsed };
        }
      } catch {}
    }
    return fallbackSettings;
  },

  saveOrgSettings: async (tenantId: string, settings: OrgSettings) => {
    const settingsData = {
      ...settings,
      updatedAt: new Date().toISOString()
    };
    if (tenantId === 'demo-tenant-id') {
      try {
        localStorage.setItem(`demo_settings_${tenantId}`, JSON.stringify(settingsData));
      } catch (e) {
        console.warn("Local storage settings save error:", e);
      }
      return;
    }
    try {
      await setDoc(doc(db, "settings", tenantId), settingsData, { merge: true });
    } catch (e) {
      console.warn("saveOrgSettings firestore error, falling back to local:", e);
      try {
        localStorage.setItem(`settings_${tenantId}`, JSON.stringify(settingsData));
      } catch (err) {
        console.warn("Local storage settings save error:", err);
      }
    }
  },

  getShifts: async (tenantId: string): Promise<ShiftConfig[]> => {
    const settings = await dbService.getOrgSettings(tenantId);
    return settings.shifts;
  },

  saveShifts: async (tenantId: string, shifts: ShiftConfig[]) => {
    if (tenantId === 'demo-tenant-id') {
      try {
        const local = localStorage.getItem(`demo_settings_${tenantId}`);
        const parsed = local ? JSON.parse(local) : {};
        localStorage.setItem(`demo_settings_${tenantId}`, JSON.stringify({ ...parsed, shifts }));
      } catch {}
      return;
    }
    try {
      await setDoc(doc(db, "settings", tenantId), { shifts }, { merge: true });
    } catch (e) {
      console.warn("saveShifts fallback to local:", e);
      try {
        const local = localStorage.getItem(`settings_${tenantId}`);
        const parsed = local ? JSON.parse(local) : {};
        localStorage.setItem(`settings_${tenantId}`, JSON.stringify({ ...parsed, shifts }));
      } catch {}
    }
  },

  getMonthlyLateCount: async (tenantId: string, workerId: string): Promise<number> => {
    try {
      const startOfMonth = new Date().toISOString().slice(0, 7); 
      if (tenantId === 'demo-tenant-id') {
        const history = getStoredDemoAttendance(tenantId);
        return history.filter(d => d.workerId === workerId && d.date >= `${startOfMonth}-01` && d.lateStatus?.isLate).length;
      }
      const q = query(
        collection(db, "attendance"), 
        where("tenantId", "==", tenantId),
        where("workerId", "==", workerId),
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.filter(d => {
          const data = d.data();
          return data.date >= `${startOfMonth}-01` && data.lateStatus?.isLate === true;
      }).length;
    } catch (e) {
      console.warn("getMonthlyLateCount fallback:", e);
      try {
        const history = getStoredDemoAttendance(tenantId);
        const startOfMonth = new Date().toISOString().slice(0, 7);
        return history.filter(d => d.workerId === workerId && d.date >= `${startOfMonth}-01` && d.lateStatus?.isLate).length;
      } catch {
        return 0;
      }
    }
  },

  getTeam: async (tenantId: string) => {
    if (!tenantId || tenantId === 'demo-tenant-id') {
      try {
        const stored = localStorage.getItem('demo_supervisors');
        return stored ? JSON.parse(stored) : [
          { uid: 'demo-sup-1', name: 'Vikram Joshi', email: 'vikram.supervisor@factory.demo', role: 'SUPERVISOR', tenantId }
        ];
      } catch {
        return [{ uid: 'demo-sup-1', name: 'Vikram Joshi', email: 'vikram.supervisor@factory.demo', role: 'SUPERVISOR', tenantId }];
      }
    }
    try {
      const q = query(collection(db, "users"), where("tenantId", "==", tenantId), where("role", "==", "SUPERVISOR"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data());
    } catch (e) {
      console.warn("getTeam fallback to local:", e);
      try {
        const stored = localStorage.getItem(`supervisors_${tenantId}`);
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }
  },

  inviteManager: async (adminTenantId: string, managerEmail: string, managerName: string) => {
    const newSup = { uid: 'sup-' + Date.now(), name: managerName, email: managerEmail, role: 'SUPERVISOR', tenantId: adminTenantId };
    try {
      const key = adminTenantId === 'demo-tenant-id' ? 'demo_supervisors' : `supervisors_${adminTenantId}`;
      const stored = localStorage.getItem(key);
      const list = stored ? JSON.parse(stored) : [];
      list.push(newSup);
      localStorage.setItem(key, JSON.stringify(list));
    } catch {}

    if (adminTenantId === 'demo-tenant-id') return;

    try {
      await setDoc(doc(db, "invites", managerEmail), {
        email: managerEmail, name: managerName, tenantId: adminTenantId, role: 'SUPERVISOR', createdAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn("inviteManager fallback:", e);
    }
  },

  checkInvite: async (email: string) => {
    try {
      const docRef = doc(db, "invites", email);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch {
      return null;
    }
  },

  deleteInvite: async (email: string) => {
    try {
      await deleteDoc(doc(db, "invites", email));
    } catch (e) {
      console.warn("deleteInvite fallback:", e);
    }
  },

  removeManager: async (uid: string) => {
    try {
      const stored = localStorage.getItem('demo_supervisors');
      if (stored) {
        const list = JSON.parse(stored);
        localStorage.setItem('demo_supervisors', JSON.stringify(list.filter((m: any) => m.uid !== uid)));
      }
    } catch {}
    try {
      const docRef = doc(db, "users", uid);
      await updateDoc(docRef, { tenantId: null, role: null });
    } catch (e) {
      console.warn("removeManager fallback:", e);
    }
  },

  updateTenant: async (tenantId: string, data: { name: string }) => {
    try {
      const tenantRef = doc(db, "tenants", tenantId);
      await updateDoc(tenantRef, data);
    } catch (e) {
      console.warn("updateTenant fallback:", e);
    }
  },

  // --- KIOSK TERMINALS ---
  getKioskTerminals: async (tenantId: string): Promise<any[]> => {
    if (!tenantId) return [];
    if (tenantId === 'demo-tenant-id') {
      try {
        const stored = localStorage.getItem('demo_kiosks');
        return stored ? JSON.parse(stored) : [
          { id: '102938', tenantId: 'demo-tenant-id', name: 'Main Gate Terminal', pairingCode: '102938', adminPin: '1234', status: 'active', createdAt: new Date().toISOString() }
        ];
      } catch {
        return [];
      }
    }
    try {
      const q = query(collection(db, "kiosks"), where("tenantId", "==", tenantId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
      console.warn("getKioskTerminals error:", e);
      try {
        const stored = localStorage.getItem(`kiosks_${tenantId}`);
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }
  },

  addKioskTerminal: async (terminal: any) => {
    try {
      const key = terminal.tenantId === 'demo-tenant-id' ? 'demo_kiosks' : `kiosks_${terminal.tenantId}`;
      const stored = localStorage.getItem(key);
      const list = stored ? JSON.parse(stored) : [];
      list.push(terminal);
      localStorage.setItem(key, JSON.stringify(list));
    } catch {}

    if (terminal.tenantId === 'demo-tenant-id') return;
    try {
      await setDoc(doc(db, "kiosks", terminal.pairingCode), terminal);
    } catch (e) {
      console.warn("addKioskTerminal fallback:", e);
    }
  },

  deleteKioskTerminal: async (id: string) => {
    try {
      ['demo_kiosks'].forEach(key => {
        const stored = localStorage.getItem(key);
        if (stored) {
          const list = JSON.parse(stored);
          localStorage.setItem(key, JSON.stringify(list.filter((k: any) => k.id !== id && k.pairingCode !== id)));
        }
      });
    } catch {}
    try {
      await deleteDoc(doc(db, "kiosks", id));
    } catch (e) {
      console.warn("deleteKioskTerminal fallback:", e);
    }
  },

  verifyKioskPairingCode: async (code: string): Promise<any | null> => {
    try {
      const localDemo = localStorage.getItem('demo_kiosks');
      if (localDemo) {
        const list = JSON.parse(localDemo);
        const match = list.find((k: any) => k.pairingCode === code);
        if (match) return match;
      }
    } catch {}

    try {
      const docRef = doc(db, "kiosks", code);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };
    } catch (e) {
      console.warn("verifyKioskPairingCode fallback:", e);
    }
    return null;
  },

  // --- PAYROLL METHODS ---
  getPayrollsByMonth: async (tenantId: string, month: string): Promise<MonthlyPayroll[]> => {
    if (!tenantId) return [];
    if (tenantId === 'demo-tenant-id') {
      try {
        const stored = localStorage.getItem(`demo_payrolls_${month}`);
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }
    try {
      const q = query(
        collection(db, "payrolls"), 
        where("tenantId", "==", tenantId),
        where("month", "==", month)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MonthlyPayroll));
    } catch (e) {
      console.warn("getPayrollsByMonth fallback to local:", e);
      try {
        const stored = localStorage.getItem(`demo_payrolls_${month}`);
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }
  },

  saveMonthlyPayroll: async (payroll: MonthlyPayroll) => {
    return dbService.savePayroll(payroll);
  },

  savePayroll: async (payroll: MonthlyPayroll) => {
    if (payroll.tenantId === 'demo-tenant-id') {
      try {
        const key = `demo_payrolls_${payroll.month}`;
        const stored = localStorage.getItem(key);
        const list: MonthlyPayroll[] = stored ? JSON.parse(stored) : [];
        const index = list.findIndex(p => p.workerId === payroll.workerId);
        if (index >= 0) {
          list[index] = payroll;
        } else {
          list.push(payroll);
        }
        localStorage.setItem(key, JSON.stringify(list));
      } catch (e) {
        console.warn("Failed to save demo payroll locally:", e);
      }
      return;
    }
    try {
      await setDoc(doc(db, "payrolls", payroll.id), payroll, { merge: true });
    } catch (e) {
      console.warn("savePayroll firestore write error, caching locally:", e);
      try {
        const key = `demo_payrolls_${payroll.month}`;
        const stored = localStorage.getItem(key);
        const list: MonthlyPayroll[] = stored ? JSON.parse(stored) : [];
        const index = list.findIndex(p => p.workerId === payroll.workerId);
        if (index >= 0) {
          list[index] = payroll;
        } else {
          list.push(payroll);
        }
        localStorage.setItem(key, JSON.stringify(list));
      } catch {}
    }
  },

  // --- DELETE TENANT ACCOUNT ---
  deleteTenantAccount: async (tenantId: string, ownerUid: string) => {
    if (!tenantId || !ownerUid) throw new Error("Missing credentials for deletion.");

    try {
      // 1. Delete all workers
      const workersQ = query(collection(db, "workers"), where("tenantId", "==", tenantId));
      const workersSnap = await getDocs(workersQ);
      const workerDeletes = workersSnap.docs.map(d => deleteDoc(doc(db, "workers", d.id)));
      await Promise.all(workerDeletes);

      // 2. Delete all attendance records
      const attendanceQ = query(collection(db, "attendance"), where("tenantId", "==", tenantId));
      const attendanceSnap = await getDocs(attendanceQ);
      const attendanceDeletes = attendanceSnap.docs.map(d => deleteDoc(doc(db, "attendance", d.id)));
      await Promise.all(attendanceDeletes);

      // 3. Delete all payrolls
      const payrollsQ = query(collection(db, "payrolls"), where("tenantId", "==", tenantId));
      const payrollsSnap = await getDocs(payrollsQ);
      const payrollDeletes = payrollsSnap.docs.map(d => deleteDoc(doc(db, "payrolls", d.id)));
      await Promise.all(payrollDeletes);

      // 4. Delete all advances
      const advancesQ = query(collection(db, "advances"), where("tenantId", "==", tenantId));
      const advancesSnap = await getDocs(advancesQ);
      const advanceDeletes = advancesSnap.docs.map(d => deleteDoc(doc(db, "advances", d.id)));
      await Promise.all(advanceDeletes);

      // 5. Delete all kiosks
      const kiosksQ = query(collection(db, "kiosks"), where("tenantId", "==", tenantId));
      const kiosksSnap = await getDocs(kiosksQ);
      const kioskDeletes = kiosksSnap.docs.map(d => deleteDoc(doc(db, "kiosks", d.id)));
      await Promise.all(kioskDeletes);

      // 6. Delete all notifications
      const notifQ = query(collection(db, "notifications"), where("tenantId", "==", tenantId));
      const notifSnap = await getDocs(notifQ);
      const notifDeletes = notifSnap.docs.map(d => deleteDoc(doc(db, "notifications", d.id)));
      await Promise.all(notifDeletes);

      // 7. Unlink all supervisors associated with this tenant
      const usersQ = query(collection(db, "users"), where("tenantId", "==", tenantId), where("role", "==", "SUPERVISOR"));
      const usersSnap = await getDocs(usersQ);
      const supervisorUnlinks = usersSnap.docs.map(d => updateDoc(doc(db, "users", d.id), { tenantId: null, role: null }));
      await Promise.all(supervisorUnlinks);

      // 8. Delete Tenant Settings
      await deleteDoc(doc(db, "settings", tenantId));

      // 9. Delete the Tenant record itself
      await deleteDoc(doc(db, "tenants", tenantId));

      // 10. Finally, delete the Owner User record
      await deleteDoc(doc(db, "users", ownerUid));

      return true;
    } catch (error) {
      console.error("Critical error during tenant deletion:", error);
      throw error;
    }
  }
};