import { Directive, Input } from '@angular/core';

@Directive({ selector: 'ng-template[comboOption]', standalone: true })
export class ComboboxOptionDirective {
  @Input() value: unknown;
  @Input() label = '';
  @Input() keywords = '';
  @Input() disabled = false;
}
