import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-dialog-add-member',
  standalone: true,
  imports: [
    MatDialogModule,
    FormsModule
  ],
  templateUrl: './dialog-add-member.html',
  styleUrl: './dialog-add-member.scss'
})
export class dialogAddMemberComponent {
  private dialogRef = inject(MatDialogRef<dialogAddMemberComponent>);
  public data = inject<{ channelName: string }>(MAT_DIALOG_DATA);

  selectionType: 'all' | 'specific' = 'all';

  // Close dialog
  closeDialog(): void {
    this.dialogRef.close();
  }

  // Submit selection and close
  saveSelection(): void {
    this.dialogRef.close({
      selectionType: this.selectionType
    });
  }
}
