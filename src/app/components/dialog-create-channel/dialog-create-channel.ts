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

    this.resetErrorState();
    const isDuplicate = await this.checkDuplicateName(trimmedName);
    if (isDuplicate) return;

    this.channelSaved.emit({
      name: trimmedName,
      description: this.channelDescription
    });
  }

  private resetErrorState(): void {
    this.nameExistsError = false;
    this.errorMessage = '';
    this.cdr.detectChanges();
  }

  private async checkDuplicateName(trimmedName: string): Promise<boolean> {
    try {
      if (await this.channelSvc.isChannelNameDuplicate(trimmedName)) {
        this.handleDuplicateError(trimmedName);
        return true;
      }
    } catch (error) {
      console.error('Error checking duplicate status:', error);
    }
    return false;
  }

  private handleDuplicateError(name: string): void {
    const isMember = this.channelSvc.channels().some(c => c.name.trim() === name);
    this.errorMessage = isMember 
      ? 'Dieser Name existiert bereits in deiner Channel-Liste.' 
      : 'Dieser Name ist bereits vergeben (der Channel ist für dich eventuell nicht sichtbar).';
    this.nameExistsError = true;
    this.cdr.detectChanges();
  }
}