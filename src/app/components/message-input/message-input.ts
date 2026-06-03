import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-message-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './message-input.html',
  styleUrl: './message-input.scss'
})
export class MessageInputComponent {
  @Input() placeholder: string = 'Nachricht an #Entwicklerteam';
  @Output() sendMessage = new EventEmitter<string>();
  @Output() typing = new EventEmitter<boolean>();

  messageText = '';
  isEmojiActive = false;
  isMentionActive = false;

  private typingTimeout: any;
  private isCurrentlyTyping = false;

  // Emits the entered message text and resets the input box
  send() {
    if (!this.messageText.trim()) return;
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    this.isCurrentlyTyping = false;
    this.typing.emit(false);

    this.sendMessage.emit(this.messageText);
    this.messageText = '';
  }

  // Emits typing state based on keyboard inputs and debounce timeouts
  onInputChange() {
    if (!this.isCurrentlyTyping) {
      this.isCurrentlyTyping = true;
      this.typing.emit(true);
    }

    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    this.typingTimeout = setTimeout(() => {
      this.isCurrentlyTyping = false;
      this.typing.emit(false);
    }, 3000);
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
