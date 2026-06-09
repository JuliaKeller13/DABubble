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
import { EmojiComponent } from '@ctrl/ngx-emoji-mart/ngx-emoji';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { authService } from '../../services/auth.service';
import { ThreadService } from '../../services/thread.service';
import { messageService } from '../../services/message.service';
import { EmojiPickerOverlayService } from '../../services/emoji-picker-overlay.service';
import { MessageInputPopupHelper, PopupChannel, PopupUser } from './message-input-popup.helper';

interface MessageInputPart {
  type: 'text' | 'emoji' | 'newline';
  text?: string;
  unified?: string;
}

@Component({
  selector: 'app-message-input',
  imports: [CommonModule, FormsModule, EmojiComponent],
  templateUrl: './message-input.html',
  styleUrl: './message-input.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscapePressed()',
  },
})
export class MessageInputComponent implements OnDestroy {
  private static nextPickerId = 0;
  private readonly emojiRegex = /\p{Extended_Pictographic}/u;
  private readonly regionalFlagRegex = /^[\u{1F1E6}-\u{1F1FF}]{2}$/u;
  private _messageText = '';
  renderedScrollTop = 0;
  readonly pickerOwner = `message-input:${MessageInputComponent.nextPickerId++}`;

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
  private pickerSvc = inject(EmojiPickerOverlayService);
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

  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  private typingInterval: ReturnType<typeof setInterval> | null = null;
  private isCurrentlyTyping = false;

  get activePopup() { return this.popup.activePopup; }
  get popupUsers(): PopupUser[] { return this.popup.popupUsers; }
  get popupChannels(): PopupChannel[] { return this.popup.popupChannels; }
  get isLoading() { return this.popup.isLoading; }
  get isEmojiActive(): boolean { return this.pickerSvc.isOpen(this.pickerOwner); }
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

  onMessageInputClick(): void {
    this.popup.closePopup();
    this.pickerSvc.close(this.pickerOwner);
  }

  toggleEmoji(trigger: HTMLElement): void {
    this.popup.closePopup();
    this.pickerSvc.toggle(trigger, this.getPickerConfig());
  }

  async toggleMention(): Promise<void> {
    this.pickerSvc.close(this.pickerOwner);
    await this.popup.toggleMention();
  }

  onEmojiSelected(emoji: string): void {
    if (!emoji) return;
    const textarea = this.textareaElement;
    if (!textarea) { this.messageText += emoji; return; }
    this.insertEmojiAtCursor(textarea, emoji);
  }

  private insertEmojiAtCursor(textarea: HTMLTextAreaElement, emoji: string): void {
    const start = textarea.selectionStart ?? this.messageText.length;
    const end = textarea.selectionEnd ?? start;
    const before = this.messageText.substring(0, start);
    const after = this.messageText.substring(end);
    this.messageText = `${before}${emoji}${after}`;
    setTimeout(() => this.restoreCursor(textarea, start + emoji.length), 0);
  }

  private restoreCursor(textarea: HTMLTextAreaElement, position: number): void {
    textarea.focus();
    textarea.setSelectionRange(position, position);
    this.syncRenderedScroll();
  }

  insertUserMention(user: PopupUser): void { this.popup.insertUserMention(user); }

  insertChannelMention(channel: PopupChannel): void { this.popup.insertMention(`#${channel.name}`); }
  insertMention(text: string): void { this.popup.insertMention(text); }

  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target?.closest?.('[data-emoji-picker-host]')) {
      return;
    }
    if (this.popup.activePopup === 'none' && !this.isEmojiActive) return;
    if (!this.elementRef.nativeElement.contains(target)) {
      this.popup.closePopup();
      this.pickerSvc.close(this.pickerOwner);
    }
  }

  onEscapePressed(): void {
    if (this.popup.activePopup !== 'none' || this.isEmojiActive) {
      this.popup.closePopup();
      this.pickerSvc.close(this.pickerOwner);
    }
  }

  private getPickerConfig() {
    return { owner: this.pickerOwner, userId: this.currentUserId, variant: 'input' as const, alignRight: false, color: '#444df2', onSelect: (emoji: string) => this.onEmojiSelected(emoji) };
  }

  private buildMessageTextParts(text: string): MessageInputPart[] {
    if (!text) return [];
    const parts: MessageInputPart[] = [];
    let buffer = '';
    for (const seg of this.splitIntoGraphemes(text)) {
      if (seg !== '\n' && !this.isEmojiSegment(seg)) { buffer += seg; continue; }
      if (buffer) parts.push({ type: 'text', text: buffer });
      buffer = '';
      parts.push(seg === '\n' ? { type: 'newline' } : { type: 'emoji', unified: this.toUnified(seg) });
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
