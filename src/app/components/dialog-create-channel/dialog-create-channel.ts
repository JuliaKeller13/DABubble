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

  // Close the dialog
  closeDialog(): void {
    this.dialogRef.close();
  }

  // Emit channel data to the parent component
  saveChannel(): void {
    if (this.channelName.trim()) {
      this.channelSaved.emit({
        name: this.channelName,
        description: this.channelDescription
      });
    }
  }
}