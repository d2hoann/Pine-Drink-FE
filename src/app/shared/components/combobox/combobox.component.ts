import {
  Component, ContentChildren, ElementRef, EventEmitter, forwardRef, HostListener, Input,
  OnDestroy, Output, QueryList, ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { normalizeSearchText } from '../../utils/normalize-search-text';
import { ComboboxOptionDirective } from './combobox-option.directive';

type PopupElement = HTMLElement & { showPopover?: () => void; hidePopover?: () => void };

let nextId = 0;

@Component({
  selector: 'app-combobox',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './combobox.component.html',
  styleUrls: ['./combobox.component.scss'],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => ComboboxComponent),
    multi: true
  }]
})
export class ComboboxComponent implements ControlValueAccessor, OnDestroy {
  @ContentChildren(ComboboxOptionDirective, { descendants: true }) options!: QueryList<ComboboxOptionDirective>;
  @ViewChild('field', { static: true }) private field!: ElementRef<HTMLInputElement>;
  @ViewChild('popup', { static: true }) private popup!: ElementRef<PopupElement>;

  @Input() inputId = 'pine-combobox-' + ++nextId;
  @Input() label = 'Chọn giá trị';
  @Input() placeholder = 'Chọn giá trị';
  @Input() multiple = false;
  @Input() required: boolean | '' = false;
  @Input() set disabled(value: boolean) {
    this.inputDisabled = value;
    if (value) this.close();
  }
  @Input() set interactionDisabled(value: boolean) { this.disabled = value; }

  @Output() selectionChange = new EventEmitter<void>();

  open = false;
  query = '';
  highlighted?: ComboboxOptionDirective;
  value: unknown;

  private inputDisabled = false;
  private formDisabled = false;
  private onChange: (value: unknown) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  ngOnDestroy(): void { this.close(); }

  get isDisabled(): boolean { return this.inputDisabled || this.formDisabled; }
  get listId(): string { return this.inputId + '-options'; }

  get displayValue(): string {
    const options = this.options?.toArray() ?? [];
    if (!this.multiple) return options.find(option => this.isSelected(option))?.label ?? '';
    const selected = options.filter(option => this.isSelected(option));
    return selected.length <= 2 ? selected.map(option => option.label).join(', ') : 'Đã chọn ' + selected.length + ' mục';
  }

  get results(): ComboboxOptionDirective[] {
    const query = normalizeSearchText(this.query.trim());
    const terms = query ? query.split(/\s+/) : [];
    return (this.options?.toArray() ?? []).filter(option => {
      if (option.disabled && (option.value == null || option.value === '')) return false;
      if (!terms.length) return true;
      const searchableLabel = normalizeSearchText(option.label + ' ' + option.keywords);
      return terms.every(term => searchableLabel.includes(term));
    });
  }

  get activeId(): string | null {
    const index = this.open && this.highlighted ? this.results.indexOf(this.highlighted) : -1;
    return index < 0 ? null : this.optionId(index);
  }

  writeValue(value: unknown): void {
    this.value = value;
    if (!this.open && this.field) this.field.nativeElement.value = this.displayValue;
  }
  registerOnChange(callback: (value: unknown) => void): void { this.onChange = callback; }
  registerOnTouched(callback: () => void): void { this.onTouched = callback; }
  setDisabledState(disabled: boolean): void {
    this.formDisabled = disabled;
    if (disabled) this.close();
  }

  isSelected(option: ComboboxOptionDirective): boolean {
    return this.multiple
      ? Array.isArray(this.value) && this.value.includes(option.value)
      : Object.is(this.value, option.value);
  }

  optionId(index: number): string { return this.listId + '-' + index; }

  begin(): void {
    if (this.isDisabled || this.open) return;
    this.open = true;
    this.query = '';
    this.highlighted = this.results.find(option => !option.disabled && this.isSelected(option));
    const popup = this.popup.nativeElement;
    popup.hidden = false;
    // Đưa danh sách lên lớp nổi của trình duyệt để tránh bị cắt trong vùng cuộn hoặc hộp thoại.
    popup.showPopover?.();
    this.position();
    document.addEventListener('scroll', this.reposition, true);
    this.field.nativeElement.focus();
    this.field.nativeElement.value = '';
  }

  toggle(): void {
    if (this.open) this.close();
    else this.begin();
  }

  search(event: Event): void {
    const input = event.target as HTMLInputElement;
    const query = input.value;
    // Giữ ký tự vừa gõ vì thao tác mở danh sách sẽ xóa nội dung đang hiển thị.
    this.begin();
    this.query = input.value = query;
    this.highlighted = this.results.find(option => !option.disabled);
  }

  selectText(): void {
    if (!this.open) this.field.nativeElement.select();
  }

  select(option: ComboboxOptionDirective): void {
    if (this.isDisabled || option.disabled) return;
    if (this.multiple) {
      const selected: unknown[] = Array.isArray(this.value) ? this.value : [];
      this.value = selected.includes(option.value)
        ? selected.filter(value => value !== option.value)
        : [...selected, option.value];
    } else if (Object.is(this.value, option.value)) {
      this.close();
      return;
    } else {
      this.value = option.value;
      this.close();
    }
    this.onChange(this.value);
    this.onTouched();
    this.selectionChange.emit();
  }

  onBlur(): void {
    this.close();
    this.onTouched();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.isComposing) return;
    if (event.key === 'Escape' && this.open) {
      event.preventDefault();
      // Giữ Escape trong ô chọn để hộp thoại cha vẫn mở.
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!this.open) this.begin();
      else if (this.highlighted && this.results.includes(this.highlighted)) this.select(this.highlighted);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const wasOpen = this.open;
    this.begin();
    const enabled = this.results.filter(option => !option.disabled);
    const current = this.highlighted && wasOpen ? enabled.indexOf(this.highlighted) : -1;
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const next = current < 0 ? (direction === 1 ? 0 : enabled.length - 1) : current + direction;
    this.highlighted = enabled[Math.max(0, Math.min(next, enabled.length - 1))];
    if (this.activeId) {
      const element = this.popup.nativeElement.querySelector('[id="' + this.activeId + '"]');
      element?.scrollIntoView({ block: 'nearest' });
    }
  }

  @HostListener('document:pointerdown', ['$event.target'])
  closeOutside(target: Node): void {
    if (this.open && !this.host.nativeElement.contains(target)) this.close();
  }

  @HostListener('window:resize')
  position(): void {
    if (!this.open) return;
    const rect = this.host.nativeElement.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 120), window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const below = window.innerHeight - rect.bottom;
    const above = rect.top;
    // Mở phía trên khi dưới ô chọn thiếu chỗ và phía trên rộng hơn.
    const showAbove = below < 240 && above > below;
    const popup = this.popup.nativeElement;
    popup.style.left = left + 'px';
    popup.style.width = width + 'px';
    popup.style.maxHeight = Math.max(48, Math.min(288, (showAbove ? above : below) - 10)) + 'px';
    popup.style.top = showAbove ? 'auto' : rect.bottom + 4 + 'px';
    popup.style.bottom = showAbove ? window.innerHeight - rect.top + 4 + 'px' : 'auto';
  }

  private readonly reposition = (event: Event): void => {
    if (!this.popup.nativeElement.contains(event.target as Node)) this.position();
  };

  private close(): void {
    if (!this.open) return;
    this.open = false;
    this.query = '';
    this.highlighted = undefined;
    document.removeEventListener('scroll', this.reposition, true);
    const popup = this.popup.nativeElement;
    popup.hidePopover?.();
    popup.hidden = true;
    this.field.nativeElement.value = this.displayValue;
  }
}
