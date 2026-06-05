import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PickerModule } from '@ctrl/ngx-emoji-mart';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { ThreadService } from '../../services/thread.service';

type PopupType = 'none' | 'users' | 'channels';

@Component({
  selector: 'app-message-input',
  imports: [CommonModule, FormsModule, PickerModule],
  templateUrl: './message-input.html',
  styleUrl: './message-input.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscapePressed()'
  }
})
export class MessageInputComponent implements OnDestroy {
  @Input() placeholder: string = 'Nachricht an #Entwicklerteam';
  @Output() sendMessage = new EventEmitter<string>();
  @Output() typing = new EventEmitter<boolean>();
  @ViewChild('messageTextarea') private messageTextarea?: ElementRef<HTMLTextAreaElement>;

  private channelSvc = inject(channelService);
  private userSvc = inject(userService);
  private authSvc = inject(AuthService);
  private threadSvc = inject(ThreadService);
  private elementRef = inject(ElementRef);

  messageText = '';
  showEmojiPicker = false;
  readonly emojiPickerStyle = {
    width: '100%',
    maxWidth: '100%'
  };
  readonly emojiPickerI18n = {
    search: 'Suchen',
    emojilist: 'Emoji-Liste',
    notfound: 'Keine Emojis gefunden',
    clear: 'Zuruecksetzen',
    categories: {
      search: 'Suchergebnisse',
      recent: 'Haeufig verwendet',
      people: 'Smileys & Personen',
      nature: 'Tiere & Natur',
      foods: 'Essen & Trinken',
      activity: 'Aktivitaeten',
      places: 'Reisen & Orte',
      objects: 'Objekte',
      symbols: 'Symbole',
      flags: 'Flaggen',
      custom: 'Benutzerdefiniert'
    },
    skintones: {
      1: 'Standard-Hautfarbe',
      2: 'Helle Hautfarbe',
      3: 'Mittelhelle Hautfarbe',
      4: 'Mittlere Hautfarbe',
      5: 'Mitteldunkle Hautfarbe',
      6: 'Dunkle Hautfarbe'
    }
  };

  activePopup: PopupType = 'none';
  popupUsers: { id: string; name: string; avatar: string }[] = [];
  popupChannels: { id: string; name: string }[] = [];
  isLoading = false;

  private allPopupUsers: { id: string; name: string; avatar: string }[] = [];
  private allPopupChannels: { id: string; name: string }[] = [];

  private static channelMembersCache = new Map<string, { id: string; name: string; avatar: string }[]>();
  private static allUsersCache: { id: string; name: string; avatar: string }[] = [];

  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  private typingInterval: ReturnType<typeof setInterval> | null = null;
  private isCurrentlyTyping = false;

  get isEmojiActive(): boolean {
    return this.showEmojiPicker;
  }

  get isMentionActive(): boolean {
    return this.activePopup !== 'none';
  }

  private get textareaElement(): HTMLTextAreaElement | null {
    return this.messageTextarea?.nativeElement ?? null;
  }

  get currentUserId(): string {
    return this.authSvc.currentUser()?.id || '';
  }

  isUserOnlineById(userId: string): boolean {
    return this.authSvc.onlineUserIds().has(userId);
  }

  // Emits the entered message text and resets the input box
  send() {
    if (!this.messageText.trim()) return;
    this.stopTyping();

    this.sendMessage.emit(this.messageText);
    this.messageText = '';
  }

  // Emits typing state based on keyboard inputs, debounce timeouts and trigger character checks
  onInputChange() {
    if (!this.isCurrentlyTyping) {
      this.isCurrentlyTyping = true;
      this.typing.emit(true);
      this.startTypingHeartbeat();
    }

    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    this.typingTimeout = setTimeout(() => {
      this.stopTyping();
    }, 3000);

    this.checkForTriggerChar();
  }

  private startTypingHeartbeat() {
    this.typingInterval = setInterval(() => {
      this.typing.emit(true);
    }, 2000);
  }

  private stopTyping() {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
    if (this.typingInterval) {
      clearInterval(this.typingInterval);
      this.typingInterval = null;
    }
    this.isCurrentlyTyping = false;
    this.typing.emit(false);
  }

  // Clean up timers on component destruction
  ngOnDestroy() {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    if (this.typingInterval) {
      clearInterval(this.typingInterval);
    }
  }

