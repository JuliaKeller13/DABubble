import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MessageInputComponent } from '../message-input/message-input';

@Component({
  selector: 'app-thread-view',
  standalone: true,
  imports: [CommonModule, MessageInputComponent],
  templateUrl: './thread-view.html',
  styleUrl: './thread-view.scss'
})
export class ThreadViewComponent {
}
