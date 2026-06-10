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
/**
 * Component representing the search bar that filters channels, users, and message contents.
 */
export class SearchBarComponent implements OnInit {
  /**
   * Service managing channel states, loading, and selection.
   */
  private channelSvc = inject(channelService);

  /**
   * Service managing user profile data, fetching, and cached users.
   */
  private userSvc = inject(userService);

  /**
   * Service handling chat message operations and search targets.
   */
  private messageSvc = inject(messageService);

  /**
   * Service providing user authentication states, sessions, and active statuses.
   */
  private authSvc = inject(authService);

  /**
   * Service controlling the state and visibility of thread view overlays.
   */
  private threadSvc = inject(ThreadService);

  /**
   * Wrapper service for Supabase client database interactions.
   */
  private supabaseSvc = inject(supabaseService);

  /**
   * Element reference for the searchbar component host.
   */
  private elementRef = inject(ElementRef);

  /**
   * Angular Router service for application navigation.
   */
  private router = inject(Router);

  /**
   * Custom placeholder text for the search input field.
   */
  @Input() placeholder: string = 'Devspace durchsuchen';

  /**
   * Flag indicating if this searchbar is rendered in the sidebar or main header.
   */
  @Input() isSidebarSearch: boolean = false;

  /**
   * Emitted when a search result item is clicked/selected.
   */
  @Output() itemSelected = new EventEmitter<void>();

  /**
   * The current search input string value.
   */
  searchQuery = '';

  /**
   * Controls the visibility of the search results dropdown overlay.
   */
  showDropdown = false;

  /**
   * Filtered list of channels matching the search query.
   */
  channelsResults: Channel[] = [];

  /**
   * Filtered list of user profiles matching the search query.
   */
  profilesResults: User[] = [];

  /**
   * Filtered list of messages matching the search query.
   */
  messagesResults: Message[] = [];
  
  /**
   * Cached array of all users to optimize query response times.
   */
  private allUsersCache: User[] = [];

  /**
   * Cached array of all channels to optimize query response times.
   */
  private allChannelsCache: Channel[] = [];

  /**
   * Cached array of all messages visible to the user.
   */
  private allMessagesCache: Message[] = [];

  /**
   * Map of user IDs to User objects for fast lookups.
   */
  private userResultsMap = new Map<string, User>();

  /**
   * Getter retrieving the unique ID of the currently logged-in user.
   */
  get currentUserId(): string {
    return this.authSvc.currentUser()?.id || '';
  }

  /**
   * Angular lifecycle hook. Triggers cache pre-population upon component initialization.
   */
  ngOnInit() {
    this.refreshAllCaches();
  }

  /**
   * Listens to document clicks and closes the dropdown if the click was outside the searchbar component.
   * 
   * @param event The mouse click event.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.showDropdown = false;
    }
  }

  /**
   * Listens to Escape key presses and closes the search results dropdown.
   */
  @HostListener('window:keydown.escape')
  onEscape() {
    this.showDropdown = false;
  }

  /**
   * Handles focus events on the search input. Opens the dropdown and refreshes data caches.
   */
  onFocus() {
    this.showDropdown = true;
    this.refreshAllCaches();
    if (this.searchQuery) {
      this.executeSearch(this.searchQuery);
    }
  }

  /**
   * Checks if a specific user is currently online.
   * 
   * @param user The user object to check.
   * @returns True if the user is online, false otherwise.
   */
  isUserOnline(user: User): boolean {
    return this.authSvc.onlineUserIds().has(user.id);
  }

  /**
   * Fetches and refreshes caches for users, channels, and messages from services/database.
   */
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

  /**
   * Triggers when input query changes. Updates the query state and executes the search.
   * 
   * @param query The input search query string.
   */
  onSearch(query: string) {
    this.searchQuery = query;
    this.showDropdown = true;
    this.executeSearch(query);
  }

  /**
   * Executes the search filtering logic against cached channels, users, and messages.
   * 
   * @param query The raw query string to filter by.
   */
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

  /**
   * Handles channel selection. Navigates to the channel's view, closes threads, and emits selection event.
   * 
   * @param channel The selected Channel object.
   */
  selectChannel(channel: Channel) {
    this.router.navigate(['/main/channel', channel.id]);
    this.threadSvc.closeThread();
    this.showDropdown = false;
    this.itemSelected.emit();
  }

  /**
   * Handles user/direct message selection. Navigates to the DM view, resets read tracking, closes threads, and emits selection event.
   * 
   * @param user The selected User object.
   */
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

  /**
   * Handles search message selection. Navigates to channel or DM, highlights message, opens threads if thread reply, and emits selection event.
   * 
   * @param msg The selected Message object.
   */
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

  /**
   * Formats a ISO date string to German style DD.MM.YYYY HH:MM format.
   * 
   * @param dateStr The date string.
   * @returns Formatted date string.
   */
  formatMessageDate(dateStr?: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const hrs = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${date.toLocaleDateString('de-DE')} ${hrs}:${mins}`;
  }

  /**
   * Retrieves contextual description of the message, e.g., channel name or user DM partner.
   * 
   * @param msg The message.
   * @returns The string describing the context.
   */
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

  /**
   * Normalizes a string for fuzzy searching by removing punctuation and converting to lowercase.
   * 
   * @param str The string to normalize.
   * @returns The normalized string.
   */
  private normalizeForSearch(str: string): string {
    return str
      .toLowerCase()
      .replace(/[,.?!;:()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
