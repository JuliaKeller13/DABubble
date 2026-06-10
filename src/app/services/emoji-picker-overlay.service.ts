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

/**
 * Service to manage the lifecycle, state, and positioning of an emoji picker overlay.
 * It handles loading optimization (warming), positioning calculations relative to anchor elements,
 * and background scroll locking when the overlay is visible.
 */
@Injectable({ providedIn: 'root' })
export class EmojiPickerOverlayService {
  /**
   * Signal indicating whether the emoji picker component has been mounted/loaded into the DOM.
   */
  readonly mounted = signal(false);

  /**
   * Signal containing the current state of the emoji picker (dimensions, visibility, position, etc.).
   */
  readonly state = signal<EmojiPickerState>(this.closedState());

  /**
   * Callback function triggered when an emoji is selected.
   */
  private selectHandler: ((emoji: string) => void) | null = null;

  /**
   * Reference to the scrollable container element that is locked when the picker is open.
   */
  private scrollTarget: HTMLElement | null = null;

  /**
   * Event listener callback to prevent default scroll behavior.
   */
  private readonly preventScroll = (event: Event): void => {
    event.preventDefault();
  };

  /**
   * Keyboard event listener callback to prevent default scroll behavior for specific navigation keys.
   */
  private readonly preventScrollKeys = (event: KeyboardEvent): void => {
    const keys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'];
    if (keys.includes(event.key)) event.preventDefault();
  };

  /**
   * Immediately marks the picker component as mounted to prepare it for rendering.
   */
  warm(): void {
    this.mounted.set(true);
  }

