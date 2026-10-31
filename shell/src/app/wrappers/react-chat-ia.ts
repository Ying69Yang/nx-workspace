import { Component, ElementRef, OnInit, CUSTOM_ELEMENTS_SCHEMA, inject, ChangeDetectorRef } from '@angular/core';
import { loadRemoteModule } from '@angular-architects/native-federation';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-react-chat-ia',
  imports: [CommonModule],
  templateUrl: './react-chat-ia.html',
  styleUrl: './react-chat-ia.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ReactChatIA implements OnInit {
  private el = inject(ElementRef);
  private cdr = inject(ChangeDetectorRef);
  loading = true;
  error: string | null = null;

  async ngOnInit() {
    try {
      await loadRemoteModule({
        remoteName: 'react-mfe-chat-ia',
        exposedModule: './web-component'
      });
      const element = document.createElement('react-mfe-chat-ia-element');
      this.el.nativeElement.querySelector('#mfe-container').appendChild(element);
      this.loading = false;
      this.cdr.detectChanges();
    } catch (err) {
      this.error = 'Error loading React MFE';
      this.loading = false;
      this.cdr.detectChanges();
      console.error(err);
    }
  }
}
