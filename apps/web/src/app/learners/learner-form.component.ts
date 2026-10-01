import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { components } from '../core/api/api.generated';
import { ApiClientService } from '../core/api/api-client.service';

const AGE_BANDS = ['5-7', '8-10', '11-13', '14-16', '17-18'] as const;
const LEARNING_PREFERENCES = [
  { label: 'Visual', value: 'visual' },
  { label: 'Narrative', value: 'narrative' },
  { label: 'Step by step', value: 'step-by-step' },
  { label: 'Challenge first', value: 'challenge-first' },
] as const;
const CONFIDENCE_LEVELS = [
  { label: 'Low', value: 'low' },
  { label: 'Developing', value: 'developing' },
  { label: 'Confident', value: 'confident' },
  { label: 'High', value: 'high' },
] as const;
const ATTENTION_SPANS = [
  { label: 'Under 10 minutes', value: 'under-10-minutes' },
  { label: '10–20 minutes', value: '10-20-minutes' },
  { label: 'Over 20 minutes', value: 'over-20-minutes' },
] as const;

type LearnerInput = components['schemas']['CreateLearnerDto'];
type LearnerAgeBand = LearnerInput['ageBand'];
type LearnerLearningPreference = LearnerInput['learningPreference'];
type LearnerConfidenceLevel = LearnerInput['confidenceLevel'];
type LearnerAttentionSpan = LearnerInput['attentionSpan'];

type LearnerForm = FormGroup<{
  pseudonym: FormControl<string>;
  ageBand: FormControl<LearnerAgeBand>;
  locale: FormControl<string>;
  curriculumCode: FormControl<string>;
  interests: FormControl<string>;
  learningPreference: FormControl<LearnerLearningPreference>;
  confidenceLevel: FormControl<LearnerConfidenceLevel>;
  attentionSpan: FormControl<LearnerAttentionSpan>;
  gender: FormControl<string>;
  subject: FormControl<string>;
  level: FormControl<string>;
}>;

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-learner-form',
  styleUrl: './learner-form.component.css',
  templateUrl: './learner-form.component.html',
})
export class LearnerFormComponent implements OnInit {
  private readonly api = inject(ApiClientService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly ageBands = AGE_BANDS;
  readonly learningPreferences = LEARNING_PREFERENCES;
  readonly confidenceLevels = CONFIDENCE_LEVELS;
  readonly attentionSpans = ATTENTION_SPANS;
  readonly learnerId = signal('');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly confirmingDelete = signal(false);
  readonly error = signal('');
  readonly isEditing = () => Boolean(this.learnerId());

  readonly form: LearnerForm = new FormGroup({
    pseudonym: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(40)],
    }),
    ageBand: new FormControl<LearnerAgeBand>('11-13', { nonNullable: true }),
    locale: new FormControl('en-GB', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(20)],
    }),
    curriculumCode: new FormControl('KS3', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(40)],
    }),
    interests: new FormControl('', { nonNullable: true }),
    learningPreference: new FormControl<LearnerLearningPreference>('step-by-step', {
      nonNullable: true,
    }),
    confidenceLevel: new FormControl<LearnerConfidenceLevel>('developing', {
      nonNullable: true,
    }),
    attentionSpan: new FormControl<LearnerAttentionSpan>('10-20-minutes', {
      nonNullable: true,
    }),
    gender: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(64)] }),
    subject: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    level: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
  });

  ngOnInit(): void {
    const learnerId = this.route.snapshot.paramMap.get('learnerId');

    if (learnerId) {
      this.learnerId.set(learnerId);
      void this.loadLearner(learnerId);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');
    const values = this.form.getRawValue();
    const profile = {
      pseudonym: values.pseudonym.trim(),
      ageBand: values.ageBand,
      locale: values.locale.trim(),
      curriculumCode: values.curriculumCode.trim(),
      interests: values.interests
        .split(',')
        .map((interest) => interest.trim())
        .filter(Boolean),
      learningPreference: values.learningPreference,
      confidenceLevel: values.confidenceLevel,
      attentionSpan: values.attentionSpan,
      gender: values.gender.trim() || null,
      subject: values.subject.trim(),
      level: values.level.trim(),
    };

    try {
      if (this.isEditing()) {
        await this.api.updateLearner(
          this.learnerId(),
          profile satisfies components['schemas']['UpdateLearnerDto'],
        );
      } else {
        await this.api.createLearner(profile);
      }

      await this.router.navigate(['/learners']);
    } catch (error) {
      console.error('Mentee profile could not be saved', error);
      this.error.set('The profile could not be saved. Check the details and try again.');
    } finally {
      this.saving.set(false);
    }
  }

  async delete(): Promise<void> {
    if (!this.isEditing()) {
      return;
    }

    if (!this.confirmingDelete()) {
      this.confirmingDelete.set(true);
      return;
    }

    this.saving.set(true);
    this.error.set('');

    try {
      await this.api.deleteLearner(this.learnerId());
      await this.router.navigate(['/learners']);
    } catch (error) {
      console.error('Mentee profile could not be deleted', error);
      this.error.set('The profile could not be deleted. Try again.');
    } finally {
      this.saving.set(false);
      this.confirmingDelete.set(false);
    }
  }

  private async loadLearner(learnerId: string): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const learner = await this.api.getLearner(learnerId);
      this.form.patchValue({
        pseudonym: learner.pseudonym,
        ageBand: learner.ageBand,
        locale: learner.locale,
        curriculumCode: learner.curriculumCode,
        interests: learner.interests.join(', '),
        learningPreference: learner.learningPreference,
        confidenceLevel: learner.confidenceLevel,
        attentionSpan: learner.attentionSpan,
        gender: learner.gender ?? '',
        subject: learner.subject,
        level: learner.level,
      });
    } catch (error) {
      console.error('Mentee profile could not be loaded', error);
      this.error.set(
        'The profile could not be loaded. It may have been removed or is unavailable.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
