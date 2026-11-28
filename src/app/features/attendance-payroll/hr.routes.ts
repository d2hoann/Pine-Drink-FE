import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { map } from 'rxjs';

import { AccessControlService } from '../../core/services/access-control.service';
import { AuthService } from '../../core/services/auth.service';
import { HR_PAGES, HR_PERMISSIONS, HR_ROOT, HrPage } from './hr-navigation';

const openFirstPage: CanActivateFn = (route) => {
  const router = inject(Router);
  const accessControl = inject(AccessControlService);
  return inject(AuthService).ensureAuthorizationLoaded().pipe(
    map(() => {
      const page = Object.values(HR_PAGES).find(item => accessControl.canAny(item.permissions));
      return page ? router.createUrlTree([HR_ROOT, page.path], { queryParams: route.queryParams }) : router.parseUrl('/');
    })
  );
};

const loadPage = () => import('./attendance-payroll.component').then(module => module.AttendancePayrollComponent);

export const HR_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [openFirstPage],
    data: { permissions: HR_PERMISSIONS },
    children: []
  },
  ...Object.keys(HR_PAGES).map((key) => {
    const page = key as HrPage;
    const item = HR_PAGES[page];
    return {
      path: item.path,
      title: item.label + ' | Pine Drink',
      data: { page, permissions: item.permissions },
      loadComponent: loadPage
    };
  })
];
