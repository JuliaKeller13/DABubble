import { Component, inject } from '@angular/core';
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

  channelName = '';
  channelDescription = '';

  // Close dialog
  closeDialog(): void {
    this.dialogRef.close();
  }

  // Submit channel data if name is set
  saveChannel(): void {
    if (this.channelName.trim()) {
      this.dialogRef.close({
        name: this.channelName,
        description: this.channelDescription
      });
    }
  }
}