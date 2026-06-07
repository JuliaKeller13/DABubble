import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PickerModule } from '@ctrl/ngx-emoji-mart';
import { EmojiComponent } from '@ctrl/ngx-emoji-mart/ngx-emoji';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { authService } from '../../services/auth.service';
import { ThreadService } from '../../services/thread.service';
import { messageService } from '../../services/message.service';
import { MessageInputPopupHelper, PopupChannel, PopupUser } from './message-input-popup.helper';

interface MessageInputPart {
  type: 'text' | 'emoji' | 'newline';
  text?: string;
  unified?: string;
}

@Component({
  selector: 'app-message-input',
  imports: [CommonModule, FormsModule, PickerModule, EmojiComponent],
  templateUrl: './message-input.html',
  styleUrl: './message-input.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscapePressed()',
  },
})
export class MessageInputComponent implements OnDestroy {
  private readonly emojiRegex = /\p{Extended_Pictographic}/u;
  private readonly regionalFlagRegex = /^[\u{1F1E6}-\u{1F1FF}]{2}$/u;
  private _messageText = '';
  renderedScrollTop = 0;

  @Input() placeholder: string = 'Nachricht an #Entwicklerteam';
  @Input() disabled: boolean = false;
  @Output() sendMessage = new EventEmitter<string>();
  @Output() typing = new EventEmitter<boolean>();
  @ViewChild('messageTextarea') private messageTextarea?: ElementRef<HTMLTextAreaElement>;

  private channelSvc = inject(channelService);
  private userSvc = inject(userService);
  private authSvc = inject(authService);
  private threadSvc = inject(ThreadService);
  private messageSvc = inject(messageService);
  private elementRef = inject(ElementRef);

  readonly popup = new MessageInputPopupHelper(
    this.channelSvc, this.userSvc, this.authSvc, this.threadSvc, this.messageSvc,
    () => this.textareaElement,
    () => this.messageText,
    (val) => { this.messageText = val; },
    () => this.syncRenderedScroll(),
  );

  messageTextParts: MessageInputPart[] = [];

  get messageText(): string { return this._messageText; }
  set messageText(value: string) {
    this._messageText = value;
    this.messageTextParts = this.buildMessageTextParts(value);
  }

  readonly emojiSet = 'apple';
  showEmojiPicker = false;
  readonly emojiPickerStyle = { width: '100%', maxWidth: '100%' };
  readonly emojiPickerI18n = {
    search: 'Suchen', emojilist: 'Emoji-Liste', notfound: 'Keine Emojis gefunden', clear: 'Zuruecksetzen',
    categories: {
      search: 'Suchergebnisse', recent: 'Haeufig verwendet', people: 'Smileys & Personen',
      nature: 'Tiere & Natur', foods: 'Essen & Trinken', activity: 'Aktivitaeten',
      places: 'Reisen & Orte', objects: 'Objekte', symbols: 'Symbole', flags: 'Flaggen', custom: 'Benutzerdefiniert',
    },
    skintones: { 1: 'Standard-Hautfarbe', 2: 'Helle Hautfarbe', 3: 'Mittelhelle Hautfarbe', 4: 'Mittlere Hautfarbe', 5: 'Mitteldunkle Hautfarbe', 6: 'Dunkle Hautfarbe' },
  };

  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  private typingInterval: ReturnType<typeof setInterval> | null = null;
  private isCurrentlyTyping = false;

  // ── Delegatoren für Template-Bindungen ────────────────────────────────────
  get activePopup() { return this.popup.activePopup; }
  get popupUsers(): PopupUser[] { return this.popup.popupUsers; }
  get popupChannels(): PopupChannel[] { return this.popup.popupChannels; }
  get isLoading() { return this.popup.isLoading; }
  get isEmojiActive(): boolean { return this.showEmojiPicker; }
  get isMentionActive(): boolean { return this.popup.isMentionActive; }

  get currentUserId(): string { return this.authSvc.currentUser()?.id || ''; }
  isUserOnlineById(userId: string): boolean { return this.authSvc.onlineUserIds().has(userId); }

  private get textareaElement(): HTMLTextAreaElement | null {
    return this.messageTextarea?.nativeElement ?? null;
  }

