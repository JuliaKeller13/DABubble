import { Component, inject, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { channelService } from '../../services/channel.service';

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
  private channelSvc = inject(channelService);
  private cdr = inject(ChangeDetectorRef);

  @Output() channelSaved = new EventEmitter<{ name: string, description: string }>();

  channelName = '';
  channelDescription = '';
  nameExistsError = false;
  errorMessage = '';

  
  closeDialog(): void {
    this.dialogRef.close();
  }

  
  async saveChannel(): Promise<void> {
    const trimmedName = this.channelName.trim();
    if (!trimmedName) return;

    this.nameExistsError = false;
    this.errorMessage = '';
    this.cdr.detectChanges();

    try {
      const isDuplicate = await this.channelSvc.isChannelNameDuplicate(trimmedName);
      if (isDuplicate) {
        const isMember = this.channelSvc.channels().some(
          c => c.name.trim() === trimmedName
        );
        if (isMember) {
          this.errorMessage = 'Dieser Name existiert bereits in deiner Channel-Liste.';
        } else {
          this.errorMessage = 'Dieser Name ist bereits vergeben (der Channel ist für dich eventuell nicht sichtbar).';
        }
        this.nameExistsError = true;
        this.cdr.detectChanges();
        return;
      }
    } catch (error) {
      console.error('Error checking channel name duplicate status:', error);
    }

    this.channelSaved.emit({
      name: trimmedName,
      description: this.channelDescription
    });
  }
}