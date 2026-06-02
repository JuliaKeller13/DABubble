import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Message } from '../../interfaces/message.interface';
import { MessageService } from '../../services/message.service';
import { userService } from '../../services/user.service';

@Component({
  selector: 'app-message',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './message.html',
  styleUrl: './message.scss'
})
export class MessageComponent {
  @Input({ required: true }) message!: Message;
  @Input({ required: true }) currentUserId!: string;

  @Output() threadClick = new EventEmitter<Message>();
  @Output() editClick = new EventEmitter<Message>();

  private messageSvc = inject(MessageService);
  private userSvc = inject(userService);

  showReactionPicker = false;
  showHoverReactionPicker = false;
  showMoreMenu = false;
  isEditing = false;
  editContent = '';

  toggleMoreOptions() {
    this.showMoreMenu = !this.showMoreMenu;
  }

  // Emojis offered in the quick reaction bar
  quickEmojis = ['🚀', '✅', '👍', '❤️', '😂', '😮'];

  // Get thread replies count (mocked or retrieved)
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
        userIds
      };
    });
  }

  // Toggle reaction on the message using the current user's profile
  async toggleReaction(emoji: string) {
    if (!this.message.id) return;
    await this.messageSvc.toggleReaction(this.message.id, emoji, this.currentUserId);
    this.showReactionPicker = false;
    this.showHoverReactionPicker = false;
  }

  showEditEmojiPicker = false;

  // Trigger opening the message thread view
  onStartThread() {
    this.threadClick.emit(this.message);
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
    if (confirm('Möchtest du diese Nachricht wirklich löschen?')) {
      try {
        await this.messageSvc['supabaseSvc'].supabase
          .from('messages')
          .delete()
          .eq('id', this.message.id);
      } catch (err) {
        console.error('Failed to delete message:', err);
      }
    }
  }
}
