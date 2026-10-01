import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogController } from './catalog/catalog.controller.js';
import { CatalogService } from './catalog/catalog.service.js';
import { DatabaseModule } from './database/database.module.js';
import { LearnersController } from './learners/learners.controller.js';
import { LearnersService } from './learners/learners.service.js';
import { UsersController } from './users/users.controller.js';
import { UsersService } from './users/users.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [
    AppController,
    CatalogController,
    LearnersController,
    UsersController,
  ],
  providers: [CatalogService, LearnersService, UsersService],
})
export class AppModule {}
