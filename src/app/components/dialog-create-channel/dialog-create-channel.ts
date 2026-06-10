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
/**
 * Component representing the dialog used to create a new channel.
 * Validates channel name uniqueness and emits a completion event with name and description.
 */
export class dialogCreateChannelComponent {
  /**
   * Reference to the dialog instance.
   * @private
   */
  private dialogRef = inject(MatDialogRef<dialogCreateChannelComponent>);
  /**
   * Channel service used to query existing channel names.
   * @private
   */
  private channelSvc = inject(channelService);
  /**
   * Angular change detector ref to manually trigger view updates.
   * @private
   */
  private cdr = inject(ChangeDetectorRef);

  /**
   * Event emitted when the channel is successfully configured and saved.
   */
  @Output() channelSaved = new EventEmitter<{ name: string, description: string }>();

  /**
   * Name of the new channel being created.
   */
  channelName = '';
  /**
   * Description of the new channel being created.
   */
  channelDescription = '';
  /**
   * Boolean flag indicating whether the entered channel name is already taken.
   */
  nameExistsError = false;
  /**
   * Error message displayed if name validation fails.
   */
  errorMessage = '';

  /**
   * Closes the creation dialog without saving.
   */
  closeDialog(): void {
    this.dialogRef.close();
  }

  /**
   * Validates the input channel name for duplicates, and if unique, emits the channelSaved event.
   * @returns A promise that resolves when verification and save attempt complete.
   */
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

  /**
   * Resets the error flag and warning messages.
   * @private
   */
  private resetErrorState(): void {
    this.nameExistsError = false;
    this.errorMessage = '';
    this.cdr.detectChanges();
  }

  /**
   * Checks whether the channel name is already in use by querying the channel service.
   * @param trimmedName The channel name to test.
   * @returns A promise resolving to true if duplicate, false otherwise.
   * @private
   */
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

  /**
   * Formulates the exact error message based on whether the duplicate channel is visible or hidden to the user.
   * @param name The channel name that is duplicate.
   * @private
   */
  private handleDuplicateError(name: string): void {
    const isMember = this.channelSvc.channels().some(c => c.name.trim() === name);
    this.errorMessage = isMember 
      ? 'Dieser Name existiert bereits in deiner Channel-Liste.' 
      : 'Dieser Name ist bereits vergeben (der Channel ist für dich eventuell nicht sichtbar).';
    this.nameExistsError = true;
    this.cdr.detectChanges();
  }
}