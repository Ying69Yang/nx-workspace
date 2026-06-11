import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/app';

class ReactMfeElement extends HTMLElement {
  private root: ReactDOM.Root | null = null;

  connectedCallback() {
    const mountPoint = document.createElement('div');
    // Using open shadow DOM can cause issues with global CSS, 
    // but for isolation it's good. We'll use regular DOM for simplicity with Capacitor CSS
    this.appendChild(mountPoint);
    this.root = ReactDOM.createRoot(mountPoint);
    this.root.render(<App />);
  }

  disconnectedCallback() {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }
}

if (!customElements.get('react-mfe-element')) {
  customElements.define('react-mfe-element', ReactMfeElement);
}
