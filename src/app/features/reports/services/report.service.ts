import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { API_ENDPOINTS } from '../../../core/constants/api-endpoints';
import { BaseResponse } from '../../../shared/models/base-response.model';
import { PageResponse } from '../../../shared/models/page-response.model';
import {
  CreateReportJobRequest,
  ReportJobFilters,
  ReportJobResponse,
  ReportJobStatsResponse,
  ReportOptionsResponse,
  SalesDetailReportRequest,
  SalesDetailReportRow
} from '../models/report.model';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly apiUrl = `${environment.apiBaseUrl}${API_ENDPOINTS.reports.jobs}`;
  private readonly salesDetailUrl = `${environment.apiBaseUrl}${API_ENDPOINTS.reports.salesDetail}`;

  constructor(private readonly http: HttpClient) {}

  createJob(request: CreateReportJobRequest): Observable<ReportJobResponse> {
    return this.http
      .post<BaseResponse<ReportJobResponse>>(this.apiUrl, request)
      .pipe(map((response) => response.data));
  }

  getJob(id: string): Observable<ReportJobResponse> {
    return this.http
      .get<BaseResponse<ReportJobResponse>>(`${this.apiUrl}/${id}`, {
        headers: { 'X-Skip-Loading': 'true' }
      })
      .pipe(map((response) => response.data));
  }

  downloadJob(id: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${id}/download`, { responseType: 'blob' });
  }

  getJobHistory(
    page = 0,
    size = 20,
    filters: ReportJobFilters = {}
  ): Observable<PageResponse<ReportJobResponse>> {
    let params = new HttpParams().set('page', page).set('size', size).set('sort', 'createdAt,desc');
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params = params.set(key, value);
    });

    return this.http
      .get<BaseResponse<PageResponse<ReportJobResponse>>>(this.apiUrl, { params })
      .pipe(map((response) => response.data));
  }

  previewSalesDetail(
    request: SalesDetailReportRequest,
    page = 0,
    size = 20
  ): Observable<PageResponse<SalesDetailReportRow>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http
      .post<BaseResponse<PageResponse<SalesDetailReportRow>>>(`${this.salesDetailUrl}/preview`, request, { params })
      .pipe(map((response) => response.data));
  }

  exportSalesDetail(request: SalesDetailReportRequest): Observable<HttpResponse<Blob>> {
    return this.http.post(`${this.salesDetailUrl}/export`, request, { observe: 'response', responseType: 'blob' });
  }

  getJobStats(): Observable<ReportJobStatsResponse> {
    return this.http
      .get<BaseResponse<ReportJobStatsResponse>>(`${this.apiUrl}/stats`)
      .pipe(map((response) => response.data));
  }

  getOptions(): Observable<ReportOptionsResponse> {
    return this.http
      .get<BaseResponse<ReportOptionsResponse>>(`${this.apiUrl}/options`)
      .pipe(map((response) => response.data));
  }
}
