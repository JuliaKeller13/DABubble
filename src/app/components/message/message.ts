import { Component, Input, Output, EventEmitter, inject, ElementRef, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EmojiComponent, EmojiService } from '@ctrl/ngx-emoji-mart/ngx-emoji';
import { Message } from '../../interfaces/message.interface';
import { messageService } from '../../services/message.service';
import { ProfileDialogService } from '../../services/profile-dialog.service';
import { ToastService } from '../../services/toast.service';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { ThreadService } from '../../services/thread.service';
import { User } from '../../interfaces/user.interface';
import { EmojiRecentService } from '../../services/emoji-recent.service';
import { EmojiPickerOverlayService } from '../../services/emoji-picker-overlay.service';

/**
 * Represents a parsed token of a message content (text, channel link, or user mention).
 */
interface MessageToken {
  /** The token type. */
  type: 'text' | 'channel' | 'mention';
  /** The text representation of the token. */
  text: string;
  /** Optional channel ID associated with the token. */
  channelId?: string;
  /** Optional user ID associated with the token. */
  userId?: string;
  /** Optional text parts for detailed emoji parsing. */
  parts?: MessageTextPart[];
}

/**
 * Represents a sub-part of a text token, separating plain text from native emojis.
 */
interface MessageTextPart {
  /** The part type ('text' or 'emoji'). */
  type: 'text' | 'emoji';
  /** The text content if type is 'text'. */
  text?: string;
  /** The unified unicode identifier if type is 'emoji'. */
  unified?: string;
}

/**
 * Represents an aggregated reaction item for displaying under a message.
 */
interface ReactionListItem {
  /** The native emoji character. */
  emoji: string;
  /** The number of users who reacted with this emoji. */
  count: number;
  /** Whether the current user reacted with this emoji. */
  userReacted: boolean;
  /** The IDs of users who reacted with this emoji. */
  userIds: string[];
  /** Names of reacting users formatted for a tooltip. */
  tooltipNames: string;
  /** The action label formatted for a tooltip (e.g. "hat reagiert" or "haben reagiert"). */
  tooltipAction: string;
}

@Component({
  selector: 'app-message',
  standalone: true,
  imports: [CommonModule, FormsModule, EmojiComponent],
  templateUrl: './message.html',
  styleUrl: './message.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(mouseleave)': 'onMouseLeave()',
  },
})
/**
 * Component representing a single message, including its sender, content parsing (mentions, channel links, emojis), and reactions.
 */
export class MessageComponent implements OnInit {
  /** Counter used to generate unique IDs for emoji picker overlays. */
  private static nextPickerId = 0;
  /** Promise resolving to all users, cached to prevent multiple database queries. */
  private static allUsersPromise: Promise<User[]> | null = null;
  /** Inner storage for the message input. */
  private _message!: Message;
  /** Regular expression for matching emojis. */
  private readonly emojiRegex = /\p{Extended_Pictographic}/u;
  /** Regular expression for matching regional flag emojis. */
  private readonly regionalFlagRegex = /^[\u{1F1E6}-\u{1F1FF}]{2}$/u;
  /** The local order of reactions to prevent layout changes. */
  private reactionOrder: string[] = [];
  /** Unique scope identifier for this component's emoji picker. */
  private readonly pickerScope = `message:${MessageComponent.nextPickerId++}`;

  /**
   * Sets the message object and triggers parsing.
   */
  @Input({ required: true }) set message(val: Message) {
    this._message = val;
    this.syncReactionOrder();
    this.parseMessageContent();
  }
  get message(): Message {
    return this._message;
  }

  /**
   * Checks if this message is highlighted (e.g. matched by search).
   */
  get isHighlighted(): boolean {
    return this.message?.id ? this.message.id === this.messageSvc.searchTargetMessageId : false;
  }

  /** The currently logged-in user's ID. */
  @Input({ required: true }) currentUserId!: string;
  /** Whether this message is displayed inside a thread view. */
  @Input() isThreadMessage = false;

