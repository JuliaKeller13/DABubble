import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmojiPickerPopupComponent } from '../emoji-picker-popup/emoji-picker-popup';
import { EmojiPickerOverlayService } from '../../services/emoji-picker-overlay.service';

@Component({
  selector: 'app-emoji-picker-host',
  standalone: true,
  imports: [CommonModule, EmojiPickerPopupComponent],
  templateUrl: './emoji-picker-host.html',
  styleUrl: './emoji-picker-host.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmojiPickerHostComponent {
  readonly pickerSvc = inject(EmojiPickerOverlayService);

  constructor() {
    this.pickerSvc.scheduleWarm();
  }

  onEmojiSelected(emoji: string): void {
    this.pickerSvc.select(emoji);
  }

  @HostListener('window:resize')
  onResize(): void {
    this.pickerSvc.close();
  }

  @HostListener('document:scroll')
  onScroll(): void {
    this.pickerSvc.close();
  }
}