import { Component, Input, Output, EventEmitter, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-message-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './message-input.html',
  styleUrl: './message-input.scss'
})
export class MessageInputComponent implements OnDestroy {
  @Input() placeholder: string = 'Nachricht an #Entwicklerteam';
  @Output() sendMessage = new EventEmitter<string>();
  @Output() typing = new EventEmitter<boolean>();

  messageText = '';
  isEmojiActive = false;
  isMentionActive = false;

  private typingTimeout: any;
  private typingInterval: any;
  private isCurrentlyTyping = false;

  // Emits the entered message text and resets the input box
  send() {
    if (!this.messageText.trim()) return;
    this.stopTyping();

    this.sendMessage.emit(this.messageText);
    this.messageText = '';
  }

  // Emits typing state based on keyboard inputs and debounce timeouts
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
  onEnterPressed(event: any) {
    const keyboardEvent = event as KeyboardEvent;
    if (!keyboardEvent.shiftKey) {
      keyboardEvent.preventDefault();
      this.send();
    }
  }

  // Toggles the visibility of the emoji picker
  toggleEmoji() {
    this.isEmojiActive = !this.isEmojiActive;
  }

  // Toggles the visibility of the mention dropdown
  toggleMention() {
    this.isMentionActive = !this.isMentionActive;
  }
}
