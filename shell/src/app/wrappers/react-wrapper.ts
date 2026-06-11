import { Component, ElementRef, OnInit, CUSTOM_ELEMENTS_SCHEMA, inject, ChangeDetectorRef } from '@angular/core';
import { loadRemoteModule } from '@angular-architects/native-federation';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-react-wrapper',
  imports: [CommonModule],
  templateUrl: './react-wrapper.html',
  styleUrl: './react-wrapper.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ReactWrapper implements OnInit {
  private el = inject(ElementRef);
  private cdr = inject(ChangeDetectorRef);
  loading = true;
  error: string | null = null;

  async ngOnInit() {
    try {
      await loadRemoteModule({
        remoteName: 'react-mfe',
        exposedModule: './web-component'
      });
      const element = document.createElement('react-mfe-element');
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
