import { Injectable, inject } from '@angular/core';
import { EmojiData, EmojiService } from '@ctrl/ngx-emoji-mart/ngx-emoji';

interface RecentEmojiEntry {
  id: string;
  native: string;
}

/**
 * Service to manage and persist recently used emojis for individual users.
 * Emojis are stored in local storage, tracked by user ID, and capped to a maximum count.
 */
@Injectable({
  providedIn: 'root',
})
export class EmojiRecentService {
  /**
   * Injectable EmojiService instance from ngx-emoji-mart to resolve and sanitize emoji metadata.
   */
  private readonly emojiSvc = inject(EmojiService);

  /**
   * Prefix used for key names when storing entries in localStorage.
   */
  private readonly storagePrefix = 'recent_picker_emojis:';

  /**
   * The maximum number of recent emoji entries kept in storage.
   */
  private readonly maxEntries = 24;

  /**
   * Retrieves the IDs of recently selected emojis up to a specific limit.
   * 
   * @param userId The ID of the current user.
   * @param limit The maximum number of emoji IDs to retrieve. Defaults to 36.
   * @returns An array of emoji ID strings.
   */
  getPickerRecentIds(userId: string, limit = 36): string[] {
    return this.readEntries(userId).slice(0, limit).map((entry) => entry.id);
  }

  /**
   * Retrieves recent native emojis and merges them with a fallback set to meet the requested limit.
   * 
   * @param userId The ID of the current user.
   * @param limit The absolute number of emojis to return.
   * @param fallback The fallback list of native emojis to merge with if recent storage has fewer entries.
   * @returns An array of unique native emoji strings.
   */
  getRecentReactionEmojis(userId: string, limit: number, fallback: string[]): string[] {
    const recent = this.readEntries(userId).map((entry) => entry.native);
    return this.mergeUnique(recent, fallback).slice(0, limit);
  }

  /**
   * Saves a recently selected emoji object to local storage.
   * 
   * @param userId The ID of the current user.
   * @param emoji Partial emoji data from emoji picker containing id and native character.
   */
  recordRecentSelection(userId: string, emoji?: Partial<EmojiData> | null): void {
    if (!userId || !emoji) {
      return;
    }

    const id = typeof emoji.id === 'string' ? emoji.id : '';
    const native = typeof emoji.native === 'string'
      ? emoji.native
      : (id ? this.emojiSvc.getData(id)?.native ?? '' : '');

    if (!id || !native) {
      return;
    }

    this.writeEntry(userId, { id, native });
  }

  /**
   * Saves a recently selected native emoji character directly by lookup.
   * 
   * @param userId The ID of the current user.
   * @param emoji The native emoji character.
   */
  recordRecentNativeEmoji(userId: string, emoji: string): void {
    if (!userId || !emoji) {
      return;
    }

    const emojiData = this.emojiSvc.getSanitizedData(emoji);
    if (!emojiData?.id || !emojiData.native) {
      return;
    }

    this.writeEntry(userId, { id: emojiData.id, native: emojiData.native });
  }

  /**
   * Writes the updated recent emoji entries to localStorage.
   * 
   * @param userId The ID of the current user.
   * @param nextEntry The newly selected emoji entry to prepend.
   */
  private writeEntry(userId: string, nextEntry: RecentEmojiEntry): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    const entries = this.readEntries(userId)
      .filter((entry) => entry.id !== nextEntry.id);

    entries.unshift(nextEntry);
    localStorage.setItem(this.storageKey(userId), JSON.stringify(entries.slice(0, this.maxEntries)));
  }

  /**
   * Reads and parses the recent emoji entries from localStorage.
   * 
   * @param userId The ID of the current user.
   * @returns An array of recent emoji entries.
   */
  private readEntries(userId: string): RecentEmojiEntry[] {
    if (!userId || typeof localStorage === 'undefined') {
      return [];
    }

    const raw = localStorage.getItem(this.storageKey(userId));
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((entry) => this.normalizeEntry(entry))
        .filter((entry): entry is RecentEmojiEntry => !!entry);
    } catch {
      return [];
    }
  }

  /**
   * Normalizes any input format (such as string or object) into a RecentEmojiEntry or returns null if invalid.
   * 
   * @param value The raw entry value from storage.
   * @returns The normalized entry, or null if it cannot be normalized.
   */
  private normalizeEntry(value: unknown): RecentEmojiEntry | null {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      const emojiData = this.emojiSvc.getSanitizedData(value);
      if (!emojiData?.id || !emojiData.native) {
        return null;
      }

      return { id: emojiData.id, native: emojiData.native };
    }

    if (typeof value !== 'object') {
      return null;
    }

    const entry = value as Partial<RecentEmojiEntry>;
    if (typeof entry.id !== 'string' || typeof entry.native !== 'string') {
      return null;
    }

    return { id: entry.id, native: entry.native };
  }

  /**
   * Merges two string arrays, retaining only unique entries.
   * 
   * @param primary The primary array of emoji strings.
   * @param fallback The fallback array of emoji strings.
   * @returns A merged array containing unique values.
   */
  private mergeUnique(primary: string[], fallback: string[]): string[] {
    return [...primary, ...fallback].filter((emoji, index, array) => !!emoji && array.indexOf(emoji) === index);
  }

  /**
   * Computes the localStorage key for a specific user ID.
   * 
   * @param userId The ID of the current user.
   * @returns The calculated localStorage key string.
   */
  private storageKey(userId: string): string {
    return `${this.storagePrefix}${userId}`;
  }
}