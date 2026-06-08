import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class avatarService {
  private avatars: string[] = [
    'img/avatars/avatar_female_1.svg',
    'img/avatars/avatar_female_2.svg',
    'img/avatars/avatar_male_1.svg',
    'img/avatars/avatar_male_2.svg',
    'img/avatars/avatar_male_3.svg',
    'img/avatars/avatar_male_4.svg'
  ];

  private defaultAvatar = 'img/avatars/avatar_default.svg';

  
  getAvatars(): string[] {
    return this.avatars;
  }

  
  getDefaultAvatar(): string {
    return this.defaultAvatar;
  }

  normalizeAvatarUrl(avatarUrl: string): string {
    const trimmedUrl = avatarUrl.trim();
    const parsedUrl = this.tryParseUrl(trimmedUrl);
    if (!trimmedUrl || !parsedUrl || !this.isGoogleAvatarUrl(parsedUrl)) return trimmedUrl;
    return this.upgradeGoogleAvatarSize(trimmedUrl, parsedUrl);
  }

  private tryParseUrl(avatarUrl: string): URL | null {
    try {
      return new URL(avatarUrl);
    } catch {
      return null;
    }
  }

  private isGoogleAvatarUrl(parsedUrl: URL): boolean {
    return parsedUrl.hostname.includes('googleusercontent.com');
  }

  private upgradeGoogleAvatarSize(avatarUrl: string, parsedUrl: URL): string {
    if (!parsedUrl.searchParams.has('sz')) {
      return avatarUrl.replace(/=s\d+(-c)?$/, '=s512-c');
    }

    parsedUrl.searchParams.set('sz', '512');
    return parsedUrl.toString();
  }
}