  /** Event emitted when thread button is clicked. */
  @Output() threadClick = new EventEmitter<Message>();
  /** Event emitted when edit button is clicked. */
  @Output() editClick = new EventEmitter<Message>();
  /** Event emitted when message deletion is requested. */
  @Output() delete = new EventEmitter<string>();

  /** Injected MessageService. */
  private messageSvc = inject(messageService);
  /** Injected ElementRef. */
  private elementRef = inject(ElementRef);
  /** Injected ProfileDialogService. */
  private profileDialogSvc = inject(ProfileDialogService);
  /** Injected ToastService. */
  private toastSvc = inject(ToastService);
  /** Injected ChannelService. */
  private channelSvc = inject(channelService);
  /** Injected UserService. */
  private userSvc = inject(userService);
  /** Injected ThreadService. */
  private threadSvc = inject(ThreadService);
  /** Injected EmojiRecentService. */
  private emojiRecentSvc = inject(EmojiRecentService);
  /** Injected EmojiService for resolving native emojis to emoji-mart data. */
  private emojiSvc = inject(EmojiService);
  /** Injected EmojiPickerOverlayService. */
  private pickerSvc = inject(EmojiPickerOverlayService);
  /** Injected ChangeDetectorRef. */
  private cdr = inject(ChangeDetectorRef);
  /** Injected Router. */
  private router = inject(Router);

  /** Whether the message more options menu is open. */
  showMoreMenu = false;
  /** Whether the message is currently in edit mode. */
  isEditing = false;
  /** Editable text content in the message edit textarea. */
  editContent = '';

  /** Shared cache of all user profiles in the application. */
  private static allUsers: User[] = [];
  /** Parsed tokens of the message content. */
  tokens: MessageToken[] = [];
  
  /**
   * Toggles the message options popup menu.
   */
  toggleMoreOptions() {
    const shouldOpen = !this.showMoreMenu;
    this.closeTransientPopups();
    this.showMoreMenu = shouldOpen;
  }

  /**
   * Toggles the reaction emoji picker popup.
   * @param kind - Trigger source ('footer' or 'hover').
   * @param trigger - The HTMLElement anchoring the popup.
   */
  toggleReactionPicker(kind: 'footer' | 'hover', trigger: HTMLElement) {
    this.closeTransientPopups();
    this.pickerSvc.toggle(trigger, this.getPickerConfig(kind));
  }
  
  /** Quick-reaction emojis shown in the message hover bar. */
  quickEmojis = ['🚀', '✅', '👍', '❤️', '😂', '😮'];
  /** The emoji set to use (apple, google, etc.). */
  readonly emojiSet = 'apple';
  /** Fallback emojis for the hover reaction bar. */
  readonly fallbackHoverReactionEmojis = ['✅', '👍'];

  /**
   * Gets the recent reaction emojis for the current user.
   */
  get hoverReactionEmojis(): string[] {
    return this.emojiRecentSvc.getRecentReactionEmojis(this.currentUserId, 2, this.fallbackHoverReactionEmojis);
  }

  /**
   * Gets the reply count of this message.
   */
  get replyCount(): number {
    return (this.message as any).reply_count || 0;
  }
  
  /**
   * Gets the formatted timestamp of the last reply.
   */
  get formattedLastReplyTime(): string {
    const time = (this.message as any).last_reply_time;
    if (!time) return '';
    const date = new Date(time);
    const hrs = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${hrs}:${mins}`;
  }
  
  /**
   * Checks if the sender of this message is the current user.
   */
  get isCurrentUser(): boolean {
    return this.message.sender_id === this.currentUserId;
  }
  
  /**
   * Gets the formatted creation time of this message.
   */
  get formattedTime(): string {
    if (!this.message.created_at) return '';
    const date = new Date(this.message.created_at);
    const hrs = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${hrs}:${mins} Uhr`;
  }
  
  /**
   * Gets the formatted list of reactions for this message.
   */
  get reactionList(): ReactionListItem[] {
    return this.buildReactionList();
  }

