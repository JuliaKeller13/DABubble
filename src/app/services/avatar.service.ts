import { Injectable } from '@angular/core';

/**
 * Service to manage user avatars, including retrieving default avatars and normalizing
 * or upgrading the resolution of Google user avatar URLs.
 */
@Injectable({
  providedIn: 'root'
})
export class avatarService {
  /**
   * List of available avatar image paths.
   */
  private avatars: string[] = [
    'img/avatars/avatar_female_1.svg',
    'img/avatars/avatar_female_2.svg',
    'img/avatars/avatar_male_1.svg',
    'img/avatars/avatar_male_2.svg',
    'img/avatars/avatar_male_3.svg',
    'img/avatars/avatar_male_4.svg'
  ];

  /**
   * Path to the default avatar image.
   */
  private defaultAvatar = 'img/avatars/avatar_default.svg';

  /**
   * Retrieves the list of all available avatar image paths.
   * 
   * @returns An array of avatar image path strings.
   */
  getAvatars(): string[] {
    return this.avatars;
  }

  /**
   * Retrieves the default avatar image path.
   * 
   * @returns The default avatar image path string.
   */
  getDefaultAvatar(): string {
    return this.defaultAvatar;
  }

  /**
   * Normalizes the avatar URL. If it is a Google avatar, it attempts to upgrade the resolution to 512px.
   * 
   * @param avatarUrl The raw avatar URL string.
   * @returns The normalized avatar URL string.
   */
  normalizeAvatarUrl(avatarUrl: string): string {
    const trimmedUrl = avatarUrl.trim();
    const parsedUrl = this.tryParseUrl(trimmedUrl);
    if (!trimmedUrl || !parsedUrl || !this.isGoogleAvatarUrl(parsedUrl)) return trimmedUrl;
    return this.upgradeGoogleAvatarSize(trimmedUrl, parsedUrl);
  }

  /**
   * Attempts to parse a string into a URL object.
   * 
   * @param avatarUrl The URL string to parse.
   * @returns A URL object if parsing succeeds, or null if it fails.
   */
  private tryParseUrl(avatarUrl: string): URL | null {
    try {
      return new URL(avatarUrl);
    } catch {
      return null;
    }
  }

  /**
   * Checks if the parsed URL belongs to Google's user content domain.
   * 
   * @param parsedUrl The URL object to check.
   * @returns True if it is a Google avatar URL, false otherwise.
   */
  private isGoogleAvatarUrl(parsedUrl: URL): boolean {
    return parsedUrl.hostname.includes('googleusercontent.com');
  }

  /**
   * Upgrades the resolution parameters of a Google avatar URL to 512 pixels.
   * 
   * @param avatarUrl The original avatar URL string.
   * @param parsedUrl The parsed URL object.
   * @returns The modified URL string with increased resolution settings.
   */
  private upgradeGoogleAvatarSize(avatarUrl: string, parsedUrl: URL): string {
    if (!parsedUrl.searchParams.has('sz')) {
      return avatarUrl.replace(/=s\d+(-c)?$/, '=s512-c');
    }

    parsedUrl.searchParams.set('sz', '512');
    return parsedUrl.toString();
  }
}
