import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-message-input',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message-input.html',
  styleUrl: './message-input.scss'
})
export class MessageInputComponent {
  @Input() placeholder: string = 'Nachricht an #Entwicklerteam';
  isEmojiActive = false;
  isMentionActive = false;

  // Toggles the visibility of the emoji picker
  toggleEmoji() {
    this.isEmojiActive = !this.isEmojiActive;
  }

  // Toggles the visibility of the mention dropdown
  toggleMention() {
    this.isMentionActive = !this.isMentionActive;
  }
}
