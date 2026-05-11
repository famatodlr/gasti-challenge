import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';

import { ChatController } from './chat.controller.ts';

test('ChatController rejects a missing message', async () => {
  const controller = new ChatController({
    answer: async () => {
      throw new Error('service should not be called');
    },
  });

  await assert.rejects(() => controller.chat({}), BadRequestException);
});

test('ChatController returns the service answer', async () => {
  const controller = new ChatController({
    answer: async (message: string) => `answered: ${message}`,
  });

  assert.deepEqual(await controller.chat({ message: 'Cuanto gaste en mayo?' }), {
    answer: 'answered: Cuanto gaste en mayo?',
  });
});
