import { 
  collection, addDoc, query, where, getDocs, doc, setDoc, deleteDoc, getDoc, updateDoc 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { Worker, AttendanceRecord, Advance, ShiftConfig, OrgSettings } from "../types/index";

const getWorkersRef = () => collection(db, "workers");
const getAttendanceRef = () => collection(db, "attendance");

export const dbService = {
  
  // --- WORKER MANAGEMENT ---
  getWorkers: async (tenantId: string): Promise<Worker[]> => {
    if (!tenantId) return [];
    const q = query(getWorkersRef(), where("tenantId", "==", tenantId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Worker));
  },

  addWorker: async (worker: Omit<Worker, 'id'>) => {
    const docRef = await addDoc(getWorkersRef(), worker);
    return docRef.id;
  },

  updateWorker: async (workerId: string, data: Partial<Worker>) => {
    const docRef = doc(db, "workers", workerId);
    await updateDoc(docRef, data);
  },

  deleteWorker: async (workerId: string) => {
    await deleteDoc(doc(db, "workers", workerId));
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

  markAttendance: async (record: AttendanceRecord) => {
    const recordId = `${record.tenantId}_${record.workerId}_${record.date}`;
    const finalRecord = { ...record, id: recordId };
    await setDoc(doc(db, "attendance", recordId), finalRecord, { merge: true });
  },

  getAdvances: async (tenantId: string): Promise<Advance[]> => {
    if (!tenantId) return [];
    const q = query(collection(db, "advances"), where("tenantId", "==", tenantId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Advance));
  },

  // --- SETTINGS & CONFIGURATION (NEW) ---
  
  // Fetch full Organization Settings (Shifts + Break Logic)
  getOrgSettings: async (tenantId: string): Promise<OrgSettings> => {
    const docRef = doc(db, "settings", tenantId);
    const snap = await getDoc(docRef);
    
    // Defaults
    const defaultShifts: ShiftConfig[] = [{
      id: 'default',
      name: 'General Shift',
      startTime: '09:00',
      endTime: '18:00',
      gracePeriodMins: 15,
      maxGraceAllowed: 3,
      breakDurationMins: 60,
      minHalfDayHours: 4
    }];

    if (snap.exists()) {
      const data = snap.data();
      return {
        shifts: data.shifts || defaultShifts,
        enableBreakTracking: data.enableBreakTracking ?? false // Default OFF (Standard Logic)
      };
    }
    
    // If no settings exist yet
    return { shifts: defaultShifts, enableBreakTracking: false };
  },

  saveOrgSettings: async (tenantId: string, settings: OrgSettings) => {
    await setDoc(doc(db, "settings", tenantId), settings, { merge: true });
  },

  // --- LEGACY SHIFT MANAGEMENT (Wrappers) ---
  
  getShifts: async (tenantId: string): Promise<ShiftConfig[]> => {
    const settings = await dbService.getOrgSettings(tenantId);
    return settings.shifts;
  },

  saveShifts: async (tenantId: string, shifts: ShiftConfig[]) => {
    // Merges shifts into the existing settings document
    await setDoc(doc(db, "settings", tenantId), { shifts }, { merge: true });
  },

  // --- LOGIC HELPERS ---

  // Count how many times this worker was late THIS MONTH
  getMonthlyLateCount: async (tenantId: string, workerId: string): Promise<number> => {
    const startOfMonth = new Date().toISOString().slice(0, 7); // "2023-10"
    
    const q = query(
      collection(db, "attendance"), 
      where("tenantId", "==", tenantId),
      where("workerId", "==", workerId),
    );
    
    const snapshot = await getDocs(q);
    // Count records where lateStatus.isLate == true
    return snapshot.docs.filter(d => {
        const data = d.data();
        return data.date >= `${startOfMonth}-01` && data.lateStatus?.isLate === true;
    }).length;
  },

  // --- TEAM MANAGEMENT ---
  getTeam: async (tenantId: string) => {
    const q = query(collection(db, "users"), where("tenantId", "==", tenantId), where("role", "==", "SUPERVISOR"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  },

  inviteManager: async (adminTenantId: string, managerEmail: string, managerName: string) => {
    await setDoc(doc(db, "invites", managerEmail), {
      email: managerEmail,
      name: managerName,
      tenantId: adminTenantId,
      role: 'SUPERVISOR',
      createdAt: new Date().toISOString()
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

  // --- TENANT MANAGEMENT ---
  updateTenant: async (tenantId: string, data: { name: string }) => {
    const tenantRef = doc(db, "tenants", tenantId);
    await updateDoc(tenantRef, data);
  }
};