import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { SidebarScrollService } from '../../core/services/sidebar-scroll.service';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { AccessControlService } from '../../core/services/access-control.service';
import { HR_PAGES, HR_ROOT } from '../../features/attendance-payroll/hr-navigation';
import { AuthUser } from '../../shared/models/user.model';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  permission?: string;
  permissions?: string[];
  roles?: string[];
  badge?: string;
  compact?: boolean;
  keepHrContext?: boolean;
}

interface NavSection {
  id: string;
  title: string;
  icon?: string;
  items: NavItem[];
}

@Component({
  selector: 'app-admin-layout',
  templateUrl: './admin-layout.component.html',
  styleUrls: ['./admin-layout.component.scss']
})
export class AdminLayoutComponent implements AfterViewInit {
  @ViewChild('sidebarScrollContainer') private readonly sidebarScrollContainer?: ElementRef<HTMLElement>;
  readonly navSections: NavSection[] = [
    {
      id: 'overview',
      title: 'Tổng quan',
      items: [
        { label: 'Bảng giao hàng', icon: 'local_shipping', route: '/admin/dashboard', roles: ['DELIVERY'] },
        { label: 'Bảng điều khiển', icon: 'dashboard', route: '/admin/dashboard', roles: ['ADMIN', 'MANAGER'] }
      ]
    },
    {
      id: 'operations',
      title: 'Vận hành',
      icon: 'storefront',
      items: [
        { label: 'Đơn hàng', icon: 'receipt_long', route: '/admin/orders', roles: ['ADMIN', 'MANAGER', 'DELIVERY'] },
        { label: 'Trò chuyện trực tuyến', icon: 'forum', route: '/admin/chat-realtime', roles: ['ADMIN', 'MANAGER', 'DELIVERY'] },
        { label: 'Chi nhánh', icon: 'storefront', route: '/admin/branches', permission: 'BRANCH_VIEW' }
      ]
    },
    {
      id: 'hr',
      title: 'Nhân sự và tiền lương',
      icon: 'badge',
      items: Object.values(HR_PAGES).map(item => ({
        label: item.label,
        icon: item.icon,
        permissions: item.permissions,
        route: HR_ROOT + '/' + item.path,
        keepHrContext: true
      }))
    },
    {
      id: 'menu',
      title: 'Thực đơn',
      icon: 'restaurant_menu',
      items: [
        { label: 'Sản phẩm', icon: 'local_cafe', route: '/admin/products', roles: ['ADMIN', 'MANAGER'] },
        { label: 'Danh mục sản phẩm', icon: 'category', route: '/admin/categories', roles: ['ADMIN', 'MANAGER'] }
      ]
    },
    {
      id: 'product-config',
      title: 'Cấu hình sản phẩm',
      icon: 'tune',
      items: [
        { label: 'Biến thể sản phẩm', icon: 'tune', route: '/admin/products/variants', roles: ['ADMIN', 'MANAGER'] },
        { label: 'Tồn kho theo ngày', icon: 'inventory_2', route: '/admin/products/daily-stocks', roles: ['ADMIN', 'MANAGER'] },
        { label: 'Phần thêm theo sản phẩm', icon: 'icecream', route: '/admin/products/toppings', roles: ['ADMIN', 'MANAGER'] },
        { label: 'Danh mục phần thêm', icon: 'bakery_dining', route: '/admin/toppings', roles: ['ADMIN', 'MANAGER'] }
      ]
    },
    {
      id: 'access',
      title: 'Người dùng và quyền',
      icon: 'manage_accounts',
      items: [
        { label: 'Khách hàng', icon: 'groups', route: '/admin/customers', roles: ['ADMIN', 'MANAGER'] },
        { label: 'Tài khoản', icon: 'admin_panel_settings', route: '/admin/accounts', permission: 'ACCOUNT_VIEW' },
        { label: 'Phân quyền', icon: 'verified_user', route: '/admin/permissions', permission: 'ROLE_PERMISSION_VIEW' }
      ]
    },
    {
      id: 'business',
      title: 'Kinh doanh',
      icon: 'monitoring',
      items: [
        { label: 'Mã giảm giá', icon: 'confirmation_number', route: '/admin/vouchers', roles: ['ADMIN', 'MANAGER'] },
        { label: 'Báo cáo bán hàng', icon: 'monitoring', route: '/admin/reports', permission: 'REPORT_VIEW' },
        { label: 'Tiến trình báo cáo', icon: 'schedule', route: '/admin/reports/processes', permission: 'REPORT_VIEW' }
      ]
    }
  ];

  get visibleNavSections(): NavSection[] {
    return this.navSections
      .map((section) => ({ ...section, items: section.items.filter((item) => this.canViewNavItem(item)) }))
      .filter((section) => section.items.length > 0);
  }

