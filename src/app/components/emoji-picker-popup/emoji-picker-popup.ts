import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { PickerModule } from '@ctrl/ngx-emoji-mart';
import { EmojiData } from '@ctrl/ngx-emoji-mart/ngx-emoji';
import { EmojiRecentService } from '../../services/emoji-recent.service';
import { EmojiPickerVariant } from '../../services/emoji-picker-overlay.service';

/**
 * Structure representing the emoji selection click event emitted by ngx-emoji-mart.
 */
interface EmojiClickEvent {
  /**
   * The partial emoji data containing information about the selected emoji.
   */
  emoji?: Partial<EmojiData>;
}

@Component({
  selector: 'app-emoji-picker-popup',
  standalone: true,
  imports: [PickerModule],
  templateUrl: './emoji-picker-popup.html',
  styleUrl: './emoji-picker-popup.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * A popup component wrapper for the ngx-emoji-mart picker, handling localization, custom styling, and tracking recently used emojis.
 */
export class EmojiPickerPopupComponent {
  /**
   * Service to manage and persist recently used emojis for user profiles.
   */
  private readonly emojiRecentSvc = inject(EmojiRecentService);

  /**
   * The unique ID of the currently logged-in user, used to track recent emojis.
   */
  readonly userId = input.required<string>();

  /**
   * The variant style/placement type of the emoji picker, defaulting to 'input'.
   */
  readonly variant = input<EmojiPickerVariant>('input');

  /**
   * Boolean flag determining if the picker popup should be right-aligned.
   */
  readonly alignRight = input(false);

  /**
   * The primary brand/highlight color used in the emoji picker.
   */
  readonly color = input('#444df2');

  /**
   * Output event emitter that triggers when an emoji is selected.
   */
  readonly emojiSelected = output<string>();

  /**
   * Custom inline styles applied to the emoji picker container.
   */
  readonly emojiPickerStyle = { width: '100%', maxWidth: '100%' };

  /**
   * Computed signal tracking the IDs of the user's recently selected emojis.
   */
  readonly recentEmojiIds = computed(() => this.emojiRecentSvc.getPickerRecentIds(this.userId()));

  /**
   * German localization translation dictionary for the emoji picker interface elements and categories.
   */
  readonly emojiPickerI18n = {
    search: 'Suchen', emojilist: 'Emoji-Liste', notfound: 'Keine Emojis gefunden', clear: 'Zuruecksetzen',
    categories: {
      search: 'Suchergebnisse', recent: 'Haeufig verwendet', people: 'Smileys & Personen',
      nature: 'Tiere & Natur', foods: 'Essen & Trinken', activity: 'Aktivitaeten',
      places: 'Reisen & Orte', objects: 'Objekte', symbols: 'Symbole', flags: 'Flaggen', custom: 'Benutzerdefiniert',
    },
    skintones: {
      1: 'Standard-Hautfarbe', 2: 'Helle Hautfarbe', 3: 'Mittelhelle Hautfarbe',
      4: 'Mittlere Hautfarbe', 5: 'Mitteldunkle Hautfarbe', 6: 'Dunkle Hautfarbe',
    },
  };

  /**
   * Handles click events on the emoji picker. Extracts the native character, records the choice in recent emojis history, and emits the selection.
   * 
   * @param event The click event payload containing emoji data.
   */
  handleEmojiClick(event: EmojiClickEvent): void {
    const native = event.emoji?.native;
    if (!native) return;
    this.emojiRecentSvc.recordRecentSelection(this.userId(), event.emoji ?? null);
    this.emojiSelected.emit(native);
  }
}