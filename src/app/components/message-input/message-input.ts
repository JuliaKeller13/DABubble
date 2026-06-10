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

/**
 * Represents a segment of the message text to be rendered visually, differentiating text, native emojis, and newlines.
 */
interface MessageInputPart {
  /** The type of segment. */
  type: 'text' | 'emoji' | 'newline';
  /** Plain text string if type is 'text'. */
  text?: string;
  /** Hexadecimal unicode identifier if type is 'emoji'. */
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
/**
 * Component for message typing area including autocomplete popups for user/channel mentions and emoji picker.
 */
export class MessageInputComponent implements OnDestroy {
  /** Counter used to generate unique IDs for emoji picker overlays. */
  private static nextPickerId = 0;
  /** Regular expression for matching emojis. */
  private readonly emojiRegex = /\p{Extended_Pictographic}/u;
  /** Regular expression for matching regional flag emojis. */
  private readonly regionalFlagRegex = /^[\u{1F1E6}-\u{1F1FF}]{2}$/u;
  /** Backing property for the raw text content of the message input. */
  private _messageText = '';
  /** Scroll position of the fake backdrop overlay to match textarea scroll. */
  renderedScrollTop = 0;
  /** Unique scope identifier for this input's emoji picker. */
  readonly pickerOwner = `message-input:${MessageInputComponent.nextPickerId++}`;

  /** The placeholder string displayed in the input field. */
  @Input() placeholder: string = 'Nachricht an #Entwicklerteam';
  /** Whether the input is disabled. */
  @Input() disabled: boolean = false;
  /** Emits when a message is successfully sent. */
  @Output() sendMessage = new EventEmitter<string>();
  /** Emits typing status changes. */
  @Output() typing = new EventEmitter<boolean>();
  /** Textarea element reference. */
  @ViewChild('messageTextarea') private messageTextarea?: ElementRef<HTMLTextAreaElement>;

  /** Injected ChannelService. */
  private channelSvc = inject(channelService);
  /** Injected UserService. */
  private userSvc = inject(userService);
  /** Injected AuthService. */
  private authSvc = inject(authService);
  /** Injected ThreadService. */
  private threadSvc = inject(ThreadService);
  /** Injected MessageService. */
  private messageSvc = inject(messageService);
  /** Injected EmojiPickerOverlayService. */
  private pickerSvc = inject(EmojiPickerOverlayService);
  /** Injected ElementRef. */
  private elementRef = inject(ElementRef);

  /** Helper managing mention popups for users/channels. */
  readonly popup = new MessageInputPopupHelper(
    this.channelSvc, this.userSvc, this.authSvc, this.threadSvc, this.messageSvc,
    () => this.textareaElement,
    () => this.messageText,
    (val) => { this.messageText = val; },
    () => this.syncRenderedScroll(),
  );

  /** Parsed segments of input text. */
  messageTextParts: MessageInputPart[] = [];

  /** Getter for raw input message text. */
  get messageText(): string { return this._messageText; }
  /** Setter for raw input message text, also triggering visual parsing. */
  set messageText(value: string) {
    this._messageText = value;
    this.messageTextParts = this.buildMessageTextParts(value);
  }

  /** The emoji set to display. */
  readonly emojiSet = 'apple';

  /** Typing inactivity timeout identifier. */
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Typing heartbeat interval identifier. */
  private typingInterval: ReturnType<typeof setInterval> | null = null;
  /** Internal flag indicating whether user is actively typing. */
  private isCurrentlyTyping = false;

  /** Active popup identifier ('none', 'users', or 'channels'). */
  get activePopup() { return this.popup.activePopup; }
  /** Matching users list in the popup dropdown. */
  get popupUsers(): PopupUser[] { return this.popup.popupUsers; }
  /** Matching channels list in the popup dropdown. */
  get popupChannels(): PopupChannel[] { return this.popup.popupChannels; }
  /** Whether autocomplete suggestions are loading. */
  get isLoading() { return this.popup.isLoading; }
  /** Whether the emoji picker overlay is visible. */
  get isEmojiActive(): boolean { return this.pickerSvc.isOpen(this.pickerOwner); }
  /** Whether a mention popup is active. */
  get isMentionActive(): boolean { return this.popup.isMentionActive; }

  /** Current logged in user ID. */
  get currentUserId(): string { return this.authSvc.currentUser()?.id || ''; }

  /**
   * Checks if user is online.
   * @param userId - User ID.
   */
  isUserOnlineById(userId: string): boolean { return this.authSvc.onlineUserIds().has(userId); }

  /** Private getter returning native HTML textarea element. */
  private get textareaElement(): HTMLTextAreaElement | null {
    return this.messageTextarea?.nativeElement ?? null;
  }

  /**
   * Emits the message text if not empty, stops typing indicator, and clears input.
   */
  send(): void {
    if (!this.messageText.trim()) return;
    this.stopTyping();
    this.sendMessage.emit(this.messageText);
    this.messageText = '';
    this.renderedScrollTop = 0;
  }

  /**
   * Triggers typing indicators and checks for trigger characters ('@', '#') on input.
   */
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

  /**
   * Textarea scroll event listener to synchronize visual text overlay position.
   */
  onTextareaScroll(): void { this.syncRenderedScroll(); }

