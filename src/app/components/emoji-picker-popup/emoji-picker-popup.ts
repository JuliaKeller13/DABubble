import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { PickerModule } from '@ctrl/ngx-emoji-mart';
import { EmojiData } from '@ctrl/ngx-emoji-mart/ngx-emoji';
import { EmojiRecentService } from '../../services/emoji-recent.service';
import { EmojiPickerVariant } from '../../services/emoji-picker-overlay.service';

interface EmojiClickEvent {
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
export class EmojiPickerPopupComponent {
  private readonly emojiRecentSvc = inject(EmojiRecentService);

  readonly userId = input.required<string>();
  readonly variant = input<EmojiPickerVariant>('input');
  readonly alignRight = input(false);
  readonly color = input('#444df2');
  readonly emojiSelected = output<string>();

  readonly emojiPickerStyle = { width: '100%', maxWidth: '100%' };
  readonly recentEmojiIds = computed(() => this.emojiRecentSvc.getPickerRecentIds(this.userId()));
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

  handleEmojiClick(event: EmojiClickEvent): void {
    const native = event.emoji?.native;
    if (!native) return;
    this.emojiRecentSvc.recordRecentSelection(this.userId(), event.emoji ?? null);
    this.emojiSelected.emit(native);
  }
}