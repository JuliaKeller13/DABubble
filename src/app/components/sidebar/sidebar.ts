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
export class SidebarComponent implements OnInit, OnDestroy {
  @Output() toggleSidebar = new EventEmitter<boolean>();
  @Input() isClosed = false;

  isChannelsExpanded = true;
  isDMsExpanded = true;

  private channelSvc = inject(channelService);
  activeChannel = this.channelSvc.activeChannel;
  public userSvc = inject(userService);
  private authSvc = inject(authService);
  private dialog = inject(MatDialog);
  private messageSvc = inject(messageService);
  private toastSvc = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private sidebarDataSvc = inject(SidebarDataService);

  channels = this.channelSvc.channels;
  users = signal<User[]>([]);
  usersWithHistory = signal<User[]>([]);
  usersWithoutHistory = signal<User[]>([]);
  unreadUsers = signal<Record<string, number>>({});
  unreadChannels = signal<Record<string, number>>({});
  isSidebarLoading = signal<boolean>(true);

  private incomingDMsSubscription: RealtimeChannel | null = null;
  private globalMessagesSubscription: RealtimeChannel | null = null;
  private directChatClearedSubscription: Subscription | null = null;
  private routerSubscription: Subscription | null = null;
  private sessionStartTime = new Date().getTime();
  private subscribedUserId: string | null = null;
  private activeLoadPromise: Promise<void> | null = null;
  private needsReloadAfterActiveLoad = false;

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

  get currentUserId(): string { return this.authSvc.currentUser()?.id || ''; }

  isUserOnline(user: User): boolean {
    if (user.id === 'dabubble-team-local-id') return true;
    return this.authSvc.onlineUserIds().has(user.id);
  }

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

  private applyResponsiveNavigation(channels: any[]): void {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 1024;
    const isResponsive = typeof window !== 'undefined' && window.innerWidth <= 1440;
    if (isResponsive && !isMobile && channels.length > 0 && !this.activeChannel() && !this.userSvc.activeDirectChatUser() && !this.channelSvc.isNewMessageModeActive()) {
      this.router.navigate(['/main/channel', channels[0].id]);
    }
  }

  async ngOnInit(): Promise<void> {
    if (!this.subscribedUserId) await this.loadData();
    this.handleRouteSelection();
    this.channelSvc.isInitializing.set(false);
    this.routerSubscription = this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.handleRouteSelection());
    this.directChatClearedSubscription = this.messageSvc.directChatCleared.subscribe(() => this.loadData());
  }

  ngOnDestroy(): void {
    if (this.incomingDMsSubscription) this.messageSvc.unsubscribe(this.incomingDMsSubscription);
    if (this.globalMessagesSubscription) this.messageSvc.unsubscribe(this.globalMessagesSubscription);
    this.directChatClearedSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
    this.subscribedUserId = null;
  }

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

  private subscribeToGlobalMessages(currentUserId: string): void {
    if (this.globalMessagesSubscription) { this.messageSvc.unsubscribe(this.globalMessagesSubscription); this.globalMessagesSubscription = null; }
    this.globalMessagesSubscription = this.messageSvc.subscribeToAllChannelMentions(currentUserId, () => this.loadData());
  }

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

  toggleChannels(): void { this.isChannelsExpanded = !this.isChannelsExpanded; }
  toggleDMs(): void { this.isDMsExpanded = !this.isDMsExpanded; }
  toggleOpenClosed(): void { this.isClosed = !this.isClosed; this.toggleSidebar.emit(this.isClosed); }

  startNewMessage(): void {
    this.router.navigate(['/main/new-message']);
    if (window.innerWidth <= 1440) { this.isClosed = true; this.toggleSidebar.emit(true); }
  }

  onSearchItemSelected(): void {
    if (window.innerWidth <= 1440) { this.isClosed = true; this.toggleSidebar.emit(true); }
  }

  private handleRouteSelection(): void {
    const url = this.router.url;
    if (url.includes('/main/channel/')) this.handleChannelRoute(url);
    else if (url.includes('/main/dm/')) this.handleDMRoute(url);
    else if (url.includes('/main/new-message')) { this.channelSvc.setNewMessageMode(true); this.userSvc.selectDirectChatUser(null); }
    else { this.channelSvc.selectChannel(null); this.userSvc.selectDirectChatUser(null); this.channelSvc.setNewMessageMode(false); }
  }

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

  async openCreateChannelDialog(): Promise<void> {
    const dialogRef = this.dialog.open(dialogCreateChannelComponent, getResponsiveDialogConfig({ width: '870px', height: '540px', panelClass: 'create-channel-dialog-container' }, 'full-screen'));
    dialogRef.componentInstance.channelSaved.subscribe(async (result) => {
      const addMemberRef = this.dialog.open(dialogAddMemberComponent, getResponsiveDialogConfig({ width: '500px', minHeight: '290px', maxWidth: '100vw', maxHeight: '90vh', panelClass: ['custom-dialog-container', 'add-member-dialog-container'], data: { channelName: result.name } }, 'bottom-sheet'));
      const memberResult = await firstValueFrom(addMemberRef.afterClosed());
      if (memberResult) await this.createChannelWithMembers(dialogRef, result, memberResult);
    });
  }

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