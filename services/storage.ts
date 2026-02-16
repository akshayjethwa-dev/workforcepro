import { Worker, AttendanceRecord, Advance, Shift, DailyWageRecord } from '../types';
import { wageService } from './wageService';

const KEYS = {
  WORKERS: 'wfp_workers',
  ATTENDANCE: 'wfp_attendance',
  ADVANCES: 'wfp_advances',
  WAGES: 'wfp_daily_wages',
  USER: 'wfp_user',
};

// Default Shifts
export const SHIFTS: Shift[] = [
  { id: 'shift_a', name: 'General Shift', startTime: '09:00', endTime: '18:00' },
  { id: 'shift_b', name: 'Night Shift', startTime: '20:00', endTime: '05:00' },
];

const MOCK_WORKERS: Worker[] = [
  {
    id: '1',
    name: 'Ramesh Kumar',
    phone: '9876543210',
    aadhar: '1234-5678-9012',
    dob: '1990-01-01',
    gender: 'Male',
    category: 'Daily Wage',
    department: 'Production',
    designation: 'Helper',
    joinedDate: '2023-01-15',
    shiftId: 'shift_a',
    wageConfig: {
      type: 'DAILY',
      amount: 600,
      overtimeEligible: true,
      allowances: { travel: 50, food: 30, nightShift: 100 }
    },
    faceTemplates: ['mock_template_1'],
    status: 'ACTIVE',
  },
  {
    id: '2',
    name: 'Suresh Singh',
    phone: '9123456789',
    aadhar: '9876-5432-1098',
    dob: '1988-05-20',
    gender: 'Male',
    category: 'Permanent',
    department: 'Maintenance',
    designation: 'Senior Technician',
    joinedDate: '2022-11-01',
    shiftId: 'shift_a',
    wageConfig: {
      type: 'MONTHLY',
      amount: 26000,
      overtimeEligible: true,
      workingDaysPerMonth: 26,
      allowances: { travel: 100, food: 50, nightShift: 0 }
    },
    faceTemplates: ['mock_template_2'],
    status: 'ACTIVE',
  }
];

// Mock Advances
const MOCK_ADVANCES: Advance[] = [
    { id: 'adv_1', workerId: '1', amount: 2000, date: '2023-10-15', reason: 'Medical', status: 'APPROVED' },
    { id: 'adv_2', workerId: '2', amount: 5000, date: '2023-10-05', reason: 'Family function', status: 'APPROVED' }
];

