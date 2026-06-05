import { Component, inject, Output, EventEmitter } from '@angular/core';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-dialog-create-channel',
  standalone: true,
  imports: [
    MatDialogModule,
    FormsModule
  ],
  templateUrl: './dialog-create-channel.html',
  styleUrl: './dialog-create-channel.scss'
})
export class dialogCreateChannelComponent {
  private dialogRef = inject(MatDialogRef<dialogCreateChannelComponent>);

  @Output() channelSaved = new EventEmitter<{ name: string, description: string }>();

  channelName = '';
  channelDescription = '';

  
  closeDialog(): void {
    this.dialogRef.close();
  }

  
  saveChannel(): void {
    if (this.channelName.trim()) {
      this.channelSaved.emit({
        name: this.channelName,
        description: this.channelDescription
      });
    }
  }
}