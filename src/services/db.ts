// src/services/db.ts
import { 
  collection, addDoc, query, where, getDocs, doc, setDoc, deleteDoc, getDoc, updateDoc 
} from "firebase/firestore";
import { db } from "../lib/firebase";
// ADDED DEFAULT_PLAN_CONFIG to the imports
import { Worker, AttendanceRecord, Advance, ShiftConfig, OrgSettings, AppNotification, MonthlyPayroll, SubscriptionTier, PlanLimits, DEFAULT_PLAN_CONFIG } from "../types/index";

const getWorkersRef = () => collection(db, "workers");
const getAttendanceRef = () => collection(db, "attendance");
const getNotificationsRef = () => collection(db, "notifications");

export const dbService = {
  
  // --- SUPER ADMIN METHODS ---

  // NEW: Fetch Global Plans from Firestore
  getGlobalPlanConfig: async (): Promise<Record<SubscriptionTier, PlanLimits>> => {
    try {
      const docRef = doc(db, "system_settings", "plan_config");
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as Record<SubscriptionTier, PlanLimits>;
      }
      // If no config exists yet, return the hardcoded defaults
      return DEFAULT_PLAN_CONFIG;
    } catch (error) {
      console.error("Failed to fetch global plans, falling back to default", error);
      return DEFAULT_PLAN_CONFIG;
    }
  },

  // NEW: Save Global Plans to Firestore
  updateGlobalPlanConfig: async (config: Record<SubscriptionTier, PlanLimits>) => {
    const docRef = doc(db, "system_settings", "plan_config");
    // merge: true ensures we don't accidentally wipe out other settings if we expand this document later
    await setDoc(docRef, config, { merge: true });
  },

  getAllTenants: async () => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'FACTORY_OWNER'));
      const snapshot = await getDocs(q);
      
      const tenants = await Promise.all(snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const workersQ = query(collection(db, "workers"), where("tenantId", "==", data.tenantId));
        const workersSnap = await getDocs(workersQ);
        
        // NEW: Fetch the actual plan and overrides from the tenant's document
        let plan = 'FREE';
        let overrides = {};
        if (data.tenantId) {
            const tenantDoc = await getDoc(doc(db, 'tenants', data.tenantId));
            if (tenantDoc.exists()) {
                plan = tenantDoc.data().plan || 'FREE';
                overrides = tenantDoc.data().overrides || {}; // NEW: Fetch overrides
            }
        }
        
        return {
          id: docSnap.id,
          ...data,
          workerCount: workersSnap.size,
          isActive: data.isActive !== false, 
          joinedAt: data.createdAt || new Date().toISOString(),
          plan: plan, // Append plan to the returned object
          overrides: overrides // NEW: Append overrides to the returned object
        };
      }));
      
      return tenants;
    } catch (error) {
      console.error("Error fetching tenants:", error);
      return [];
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

  // Update Tenant Plan in the database
  updateTenantPlan: async (tenantId: string, plan: SubscriptionTier) => {
    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, { plan });
  },

  // NEW: Update Custom Overrides
  updateTenantOverrides: async (tenantId: string, overrides: Partial<PlanLimits>) => {
    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, { overrides });
  },

  // --- WORKER MANAGEMENT ---
  getWorkers: async (tenantId: string): Promise<Worker[]> => {
    if (!tenantId) return [];
    const q = query(getWorkersRef(), where("tenantId", "==", tenantId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Worker));
  },

  addWorker: async (worker: Omit<Worker, 'id'>) => {
    const workerData = {
      ...worker,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const docRef = await addDoc(getWorkersRef(), workerData);
    return docRef.id;
  },

  updateWorker: async (workerId: string, data: Partial<Worker>) => {
    const docRef = doc(db, "workers", workerId);
    const updateData = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await updateDoc(docRef, updateData);
  },

  deleteWorker: async (tenantId: string, workerId: string) => {
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
  },

  // --- NOTIFICATIONS ---
  addNotification: async (notification: Omit<AppNotification, 'id'>) => {
    await addDoc(getNotificationsRef(), notification);
  },

  getNotifications: async (tenantId: string): Promise<AppNotification[]> => {
    if (!tenantId) return [];
    const q = query(getNotificationsRef(), where("tenantId", "==", tenantId));
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as AppNotification))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  markNotificationRead: async (notificationId: string) => {
    const docRef = doc(db, "notifications", notificationId);
    await updateDoc(docRef, { read: true });
  },

  deleteAllNotifications: async (tenantId: string) => {
    if (!tenantId) return;
    const q = query(getNotificationsRef(), where("tenantId", "==", tenantId));
    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, "notifications", d.id)));
    await Promise.all(deletePromises);
  },

  // --- ATTENDANCE ---
  getTodayAttendance: async (tenantId: string) => {
    if (!tenantId) return [];
    const today = new Date().toISOString().split('T')[0];
    const q = query(
      getAttendanceRef(), 
      where("tenantId", "==", tenantId),
      where("date", "==", today)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
  },

  getAttendanceHistory: async (tenantId: string) => {
    if (!tenantId) return [];
    const q = query(getAttendanceRef(), where("tenantId", "==", tenantId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
  },

  markAttendanceOnline: async (record: AttendanceRecord) => {
    const recordId = `${record.tenantId}_${record.workerId}_${record.date}`;
    const finalRecord = { ...record, id: recordId };
    await setDoc(doc(db, "attendance", recordId), finalRecord, { merge: true });
  },

  markAttendance: async (record: AttendanceRecord) => {
    const recordId = `${record.tenantId}_${record.workerId}_${record.date}`;
    const finalRecord = { ...record, id: recordId };
    
    try {
      await setDoc(doc(db, "attendance", recordId), finalRecord, { merge: true });
    } catch (e) {
      console.error("Failed to write to local cache", e);
    }
  },

  // --- ADVANCES / KHARCHI ---
  getAdvances: async (tenantId: string): Promise<Advance[]> => {
    if (!tenantId) return [];
    const q = query(collection(db, "advances"), where("tenantId", "==", tenantId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Advance));
  },

  addAdvance: async (advance: Omit<Advance, 'id'>) => {
    const docRef = await addDoc(collection(db, "advances"), advance);
    return docRef.id;
  },

  // --- SETTINGS ---
  getOrgSettings: async (tenantId: string): Promise<OrgSettings> => {
    const docRef = doc(db, "settings", tenantId);
    const snap = await getDoc(docRef);
    
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
    return { 
      shifts: defaultShifts, enableBreakTracking: false, strictLiveness: false, branches: [defaultBranch], departments: defaultDepartments,
      weeklyOffs: defaultWeeklyOffs, holidays: [], enableSandwichRule: false, holidayPayMultiplier: 2.0,
      compliance: defaultCompliance
    };
  },

  saveOrgSettings: async (tenantId: string, settings: OrgSettings) => {
    const settingsData = {
      ...settings,
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, "settings", tenantId), settingsData, { merge: true });
  },

  getShifts: async (tenantId: string): Promise<ShiftConfig[]> => {
    const settings = await dbService.getOrgSettings(tenantId);
    return settings.shifts;
  },

  saveShifts: async (tenantId: string, shifts: ShiftConfig[]) => {
    await setDoc(doc(db, "settings", tenantId), { shifts }, { merge: true });
  },

  getMonthlyLateCount: async (tenantId: string, workerId: string): Promise<number> => {
    const startOfMonth = new Date().toISOString().slice(0, 7); 
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
  },

  getTeam: async (tenantId: string) => {
    const q = query(collection(db, "users"), where("tenantId", "==", tenantId), where("role", "==", "SUPERVISOR"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  },

  inviteManager: async (adminTenantId: string, managerEmail: string, managerName: string) => {
    await setDoc(doc(db, "invites", managerEmail), {
      email: managerEmail, name: managerName, tenantId: adminTenantId, role: 'SUPERVISOR', createdAt: new Date().toISOString()
    });
  },

  checkInvite: async (email: string) => {
    const docRef = doc(db, "invites", email);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  },

  deleteInvite: async (email: string) => {
    await deleteDoc(doc(db, "invites", email));
  },

  removeManager: async (uid: string) => {
    const docRef = doc(db, "users", uid);
    await updateDoc(docRef, { tenantId: null, role: null });
  },

  updateTenant: async (tenantId: string, data: { name: string }) => {
    const tenantRef = doc(db, "tenants", tenantId);
    await updateDoc(tenantRef, data);
  },

  // --- KIOSK TERMINALS ---
  getKioskTerminals: async (tenantId: string): Promise<any[]> => {
    if (!tenantId) return [];
    const q = query(collection(db, "kiosks"), where("tenantId", "==", tenantId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  addKioskTerminal: async (terminal: any) => {
    await addDoc(collection(db, "kiosks"), terminal);
  },

  deleteKioskTerminal: async (id: string) => {
    await deleteDoc(doc(db, "kiosks", id));
  },

  verifyKioskPairingCode: async (code: string): Promise<any | null> => {
    const q = query(collection(db, "kiosks"), where("pairingCode", "==", code));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  },

  // --- PAYROLL METHODS ---
  getPayrollsByMonth: async (tenantId: string, month: string): Promise<MonthlyPayroll[]> => {
    if (!tenantId) return [];
    const q = query(
      collection(db, "payrolls"), 
      where("tenantId", "==", tenantId),
      where("month", "==", month)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MonthlyPayroll));
  },

  savePayroll: async (payroll: MonthlyPayroll) => {
    await setDoc(doc(db, "payrolls", payroll.id), payroll, { merge: true });
  }
};