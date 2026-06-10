import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	input,
	output,
	signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { authService } from '../../services/auth.service';
import { User } from '../../interfaces/user.interface';
import { userService } from '../../services/user.service';
import { channelService } from '../../services/channel.service';
import { ProfileDialogService } from '../../services/profile-dialog.service';
import { avatarService } from '../../services/avatar.service';
import { ToastService } from '../../services/toast.service';

@Component({
	selector: 'app-dialog-profile',
	templateUrl: './dialog-profile.html',
	styleUrl: './dialog-profile.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'dialog-profile-host'
	}
})
/**
 * Component representing the user profile dialog.
 * Supports viewing details of any user, editing name and avatar for the current user,
 * opening direct chats, or deleting the user's account.
 */
export class DialogProfileComponent {
	/**
	 * Authentication service injected to verify current user and execute profile edits or account deletion.
	 * @private
	 */
	private readonly authService = inject(authService);
	/**
	 * User service injected for user profile query.
	 * @private
	 */
	private readonly userSvc = inject(userService);
	/**
	 * Channel service.
	 * @private
	 */
	private readonly channelSvc = inject(channelService);
	/**
	 * Service managing the state and opening/closing of the profile dialog overlay.
	 * @private
	 */
	private readonly profileDialogSvc = inject(ProfileDialogService);
	/**
	 * Avatar service injected to load available avatars.
	 * @private
	 */
	private readonly avatarSvc = inject(avatarService);
	/**
	 * Router injected for navigating to chat routes or login page after deletion.
	 * @private
	 */
	private readonly router = inject(Router);
	/**
	 * Toast service injected to show feedback notifications.
	 * @private
	 */
	private readonly toastSvc = inject(ToastService);

	/**
	 * Signal storing whether the profile is currently in edit mode.
	 */
	readonly isEditing = signal(false);
	/**
	 * Writable signal storing the temporary editable display name.
	 */
	readonly editableName = signal('');
	/**
	 * Writable signal storing the temporary selected avatar URL.
	 */
	readonly editableAvatarUrl = signal('');
	/**
	 * Signal indicating whether the profile save action is in progress.
	 */
	readonly isSaving = signal(false);
	/**
	 * Signal indicating whether the account delete confirmation dialog is open.
	 */
	readonly isDeleteConfirmOpen = signal(false);
	/**
	 * Signal indicating whether account deletion process is currently ongoing.
	 */
	readonly isDeletingAccount = signal(false);
	/**
	 * List of all available avatar image URLs.
	 */
	readonly availableAvatars = this.avatarSvc.getAvatars();

	/**
	 * Required input signal containing the User profile data to display.
	 */
	readonly profile = input.required<User>();
	/**
	 * Optional input signal specifying the visual variant of the profile dialog ('default' or 'desktop-sheet').
	 */
	readonly variant = input<'default' | 'desktop-sheet'>('default');
	/**
	 * Output emitter triggered when the profile dialog is closed.
	 */
	readonly closed = output<void>();

	/**
	 * Constructor. Registers an effect to synchronize editable fields when the profile input signal changes.
	 */
	constructor() {
		effect(() => this.resetEditableFields());
	}

	/**
	 * Computed signal returning the appropriate title for the dialog header based on edit state.
	 */
	readonly headerTitle = computed(() => this.isEditing() ? 'Dein Profil bearbeiten' : 'Profil');
	/**
	 * Computed signal returning the trimmed display name of the profile.
	 */
	readonly displayName = computed(() => (this.profile().display_name || '').trim());
	/**
	 * Computed signal returning the trimmed email of the profile.
	 */
	readonly email = computed(() => (this.profile().email || '').trim());
	/**
	 * Computed signal returning the avatar URL of the profile or a default avatar fallback.
	 */
	readonly avatarUrl = computed(() => (this.profile().avatar_url || '').trim() || this.avatarSvc.getDefaultAvatar());
	/**
	 * Computed signal returning true if the profile owner is currently online.
	 */
	readonly isOnline = computed(() => {
		return this.authService.onlineUserIds().has(this.profile().id);
	});
	/**
	 * Computed signal returning true if the active profile is that of the currently logged-in user.
	 */
	readonly canEdit = computed(() => {
		const currentUser = this.authService.currentUserProfile();
		return !!currentUser && this.profile().id === currentUser.id;
	});
	/**
	 * Computed signal returning the combined CSS classes applied to the profile card wrapper.
	 */
	readonly cardClass = computed(() => {
		const roleClass = this.canEdit() ? 'dialog-profile--self' : 'dialog-profile--other';
		const variantClass = this.variant() === 'desktop-sheet' ? 'dialog-profile--desktop-sheet' : '';

		return `${roleClass} ${variantClass}`.trim();
	});

