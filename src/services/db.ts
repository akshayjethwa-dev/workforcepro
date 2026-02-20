import { 
  collection, addDoc, query, where, getDocs, doc, setDoc, deleteDoc, getDoc, updateDoc 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { Worker, AttendanceRecord, Advance, ShiftConfig, OrgSettings, AppNotification } from "../types/index";
import { syncService } from './syncService';

const getWorkersRef = () => collection(db, "workers");
const getAttendanceRef = () => collection(db, "attendance");
const getNotificationsRef = () => collection(db, "notifications");

export const dbService = {
  
  // --- SUPER ADMIN METHODS ---
  
  getAllTenants: async () => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'FACTORY_OWNER'));
      const snapshot = await getDocs(q);
      
      const tenants = await Promise.all(snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const workersQ = query(collection(db, "workers"), where("tenantId", "==", data.tenantId));
        const workersSnap = await getDocs(workersQ);
        
        return {
          id: docSnap.id,
          ...data,
          workerCount: workersSnap.size,
          // Default to true if not set
          isActive: data.isActive !== false, 
          joinedAt: data.createdAt || new Date().toISOString()
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
    await updateDoc(userRef, {
      isActive: !currentStatus
    });
  },

  makeSuperAdmin: async (userId: string) => {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { role: 'SUPER_ADMIN' });
    return true;
  },

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

  // --- NEW: NOTIFICATIONS ---
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
    // If clearly offline, drop it directly into the queue
    if (!navigator.onLine) {
       syncService.enqueue(record);
       return;
    }
    
    // If we think we're online, try sending. If it fails, catch and queue it.
    try {
       await dbService.markAttendanceOnline(record);
    } catch (e) {
       console.warn("Network write failed, queueing offline");
       syncService.enqueue(record);
    }
  },

  getAdvances: async (tenantId: string): Promise<Advance[]> => {
    if (!tenantId) return [];
    const q = query(collection(db, "advances"), where("tenantId", "==", tenantId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Advance));
  },

  // --- SETTINGS ---
  getOrgSettings: async (tenantId: string): Promise<OrgSettings> => {
    const docRef = doc(db, "settings", tenantId);
    const snap = await getDoc(docRef);
    const defaultShifts: ShiftConfig[] = [{
      id: 'default',
      name: 'General Shift',
      startTime: '09:00',
      endTime: '18:00',
      gracePeriodMins: 15,
      maxGraceAllowed: 3,
      breakDurationMins: 60,
      minOvertimeMins:60,
      minHalfDayHours: 4
    }];

    if (snap.exists()) {
      const data = snap.data();
      return {
        shifts: data.shifts || defaultShifts,
        enableBreakTracking: data.enableBreakTracking ?? false,
        baseLocation: data.baseLocation
      };
    }
    return { shifts: defaultShifts, enableBreakTracking: false };
  },

  saveOrgSettings: async (tenantId: string, settings: OrgSettings) => {
    await setDoc(doc(db, "settings", tenantId), settings, { merge: true });
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

  updateTenant: async (tenantId: string, data: { name: string }) => {
    const tenantRef = doc(db, "tenants", tenantId);
    await updateDoc(tenantRef, data);
  }
};