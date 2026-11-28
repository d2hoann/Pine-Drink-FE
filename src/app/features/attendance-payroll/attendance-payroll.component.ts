import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AccessControlService } from '../../core/services/access-control.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { ApiError } from '../../shared/models/api-error.model';
import { SharedModule } from '../../shared/shared.module';
import { normalizeSearchText } from '../../shared/utils/normalize-search-text';
import { BranchService } from '../branches/services/branch.service';
import {
  AttendanceMode, AttendancePayrollService, AttendanceSymbol, BranchOption, Employee, Entry, EntryInput, ImportResult,
  MonthView, PayrollLine, Setup, Shift, ShiftInput
} from './attendance-payroll.service';
import { HR_PAGES, HR_ROOT, HrPage } from './hr-navigation';

type AttendancePanel = 'entry' | 'day' | 'import';
type SettingsTab = 'employees' | 'shifts' | 'symbols' | 'rates';

const SETTINGS_SECTIONS = [
  { id: 'employees', title: 'Nhân viên', icon: 'badge', action: 'Thêm mã chấm công',
    description: 'Ghép tài khoản Pine Drink với mã nhân viên trên bảng chấm công.' },
  { id: 'shifts', title: 'Ca làm', icon: 'schedule', action: 'Thêm ca làm',
    description: 'Quản lý giờ chuẩn, thời gian nghỉ và tỷ lệ tính lương làm thêm của từng ca.' },
  { id: 'symbols', title: 'Ký hiệu chấm công', icon: 'fact_check', action: 'Thêm ký hiệu',
    description: 'Quy định số buổi và tỷ lệ hưởng lương khi ghi công theo buổi.' },
  { id: 'rates', title: 'Đơn giá theo giờ', icon: 'payments', action: 'Thêm đơn giá',
    description: 'Đặt đơn giá của từng nhân viên theo tháng hiệu lực.' }
] as const;

interface AttendanceDay {
  date: string;
  number: number;
  weekday: string;
  weekend: boolean;
}

interface AttendanceCell {
  entries: Entry[];
  minutes: number;
  absences: number;
  sessionUnits: number;
}

interface AttendanceRow {
  employee: Employee;
  cells: Map<string, AttendanceCell>;
  minutes: number;
  sessionUnits: number;
}

@Component({
  selector: 'app-attendance-payroll',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './attendance-payroll.component.html',
  styleUrls: ['./attendance-payroll.component.scss']
})
export class AttendancePayrollComponent implements OnInit, OnDestroy {
  @ViewChild('attendanceDialog') private attendanceDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('dialogHeading') private dialogHeading?: ElementRef<HTMLElement>;
  @ViewChild('settingsDialog') private settingsDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('settingsDialogHeading') private settingsDialogHeading?: ElementRef<HTMLElement>;

  readonly page: HrPage;
  private readonly money = new Intl.NumberFormat('vi-VN');

  branches: BranchOption[] = [];
  branchId = '';
  month = this.currentMonth();
  attendanceMode: AttendanceMode = 'HOUR';
  busy = false;
  error = '';
  noBranches = false;
  view?: MonthView;
  setup?: Setup;
  employeeFilter = '';
  dateFilter = '';
  activePanel: AttendancePanel | null = null;
  settingsTab: SettingsTab = 'employees';
  tablePage = 0;
  tablePageSize = 10;
  readonly tablePageSizes = [5, 10, 20, 50];
  activeSettingsEditor: SettingsTab | null = null;
  settingsEditorTitle = '';
  editingSettings = false;
  selectedDay: { employeeId: string; date: string } | null = null;
  entryDraft: EntryInput | null = null;
  symbolQuery = '';
  file: File | null = null;
  preview: ImportResult | null = null;
  employeeDraft = { accountId: '', externalCode: '' };
  shiftDraft = this.blankShift();
  shiftOvertime = false;
  symbolDraft = this.blankSymbol();
  editingSymbol = false;
  rateDraft = { employeeId: '', month: this.month, hourlyRate: null as number | null };
  allowanceDraft: { lineId: string; amount: number | null } | null = null;
  private days: AttendanceDay[] = [];
  private attendanceRows: AttendanceRow[] = [];
  private destroyed = false;

