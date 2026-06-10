import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { MatDialog, MatDialogModule, MatDialogConfig } from '@angular/material/dialog';
import { RealtimeChannel } from '@supabase/supabase-js';
import { User } from '../../interfaces/user.interface';
import { channelService } from '../../services/channel.service';
import { userService } from '../../services/user.service';
import { authService } from '../../services/auth.service';
import { messageService } from '../../services/message.service';
import { ToastService } from '../../services/toast.service';
import { SearchBarComponent } from '../searchbar/searchbar';
import { dialogCreateChannelComponent } from '../dialog-create-channel/dialog-create-channel';
import { dialogAddMemberComponent } from '../dialog-add-member/dialog-add-member';
import { SidebarDataService } from './sidebar-data.service';

/**
 * Modifies a MatDialogConfig to support mobile viewports as either a full-screen display or a bottom-sheet.
 * 
 * @param config The original dialog configuration.
 * @param type The mobile display mode: 'full-screen' or 'bottom-sheet'.
 * @returns The responsive, updated MatDialogConfig configuration.
 */
export function getResponsiveDialogConfig(config: MatDialogConfig, type: 'full-screen' | 'bottom-sheet'): MatDialogConfig {
  const isMobile = window.innerWidth <= 767;
  if (!isMobile) return config;
  if (type === 'full-screen') {
    return { ...config, width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh', position: { top: '0px', left: '0px' } };
  }
  return { ...config, width: '100vw', height: 'auto', minHeight: 'auto', maxWidth: '100vw', maxHeight: 'auto', position: { bottom: '0px' } };
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, MatDialogModule, SearchBarComponent],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
/**
 * Sidebar component displaying the navigation list of channels, direct messages history, user presence, search features, and dialog triggers.
 */
export class SidebarComponent implements OnInit, OnDestroy {
  /**
   * Emitted when the sidebar is toggled between opened and closed states.
   */
  @Output() toggleSidebar = new EventEmitter<boolean>();

  /**
   * Indicates whether the sidebar is currently minimized/closed.
   */
  @Input() isClosed = false;

  /**
   * Controls the expanded/collapsed state of the channels list section.
   */
  isChannelsExpanded = true;

  /**
   * Controls the expanded/collapsed state of the direct messages list section.
   */
  isDMsExpanded = true;

  /**
   * Service to load, edit, and select workspace channels.
   */
  private channelSvc = inject(channelService);

  /**
   * Signal of the currently selected active channel.
   */
  activeChannel = this.channelSvc.activeChannel;

  /**
   * Service to load, edit, and select workspace users and direct messages.
   */
  public userSvc = inject(userService);

  /**
   * Service handling user authentication session, profiles, and presence.
   */
  private authSvc = inject(authService);

  /**
   * Material Dialog service to open channel generation dialogs.
   */
  private dialog = inject(MatDialog);

  /**
   * Service managing messages, unread updates, and subscriptions.
   */
  private messageSvc = inject(messageService);

  /**
   * Service managing toast alert notifications.
   */
  private toastSvc = inject(ToastService);

  /**
   * Angular Router service for redirection.
   */
  private router = inject(Router);

  /**
   * Angular ActivatedRoute to extract current route state.
   */
  private route = inject(ActivatedRoute);

  /**
   * Service computing unread counts and sorting user lists for the sidebar.
   */
  private sidebarDataSvc = inject(SidebarDataService);

  /**
   * Signal of the array of all loaded channels.
   */
  channels = this.channelSvc.channels;

  /**
   * Signal holding the active user profile list.
   */
  users = signal<User[]>([]);

  /**
   * Signal list of user profiles with a direct message history.
   */
  usersWithHistory = signal<User[]>([]);

  /**
   * Signal list of user profiles without direct message history.
   */
  usersWithoutHistory = signal<User[]>([]);

  /**
   * Signal mapping user IDs to their respective unread direct message count.
   */
  unreadUsers = signal<Record<string, number>>({});

  /**
   * Signal mapping channel IDs to their respective unread mention count.
   */
  unreadChannels = signal<Record<string, number>>({});

  /**
   * Signal tracking whether the sidebar is in a loading state.
   */
  isSidebarLoading = signal<boolean>(true);

  /**
   * Realtime subscription channel to receive new incoming DMs.
   */
  private incomingDMsSubscription: RealtimeChannel | null = null;

  /**
   * Realtime subscription channel to receive new global/channel message notifications.
   */
  private globalMessagesSubscription: RealtimeChannel | null = null;

  /**
   * RxJS subscription tracking cleared direct message history actions.
   */
  private directChatClearedSubscription: Subscription | null = null;

  /**
   * RxJS subscription tracking route navigation changes.
   */
  private routerSubscription: Subscription | null = null;

  /**
   * Timestamp marker tracking when the current page session began.
   */
  private sessionStartTime = new Date().getTime();

  /**
   * ID of the user for whom the current subscriptions are registered.
   */
  private subscribedUserId: string | null = null;

  /**
   * Promise holding the active load operation to prevent concurrent data fetching.
   */
  private activeLoadPromise: Promise<void> | null = null;

  /**
   * Flag indicating a reload is queued while another load is currently executing.
   */
  private needsReloadAfterActiveLoad = false;

  /**
   * Constructs the sidebar component. Sets up effects to rebuild subscriptions and load data when the logged-in user changes.
   */
  constructor() {
    effect(() => {
      const currentUserId = this.authSvc.currentUser()?.id ?? null;
      if (!currentUserId || currentUserId === this.subscribedUserId) return;
      this.subscribedUserId = currentUserId;
      this.subscribeToDMs(currentUserId);
      this.subscribeToGlobalMessages(currentUserId);
      void this.loadData();
    });
  }

  /**
   * Getter retrieving the active user's ID.
   */
  get currentUserId(): string { return this.authSvc.currentUser()?.id || ''; }

  /**
   * Helper to check if a specific user profile is currently online.
   * 
   * @param user The user object to check.
   * @returns True if user is online, false otherwise.
   */
  isUserOnline(user: User): boolean {
    if (user.id === 'dabubble-team-local-id') return true;
    return this.authSvc.onlineUserIds().has(user.id);
  }

  /**
   * Initiates sidebar data reloading, managing concurrent operations via queue/flag state.
   * 
   * @returns A promise that resolves when the load is complete.
   */
  async loadData(): Promise<void> {
    if (this.activeLoadPromise) {
      this.needsReloadAfterActiveLoad = true;
      return this.activeLoadPromise;
    }

    const isInitial = this.channels().length === 0 && this.usersWithHistory().length === 0;
    this.activeLoadPromise = this.performLoadData(isInitial);
    try {
      await this.activeLoadPromise;
    } finally {
      this.activeLoadPromise = null;
      if (this.needsReloadAfterActiveLoad) {
        this.needsReloadAfterActiveLoad = false;
        await this.loadData();
      }
    }
  }

  /**
   * Performs the actual sidebar data loading, updating signals for channels, users, and unread metrics.
   * 
   * @param isInitial Flag specifying if this is the initial data load of the sidebar.
   */
  private async performLoadData(isInitial: boolean): Promise<void> {
    if (isInitial) this.isSidebarLoading.set(true);
    try {
      const active = this.activeChannel();
      const data = await this.sidebarDataSvc.load(
        this.sessionStartTime, active?.id, this.userSvc.activeDirectChatUser()?.id,
      );
      if (active && !data.channels.some((c) => c.id === active.id)) this.channelSvc.selectChannel(null);
      this.applyResponsiveNavigation(data.channels);
      if (this.currentUserId && active?.id) {
        this.sidebarDataSvc.setSafeLocalStorageItem(`channel_last_read:${this.currentUserId}:${active.id}`, new Date().toISOString());
      }
      this.users.set(data.users);
      this.usersWithHistory.set(data.usersWithHistory);
      this.usersWithoutHistory.set(data.usersWithoutHistory);
      this.unreadUsers.set(data.unreadUsers);
      this.unreadChannels.set(data.unreadChannels);
    } catch (error) {
      console.error('Error loading sidebar data:', error);
    } finally {
      this.isSidebarLoading.set(false);
    }
  }

  /**
   * Performs automatic navigation to default channels on tablets/desktops if no target is active.
   * 
   * @param channels List of available channels.
   */
  private applyResponsiveNavigation(channels: any[]): void {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 1024;
    const isResponsive = typeof window !== 'undefined' && window.innerWidth <= 1440;
    if (isResponsive && !isMobile && channels.length > 0 && !this.activeChannel() && !this.userSvc.activeDirectChatUser() && !this.channelSvc.isNewMessageModeActive()) {
      this.router.navigate(['/main/channel', channels[0].id]);
    }
  }

  /**
   * Angular lifecycle hook. Loads data, initializes route change handlers, and subscribes to chat clear events.
   */
  async ngOnInit(): Promise<void> {
    if (!this.subscribedUserId) await this.loadData();
    this.handleRouteSelection();
    this.channelSvc.isInitializing.set(false);
    this.routerSubscription = this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.handleRouteSelection());
    this.directChatClearedSubscription = this.messageSvc.directChatCleared.subscribe(() => this.loadData());
  }

  /**
   * Angular lifecycle hook. Unsubscribes from realtime networks, routing events, and RxJS streams.
   */
  ngOnDestroy(): void {
    if (this.incomingDMsSubscription) this.messageSvc.unsubscribe(this.incomingDMsSubscription);
    if (this.globalMessagesSubscription) this.messageSvc.unsubscribe(this.globalMessagesSubscription);
    this.directChatClearedSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
    this.subscribedUserId = null;
  }

  /**
   * Subscribes to incoming direct messages for the active user, triggering unread increments and reloads.
   * 
   * @param currentUserId ID of the current user.
   */
  private subscribeToDMs(currentUserId: string): void {
    if (this.incomingDMsSubscription) this.messageSvc.unsubscribe(this.incomingDMsSubscription);
    this.incomingDMsSubscription = this.messageSvc.subscribeToAllUserDirectMessages(currentUserId, (msg) => {
      const activeDMUser = this.userSvc.activeDirectChatUser();
      if (msg.recipient_id === currentUserId && activeDMUser?.id !== msg.sender_id) {
        this.sidebarDataSvc.setSafeLocalStorageItem(`chat_last_read:${currentUserId}:${msg.sender_id}`, new Date().toISOString());
        this.unreadUsers.update((prev) => ({ ...prev, [msg.sender_id]: (prev[msg.sender_id] || 0) + 1 }));
      }
      this.loadData();
    });
  }

  /**
   * Subscribes to global/channel mention messages for the active user to update sidebar notifications.
   * 
   * @param currentUserId ID of the current user.
   */
  private subscribeToGlobalMessages(currentUserId: string): void {
    if (this.globalMessagesSubscription) { this.messageSvc.unsubscribe(this.globalMessagesSubscription); this.globalMessagesSubscription = null; }
    this.globalMessagesSubscription = this.messageSvc.subscribeToAllChannelMentions(currentUserId, () => this.loadData());
  }

  /**
   * Selects a channel, saves reading state, deletes unread states, and navigates. Toggles sidebar on mobile.
   * 
   * @param id Channel ID to select.
   */
  selectChannel(id: string | undefined): void {
    if (!id) return;
    const isResponsive = typeof window !== 'undefined' && window.innerWidth <= 1440;
    const active = this.activeChannel();
    if (active?.id === id) { if (!isResponsive) this.router.navigate(['/main']); }
    else this.router.navigate(['/main/channel', id]);
    if (this.currentUserId) {
      this.sidebarDataSvc.setSafeLocalStorageItem(`channel_last_read:${this.currentUserId}:${id}`, new Date().toISOString());
      this.unreadChannels.update((prev) => { const copy = { ...prev }; delete copy[id]; return copy; });
    }
    if (isResponsive) { this.isClosed = true; this.toggleSidebar.emit(true); }
  }

  /**
   * Selects a direct message user, marks chat as read/open, navigates, and reloads. Toggles sidebar on mobile.
   * 
   * @param id User ID to select.
   */
  selectUser(id: string | undefined): void {
    if (!id) return;
    const isResponsive = typeof window !== 'undefined' && window.innerWidth <= 1440;
    const activeUser = this.userSvc.activeDirectChatUser();
    if (activeUser?.id === id) { if (!isResponsive) this.router.navigate(['/main']); }
    else this.router.navigate(['/main/dm', id]);
    if (this.currentUserId) {
      this.sidebarDataSvc.setSafeLocalStorageItem(`chat_last_read:${this.currentUserId}:${id}`, new Date().toISOString());
      this.sidebarDataSvc.setSafeLocalStorageItem(`chat_closed:${this.currentUserId}:${id}`, '');
    }
    this.unreadUsers.update((prev) => { const copy = { ...prev }; delete copy[id]; return copy; });
    this.loadData();
    if (isResponsive) { this.isClosed = true; this.toggleSidebar.emit(true); }
  }

  /**
   * Removes a user chat history from the sidebar visually, writing the closed status to local storage.
   * 
   * @param userId ID of the DM partner user.
   * @param event The click/interaction event.
   */
  async closeChat(userId: string, event: Event): Promise<void> {
    event.stopPropagation();
    const currentUserId = this.currentUserId;
    if (!currentUserId) return;
    try {
      this.sidebarDataSvc.setSafeLocalStorageItem(`chat_closed:${currentUserId}:${userId}`, new Date().toISOString());
      this.sidebarDataSvc.setSafeLocalStorageItem(`chat_last_read:${currentUserId}:${userId}`, new Date().toISOString());
      this.unreadUsers.update((prev) => { const copy = { ...prev }; delete copy[userId]; return copy; });
      if (this.userSvc.activeDirectChatUser()?.id === userId) {
        const fetchedChannels = await this.channelSvc.loadChannels();
        this.router.navigate(fetchedChannels.length > 0 ? ['/main/channel', fetchedChannels[0].id] : ['/main']);
      }
      await this.loadData();
    } catch (err) { console.error('Failed to close chat:', err); }
  }

  /**
   * Toggles the display expansion of the channels section.
   */
  toggleChannels(): void { this.isChannelsExpanded = !this.isChannelsExpanded; }

  /**
   * Toggles the display expansion of the direct messages section.
   */
  toggleDMs(): void { this.isDMsExpanded = !this.isDMsExpanded; }

  /**
   * Toggles the open/collapsed state of the entire sidebar.
   */
  toggleOpenClosed(): void { this.isClosed = !this.isClosed; this.toggleSidebar.emit(this.isClosed); }

  /**
   * Navigates to the 'new message' drafting screen, closing the sidebar on smaller screens.
   */
  startNewMessage(): void {
    this.router.navigate(['/main/new-message']);
    if (window.innerWidth <= 1440) { this.isClosed = true; this.toggleSidebar.emit(true); }
  }

  /**
   * Triggered when a search result selection completes; collapses sidebar if on tablet/mobile screens.
   */
  onSearchItemSelected(): void {
    if (window.innerWidth <= 1440) { this.isClosed = true; this.toggleSidebar.emit(true); }
  }

  /**
   * Analyzes routing url to synchronize selected active channel/user components with active states.
   */
  private handleRouteSelection(): void {
    const url = this.router.url;
    if (url.includes('/main/channel/')) this.handleChannelRoute(url);
    else if (url.includes('/main/dm/')) this.handleDMRoute(url);
    else if (url.includes('/main/new-message')) { this.channelSvc.setNewMessageMode(true); this.userSvc.selectDirectChatUser(null); }
    else { this.channelSvc.selectChannel(null); this.userSvc.selectDirectChatUser(null); this.channelSvc.setNewMessageMode(false); }
  }

  /**
   * Processes a channel detail url, selecting the active channel and updating read timestamps.
   * 
   * @param url The current navigation URL.
   */
  private handleChannelRoute(url: string): void {
    const channelId = url.split('/main/channel/')[1]?.split('?')[0];
    if (!channelId) return;
    const channel = this.channelSvc.channels().find((c) => c.id === channelId);
    if (channel) {
      this.channelSvc.selectChannel(channel);
      this.userSvc.selectDirectChatUser(null);
      if (this.currentUserId) {
        this.sidebarDataSvc.setSafeLocalStorageItem(`channel_last_read:${this.currentUserId}:${channelId}`, new Date().toISOString());
        this.unreadChannels.update((prev) => { const copy = { ...prev }; delete copy[channelId]; return copy; });
      }
    }
  }

  /**
   * Processes a direct message route url, selecting the direct message partner user profile.
   * 
   * @param url The current navigation URL.
   */
  private handleDMRoute(url: string): void {
    const userId = url.split('/main/dm/')[1]?.split('?')[0];
    if (!userId) return;
    this.channelSvc.setNewMessageMode(false);
    if (this.currentUserId) {
      this.sidebarDataSvc.setSafeLocalStorageItem(`chat_last_read:${this.currentUserId}:${userId}`, new Date().toISOString());
      this.sidebarDataSvc.setSafeLocalStorageItem(`chat_closed:${this.currentUserId}:${userId}`, '');
      this.unreadUsers.update((prev) => { const copy = { ...prev }; delete copy[userId]; return copy; });
    }
    const user = userId === 'dabubble-team-local-id'
      ? { id: 'dabubble-team-local-id', display_name: 'DABubble-Team', email: 'team@dabubble.local', avatar_url: 'img/logo/Logo.svg', status: 'online' as const }
      : this.users().find((u) => u.id === userId);
    if (user) { this.userSvc.selectDirectChatUser(user); this.channelSvc.selectChannel(null); }
  }

  /**
   * Opens the Material dialog to create a new channel, then opens the user assignment step.
   */
  async openCreateChannelDialog(): Promise<void> {
    const dialogRef = this.dialog.open(dialogCreateChannelComponent, getResponsiveDialogConfig({ width: '870px', height: '540px', panelClass: 'create-channel-dialog-container' }, 'full-screen'));
    dialogRef.componentInstance.channelSaved.subscribe(async (result) => {
      const addMemberRef = this.dialog.open(dialogAddMemberComponent, getResponsiveDialogConfig({ width: '500px', minHeight: '290px', maxWidth: '100vw', maxHeight: '90vh', disableClose: true, panelClass: ['custom-dialog-container', 'add-member-dialog-container'], data: { channelName: result.name } }, 'bottom-sheet'));
      const memberResult = await firstValueFrom(addMemberRef.afterClosed());
      if (memberResult) await this.createChannelWithMembers(dialogRef, result, memberResult);
    });
  }

  /**
   * Handles creation of a channel in the database and assigns the user selection list as members.
   * 
   * @param dialogRef Reference to the creation dialog.
   * @param result Details of the new channel.
   * @param memberResult Assignment selection result.
   */
  private async createChannelWithMembers(dialogRef: any, result: any, memberResult: any): Promise<void> {
    dialogRef.close();
    try {
      const currentUserId = this.authSvc.currentUser()?.id;
      const createdChannels = await this.channelSvc.createChannel({ name: result.name, description: result.description, created_by: currentUserId ?? '' });
      const active = createdChannels?.[0];
      if (active?.id) await this.addCreatedChannelMembers(active.id, memberResult, currentUserId);
      await this.loadData();
      if (active?.id) this.router.navigate(['/main/channel', active.id]);
      this.toastSvc.show('Channel erfolgreich erstellt.', 'success', 3000, undefined, false);
    } catch (error) {
      console.error('Failed to create channel:', error);
      this.toastSvc.show('Channel konnte nicht erstellt werden.', 'error', 3000, undefined, false);
    }
  }

  /**
   * Resolves specific or global user ids to assign as members to the newly created channel.
   * 
   * @param channelId Newly created channel ID.
   * @param memberResult Dialog member configuration payload.
   * @param currentUserId ID of the creating user.
   */
  private async addCreatedChannelMembers(channelId: string, memberResult: any, currentUserId: string | undefined): Promise<void> {
    let memberIds: string[] = [];
    if (memberResult.selectionType === 'all') {
      const allUsers = await this.userSvc.getAllUsers();
      memberIds = this.userSvc.filterDuplicateGuests(allUsers, currentUserId ?? null).map((u) => u.id);
    } else if (memberResult.selectionType === 'specific' && memberResult.selectedUsers) {
      memberIds = memberResult.selectedUsers;
    }
    if (memberIds.length > 0) {
      if (currentUserId) memberIds = memberIds.filter((id) => id !== currentUserId);
      if (memberIds.length > 0) await this.channelSvc.addMembersToChannel(channelId, memberIds);
    }
  }
}