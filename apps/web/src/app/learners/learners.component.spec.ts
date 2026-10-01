import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import type { Observable } from 'rxjs';
import type { components } from '../core/api/api.generated';
import { AUTH_PORT } from '../auth/auth-port';
import { ApiClientService } from '../core/api/api-client.service';
import { LearnersComponent } from './learners.component';

const learner: components['schemas']['LearnerDto'] = {
  id: 'de305d54-75b4-431b-adb2-eb6b9e546014',
  pseudonym: 'Learner 01',
  ageBand: '11-13',
  locale: 'en-GB',
  curriculumCode: 'KS3',
  interests: ['space'],
  learningPreference: 'step-by-step',
  confidenceLevel: 'developing',
  attentionSpan: '10-20-minutes',
  gender: null,
  subject: 'Mathematics',
  level: 'Year 8',
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
};

describe('LearnersComponent', () => {
  let api: { getLearners: ReturnType<typeof vi.fn> };
  let auth: {
    configured: boolean;
    isAuthenticated$: Observable<boolean>;
    login: ReturnType<typeof vi.fn>;
    signUp: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = { getLearners: vi.fn().mockResolvedValue([learner]) };
    auth = {
      configured: true,
      isAuthenticated$: of(true),
      login: vi.fn().mockReturnValue(of(undefined)),
      signUp: vi.fn().mockReturnValue(of(undefined)),
    };
    await TestBed.configureTestingModule({
      imports: [LearnersComponent],
      providers: [
        provideRouter([]),
        { provide: AUTH_PORT, useValue: auth },
        { provide: ApiClientService, useValue: api },
      ],
    }).compileComponents();
  });

  it('shows the tutor-owned mentee roster', async () => {
    const fixture = TestBed.createComponent(LearnersComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Mentee profiles');
    expect(compiled.textContent).toContain('Learner 01');
    expect(compiled.textContent).toContain('Mathematics · Year 8');
    expect(compiled.querySelector('a[routerLink="/learners/new"]')).toBeTruthy();
  });

  it('shows an explicit error when the roster request fails', async () => {
    api.getLearners.mockRejectedValue(new Error('Could not load mentee profiles: 401'));
    const fixture = TestBed.createComponent(LearnersComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Auth0 API Identifier matches the audience',
    );
  });

  it('does not request private profiles before sign-in', async () => {
    auth.isAuthenticated$ = of(false);
    const fixture = TestBed.createComponent(LearnersComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.getLearners).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Sign in to view your roster');
    expect(fixture.nativeElement.querySelector('a[routerLink="/learners/new"]')).toBeNull();
  });

  it('starts Auth0 sign-in from the roster prompt', () => {
    auth.isAuthenticated$ = of(false);
    const fixture = TestBed.createComponent(LearnersComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector(
      '.sign-in-state button',
    ) as HTMLButtonElement;
    button.click();

    expect(auth.login).toHaveBeenCalledOnce();
  });

  it('shows a sign-in error if Auth0 redirect cannot start', () => {
    auth.isAuthenticated$ = of(false);
    auth.login.mockReturnValue(throwError(() => new Error('Auth0 error')));
    const fixture = TestBed.createComponent(LearnersComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector(
      '.sign-in-state button',
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Sign-in could not be started',
    );
  });

  it('starts the Auth0 signup flow from the roster prompt', () => {
    auth.isAuthenticated$ = of(false);
    const fixture = TestBed.createComponent(LearnersComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector(
      '.sign-in-state button.button-quiet',
    ) as HTMLButtonElement;
    button.click();

    expect(auth.signUp).toHaveBeenCalledOnce();
  });
});
