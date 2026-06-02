import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toast.html',
  styleUrl: './toast.scss'
})
export class ToastComponent {
  private readonly toastService = inject(ToastService);

  readonly toast = computed(() => this.toastService.toast());
}
