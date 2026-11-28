import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';

import { AccessControlService } from '../../../../core/services/access-control.service';
import { ToastService } from '../../../../core/services/toast.service';
import { Branch } from '../../../branches/models/branch.model';
import { BranchService } from '../../../branches/services/branch.service';
import { ProductSummary } from '../../../products/models/product.model';
import { ProductService } from '../../../products/services/product.service';
import { SalesDetailReportRequest, SalesDetailReportRow } from '../../models/report.model';
import { ReportService } from '../../services/report.service';

@Component({
  selector: 'app-reports-page',
  templateUrl: './reports-page.component.html',
  styleUrls: ['./sales-detail-report.layout.scss']
})
export class ReportsPageComponent implements OnInit {
  readonly today = this.toDateInput(new Date());
  readonly filterForm: FormGroup;

  branches: Branch[] = [];
  products: ProductSummary[] = [];
  rows: SalesDetailReportRow[] = [];
  selectedFormat: 'PDF' | 'XLSX' = 'PDF';

  page = 0;
  size = 20;
  totalElements = 0;
  totalPages = 0;
  isLoadingOptions = false;
  isLoadingPreview = false;
  previewError: string | null = null;
  isExporting = false;
  exportQueued = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly reportService: ReportService,
    private readonly branchService: BranchService,
    private readonly productService: ProductService,
    private readonly accessControl: AccessControlService,
    private readonly toastService: ToastService
  ) {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    this.filterForm = this.fb.group({
      branchId: ['', Validators.required],
      fromDate: [this.toDateInput(firstDay), Validators.required],
      toDate: [this.today, Validators.required],
      productId: ['']
    });
  }

  ngOnInit(): void {
    this.isLoadingOptions = true;
    forkJoin({
      branches: this.branchService.getActiveBranchOptions(),
      products: this.productService.getProductOptions()
    }).pipe(finalize(() => (this.isLoadingOptions = false))).subscribe({
      next: ({ branches, products }) => {
        this.branches = branches;
        this.products = products;
        if (branches.length > 0) {
          this.filterForm.patchValue({ branchId: branches[0].id });
          this.loadPreview(0);
        }
      },
      error: () => this.toastService.error('Không thể tải danh mục dùng cho báo cáo')
    });
  }

  get canCreateReport(): boolean {
    return this.accessControl.can('REPORT_CREATE');
  }

  get reportTotal(): number {
    return Number(this.rows[0]?.reportTotal || 0);
  }

  applyFilter(): void {
    this.loadPreview(0);
  }

  resetFilter(): void {
    const now = new Date();
    this.filterForm.reset({
      branchId: this.branches[0]?.id || '',
      fromDate: this.toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
      toDate: this.today,
      productId: ''
    });
    if (this.filterForm.value.branchId) this.loadPreview(0);
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages || page === this.page || this.isLoadingPreview) return;
    this.loadPreview(page);
  }

  changePageSize(size: number | string): void {
    this.size = Number(size);
    this.loadPreview(0);
  }

  exportReport(): void {
    const request = this.buildRequest();
    if (!request || this.isExporting) return;

    this.isExporting = true;
    this.exportQueued = false;
    this.reportService.exportSalesDetail(request)
      .pipe(finalize(() => (this.isExporting = false)))
      .subscribe({
        next: (response) => {
          if (response.status === 202) {
            this.exportQueued = true;
          } else if (response.body?.size) {
            this.download(response.body, `bang-ke-chi-tiet-ban-hang.${request.fileFormat.toLowerCase()}`);
            this.toastService.success('Đã tạo và tải báo cáo');
          }
        },
        error: (error) => this.toastService.error(this.errorMessage(error, 'Không thể kết xuất báo cáo'))
      });
  }

  formatDate(value: string): string {
    return value ? new Date(value).toLocaleString('vi-VN') : '—';
  }

  orderTypeLabel(value: string): string {
    return value === 'DELIVERY' ? 'Giao hàng' : 'Tại quầy';
  }

  private loadPreview(page: number): void {
    const request = this.buildRequest();
    if (!request) return;

    this.previewError = null;
    this.isLoadingPreview = true;
    this.reportService.previewSalesDetail(request, page, this.size)
      .pipe(finalize(() => (this.isLoadingPreview = false)))
      .subscribe({
        next: (result) => {
          this.rows = result.content || [];
          this.page = result.page;
          this.size = result.size;
          this.totalElements = result.totalElements;
          this.totalPages = result.totalPages;
        },
        error: (error) => {
          this.rows = [];
          this.totalElements = 0;
          this.totalPages = 0;
          this.previewError = this.errorMessage(error, 'Không thể tải dữ liệu xem trước. Vui lòng thử lại.');
        }
      });
  }

  private buildRequest(): SalesDetailReportRequest | null {
    this.filterForm.markAllAsTouched();
    if (this.filterForm.invalid) {
      this.toastService.warning('Vui lòng chọn chi nhánh và khoảng ngày');
      return null;
    }

    const value = this.filterForm.value;
    if (value.fromDate > value.toDate) {
      this.toastService.warning('Từ ngày phải nhỏ hơn hoặc bằng đến ngày');
      return null;
    }
    return {
      branchId: value.branchId,
      fromDate: value.fromDate,
      toDate: value.toDate,
      productId: value.productId || null,
      fileFormat: this.selectedFormat
    };
  }

  private download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  private toDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private errorMessage(error: unknown, fallback: string): string {
    const response = error as { message?: string; error?: { message?: string } } | null;
    return response?.error?.message || response?.message || fallback;
  }
}
