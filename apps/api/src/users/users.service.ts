import { Injectable } from '@nestjs/common';
import { CurrentUserResponseSchema } from '@tutorforge/shared';
import type { Auth0Claims, CurrentUserResponse } from '@tutorforge/shared';
import { DatabaseService } from '../database/database.service.js';
import { users } from '../database/schema.js';

@Injectable()
export class UsersService {
  constructor(private readonly database: DatabaseService) {}

  async findOrCreate(claims: Auth0Claims): Promise<CurrentUserResponse> {
    const [user] = await this.database.db
      .insert(users)
      .values({
        auth0Subject: claims.sub,
        email: claims.email ?? null,
      })
      .onConflictDoUpdate({
        target: users.auth0Subject,
        set: claims.email
          ? { email: claims.email }
          : { auth0Subject: claims.sub },
      })
      .returning();

    if (!user) {
      throw new Error('User upsert did not return a row');
    }

    return CurrentUserResponseSchema.parse({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    });
  }
}
