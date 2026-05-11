import test from 'node:test';
import assert from 'node:assert/strict';
import { ServiceUnavailableException } from '@nestjs/common';

import { ChatService } from './chat.service.ts';

test('ChatService invokes the finance agent with the user message', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';

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
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousKey;
    }
  }
});

test('ChatService reports a missing Gemini API key as unavailable', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    const service = new ChatService({
      generate: async () => {
        throw new Error('agent should not be called');
      },
    });

    await assert.rejects(() => service.answer('Cuanto gaste?'), {
      constructor: ServiceUnavailableException,
      message: 'GEMINI_API_KEY is required to use the chat endpoint.',
    });
  } finally {
    if (previousKey !== undefined) {
      process.env.GEMINI_API_KEY = previousKey;
    }
  }
});

test('ChatService ignores the provider-specific legacy key when GEMINI_API_KEY is missing', async () => {
  const legacyGoogleKey = ['GOOGLE', 'GENERATIVE', 'AI', 'API', 'KEY'].join('_');
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  const previousGoogleKey = process.env[legacyGoogleKey];
  delete process.env.GEMINI_API_KEY;
  process.env[legacyGoogleKey] = 'legacy-google-key';

  try {
    const service = new ChatService({
      generate: async () => {
        throw new Error('agent should not be called');
      },
    });

    await assert.rejects(() => service.answer('Cuanto gaste?'), {
      constructor: ServiceUnavailableException,
      message: 'GEMINI_API_KEY is required to use the chat endpoint.',
    });
  } finally {
    if (previousGeminiKey !== undefined) {
      process.env.GEMINI_API_KEY = previousGeminiKey;
    }

    if (previousGoogleKey === undefined) {
      delete process.env[legacyGoogleKey];
    } else {
      process.env[legacyGoogleKey] = previousGoogleKey;
    }
  }
});
