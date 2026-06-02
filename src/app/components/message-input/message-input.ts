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

  messageText = '';
  isEmojiActive = false;
  isMentionActive = false;

  // Emits the entered message text and resets the input box
  send() {
    if (!this.messageText.trim()) return;
    this.sendMessage.emit(this.messageText);
    this.messageText = '';
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
