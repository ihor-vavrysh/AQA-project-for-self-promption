import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'study-plan',
    loadComponent: () =>
      import('./study-plan/study-plan.component').then((module) => module.StudyPlanComponent),
  },
  {
    path: 'catalog',
    loadComponent: () =>
      import('./catalog/catalog.component').then((module) => module.CatalogComponent),
  },
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
  { path: '', pathMatch: 'full', redirectTo: 'catalog' },
  { path: '**', redirectTo: 'catalog' },
];