  send(): void {
    if (!this.messageText.trim()) return;
    this.stopTyping();
    this.sendMessage.emit(this.messageText);
    this.messageText = '';
    this.renderedScrollTop = 0;
  }

  onInputChange(): void {
    if (!this.isCurrentlyTyping) {
      this.isCurrentlyTyping = true;
      this.typing.emit(true);
      this.startTypingHeartbeat();
    }
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => this.stopTyping(), 3000);
    this.popup.checkForTriggerChar();
    this.syncRenderedScroll();
  }

  onTextareaScroll(): void { this.syncRenderedScroll(); }

  private startTypingHeartbeat(): void {
    this.typingInterval = setInterval(() => this.typing.emit(true), 2000);
  }

  private stopTyping(): void {
    if (this.typingTimeout) { clearTimeout(this.typingTimeout); this.typingTimeout = null; }
    if (this.typingInterval) { clearInterval(this.typingInterval); this.typingInterval = null; }
    this.isCurrentlyTyping = false;
    this.typing.emit(false);
  }

  ngOnDestroy(): void {
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    if (this.typingInterval) clearInterval(this.typingInterval);
  }

  onEnterPressed(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (!keyboardEvent.shiftKey) { keyboardEvent.preventDefault(); this.send(); }
  }

  onMessageInputClick(): void { this.popup.closePopup(); }

  toggleEmoji(): void {
    const shouldOpen = !this.showEmojiPicker;
    this.popup.closePopup();
    this.showEmojiPicker = shouldOpen;
  }

  async toggleMention(): Promise<void> {
    this.showEmojiPicker = false;
    await this.popup.toggleMention();
  }

  addEmoji(event: { emoji?: { native?: string } }): void {
    const emoji = event.emoji?.native;
    if (!emoji) return;
    const textarea = this.textareaElement;
    if (!textarea) { this.messageText += emoji; return; }
    const startPos = textarea.selectionStart ?? this.messageText.length;
    const endPos = textarea.selectionEnd ?? startPos;
    this.messageText = this.messageText.substring(0, startPos) + emoji + this.messageText.substring(endPos);
    const newCursorPos = startPos + emoji.length;
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
      this.syncRenderedScroll();
    }, 0);
  }

  insertUserMention(user: PopupUser): void { this.popup.insertUserMention(user); }

  insertChannelMention(channel: PopupChannel): void { this.popup.insertMention(`#${channel.name}`); }
  insertMention(text: string): void { this.popup.insertMention(text); }

  onDocumentClick(event: MouseEvent): void {
    if (this.popup.activePopup === 'none' && !this.showEmojiPicker) return;
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.popup.closePopup();
      this.showEmojiPicker = false;
    }
  }

  onEscapePressed(): void {
    if (this.popup.activePopup !== 'none' || this.showEmojiPicker) {
      this.popup.closePopup();
      this.showEmojiPicker = false;
    }
  }

  private buildMessageTextParts(text: string): MessageInputPart[] {
    if (!text) return [];
    const parts: MessageInputPart[] = [];
    let buffer = '';
    for (const segment of this.splitIntoGraphemes(text)) {
      if (segment === '\n') {
        if (buffer) { parts.push({ type: 'text', text: buffer }); buffer = ''; }
        parts.push({ type: 'newline' });
        continue;
      }
      if (this.isEmojiSegment(segment)) {
        if (buffer) { parts.push({ type: 'text', text: buffer }); buffer = ''; }
        parts.push({ type: 'emoji', unified: this.toUnified(segment) });
        continue;
      }
      buffer += segment;
    }
    if (buffer) parts.push({ type: 'text', text: buffer });
    return parts;
  }

  private splitIntoGraphemes(text: string): string[] {
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return Array.from(segmenter.segment(text), ({ segment }) => segment);
    }
    return Array.from(text);
  }

  private isEmojiSegment(segment: string): boolean {
    return this.regionalFlagRegex.test(segment) || this.emojiRegex.test(segment);
  }

  private toUnified(emoji: string): string {
    return Array.from(emoji)
      .map((char) => char.codePointAt(0)?.toString(16).toUpperCase() ?? '')
      .filter(Boolean).join('-');
  }

  private syncRenderedScroll(): void {
    this.renderedScrollTop = this.textareaElement?.scrollTop ?? 0;
  }
}
