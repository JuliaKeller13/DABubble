import { Injectable, inject } from '@angular/core';
import { channelService } from './channel.service';
import { User } from '../interfaces/user.interface';
import { Channel } from '../interfaces/channel.interface';

@Injectable({
  providedIn: 'root',
})
export class MessageEncodingService {
  private channelSvc = inject(channelService);

  zeroWidthToMarkup(text: string): string {
    if (!text) return '';
    let result = this.replaceUserMentions(text);
    result = this.replaceChannelMentions(result);
    return result;
  }

  private replaceUserMentions(text: string): string {
    const userMentionRegex = /@([^\u200B]+)\u200B([\u200B\u200C\u200D]+)/g;
    return text.replace(userMentionRegex, (match, _name, zeroWidthId) => {
      const userId = this.decodeFromZeroWidth(zeroWidthId);
      return userId ? `<@${userId}>` : match;
    });
  }

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

  markupToZeroWidth(text: string, users: User[], channels: Channel[]): string {
    if (!text) return '';
    let result = this.replaceMarkupUsers(text, users);
    result = this.replaceMarkupChannels(result, channels);
    return result;
  }

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

  private replaceMarkupChannels(text: string, channels: Channel[]): string {
    const channelRegex = /<#([a-f0-9-]{36})>/gi;
    return text.replace(channelRegex, (match, channelId) => {
      const channel = channels.find((c) => c.id === channelId);
      return channel ? `#${channel.name}` : '#Gelöschter Channel';
    });
  }

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

  decodeFromZeroWidth(zeroWidthStr: string): string {
    const clean = zeroWidthStr.replace(/[^\u200B\u200C\u200D]/g, '');
    if (!clean) return '';
    return clean
      .split('\u200B')
      .map((binarySeq) => {
        const binary = binarySeq
          .split('')
          .map((char) => (char === '\u200C' ? '0' : '1'))
          .join('');
        if (!binary) return '';
        return String.fromCharCode(parseInt(binary, 2));
      })
      .join('');
  }
}
