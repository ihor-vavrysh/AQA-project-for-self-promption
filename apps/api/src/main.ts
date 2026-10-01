import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { setupOpenApi } from './openapi.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  setupOpenApi(app);
  await app.listen(app.get(ConfigService).getOrThrow<number>('PORT'));
}

await bootstrap();
