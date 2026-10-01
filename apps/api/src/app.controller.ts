import { Controller, Get } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { HealthResponseSchema } from '@tutorforge/shared';
import type { HealthResponse } from '@tutorforge/shared';
import { Public } from './auth/public.decorator.js';
import { DatabaseService } from './database/database.service.js';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly database: DatabaseService) {}

  @Public()
  @Get('api/v1/health')
  @ApiOperation({ summary: 'Check API and PostgreSQL readiness' })
  @ApiInternalServerErrorResponse({
    description: 'The database is unavailable',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['ok'] } },
      required: ['status'],
    },
  })
  async getHealth(): Promise<HealthResponse> {
    await this.database.checkConnection();
    return HealthResponseSchema.parse({ status: 'ok' });
  }
}
