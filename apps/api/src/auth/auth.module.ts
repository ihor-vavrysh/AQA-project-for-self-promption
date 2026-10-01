import { Global, Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { validateEnvironment } from '../config/environment.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Auth0JwtStrategy } from './jwt.strategy.js';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  providers: [
    Auth0JwtStrategy,
    {
      provide: APP_GUARD,
      inject: [Reflector],
      useFactory: (reflector: Reflector) => new JwtAuthGuard(reflector),
    },
  ],
  exports: [PassportModule],
})
export class AuthModule {}
