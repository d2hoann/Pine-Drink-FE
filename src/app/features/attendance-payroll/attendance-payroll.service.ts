import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { API_ENDPOINTS } from '../../core/constants/api-endpoints';
import { BaseResponse } from '../../shared/models/base-response.model';

export type EntryStatus = 'WORKED' | 'ABSENT';
export type AttendanceMode = 'HOUR' | 'SESSION';

export interface AttendanceSymbol {
  code: string;
  name: string;
  sessionUnits: number;
  paidPercent: number;
  worked: boolean;
  active: boolean;
}

export interface BranchOption {
  id: string;
  code: string;
  name: string;
  timezone: string;
  permissions: string[];
}

export interface Employee {
  id: string;
  accountId: string;
  name: string;
  externalCode: string;
}

export interface ShiftInput {
  id: string | null;
  code: string;
  name: string;
  externalCode: string;
  startTime: string;
  endTime: string;
  standardBreakMinutes?: number;
  graceMinutes?: number;
  overtimeThresholdMinutes?: number | null;
  overtimePercent?: number;
}

export interface Shift extends ShiftInput { id: string; }

export interface Setup {
  employees: Employee[];
  shifts: Shift[];
  accounts: { id: string; name: string }[];
  rates: { employeeId: string; effectiveMonth: string; hourlyRate: number }[];
  symbols?: AttendanceSymbol[];
}

export interface Period {
  id: string;
  status: 'OPEN' | 'CLOSED';
  closedAt: string | null;
  closedBy: string | null;
}

export interface EntryInput {
  id: string | null;
  employeeId: string;
  shiftId: string;
  workDate: string;
  inTime: string | null;
  outTime: string | null;
  breakMinutes: number;
  status: EntryStatus;
  reason: string | null;
  mode?: AttendanceMode;
  symbolCode?: string | null;
  sessionOvertimeMinutes?: number | null;
}

export interface Entry extends EntryInput {
  id: string;
  employeeName: string;
  externalCode: string;
  shiftName: string;
  workMinutes: number;
  source: 'EXCEL' | 'MANUAL';
  updatedBy: string | null;
  symbolName?: string | null;
  sessionUnits?: number;
  paidMinutes?: number;
  lateMinutes?: number;
  earlyMinutes?: number;
  overtimeMinutes?: number;
}

export interface Summary {
  employeeId: string;
  employeeName: string;
  externalCode: string;
  workedShifts: number;
  absentShifts: number;
  workMinutes: number;
  sessionUnits?: number;
  hourlyMinutes?: number;
  paidMinutes?: number;
  lateMinutes?: number;
  earlyMinutes?: number;
  overtimeMinutes?: number;
}

export interface PayrollLine {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  workMinutes: number;
  hourlyRate: number;
  workAmount: number;
  allowance: number;
  total: number;
  paidMinutes?: number;
  overtimeMinutes?: number;
  overtimeAmount?: number;
}

export interface Payroll {
  id: string;
  periodId: string;
  status: 'DRAFT' | 'CONFIRMED';
  confirmedAt: string | null;
  confirmedBy: string | null;
  lines: PayrollLine[];
  total: number;
}

export interface MonthView {
  period: Period | null;
  entries: Entry[];
  summary: Summary[];
  payroll: Payroll | null;
}

export interface ImportResult {
  rows: {
    row: number;
    employeeCode: string | null;
    shiftCode: string | null;
    workDate: string | null;
    inTime: string | null;
    outTime: string | null;
    status: 'NEW' | 'DUPLICATE' | 'ERROR';
    message: string | null;
    symbolCode?: string | null;
  }[];
  newCount: number;
  duplicateCount: number;
  errorCount: number;
  saved: boolean;
}

@Injectable({ providedIn: 'root' })
export class AttendancePayrollService {
  private readonly api = environment.apiBaseUrl + API_ENDPOINTS.attendancePayroll;
  private readonly options = { headers: { 'X-Skip-Error-Toast': 'true' } };

  constructor(private readonly http: HttpClient) {}

  branches() {
    return this.get<BranchOption[]>('/branches');
  }

  setup(branchId: string) {
    return this.get<Setup>('/setup', { branchId });
  }

  month(branchId: string, month: string) {
    return this.get<MonthView>('/month', { branchId, month });
  }

  saveEmployee(branchId: string, input: { accountId: string; externalCode: string }) {
    return this.put('/employees', { branchId, ...input });
  }

  saveShift(branchId: string, input: ShiftInput) {
    return this.put('/shifts', {
      branchId, ...input, startTime: this.withSeconds(input.startTime), endTime: this.withSeconds(input.endTime)
    });
  }

  saveSymbol(branchId: string, symbol: AttendanceSymbol) {
    return this.put('/symbols', { branchId, ...symbol });
  }

  saveRate(branchId: string, input: { employeeId: string; month: string; hourlyRate: number | null }) {
    return this.put('/rates', { branchId, ...input });
  }

  createPeriod(branchId: string, month: string) {
    return this.post<Period>('/periods', { branchId, month });
  }

  saveEntry(periodId: string, entry: EntryInput) {
    return this.put('/periods/' + periodId + '/entries', {
      ...entry, inTime: this.withSeconds(entry.inTime), outTime: this.withSeconds(entry.outTime)
    });
  }

  importTemplate(mode: AttendanceMode) {
    return this.http.get(this.api + '/import-template', {
      ...this.options, params: { mode }, observe: 'response', responseType: 'blob'
    }).pipe(map(response => {
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const filename = /(?:^|;)\s*filename=(?:"([^"]+)"|([^;]+))/i.exec(disposition);
      if (!response.body?.size) throw new Error('Không tải được mẫu chấm công.');
      return { blob: response.body, filename: (filename?.[1] ?? filename?.[2])?.trim() || 'mau-cham-cong.xlsx' };
    }));
  }

  importFile(periodId: string, file: File, confirm: boolean, mode: AttendanceMode) {
    const data = new FormData();
    data.append('file', file);
    return this.post<ImportResult>('/periods/' + periodId + '/imports/' + (confirm ? 'confirm' : 'preview'), data, { mode });
  }

  closePeriod(periodId: string) {
    return this.post('/periods/' + periodId + '/close', {});
  }

  generate(periodId: string) {
    return this.post<Payroll>('/periods/' + periodId + '/payroll', {});
  }

  saveAllowance(payrollId: string, lineId: string, amount: number) {
    return this.put('/payroll/' + payrollId + '/lines/' + lineId, { amount });
  }

  confirmPayroll(payrollId: string) {
    return this.post('/payroll/' + payrollId + '/confirm', {});
  }

  private get<T>(path: string, params?: Record<string, string>) {
    return this.http.get<BaseResponse<T>>(this.api + path, { ...this.options, params }).pipe(map(response => response.data));
  }

  private withSeconds(time: string | null): string | null {
    return time?.length === 5 ? time + ':00' : time || null;
  }

  private put(path: string, body: object) {
    return this.http.put<BaseResponse<void>>(this.api + path, body, this.options);
  }

  private post<T = void>(path: string, body: object, params?: Record<string, string>) {
    return this.http.post<BaseResponse<T>>(this.api + path, body, { ...this.options, params }).pipe(map(response => response.data));
  }
}
