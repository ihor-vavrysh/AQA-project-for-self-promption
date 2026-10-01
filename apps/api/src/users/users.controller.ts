import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Auth0Claims, CurrentUserResponse } from '@tutorforge/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CurrentUserDto } from './users.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('api/v1')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated tutor profile' })
  @ApiOkResponse({ type: CurrentUserDto })
  @ApiUnauthorizedResponse({
    description: 'A valid Auth0 access token is required',
  })
  getMe(@CurrentUser() claims: Auth0Claims): Promise<CurrentUserResponse> {
    return this.users.findOrCreate(claims);
  }
}
