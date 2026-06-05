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
}
