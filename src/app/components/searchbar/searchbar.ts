import { Component, ElementRef, HostListener, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { MessageService } from '../../services/message.service';
import { AuthService } from '../../services/auth.service';
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
  private messageSvc = inject(MessageService);
  private authSvc = inject(AuthService);
  private threadSvc = inject(ThreadService);
  private supabaseSvc = inject(supabaseService);
  private elementRef = inject(ElementRef);

  searchQuery = '';
  showDropdown = false;
  channelsResults: Channel[] = [];
  profilesResults: User[] = [];
  messagesResults: Message[] = [];
  
  // Local caches to guarantee instantaneous (0ms) searches
  private allUsersCache: User[] = [];
  private allChannelsCache: Channel[] = [];
  private allMessagesCache: Message[] = [];
  private myChannelIdsCache = new Set<string>();
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

  // Pre-fetches and caches all users, channels, memberships and messages in parallel
  async refreshAllCaches() {
    const currentUserId = this.currentUserId;
    if (!currentUserId) return;

    try {
      // 1. Fetch channel memberships
      const { data: memberData, error: memberError } = await this.supabaseSvc.supabase
        .from('channel_members')
        .select('channel_id')
        .eq('user_id', currentUserId);

      const myChannelIds = new Set<string>();
      if (!memberError && memberData) {
        memberData.forEach(item => myChannelIds.add(item.channel_id));
      }
      this.myChannelIdsCache = myChannelIds;

      // 2. Fetch users, channels and messages
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
        // Filter messages the user has access to, and attach sender details
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
          .map((msg) => ({
            ...msg,
            sender: userMap.get(msg.sender_id)
          }));
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

    // 1. CHANNELS SEARCH (synchronous local filter)
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

    // 2. PROFILES SEARCH (synchronous local filter)
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

    // 3. MESSAGES SEARCH (synchronous local filter)
    if (lowerQuery.startsWith('#') || lowerQuery.startsWith('@')) {
      this.messagesResults = [];
    } else {
      const allMessages = this.allMessagesCache;
      this.messagesResults = allMessages.filter(msg => 
        msg.content && msg.content.toLowerCase().includes(lowerQuery)
      ).slice(0, 5);
    }
  }

  selectChannel(channel: Channel) {
    this.channelSvc.selectChannel(channel);
    this.userSvc.selectDirectChatUser(null);
    this.threadSvc.closeThread();
    this.showDropdown = false;
  }

  async selectUser(user: User) {
    this.userSvc.selectDirectChatUser(user);
    this.channelSvc.selectChannel(null);
    this.threadSvc.closeThread();
    
    const currentUserId = this.currentUserId;
    if (currentUserId) {
      localStorage.setItem(`chat_last_read:${currentUserId}:${user.id}`, new Date().toISOString());
      localStorage.setItem(`chat_closed:${currentUserId}:${user.id}`, '');
    }
    
    this.showDropdown = false;
  }

  async selectMessage(msg: Message) {
    this.messageSvc.searchTargetMessageId = msg.id || null;

    if (msg.channel_id) {
      const channel = this.channelSvc.channels().find(c => c.id === msg.channel_id) || {
        id: msg.channel_id,
        name: 'Kanal',
        created_by: ''
      };
      this.channelSvc.selectChannel(channel as Channel);
      this.userSvc.selectDirectChatUser(null);
    } else if (msg.recipient_id) {
      const partnerId = msg.sender_id === this.currentUserId ? msg.recipient_id : msg.sender_id;
      const partner = await this.userSvc.getUserById(partnerId);
      if (partner) {
        this.userSvc.selectDirectChatUser(partner);
        this.channelSvc.selectChannel(null);
        
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
}
