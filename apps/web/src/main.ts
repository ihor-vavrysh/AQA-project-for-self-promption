import { bootstrapApplication } from '@angular/platform-browser';
import { PublicAppConfigSchema } from '@tutorforge/shared';
import { createAppConfig } from './app/app.config';
import { App } from './app/app';

const response = await fetch('/app-config.json');

if (!response.ok) {
  throw new Error(`Could not load application configuration: ${response.status}`);
}

const config = PublicAppConfigSchema.parse(await response.json());
await bootstrapApplication(App, await createAppConfig(config));