  constructor(
    private readonly api: AttendancePayrollService,
    private readonly toast: ToastService,
    private readonly confirm: ConfirmDialogService,
    private readonly auth: AuthService,
    private readonly accessControl: AccessControlService,
    private readonly branchService: BranchService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {
    this.page = (this.route.snapshot.data['page'] as HrPage | undefined) ?? 'attendance';
  }

  ngOnInit(): void {
    void this.initialize();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.closePanel();
    this.closeSettingsEditor();
  }

  get branch(): BranchOption | undefined {
    return this.branches.find(branch => branch.id === this.branchId);
  }

  get title(): string { return HR_PAGES[this.page].label; }
  get contextParams() { return { branchId: this.branchId, month: this.month }; }

  get canEditAttendance(): boolean { return this.has('ATTENDANCE_MANAGE'); }
  get canViewAttendance(): boolean { return this.has('ATTENDANCE_VIEW') || this.canEditAttendance; }
  get canEditPayroll(): boolean { return this.has('PAYROLL_MANAGE'); }
  get canViewPayroll(): boolean { return this.has('PAYROLL_VIEW') || this.canEditPayroll; }

  get settingsSections() {
    return SETTINGS_SECTIONS.filter(section => section.id === 'rates' ? this.canViewPayroll : this.canViewAttendance);
  }

  get selectedSettingsSection(): (typeof SETTINGS_SECTIONS)[number] | undefined {
    const sections = this.settingsSections;
    return sections.find(section => section.id === this.settingsTab) ?? sections[0];
  }

  get tableTotalItems(): number {
    if (this.page === 'attendance') return this.visibleDays.length ? this.visibleAttendanceRows.length : 0;
    if (this.page === 'summary') return this.view?.summary.length ?? 0;
    if (this.page === 'payroll') return this.view?.payroll?.lines.length ?? 0;
    const section = this.selectedSettingsSection;
    return section ? this.setup?.[section.id]?.length ?? 0 : 0;
  }

  get tableTotalPages(): number {
    return Math.ceil(this.tableTotalItems / this.tablePageSize);
  }

  get tablePageStart(): number {
    return this.tablePage * this.tablePageSize;
  }

  get tablePageEnd(): number {
    return this.tablePageStart + this.tablePageSize;
  }

  selectSettingsTab(tab: SettingsTab): void {
    if (tab === this.selectedSettingsSection?.id) return;
    this.settingsTab = tab;
    this.tablePage = 0;
  }

  changeTablePageSize(size: number): void {
    this.tablePageSize = size;
    this.tablePage = 0;
  }

  get canCreateBranch(): boolean {
    return this.auth.getCurrentUser()?.scope?.type === 'SYSTEM'
      && this.accessControl.canAll(['BRANCH_VIEW', 'BRANCH_CREATE']);
  }

  pagePath(page: HrPage): string {
    return HR_ROOT + '/' + HR_PAGES[page].path;
  }

  get visibleDays(): AttendanceDay[] {
    return this.dateFilter ? this.days.filter(day => day.date === this.dateFilter) : this.days;
  }

  // Khi sửa ca cũ, vẫn cho chọn lại ký hiệu đã lưu dù ký hiệu đã ngừng áp dụng.
  get selectableSymbols(): AttendanceSymbol[] {
    const originalCode = this.selectedDayEntries.find(entry => entry.id === this.entryDraft?.id)?.symbolCode;
    return (this.setup?.symbols ?? []).filter(symbol => symbol.active
      || symbol.code === originalCode);
  }

  get selectedSymbol(): AttendanceSymbol | undefined {
    return this.selectableSymbols.find(symbol => symbol.code === this.entryDraft?.symbolCode);
  }

  get selectedEntryShift(): Shift | undefined {
    return this.setup?.shifts.find(shift => shift.id === this.entryDraft?.shiftId);
  }

  get maxSessionOvertimeMinutes(): number {
    const endTime = this.selectedEntryShift?.endTime;
    if (!endTime) return 0;
    const [hours, minutes] = endTime.split(':').map(Number);
    return 1439 - (hours * 60 + minutes);
  }

  get invalidSessionOvertime(): boolean {
    const draft = this.entryDraft;
    if (draft?.mode !== 'SESSION' || !this.selectedSymbol?.worked) return false;
    const minutes = draft.sessionOvertimeMinutes ?? 0;
    return !Number.isInteger(minutes) || minutes < 0 || minutes > this.maxSessionOvertimeMinutes;
  }

  get matchingSymbols(): AttendanceSymbol[] {
    const query = normalizeSearchText(this.symbolQuery.trim());
    const symbols = this.selectableSymbols;
    if (!query) return symbols;
    const terms = query.split(/\s+/);
    return symbols.filter(symbol => {
      const label = normalizeSearchText(symbol.code + ' ' + symbol.name);
      return terms.every(term => label.includes(term));
    });
  }

  get occupiedShifts(): Set<string> {
    const draft = this.entryDraft;
    return new Set((this.view?.entries ?? [])
      .filter(entry => draft && entry.id !== draft.id && entry.employeeId === draft.employeeId && entry.workDate === draft.workDate)
      .map(entry => entry.shiftId));
  }

  setAttendanceMode(mode: AttendanceMode): void {
    if (mode === this.attendanceMode) return;
    this.closePanel();
    this.attendanceMode = mode;
    this.tablePage = 0;
    this.file = null;
    this.preview = null;
    this.buildAttendanceCalendar();
  }

  get visibleAttendanceRows(): AttendanceRow[] {
    return this.employeeFilter
      ? this.attendanceRows.filter(row => row.employee.id === this.employeeFilter)
      : this.attendanceRows;
  }

  get selectedDayEntries(): Entry[] {
    if (!this.selectedDay) return [];
    const { employeeId, date } = this.selectedDay;
    return this.attendanceRows.find(row => row.employee.id === employeeId)?.cells.get(date)?.entries ?? [];
  }

  setEmployeeFilter(employeeId: string): void {
    this.employeeFilter = employeeId;
    this.tablePage = 0;
    this.updateUrl();
  }

  clearFilters(): void {
    this.dateFilter = '';
    this.setEmployeeFilter('');
  }

  get monthEnd(): string {
    const [year, month] = this.month.split('-').map(Number);
    return this.month + '-' + new Date(year, month, 0).getDate();
  }

  initialize(): Promise<void> {
    return this.run(async () => {
      this.noBranches = false;
      const branches = await firstValueFrom(this.api.branches());
      this.branches = branches.filter(branch =>
        HR_PAGES[this.page].permissions.some(permission => branch.permissions.includes(permission)));
      if (!this.branches.length) {
        this.branchId = '';
        this.view = undefined;
        this.setup = undefined;
        if (!branches.length && this.auth.getCurrentUser()?.scope?.type === 'SYSTEM') {
          const directory = await firstValueFrom(this.branchService.getBranches(0, 1));
          this.noBranches = directory.totalElements === 0;
        }
        return;
      }
      const query = this.route.snapshot.queryParamMap;
      this.settingsTab = SETTINGS_SECTIONS.find(section => section.id === query.get('section'))?.id ?? 'employees';
      this.tablePage = 0;
      const requestedBranch = query.get('branchId');
      const selectedBranch = this.branches.find(branch => branch.id === requestedBranch) ?? this.branches[0];
      const requestedMonth = query.get('month');
      this.branchId = selectedBranch.id;
      this.month = requestedMonth && /^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(requestedMonth)
        ? requestedMonth : this.currentMonth(selectedBranch.timezone);
      this.resetSetupForms();
      await this.loadContext();
      const employeeId = this.page === 'attendance' ? query.get('employeeId') : null;
      this.employeeFilter = employeeId && this.setup?.employees.some(employee => employee.id === employeeId) ? employeeId : '';
      this.updateUrl();
    });
  }

  changeContext(): Promise<void> {
    this.closePanel();
    this.closeSettingsEditor();
    this.tablePage = 0;
    this.view = undefined;
    this.setup = undefined;
    this.preview = null;
    this.file = null;
    this.employeeFilter = '';
    this.dateFilter = '';
    this.allowanceDraft = null;
    this.resetSetupForms();
    this.updateUrl();
    return this.run(() => this.loadContext());
  }

  openSettings(): void {
    const section = this.entryDraft?.mode === 'SESSION' && !this.selectableSymbols.length ? 'symbols' : 'shifts';
    this.closePanel();
    void this.router.navigate([this.pagePath('settings')], { queryParams: { ...this.contextParams, section } });
  }

  private updateUrl(): void {
    const query = this.route.snapshot.queryParamMap;
    if (this.destroyed || !this.route.snapshot.data['page'] || !this.month
      || (query.get('branchId') === this.branchId && query.get('month') === this.month
        && (query.get('employeeId') ?? '') === this.employeeFilter)) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...this.contextParams, employeeId: this.employeeFilter || null },
      replaceUrl: true
    });
  }

  async openPeriod(): Promise<void> {
    if (!this.month) return;
    await this.run(async () => {
      await firstValueFrom(this.api.createPeriod(this.branchId, this.month));
      await this.loadMonth();
      this.toast.success('Đã mở kỳ công.');
    });
  }

  openAttendanceDay(employeeId: string, date: string): void {
    this.selectedDay = { employeeId, date };
    this.openPanel('day');
  }

  openImport(): void {
    this.openPanel('import');
  }

  private openPanel(panel: AttendancePanel): void {
    const dialog = this.attendanceDialog?.nativeElement;
    if (!dialog) return;
    this.error = '';
    if (panel === 'entry') this.symbolQuery = '';
    this.activePanel = panel;
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => {
      if (dialog.open) this.dialogHeading?.nativeElement.focus();
    });
  }

  closePanel(): void {
    if (!this.activePanel) return;
    this.attendanceDialog?.nativeElement.close();
    this.activePanel = null;
    this.entryDraft = null;
    this.selectedDay = null;
    this.error = '';
  }

  cancelPanel(event: Event): void {
    event.preventDefault();
    if (!this.busy) this.closePanel();
  }

  finishEntry(): void {
    this.entryDraft = null;
    if (this.selectedDay) {
      this.openPanel('day');
    } else {
      this.closePanel();
    }
  }

  newEntry(employeeId = this.employeeFilter, workDate = this.dateFilter || this.month + '-01'): void {
    this.entryDraft = {
      id: null, employeeId, shiftId: '', workDate,
      inTime: null, outTime: null, breakMinutes: 0, status: 'WORKED', reason: null,
      mode: this.attendanceMode, symbolCode: null
    };
    this.openPanel('entry');
  }

  editEntry(entry: Entry): void {
    const mode = entry.mode ?? 'HOUR';
    this.entryDraft = {
      id: entry.id, employeeId: entry.employeeId, shiftId: entry.shiftId, workDate: entry.workDate,
      inTime: mode === 'HOUR' ? entry.inTime?.slice(0, 5) ?? null : null,
      outTime: mode === 'HOUR' ? entry.outTime?.slice(0, 5) ?? null : null,
      breakMinutes: mode === 'HOUR' ? entry.breakMinutes : 0, status: entry.status, reason: null,
      mode, symbolCode: entry.symbolCode ?? null,
      sessionOvertimeMinutes: mode === 'SESSION' ? entry.overtimeMinutes ?? 0 : undefined
    };
    this.openPanel('entry');
  }

  suggestHours(): void {
    const draft = this.entryDraft;
    if (!draft || draft.id || draft.mode === 'SESSION' || draft.status === 'ABSENT') return;
    const shift = this.selectedEntryShift;
    if (shift) {
      draft.inTime = shift.startTime.slice(0, 5);
      draft.outTime = shift.endTime.slice(0, 5);
      draft.breakMinutes = shift.standardBreakMinutes ?? 0;
    }
  }

  changeEntryStatus(): void {
    const draft = this.entryDraft;
    if (draft?.status === 'ABSENT') {
      draft.inTime = null;
      draft.outTime = null;
      draft.breakMinutes = 0;
    } else {
      this.suggestHours();
    }
  }

  saveEntry(): Promise<void> {
    const draft = this.entryDraft;
    const period = this.view?.period;
    if (!draft || !period || (draft.mode === 'SESSION' && (!this.selectedSymbol || this.invalidSessionOvertime))) {
      return Promise.resolve();
    }
    // Khi đổi sang ký hiệu nghỉ hoặc vắng, xóa số phút làm thêm đã nhập.
    const input = draft.mode === 'SESSION' ? {
      ...draft, sessionOvertimeMinutes: this.selectedSymbol?.worked ? draft.sessionOvertimeMinutes ?? 0 : 0
    } : draft;
    return this.run(async () => {
      await firstValueFrom(this.api.saveEntry(period.id, input));
      this.finishEntry();
      await this.loadMonth();
      this.toast.success('Đã lưu ca làm.');
    });
  }

  selectFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.error = '';
    this.file = input.files?.item(0) ?? null;
    this.preview = null;
    input.value = '';
    if (this.file && (!this.file.name.toLowerCase().endsWith('.xlsx') || this.file.size > 3 * 1024 * 1024)) {
      this.error = 'Chọn tệp Excel .xlsx có dung lượng tối đa 3 MB.';
      this.file = null;
    }
  }

  importFile(confirm: boolean): Promise<void> {
    const file = this.file;
    const period = this.view?.period;
    if (!file || !period || (confirm && (!this.preview || this.preview.errorCount > 0))) return Promise.resolve();
    return this.run(async () => {
      this.preview = await firstValueFrom(this.api.importFile(period.id, file, confirm, this.attendanceMode));
      if (this.preview.saved) {
        this.toast.success('Đã nhập ' + this.preview.newCount + ' ca. Bỏ qua ' + this.preview.duplicateCount + ' ca trùng.');
        this.file = null;
        await this.loadMonth();
      }
    });
  }

  downloadTemplate(): Promise<void> {
    return this.run(async () => {
      const { blob, filename } = await firstValueFrom(this.api.importTemplate(this.attendanceMode));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  async closePeriod(): Promise<void> {
    const period = this.view?.period;
    if (!period || this.busy) return;
    const accepted = await firstValueFrom(this.confirm.confirm({
      title: 'Chốt công tháng ' + this.month,
      message: 'Xác nhận khóa dữ liệu chấm công của ' + this.branch?.name + ' để lập bảng lương.',
      confirmText: 'Chốt công'
    }));
    if (!accepted) return;
    await this.run(async () => {
      await firstValueFrom(this.api.closePeriod(period.id));
      this.entryDraft = null;
      this.preview = null;
      this.file = null;
      await this.loadMonth();
      this.toast.success('Đã chốt kỳ công.');
    });
  }

  generate(): Promise<void> {
    const period = this.view?.period;
    if (!period) return Promise.resolve();
    return this.run(async () => {
      await firstValueFrom(this.api.generate(period.id));
      await this.loadMonth();
      this.toast.success('Đã lập bảng lương nháp.');
    });
  }

  editAllowance(line: PayrollLine): void {
    this.allowanceDraft = { lineId: line.id, amount: line.allowance };
  }

  saveAllowance(): Promise<void> {
    const payroll = this.view?.payroll;
    const draft = this.allowanceDraft;
    if (!payroll || !draft || draft.amount === null) return Promise.resolve();
    const amount = draft.amount;
    return this.run(async () => {
      await firstValueFrom(this.api.saveAllowance(payroll.id, draft.lineId, amount));
      this.allowanceDraft = null;
      await this.loadMonth();
      this.toast.success('Đã lưu phụ cấp.');
    });
  }

  async confirmPayroll(): Promise<void> {
    const payroll = this.view?.payroll;
    if (!payroll || this.busy || this.allowanceDraft) return;
    const accepted = await firstValueFrom(this.confirm.confirm({
      title: 'Xác nhận bảng lương',
      message: 'Khóa bảng lương tháng ' + this.month + ' của ' + this.branch?.name + '.',
      confirmText: 'Xác nhận bảng lương'
    }));
    if (!accepted) return;
    await this.run(async () => {
      await firstValueFrom(this.api.confirmPayroll(payroll.id));
      await this.loadMonth();
      this.toast.success('Đã xác nhận bảng lương.');
    });
  }

  selectEmployee(accountId: string): void {
    const employee = this.setup?.employees.find(item => item.accountId === accountId);
    this.employeeDraft = { accountId, externalCode: employee?.externalCode ?? '' };
  }

  newSettingsRecord(tab: SettingsTab): void {
    this.resetSetupForms();
    const title = SETTINGS_SECTIONS.find(section => section.id === tab)?.action ?? '';
    this.openSettingsEditor(tab, title, false);
  }

  editEmployee(employee: Employee): void {
    this.selectEmployee(employee.accountId);
    this.openSettingsEditor('employees', 'Sửa mã chấm công', true);
  }

  editRate(rate: Setup['rates'][number]): void {
    this.rateDraft = { employeeId: rate.employeeId, month: rate.effectiveMonth.slice(0, 7), hourlyRate: rate.hourlyRate };
    this.openSettingsEditor('rates', 'Sửa đơn giá theo giờ', true);
  }

  private openSettingsEditor(tab: SettingsTab, title: string, editing: boolean): void {
    const dialog = this.settingsDialog?.nativeElement;
    if (!dialog || this.busy || (tab === 'rates' ? !this.canEditPayroll : !this.canEditAttendance)) return;
    this.error = '';
    this.activeSettingsEditor = tab;
    this.settingsEditorTitle = title;
    this.editingSettings = editing;
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => {
      if (dialog.open) this.settingsDialogHeading?.nativeElement.focus();
    });
  }

  closeSettingsEditor(event?: Event): void {
    event?.preventDefault();
    if (!this.activeSettingsEditor || (event && this.busy)) return;
    this.settingsDialog?.nativeElement.close();
    this.activeSettingsEditor = null;
    this.error = '';
  }

  saveEmployee(): Promise<void> {
    return this.run(async () => {
      await firstValueFrom(this.api.saveEmployee(this.branchId, this.employeeDraft));
      this.employeeDraft = { accountId: '', externalCode: '' };
      await this.refreshSetup();
      this.closeSettingsEditor();
      this.toast.success('Đã lưu mã chấm công.');
    });
  }

  editShift(shift: Shift): void {
    this.shiftDraft = {
      ...shift, startTime: shift.startTime.slice(0, 5), endTime: shift.endTime.slice(0, 5),
      overtimePercent: shift.overtimePercent ?? 150
    };
    this.shiftOvertime = shift.overtimeThresholdMinutes != null;
    this.openSettingsEditor('shifts', 'Sửa ca làm', true);
  }

  resetShift(): void {
    this.shiftDraft = this.blankShift();
    this.shiftOvertime = false;
  }

  saveShift(): Promise<void> {
    return this.run(async () => {
      await firstValueFrom(this.api.saveShift(this.branchId, {
        ...this.shiftDraft, overtimeThresholdMinutes: this.shiftOvertime ? this.shiftDraft.overtimeThresholdMinutes : null
      }));
      this.resetShift();
      await this.refreshSetup();
      this.closeSettingsEditor();
      this.toast.success('Đã lưu ca mẫu.');
    });
  }

  editSymbol(symbol: AttendanceSymbol): void {
    this.symbolDraft = { ...symbol };
    this.editingSymbol = true;
    this.openSettingsEditor('symbols', 'Sửa ký hiệu chấm công', true);
  }

  resetSymbol(): void {
    this.symbolDraft = this.blankSymbol();
    this.editingSymbol = false;
  }

  saveSymbol(): Promise<void> {
    return this.run(async () => {
      await firstValueFrom(this.api.saveSymbol(this.branchId, this.symbolDraft));
      this.resetSymbol();
      await this.refreshSetup();
      this.closeSettingsEditor();
      this.toast.success('Đã lưu ký hiệu chấm công.');
    });
  }

  saveRate(): Promise<void> {
    return this.run(async () => {
      await firstValueFrom(this.api.saveRate(this.branchId, this.rateDraft));
      await this.refreshSetup();
      this.closeSettingsEditor();
      this.toast.success('Đã lưu đơn giá.');
    });
  }

  employeeName(id: string): string {
    const employee: Employee | undefined = this.setup?.employees.find(item => item.id === id);
    return employee?.name ?? '';
  }

  duration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    return hours + ' giờ ' + (minutes % 60) + ' phút';
  }

  shortDuration(minutes: number): string {
    const remainder = minutes % 60;
    return minutes < 60 ? minutes + 'p' : Math.floor(minutes / 60) + 'g' + (remainder ? ' ' + remainder + 'p' : '');
  }

  vnd(amount: number): string {
    return this.money.format(amount) + ' ₫';
  }

  private has(permission: string): boolean {
    return this.branch?.permissions.includes(permission) ?? false;
  }

  private async loadContext(): Promise<void> {
    if (!this.branchId || !this.month) return;
    const [setup, view] = await Promise.all([
      firstValueFrom(this.api.setup(this.branchId)), firstValueFrom(this.api.month(this.branchId, this.month))
    ]);
    this.setup = setup;
    this.view = view;
    this.buildAttendanceCalendar();
  }

  private async loadMonth(): Promise<void> {
    this.view = await firstValueFrom(this.api.month(this.branchId, this.month));
    this.buildAttendanceCalendar();
    // Nếu danh sách ngắn đi sau khi tải lại, lùi về trang cuối còn dữ liệu.
    this.tablePage = Math.min(this.tablePage, Math.max(0, this.tableTotalPages - 1));
  }

  // Tạo hàng từ danh sách nhân viên để người chưa có ca vẫn xuất hiện trên lịch.
  private buildAttendanceCalendar(): void {
    const weekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const [year, month] = this.month.split('-').map(Number);
    const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
    this.days = Array.from({ length: dayCount }, (_, index) => {
      const number = index + 1;
      const weekday = new Date(Date.UTC(year, month - 1, number)).getUTCDay();
      return {
        date: this.month + '-' + String(number).padStart(2, '0'),
        number,
        weekday: weekdays[weekday],
        weekend: weekday === 0 || weekday === 6
      };
    });

    const rows = new Map<string, AttendanceRow>();
    for (const employee of this.setup?.employees ?? []) {
      rows.set(employee.id, { employee, minutes: 0, sessionUnits: 0, cells: new Map() });
    }
    for (const entry of this.view?.entries ?? []) {
      if ((entry.mode ?? 'HOUR') !== this.attendanceMode) continue;
      const row = rows.get(entry.employeeId);
      if (!row) continue;
      const cell = row.cells.get(entry.workDate) ?? { entries: [], minutes: 0, absences: 0, sessionUnits: 0 };
      cell.entries.push(entry);
      cell.minutes += entry.workMinutes;
      cell.sessionUnits += entry.sessionUnits ?? 0;
      if (entry.status === 'ABSENT') cell.absences++;
      row.cells.set(entry.workDate, cell);
      row.minutes += entry.workMinutes;
      row.sessionUnits += entry.sessionUnits ?? 0;
    }
    this.attendanceRows = [...rows.values()];
  }

  private async refreshSetup(): Promise<void> {
    this.setup = await firstValueFrom(this.api.setup(this.branchId));
    this.preview = null;
    await this.loadMonth();
  }

  private blankShift(): ShiftInput {
    return {
      id: null, code: '', name: '', externalCode: '', startTime: '', endTime: '',
      standardBreakMinutes: 0, graceMinutes: 0, overtimeThresholdMinutes: 0, overtimePercent: 150
    };
  }

  private blankSymbol(): AttendanceSymbol {
    return { code: '', name: '', sessionUnits: 1, paidPercent: 100, worked: true, active: true };
  }

  private resetSetupForms(): void {
    this.employeeDraft = { accountId: '', externalCode: '' };
    this.resetShift();
    this.resetSymbol();
    this.rateDraft = { employeeId: '', month: this.month, hourlyRate: null };
  }

  private currentMonth(zone = 'Asia/Ho_Chi_Minh'): string {
    const values = new Intl.DateTimeFormat('en', { timeZone: zone, year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    return values.find(part => part.type === 'year')!.value + '-' + values.find(part => part.type === 'month')!.value;
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      await action();
    } catch (cause) {
      const error = cause as ApiError;
      this.error = error?.fieldErrors?.[0]?.message || error?.message || 'Không thể hoàn tất thao tác. Hãy thử lại.';
    } finally {
      this.busy = false;
    }
  }
}
