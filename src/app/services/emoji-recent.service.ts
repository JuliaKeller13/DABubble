import { Injectable, inject } from '@angular/core';
import { EmojiData, EmojiService } from '@ctrl/ngx-emoji-mart/ngx-emoji';

interface RecentEmojiEntry {
  id: string;
  native: string;
}

@Injectable({
  providedIn: 'root',
})
export class EmojiRecentService {
  private readonly emojiSvc = inject(EmojiService);
  private readonly storagePrefix = 'recent_picker_emojis:';
  private readonly maxEntries = 24;

  getPickerRecentIds(userId: string, limit = 36): string[] {
    return this.readEntries(userId).slice(0, limit).map((entry) => entry.id);
  }

  getRecentReactionEmojis(userId: string, limit: number, fallback: string[]): string[] {
    const recent = this.readEntries(userId).map((entry) => entry.native);
    return this.mergeUnique(recent, fallback).slice(0, limit);
  }

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

  private writeEntry(userId: string, nextEntry: RecentEmojiEntry): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    const entries = this.readEntries(userId)
      .filter((entry) => entry.id !== nextEntry.id);

    entries.unshift(nextEntry);
    localStorage.setItem(this.storageKey(userId), JSON.stringify(entries.slice(0, this.maxEntries)));
  }

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

  private mergeUnique(primary: string[], fallback: string[]): string[] {
    return [...primary, ...fallback].filter((emoji, index, array) => !!emoji && array.indexOf(emoji) === index);
  }

  private storageKey(userId: string): string {
    return `${this.storagePrefix}${userId}`;
  }
}