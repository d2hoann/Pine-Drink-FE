import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subscription, finalize, timer } from 'rxjs';

import { AccessControlService } from '../../../../core/services/access-control.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ReportJobFilters, ReportJobResponse, ReportJobStatsResponse } from '../../models/report.model';
import { ReportService } from '../../services/report.service';

@Component({
  selector: 'app-report-processes-page',
  templateUrl: './report-processes-page.component.html',
  styleUrls: ['./report-processes-page.component.scss']
})
export class ReportProcessesPageComponent implements OnInit, OnDestroy {
  readonly filterForm: FormGroup;
  jobs: ReportJobResponse[] = [];
  stats: ReportJobStatsResponse = { total: 0, completed: 0, running: 0, failed: 0 };

  page = 0;
  size = 20;
  totalElements = 0;
  totalPages = 0;
  isLoading = false;
  private readonly downloadingIds = new Set<string>();
  private readonly retryingIds = new Set<string>();
  private refreshSubscription?: Subscription;

  constructor(
    private readonly fb: FormBuilder,
    private readonly reportService: ReportService,
    private readonly accessControl: AccessControlService,
    private readonly toastService: ToastService
  ) {
    this.filterForm = this.fb.group({
      fromDate: [''],
      toDate: [''],
      reportType: [''],
      fileFormat: [''],
      status: ['']
    });
  }

  ngOnInit(): void {
    this.loadStats();
    this.loadHistory(0);
    this.refreshSubscription = timer(5000, 5000).subscribe(() => {
      if (this.jobs.some((job) => job.status === 'PENDING' || job.status === 'RUNNING')) {
        this.loadHistory(this.page, true);
        this.loadStats();
      }
    });
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  get canCreateReport(): boolean {
    return this.accessControl.can('REPORT_CREATE');
  }

  applyFilter(): void {
    const { fromDate, toDate } = this.filterForm.value;
    if (fromDate && toDate && fromDate > toDate) {
      this.toastService.warning('Từ ngày phải nhỏ hơn hoặc bằng đến ngày');
      return;
    }
    this.loadHistory(0);
  }

  resetFilter(): void {
    this.filterForm.reset({ fromDate: '', toDate: '', reportType: '', fileFormat: '', status: '' });
    this.loadHistory(0);
  }

  refresh(): void {
    this.loadHistory(this.page);
    this.loadStats();
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages || page === this.page || this.isLoading) return;
    this.loadHistory(page);
  }

  changePageSize(size: number | string): void {
    this.size = Number(size);
    this.loadHistory(0);
  }

  download(job: ReportJobResponse): void {
    if (job.status !== 'DONE' || this.downloadingIds.has(job.id)) return;
    this.downloadingIds.add(job.id);
    this.reportService.downloadJob(job.id)
      .pipe(finalize(() => this.downloadingIds.delete(job.id)))
      .subscribe({
        next: (blob) => {
          const prefix = job.reportType === 'SALES_DETAIL' ? 'bang-ke-chi-tiet-ban-hang' : 'danh-muc-san-pham';
          this.saveBlob(blob, `${prefix}-${job.id}.${job.fileFormat.toLowerCase()}`);
        },
        error: () => this.toastService.error('Không thể tải tệp báo cáo')
      });
  }

  retry(job: ReportJobResponse): void {
    if (!this.canCreateReport || job.status !== 'FAILED' || this.retryingIds.has(job.id)) return;
    if (!job.filters && job.reportType === 'SALES_DETAIL') {
      this.toastService.warning('Tiến trình cũ không còn đủ bộ lọc để thử lại');
      return;
    }

    this.retryingIds.add(job.id);
    this.reportService.createJob({
      reportType: job.reportType,
      fileFormat: job.fileFormat,
      branchId: job.branchId,
      filters: job.filters
    }).pipe(finalize(() => this.retryingIds.delete(job.id))).subscribe({
      next: () => {
        this.toastService.success('Đã tạo tiến trình thay thế');
        this.refresh();
      },
      error: () => this.toastService.error('Không thể thử lại tiến trình báo cáo')
    });
  }

  isDownloading(id: string): boolean {
    return this.downloadingIds.has(id);
  }

  isRetrying(id: string): boolean {
    return this.retryingIds.has(id);
  }

  statusLabel(status: string): string {
    return ({
      PENDING: 'Chờ xử lý',
      RUNNING: 'Đang xử lý',
      DONE: 'Hoàn tất',
      FAILED: 'Lỗi'
    } as Record<string, string>)[status] || status;
  }

  reportTypeLabel(type: string): string {
    return type === 'SALES_DETAIL' ? 'Bảng kê chi tiết bán hàng' : 'Danh mục sản phẩm';
  }

  formatDate(value?: string | null): string {
    return value ? new Date(value).toLocaleString('vi-VN') : '—';
  }

  private loadHistory(page: number, silent = false): void {
    if (!silent) this.isLoading = true;
    const filters: ReportJobFilters = this.filterForm.value;
    this.reportService.getJobHistory(page, this.size, filters)
      .pipe(finalize(() => {
        if (!silent) this.isLoading = false;
      }))
      .subscribe({
        next: (result) => {
          this.jobs = result.content || [];
          this.page = result.page;
          this.size = result.size;
          this.totalElements = result.totalElements;
          this.totalPages = result.totalPages;
        },
        error: () => {
          if (!silent) this.toastService.error('Không thể tải danh sách tiến trình');
        }
      });
  }

  private loadStats(): void {
    this.reportService.getJobStats().subscribe({
      next: (stats) => (this.stats = stats)
    });
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
