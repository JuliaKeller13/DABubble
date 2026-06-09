import { Component, Input, Output, EventEmitter, inject, ElementRef, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EmojiComponent } from '@ctrl/ngx-emoji-mart/ngx-emoji';
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

interface MessageToken {
  type: 'text' | 'channel' | 'mention';
  text: string;
  channelId?: string;
  userId?: string;
  parts?: MessageTextPart[];
}

interface MessageTextPart {
  type: 'text' | 'emoji';
  text?: string;
  unified?: string;
}

interface ReactionListItem {
  emoji: string;
  count: number;
  userReacted: boolean;
  userIds: string[];
  tooltipNames: string;
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
export class MessageComponent implements OnInit {
  private static nextPickerId = 0;
  private static allUsersPromise: Promise<User[]> | null = null;
  private _message!: Message;
  private readonly emojiRegex = /\p{Extended_Pictographic}/u;
  private readonly regionalFlagRegex = /^[\u{1F1E6}-\u{1F1FF}]{2}$/u;
  private reactionOrder: string[] = [];
  private readonly pickerScope = `message:${MessageComponent.nextPickerId++}`;

  @Input({ required: true }) set message(val: Message) {
    this._message = val;
    this.syncReactionOrder();
    this.parseMessageContent();
  }
  get message(): Message {
    return this._message;
  }

  get isHighlighted(): boolean {
    return this.message?.id ? this.message.id === this.messageSvc.searchTargetMessageId : false;
  }

  @Input({ required: true }) currentUserId!: string;
  @Input() isThreadMessage = false;

  @Output() threadClick = new EventEmitter<Message>();
  @Output() editClick = new EventEmitter<Message>();
  @Output() delete = new EventEmitter<string>();

  private messageSvc = inject(messageService);
  private elementRef = inject(ElementRef);
  private profileDialogSvc = inject(ProfileDialogService);
  private toastSvc = inject(ToastService);
  private channelSvc = inject(channelService);
  private userSvc = inject(userService);
  private threadSvc = inject(ThreadService);
  private emojiRecentSvc = inject(EmojiRecentService);
  private pickerSvc = inject(EmojiPickerOverlayService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  showMoreMenu = false;
  isEditing = false;
  editContent = '';

  private static allUsers: User[] = [];
  tokens: MessageToken[] = [];
  
  toggleMoreOptions() {
    const shouldOpen = !this.showMoreMenu;
    this.closeTransientPopups();
    this.showMoreMenu = shouldOpen;
  }

  toggleReactionPicker(kind: 'footer' | 'hover', trigger: HTMLElement) {
    this.closeTransientPopups();
    this.pickerSvc.toggle(trigger, this.getPickerConfig(kind));
  }
  
  quickEmojis = ['🚀', '✅', '👍', '❤️', '😂', '😮'];
  readonly emojiSet = 'apple';
  readonly fallbackHoverReactionEmojis = ['✅', '👍'];

  get hoverReactionEmojis(): string[] {
    return this.emojiRecentSvc.getRecentReactionEmojis(this.currentUserId, 2, this.fallbackHoverReactionEmojis);
  }

  
  get replyCount(): number {
    return (this.message as any).reply_count || 0;
  }
  
  get formattedLastReplyTime(): string {
    const time = (this.message as any).last_reply_time;
    if (!time) return '';
    const date = new Date(time);
    const hrs = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${hrs}:${mins}`;
  }
  
  get isCurrentUser(): boolean {
    return this.message.sender_id === this.currentUserId;
  }
  
  get formattedTime(): string {
    if (!this.message.created_at) return '';
    const date = new Date(this.message.created_at);
    const hrs = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${hrs}:${mins} Uhr`;
  }
  
  get reactionList(): ReactionListItem[] {
    return this.buildReactionList();
  }

  isReactionPickerOpen(kind: 'footer' | 'hover'): boolean {
    return this.pickerSvc.isOpen(this.pickerOwner(kind));
  }

  onReactionPickerSelect(emoji: string): void {
    void this.toggleReaction(emoji);
  }

  private buildTextParts(text: string): MessageTextPart[] {
    if (!text) return [];
    const parts: MessageTextPart[] = [];
    let buffer = '';
    for (const seg of this.splitIntoGraphemes(text)) {
      if (!this.isEmojiSegment(seg)) { buffer += seg; continue; }
      if (buffer) parts.push({ type: 'text', text: buffer });
      buffer = '';
      parts.push({ type: 'emoji', unified: this.toUnified(seg) });
    }
    if (buffer) parts.push({ type: 'text', text: buffer });
    return parts;
  }

  toEmojiKey(emoji: string): string {
    return this.toUnified(emoji);
  }
  
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
  
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target?.closest?.('[data-emoji-picker-host]')) {
      return;
    }
    if (!this.elementRef.nativeElement.contains(target)) {
      this.closeAllPopups();
    }
  }

  onMessageContainerClick(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (this.hasOpenPicker() && !target.closest('.msg-container__reaction-picker-anchor')) this.closeReactionPickers();
  }

