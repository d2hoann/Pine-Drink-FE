import { NgModule } from '@angular/core';

import { SharedModule } from '../../shared/shared.module';
import { ReportsRoutingModule } from './reports-routing.module';
import { ReportsPageComponent } from './pages/reports-page/reports-page.component';
import { ReportProcessesPageComponent } from './pages/report-processes-page/report-processes-page.component';

@NgModule({
  declarations: [ReportsPageComponent, ReportProcessesPageComponent],
  imports: [SharedModule, ReportsRoutingModule]
})
export class ReportsModule {}