  // Listens to Enter key hits and submits unless Shift key is held down
  onEnterPressed(event: Event) {
    const keyboardEvent = event as KeyboardEvent;
    if (!keyboardEvent.shiftKey) {
      keyboardEvent.preventDefault();
      this.send();
    }
  }

  onMessageInputClick() {
    this.closePopup();
  }

  // Toggles the visibility of the emoji picker
  toggleEmoji() {
    const shouldOpen = !this.showEmojiPicker;
    this.closeMentionPopup();
    this.showEmojiPicker = shouldOpen;
  }

  // Toggles the visibility of the mention dropdown and cycles popup states
  async toggleMention() {
    this.closeEmojiPicker();

    if (this.activePopup === 'none') {
      this.activePopup = 'users';
      await this.loadUsers();
    } else if (this.activePopup === 'users') {
      this.activePopup = 'channels';
      await this.loadChannels();
    } else {
      this.activePopup = 'none';
    }
  }

  addEmoji(event: { emoji?: { native?: string } }) {
    const emoji = event.emoji?.native;
    if (!emoji) {
      return;
    }

    const textarea = this.textareaElement;
    if (!textarea) {
      this.messageText += emoji;
      return;
    }

    const startPos = textarea.selectionStart ?? this.messageText.length;
    const endPos = textarea.selectionEnd ?? startPos;

    this.messageText =
      this.messageText.substring(0, startPos) +
      emoji +
      this.messageText.substring(endPos);

    const newCursorPos = startPos + emoji.length;
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }

  async loadUsers() {
    const channel = this.channelSvc.activeChannel();
    const activeMsg = this.threadSvc.activeMessage();

    let channelId = '';
    if (activeMsg && activeMsg.channel_id) {
      channelId = activeMsg.channel_id;
    } else if (channel && channel.id) {
      channelId = channel.id;
    }

    // Return instantly from active channel members signal if populated
    if (channelId && channelId === channel?.id && this.channelSvc.activeChannelMembers().length > 0) {
      const activeMembers = this.channelSvc.activeChannelMembers();
      const filteredMembers = this.userSvc.filterDuplicateGuests(activeMembers, this.currentUserId || null);
      this.allPopupUsers = filteredMembers.map(user => ({
        id: user.id,
        name: user.display_name,
        avatar: user.avatar_url || 'img/avatars/avatar_default.svg'
      }));
      MessageInputComponent.channelMembersCache.set(channelId, this.allPopupUsers);
      this.popupUsers = [...this.allPopupUsers];
      return;
    }

    // Return instantly if cached
    if (channelId && MessageInputComponent.channelMembersCache.has(channelId)) {
      this.allPopupUsers = MessageInputComponent.channelMembersCache.get(channelId)!;
      this.popupUsers = [...this.allPopupUsers];
      return;
    } else if (!channelId && MessageInputComponent.allUsersCache.length > 0) {
      this.allPopupUsers = MessageInputComponent.allUsersCache;
      this.popupUsers = [...this.allPopupUsers];
      return;
    }

    this.isLoading = true;
    try {
      if (channelId) {
        const dbMembers = await this.channelSvc.getChannelMembers(channelId);
        const filteredMembers = this.userSvc.filterDuplicateGuests(dbMembers, this.currentUserId || null);
        const mapped = filteredMembers.map(user => ({
          id: user.id,
          name: user.display_name,
          avatar: user.avatar_url || 'img/avatars/avatar_default.svg'
        }));
        MessageInputComponent.channelMembersCache.set(channelId, mapped);
        this.allPopupUsers = mapped;
      } else {
        const allUsers = await this.userSvc.getAllUsers();
        const filteredUsers = this.userSvc.filterDuplicateGuests(allUsers, this.currentUserId || null);
        const mapped = filteredUsers.map(user => ({
          id: user.id,
          name: user.display_name,
          avatar: user.avatar_url || 'img/avatars/avatar_default.svg'
        }));
        MessageInputComponent.allUsersCache = mapped;
        this.allPopupUsers = mapped;
      }
      this.popupUsers = [...this.allPopupUsers];
    } catch (e) {
      console.error('Fehler beim Laden der Popup-User:', e);
      this.allPopupUsers = [];
      this.popupUsers = [];
    } finally {
      this.isLoading = false;
    }
  }