  /**
   * Initiates periodic typing updates to keep typing status active.
   */
  private startTypingHeartbeat(): void {
    this.typingInterval = setInterval(() => this.typing.emit(true), 2000);
  }

  /**
   * Stops active typing status and emits typing false state.
   */
  private stopTyping(): void {
    if (this.typingTimeout) { clearTimeout(this.typingTimeout); this.typingTimeout = null; }
    if (this.typingInterval) { clearInterval(this.typingInterval); this.typingInterval = null; }
    this.isCurrentlyTyping = false;
    this.typing.emit(false);
  }

  /**
   * Cleanup method on component destruction.
   */
  ngOnDestroy(): void {
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    if (this.typingInterval) clearInterval(this.typingInterval);
  }

  /**
   * Handles keyboard enter event.
   * @param event - Keyboard event.
   */
  onEnterPressed(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (!keyboardEvent.shiftKey) { keyboardEvent.preventDefault(); this.send(); }
  }

  /**
   * Handles click inside input area, closing active popups.
   */
  onMessageInputClick(): void {
    this.popup.closePopup();
    this.pickerSvc.close(this.pickerOwner);
  }

  /**
   * Toggles the emoji picker overlay.
   * @param trigger - The anchoring HTML trigger element.
   */
  toggleEmoji(trigger: HTMLElement): void {
    this.popup.closePopup();
    this.pickerSvc.toggle(trigger, this.getPickerConfig());
  }

  /**
   * Toggles mention dropdown overlay.
   */
  async toggleMention(): Promise<void> {
    this.pickerSvc.close(this.pickerOwner);
    await this.popup.toggleMention();
  }

  /**
   * Event handler when an emoji is selected from picker.
   * @param emoji - Native emoji character.
   */
  onEmojiSelected(emoji: string): void {
    if (!emoji) return;
    const textarea = this.textareaElement;
    if (!textarea) { this.messageText += emoji; return; }
    this.insertEmojiAtCursor(textarea, emoji);
  }

  /**
   * Inserts an emoji string at the current cursor selection point of the textarea.
   * @param textarea - Textarea HTML element.
   * @param emoji - Native emoji character.
   */
  private insertEmojiAtCursor(textarea: HTMLTextAreaElement, emoji: string): void {
    const start = textarea.selectionStart ?? this.messageText.length;
    const end = textarea.selectionEnd ?? start;
    const before = this.messageText.substring(0, start);
    const after = this.messageText.substring(end);
    this.messageText = `${before}${emoji}${after}`;
    setTimeout(() => this.restoreCursor(textarea, start + emoji.length), 0);
  }

  /**
   * Restores focus and cursor position in the textarea.
   * @param textarea - Textarea HTML element.
   * @param position - The new cursor index.
   */
  private restoreCursor(textarea: HTMLTextAreaElement, position: number): void {
    textarea.focus();
    textarea.setSelectionRange(position, position);
    this.syncRenderedScroll();
  }

  /**
   * Inserts user mention markup.
   * @param user - Target user.
   */
  insertUserMention(user: PopupUser): void { this.popup.insertUserMention(user); }

  /**
   * Inserts channel mention markup.
   * @param channel - Target channel.
   */
  insertChannelMention(channel: PopupChannel): void { this.popup.insertMention(`#${channel.name}`); }

  /**
   * Inserts mention text.
   * @param text - Plain mention text.
   */
  insertMention(text: string): void { this.popup.insertMention(text); }

  /**
   * Document click listener to close overlays on clicking outside.
   * @param event - Mouse click event.
   */
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

  /**
   * Handles escape keydown to close any active popups.
   */
  onEscapePressed(): void {
    if (this.popup.activePopup !== 'none' || this.isEmojiActive) {
      this.popup.closePopup();
      this.pickerSvc.close(this.pickerOwner);
    }
  }

  /**
   * Gets emoji picker popup config.
   */
  private getPickerConfig() {
    return { owner: this.pickerOwner, userId: this.currentUserId, variant: 'input' as const, alignRight: false, color: '#444df2', onSelect: (emoji: string) => this.onEmojiSelected(emoji) };
  }

  /**
   * Splits input text into visual segments of plain text, native emojis, and newlines.
   * @param text - Input text.
   */
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

  /**
   * Splits string into grapheme blocks.
   * @param text - String.
   */
  private splitIntoGraphemes(text: string): string[] {
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return Array.from(segmenter.segment(text), ({ segment }) => segment);
    }
    return Array.from(text);
  }

  /**
   * Checks if grapheme is emoji.
   * @param segment - Grapheme segment.
   */
  private isEmojiSegment(segment: string): boolean {
    return this.regionalFlagRegex.test(segment) || this.emojiRegex.test(segment);
  }

  /**
   * Converts emoji to unified hex format string.
   * @param emoji - Native emoji character.
   */
  private toUnified(emoji: string): string {
    return Array.from(emoji)
      .map((char) => char.codePointAt(0)?.toString(16).toUpperCase() ?? '')
      .filter(Boolean).join('-');
  }

  /**
   * Synchronizes visual backdrop overlay scroll position.
   */
  private syncRenderedScroll(): void {
    this.renderedScrollTop = this.textareaElement?.scrollTop ?? 0;
  }
}
