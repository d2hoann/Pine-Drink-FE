import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ReportsPageComponent } from './pages/reports-page/reports-page.component';
import { ReportProcessesPageComponent } from './pages/report-processes-page/report-processes-page.component';

const routes: Routes = [
  { path: 'processes', component: ReportProcessesPageComponent },
  { path: '', component: ReportsPageComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ReportsRoutingModule {}
