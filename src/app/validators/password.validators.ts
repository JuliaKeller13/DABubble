import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

/**
 * Minimum required length for user passwords.
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Builds and returns an array of validators required for password fields.
 * Includes a requirement validator and a minimum length validator.
 * 
 * @returns An array of Angular ValidatorFn instances.
 */
export function buildPasswordValidators(): ValidatorFn[] {
  return [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)];
}

/**
 * Form group validator to verify that the 'password' and 'confirmPassword' fields match.
 * If they do not match, sets the 'passwordMismatch' error on the 'confirmPassword' control.
 * 
 * @param control - The parent form group or control containing 'password' and 'confirmPassword' controls.
 * @returns A ValidationErrors object with passwordMismatch if they do not match, otherwise null.
 */
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

/**
 * Removes the 'passwordMismatch' error from the specified form control.
 * If other errors exist, they are preserved; otherwise, the control's errors are cleared.
 * 
 * @param control - The form control to clear the 'passwordMismatch' error from.
 */
function clearPasswordMismatchError(control: AbstractControl): void {
  if (!control.hasError('passwordMismatch')) {
    return;
  }

  const errors = { ...(control.errors ?? {}) };
  delete errors['passwordMismatch'];

  control.setErrors(Object.keys(errors).length > 0 ? errors : null);
}