import { Component, Input, Output, EventEmitter, inject, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Message } from '../../interfaces/message.interface';
import { MessageService } from '../../services/message.service';
import { ProfileDialogService } from '../../services/profile-dialog.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-message',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './message.html',
  styleUrl: './message.scss',
})
export class MessageComponent {
  @Input({ required: true }) message!: Message;
  @Input({ required: true }) currentUserId!: string;
  @Input() isThreadMessage = false;

  @Output() threadClick = new EventEmitter<Message>();
  @Output() editClick = new EventEmitter<Message>();
  @Output() delete = new EventEmitter<string>();

  private messageSvc = inject(MessageService);
  private elementRef = inject(ElementRef);
  private profileDialogSvc = inject(ProfileDialogService);
  private toastSvc = inject(ToastService);

  showReactionPicker = false;
  showHoverReactionPicker = false;
  showMoreMenu = false;
  isEditing = false;
  editContent = '';

  // Toggles the visibility of the message options menu
  toggleMoreOptions() {
    this.showMoreMenu = !this.showMoreMenu;
  }

  // Emojis offered in the quick reaction bar
  quickEmojis = ['🚀', '✅', '👍', '❤️', '😂', '😮'];

  // Retrieves the number of replies in this message thread
  get replyCount(): number {
    return (this.message as any).reply_count || 0;
  }

  // Get last reply time formatted (mocked or retrieved)
  get formattedLastReplyTime(): string {
    const time = (this.message as any).last_reply_time;
    if (!time) return '';
    const date = new Date(time);
    const hrs = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${hrs}:${mins}`;
  }

  // Check if the current message belongs to the logged-in user
  get isCurrentUser(): boolean {
    return this.message.sender_id === this.currentUserId;
  }

  // Format the creation date to HH:MM Uhr format
  get formattedTime(): string {
    if (!this.message.created_at) return '';
    const date = new Date(this.message.created_at);
    const hrs = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${hrs}:${mins} Uhr`;
  }

  // Group and format active reactions on this message for display
  get reactionList() {
    if (!this.message.reactions) return [];
    return Object.entries(this.message.reactions).map(([emoji, userIds]) => {
      return {
        emoji,
        count: userIds.length,
        userReacted: userIds.includes(this.currentUserId),
        userIds,
      };
    });
  }

  // Toggle reaction on the message using the current user's profile
  async toggleReaction(emoji: string) {
    this.showReactionPicker = false;
    this.showHoverReactionPicker = false;
    if (!this.message.id) return;
    await this.messageSvc.toggleReaction(this.message.id, emoji, this.currentUserId);
  }

  // Closes all popups when a click occurs outside the message component
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.showReactionPicker = false;
      this.showHoverReactionPicker = false;
      this.showMoreMenu = false;
      this.showEditEmojiPicker = false;
    }
  }

  showEditEmojiPicker = false;

  // Trigger opening the message thread view
  onStartThread() {
    this.threadClick.emit(this.message);
  }

  // Opens the profile dialog of the sender of this message
  openSenderProfile(): void {
    if (!this.message.sender) {
      return;
    }

    this.profileDialogSvc.open(this.message.sender, { suppressOutsideCloseOnce: this.isCurrentUser });
  }

  // Enable editing state for the message
  startEdit() {
    this.isEditing = true;
    this.editContent = this.message.content;
    this.showEditEmojiPicker = false;
  }

  // Cancel the message editing action
  cancelEdit() {
    this.isEditing = false;
    this.showEditEmojiPicker = false;
  }

  // Toggle emoji picker in edit mode
  toggleEditEmojiPicker() {
    this.showEditEmojiPicker = !this.showEditEmojiPicker;
  }

  // Add selected emoji to editing content
  addEmojiToEdit(emoji: string) {
    this.editContent += emoji;
    this.showEditEmojiPicker = false;
  }

  // Listen to keydown events in the edit textarea
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

  // Save the updated message content to Supabase
  async saveEdit() {
    if (!this.message.id || !this.editContent.trim()) return;
    try {
      const { error } = await this.messageSvc['supabaseSvc'].supabase
        .from('messages')
        .update({ content: this.editContent })
        .eq('id', this.message.id);

      if (!error) {
        this.message.content = this.editContent;
        this.isEditing = false;
        this.showEditEmojiPicker = false;
      }
    } catch (err) {
      console.error('Failed to save message edit:', err);
    }
  }

  // Trigger delete confirmation for this message
  async deleteMessage() {
    if (!this.message.id) return;
    const msgId = this.message.id;
    this.delete.emit(msgId);
    await this.messageSvc.deleteMessage(msgId);
    this.toastSvc.show('Nachricht gelöscht', 'success', 3000, undefined, false);
  }
}
