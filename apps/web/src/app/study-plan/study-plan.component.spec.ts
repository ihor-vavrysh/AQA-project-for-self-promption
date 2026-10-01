import { TestBed } from '@angular/core/testing';
import type { components } from '../core/api/api.generated';
import { ApiClientService } from '../core/api/api-client.service';
import { StudyPlanComponent } from './study-plan.component';

type Resource = components['schemas']['ResourceSummaryDto'];

const resources: Resource[] = [
  {
    id: 'resource-1',
    slug: 'intro-to-biology',
    title: 'Introduction to biology',
    description: 'Explore the foundations of biology.',
    mediaType: 'course',
    provider: 'Open Learning',
    language: 'en',
    licence: 'cc-by',
    usageTier: 'open',
    costModel: 'free',
    durationSeconds: 3600,
    pageCount: null,
    lastVerifiedAt: null,
  },
  {
    id: 'resource-2',
    slug: 'biology-reference',
    title: 'Biology reference guide',
    description: 'A concise guide to core ideas.',
    mediaType: 'book',
    provider: 'Learning Library',
    language: 'en',
    licence: 'public-domain',
    usageTier: 'open',
    costModel: 'paid',
    durationSeconds: null,
    pageCount: 120,
    lastVerifiedAt: null,
  },
  {
    id: 'resource-3',
    slug: 'biology-tutorial',
    title: 'Cells and life',
    description: 'Learn how cells work.',
    mediaType: 'tutorial',
    provider: 'Open Learning',
    language: 'en',
    licence: 'cc0',
    usageTier: 'open',
    costModel: 'free',
    durationSeconds: 1800,
    pageCount: null,
    lastVerifiedAt: null,
  },
];

describe('StudyPlanComponent', () => {
  const api = {
    getPublishedResources: vi.fn(),
    getPublishedResource: vi.fn(),
  };

  beforeEach(async () => {
    api.getPublishedResources.mockReset().mockResolvedValue(resources);
    api.getPublishedResource.mockReset().mockResolvedValue({
      canonicalUrl: 'https://example.test/biology',
      outboundUrl: 'https://books.example.test/buy/biology',
    });

    await TestBed.configureTestingModule({
      imports: [StudyPlanComponent],
      providers: [{ provide: ApiClientService, useValue: api }],
    }).compileComponents();
  });

  it('loads published resources and filters by search and cost', async () => {
    const fixture = TestBed.createComponent(StudyPlanComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('[data-testid="resource-card"]')).toHaveLength(3);

    const search = compiled.querySelector<HTMLInputElement>(
      '[data-testid="resource-search-input"]',
    );
    expect(search).not.toBeNull();
    search!.value = 'cells';
    search!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(compiled.querySelectorAll('[data-testid="resource-card"]')).toHaveLength(1);
    expect(compiled.textContent).toContain('Cells and life');
  });

  it('creates a personal week-by-week plan from selected resources', async () => {
    const fixture = TestBed.createComponent(StudyPlanComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.goal.set('Learn biology basics');
    component.weeks.set(2);
    component.hoursPerWeek.set(4);

    const compiled = fixture.nativeElement as HTMLElement;
    const checkboxes = compiled.querySelectorAll<HTMLInputElement>(
      '[data-testid="resource-checkbox"]',
    );
    const firstCheckbox = checkboxes.item(0);
    const thirdCheckbox = checkboxes.item(2);
    expect(firstCheckbox).not.toBeNull();
    expect(thirdCheckbox).not.toBeNull();
    if (!firstCheckbox || !thirdCheckbox) {
      return;
    }
    firstCheckbox.checked = true;
    firstCheckbox.dispatchEvent(new Event('change'));
    thirdCheckbox.checked = true;
    thirdCheckbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    component.createPlan();
    fixture.detectChanges();

    expect(compiled.querySelector('[data-testid="study-plan-goal"]')?.textContent).toContain(
      'Learn biology basics',
    );
    expect(compiled.querySelector('.plan-summary')?.textContent).toContain('2 weeks');
    expect(compiled.querySelectorAll('[data-testid="plan-week"]')).toHaveLength(2);
    expect(compiled.querySelector('.week-list')?.textContent).toContain('Introduction to biology');
    expect(compiled.querySelector('.week-list')?.textContent).toContain('Cells and life');
    expect(compiled.textContent).toContain('not saved to an account or sent to the server');
  });

  it('uses the curated outbound book link only when the learner asks to open it', async () => {
    const fixture = TestBed.createComponent(StudyPlanComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    const book = resources[1];
    expect(book).toBeDefined();
    if (!book) return;

    component.goal.set('Learn biology basics');
    component.selectedResourceIds.set([book.id]);
    component.createPlan();
    await component.loadResourceLink(book);
    fixture.detectChanges();

    expect(api.getPublishedResource).toHaveBeenCalledWith('biology-reference');
    const link = fixture.nativeElement.querySelector(
      '[data-testid="open-resource-link"]',
    ) as HTMLAnchorElement | null;
    expect(link?.getAttribute('href')).toBe('https://books.example.test/buy/biology');
    expect(link?.textContent).toContain('Buy book');
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toContain('noopener');
  });

  it('shows a clear error when catalog resources cannot be loaded', async () => {
    api.getPublishedResources.mockRejectedValueOnce(new Error('Network unavailable'));

    const fixture = TestBed.createComponent(StudyPlanComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="resource-load-error"]')?.textContent,
    ).toContain('Resources could not be loaded');
  });

  it('exposes stable test ids for the planner controls', async () => {
    const fixture = TestBed.createComponent(StudyPlanComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="study-plan-page"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="study-plan-title"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="study-goal-input"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="plan-weeks-input"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="hours-per-week-input"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="resource-selection-section"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="resource-cost-filter"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="create-plan-button"]')).not.toBeNull();
  });

  it('shows the requested example book with its Rozetka purchase page', async () => {
    const fixture = TestBed.createComponent(StudyPlanComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="featured-book"]')?.textContent).toContain(
      'Ігри у які грають люди — Ерік Берн',
    );

    const purchaseLink = compiled.querySelector(
      '[data-testid="featured-book-buy-link"]',
    ) as HTMLAnchorElement | null;
    expect(purchaseLink?.getAttribute('href')).toBe(
      'https://rozetka.com.ua/ua/hudojestvennaya-literatura-omega-l-153334928/p552888756/',
    );
    expect(purchaseLink?.target).toBe('_blank');
    expect(purchaseLink?.rel).toContain('noopener');
  });
});