  onMouseLeave() {
    if (!this.hasOpenPicker()) this.closeTransientPopups();
  }

  showEditEmojiPicker = false;
  
  onStartThread() {
    this.closeTransientPopups();
    this.threadClick.emit(this.message);
  }
  
  openSenderProfile(): void {
    if (!this.message.sender) {
      return;
    }

    this.profileDialogSvc.open(this.message.sender, { suppressOutsideCloseOnce: this.isCurrentUser });
  }
  
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
  
  cancelEdit() {
    this.isEditing = false;
    this.showEditEmojiPicker = false;
  }
  
  toggleEditEmojiPicker() {
    this.showEditEmojiPicker = !this.showEditEmojiPicker;
  }

  
  addEmojiToEdit(emoji: string) {
    this.editContent += emoji;
    this.showEditEmojiPicker = false;
  }

  
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

  ngOnInit() {
    void this.ensureUsersLoaded();
  }

  parseMessageContent() {
    const content = this.message?.content || '';
    if (!content) return this.resetTokens();
    if (MessageComponent.allUsers.length > 0) return this.executeParsing(content);
    void this.ensureUsersLoaded().then(() => this.executeParsing(content));
  }

  private resetTokens(): void {
    this.tokens = [];
    this.cdr.markForCheck();
  }

  private ensureUsersLoaded(): Promise<User[]> {
    if (MessageComponent.allUsers.length > 0) return Promise.resolve(MessageComponent.allUsers);
    if (!MessageComponent.allUsersPromise) MessageComponent.allUsersPromise = this.loadAllUsers();
    return MessageComponent.allUsersPromise;
  }

  private loadAllUsers(): Promise<User[]> {
    return this.userSvc.getAllUsers().then((users) => MessageComponent.allUsers = users)
      .catch((error) => (console.error('Fehler beim Laden der User in MessageComponent:', error), []))
      .finally(() => MessageComponent.allUsersPromise = null);
  }

  private executeParsing(content: string) {
    const regex = /(<@[a-f0-9-]{36}>|<#[a-f0-9-]{36}>)/gi;
    this.tokens = content.split(regex)
      .filter(Boolean)
      .map(part => this.parsePartToToken(part))
      .filter((t): t is MessageToken => !!t);
    this.cdr.markForCheck();
  }

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

  onChannelClick(channelId: string) {
    const channel = this.channelSvc.channels().find(c => c.id === channelId);
    if (channel) {
      this.router.navigate(['/main/channel', channel.id]);
      this.threadSvc.closeThread();
    }
  }

  onUserClick(userId: string) {
    const user = MessageComponent.allUsers.find(u => u.id === userId);
    if (user) {
      this.profileDialogSvc.open(user, { suppressOutsideCloseOnce: userId === this.currentUserId });
    }
  }

  
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

  
  async deleteMessage() {
    this.closeTransientPopups();
    if (!this.message.id) return;
    const msgId = this.message.id;
    this.delete.emit(msgId);
    await this.messageSvc.deleteMessage(msgId);
    this.toastSvc.show('Nachricht gelöscht', 'success', 3000, undefined, false);
  }

  private closeTransientPopups() {
    this.closeReactionPickers();
    this.showMoreMenu = false;
  }

  private closeReactionPickers(): void {
    this.pickerSvc.close(this.pickerOwner('footer'));
    this.pickerSvc.close(this.pickerOwner('hover'));
  }

  private hasOpenPicker(): boolean {
    return this.isReactionPickerOpen('footer') || this.isReactionPickerOpen('hover');
  }

  private buildReactionList(): ReactionListItem[] {
    if (!this.message.reactions) {
      this.reactionOrder = [];
      return [];
    }
    this.syncReactionOrder();
    return this.visibleReactionKeys().map((emoji) => this.createReactionItem(emoji));
  }

  private visibleReactionKeys(): string[] {
    return this.reactionOrder.filter((emoji) => Array.isArray(this.message.reactions?.[emoji]));
  }

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

  private syncReactionOrder(): void {
    const nextKeys = Object.keys(this.message?.reactions ?? {});
    this.reactionOrder = [
      ...this.reactionOrder.filter((emoji) => nextKeys.includes(emoji)),
      ...nextKeys.filter((emoji) => !this.reactionOrder.includes(emoji)),
    ];
  }

  private pickerOwner(kind: 'footer' | 'hover'): string {
    return `${this.pickerScope}:${kind}`;
  }

  private getPickerConfig(kind: 'footer' | 'hover') {
    return { owner: this.pickerOwner(kind), userId: this.currentUserId, variant: kind === 'footer' ? 'message-footer' as const : 'message-hover' as const, alignRight: this.isCurrentUser, color: '#444df2', onSelect: (emoji: string) => this.onReactionPickerSelect(emoji) };
  }

  private closeAllPopups() {
    this.closeTransientPopups();
    this.showEditEmojiPicker = false;
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
      .map(char => char.codePointAt(0)?.toString(16).toUpperCase() ?? '')
      .filter(Boolean)
      .join('-');
  }
}
