import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    redirectTo: 'react-mfe',
    pathMatch: 'full'
  },
  {
    path: 'react-mfe-webassembly',
    loadComponent: () => import('./wrappers/react-webassembly').then(m => m.ReactWebassembly)
  },
  {
    path: 'react-mfe-chat-ia',
    loadComponent: () => import('./wrappers/react-chat-ia').then(m => m.ReactChatIA)
  },
  {
    path: 'react-mfe',
    loadComponent: () => import('./wrappers/react-wrapper').then(m => m.ReactWrapper)
  }
];
