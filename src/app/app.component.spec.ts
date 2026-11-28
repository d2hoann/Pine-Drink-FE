import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { AuthService } from './core/services/auth.service';
import { SharedModule } from './shared/shared.module';

describe('AppComponent', () => {
  const useLanguage = jasmine.createSpy('useLanguage');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule, SharedModule],
      declarations: [AppComponent],
      providers: [
        { provide: TranslateService, useValue: { use: useLanguage } },
        { provide: AuthService, useValue: { bootstrapCurrentUser: () => of(null) } }
      ]
    }).compileComponents();
  });

  it('starts the whole interface in Vietnamese', () => {
    TestBed.createComponent(AppComponent);
    expect(useLanguage).toHaveBeenCalledOnceWith('vi');
  });
});
