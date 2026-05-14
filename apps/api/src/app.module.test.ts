import 'reflect-metadata';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.ts';

test('AppModule creates the Nest application context', async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  await app.close();
});
