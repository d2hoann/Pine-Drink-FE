import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  constructor(
    translate: TranslateService,
    private authService: AuthService
  ) {
    translate.use('vi');
    this.authService.bootstrapCurrentUser().subscribe();
  }
}
