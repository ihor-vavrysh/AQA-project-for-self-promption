import { Component, computed, inject, signal } from '@angular/core';
import { ApiClientService } from '../../core/api/api-client.service';
import type { components } from '../../core/api/api.generated';

type SuggestionList = components['schemas']['SuggestionListDto'];
type Suggestion = components['schemas']['SuggestionDto'];
type Reason = components['schemas']['SuggestionReasonDto'];
type LearnerContextBody = components['schemas']['LearnerContextDto'];

/** Form state is typed from the generated contract, so the picker cannot drift from it. */
type AgeBandOption = LearnerContextBody['ageBand'];
type InterestOption = NonNullable<LearnerContextBody['interests']>[number];
type ConfidenceOption = NonNullable<LearnerContextBody['confidence']>;
type PreferenceOption = NonNullable<LearnerContextBody['learningPreference']>;

const AGE_BANDS: readonly AgeBandOption[] = ['5-7', '8-10', '11-13', '14-16', '17-18'];
const CONFIDENCE_LEVELS: readonly ConfidenceOption[] = ['low', 'medium', 'high'];
const LEARNING_PREFERENCES = ['visual', 'narrative', 'step-by-step', 'challenge-first'] as const;
const INTERESTS: readonly InterestOption[] = [
  'football',
  'sport',
  'gaming',
  'coding',
  'robotics',
  'space',
  'music',
  'art',
  'reading',
  'history',
  'puzzles',
  'animals',
];

/**
 * Reason copy lives here, not in the API. The server returns a factor and an ordinal
 * level so the wording can be localised and so tests can assert on the machine-readable
 * pair rather than on prose.
 */
const FACTOR_LABELS: Record<string, string> = {
  'topic-relevance': 'Topic match',
  'interest-overlap': 'Interests',
  'reading-level-fit': 'Reading level',
  'confidence-fit': 'Difficulty',
  'media-preference': 'Format',
  quality: 'Quality',
  cost: 'Cost',
};

const LEVEL_LABELS: Record<string, string> = {
  primary: 'on this exact topic',
  related: 'closely related',
  ancestor: 'from the wider subject',
  strong: 'strong overlap',
  partial: 'some overlap',
  'not-requested': 'none given',
  exact: 'well matched',
  near: 'close',
  far: 'some way off',
  'not-applicable': 'not applicable',
  aligned: 'suits their confidence',
  neutral: 'acceptable',
  misaligned: 'likely mispitched',
  match: 'their preferred format',
  high: 'high',
  medium: 'medium',
  low: 'low',
  unknown: 'unrated',
  free: 'free',
  freemium: 'partly paywalled',
  paid: 'paid',
  none: 'no match',
};

const GATE_LABELS: Record<string, string> = {
  exact: 'Right age band',
  adjacent: 'Neighbouring age band',
  distant: 'Two age bands away',
  none: 'Outside the age range',
};

@Component({
  selector: 'app-suggestions',
  templateUrl: './suggestions.page.html',
  styleUrl: './suggestions.page.css',
})
export class SuggestionsPage {
  private readonly api = inject(ApiClientService);

  readonly ageBands = AGE_BANDS;
  readonly confidenceLevels = CONFIDENCE_LEVELS;
  readonly learningPreferences = LEARNING_PREFERENCES;
  readonly interestOptions = INTERESTS;

  readonly node = signal('ks4-maths-algebra');
  readonly ageBand = signal<AgeBandOption>('14-16');
  readonly locale = signal('en-GB');
  readonly confidence = signal<ConfidenceOption>('medium');
  readonly learningPreference = signal<PreferenceOption>('step-by-step');
  readonly interests = signal<readonly InterestOption[]>([]);
  readonly allowPaid = signal(false);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly result = signal<SuggestionList | null>(null);

  readonly items = computed(() => this.result()?.items ?? []);
  readonly emptyCause = computed(() => this.result()?.emptyCause ?? null);

  toggleInterest(interest: InterestOption): void {
    const current = this.interests();
    this.interests.set(
      current.includes(interest)
        ? current.filter((value) => value !== interest)
        : [...current, interest],
    );
  }

  isSelected(interest: InterestOption): boolean {
    return this.interests().includes(interest);
  }

  /** Native submit, so Enter still works without importing FormsModule. */
  onSubmit(event: Event): void {
    event.preventDefault();
    void this.submit();
  }

  async submit(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      this.result.set(
        await this.api.getSuggestions({
          node: this.node(),
          ageBand: this.ageBand(),
          locale: this.locale(),
          confidence: this.confidence(),
          learningPreference: this.learningPreference(),
          interests: [...this.interests()],
          allowPaid: this.allowPaid(),
          limit: 6,
          // The generated client treats every field with a documented default as
          // always-present, so they are sent explicitly rather than left to the server.
          attentionSpan: 'medium',
          explain: 'top',
        }),
      );
    } catch (error) {
      console.error('Suggestion request failed', error);
      this.error.set('Could not load suggestions. Please try again.');
      this.result.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  gateLabel(suggestion: Suggestion): string {
    return GATE_LABELS[suggestion.gate.level] ?? suggestion.gate.level;
  }

  reasonLabel(reason: Reason): string {
    const factor = FACTOR_LABELS[reason.factor] ?? reason.factor;
    const level = LEVEL_LABELS[reason.level] ?? reason.level;
    return `${factor}: ${level}`;
  }

  /** Negative contributions are shown as penalties rather than hidden. */
  isPenalty(reason: Reason): boolean {
    return reason.contribution < 0;
  }

  emptyCauseLabel(cause: string): string {
    const labels: Record<string, string> = {
      'no-candidates-in-subtree': 'Nothing is catalogued under this topic yet.',
      'all-filtered-by-missing-enrichment':
        'Resources here have not been assessed for age or difficulty yet.',
      'all-filtered-by-safety-vetting': 'Nothing here has passed safety vetting yet.',
      'all-filtered-by-language': 'Nothing here matches that language.',
      'all-filtered-by-cost': 'Everything here is paid; allow paid to see it.',
      'all-suppressed-by-age-gate': 'Everything here is aimed at a different age band.',
    };
    return labels[cause] ?? cause;
  }
}
