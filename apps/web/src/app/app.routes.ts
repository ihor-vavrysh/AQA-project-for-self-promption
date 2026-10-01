import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'suggestions',
    title: 'Suggestions · TutorForge',
    loadComponent: () =>
      import('./features/suggestions/suggestions.page').then((module) => module.SuggestionsPage),
  },
];
