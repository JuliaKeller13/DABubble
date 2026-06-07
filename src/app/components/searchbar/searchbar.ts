import { Component, ElementRef, HostListener, inject, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { messageService } from '../../services/message.service';
import { authService } from '../../services/auth.service';
import { ThreadService } from '../../services/thread.service';
import { supabaseService } from '../../services/supabase.service';
import { Channel } from '../../interfaces/channel.interface';
import { User } from '../../interfaces/user.interface';
import { Message } from '../../interfaces/message.interface';

@Component({
  selector: 'app-searchbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './searchbar.html',
  styleUrl: './searchbar.scss'
})
export class SearchBarComponent implements OnInit {
  private channelSvc = inject(channelService);
  private userSvc = inject(userService);
  private messageSvc = inject(messageService);
  private authSvc = inject(authService);
  private threadSvc = inject(ThreadService);
  private supabaseSvc = inject(supabaseService);
  private elementRef = inject(ElementRef);
  private router = inject(Router);

  @Input() placeholder: string = 'Devspace durchsuchen';
  @Input() isSidebarSearch: boolean = false;
  @Output() itemSelected = new EventEmitter<void>();

  searchQuery = '';
  showDropdown = false;
  channelsResults: Channel[] = [];
  profilesResults: User[] = [];
  messagesResults: Message[] = [];
  
  
  private allUsersCache: User[] = [];
  private allChannelsCache: Channel[] = [];
  private allMessagesCache: Message[] = [];
  private userResultsMap = new Map<string, User>();

  get currentUserId(): string {
    return this.authSvc.currentUser()?.id || '';
  }

  ngOnInit() {
    this.refreshAllCaches();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.showDropdown = false;
    }
  }

  @HostListener('window:keydown.escape')
  onEscape() {
    this.showDropdown = false;
  }

  onFocus() {
    this.showDropdown = true;
    this.refreshAllCaches();
    if (this.searchQuery) {
      this.executeSearch(this.searchQuery);
    }
  }

  isUserOnline(user: User): boolean {
    return this.authSvc.onlineUserIds().has(user.id);
  }

  
  async refreshAllCaches() {
    const currentUserId = this.currentUserId;
    if (!currentUserId) return;

    try {
      
      const { data: memberData, error: memberError } = await this.supabaseSvc.supabase
        .from('channel_members')
        .select('channel_id')
        .eq('user_id', currentUserId);

      const myChannelIds = new Set<string>();
      if (!memberError && memberData) {
        memberData.forEach(item => myChannelIds.add(item.channel_id));
      }

      
      const [users, channels, messages] = await Promise.all([
        this.userSvc.getAllUsers(),
        this.channelSvc.channels().length > 0 ? Promise.resolve(this.channelSvc.channels()) : this.channelSvc.getChannels(),
        this.supabaseSvc.supabase.from('messages').select('*')
      ]);

      if (users && users.length > 0) {
        this.allUsersCache = users;
        this.userResultsMap = new Map(users.map((u) => [u.id, u]));
      }

      if (channels && channels.length > 0) {
        this.allChannelsCache = channels;
      }

      if (messages && messages.data) {
        const userMap = this.userResultsMap;
        const channelMap = new Map(channels.map((c) => [c.id, c]));
        
        this.allMessagesCache = (messages.data as Message[])
          .filter((msg) => {
            if (msg.channel_id) {
              return myChannelIds.has(msg.channel_id);
            }
            if (msg.recipient_id) {
              return msg.sender_id === currentUserId || msg.recipient_id === currentUserId;
            }
            return false;
          })
          .map((msg) => {
            let searchableContent = msg.content || '';
            const userRegex = /<@([a-f0-9-]{36})>/gi;
            searchableContent = searchableContent.replace(userRegex, (match, userId) => {
              const u = userMap.get(userId);
              return u ? `@${u.display_name}` : '@Gelöschter User';
            });
            const channelRegex = /<#([a-f0-9-]{36})>/gi;
            searchableContent = searchableContent.replace(channelRegex, (match, chanId) => {
              const c = channelMap.get(chanId);
              return c ? `#${c.name}` : '#Gelöschter Channel';
            });

            return {
              ...msg,
              content: searchableContent,
              sender: userMap.get(msg.sender_id)
            };
          });
      }
    } catch (e) {
      console.error('Failed refreshing searchbar caches:', e);
    }
  }

  onSearch(query: string) {
    this.searchQuery = query;
    this.showDropdown = true;
    this.executeSearch(query);
  }

  executeSearch(query: string) {
    const cleanQuery = query.trim();
    const lowerQuery = query.toLowerCase().trim();

    if (!cleanQuery) {
      this.channelsResults = [];
      this.profilesResults = [];
      this.messagesResults = [];
      return;
    }

    const isSpecialPrefix = lowerQuery.startsWith('#') || lowerQuery.startsWith('@');
    if (!isSpecialPrefix && cleanQuery.length < 2) {
      this.channelsResults = [];
      this.profilesResults = [];
      this.messagesResults = [];
      return;
    }

    
    if (lowerQuery.startsWith('@')) {
      this.channelsResults = [];
    } else {
      let channelSearchTerm = lowerQuery;
      if (channelSearchTerm.startsWith('#')) {
        channelSearchTerm = channelSearchTerm.substring(1).trim();
      }
      
      const allChannels = this.allChannelsCache.length > 0 ? this.allChannelsCache : this.channelSvc.channels();
      if (!channelSearchTerm) {
        this.channelsResults = allChannels;
      } else {
        this.channelsResults = allChannels.filter(c => 
          c.name && c.name.toLowerCase().includes(channelSearchTerm)
        );
      }
    }

    
    if (lowerQuery.startsWith('#')) {
      this.profilesResults = [];
    } else {
      let profileSearchTerm = lowerQuery;
      if (profileSearchTerm.startsWith('@')) {
        profileSearchTerm = profileSearchTerm.substring(1).trim();
      }
      
      const allUsers = this.allUsersCache;
      const filteredDuplicate = this.userSvc.filterDuplicateGuests(allUsers, this.currentUserId);
      
      if (!profileSearchTerm) {
        this.profilesResults = filteredDuplicate;
      } else {
        this.profilesResults = filteredDuplicate.filter(u => 
          (u.display_name && u.display_name.toLowerCase().includes(profileSearchTerm)) || 
          (u.email && u.email.toLowerCase().includes(profileSearchTerm))
        );
      }
    }

    
    if (lowerQuery.startsWith('#') || lowerQuery.startsWith('@')) {
      this.messagesResults = [];
    } else {
      const allMessages = this.allMessagesCache;
      const normalizedQuery = this.normalizeForSearch(query);
      this.messagesResults = allMessages.filter(msg => 
        msg.content && this.normalizeForSearch(msg.content).includes(normalizedQuery)
      ).slice(0, 5);
    }
  }

  selectChannel(channel: Channel) {
    this.router.navigate(['/main/channel', channel.id]);
    this.threadSvc.closeThread();
    this.showDropdown = false;
    this.itemSelected.emit();
  }

  async selectUser(user: User) {
    this.router.navigate(['/main/dm', user.id]);
    this.threadSvc.closeThread();
    
    const currentUserId = this.currentUserId;
    if (currentUserId) {
      localStorage.setItem(`chat_last_read:${currentUserId}:${user.id}`, new Date().toISOString());
      localStorage.setItem(`chat_closed:${currentUserId}:${user.id}`, '');
    }
    
    this.showDropdown = false;
    this.itemSelected.emit();
  }

  async selectMessage(msg: Message) {
    this.messageSvc.searchTargetMessageId = msg.id || null;
    if (msg.id) {
      this.messageSvc.searchTargetSelected.emit(msg.id);
    }

    if (msg.channel_id) {
      this.router.navigate(['/main/channel', msg.channel_id]);
    } else if (msg.recipient_id) {
      const partnerId = msg.sender_id === this.currentUserId ? msg.recipient_id : msg.sender_id;
      const partner = await this.userSvc.getUserById(partnerId);
      if (partner) {
        this.router.navigate(['/main/dm', partner.id]);
        
        const currentUserId = this.currentUserId;
        if (currentUserId) {
          localStorage.setItem(`chat_last_read:${currentUserId}:${partner.id}`, new Date().toISOString());
          localStorage.setItem(`chat_closed:${currentUserId}:${partner.id}`, '');
        }
      }
    }

    if (msg.parent_id) {
      try {
        const { data, error } = await this.supabaseSvc.supabase
          .from('messages')
          .select('*')
          .eq('id', msg.parent_id)
          .single();
        if (data && !error) {
          const sender = await this.userSvc.getUserById(data.sender_id);
          const parentMsg = data as Message;
          if (sender) {
            parentMsg.sender = sender;
          }
          this.threadSvc.openThread(parentMsg);
        }
      } catch (e) {
        console.error('Failed loading parent message for thread navigation:', e);
      }
    } else {
      this.threadSvc.closeThread();
    }

    this.showDropdown = false;
    this.itemSelected.emit();
  }

  formatMessageDate(dateStr?: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const hrs = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${date.toLocaleDateString('de-DE')} ${hrs}:${mins}`;
  }

  getMessageContext(msg: Message): string {
    if (msg.channel_id) {
      const channel = this.channelSvc.channels().find(c => c.id === msg.channel_id);
      return channel ? `#${channel.name}` : 'Kanal';
    }
    if (msg.recipient_id) {
      const partnerId = msg.sender_id === this.currentUserId ? msg.recipient_id : msg.sender_id;
      const partner = this.userResultsMap.get(partnerId);
      return partner ? `DM mit @${partner.display_name}` : 'Direktnachricht';
    }
    return '';
  }

  private normalizeForSearch(str: string): string {
    return str
      .toLowerCase()
      .replace(/[,.?!;:()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
