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
import { AuthService } from '../../services/auth.service';
import { User } from '../../interfaces/user.interface';
import { userService } from '../../services/user.service';
import { channelService } from '../../services/channel.service';
import { ProfileDialogService } from '../../services/profile-dialog.service';
import { avatarService } from '../../services/avatar.service';

@Component({
	selector: 'app-dialog-profile',
	templateUrl: './dialog-profile.html',
	styleUrl: './dialog-profile.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'dialog-profile-host'
	}
})
export class DialogProfileComponent {
	private readonly authService = inject(AuthService);
	private readonly userSvc = inject(userService);
	private readonly channelSvc = inject(channelService);
	private readonly profileDialogSvc = inject(ProfileDialogService);
	private readonly avatarSvc = inject(avatarService);
	readonly isEditing = signal(false);
	readonly editableName = signal('');
	readonly editableAvatarUrl = signal('');
	readonly isSaving = signal(false);
	readonly availableAvatars = this.avatarSvc.getAvatars();

	readonly profile = input.required<User>();
	readonly variant = input<'default' | 'desktop-sheet'>('default');
	readonly closed = output<void>();

	constructor() {
		effect(() => this.resetEditableFields());
	}

	readonly headerTitle = computed(() => this.isEditing() ? 'Dein Profil bearbeiten' : 'Profil');
	readonly displayName = computed(() => this.profile().display_name.trim());
	readonly email = computed(() => this.profile().email.trim());
	readonly avatarUrl = computed(() => this.profile().avatar_url.trim() || this.avatarSvc.getDefaultAvatar());
	readonly isOnline = computed(() => {
		return this.authService.onlineUserIds().has(this.profile().id);
	});
	readonly canEdit = computed(() => {
		const currentUser = this.authService.currentUserProfile();
		return !!currentUser && this.profile().id === currentUser.id;
	});
	readonly cardClass = computed(() => {
		const roleClass = this.canEdit() ? 'dialog-profile--self' : 'dialog-profile--other';
		const variantClass = this.variant() === 'desktop-sheet' ? 'dialog-profile--desktop-sheet' : '';

		return `${roleClass} ${variantClass}`.trim();
	});

	closeDialog(): void {
		this.closed.emit();
	}

	requestEdit(): void {
		if (!this.canEdit()) {
			return;
		}

		this.resetEditableFields();
		this.isEditing.set(true);
	}

	cancelEdit(): void {
		this.resetEditableFields();
		this.isEditing.set(false);
	}

	selectAvatar(avatarUrl: string): void {
		this.editableAvatarUrl.set(avatarUrl);
	}

	updateEditableName(event: Event): void {
		const target = event.target as HTMLInputElement | null;
		this.editableName.set(target?.value ?? '');
	}

	async saveProfile(): Promise<void> {
		if (!this.canEdit() || !this.editableName().trim() || !this.editableAvatarUrl().trim() || this.isSaving()) {
			return;
		}

		this.isSaving.set(true);

		try {
			const updatedProfile = await this.authService.updateCurrentUserProfile(
				this.editableName(),
				this.editableAvatarUrl(),
			);

			if (updatedProfile) {
				this.profileDialogSvc.close();
			}
		} finally {
			this.isSaving.set(false);
		}
	}

	private resetEditableFields(): void {
		this.editableName.set(this.displayName());
		this.editableAvatarUrl.set(this.avatarUrl());
	}

	openDirectChat(): void {
		if (this.canEdit()) {
			return;
		}

		this.userSvc.selectDirectChatUser(this.profile());
		this.channelSvc.selectChannel(null);
		this.profileDialogSvc.close();
	}
}
