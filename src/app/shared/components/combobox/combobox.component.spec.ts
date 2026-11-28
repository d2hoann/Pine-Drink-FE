import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ComboboxComponent } from './combobox.component';
import { ComboboxOptionDirective } from './combobox-option.directive';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ComboboxComponent, ComboboxOptionDirective],
  template: `
    <app-combobox [formControl]="branch" label="Chi nhánh">
      <ng-template comboOption [value]="1" label="Hà Nội"></ng-template>
      <ng-template comboOption *ngFor="let option of branches" [value]="option.id"
        [label]="option.name" [keywords]="option.code" [disabled]="option.disabled"></ng-template>
    </app-combobox>
    <app-combobox [formControl]="scope" [multiple]="true" label="Phạm vi">
      <ng-template comboOption value="hn" label="Hà Nội"></ng-template>
      <ng-template comboOption value="dn" label="Đà Nẵng"></ng-template>
    </app-combobox>
  `
})
class ComboboxHost {
  readonly branch = new FormControl(1);
  readonly scope = new FormControl<string[]>(['hn'], { nonNullable: true });
  branches = [
    { id: 2, name: 'Đà Nẵng', code: 'CN02', disabled: false },
    { id: 3, name: 'Đà Lạt', code: 'CN03', disabled: true }
  ];
}

describe('ComboboxComponent', () => {
  let fixture: ComponentFixture<ComboboxHost>;
  let root: HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(ComboboxHost);
    fixture.detectChanges();
    root = fixture.nativeElement;
  });

  function field(label: string): HTMLInputElement {
    return root.querySelector<HTMLInputElement>('[role=combobox][aria-label="' + label + '"]')!;
  }

  function type(input: HTMLInputElement, text: string): void {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function key(input: HTMLInputElement, value: string): void {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
    fixture.detectChanges();
  }

  function options(): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>('[role=option]'));
  }

  it('finds Vietnamese names and codes locally and writes the typed value only after selection', () => {
    const input = field('Chi nhánh');
    expect(input.value).toBe('Hà Nội');
    type(input, 'cn02 da nang');
    expect(input.value).toBe('cn02 da nang');
    expect(options().length).toBe(1);
    expect(options()[0].textContent).toContain('Đà Nẵng');
    expect(fixture.componentInstance.branch.value).toBe(1);
    key(input, 'Enter');
    expect(fixture.componentInstance.branch.value).toBe(2);
    expect(input.value).toBe('Đà Nẵng');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('skips disabled choices and restores the selected label when the search is canceled', () => {
    const input = field('Chi nhánh');
    type(input, 'cn03');
    expect(options()[0].getAttribute('aria-disabled')).toBe('true');
    options()[0].click();
    key(input, 'Enter');
    expect(fixture.componentInstance.branch.value).toBe(1);
    key(input, 'Escape');
    expect(input.value).toBe('Hà Nội');
    fixture.componentInstance.branch.disable();
    fixture.detectChanges();
    expect(input.disabled).toBeTrue();
  });

  it('adds and removes selections in a multiple combobox', () => {
    const input = field('Phạm vi');
    input.click();
    fixture.detectChanges();
    options()[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.scope.value).toEqual(['hn', 'dn']);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    options()[0].click();
    key(input, 'Escape');
    expect(fixture.componentInstance.scope.value).toEqual(['dn']);
    expect(input.value).toBe('Đà Nẵng');
  });
});