export const storageService = {
  getWorkers: (): Worker[] => {
    const data = localStorage.getItem(KEYS.WORKERS);
    if (!data) {
      localStorage.setItem(KEYS.WORKERS, JSON.stringify(MOCK_WORKERS));
      return MOCK_WORKERS;
    }
    return JSON.parse(data);
  },
  
  addWorker: (worker: Worker) => {
    const workers = storageService.getWorkers();
    workers.push(worker);
    localStorage.setItem(KEYS.WORKERS, JSON.stringify(workers));
  },

  getAttendance: (): AttendanceRecord[] => {
    const data = localStorage.getItem(KEYS.ATTENDANCE);
    return data ? JSON.parse(data) : [];
  },
  
  // New: Get Daily Wages
  getDailyWages: (): DailyWageRecord[] => {
    const data = localStorage.getItem(KEYS.WAGES);
    return data ? JSON.parse(data) : [];
  },

  // New: Get Advances
  getAdvances: (): Advance[] => {
      const data = localStorage.getItem(KEYS.ADVANCES);
      if(!data) {
          localStorage.setItem(KEYS.ADVANCES, JSON.stringify(MOCK_ADVANCES));
          return MOCK_ADVANCES;
      }
      return JSON.parse(data);
  },

  // Optimized for Kiosk Mode - NOW TRIGGERS WAGE CALCULATION
  markKioskAttendance: (workerId: string, photoUrl: string): { status: 'IN' | 'OUT'; record: AttendanceRecord } => {
    const workers = storageService.getWorkers();
    const worker = workers.find(w => w.id === workerId);
    if (!worker) throw new Error("Worker not found");

    const records = storageService.getAttendance();
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const shift = SHIFTS.find(s => s.id === worker.shiftId) || SHIFTS[0];

    const existingIndex = records.findIndex(r => r.workerId === workerId && r.date === today);
    let record: AttendanceRecord;

    if (existingIndex >= 0) {
      // --- HANDLE OUT PUNCH & TRIGGER WAGE CALC ---
      const existing = records[existingIndex];
      
      const inDate = new Date(existing.inTime.timestamp);
      const diffMs = now.getTime() - inDate.getTime();
      const grossHours = diffMs / (1000 * 60 * 60);
      const breakDeduction = grossHours > 5 ? 1.0 : 0; 
      const netHours = Math.max(0, grossHours - breakDeduction);
      const regularHours = Math.min(netHours, 8);
      const overtimeHours = Math.max(0, netHours - 8);

      record = {
        ...existing,
        outTime: {
          timestamp: now.toISOString(),
          geoLocation: { lat: 0, lng: 0 },
          facePhotoUrl: photoUrl,
          deviceInfo: navigator.userAgent,
          markedBy: 'self'
        },
        calculatedHours: {
          grossHours: parseFloat(grossHours.toFixed(2)),
          breakDeduction,
          netWorkingHours: parseFloat(netHours.toFixed(2)),
          regularHours: parseFloat(regularHours.toFixed(2)),
          overtimeHours: parseFloat(overtimeHours.toFixed(2)),
          isLate: existing.calculatedHours?.isLate || false,
          lateByMinutes: existing.calculatedHours?.lateByMinutes || 0
        },
        status: netHours > 4 ? 'PRESENT' : 'HALF_DAY'
      };
      
      records[existingIndex] = record;
      localStorage.setItem(KEYS.ATTENDANCE, JSON.stringify(records));

      // ** TRIGGER: Calculate Daily Wage Immediately **
      const wageRecord = wageService.calculateDailyWage(worker, record);
      const allWages = storageService.getDailyWages();
      // Update if exists or add
      const wageIndex = allWages.findIndex(w => w.attendanceId === record.id);
      if (wageIndex >= 0) {
          allWages[wageIndex] = wageRecord;
      } else {
          allWages.push(wageRecord);
      }
      localStorage.setItem(KEYS.WAGES, JSON.stringify(allWages));

      return { status: 'OUT', record };

    } else {
      // --- HANDLE IN PUNCH ---
      const shiftStartMinutes = parseInt(shift.startTime.split(':')[0]) * 60 + parseInt(shift.startTime.split(':')[1]);
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const diff = currentMinutes - shiftStartMinutes;
      const isLate = diff > 15;
      const lateByMinutes = isLate ? diff : 0;

      record = {
        id: Date.now().toString(),
        attendanceId: `att_${Date.now()}`,
        workerId: worker.id,
        workerName: worker.name,
        companyId: 'comp_1',
        date: today,
        shift: {
          shiftId: shift.id,
          expectedInTime: shift.startTime,
          expectedOutTime: shift.endTime
        },
        inTime: {
          timestamp: now.toISOString(),
          geoLocation: { lat: 0, lng: 0 },
          facePhotoUrl: photoUrl,
          deviceInfo: navigator.userAgent,
          markedBy: 'self'
        },
        calculatedHours: {
            grossHours: 0,
            breakDeduction: 0,
            netWorkingHours: 0,
            regularHours: 0,
            overtimeHours: 0,
            isLate,
            lateByMinutes
        },
        status: 'PRESENT' // Provisional
      };

      records.push(record);
      localStorage.setItem(KEYS.ATTENDANCE, JSON.stringify(records));
      return { status: 'IN', record };
    }
  },

  markManualAttendance: (workerId: string) => {
    // Reusing the logic is complex without refactoring, so for manual, 
    // we will simulate an immediate full day for simplicity in this demo.
    const workers = storageService.getWorkers();
    const worker = workers.find(w => w.id === workerId);
    if (!worker) return;

    const records = storageService.getAttendance();
    const today = new Date().toISOString().split('T')[0];
    
    // Check if already present
    if (records.some(r => r.workerId === workerId && r.date === today)) return;

    // Create a "Completed" record
    const record: AttendanceRecord = {
      id: Date.now().toString(),
      attendanceId: `att_${Date.now()}`,
      workerId: worker.id,
      workerName: worker.name,
      companyId: 'comp_1',
      date: today,
      shift: { shiftId: 'shift_a', expectedInTime: '09:00', expectedOutTime: '18:00' },
      inTime: { timestamp: new Date().toISOString(), geoLocation: {lat:0,lng:0}, deviceInfo: 'Manual', markedBy: 'supervisor' },
      outTime: { timestamp: new Date().toISOString(), geoLocation: {lat:0,lng:0}, deviceInfo: 'Manual', markedBy: 'supervisor' },
      calculatedHours: {
          grossHours: 9, breakDeduction: 1, netWorkingHours: 8, regularHours: 8, overtimeHours: 0, isLate: false, lateByMinutes: 0
      },
      status: 'PRESENT'
    };

    records.push(record);
    localStorage.setItem(KEYS.ATTENDANCE, JSON.stringify(records));

    // Trigger Wage Calc
    const wageRecord = wageService.calculateDailyWage(worker, record);
    const allWages = storageService.getDailyWages();
    allWages.push(wageRecord);
    localStorage.setItem(KEYS.WAGES, JSON.stringify(allWages));
  },

  getUser: () => {
    const data = localStorage.getItem(KEYS.USER);
    return data ? JSON.parse(data) : null;
  },
  
  setUser: (user: any) => {
    localStorage.setItem(KEYS.USER, JSON.stringify(user));
  },
  
  logout: () => {
    localStorage.removeItem(KEYS.USER);
  }
};
