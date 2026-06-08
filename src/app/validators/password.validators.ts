import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

export const PASSWORD_MIN_LENGTH = 8;

export function buildPasswordValidators(): ValidatorFn[] {
  return [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)];
}

export function passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
  const p = control.get('password')?.value;
  const cpCtrl = control.get('confirmPassword');
  if (!cpCtrl) return null;
  const cp = cpCtrl.value;
  if (!p || !cp || p === cp) {
    clearPasswordMismatchError(cpCtrl);
    return null;
  }
  cpCtrl.setErrors({ ...(cpCtrl.errors ?? {}), passwordMismatch: true });
  return { passwordMismatch: true };
}

function clearPasswordMismatchError(control: AbstractControl): void {
  if (!control.hasError('passwordMismatch')) {
    return;
  }

  const errors = { ...(control.errors ?? {}) };
  delete errors['passwordMismatch'];

  control.setErrors(Object.keys(errors).length > 0 ? errors : null);
}