import { Component, Output, EventEmitter, Input } from '@angular/core';

@Component({
  selector: 'app-dialog-channel-details',
  standalone: true,
  imports: [],
  templateUrl: './dialog-channel-details.html',
  styleUrl: './dialog-channel-details.scss'
})
export class DialogChannelDetailsComponent {
  @Input() isSidebarClosed = false;
  @Output() close = new EventEmitter<void>();

  onClose() {
    this.close.emit();
  }

  onLeaveChannel() {
    this.close.emit();
  }

  onEditName() {
  }

  onEditDescription() {
  }
}
