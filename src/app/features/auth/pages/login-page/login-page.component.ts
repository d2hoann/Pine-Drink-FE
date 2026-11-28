import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../../../core/services/auth.service';
import { AccessControlService } from '../../../../core/services/access-control.service';
import { ToastService } from '../../../../core/services/toast.service';
import { environment } from '../../../../../environments/environment';
import { LoginRequest } from '../../models/login-request.model';
import { ApiError } from '../../../../shared/models/api-error.model';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            ux_mode?: 'popup' | 'redirect';
            context?: 'signin' | 'signup' | 'use';
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              locale?: string;
              width?: number;
            }
          ) => void;
        };
      };
    };
  }
}

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.scss']
})
export class LoginPageComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly loginForm = this.formBuilder.nonNullable.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]]
  });

  submitting = false;
  googleSubmitting = false;
  showPassword = false;
  private readonly googleClientId = environment.googleClientId.trim();
  googleMessage = this.googleClientId
    ? 'Đang tải đăng nhập Google…'
    : 'Đăng nhập Google chưa được cấu hình.';

  @ViewChild('googleButtonHost', { static: true }) private googleButtonHost!: ElementRef<HTMLDivElement>;
  private googleInitTimerId?: number;

  constructor(
    private readonly formBuilder: FormBuilder,
    private readonly authService: AuthService,
    private readonly accessControl: AccessControlService,
    private readonly toastService: ToastService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly ngZone: NgZone
  ) { }

  ngOnInit(): void {
    // Kiểm tra thông báo đặt lại mật khẩu thành công
    const resetSuccess = this.route.snapshot.queryParamMap.get('resetSuccess');
    if (resetSuccess === 'true') {
      this.toastService.success('Đặt lại mật khẩu thành công! Vui lòng đăng nhập.');
      // Xóa query param sau khi hiển thị thông báo
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {},
        replaceUrl: true
      });
    }

    if (this.authService.isAuthenticated()) {
      // Chuyển hướng theo vai trò người dùng
      const redirectUrl = this.getRedirectUrlByRole();
      this.router.navigate([redirectUrl]);
    }
  }

  submit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.submitting = true;
    const request: LoginRequest = this.loginForm.getRawValue();

    this.authService.login(request).subscribe({
      next: () => {
        this.handleLoginSuccess('Đăng nhập thành công.');
      },
      error: (error: ApiError) => {
        this.submitting = false;
        
        if (error.errorCode === 'AUTH_006') {
          // Nếu người dùng nhập email, tự điền email ở trang OTP
          const queryParams: { email?: string } = {};
          if (request.username.includes('@')) {
            queryParams.email = request.username;
          }

          this.router.navigate(['/auth/verify-otp'], { queryParams });
        }
      },
      complete: () => {
        this.submitting = false;
      }
    });
  }

  ngAfterViewInit(): void {
    if (this.googleClientId) {
      this.initGoogleIdentity();
    }
  }

  ngOnDestroy(): void {
    if (this.googleInitTimerId !== undefined) {
      window.clearTimeout(this.googleInitTimerId);
    }
  }

  handleGoogleCredential(response: { credential?: string }): void {
    const idToken = response.credential;
    if (!idToken) {
      this.googleSubmitting = false;
      this.toastService.error('Không nhận được thông tin từ Google.');
      return;
    }

    this.googleSubmitting = true;

    this.authService.googleLogin(idToken).subscribe({
      next: () => {
        this.handleLoginSuccess('Đăng nhập Google thành công!');
      },
      error: (error) => {
        console.error('[Google OAuth] Login failed:', error);
        this.googleSubmitting = false;
        // Toast lỗi được xử lý trong HTTP interceptor
      },
      complete: () => {
        this.googleSubmitting = false;
      }
    });
  }

  private handleLoginSuccess(message: string): void {
    this.toastService.success(message);

    // Kiểm tra redirect URL từ query params
    const requestedRedirect = this.route.snapshot.queryParamMap.get('redirectUrl');

    // Nếu có redirect URL hợp lệ và không phải trang auth thì dùng redirect đó
    if (requestedRedirect && !requestedRedirect.startsWith('/auth')) {
      this.router.navigateByUrl(requestedRedirect);
      return;
    }

    // Nếu không có redirect URL thì chuyển hướng theo vai trò người dùng
    const redirectUrl = this.getRedirectUrlByRole();
    this.router.navigate([redirectUrl]);
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  private initGoogleIdentity(retryCount = 0): void {
    const googleIdentity = window.google?.accounts?.id;
    if (!googleIdentity) {
      // Thử lại tối đa 10 lần (tổng 3 giây) để chờ script Google tải xong
      if (retryCount < 10) {
        this.googleInitTimerId = window.setTimeout(
          () => this.initGoogleIdentity(retryCount + 1),
          300
        );
      } else {
        this.googleMessage = 'Không tải được đăng nhập Google. Hãy tải lại trang.';
      }
      return;
    }

    const buttonHost = this.googleButtonHost.nativeElement;
    googleIdentity.initialize({
      client_id: this.googleClientId,
      callback: (response) => this.ngZone.run(() => this.handleGoogleCredential(response))
    });
    googleIdentity.renderButton(buttonHost, {
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      locale: 'vi',
      width: Math.min(buttonHost.clientWidth || 240, 400)
    });
  }

  private getRedirectUrlByRole(): string {
    if (this.accessControl.isAdminConsoleUser()) {
      return '/admin/dashboard';
    }

    return '/';
  }
}
