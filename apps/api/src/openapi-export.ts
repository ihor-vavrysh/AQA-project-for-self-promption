import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { createOpenApiDocument } from './openapi.js';

const app = await NestFactory.create(AppModule, { logger: false });

try {
  const document = createOpenApiDocument(app);
  await writeFile(
    resolve(import.meta.dirname, '../openapi.json'),
    `${JSON.stringify(document, null, 2)}\n`,
  );
} finally {
  await app.close();
}
