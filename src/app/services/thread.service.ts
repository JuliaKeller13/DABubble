import { Injectable, signal } from '@angular/core';
import { Message } from '../interfaces/message.interface';

@Injectable({
  providedIn: 'root'
})
export class ThreadService {
  isThreadOpen = signal<boolean>(false);
  activeMessage = signal<Message | null>(null);

  openThread(message: Message) {
    this.activeMessage.set(message);
    this.isThreadOpen.set(true);
  }

  closeThread() {
    this.isThreadOpen.set(false);
    this.activeMessage.set(null);
  }
}