  async loadChannels() {
    // Return instantly from local channel signal cache if populated
    const cachedChannels = this.channelSvc.channels();
    if (cachedChannels.length > 0) {
      this.allPopupChannels = cachedChannels
        .filter(channel => !!channel.id)
        .map(channel => ({
          id: channel.id!,
          name: channel.name
        }));
      this.popupChannels = [...this.allPopupChannels];
      return;
    }

    this.isLoading = true;
    try {
      const fetched = await this.channelSvc.getChannels();
      this.allPopupChannels = fetched
        .filter(channel => !!channel.id)
        .map(channel => ({
          id: channel.id!,
          name: channel.name
        }));
      this.popupChannels = [...this.allPopupChannels];
    } catch (e) {
      console.error('Fehler beim Laden der Popup-Channels:', e);
      this.allPopupChannels = [];
      this.popupChannels = [];
    } finally {
      this.isLoading = false;
    }
  }

  checkForTriggerChar() {
    const textarea = this.textareaElement;
    if (!textarea) return;

    const text = this.messageText;
    const selectionEnd = textarea.selectionEnd;

    if (selectionEnd > 0) {
      const textBeforeCursor = text.substring(0, selectionEnd);
      const lastSpace = textBeforeCursor.lastIndexOf(' ');
      const currentWord = textBeforeCursor.substring(lastSpace + 1);

      if (currentWord === '@') {
        this.activePopup = 'users';
        void this.loadUsers();
      } else if (currentWord === '#') {
        this.activePopup = 'channels';
        void this.loadChannels();
      } else if (this.activePopup !== 'none') {
        this.updatePopupVisibilityBasedOnText(text, selectionEnd);
      }
    } else {
      this.closePopup();
    }
  }

  updatePopupVisibilityBasedOnText(text: string, selectionEnd: number) {
    if (this.activePopup === 'none') return;

    const textBeforeCursor = text.substring(0, selectionEnd);
    const lastSpace = textBeforeCursor.lastIndexOf(' ');
    const currentWord = textBeforeCursor.substring(lastSpace + 1);

    if (this.activePopup === 'users' && currentWord.startsWith('@')) {
      this.filterPopupUsers(currentWord.substring(1));
    } else if (this.activePopup === 'channels' && currentWord.startsWith('#')) {
      this.filterPopupChannels(currentWord.substring(1));
    } else {
      this.closePopup();
    }
  }

  filterPopupUsers(query: string) {
    const cleanQuery = query.toLowerCase();
    this.popupUsers = this.allPopupUsers.filter(user => 
      user.name.toLowerCase().includes(cleanQuery)
    );
  }

  filterPopupChannels(query: string) {
    const cleanQuery = query.toLowerCase();
    this.popupChannels = this.allPopupChannels.filter(channel => 
      channel.name.toLowerCase().includes(cleanQuery)
    );
  }

  insertMention(mentionText: string) {
    const textarea = this.textareaElement;
    if (textarea) {
      const startPos = textarea.selectionStart;
      const endPos = textarea.selectionEnd;
      let textBefore = this.messageText.substring(0, startPos);
      const textAfter = this.messageText.substring(endPos);

      // Find the start of the current trigger tag word to replace it
      const lastSpace = textBefore.lastIndexOf(' ');
      const triggerIndex = lastSpace + 1;
      
      textBefore = this.messageText.substring(0, triggerIndex);

      // Insert mention with a space afterwards
      this.messageText = textBefore + mentionText + ' ' + textAfter;

      // Reset selection and keep focus
      setTimeout(() => {
        textarea.focus();
        const newCursorPos = triggerIndex + mentionText.length + 1;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    } else {
      this.messageText += (this.messageText ? ' ' : '') + mentionText + ' ';
    }

    this.closePopup();
  }

  closePopup() {
    this.closeMentionPopup();
    this.closeEmojiPicker();
  }

  private closeMentionPopup() {
    this.activePopup = 'none';
  }

  private closeEmojiPicker() {
    this.showEmojiPicker = false;
  }

  onDocumentClick(event: MouseEvent) {
    if (this.activePopup === 'none' && !this.showEmojiPicker) {
      return;
    }

    const clickedInside = this.elementRef.nativeElement.contains(event.target);
    if (!clickedInside) {
      this.closePopup();
    }
  }

  onEscapePressed() {
    if (this.activePopup !== 'none' || this.showEmojiPicker) {
      this.closePopup();
    }
  }
}
