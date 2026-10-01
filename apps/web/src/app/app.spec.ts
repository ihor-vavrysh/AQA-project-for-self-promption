import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { provideRouter } from '@angular/router';
import { AUTH_PORT } from './auth/auth-port';
import { App } from './app';
import { ApiClientService } from './core/api/api-client.service';

describe('App', () => {
  let authErrors: Subject<Error>;

  beforeEach(async () => {
    authErrors = new Subject<Error>();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        {
          provide: AUTH_PORT,
          useValue: {
            configured: false,
            isAuthenticated$: of(false),
            errors$: authErrors,
            login: () => throwError(() => new Error('Auth0 is not configured')),
            signUp: () => throwError(() => new Error('Auth0 is not configured')),
            logout: () => throwError(() => new Error('Auth0 is not configured')),
            accessToken: async () => null,
          },
        },
        { provide: ApiClientService, useValue: { checkHealth: async () => undefined } },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('shows a clear sign-in setup state', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('a[routerLink="/learners"]')?.textContent).toContain('Mentees');
    expect(compiled.querySelector('a[routerLink="/study-plan"]')?.textContent).toContain(
      'Study planner',
    );
    expect(compiled.querySelector('button')?.disabled).toBe(true);
  });

  it('explains when Auth0 cannot find the requested API audience', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    authErrors.next(new Error('Service not found: https://api.tutorforge.local'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'create an API with identifier https://api.tutorforge.local',
    );
  });

  it('explains when Auth0 has not authorized the SPA for the API', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const authError = Object.assign(new Error('invalid_request'), {
      error_description:
        'Client "client-id" is not authorized to access resource server "https://api.tutorforge.local".',
    });
    authErrors.next(authError);
    authErrors.next(new Error('Invalid state'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'has not authorized this SPA',
    );
  });
});
