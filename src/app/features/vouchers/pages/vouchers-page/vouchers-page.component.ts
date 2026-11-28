import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ToastService } from 'src/app/core/services/toast.service';
import { ApiErrorMessageService } from 'src/app/core/services/api-error-message.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog/confirm-dialog.service';
import { Branch } from '../../../branches/models/branch.model';
import { BranchService } from '../../../branches/services/branch.service';
import { VoucherPayload, VoucherResponse } from '../../models/voucher.model';
import { VoucherService } from '../../services/voucher.service';

@Component({
  selector: 'app-vouchers-page',
  templateUrl: './vouchers-page.component.html',
  styleUrls: ['./vouchers-page.component.scss']
})
export class VouchersPageComponent implements OnInit {
  vouchers: VoucherResponse[] = [];
  branches: Branch[] = [];
  loading = false;
  loadingDetail = false;
  loadingBranches = false;
  saving = false;
  showForm = false;
  editing: VoucherResponse | null = null;

  keyword = '';
  status = '';
  discountType = '';
  page = 0;
  size = 12;
  readonly pageSizeOptions = [6, 12, 24, 48];
  totalPages = 0;
  totalElements = 0;

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(100)]],
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', [Validators.maxLength(255)]],
    discountType: ['PERCENTAGE', Validators.required],
    discountValue: [10, [Validators.required, Validators.min(0.01)]],
    maxDiscountAmount: [null as number | null],
    minOrderAmount: [0],
    usageLimit: [null as number | null],
    usageLimitPerCustomer: [1],
    startAt: ['', Validators.required],
    endAt: ['', Validators.required],
    branchIds: this.fb.nonNullable.control<string[]>([])
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly voucherService: VoucherService,
    private readonly branchService: BranchService,
    private readonly toast: ToastService,
    private readonly apiErrorMessage: ApiErrorMessageService,
    private readonly confirmDialog: ConfirmDialogService
  ) { }

  ngOnInit(): void {
    this.loadVouchers();
    this.loadBranches();
  }

  loadVouchers(): void {
    this.loading = true;
    this.voucherService.search({
      keyword: this.keyword.trim(),
      status: this.status,
      discountType: this.discountType,
      page: this.page,
      size: this.size,
      sort: 'createdAt,desc'
    }).pipe(finalize(() => (this.loading = false))).subscribe({
      next: res => {
        this.vouchers = res.data.content;
        this.totalPages = res.data.totalPages;
        this.totalElements = res.data.totalElements;
      },
      error: () => this.toast.error('Không tải được danh sách mã giảm giá')
    });
  }

  openCreate(): void {
    this.editing = null;
    this.showForm = true;
    this.form.reset({
      code: '',
      name: '',
      description: '',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      maxDiscountAmount: null,
      minOrderAmount: 0,
      usageLimit: null,
      usageLimitPerCustomer: 1,
      startAt: this.toDateTimeLocal(new Date()),
      endAt: this.toDateTimeLocal(new Date(Date.now() + 7 * 86400000)),
      branchIds: []
    });
  }

  openEdit(voucher: VoucherResponse): void {
    this.loadingDetail = true;
    this.voucherService.getById(voucher.id)
      .pipe(finalize(() => (this.loadingDetail = false)))
      .subscribe({
        next: (res) => {
          const detail = res.data;
          this.editing = detail;
          this.showForm = true;
          this.form.reset({
            code: detail.code,
            name: detail.name,
            description: detail.description || '',
            discountType: detail.discountType,
            discountValue: detail.discountValue,
            maxDiscountAmount: detail.maxDiscountAmount ?? null,
            minOrderAmount: detail.minOrderAmount ?? 0,
            usageLimit: detail.usageLimit ?? null,
            usageLimitPerCustomer: detail.usageLimitPerCustomer ?? 1,
            startAt: this.toDateTimeLocal(detail.startAt),
            endAt: this.toDateTimeLocal(detail.endAt),
            branchIds: detail.branchIds || []
          });
        },
        error: () => this.toast.error('Không tải được chi tiết mã giảm giá')
      });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Vui lòng điền đầy đủ thông tin bắt buộc.');
      return;
    }

    const payload = this.buildPayload();
    this.saving = true;
    const request$ = this.editing
      ? this.voucherService.update(this.editing.id, payload)
      : this.voucherService.create(payload);

    request$.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.toast.success(this.editing ? 'Đã cập nhật mã giảm giá' : 'Đã tạo mã giảm giá');
        this.showForm = false;
        this.loadVouchers();
      },
      error: err => this.toast.error(this.apiErrorMessage.resolve(err, 'Lưu mã giảm giá thất bại'))
    });
  }

  updateStatus(voucher: VoucherResponse, status: string): void {
    const action = status === 'ACTIVE' ? 'bật' : 'tắt';
    this.confirmDialog.confirm({
      title: `Xác nhận ${action} voucher?`,
      message: `Bạn chắc muốn ${action} voucher ${voucher.code}?`,
      confirmText: status === 'ACTIVE' ? 'Bật mã giảm giá' : 'Tắt mã giảm giá',
      cancelText: 'Hủy',
      type: status === 'ACTIVE' ? 'success' : 'warning',
      affectedItems: [voucher.name || voucher.code]
    }).subscribe((confirmed) => {
      if (!confirmed) return;

      this.voucherService.updateStatus(voucher.id, status).subscribe({
        next: () => {
          this.toast.success('Đã cập nhật trạng thái');
          this.loadVouchers();
        },
        error: () => this.toast.error('Cập nhật trạng thái thất bại')
      });
    });
  }

  remove(voucher: VoucherResponse): void {
    this.confirmDialog.confirm({
      title: 'Xác nhận xóa mã giảm giá?',
      message: `Mã giảm giá ${voucher.code} sẽ bị xóa khỏi hệ thống.`,
      description: 'Thao tác này không thể hoàn tác.',
      confirmText: 'Xóa mã giảm giá',
      cancelText: 'Hủy',
      type: 'danger',
      risks: ['Mất cấu hình mã giảm giá', 'Không thể khôi phục sau khi xóa']
    }).subscribe((confirmed) => {
      if (!confirmed) return;

      this.voucherService.delete(voucher.id).subscribe({
        next: () => {
          this.toast.success('Đã xóa mã giảm giá');
          this.loadVouchers();
        },
        error: () => this.toast.error('Xóa mã giảm giá thất bại')
      });
    });
  }

  applyFilters(): void {
    this.page = 0;
    this.loadVouchers();
  }

  changePage(page: number): void {
    if (page < 0 || page >= this.totalPages || page === this.page || this.loading) return;
    this.page = page;
    this.loadVouchers();
  }

  changePageSize(size: number): void {
    this.size = Number(size) || 12;
    this.page = 0;
    this.loadVouchers();
  }

  usagePercent(voucher: VoucherResponse): number {
    if (!voucher.usageLimit) return 0;
    return Math.min(100, Math.round((voucher.usedCount / voucher.usageLimit) * 100));
  }

  formatDiscount(voucher: VoucherResponse): string {
    return voucher.discountType === 'PERCENTAGE'
      ? `${voucher.discountValue}%`
      : `${Number(voucher.discountValue).toLocaleString('vi-VN')}đ`;
  }

  clearBranchScope(): void {
    this.form.controls.branchIds.setValue([]);
  }

  get selectedBranchIds(): string[] {
    return this.form.controls.branchIds.value;
  }

  private loadBranches(): void {
    this.loadingBranches = true;
    this.branchService.getActiveBranchOptions()
      .pipe(finalize(() => (this.loadingBranches = false)))
      .subscribe({
        next: branches => (this.branches = branches),
        error: () => this.toast.error('Không tải được danh sách chi nhánh')
      });
  }

  private buildPayload(): VoucherPayload {
    const raw = this.form.getRawValue();
    return {
      code: raw.code!.trim().toUpperCase(),
      name: raw.name!.trim(),
      description: raw.description?.trim() || null,
      discountType: raw.discountType!,
      discountValue: Number(raw.discountValue),
      maxDiscountAmount: raw.maxDiscountAmount === null ? null : Number(raw.maxDiscountAmount),
      minOrderAmount: Number(raw.minOrderAmount || 0),
      usageLimit: raw.usageLimit === null ? null : Number(raw.usageLimit),
      usageLimitPerCustomer: raw.usageLimitPerCustomer === null ? null : Number(raw.usageLimitPerCustomer),
      startAt: this.toIsoLocal(raw.startAt!),
      endAt: this.toIsoLocal(raw.endAt!),
      branchIds: raw.branchIds
    };
  }

  private toDateTimeLocal(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private toIsoLocal(value: string): string {
    return value.length === 16 ? `${value}:00` : value;
  }
}
