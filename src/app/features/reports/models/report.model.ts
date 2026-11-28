export type ReportType = 'PRODUCT_CATALOG' | 'SALES_DETAIL' | string;
export type ReportFileFormat = 'PDF' | 'XLSX' | string;
export type ReportJobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | string;

export interface CreateReportJobRequest {
  reportType: ReportType;
  fileFormat: ReportFileFormat;
  filters?: string | null;
  branchId?: string | null;
}

export interface ReportJobResponse {
  id: string;
  reportType: ReportType;
  fileFormat: ReportFileFormat;
  branchId?: string | null;
  filters?: string | null;
  status: ReportJobStatus;
  fileUrl?: string | null;
  errorMessage?: string | null;
  requestedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface ReportJobFilters {
  fromDate?: string | null;
  toDate?: string | null;
  reportType?: ReportType | null;
  fileFormat?: ReportFileFormat | null;
  status?: ReportJobStatus | null;
}

export interface SalesDetailReportRequest {
  branchId: string;
  fromDate: string;
  toDate: string;
  productId?: string | null;
  fileFormat: 'PDF' | 'XLSX';
}

export interface SalesDetailReportRow {
  orderCode: string;
  completedAt: string;
  branchCode: string;
  branchName: string;
  productCode: string;
  productName: string;
  variantName?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  orderType: string;
  paymentMethod?: string | null;
  customerName: string;
  totalRows: number;
  reportTotal: number;
}

export interface ReportJobStatsResponse {
  total: number;
  completed: number;
  running: number;
  failed: number;
}

export interface ReportOptionsResponse {
  categories: Array<{
    id: string;
    code?: string;
    name: string;
    imageUrl?: string;
  }>;
  stats: ReportJobStatsResponse;
}
