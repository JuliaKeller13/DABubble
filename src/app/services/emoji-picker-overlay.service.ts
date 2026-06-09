import { Injectable, signal } from '@angular/core';

export type EmojiPickerVariant = 'input' | 'message-footer' | 'message-hover';

interface EmojiPickerState {
  owner: string;
  userId: string;
  variant: EmojiPickerVariant;
  alignRight: boolean;
  color: string;
  top: number;
  left: number;
  width: number;
  height: number;
  visible: boolean;
}

interface EmojiPickerOpenConfig {
  owner: string;
  userId: string;
  variant: EmojiPickerVariant;
  alignRight: boolean;
  color: string;
  onSelect: (emoji: string) => void;
}

@Injectable({ providedIn: 'root' })
export class EmojiPickerOverlayService {
  readonly mounted = signal(false);
  readonly state = signal<EmojiPickerState>(this.closedState());
  private selectHandler: ((emoji: string) => void) | null = null;
  private scrollTarget: HTMLElement | null = null;
  private readonly preventScroll = (event: Event): void => {
    event.preventDefault();
  };
  private readonly preventScrollKeys = (event: KeyboardEvent): void => {
    const keys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'];
    if (keys.includes(event.key)) event.preventDefault();
  };

  warm(): void {
    this.mounted.set(true);
  }

  scheduleWarm(): void {
    if (this.mounted()) return;
    const run = () => this.warm();
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run);
    else setTimeout(run, 300);
  }

  open(anchor: HTMLElement, config: EmojiPickerOpenConfig): void {
    const rect = anchor.getBoundingClientRect();
    const bounds = this.hostBounds(anchor, config.variant);
    const size = this.panelSize(config.variant, bounds);
    const pos = this.panelPosition(rect, bounds, size, config.variant);
    this.warm();
    this.lockScroll(anchor);
    this.selectHandler = config.onSelect;
    this.state.set({ ...config, top: pos.top, left: pos.left, width: size.width, height: size.height, visible: true });
  }

  close(owner?: string): void {
    if (owner && this.state().owner !== owner) return;
    this.selectHandler = null;
    this.unlockScroll();
    this.state.set(this.closedState());
  }

  toggle(anchor: HTMLElement, config: EmojiPickerOpenConfig): void {
    if (this.isOpen(config.owner)) return this.close(config.owner);
    this.open(anchor, config);
  }

  isOpen(owner: string): boolean {
    const state = this.state();
    return state.visible && state.owner === owner;
  }

  select(emoji: string): void {
    this.selectHandler?.(emoji);
    this.close(this.state().owner);
  }

  private hostBounds(anchor: HTMLElement, variant: EmojiPickerVariant): DOMRect {
    const host = anchor.closest('.chat-area, .thread-view');
    if (host instanceof HTMLElement) return this.contentBounds(host, variant);
    return new DOMRect(16, 16, window.innerWidth - 32, window.innerHeight - 32);
  }

  private lockScroll(anchor: HTMLElement): void {
    const target = anchor.closest('.chat-area__body, .thread-view__body');
    if (!(target instanceof HTMLElement)) return;
    if (this.scrollTarget && this.scrollTarget !== target) this.unlockScroll();
    this.scrollTarget = target;
    target.addEventListener('wheel', this.preventScroll, { passive: false });
    target.addEventListener('touchmove', this.preventScroll, { passive: false });
    target.addEventListener('keydown', this.preventScrollKeys);
  }

  private unlockScroll(): void {
    if (!this.scrollTarget) return;
    this.scrollTarget.removeEventListener('wheel', this.preventScroll);
    this.scrollTarget.removeEventListener('touchmove', this.preventScroll);
    this.scrollTarget.removeEventListener('keydown', this.preventScrollKeys);
    this.scrollTarget = null;
  }

  private contentBounds(host: HTMLElement, variant: EmojiPickerVariant): DOMRect {
    const rect = host.getBoundingClientRect();
    const top = this.contentTop(host, rect, variant);
    const bottom = this.contentBottom(host, rect, variant);
    return new DOMRect(rect.left, top, rect.width, Math.max(bottom - top, 120));
  }

  private contentTop(host: HTMLElement, rect: DOMRect, variant: EmojiPickerVariant): number {
    if (variant === 'input') {
      return rect.top + 8;
    }
    const header = host.querySelector('.chat-area__header, .thread-view__header');
    if (!(header instanceof HTMLElement)) return rect.top + 16;
    return header.getBoundingClientRect().bottom + 16;
  }

  private contentBottom(host: HTMLElement, rect: DOMRect, variant: EmojiPickerVariant): number {
    const footer = host.querySelector('.chat-area__footer, .thread-view__footer');
    if (!(footer instanceof HTMLElement)) return rect.bottom - 16;
    const offset = variant === 'input' ? 8 : 16;
    return footer.getBoundingClientRect().top - offset;
  }

  private panelSize(variant: EmojiPickerVariant, bounds: DOMRect) {
    const gap = 16;
    const width = variant === 'input' ? 500 : 370;
    const height = variant === 'input' ? 456 : 412;
    return { gap, width: Math.min(width, bounds.width - gap * 2), height: Math.min(height, bounds.height) };
  }

  private panelPosition(rect: DOMRect, bounds: DOMRect, size: { gap: number; width: number; height: number }, variant: EmojiPickerVariant) {
    const top = this.idealTop(rect, bounds, size, variant);
    const left = this.idealLeft(rect, bounds, size, variant);
    return { top, left };
  }

  private idealTop(rect: DOMRect, bounds: DOMRect, size: { gap: number; height: number }, variant: EmojiPickerVariant) {
    const offset = 8;
    const above = rect.top - size.height - offset;
    const below = rect.bottom + offset;
    const minTop = bounds.top;
    const maxTop = bounds.bottom - size.height;
    if (above < minTop) return Math.min(below, maxTop);
    return Math.max(above, minTop);
  }

  private idealLeft(rect: DOMRect, bounds: DOMRect, size: { gap: number; width: number }, variant: EmojiPickerVariant) {
    const wantsRightEdge = variant === 'message-footer' || variant === 'message-hover';
    const start = wantsRightEdge ? rect.right - size.width : rect.left;
    const minLeft = bounds.left + size.gap;
    const maxLeft = bounds.right - size.width - size.gap;
    return Math.min(Math.max(start, minLeft), maxLeft);
  }

  private closedState(): EmojiPickerState {
    return { owner: '', userId: '', variant: 'input', alignRight: false, color: '#444df2', top: 0, left: 0, width: 0, height: 0, visible: false };
  }
}