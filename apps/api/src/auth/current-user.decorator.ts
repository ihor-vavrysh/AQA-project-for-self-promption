import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Auth0Claims } from '@tutorforge/shared';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Auth0Claims =>
    context.switchToHttp().getRequest<{ user: Auth0Claims }>().user,
);