  /**
   * Checks if the reaction picker popup of a specific kind is currently open.
   * @param kind - The picker kind ('footer' or 'hover').
   */
  isReactionPickerOpen(kind: 'footer' | 'hover'): boolean {
    return this.pickerSvc.isOpen(this.pickerOwner(kind));
  }

  /**
   * Handles emoji selection from the picker.
   * @param emoji - The selected native emoji string.
   */
  onReactionPickerSelect(emoji: string): void {
    void this.toggleReaction(emoji);
  }

  /**
   * Splits a plain text string into plain text and emoji tokens.
   * @param text - The text to split.
   */
  private buildTextParts(text: string): MessageTextPart[] {
    if (!text) return [];
    const parts: MessageTextPart[] = [];
    let buffer = '';
    for (const seg of this.splitIntoGraphemes(text)) {
      if (!this.isEmojiSegment(seg)) { buffer += seg; continue; }
      if (buffer) parts.push({ type: 'text', text: buffer });
      buffer = '';
      parts.push({ type: 'emoji', unified: this.resolveUnified(seg) });
    }
    if (buffer) parts.push({ type: 'text', text: buffer });
    return parts;
  }

  /**
   * Converts a native emoji to its unified unicode format.
   * @param emoji - The native emoji string.
   */
  toEmojiKey(emoji: string): string {
    return this.resolveUnified(emoji);
  }
  
  /**
   * Toggles the current user's reaction on the message.
   * @param emoji - The native emoji string.
   */
  async toggleReaction(emoji: string) {
    this.closeTransientPopups();
    if (!this.message.id) return;
    this.emojiRecentSvc.recordRecentNativeEmoji(this.currentUserId, emoji);
    this.messageSvc.optimisticReaction.emit({ messageId: this.message.id, emoji, userId: this.currentUserId });
    try {
      await this.messageSvc.toggleReaction(this.message.id, emoji, this.currentUserId);
    } catch (err) {
      console.error('Fehler beim Speichern der Reaktion in der Datenbank:', err);
    }
  }
  
