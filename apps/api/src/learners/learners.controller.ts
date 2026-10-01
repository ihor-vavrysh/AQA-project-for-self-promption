import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CreateLearnerRequestSchema,
  UpdateLearnerRequestSchema,
} from '@tutorforge/shared';
import type {
  Auth0Claims,
  CreateLearnerRequest,
  LearnerResponse,
  UpdateLearnerRequest,
} from '@tutorforge/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  CreateLearnerDto,
  LearnerDto,
  UpdateLearnerDto,
} from './learners.dto.js';
import { LearnersService } from './learners.service.js';

@ApiTags('learners')
@ApiBearerAuth()
@ApiBadRequestResponse({
  description: 'Request validation failed or identifier is invalid',
})
@ApiUnauthorizedResponse({
  description: 'A valid Auth0 access token is required',
})
@Controller('api/v1/learners')
export class LearnersController {
  constructor(private readonly learners: LearnersService) {}

  @Get()
  @ApiOperation({
    summary: 'List mentee profiles belonging to the authenticated tutor',
  })
  @ApiOkResponse({ type: LearnerDto, isArray: true })
  findAll(@CurrentUser() claims: Auth0Claims): Promise<LearnerResponse[]> {
    return this.learners.findAll(claims);
  }

  @Get(':learnerId')
  @ApiOperation({
    summary: 'Get a mentee profile belonging to the authenticated tutor',
  })
  @ApiOkResponse({ type: LearnerDto })
  @ApiNotFoundResponse({ description: 'Mentee profile not found' })
  findOne(
    @CurrentUser() claims: Auth0Claims,
    @Param('learnerId', ParseUUIDPipe) learnerId: string,
  ): Promise<LearnerResponse> {
    return this.learners.findOne(claims, learnerId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a tutor-managed pseudonymous mentee profile',
  })
  @ApiBody({ type: CreateLearnerDto })
  @ApiCreatedResponse({ type: LearnerDto })
  create(
    @CurrentUser() claims: Auth0Claims,
    @Body(new ZodValidationPipe(CreateLearnerRequestSchema))
    profile: CreateLearnerRequest,
  ): Promise<LearnerResponse> {
    return this.learners.create(claims, profile);
  }

  @Patch(':learnerId')
  @ApiOperation({
    summary: 'Update a mentee profile belonging to the authenticated tutor',
  })
  @ApiBody({ type: UpdateLearnerDto })
  @ApiOkResponse({ type: LearnerDto })
  @ApiNotFoundResponse({ description: 'Mentee profile not found' })
  update(
    @CurrentUser() claims: Auth0Claims,
    @Param('learnerId', ParseUUIDPipe) learnerId: string,
    @Body(new ZodValidationPipe(UpdateLearnerRequestSchema))
    profile: UpdateLearnerRequest,
  ): Promise<LearnerResponse> {
    return this.learners.update(claims, learnerId, profile);
  }

  @Delete(':learnerId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a mentee profile belonging to the authenticated tutor',
  })
  @ApiNoContentResponse({ description: 'Mentee profile deleted' })
  @ApiNotFoundResponse({ description: 'Mentee profile not found' })
  async remove(
    @CurrentUser() claims: Auth0Claims,
    @Param('learnerId', ParseUUIDPipe) learnerId: string,
  ): Promise<void> {
    await this.learners.remove(claims, learnerId);
  }
}
