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
/**
 * Component that hosts the emoji picker popup overlay and manages its positioning and lifecycle.
 */
export class EmojiPickerHostComponent {
  /**
   * Service that handles the overlay and interaction state for the emoji picker.
   */
  readonly pickerSvc = inject(EmojiPickerOverlayService);

  /**
   * Constructs the host component and schedules pre-warming of the picker resources.
   */
  constructor() {
    this.pickerSvc.scheduleWarm();
  }

  /**
   * Callback when an emoji is selected from the picker. Selects the emoji through the overlay service.
   * 
   * @param emoji The selected emoji character.
   */
  onEmojiSelected(emoji: string): void {
    this.pickerSvc.select(emoji);
  }

  /**
   * Host listener for window resize events. Closes the emoji picker overlay on window resize.
   */
  @HostListener('window:resize')
  onResize(): void {
    this.pickerSvc.close();
  }

  /**
   * Host listener for document scroll events. Closes the emoji picker overlay when the page is scrolled.
   */
  @HostListener('document:scroll')
  onScroll(): void {
    this.pickerSvc.close();
  }
}