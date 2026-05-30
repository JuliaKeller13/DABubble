import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class avatarService {
  // Available avatar paths relative to the public directory
  private avatars: string[] = [
    'img/avatars/avatar_female_1.svg',
    'img/avatars/avatar_female_2.svg',
    'img/avatars/avatar_male_1.svg',
    'img/avatars/avatar_male_2.svg',
    'img/avatars/avatar_male_3.svg',
    'img/avatars/avatar_male_4.svg'
  ];

  // Default avatar when none is selected
  private defaultAvatar = 'img/avatars/avatar_default.svg';

  // Get list of all available avatar paths
  getAvatars(): string[] {
    return this.avatars;
  }

  // Get default avatar path
  getDefaultAvatar(): string {
    return this.defaultAvatar;
  }
}
