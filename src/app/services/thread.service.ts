import { Injectable, signal } from '@angular/core';
import { Message } from '../interfaces/message.interface';

/**
 * Service to manage the open/closed state of the thread detail panel and
 * track the currently active thread's parent/root message.
 */
@Injectable({
  providedIn: 'root'
})
export class ThreadService {
  /**
   * Signal indicating whether the thread view/panel is open.
   */
  isThreadOpen = signal<boolean>(false);

  /**
   * Signal holding the root parent message of the currently active thread.
   */
  activeMessage = signal<Message | null>(null);

  /**
   * Opens the thread panel and selects the specified message as the thread root.
   * 
   * @param message - The root Message of the thread to open.
   */
  openThread(message: Message) {
    this.activeMessage.set(message);
    this.isThreadOpen.set(true);
  }

  /**
   * Closes the thread panel and deselects the active root message.
   */
  closeThread() {
    this.isThreadOpen.set(false);
    this.activeMessage.set(null);
  }
}