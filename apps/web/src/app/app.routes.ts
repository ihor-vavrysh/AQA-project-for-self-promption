import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'learners/new',
    loadComponent: () =>
      import('./learners/learner-form.component').then((module) => module.LearnerFormComponent),
  },
  {
    path: 'learners',
    loadComponent: () =>
      import('./learners/learners.component').then((module) => module.LearnersComponent),
  },
  {
    path: 'learners/:learnerId',
    loadComponent: () =>
      import('./learners/learner-form.component').then((module) => module.LearnerFormComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'learners' },
  { path: '**', redirectTo: 'learners' },
];
