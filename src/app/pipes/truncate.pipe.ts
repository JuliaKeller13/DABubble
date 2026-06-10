import { Pipe, PipeTransform } from '@angular/core';

/**
 * Pipe that shortens a string to a maximum length and appends an ellipsis
 * when the text exceeds that length. Used to keep long display names from
 * breaking layouts such as the sidebar or the header profile menu.
 */
@Pipe({
  name: 'truncate',
  standalone: true,
})
export class TruncatePipe implements PipeTransform {
  /**
   * Truncates the given value to the specified limit, appending an ellipsis
   * when the value is longer than the limit.
   *
   * @param value - The text to truncate.
   * @param limit - The maximum number of characters to keep. Defaults to 16.
   * @param ellipsis - The string appended after truncation. Defaults to '...'.
   * @returns The original value if within the limit, otherwise the truncated value with the ellipsis.
   */
  transform(value: string | null | undefined, limit = 15, ellipsis = '...'): string {
    if (!value) {
      return '';
    }
    return value.length > limit ? value.slice(0, limit) + ellipsis : value;
  }
}
