import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IntroComponent } from './pages/intro/intro';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, IntroComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  title = 'DABubble';
}
