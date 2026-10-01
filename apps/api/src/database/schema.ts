import {
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const organisationRole = pgEnum('organisation_role', ['admin', 'tutor']);
export const learnerAgeBand = pgEnum('learner_age_band', [
  '5-7',
  '8-10',
  '11-13',
  '14-16',
  '17-18',
]);
export const learnerLearningPreference = pgEnum('learner_learning_preference', [
  'visual',
  'narrative',
  'step-by-step',
  'challenge-first',
]);
export const learnerConfidenceLevel = pgEnum('learner_confidence_level', [
  'low',
  'developing',
  'confident',
  'high',
]);
export const learnerAttentionSpan = pgEnum('learner_attention_span', [
  'under-10-minutes',
  '10-20-minutes',
  'over-20-minutes',
]);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  auth0Subject: varchar('auth0_subject', { length: 255 }).notNull().unique(),
  email: varchar('email', { length: 320 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export const organisations = pgTable('organisations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 160 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export const organisationMemberships = pgTable(
  'organisation_memberships',
  {
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: organisationRole('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.organisationId, table.userId] })],
);

export const learners = pgTable('learners', {
  id: uuid('id').defaultRandom().primaryKey(),
  tutorId: uuid('tutor_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  pseudonym: varchar('pseudonym', { length: 40 }).notNull(),
  ageBand: learnerAgeBand('age_band').notNull(),
  locale: varchar('locale', { length: 20 }).notNull(),
  curriculumCode: varchar('curriculum_code', { length: 40 }).notNull(),
  interests: varchar('interests', { length: 40 }).array().notNull().default([]),
  learningPreference: learnerLearningPreference(
    'learning_preference',
  ).notNull(),
  confidenceLevel: learnerConfidenceLevel('confidence_level').notNull(),
  attentionSpan: learnerAttentionSpan('attention_span').notNull(),
  gender: varchar('gender', { length: 64 }),
  subject: varchar('subject', { length: 80 }).notNull(),
  level: varchar('level', { length: 80 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});
