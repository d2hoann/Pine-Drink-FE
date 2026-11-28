import { CommonModule } from '@angular/common';
import { Component, NgZone } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';

import { AccessControlService } from '../../core/services/access-control.service';
import { AuthService } from '../../core/services/auth.service';
import { AdminLayoutComponent } from './admin-layout.component';

@Component({ standalone: true, template: '' })
class RoutedPage {}

describe('AdminLayoutComponent module navigation', () => {
  let fixture: ComponentFixture<AdminLayoutComponent>;
  let router: Router;
  let access: jasmine.SpyObj<AccessControlService>;

  beforeEach(async () => {
    access = jasmine.createSpyObj('AccessControlService', ['can', 'canAny', 'hasAnyRole']);
    access.can.and.returnValue(true);
    access.canAny.and.returnValue(true);
    access.hasAnyRole.and.callFake(roles => roles.includes('ADMIN'));

    await TestBed.configureTestingModule({
      declarations: [AdminLayoutComponent],
      imports: [
        CommonModule,
        RouterTestingModule.withRoutes([
          { path: 'admin/dashboard', component: RoutedPage },
          { path: 'admin/orders', component: RoutedPage },
          { path: 'admin/hr/attendance', component: RoutedPage },
          { path: 'admin/hr/payroll', component: RoutedPage },
          { path: 'admin/products', component: RoutedPage },
          { path: 'admin/products/variants', component: RoutedPage }
        ])
      ],
      providers: [
        { provide: AccessControlService, useValue: access },
        { provide: AuthService, useValue: { getCurrentUser: () => null } }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(AdminLayoutComponent);
    fixture.detectChanges();
  });

  function element<T extends Element>(selector: string): T {
    return (fixture.nativeElement as HTMLElement).querySelector<T>(selector)!;
  }

  function trigger(id: string): HTMLButtonElement {
    return element<HTMLButtonElement>('[aria-controls="admin-module-' + id + '"]');
  }

  function submenu(id: string): HTMLElement {
    return element<HTMLElement>('#admin-module-' + id);
  }

  async function go(url: string): Promise<void> {
    await TestBed.inject(NgZone).run(() => router.navigateByUrl(url));
    fixture.detectChanges();
  }

  it('reveals only the selected module and keeps focus without navigating', async () => {
    await go('/admin/dashboard');
    expect(submenu('hr').hidden).toBeTrue();
    expect(submenu('operations').hidden).toBeTrue();

    const hr = trigger('hr');
    hr.focus();
    hr.click();
    fixture.detectChanges();

    expect(hr.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(hr);
    expect(submenu('hr').hidden).toBeFalse();
    expect(submenu('hr').querySelectorAll('a').length).toBe(4);
    expect(router.url).toBe('/admin/dashboard');

    trigger('operations').click();
    fixture.detectChanges();
    expect(submenu('hr').hidden).toBeTrue();
    expect(submenu('operations').hidden).toBeFalse();

    trigger('operations').click();
    fixture.detectChanges();
    expect(submenu('operations').hidden).toBeTrue();
  });

  it('opens the deepest matching module for a bookmarked page', async () => {
    await go('/admin/products/variants?branchId=b');
    expect(submenu('product-config').hidden).toBeFalse();
    expect(submenu('menu').hidden).toBeTrue();
    expect(element<HTMLAnchorElement>('a[aria-current="page"]').textContent).toContain('Biến thể sản phẩm');
    expect(trigger('product-config').classList).toContain('is-current');
  });

  it('filters HR links by authorization and keeps the selected branch and month', async () => {
    access.canAny.and.callFake(permissions => permissions.includes('PAYROLL_VIEW'));
    await go('/admin/hr/payroll?branchId=a&month=2026-11');

    expect(submenu('hr').hidden).toBeFalse();
    const links = Array.from(submenu('hr').querySelectorAll('a'));
    expect(links.map(link => link.querySelector('span:not([aria-hidden])')?.textContent?.trim()))
      .toEqual(['Bảng lương', 'Thiết lập công và lương']);
    expect(links[0].getAttribute('aria-current')).toBe('page');
    expect(links[1].getAttribute('href')).toBe('/admin/hr/settings?branchId=a&month=2026-11');

    trigger('hr').click();
    fixture.detectChanges();
    await go('/admin/hr/payroll?branchId=a&month=2026-12');
    expect(submenu('hr').hidden).toBeTrue();
    expect(trigger('hr').classList).toContain('is-current');
  });

  it('shows child labels when opening a module from the collapsed sidebar', async () => {
    await go('/admin/dashboard');
    element<HTMLButtonElement>('.sidebar-toggle').click();
    fixture.detectChanges();
    expect(fixture.componentInstance.sidebarCollapsed).toBeTrue();

    trigger('hr').click();
    fixture.detectChanges();
    expect(fixture.componentInstance.sidebarCollapsed).toBeFalse();
    expect(submenu('hr').hidden).toBeFalse();
  });

  it('keeps the mobile drawer open until a child page is selected', async () => {
    await go('/admin/dashboard');
    element<HTMLButtonElement>('.menu-button').click();
    trigger('operations').click();
    fixture.detectChanges();
    expect(fixture.componentInstance.sidebarOpen).toBeTrue();

    const orders = submenu('operations').querySelector<HTMLAnchorElement>('a[href="/admin/orders"]')!;
    TestBed.inject(NgZone).run(() => orders.click());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(router.url).toBe('/admin/orders');
    expect(fixture.componentInstance.sidebarOpen).toBeFalse();
  });
});
