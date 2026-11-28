import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';

import { PageResponse } from '../../../../shared/models/page-response.model';
import { Topping } from '../../../toppings/models/topping.model';
import { ToppingService } from '../../../toppings/services/topping.service';
import { ProductSummary } from '../../models/product.model';
import { ProductToppingSummary } from '../../models/product-topping.model';
import { ProductService } from '../../services/product.service';
import { ProductToppingService } from '../../services/product-topping.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-product-toppings-page',
  templateUrl: './product-toppings-page.component.html',
  styleUrls: ['./product-toppings-page.component.scss']
})
export class ProductToppingsPageComponent implements OnInit {
  pageSize = 12;
  readonly pageSizeOptions = [6, 12, 24, 48];

  readonly form = this.formBuilder.nonNullable.group({
    toppingId: ['', Validators.required],
    isDefault: [false],
    maxQuantity: [1, [Validators.required, Validators.min(1), Validators.max(20)]],
    status: ['ACTIVE' as ProductToppingSummary['status']]
  });

  products: ProductSummary[] = [];
  toppings: Topping[] = [];
  selectedProductId = '';
  productToppings: ProductToppingSummary[] = [];
  pageData: PageResponse<ProductToppingSummary> = this.createEmptyPage();
  selectedProductTopping: ProductToppingSummary | null = null;
  loading = false;
  loadingDetail = false;
  saving = false;
  productLoading = false;
  toppingLoading = false;
  drawerOpen = false;
  errorMessage = '';
  searchTerm = '';
  statusFilter: 'ALL' | 'ACTIVE' | 'INACTIVE' = 'ALL';

  constructor(
    private readonly formBuilder: FormBuilder,
    private readonly productService: ProductService,
    private readonly toppingService: ToppingService,
    private readonly productToppingService: ProductToppingService,
    private readonly confirmDialog: ConfirmDialogService,
    private readonly toast: ToastService
  ) {}

  ngOnInit(): void {
    this.loadInitialData();
  }

  get selectedProduct(): ProductSummary | undefined {
    return this.products.find((product) => product.id === this.selectedProductId);
  }

  get assignedToppingIds(): Set<string> {
    return new Set(this.productToppings.map((item) => item.toppingId));
  }

  get availableToppings(): Topping[] {
    const assignedIds = this.assignedToppingIds;
    return this.toppings.filter((topping) => !assignedIds.has(topping.id) || topping.id === this.selectedProductTopping?.toppingId);
  }

  get visibleProductToppings(): ProductToppingSummary[] {
    const keyword = this.searchTerm.trim().toLowerCase();
    return this.productToppings.filter((item) => {
      const matchStatus = this.statusFilter === 'ALL' || item.status === this.statusFilter;
      const matchSearch = !keyword || [item.toppingName, item.toppingCode, item.toppingGroupName]
        .some((value) => (value || '').toLowerCase().includes(keyword));
      return matchStatus && matchSearch;
    });
  }

  get activeCount(): number {
    return this.productToppings.filter((item) => item.status === 'ACTIVE').length;
  }

  get defaultCount(): number {
    return this.productToppings.filter((item) => item.isDefault).length;
  }

  onProductChange(productId: string): void {
    this.selectedProductId = productId;
    this.closeDrawer();
    this.loadProductToppings(0);
  }

  openCreateDrawer(): void {
    if (!this.selectedProductId) {
      this.errorMessage = 'Vui lòng chọn sản phẩm trước khi gắn phần thêm.';
      return;
    }

    this.selectedProductTopping = null;
    this.form.reset({ toppingId: this.availableToppings[0]?.id || '', isDefault: false, maxQuantity: 1, status: 'ACTIVE' });
    this.form.controls.toppingId.enable();
    this.drawerOpen = true;
  }

  openEditDrawer(item: ProductToppingSummary): void {
    if (!this.selectedProductId) { return; }

    this.loadingDetail = true;
    this.errorMessage = '';
    this.productToppingService.getProductTopping(this.selectedProductId, item.id)
      .pipe(finalize(() => (this.loadingDetail = false)))
      .subscribe({
        next: (detail) => {
          this.selectedProductTopping = detail;
          this.form.reset({ toppingId: detail.toppingId, isDefault: detail.isDefault, maxQuantity: detail.maxQuantity || 1, status: detail.status });
          this.form.controls.toppingId.disable();
          this.drawerOpen = true;
        },
        error: () => {
          this.errorMessage = 'Không tải được chi tiết phần thêm của sản phẩm.';
        }
      });
  }

  closeDrawer(): void {
    if (this.saving) { return; }
    this.drawerOpen = false;
    this.selectedProductTopping = null;
    this.form.controls.toppingId.enable();
  }