  /**
   * Schedules warming the component during browser idle time or falls back to a timeout.
   */
  scheduleWarm(): void {
    if (this.mounted()) return;
    const run = () => this.warm();
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run);
    else setTimeout(run, 300);
  }

  /**
   * Opens the emoji picker overlay next to a given anchor element with configuration options.
   * 
   * @param anchor The HTMLElement to align the picker overlay to.
   * @param config The configurations including owner ID, user ID, variant style, alignment, and selection callback.
   */
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

  /**
   * Closes the emoji picker overlay.
   * 
   * @param owner Optional owner ID. If provided, the picker is only closed if the active owner matches.
   */
  close(owner?: string): void {
    if (owner && this.state().owner !== owner) return;
    this.selectHandler = null;
    this.unlockScroll();
    this.state.set(this.closedState());
  }

  /**
   * Toggles the emoji picker overlay open or closed for a given anchor.
   * 
   * @param anchor The HTMLElement to align the picker overlay to if opening.
   * @param config The configurations for opening the picker.
   */
  toggle(anchor: HTMLElement, config: EmojiPickerOpenConfig): void {
    if (this.isOpen(config.owner)) return this.close(config.owner);
    this.open(anchor, config);
  }

  /**
   * Checks if the emoji picker is currently open for a specific owner.
   * 
   * @param owner The owner string to verify.
   * @returns True if open for this owner, false otherwise.
   */
  isOpen(owner: string): boolean {
    const state = this.state();
    return state.visible && state.owner === owner;
  }

  /**
   * Triggers the selection callback with the selected emoji and closes the picker.
   * 
   * @param emoji The emoji character or code that was selected.
   */
  select(emoji: string): void {
    this.selectHandler?.(emoji);
    this.close(this.state().owner);
  }

  /**
   * Resolves the bounding rectangle of the chat area or thread host container.
   * 
   * @param anchor The anchor element to find the host container for.
   * @param variant The emoji picker variant.
   * @returns The DOMRect representing the host boundaries.
   */
  private hostBounds(anchor: HTMLElement, variant: EmojiPickerVariant): DOMRect {
    const host = anchor.closest('.chat-area, .thread-view');
    if (host instanceof HTMLElement) return this.contentBounds(host, variant);
    return new DOMRect(16, 16, window.innerWidth - 32, window.innerHeight - 32);
  }

  /**
   * Locks the scroll interaction on the nearest scrollable parent container.
   * 
   * @param anchor The anchor element used to find the scrollable container.
   */
  private lockScroll(anchor: HTMLElement): void {
    const target = anchor.closest('.chat-area__body, .thread-view__body');
    if (!(target instanceof HTMLElement)) return;
    if (this.scrollTarget && this.scrollTarget !== target) this.unlockScroll();
    this.scrollTarget = target;
    target.addEventListener('wheel', this.preventScroll, { passive: false });
    target.addEventListener('touchmove', this.preventScroll, { passive: false });
    target.addEventListener('keydown', this.preventScrollKeys);
  }

  /**
   * Unlocks scroll interaction on the currently locked container.
   */
  private unlockScroll(): void {
    if (!this.scrollTarget) return;
    this.scrollTarget.removeEventListener('wheel', this.preventScroll);
    this.scrollTarget.removeEventListener('touchmove', this.preventScroll);
    this.scrollTarget.removeEventListener('keydown', this.preventScrollKeys);
    this.scrollTarget = null;
  }

  /**
   * Computes the bounding rectangle of the visible content area inside the host container.
   * 
   * @param host The host HTML element.
   * @param variant The picker variant style.
   * @returns A DOMRect of the content boundaries.
   */
  private contentBounds(host: HTMLElement, variant: EmojiPickerVariant): DOMRect {
    const rect = host.getBoundingClientRect();
    const top = this.contentTop(host, rect, variant);
    const bottom = this.contentBottom(host, rect, variant);
    return new DOMRect(rect.left, top, rect.width, Math.max(bottom - top, 120));
  }

  /**
   * Calculates the top bound of the content area inside the host.
   * 
   * @param host The host HTML element.
   * @param rect The bounding rect of the host.
   * @param variant The picker variant style.
   * @returns The vertical coordinate for the top boundary.
   */
  private contentTop(host: HTMLElement, rect: DOMRect, variant: EmojiPickerVariant): number {
    if (variant === 'input') {
      return rect.top + 8;
    }
    const header = host.querySelector('.chat-area__header, .thread-view__header');
    if (!(header instanceof HTMLElement)) return rect.top + 16;
    return header.getBoundingClientRect().bottom + 16;
  }

  /**
   * Calculates the bottom bound of the content area inside the host.
   * 
   * @param host The host HTML element.
   * @param rect The bounding rect of the host.
   * @param variant The picker variant style.
   * @returns The vertical coordinate for the bottom boundary.
   */
  private contentBottom(host: HTMLElement, rect: DOMRect, variant: EmojiPickerVariant): number {
    const footer = host.querySelector('.chat-area__footer, .thread-view__footer');
    if (!(footer instanceof HTMLElement)) return rect.bottom - 16;
    const offset = variant === 'input' ? 8 : 16;
    return footer.getBoundingClientRect().top - offset;
  }

  /**
   * Determines the size of the emoji picker panel based on variant and constraints.
   * 
   * @param variant The variant of the emoji picker.
   * @param bounds The boundary rectangle of the host.
   * @returns Object containing standard gap, computed width, and computed height.
   */
  private panelSize(variant: EmojiPickerVariant, bounds: DOMRect) {
    const gap = 16;
    const width = variant === 'input' ? 500 : 370;
    const height = variant === 'input' ? 456 : 412;
    return { gap, width: Math.min(width, bounds.width - gap * 2), height: Math.min(height, bounds.height) };
  }

  /**
   * Computes the final panel position based on anchor position and limits.
   * 
   * @param rect The bounding rect of the anchor element.
   * @param bounds The boundaries of the host container.
   * @param size The pre-calculated size of the picker panel.
   * @param variant The picker variant style.
   * @returns Object containing calculated top and left coordinates.
   */
  private panelPosition(rect: DOMRect, bounds: DOMRect, size: { gap: number; width: number; height: number }, variant: EmojiPickerVariant) {
    const top = this.idealTop(rect, bounds, size, variant);
    const left = this.idealLeft(rect, bounds, size, variant);
    return { top, left };
  }

  /**
   * Determines the ideal vertical coordinate (top) for the panel.
   * 
   * @param rect The bounding rect of the anchor element.
   * @param bounds The boundaries of the host container.
   * @param size The pre-calculated size of the picker panel.
   * @param variant The picker variant style.
   * @returns The calculated top coordinate.
   */
  private idealTop(rect: DOMRect, bounds: DOMRect, size: { gap: number; height: number }, variant: EmojiPickerVariant) {
    const offset = 8;
    const above = rect.top - size.height - offset;
    const below = rect.bottom + offset;
    const minTop = bounds.top;
    const maxTop = bounds.bottom - size.height;
    if (above < minTop) return Math.min(below, maxTop);
    return Math.max(above, minTop);
  }

  /**
   * Determines the ideal horizontal coordinate (left) for the panel.
   * 
   * @param rect The bounding rect of the anchor element.
   * @param bounds The boundaries of the host container.
   * @param size The pre-calculated size of the picker panel.
   * @param variant The picker variant style.
   * @returns The calculated left coordinate.
   */
  private idealLeft(rect: DOMRect, bounds: DOMRect, size: { gap: number; width: number }, variant: EmojiPickerVariant) {
    const wantsRightEdge = variant === 'message-footer' || variant === 'message-hover';
    const start = wantsRightEdge ? rect.right - size.width : rect.left;
    const minLeft = bounds.left + size.gap;
    const maxLeft = bounds.right - size.width - size.gap;
    return Math.min(Math.max(start, minLeft), maxLeft);
  }

  /**
   * Returns a reset/closed state object for the emoji picker.
   * 
   * @returns A default EmojiPickerState configuration object.
   */
  private closedState(): EmojiPickerState {
    return { owner: '', userId: '', variant: 'input', alignRight: false, color: '#444df2', top: 0, left: 0, width: 0, height: 0, visible: false };
  }
}