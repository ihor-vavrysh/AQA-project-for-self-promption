import { Injectable, NotFoundException } from '@nestjs/common';
import {
  LearnerResponseSchema,
  type Auth0Claims,
  type CreateLearnerRequest,
  type LearnerResponse,
  type UpdateLearnerRequest,
} from '@tutorforge/shared';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { learners } from '../database/schema.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class LearnersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly users: UsersService,
  ) {}

  async findAll(claims: Auth0Claims): Promise<LearnerResponse[]> {
    const tutor = await this.users.findOrCreate(claims);
    const rows = await this.database.db
      .select()
      .from(learners)
      .where(eq(learners.tutorId, tutor.id))
      .orderBy(desc(learners.createdAt));

    return rows.map((row) => this.toResponse(row));
  }

  async findOne(
    claims: Auth0Claims,
    learnerId: string,
  ): Promise<LearnerResponse> {
    const tutor = await this.users.findOrCreate(claims);
    const [row] = await this.database.db
      .select()
      .from(learners)
      .where(and(eq(learners.id, learnerId), eq(learners.tutorId, tutor.id)))
      .limit(1);

    if (!row) {
      throw new NotFoundException('Mentee profile not found');
    }

    return this.toResponse(row);
  }

  async create(
    claims: Auth0Claims,
    profile: CreateLearnerRequest,
  ): Promise<LearnerResponse> {
    const tutor = await this.users.findOrCreate(claims);
    const [row] = await this.database.db
      .insert(learners)
      .values({
        tutorId: tutor.id,
        ...profile,
      })
      .returning();

    if (!row) {
      throw new Error('Mentee profile insert did not return a row');
    }

    return this.toResponse(row);
  }

  async update(
    claims: Auth0Claims,
    learnerId: string,
    profile: UpdateLearnerRequest,
  ): Promise<LearnerResponse> {
    const tutor = await this.users.findOrCreate(claims);
    const [row] = await this.database.db
      .update(learners)
      .set({ ...profile, updatedAt: new Date() })
      .where(and(eq(learners.id, learnerId), eq(learners.tutorId, tutor.id)))
      .returning();

    if (!row) {
      throw new NotFoundException('Mentee profile not found');
    }

    return this.toResponse(row);
  }

  async remove(claims: Auth0Claims, learnerId: string): Promise<void> {
    const tutor = await this.users.findOrCreate(claims);
    const [row] = await this.database.db
      .delete(learners)
      .where(and(eq(learners.id, learnerId), eq(learners.tutorId, tutor.id)))
      .returning({ id: learners.id });

    if (!row) {
      throw new NotFoundException('Mentee profile not found');
    }
  }

  private toResponse(row: typeof learners.$inferSelect): LearnerResponse {
    return LearnerResponseSchema.parse({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
}
