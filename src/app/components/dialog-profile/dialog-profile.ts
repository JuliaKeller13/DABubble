import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
	output,
} from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { User } from '../../interfaces/user.interface';

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

	readonly profile = input.required<User>();
	readonly variant = input<'default' | 'desktop-sheet'>('default');
	readonly closed = output<void>();
	readonly editRequested = output<User | null>();

	readonly displayName = computed(() => this.profile().display_name.trim());
	readonly email = computed(() => this.profile().email.trim());
	readonly avatarUrl = computed(() => this.profile().avatar_url.trim() || 'img/avatars/avatar_male_4.svg');
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

		this.editRequested.emit(this.profile());
	}
}
