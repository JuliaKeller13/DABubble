import { Component } from '@angular/core';
import { HeaderComponent } from "../../components/header/header";

@Component({
  selector: 'app-main',
  imports: [HeaderComponent],
  templateUrl: './main.html',
  styleUrl: './main.scss'
})
export class MainComponent {}
