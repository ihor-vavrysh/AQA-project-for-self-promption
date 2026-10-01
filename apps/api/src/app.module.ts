import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { UsersController } from './users/users.controller.js';
import { UsersService } from './users/users.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [AppController, UsersController],
  providers: [UsersService],
})
export class AppModule {}