	/**
	 * Closes the dialog and emits the closed output.
	 */
	closeDialog(): void {
		this.closed.emit();
	}

	/**
	 * Puts the dialog into edit mode if the current user owns this profile.
	 */
	requestEdit(): void {
		if (!this.canEdit()) {
			return;
		}

		this.resetEditableFields();
		this.isEditing.set(true);
	}

	/**
	 * Cancels editing mode and restores the original user profile values.
	 */
	cancelEdit(): void {
		this.isDeleteConfirmOpen.set(false);
		this.resetEditableFields();
		this.isEditing.set(false);
	}

	/**
	 * Opens the account deletion confirmation overlay.
	 */
	requestAccountDelete(): void {
		if (!this.canEdit() || this.isDeletingAccount()) {
			return;
		}

		this.isDeleteConfirmOpen.set(true);
	}

	/**
	 * Closes the account deletion confirmation overlay.
	 */
	cancelAccountDelete(): void {
		this.isDeleteConfirmOpen.set(false);
	}

	/**
	 * Selects an avatar and sets the temp editable avatar URL.
	 * @param avatarUrl The URL of the avatar.
	 */
	selectAvatar(avatarUrl: string): void {
		this.editableAvatarUrl.set(avatarUrl);
	}

	/**
	 * Updates the editable display name when the user inputs text.
	 * @param event The input change event.
	 */
	updateEditableName(event: Event): void {
		const target = event.target as HTMLInputElement | null;
		this.editableName.set(target?.value ?? '');
	}

	/**
	 * Saves profile updates (name and avatar URL) via the authentication service.
	 * @returns A promise resolving when saving attempt concludes.
	 */
	async saveProfile(): Promise<void> {
		if (!this.canSaveProfile()) return;
		this.isSaving.set(true);
		try {
			const updated = await this.authService.updateCurrentUserProfile(this.editableName(), this.editableAvatarUrl());
			if (updated) this.profileDialogSvc.close();
		} finally {
			this.isSaving.set(false);
		}
	}

	/**
	 * Checks whether the edited profile can be saved.
	 * @returns True if input values are valid, user is authorized, and save is not already in progress.
	 * @private
	 */
	private canSaveProfile(): boolean {
		return !!(this.canEdit() && this.editableName().trim() && this.editableAvatarUrl().trim() && !this.isSaving());
	}

	/**
	 * Deletes the logged-in user's account after confirmation.
	 * @returns A promise resolving when account deletion attempt completes.
	 */
	async confirmAccountDelete(): Promise<void> {
		if (!this.canEdit() || this.isDeletingAccount()) return;
		this.isDeletingAccount.set(true);
		try {
			if (await this.authService.deleteCurrentUserAccount()) {
				await this.handleAccountDeleted();
			} else {
				this.toastSvc.show('Account konnte nicht gelöscht werden.', 'error', 3000, undefined, false);
			}
		} finally {
			this.isDeletingAccount.set(false);
		}
	}

	/**
	 * Redirects and triggers toasts once the account is successfully deleted.
	 * @returns A promise resolving when navigation finishes.
	 * @private
	 */
	private async handleAccountDeleted(): Promise<void> {
		this.isDeleteConfirmOpen.set(false);
		this.profileDialogSvc.close();
		this.toastSvc.show('Account wurde gelöscht.', 'success', 3000, undefined, false);
		await this.router.navigate(['/login']);
	}

	/**
	 * Resets editing values back to original user values.
	 * @private
	 */
	private resetEditableFields(): void {
		this.editableName.set(this.displayName());
		this.editableAvatarUrl.set(this.avatarUrl());
	}

	/**
	 * Opens a direct message chat room with the active user profile, then closes the dialog overlay.
	 */
	openDirectChat(): void {
		if (this.canEdit()) {
			return;
		}

		this.router.navigate(['/main/dm', this.profile().id]);
		this.profileDialogSvc.close();
	}
}
