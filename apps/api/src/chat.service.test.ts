import test from 'node:test';
import assert from 'node:assert/strict';
import { ServiceUnavailableException } from '@nestjs/common';

import { ChatService } from './chat.service.ts';

test('ChatService invokes the finance agent with the user message', async () => {
  const previousKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';

  try {
    const service = new ChatService({
      generate: async (message, options) => {
        assert.equal(message, 'Que gastos fijos tengo?');
        assert.equal(options?.maxSteps, 5);

        return { text: 'Tenes gastos fijos detectados.' };
      },
    });

    assert.equal(await service.answer('Que gastos fijos tengo?'), 'Tenes gastos fijos detectados.');
  } finally {
    if (previousKey === undefined) {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    } else {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = previousKey;
    }
  }
});

test('ChatService reports a missing Google API key as unavailable', async () => {
  const previousKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  try {
    const service = new ChatService({
      generate: async () => {
        throw new Error('agent should not be called');
      },
    });

    await assert.rejects(() => service.answer('Cuanto gaste?'), ServiceUnavailableException);
  } finally {
    if (previousKey !== undefined) {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = previousKey;
    }
  }
});
