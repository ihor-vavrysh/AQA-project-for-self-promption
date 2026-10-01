import { TestBed } from '@angular/core/testing';
import { ApiClientService } from '../../core/api/api-client.service';
import type { components } from '../../core/api/api.generated';
import { SuggestionsPage } from './suggestions.page';

type SuggestionList = components['schemas']['SuggestionListDto'];
type Suggestion = components['schemas']['SuggestionDto'];

const suggestion = (overrides: Partial<Suggestion> = {}): Suggestion => ({
  resource: {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'demo-algebra-football-stats-video',
    title: 'Algebra in Football Statistics',
    description: 'Builds simple equations from league tables.',
    mediaType: 'video',
    provider: 'Demo Sports Learning',
    language: 'en-GB',
    licence: 'platform-tos',
    usageTier: 'embed',
    costModel: 'free',
    durationSeconds: 420,
    pageCount: null,
    lastVerifiedAt: null,
  },
  score: 0.82,
  gate: { factor: 'age-band-fit', level: 'exact', multiplier: 1 },
  reasons: [
    { factor: 'topic-relevance', level: 'primary', contribution: 0.3 },
    { factor: 'interest-overlap', level: 'partial', contribution: 0.07 },
    { factor: 'cost', level: 'free', contribution: 0 },
  ],
  diversityCapped: false,
  ...overrides,
});

const payload = (overrides: Partial<SuggestionList> = {}): SuggestionList => ({
  items: [suggestion()],
  weightsVersion: '1.0.0',
  candidatesConsidered: 20,
  emptyCause: null,
  ...overrides,
});

describe('SuggestionsPage', () => {
  const configure = async (api: Partial<ApiClientService>) => {
    await TestBed.configureTestingModule({
      imports: [SuggestionsPage],
      providers: [{ provide: ApiClientService, useValue: api }],
    }).compileComponents();
    return TestBed.createComponent(SuggestionsPage);
  };

  it('shows the profile form before anything is requested', async () => {
    const fixture = await configure({ getSuggestions: async () => payload() });
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('h1')?.textContent).toContain('What should this learner do next?');
    expect(element.querySelector('#age-band')).toBeTruthy();
    expect(element.querySelector('.suggestion-list')).toBeNull();
  });

  it('offers no form control that collects gender', async () => {
    const fixture = await configure({ getSuggestions: async () => payload() });
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    const controls = [...element.querySelectorAll('input, select, textarea, fieldset')];
    const collectsGender = controls.some((control) =>
      /gender/i.test(`${control.getAttribute('name') ?? ''} ${control.id}`),
    );

    expect(collectsGender).toBe(false);
    // The intro copy does say gender is not collected — that transparency is deliberate.
    expect(element.textContent).toContain('Gender is not collected');
  });

  it('sends the selected profile and renders ranked suggestions with reasons', async () => {
    const calls: unknown[] = [];
    const fixture = await configure({
      getSuggestions: async (body: unknown) => {
        calls.push(body);
        return payload();
      },
    });

    const page = fixture.componentInstance;
    page.ageBand.set('11-13');
    page.toggleInterest('football');
    await page.submit();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      ageBand: '11-13',
      interests: ['football'],
      allowPaid: false,
    });
    expect(Object.keys(calls[0] as object)).not.toContain('gender');

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.suggestion')).toHaveLength(1);
    expect(element.querySelector('.suggestion h2')?.textContent).toContain(
      'Algebra in Football Statistics',
    );
    // The age gate and each contributing factor are shown as plain language.
    expect(element.querySelector('.reason-gate')?.textContent).toContain('Right age band');
    expect(element.textContent).toContain('Topic match: on this exact topic');
    expect(element.textContent).toContain('weights v1.0.0');
  });

  it('toggling an interest off removes it from the request', async () => {
    const fixture = await configure({ getSuggestions: async () => payload() });
    const page = fixture.componentInstance;

    page.toggleInterest('space');
    expect(page.isSelected('space')).toBe(true);
    page.toggleInterest('space');
    expect(page.isSelected('space')).toBe(false);
  });

  it('explains an empty result rather than showing nothing', async () => {
    const fixture = await configure({
      getSuggestions: async () =>
        payload({ items: [], emptyCause: 'all-filtered-by-safety-vetting' }),
    });

    await fixture.componentInstance.submit();
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.notice')?.textContent).toContain('passed safety vetting');
  });

  it('surfaces a request failure without clearing the form', async () => {
    const fixture = await configure({
      getSuggestions: async () => {
        throw new Error('boom');
      },
    });

    await fixture.componentInstance.submit();
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.error')?.textContent).toContain('Could not load suggestions');
    expect(element.querySelector('#age-band')).toBeTruthy();
  });

  it('marks a penalty reason differently from a reward', async () => {
    const fixture = await configure({
      getSuggestions: async () =>
        payload({
          items: [
            suggestion({
              reasons: [
                { factor: 'topic-relevance', level: 'primary', contribution: 0.3 },
                { factor: 'cost', level: 'paid', contribution: -0.15 },
              ],
            }),
          ],
        }),
    });

    await fixture.componentInstance.submit();
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.reason-penalty')).toHaveLength(1);
    expect(element.querySelector('.reason-penalty')?.textContent).toContain('Cost: paid');
  });
});
