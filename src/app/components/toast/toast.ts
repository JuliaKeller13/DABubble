import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toast.html',
  styleUrl: './toast.scss'
})
/**
 * Component that displays transient application notifications (toast alerts).
 */
export class ToastComponent {
  /**
   * Service providing application toast state and controls.
   */
  private readonly toastService = inject(ToastService);

  /**
   * Computed signal retrieving the active toast data profile.
   */
  readonly toast = computed(() => this.toastService.toast());
}