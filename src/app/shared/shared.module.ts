import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { AdminPaginationComponent } from './components/admin-pagination/admin-pagination.component';
import { EmptyStateComponent } from './components/empty-state/empty-state.component';
import { GlobalLoadingComponent } from './components/global-loading/global-loading.component';
import { PageHeaderComponent } from './components/page-header/page-header.component';
import { ToastContainerComponent } from './components/toast-container/toast-container.component';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';
import { MapPickerComponent } from '../features/client/pages/address-form/map-picker.component';
import { BusinessLabelPipe } from './pipes/business-label.pipe';
import { ComboboxComponent } from './components/combobox/combobox.component';
import { ComboboxOptionDirective } from './components/combobox/combobox-option.directive';

@NgModule({
  declarations: [
    GlobalLoadingComponent,
    ToastContainerComponent,
    PageHeaderComponent,
    EmptyStateComponent,
    AdminPaginationComponent,
    MapPickerComponent,
    ConfirmDialogComponent
  ],
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, RouterModule, TranslateModule,
    BusinessLabelPipe, ComboboxComponent, ComboboxOptionDirective
  ],
  exports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    GlobalLoadingComponent,
    ToastContainerComponent,
    PageHeaderComponent,
    EmptyStateComponent,
    AdminPaginationComponent,
    MapPickerComponent,
    ConfirmDialogComponent,
    BusinessLabelPipe,
    ComboboxComponent,
    ComboboxOptionDirective
  ]
})
export class SharedModule {}
