import test from 'node:test';
import assert from 'node:assert/strict';
import { InternalServerErrorException, Logger, ServiceUnavailableException } from '@nestjs/common';

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

test('ChatService logs agent generation failures without changing the public error', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const fakeKey = 'fake-gemini-secret';
  process.env.GEMINI_API_KEY = fakeKey;

  const originalLoggerError = Logger.prototype.error;
  const loggedErrors: unknown[][] = [];
  Logger.prototype.error = function (...args: unknown[]) {
    loggedErrors.push(args);
  };

  try {
    const cause = new Error(`Provider rejected key ${fakeKey}`);
    const agentError = new Error(`Gemini request failed with ${fakeKey}`, { cause });
    const service = new ChatService({
      generate: async () => {
        throw agentError;
      },
    });

    await assert.rejects(() => service.answer('Cuanto gaste?'), {
      constructor: InternalServerErrorException,
      message: 'Failed to generate a chat answer.',
    });

    assert.equal(loggedErrors.length, 1);
    const [payload] = loggedErrors[0];
    assert.equal((payload as { event: string }).event, 'chat.agent_generation_failed');
    assert.equal((payload as { error: { name: string } }).error.name, 'Error');
    assert.equal(
      (payload as { error: { message: string } }).error.message,
      'Gemini request failed with [REDACTED]',
    );
    assert.equal((payload as { error: { cause: { name: string } } }).error.cause.name, 'Error');
    assert.equal(
      (payload as { error: { cause: { message: string } } }).error.cause.message,
      'Provider rejected key [REDACTED]',
    );
    assert.equal(JSON.stringify(payload).includes(fakeKey), false);
    assert.match((payload as { error: { stack: string } }).error.stack, /Gemini request failed/);
    assert.match(
      (payload as { error: { cause: { stack: string } } }).error.cause.stack,
      /Provider rejected key/,
    );
  } finally {
    Logger.prototype.error = originalLoggerError;

    if (previousKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousKey;
    }
  }
});
