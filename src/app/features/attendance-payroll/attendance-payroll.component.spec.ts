import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Component, NgZone } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness, RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';

import { AuthGuard } from '../../core/guards/auth.guard';
import { AccessControlService } from '../../core/services/access-control.service';
import { AuthService } from '../../core/services/auth.service';
import { TokenService } from '../../core/services/token.service';
import { BranchService } from '../branches/services/branch.service';
import { AttendancePayrollComponent } from './attendance-payroll.component';
import { AttendancePayrollService, BranchOption, Entry, ImportResult, MonthView, Setup } from './attendance-payroll.service';
import { HR_PERMISSIONS } from './hr-navigation';
import { HR_ROUTES } from './hr.routes';

@Component({ standalone: true, template: '' })
class HomePage {}

describe('AttendancePayrollComponent', () => {
  let fixture: ComponentFixture<AttendancePayrollComponent>;
  let api: jasmine.SpyObj<AttendancePayrollService>;
  let auth: jasmine.SpyObj<AuthService>;
  let access: jasmine.SpyObj<AccessControlService>;
  let directory: jasmine.SpyObj<BranchService>;

  const branches: BranchOption[] = [
    { id: 'a', code: 'A', name: 'Chi nhánh A', timezone: 'Asia/Ho_Chi_Minh',
      permissions: ['ATTENDANCE_MANAGE', 'PAYROLL_VIEW'] },
    { id: 'b', code: 'B', name: 'Chi nhánh B', timezone: 'Asia/Ho_Chi_Minh', permissions: ['ATTENDANCE_MANAGE'] }
  ];
  const setup: Setup = {
    employees: [{ id: 'an', accountId: 'account', name: 'An', externalCode: '001' }],
    shifts: [{ id: 'am', code: 'SANG', name: 'Ca sáng', externalCode: 'SANG', startTime: '08:00', endTime: '12:00' }],
    rates: [], accounts: [],
    symbols: [
      { code: 'NC', name: 'Làm nửa buổi', sessionUnits: .5, paidPercent: 100, worked: true, active: true },
      { code: 'LC', name: 'Làm đủ buổi', sessionUnits: 1, paidPercent: 100, worked: true, active: true },
      { code: 'CU', name: 'Ký hiệu cũ', sessionUnits: 1, paidPercent: 100, worked: true, active: false }
    ]
  };
  const month: MonthView = {
    period: { id: 'period', status: 'OPEN', closedAt: null, closedBy: null },
    entries: [],
    summary: [{ employeeId: 'an', employeeName: 'An', externalCode: '001', workedShifts: 2, absentShifts: 1, workMinutes: 525 }],
    payroll: null
  };
  const morning: Entry = {
    id: 'morning', employeeId: 'an', employeeName: 'An', externalCode: '001', shiftId: 'am', shiftName: 'Ca sáng',
    workDate: '2026-11-05', inTime: '08:00:00', outTime: '12:00:00', breakMinutes: 0, workMinutes: 240,
    status: 'WORKED', source: 'MANUAL', reason: null, updatedBy: null
  };

  beforeEach(async () => {
    api = jasmine.createSpyObj('AttendancePayrollService', ['branches', 'setup', 'month', 'importFile', 'saveEntry']);
    auth = jasmine.createSpyObj('AuthService', ['getCurrentUser', 'ensureAuthorizationLoaded']);
    auth.ensureAuthorizationLoaded.and.returnValue(of({
      id: 'admin', username: 'admin', email: 'admin@example.test', scope: { type: 'SYSTEM', branchIds: [] }
    }));
    access = jasmine.createSpyObj('AccessControlService', ['canAll', 'canAny']);
    access.canAny.and.returnValue(true);
    directory = jasmine.createSpyObj('BranchService', ['getBranches']);
    api.branches.and.returnValue(of(branches));
    api.setup.and.returnValue(of(setup));
    api.month.and.returnValue(of(month));
    await TestBed.configureTestingModule({
      imports: [AttendancePayrollComponent, HttpClientTestingModule, RouterTestingModule.withRoutes([
        { path: '', pathMatch: 'full', component: HomePage },
        {
          path: 'admin', canActivateChild: [AuthGuard], children: [
            { path: 'attendance-payroll', pathMatch: 'full', redirectTo: 'hr' },
            { path: 'hr', data: { permissions: HR_PERMISSIONS }, children: HR_ROUTES }
          ]
        }
      ])],
      providers: [
        { provide: AttendancePayrollService, useValue: api },
        { provide: AuthService, useValue: auth },
        { provide: AccessControlService, useValue: access },
        { provide: BranchService, useValue: directory },
        { provide: TokenService, useValue: { isLoggedIn: () => true } },
        AuthGuard
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(AttendancePayrollComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function button(label: string): HTMLButtonElement | undefined {
    const root: HTMLElement = fixture.nativeElement;
    return Array.from(root.querySelectorAll('button')).find(item => {
      const content = item.cloneNode(true) as HTMLButtonElement;
      content.querySelectorAll('[aria-hidden="true"]').forEach(icon => icon.remove());
      return content.textContent?.trim() === label;
    });
  }

  function openChoices(control: Element): HTMLElement[] {
    control.querySelector<HTMLInputElement>('[role=combobox]')!.click();
    fixture.detectChanges();
    return Array.from(control.querySelectorAll<HTMLElement>('[role=option]'));
  }

  it('offers the branch form to an administrator when Pine Drink has no branches', async () => {
    api.branches.and.returnValue(of([]));
    auth.getCurrentUser.and.returnValue({
      id: 'admin', username: 'admin', email: 'admin@example.test', scope: { type: 'SYSTEM', branchIds: [] }
    });
    access.canAll.and.returnValue(true);
    directory.getBranches.and.returnValue(of({
      content: [], page: 0, size: 1, totalElements: 0, totalPages: 0, first: true, last: true
    }));

    await fixture.componentInstance.initialize();
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).toContain('Pine Drink chưa có chi nhánh');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/admin/branches?create=1');
    expect(directory.getBranches).toHaveBeenCalledOnceWith(0, 1);
  });

  it('keeps the access message when branches exist but none is granted', async () => {
    api.branches.and.returnValue(of([]));
    auth.getCurrentUser.and.returnValue({
      id: 'viewer', username: 'viewer', email: 'viewer@example.test', scope: { type: 'SYSTEM', branchIds: [] }
    });
    directory.getBranches.and.returnValue(of({
      content: [], page: 0, size: 1, totalElements: 1, totalPages: 1, first: true, last: true
    }));

    await fixture.componentInstance.initialize();
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).toContain('Chưa có chi nhánh được cấp quyền');
    expect(root.querySelector('a')).toBeNull();
  });

  it('refreshes the selected branch without leaving the attendance page', async () => {
    const branch = (fixture.nativeElement as HTMLElement).querySelector('.context app-combobox')!;
    openChoices(branch).find(option => option.textContent?.includes('Chi nhánh B'))!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.month).toHaveBeenCalledWith('b', fixture.componentInstance.month);
    expect(fixture.componentInstance.page).toBe('attendance');
    expect(button('Bảng lương')).toBeUndefined();
    expect(fixture.nativeElement.querySelector('.attendance-calendar')).not.toBeNull();
  });

  it('keeps payroll on a separate route and links to attendance for the same branch, month and employee', async () => {
    api.month.and.returnValue(of({
      ...month,
      period: { ...month.period!, status: 'CLOSED' },
      payroll: {
        id: 'payroll', periodId: 'period', status: 'DRAFT', confirmedAt: null, confirmedBy: null, total: 120000,
        lines: [{ id: 'line', employeeId: 'an', employeeName: 'An', employeeCode: '001', workMinutes: 240,
          hourlyRate: 30000, workAmount: 120000, allowance: 0, total: 120000 }]
      }
    }));
    const zone = TestBed.inject(NgZone);
    const harness = await RouterTestingHarness.create();
    const payroll = await zone.run(() =>
      harness.navigateByUrl('/admin/hr/payroll?branchId=b&month=2026-11', AttendancePayrollComponent));
    await fixture.whenStable();
    harness.detectChanges();

    expect(payroll.page).toBe('payroll');
    expect(api.month).toHaveBeenCalledWith('a', '2026-11');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Bảng lương');
    expect(harness.routeNativeElement?.querySelector('.attendance-calendar')).toBeNull();
    const sourceLink = harness.routeNativeElement?.querySelector<HTMLAnchorElement>('a.page-action')!;
    expect(sourceLink.textContent).toBe('Xem công');
    const sourceUrl = sourceLink.getAttribute('href')!;
    expect(sourceUrl).toBe('/admin/hr/attendance?branchId=a&month=2026-11&employeeId=an');

    const attendance = await zone.run(() => harness.navigateByUrl(sourceUrl, AttendancePayrollComponent));
    await fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Bảng chấm công');
    expect(attendance.employeeFilter).toBe('an');
    expect(harness.routeNativeElement?.querySelector('.attendance-calendar')).not.toBeNull();
    expect(harness.routeNativeElement?.textContent).not.toContain('120.000');
    zone.run(() => attendance.clearFilters());
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/admin/hr/attendance?branchId=a&month=2026-11');
  });

  it('redirects the old link to payroll for a payroll-only account and guards the attendance URL', async () => {
    access.canAny.and.callFake(permissions => permissions.includes('PAYROLL_VIEW'));
    api.branches.and.returnValue(of([{ ...branches[0], permissions: ['PAYROLL_VIEW'] }]));
    const zone = TestBed.inject(NgZone);
    const harness = await RouterTestingHarness.create();
    await zone.run(() => harness.navigateByUrl('/admin/attendance-payroll', AttendancePayrollComponent));
    await fixture.whenStable();
    harness.detectChanges();

    const router = TestBed.inject(Router);
    expect(router.url.split('?')[0]).toBe('/admin/hr/payroll');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Bảng lương');
    expect(harness.routeNativeElement?.querySelector('a.page-action')).toBeNull();

    await zone.run(() => harness.navigateByUrl('/admin/hr/attendance'));
    expect(router.url).toBe('/');
  });

  it('groups multiple shifts and opens the day and editor as a modal', async () => {
    const evening: Entry = {
      ...morning, id: 'evening', shiftId: 'pm', shiftName: 'Ca tối',
      inTime: '17:10:00', outTime: '21:55:00', workMinutes: 285
    };
    api.month.and.returnValue(of({ ...month, entries: [morning, evening] }));
    fixture.componentInstance.month = '2026-11';
    await fixture.componentInstance.changeContext();
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('.attendance-calendar thead th.calendar-date').length).toBe(30);
    const nameColumn = root.querySelector('.attendance-calendar tbody th.employee-column')!;
    expect(getComputedStyle(nameColumn).position).toBe('sticky');
    const day = root.querySelector<HTMLButtonElement>('[aria-label^="Xem 2 ca của An ngày 5"]')!;
    expect(day.textContent).toContain('8g 45p');
    day.click();
    fixture.detectChanges();
    const dialog = root.querySelector('dialog')!;
    expect(dialog.open).toBeTrue();
    expect(root.querySelectorAll('.day-details tbody tr').length).toBe(2);
    expect(root.querySelector('.day-details')?.textContent).toContain('Ca tối');
    button('Sửa')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.entryDraft?.id).toBe('morning');
    button('Hủy')!.click();
    fixture.detectChanges();
    expect(dialog.querySelector('.day-details')).not.toBeNull();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    fixture.detectChanges();
    expect(dialog.open).toBeFalse();
  });

  it('prefills the employee and date from the plus button and refreshes the cell after saving', async () => {
    fixture.componentInstance.month = '2026-11';
    await fixture.componentInstance.changeContext();
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    const add = root.querySelector<HTMLButtonElement>('[aria-label="Thêm ca cho An ngày 6"]')!;
    add.focus();
    add.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const dialog = root.querySelector('dialog')!;
    expect(dialog.open).toBeTrue();
    expect(dialog.querySelector('h2')?.textContent?.trim()).toBe('Thêm ca chấm công');
    expect(dialog.querySelector<HTMLInputElement>('[name=entryEmployee] input')?.value).toBe('An · 001');
    expect(dialog.querySelector<HTMLInputElement>('[name=entryDate]')?.value).toBe('2026-11-06');

    button('Hủy')!.click();
    fixture.detectChanges();
    expect(dialog.open).toBeFalse();
    expect(document.activeElement).toBe(add);
    expect(api.saveEntry).not.toHaveBeenCalled();

    add.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const shift = dialog.querySelector('[name=entryShift]')!;
    openChoices(shift).find(option => option.textContent?.includes('Ca sáng'))!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    api.saveEntry.and.returnValue(throwError(() => ({ message: 'Không thể lưu ca.' })));
    button('Lưu ca')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(dialog.open).toBeTrue();
    expect(dialog.querySelector('[role=alert]')?.textContent).toContain('Không thể lưu ca.');

    const entry = { ...morning, workDate: '2026-11-06' };
    api.saveEntry.and.returnValue(of({ success: true, message: '', data: undefined, timestamp: '' }));
    api.month.and.returnValue(of({ ...month, entries: [entry] }));
    button('Lưu ca')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.saveEntry).toHaveBeenCalledWith('period', jasmine.objectContaining({
      employeeId: 'an', workDate: '2026-11-06', shiftId: 'am', inTime: '08:00', outTime: '12:00'
    }));
    expect(dialog.open).toBeFalse();
    expect(root.querySelector('[aria-label^="Xem 1 ca của An ngày 6"]')?.textContent).toContain('4g');
  });

  it('renders the leap day and keeps a closed period read-only', async () => {
    const absent: Entry = {
      ...morning, workDate: '2028-02-29', status: 'ABSENT', inTime: null, outTime: null, workMinutes: 0
    };
    api.month.and.returnValue(of({ ...month, period: { ...month.period!, status: 'CLOSED' }, entries: [absent] }));
    fixture.componentInstance.month = '2028-02';
    await fixture.componentInstance.changeContext();
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('.attendance-calendar thead th.calendar-date').length).toBe(29);
    expect(root.querySelector('.attendance-calendar .add-cell')).toBeNull();
    expect(button('Nhập Excel')).toBeUndefined();
    const day = root.querySelector<HTMLButtonElement>('[aria-label^="Xem 1 ca của An ngày 29"]')!;
    expect(day.textContent).toContain('Vắng');
    day.click();
    fixture.detectChanges();
    expect(root.querySelector('.day-details')?.textContent).toContain('29/02/2028');
    expect(button('Sửa')).toBeUndefined();
    expect(button('Thêm ca trong ngày')).toBeUndefined();
  });

  it('shows import errors by row and keeps confirm disabled', async () => {
    const result: ImportResult = {
      rows: [{ row: 2, employeeCode: '001', shiftCode: 'TOI', workDate: '2026-11-05', inTime: '17:10',
        outTime: null, status: 'ERROR', message: 'Cần nhập đủ giờ vào và giờ ra.' }],
      newCount: 0, duplicateCount: 0, errorCount: 1, saved: false
    };
    api.importFile.and.returnValue(of(result));
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.attendance-calendar')).not.toBeNull();
    expect(root.querySelector('input[type=file]')).toBeNull();
    button('Nhập Excel')!.click();
    fixture.detectChanges();
    const dialog = root.querySelector('dialog')!;
    expect(dialog.open).toBeTrue();
    const input = dialog.querySelector<HTMLInputElement>('input[type=file]')!;
    const transfer = new DataTransfer();
    const file = new File(['test'], 'attendance.xlsx');
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    button('Xem trước')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.importFile).toHaveBeenCalledOnceWith('period', file, false, 'HOUR');
    expect(fixture.nativeElement.textContent).toContain('Cần nhập đủ giờ vào và giờ ra.');
    expect(button('Xác nhận nhập')?.disabled).toBeTrue();
  });

  it('sends browser time input in the backend time format', () => {
    const realApi = new AttendancePayrollService(TestBed.inject(HttpClient));
    const http = TestBed.inject(HttpTestingController);
    realApi.saveEntry('period', {
      id: null, employeeId: 'an', shiftId: 'shift', workDate: '2026-11-05',
      inTime: '08:00', outTime: '12:00', breakMinutes: 0, status: 'WORKED', reason: null
    }).subscribe();
    const entry = http.expectOne(request => request.url.endsWith('/periods/period/entries'));
    expect(entry.request.body.inTime).toBe('08:00:00');
    expect(entry.request.body.outTime).toBe('12:00:00');
    entry.flush({ success: true, data: null });
    http.verify();
  });

  it('uses the download filename provided by the attendance API', () => {
    const realApi = new AttendancePayrollService(TestBed.inject(HttpClient));
    const http = TestBed.inject(HttpTestingController);
    const blob = new Blob(['Excel']);
    const received = jasmine.createSpy('receivedTemplate');
    realApi.importTemplate('SESSION').subscribe(received);
    const request = http.expectOne(item => item.url.endsWith('/import-template'));
    expect(request.request.params.get('mode')).toBe('SESSION');
    request.flush(blob, { headers: { 'Content-Disposition': 'attachment; filename="mau-theo-buoi.xlsx"' } });
    expect(received).toHaveBeenCalledOnceWith({ blob, filename: 'mau-theo-buoi.xlsx' });
    http.verify();
  });

  it('switches between independently filtered calendars and opens a session editor with symbols', async () => {
    const session: Entry = {
      ...morning, id: 'session', workDate: '2026-11-09', mode: 'SESSION', symbolCode: 'NC', symbolName: 'Làm nửa buổi',
      workMinutes: 120, paidMinutes: 120, sessionUnits: .5
    };
    api.month.and.returnValue(of({ ...month, entries: [morning, session] }));
    fixture.componentInstance.month = '2026-11';
    await fixture.componentInstance.changeContext();
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    const calendar = root.querySelector('.attendance-calendar')!;
    expect(calendar.textContent).toContain('4g');
    expect(calendar.querySelector('.session-code')).toBeNull();
    button('Theo buổi')!.click();
    fixture.detectChanges();
    expect(calendar.textContent).toContain('Buổi đã ghi');
    expect(calendar.querySelector('.session-code')?.textContent).toBe('NC');
    expect(calendar.textContent).not.toContain('4g');

    root.querySelector<HTMLButtonElement>('[aria-label="Thêm ca cho An ngày 10"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const dialog = root.querySelector('dialog')!;
    expect(dialog.open).toBeTrue();
    const table = dialog.querySelector('.symbol-table')!;
    expect(table.textContent).toContain('Làm nửa buổi');
    expect(table.textContent).toContain('Làm đủ buổi');
    expect(table.textContent).not.toContain('Ký hiệu cũ');
    expect(dialog.querySelector('[name=entryIn]')).toBeNull();
    expect(fixture.componentInstance.entryDraft).toEqual(jasmine.objectContaining({
      mode: 'SESSION', employeeId: 'an', workDate: '2026-11-10'
    }));

    const search = dialog.querySelector<HTMLInputElement>('input[type=search]')!;
    search.value = 'nc nua buoi';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    const choices = table.querySelectorAll<HTMLInputElement>('[name=entrySymbol]');
    expect(choices.length).toBe(1);
    expect(choices[0].value).toBe('NC');
    choices[0].click();
    fixture.detectChanges();
    expect(dialog.querySelector('.symbol-summary')?.textContent).toContain('Hưởng 100%');
    expect(button('Lưu ca')?.disabled).toBeTrue();

    openChoices(dialog.querySelector('[name=entryShift]')!).find(option => option.textContent?.includes('Ca sáng'))!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const overtime = dialog.querySelector<HTMLInputElement>('[name=entryOvertime]')!;
    overtime.value = '720';
    overtime.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(button('Lưu ca')?.disabled).toBeTrue();
    overtime.value = '30';
    overtime.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    api.saveEntry.and.returnValue(of({ success: true, message: '', data: undefined, timestamp: '' }));
    button('Lưu ca')!.click();
    await fixture.whenStable();
    expect(api.saveEntry).toHaveBeenCalledWith('period', jasmine.objectContaining({
      mode: 'SESSION', shiftId: 'am', symbolCode: 'NC', sessionOvertimeMinutes: 30
    }));
  });

  it('guides the user to settings when the branch has no active attendance symbols', async () => {
    api.setup.and.returnValue(of({ ...setup, symbols: [] }));
    await fixture.componentInstance.changeContext();
    fixture.detectChanges();
    fixture.componentInstance.setAttendanceMode('SESSION');
    fixture.componentInstance.newEntry('an', fixture.componentInstance.month + '-10');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
    expect(dialog.textContent).toContain('Chi nhánh chưa có ký hiệu đang sử dụng.');
    expect(button('Mở thiết lập')).toBeDefined();
    expect(button('Lưu ca')?.disabled).toBeTrue();
  });

  it('shows four settings directories and opens the shift editor only when requested', async () => {
    const zone = TestBed.inject(NgZone);
    const harness = await RouterTestingHarness.create();
    await zone.run(() => harness.navigateByUrl('/admin/hr/settings?branchId=a&month=2026-11', AttendancePayrollComponent));
    await fixture.whenStable();
    harness.detectChanges();

    const root = harness.routeNativeElement!;
    expect(root.querySelectorAll('.settings-nav-item').length).toBe(4);
    expect(root.querySelector('.settings-table')?.textContent).toContain('001');
    expect(root.querySelector('.settings-form')).toBeNull();
    root.querySelectorAll<HTMLButtonElement>('.settings-nav-item')[1].click();
    harness.detectChanges();
    expect(root.querySelector('.settings-table')?.textContent).toContain('Ca sáng');
    root.querySelector<HTMLButtonElement>('[aria-label="Sửa ca Ca sáng"]')!.click();
    harness.detectChanges();
    await fixture.whenStable();
    harness.detectChanges();
    expect(root.querySelector('dialog')?.open).toBeTrue();
    expect(root.querySelector('dialog h2')?.textContent).toBe('Sửa ca làm');
    expect(root.querySelector<HTMLInputElement>('[name=shiftName]')?.value).toBe('Ca sáng');
    expect(root.querySelector('[name=shiftOvertimePay]')).not.toBeNull();
    expect(root.querySelector('[name=shiftOvertimeThreshold]')).toBeNull();
  });

  it('paginates settings rows and returns to the first page when the size or tab changes', async () => {
    const employees = Array.from({ length: 11 }, (_, index) => ({
      id: 'employee-' + index, accountId: 'account-' + index, name: 'Nhân viên ' + index, externalCode: 'NV-' + index
    }));
    api.setup.and.returnValue(of({ ...setup, employees }));
    const zone = TestBed.inject(NgZone);
    const harness = await RouterTestingHarness.create();
    await zone.run(() => harness.navigateByUrl('/admin/hr/settings?branchId=a&month=2026-11', AttendancePayrollComponent));
    await fixture.whenStable();
    harness.detectChanges();

    const root = harness.routeNativeElement!;
    const pagination = root.querySelector('app-admin-pagination')!;
    expect(root.querySelectorAll('.settings-table tbody tr').length).toBe(10);
    expect(pagination.textContent).toContain('Trang 1 / 2 · 11 bản ghi');

    pagination.querySelector<HTMLButtonElement>('[aria-label="Trang sau"]')!.click();
    harness.detectChanges();
    expect(root.querySelectorAll('.settings-table tbody tr').length).toBe(1);
    expect(root.querySelector('.settings-table tbody')?.textContent).toContain('NV-10');

    pagination.querySelector<HTMLInputElement>('[aria-label="Số dòng mỗi trang"]')!.click();
    harness.detectChanges();
    Array.from(pagination.querySelectorAll<HTMLElement>('[role=option]'))
      .find(option => option.textContent?.trim() === '5')!.click();
    harness.detectChanges();
    expect(root.querySelectorAll('.settings-table tbody tr').length).toBe(5);
    expect(pagination.textContent).toContain('Trang 1 / 3');

    pagination.querySelector<HTMLButtonElement>('[aria-label="Trang sau"]')!.click();
    harness.detectChanges();
    root.querySelectorAll<HTMLButtonElement>('.settings-nav-item')[1].click();
    harness.detectChanges();
    expect(root.querySelector('.settings-table tbody')?.textContent).toContain('Ca sáng');
    root.querySelectorAll<HTMLButtonElement>('.settings-nav-item')[0].click();
    harness.detectChanges();
    expect(root.querySelector('.settings-table tbody')?.textContent).toContain('NV-0');
  });

  it('paginates employees on the calendar, summary and payroll while keeping whole-period totals', async () => {
    const employees = Array.from({ length: 11 }, (_, index) => ({
      id: 'employee-' + index, accountId: 'account-' + index, name: 'Nhân viên ' + index, externalCode: 'NV-' + index
    }));
    api.setup.and.returnValue(of({ ...setup, employees }));
    api.month.and.returnValue(of({
      ...month,
      summary: employees.map(employee => ({
        employeeId: employee.id, employeeName: employee.name, externalCode: employee.externalCode,
        workedShifts: 1, absentShifts: 0, workMinutes: 60
      })),
      payroll: {
        id: 'payroll', periodId: 'period', status: 'DRAFT', confirmedAt: null, confirmedBy: null, total: 330000,
        lines: employees.map(employee => ({
          id: 'line-' + employee.id, employeeId: employee.id, employeeName: employee.name, employeeCode: employee.externalCode,
          workMinutes: 60, hourlyRate: 30000, workAmount: 30000, allowance: 0, total: 30000
        }))
      }
    }));
    const zone = TestBed.inject(NgZone);
    const harness = await RouterTestingHarness.create();
    for (const page of ['attendance', 'summary', 'payroll']) {
      await zone.run(() => harness.navigateByUrl('/admin/hr/' + page + '?branchId=a&month=2026-11', AttendancePayrollComponent));
      await fixture.whenStable();
      harness.detectChanges();

      const root = harness.routeNativeElement!;
      const payrollTotal = root.querySelector('.payroll-total')?.textContent;
      const callsBeforePaging = api.month.calls.count();
      expect(root.querySelectorAll('table tbody tr').length).toBe(10);
      expect(root.querySelector('app-admin-pagination')?.textContent).toContain('Trang 1 / 2 · 11 nhân viên');
      root.querySelector<HTMLButtonElement>('[aria-label="Trang sau"]')!.click();
      harness.detectChanges();
      expect(root.querySelectorAll('table tbody tr').length).toBe(1);
      expect(root.querySelector('table tbody')?.textContent).toContain('NV-10');
      expect(api.month.calls.count()).toBe(callsBeforePaging);
      if (page === 'payroll') {
        expect(payrollTotal).toBeTruthy();
        expect(root.querySelector('.payroll-total')?.textContent).toBe(payrollTotal);
      }
      if (page === 'attendance') {
        const dayColumns = root.querySelectorAll('.attendance-calendar thead .calendar-date');
        expect(dayColumns.length).toBe(30);
        root.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')!.click();
        harness.detectChanges();
        expect(root.querySelectorAll('table tbody tr').length).toBe(10);
      }
    }
  });
});
