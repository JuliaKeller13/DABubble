import { Injectable, inject } from '@angular/core';
import { channelService } from './channel.service';
import { User } from '../interfaces/user.interface';
import { Channel } from '../interfaces/channel.interface';

@Injectable({
  providedIn: 'root',
})
/**
 * Service that handles encoding and decoding of user and channel mentions in messages.
 * It translates standard markup tags (e.g., `<@userId>`, `<#channelId>`) to/from a format
 * using zero-width characters for clean presentation.
 */
export class MessageEncodingService {
  /**
   * The injected channelService instance.
   */
  private channelSvc = inject(channelService);

  /**
   * Converts zero-width encoded mentions within a text string back into standard markup.
   *
   * @param text - The raw text containing zero-width character mentions.
   * @returns The text formatted with markup tags (e.g., `<@userId>`).
   */
  zeroWidthToMarkup(text: string): string {
    if (!text) return '';
    let result = this.replaceUserMentions(text);
    result = this.replaceChannelMentions(result);
    return result;
  }

  /**
   * Replaces user mentions (encoded using zero-width space characters) with `<@userId>` markup.
   *
   * @param text - The text to process.
   * @returns The text with user markup tags.
   */
  private replaceUserMentions(text: string): string {
    const userMentionRegex = /@([^\u200B]+)\u200B([\u200B\u200C\u200D]+)/g;
    return text.replace(userMentionRegex, (match, _name, zeroWidthId) => {
      const userId = this.decodeFromZeroWidth(zeroWidthId);
      return userId ? `<@${userId}>` : match;
    });
  }

  /**
   * Replaces hashtag channel mentions with `<#channelId>` markup matching channel names.
   *
   * @param text - The text to process.
   * @returns The text with channel markup tags.
   */
  private replaceChannelMentions(text: string): string {
    let result = text;
    this.channelSvc.channels().forEach((ch) => {
      if (!ch.id || !ch.name) return;
      const escapedName = ch.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const channelRegex = new RegExp(`(^|\\s)#${escapedName}\\b`, 'g');
      result = result.replace(channelRegex, `$1<#${ch.id}>`);
    });
    return result;
  }

  /**
   * Converts markup tags inside a text string into readable text containing zero-width encoded IDs.
   *
   * @param text - The text containing markup tags.
   * @param users - An array of available User profiles.
   * @param channels - An array of available Channels.
   * @returns The text with zero-width encoded mentions.
   */
  markupToZeroWidth(text: string, users: User[], channels: Channel[]): string {
    if (!text) return '';
    let result = this.replaceMarkupUsers(text, users);
    result = this.replaceMarkupChannels(result, channels);
    return result;
  }

  /**
   * Translates `<@userId>` markup tags into `@display_name\u200BencodedUserId` format.
   *
   * @param text - The text containing user markup tags.
   * @param users - The list of current users.
   * @returns The text with zero-width encoded user mentions.
   */
  private replaceMarkupUsers(text: string, users: User[]): string {
    const userRegex = /<@([a-f0-9-]{36})>/gi;
    return text.replace(userRegex, (match, userId) => {
      if (!userId) return match;
      const user = users.find((u) => u.id === userId);
      if (user) {
        const zeroWidthId = this.encodeToZeroWidth(userId);
        return `@${user.display_name}\u200B${zeroWidthId}`;
      }
      return '@Gelöschter User';
    });
  }

  /**
   * Translates `<#channelId>` markup tags into human-readable `#channelName` strings.
   *
   * @param text - The text containing channel markup tags.
   * @param channels - The list of current channels.
   * @returns The text with readable channel names.
   */
  private replaceMarkupChannels(text: string, channels: Channel[]): string {
    const channelRegex = /<#([a-f0-9-]{36})>/gi;
    return text.replace(channelRegex, (match, channelId) => {
      const channel = channels.find((c) => c.id === channelId);
      return channel ? `#${channel.name}` : '#Gelöschter Channel';
    });
  }

  /**
   * Encodes a standard UTF-8 string into a sequence of zero-width space characters.
   *
   * @param str - The string to encode (typically a UUID).
   * @returns The encoded zero-width character string.
   */
  encodeToZeroWidth(str: string): string {
    return str
      .split('')
      .map((char) => {
        const binary = char.charCodeAt(0).toString(2).padStart(8, '0');
        return binary
          .split('')
          .map((bit) => (bit === '0' ? '\u200C' : '\u200D'))
          .join('');
      })
      .join('\u200B');
  }

  /**
   * Decodes a zero-width space character sequence back into its original standard UTF-8 string.
   *
   * @param zeroWidthStr - The zero-width space string.
   * @returns The decoded original string.
   */
  decodeFromZeroWidth(zeroWidthStr: string): string {
    const clean = zeroWidthStr.replace(/[^\u200B\u200C\u200D]/g, '');
    if (!clean) return '';
    return clean
      .split('\u200B')
      .map((binarySeq) => {
        const binary = binarySeq.split('').map((char) => (char === '\u200C' ? '0' : '1')).join('');
        return binary ? String.fromCharCode(parseInt(binary, 2)) : '';
      })
      .join('');
  }
}