  sidebarOpen = false;
  sidebarCollapsed = false;
  expandedSectionId: string | null = null;
  activeSectionId: string | null = null;
  currentUser: AuthUser | null = null;
  private activePath = '';
  private activeRoute?: string;

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly accessControl: AccessControlService,
    private readonly sidebarScrollService: SidebarScrollService
  ) {
    this.currentUser = this.authService.getCurrentUser();
    this.updateActiveSection();

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.currentUser = this.authService.getCurrentUser();
        this.updateActiveSection();
        this.sidebarOpen = false;
        this.restoreSidebarScroll();
      });
  }

  ngAfterViewInit(): void {
    this.restoreSidebarScroll();
  }

  get isDeliveryOnly(): boolean {
    return this.accessControl.hasAnyRole(['DELIVERY']) && !this.accessControl.hasAnyRole(['ADMIN', 'MANAGER']);
  }

  getAvatarUrl(): string {
    // Backend now returns full MinIO URLs for public files (avatars)
    // Example: http://localhost:9000/pine-drink-public/avatars/uuid.jpg
    // Use the URL directly as provided by the backend
    return this.currentUser?.avatarUrl || '';
  }

  getUserInitials(): string {
    const name = this.currentUser?.fullName || this.currentUser?.username || 'A';
    return name.charAt(0).toUpperCase();
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
    if (this.sidebarOpen) this.sidebarCollapsed = false;
  }

  toggleSidebarCollapse(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  toggleSection(sectionId: string): void {
    this.expandedSectionId = !this.sidebarCollapsed && this.expandedSectionId === sectionId ? null : sectionId;
    this.sidebarCollapsed = false;
  }

  trackSection(_: number, section: NavSection): string {
    return section.id;
  }

  isActive(route: string): boolean {
    return this.activeRoute === route;
  }

  private updateActiveSection(): void {
    const path = this.router.url.split(/[?#]/, 1)[0];
    if (path === this.activePath) return;
    this.activePath = path;

    const matches = this.visibleNavSections.flatMap(section => section.items
      .filter(item => path === item.route || path.startsWith(item.route + '/'))
      .map(item => ({ section, route: item.route })));
    // Ưu tiên đường dẫn con cụ thể hơn khi nhiều mục cùng khớp.
    const active = matches.sort((a, b) => b.route.length - a.route.length)[0];
    this.activeRoute = active?.route;
    this.activeSectionId = active?.section.id ?? null;
    this.expandedSectionId = active?.section.icon ? active.section.id : null;
  }

  hrContextParams(targetRoute: string) {
    if (!this.router.url.startsWith(HR_ROOT + '/')) return {};
    const url = this.router.parseUrl(this.router.url);
    return {
      branchId: url.queryParams['branchId'],
      month: url.queryParams['month'],
      // Chỉ giữ bộ lọc nhân viên khi vẫn ở cùng màn hình.
      employeeId: this.isActive(targetRoute) ? url.queryParams['employeeId'] : undefined
    };
  }

  onSidebarScroll(event: Event): void {
    this.sidebarScrollService.save((event.target as HTMLElement).scrollTop);
  }

  private restoreSidebarScroll(): void {
    const container = this.sidebarScrollContainer?.nativeElement;
    if (!container) return;

    if (this.sidebarScrollService.hasSavedPosition()) {
      this.sidebarScrollService.restore(container);
    } else {
      this.scrollToActiveItem();
    }
  }

  private scrollToActiveItem(): void {
    const container = this.sidebarScrollContainer?.nativeElement;
    if (!container) return;

    // Chờ Angular cập nhật DOM và gán class .is-active
    setTimeout(() => {
      const activeLink = container.querySelector('.is-active') as HTMLElement;
      if (activeLink) {
        activeLink.scrollIntoView({ behavior: 'auto', block: 'center' });
        
        // Lưu lại vị trí sau khi cuộn
        setTimeout(() => {
          this.sidebarScrollService.save(container.scrollTop);
        }, 100);
      }
    }, 150);
  }

  private canViewNavItem(item: NavItem): boolean {
    const hasPermissionAccess = item.permission ? this.accessControl.can(item.permission) : true;
    const hasPermissionsAccess = item.permissions?.length ? this.accessControl.canAny(item.permissions) : true;
    const hasRoleAccess = item.roles?.length ? this.accessControl.hasAnyRole(item.roles) : true;
    const deliveryCanSee = !this.isDeliveryOnly || !!item.roles?.includes('DELIVERY');

    return hasPermissionAccess && hasPermissionsAccess && hasRoleAccess && deliveryCanSee;
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
