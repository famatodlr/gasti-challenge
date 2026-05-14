import './load-root-env.ts';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { getApiPort } from './main-config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = getApiPort();
  await app.listen(port);
  console.log(`api listening on http://localhost:${port}`);
}

bootstrap();
