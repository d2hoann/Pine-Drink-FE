export const HR_ROOT = '/admin/hr';

const attendancePermissions = ['ATTENDANCE_VIEW', 'ATTENDANCE_MANAGE'];
const payrollPermissions = ['PAYROLL_VIEW', 'PAYROLL_MANAGE'];
export const HR_PERMISSIONS = [...attendancePermissions, ...payrollPermissions];

export const HR_PAGES = {
  attendance: { path: 'attendance', label: 'Bảng chấm công', icon: 'calendar_month', permissions: attendancePermissions },
  summary: { path: 'summary', label: 'Tổng hợp công', icon: 'fact_check', permissions: attendancePermissions },
  payroll: { path: 'payroll', label: 'Bảng lương', icon: 'payments', permissions: payrollPermissions },
  settings: { path: 'settings', label: 'Thiết lập công và lương', icon: 'tune', permissions: HR_PERMISSIONS }
};

export type HrPage = keyof typeof HR_PAGES;
