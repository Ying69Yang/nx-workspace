import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    redirectTo: 'react-mfe',
    pathMatch: 'full'
  },
  {
    path: 'react-mfe',
    loadComponent: () => import('./wrappers/react-wrapper').then(m => m.ReactWrapper)
  }
];