  saveProductTopping(): void {
    if (!this.selectedProductId || this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Vui lòng điền đầy đủ thông tin bắt buộc.');
      return;
    }

    const payload = this.form.getRawValue();
    const request$ = this.selectedProductTopping
      ? this.productToppingService.updateProductTopping(this.selectedProductId, this.selectedProductTopping.id, {
        isDefault: payload.isDefault,
        maxQuantity: payload.maxQuantity,
        status: payload.status
      })
      : this.productToppingService.assignProductTopping(this.selectedProductId, {
        toppingId: payload.toppingId,
        isDefault: payload.isDefault,
        maxQuantity: payload.maxQuantity
      });

    this.saving = true;
    this.errorMessage = '';

    request$
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.drawerOpen = false;
          this.loadProductToppings(this.pageData.page);
        },
        error: () => {
          this.errorMessage = 'Không lưu được phần thêm cho sản phẩm. Vui lòng kiểm tra dữ liệu hoặc quyền thao tác.';
        }
      });
  }


  deleteProductTopping(item: ProductToppingSummary): void {
    if (!this.selectedProductId) { return; }

    this.confirmDialog.confirm({
      title: 'Xác nhận xóa phần thêm khỏi sản phẩm?',
      message: `Phần thêm ${item.toppingName} sẽ bị xóa vĩnh viễn khỏi sản phẩm và không thể hoàn tác.`,
      confirmText: 'Xóa vĩnh viễn',
      cancelText: 'Hủy',
      type: 'danger',
      affectedItems: [item.toppingName]
    }).subscribe((confirmed) => {
      if (!confirmed) return;

      this.loading = true;
      this.errorMessage = '';

      this.productToppingService.deleteProductTopping(this.selectedProductId, item.id)
        .pipe(finalize(() => (this.loading = false)))
        .subscribe({
          next: () => {
            const page = this.productToppings.length === 1 && this.pageData.page > 0 ? this.pageData.page - 1 : this.pageData.page;
            this.loadProductToppings(page);
          }
        });
    });
  }

  refresh(): void {
    this.selectedProductId ? this.loadProductToppings(this.pageData.page) : this.loadInitialData();
  }

  changePage(page: number): void {
    if (page < 0 || page >= this.pageData.totalPages || page === this.pageData.page || this.loading) { return; }
    this.loadProductToppings(page);
  }

  changePageSize(size: number): void {
    this.pageSize = Number(size) || 12;
    this.loadProductToppings(0);
  }

  trackProduct(_: number, product: ProductSummary): string { return product.id; }
  trackTopping(_: number, topping: Topping): string { return topping.id; }
  trackProductTopping(_: number, item: ProductToppingSummary): string { return item.id; }

  formatCurrency(value?: number): string {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value || 0);
  }

  private loadInitialData(): void {
    this.loadProducts();
    this.loadToppings();
  }

  private loadProducts(): void {
    this.productLoading = true;
    this.productService.getProductOptions()
      .pipe(finalize(() => (this.productLoading = false)))
      .subscribe({
        next: (products) => {
          this.products = products;
          this.selectedProductId = this.selectedProductId || this.products[0]?.id || '';
          if (this.selectedProductId) { this.loadProductToppings(0); }
        },
        error: () => {
          this.products = [];
          this.errorMessage = 'Không tải được danh sách sản phẩm.';
        }
      });
  }

  private loadToppings(): void {
    this.toppingLoading = true;
    this.toppingService.getActiveToppings()
      .pipe(finalize(() => (this.toppingLoading = false)))
      .subscribe({
        next: (toppings) => (this.toppings = toppings),
        error: () => {
          this.toppings = [];
          this.errorMessage = 'Không tải được danh sách phần thêm đang bán.';
        }
      });
  }

  private loadProductToppings(page = 0): void {
    if (!this.selectedProductId) {
      this.pageData = this.createEmptyPage(page);
      this.productToppings = [];
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.productToppingService.getProductToppings(this.selectedProductId, page, this.pageSize)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (pageResponse) => {
          this.pageData = pageResponse;
          this.productToppings = pageResponse.content || [];
        },
        error: () => {
          this.pageData = this.createEmptyPage(page);
          this.productToppings = [];
          this.errorMessage = 'Không tải được phần thêm đã gắn cho sản phẩm.';
        }
      });
  }

  private createEmptyPage(page = 0): PageResponse<ProductToppingSummary> {
    return { content: [], page, size: this.pageSize, totalElements: 0, totalPages: 0, first: page === 0, last: true };
  }
}