  /**
   * Click event listener on the document level.
   * @param event - Mouse click event.
   */
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target?.closest?.('[data-emoji-picker-host]')) {
      return;
    }
    if (!this.elementRef.nativeElement.contains(target)) {
      this.closeAllPopups();
    }
  }

  /**
   * Click event handler for the message container.
   * @param event - Mouse click event.
   */
  onMessageContainerClick(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (this.hasOpenPicker() && !target.closest('.msg-container__reaction-picker-anchor')) this.closeReactionPickers();
  }

  /**
   * Mouseleave event handler on the component level.
   */
  onMouseLeave() {
    if (!this.hasOpenPicker()) this.closeTransientPopups();
  }

  /** Whether the inline editor emoji picker is visible. */
  showEditEmojiPicker = false;
  
  /**
   * Starts a reply thread from this message.
   */
  onStartThread() {
    this.closeTransientPopups();
    this.threadClick.emit(this.message);
  }
  
  /**
   * Opens the profile dialog of the sender.
   */
  openSenderProfile(): void {
    if (!this.message.sender) {
      return;
    }

    this.profileDialogSvc.open(this.message.sender, { suppressOutsideCloseOnce: this.isCurrentUser });
  }
  
  /**
   * Enters edit mode for this message.
   */
  startEdit() {
    this.closeTransientPopups();
    this.isEditing = true;
    this.editContent = this.messageSvc.markupToZeroWidth(
      this.message.content,
      MessageComponent.allUsers,
      this.channelSvc.channels()
    );
    this.showEditEmojiPicker = false;
  }
  
  /**
   * Exits edit mode and discards edits.
   */
  cancelEdit() {
    this.isEditing = false;
    this.showEditEmojiPicker = false;
  }
  
  /**
   * Toggles the emoji picker inside the inline edit field.
   */
  toggleEditEmojiPicker() {
    this.showEditEmojiPicker = !this.showEditEmojiPicker;
  }

  /**
   * Adds an emoji to the inline edit content.
   * @param emoji - The selected emoji.
   */
  addEmojiToEdit(emoji: string) {
    this.editContent += emoji;
    this.showEditEmojiPicker = false;
  }

  /**
   * Keydown event listener inside the inline edit textarea.
   * @param event - Keyboard event.
   */
  onEditKeyDown(event: any) {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === 'Enter' && !keyboardEvent.shiftKey) {
      keyboardEvent.preventDefault();
      this.saveEdit();
    } else if (keyboardEvent.key === 'Escape') {
      keyboardEvent.preventDefault();
      this.cancelEdit();
    }
  }

  /**
   * Angular initialization lifecycle hook.
   */
  ngOnInit() {
    void this.ensureUsersLoaded();
  }

  /**
   * Parses the message content string into structured tokens.
   */
  parseMessageContent() {
    const content = this.message?.content || '';
    if (!content) return this.resetTokens();
    if (MessageComponent.allUsers.length > 0) return this.executeParsing(content);
    void this.ensureUsersLoaded().then(() => this.executeParsing(content));
  }

  /**
   * Resets the message tokens list.
   */
  private resetTokens(): void {
    this.tokens = [];
    this.cdr.markForCheck();
  }

  /**
   * Ensures that all users cache is loaded.
   */
  private ensureUsersLoaded(): Promise<User[]> {
    if (MessageComponent.allUsers.length > 0) return Promise.resolve(MessageComponent.allUsers);
    if (!MessageComponent.allUsersPromise) MessageComponent.allUsersPromise = this.loadAllUsers();
    return MessageComponent.allUsersPromise;
  }

  /**
   * Loads all user profiles from DB.
   */
  private loadAllUsers(): Promise<User[]> {
    return this.userSvc.getAllUsers().then((users) => MessageComponent.allUsers = users)
      .catch((error) => (console.error('Fehler beim Laden der User in MessageComponent:', error), []))
      .finally(() => MessageComponent.allUsersPromise = null);
  }

  /**
   * Executes parsing of markup channels and mentions.
   * @param content - The markup string.
   */
  private executeParsing(content: string) {
    const regex = /(<@[a-f0-9-]{36}>|<#[a-f0-9-]{36}>)/gi;
    this.tokens = content.split(regex)
      .filter(Boolean)
      .map(part => this.parsePartToToken(part))
      .filter((t): t is MessageToken => !!t);
    this.cdr.markForCheck();
  }

  /**
   * Parses a specific string segment into a MessageToken.
   * @param part - The text segment to parse.
   */
  private parsePartToToken(part: string): MessageToken | null {
    if (part.startsWith('<@') && part.endsWith('>')) {
      const userId = part.slice(2, -1);
      const user = MessageComponent.allUsers.find(u => u.id === userId);
      return { type: 'mention', text: `@${user?.display_name || 'Gelöschter User'}`, userId };
    }
    if (part.startsWith('<#') && part.endsWith('>')) {
      const channelId = part.slice(2, -1);
      const chan = this.channelSvc.channels().find(c => c.id === channelId);
      return { type: 'channel', text: `#${chan?.name || 'Gelöschter Channel'}`, channelId };
    }
    return { type: 'text', text: part, parts: this.buildTextParts(part) };
  }

  /**
   * Handles click events on channel mention tokens.
   * @param channelId - The targeted channel ID.
   */
  onChannelClick(channelId: string) {
    const channel = this.channelSvc.channels().find(c => c.id === channelId);
    if (channel) {
      this.router.navigate(['/main/channel', channel.id]);
      this.threadSvc.closeThread();
    }
  }

  /**
   * Handles click events on user mention tokens.
   * @param userId - The targeted user ID.
   */
  onUserClick(userId: string) {
    const user = MessageComponent.allUsers.find(u => u.id === userId);
    if (user) {
      this.profileDialogSvc.open(user, { suppressOutsideCloseOnce: userId === this.currentUserId });
    }
  }

  /**
   * Saves the edited message content back to the database.
   */
  async saveEdit() {
    if (!this.message.id || !this.editContent.trim()) return;
    try {
      const content = this.messageSvc.zeroWidthToMarkup(this.editContent);
      const { error } = await this.messageSvc['supabaseSvc'].supabase.from('messages').update({ content }).eq('id', this.message.id);
      if (error) throw error;
      this.message.content = content;
      this.parseMessageContent();
      this.isEditing = this.showEditEmojiPicker = false;
    } catch (err) {
      console.error('Failed to save message edit:', err);
    }
  }

  /**
   * Deletes this message.
   */
  async deleteMessage() {
    this.closeTransientPopups();
    if (!this.message.id) return;
    const msgId = this.message.id;
    this.delete.emit(msgId);
    await this.messageSvc.deleteMessage(msgId);
    this.toastSvc.show('Nachricht gelöscht', 'success', 3000, undefined, false);
  }

  /**
   * Closes temporary popup elements.
   */
  private closeTransientPopups() {
    this.closeReactionPickers();
    this.showMoreMenu = false;
  }

  /**
   * Closes active emoji pickers.
   */
  private closeReactionPickers(): void {
    this.pickerSvc.close(this.pickerOwner('footer'));
    this.pickerSvc.close(this.pickerOwner('hover'));
  }

  /**
   * Checks if any reaction picker is currently open.
   */
  private hasOpenPicker(): boolean {
    return this.isReactionPickerOpen('footer') || this.isReactionPickerOpen('hover');
  }

  /**
   * Builds the formatted list of reactions for rendering.
   */
  private buildReactionList(): ReactionListItem[] {
    if (!this.message.reactions) {
      this.reactionOrder = [];
      return [];
    }
    this.syncReactionOrder();
    return this.visibleReactionKeys().map((emoji) => this.createReactionItem(emoji));
  }

  /**
   * Gets the list of reaction emoji keys.
   */
  private visibleReactionKeys(): string[] {
    return this.reactionOrder.filter((emoji) => Array.isArray(this.message.reactions?.[emoji]));
  }

  /**
   * Generates a ReactionListItem for a specific emoji.
   * @param emoji - The native emoji character.
   */
  private createReactionItem(emoji: string): ReactionListItem {
    const userIds = this.message.reactions?.[emoji] ?? [];
    const tooltip = this.buildReactionTooltip(userIds);
    return {
      emoji,
      count: userIds.length,
      userReacted: userIds.includes(this.currentUserId),
      userIds,
      tooltipNames: tooltip.names,
      tooltipAction: tooltip.action,
    };
  }

  /**
   * Formats the names of reacting users and action text for the tooltip.
   * @param userIds - Reacting user IDs.
   */
  private buildReactionTooltip(userIds: string[]): { names: string; action: string } {
    const names = [...new Set(userIds.map((id) => {
      return id === this.currentUserId ? 'Du' : this.resolveReactionUserName(id);
    }).filter(Boolean))];
    const len = names.length;

    if (len === 1) {
      return {
        names: names[0],
        action: names[0] === 'Du' ? 'hast reagiert' : 'hat reagiert',
      };
    }

    if (len === 2) {
      return {
        names: `${names[0]} und ${names[1]}`,
        action: 'haben reagiert',
      };
    }

    return {
      names: `${names[0]}, ${names[1]} und ${len - 2} weitere Person${len === 3 ? '' : 'en'}`,
      action: 'haben reagiert',
    };
  }

  /**
   * Resolves a user ID to a display name for reactions.
   * @param userId - User ID.
   */
  private resolveReactionUserName(userId: string): string {
    if (userId === this.currentUserId) {
      return 'Du';
    }

    if (this.message.sender?.id === userId) {
      return this.message.sender.display_name;
    }

    const user = MessageComponent.allUsers.find((entry) => entry.id === userId);
    return user?.display_name || 'Unbekannt';
  }

  /**
   * Synchronizes local reactionOrder array with new keys in reactions object.
   */
  private syncReactionOrder(): void {
    const nextKeys = Object.keys(this.message?.reactions ?? {});
    this.reactionOrder = [
      ...this.reactionOrder.filter((emoji) => nextKeys.includes(emoji)),
      ...nextKeys.filter((emoji) => !this.reactionOrder.includes(emoji)),
    ];
  }

  /**
   * Gets a unique picker owner key.
   * @param kind - Picker kind.
   */
  private pickerOwner(kind: 'footer' | 'hover'): string {
    return `${this.pickerScope}:${kind}`;
  }

  /**
   * Generates the emoji picker config for overlay service.
   * @param kind - Picker kind.
   */
  private getPickerConfig(kind: 'footer' | 'hover') {
    return { owner: this.pickerOwner(kind), userId: this.currentUserId, variant: kind === 'footer' ? 'message-footer' as const : 'message-hover' as const, alignRight: this.isCurrentUser, color: '#444df2', onSelect: (emoji: string) => this.onReactionPickerSelect(emoji) };
  }

  /**
   * Closes all dialogs and popup windows inside this message card.
   */
  private closeAllPopups() {
    this.closeTransientPopups();
    this.showEditEmojiPicker = false;
  }

  /**
   * Splits a string into grapheme segments.
   * @param text - The string to split.
   */
  private splitIntoGraphemes(text: string): string[] {
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return Array.from(segmenter.segment(text), ({ segment }) => segment);
    }

    return Array.from(text);
  }

  /**
   * Checks if a grapheme segment is an emoji.
   * @param segment - Grapheme segment.
   */
  private isEmojiSegment(segment: string): boolean {
    return this.regionalFlagRegex.test(segment) || this.emojiRegex.test(segment);
  }

  /**
   * Converts a native emoji to unified hexadecimal format (e.g. 1F600).
   * @param emoji - Native emoji.
   */
  private toUnified(emoji: string): string {
    return Array.from(emoji)
      .map(char => char.codePointAt(0)?.toString(16).toUpperCase() ?? '')
      .filter(Boolean)
      .join('-');
  }

  /** Reverse lookup map from native emoji to emoji-mart's exact unified code. */
  private static nativeUnifiedMap: Map<string, string> | null = null;

  /**
   * Resolves a native emoji to the exact unified code used by emoji-mart's data set.
   * Falls back to a variation-selector-stripped lookup and finally the raw codepoints,
   * preventing emojis (e.g. ✋) from rendering empty when their stored unified omits FE0F.
   * @param emoji - Native emoji character.
   */
  private resolveUnified(emoji: string): string {
    const map = this.getNativeUnifiedMap();
    return map.get(emoji)
      ?? map.get(emoji.replace(/\uFE0F/g, ''))
      ?? this.toUnified(emoji);
  }

  /**
   * Lazily builds and caches a map from native emoji (and its FE0F-stripped form)
   * to the unified code defined in emoji-mart's data set, including skin variations.
   */
  private getNativeUnifiedMap(): Map<string, string> {
    if (MessageComponent.nativeUnifiedMap) return MessageComponent.nativeUnifiedMap;
    const map = new Map<string, string>();
    const add = (unified: string | undefined): void => {
      if (!unified) return;
      const native = this.unifiedToNative(unified);
      if (!map.has(native)) map.set(native, unified);
      const stripped = native.replace(/\uFE0F/g, '');
      if (stripped && !map.has(stripped)) map.set(stripped, unified);
    };
    for (const data of this.emojiSvc.emojis) {
      add(data.unified);
      for (const variation of data.skinVariations ?? []) add(variation.unified);
    }
    MessageComponent.nativeUnifiedMap = map;
    return map;
  }

  /**
   * Converts a unified hexadecimal code (e.g. 270B-FE0F) back to its native emoji string.
   * @param unified - Unified hexadecimal code.
   */
  private unifiedToNative(unified: string): string {
    return String.fromCodePoint(...unified.split('-').map(part => parseInt(part, 16)));
  }
}
