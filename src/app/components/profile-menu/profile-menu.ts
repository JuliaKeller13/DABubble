import { Component, ElementRef, HostListener, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-profile-menu',
  standalone: true,
  imports: [],
  templateUrl: './profile-menu.html',
  styleUrl: './profile-menu.scss'
})
export class ProfileMenuComponent {
  private router = inject(Router);
  isOpen = false;
  isClosing = false;

  constructor(private elementRef: ElementRef) {}

  toggleMenu(event: Event) {
    event.stopPropagation();
    if (this.isOpen) {
      this.closeMenu();
    } else {
      this.isOpen = true;
      this.isClosing = false;
    }
  }

  closeMenu() {
    if (!this.isOpen || this.isClosing) return;
    
    if (window.innerWidth <= 1024) {
      this.isClosing = true;
      setTimeout(() => {
        this.isOpen = false;
        this.isClosing = false;
      }, 250);
    } else {
      this.isOpen = false;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const clickedInside = this.elementRef.nativeElement.contains(event.target);
    if (!clickedInside && this.isOpen) {
      this.closeMenu();
    }
  }

  @HostListener('window:resize')
  onResize() {
    this.isOpen = false;
    this.isClosing = false;
  }

  openProfile() {
    this.closeMenu();
  }

  logout() {
    this.closeMenu();
    this.router.navigate(['/login']);
  }
}
