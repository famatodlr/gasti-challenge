import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ChatService } from './chat.service.ts';

const PROVIDER_QUOTA_MESSAGE = 'The AI provider quota was exceeded. Please try again later.';
const AI_ENV_KEYS = ['GEMINI_API_KEY', 'GASTI_AI_MODEL', 'GASTI_AI_MODEL_FALLBACK_CHAIN'] as const;

type AiEnvKey = (typeof AI_ENV_KEYS)[number];
type TestChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};
type CapturedGenerateCall = {
  messages: TestChatMessage[];
  modelId?: string;
  maxSteps?: number;
};

function userConversation(content: string): TestChatMessage[] {
  return [{ role: 'user', content }];
}

function comparisonFollowUpConversation(): TestChatMessage[] {
  return [
    { role: 'user', content: 'Comparame mis gastos de mayo de 2026 contra abril de 2026' },
    {
      role: 'assistant',
      content:
        'En mayo de 2026, tus gastos bajaron contra abril. Salud aumento, Servicios bajo y Educacion bajo.',
    },
    { role: 'user', content: 'Que categoria aumento mas?' },
  ];
}

function copyMessages(messages: readonly TestChatMessage[]): TestChatMessage[] {
  return messages.map((message) => ({ ...message }));
}

function restoreAiEnv(snapshot: Record<AiEnvKey, string | undefined>): void {
  for (const key of AI_ENV_KEYS) {
    const value = snapshot[key];

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function useTestAiEnv(overrides: Partial<Record<AiEnvKey, string | undefined>> = {}): () => void {
  const snapshot = Object.fromEntries(AI_ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
    AiEnvKey,
    string | undefined
  >;

  process.env.GEMINI_API_KEY = 'test-key';
  delete process.env.GASTI_AI_MODEL;
  delete process.env.GASTI_AI_MODEL_FALLBACK_CHAIN;

  for (const key of AI_ENV_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(overrides, key)) {
      continue;
    }

    const value = overrides[key];

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => restoreAiEnv(snapshot);
}

function silenceInfoLogs(): () => void {
  const originalLoggerLog = Logger.prototype.log;
  Logger.prototype.log = function () {};

  return () => {
    Logger.prototype.log = originalLoggerLog;
  };
}

function assertProviderQuotaException(error: unknown): boolean {
  assert.ok(error instanceof HttpException);
  assert.equal(error.getStatus(), HttpStatus.TOO_MANY_REQUESTS);

  const response = error.getResponse();
  if (typeof response === 'string') {
    assert.equal(response, PROVIDER_QUOTA_MESSAGE);
  } else {
    assert.equal((response as { message: string }).message, PROVIDER_QUOTA_MESSAGE);
  }

  return true;
}

test('ChatService invokes the finance agent with the full message history', async () => {
  const restoreEnv = useTestAiEnv();
  const restoreLoggerLog = silenceInfoLogs();
  const messages = comparisonFollowUpConversation();

  try {
    const service = new ChatService({
      generate: async (receivedMessages, options) => {
        assert.deepEqual(receivedMessages, messages);
        assert.equal(options?.maxSteps, 5);
        assert.equal(options?.modelId, 'gemini-2.5-flash');

        return { text: 'Salud fue la categoria que mas aumento.' };
      },
    });

    assert.equal(await service.answer(messages), 'Salud fue la categoria que mas aumento.');
  } finally {
    restoreEnv();
    restoreLoggerLog();
  }
});

test('ChatService falls back to the next model with the same message history on provider quota errors', async () => {
  const restoreEnv = useTestAiEnv({
    GASTI_AI_MODEL_FALLBACK_CHAIN: 'gemini-primary,gemini-secondary,gemini-third',
  });
  const restoreLoggerLog = silenceInfoLogs();
  const originalLoggerWarn = Logger.prototype.warn;
  const loggedWarnings: unknown[][] = [];
  Logger.prototype.warn = function (...args: unknown[]) {
    loggedWarnings.push(args);
  };
  const messages = comparisonFollowUpConversation();

  try {
    const calls: CapturedGenerateCall[] = [];
    const quotaError = new Error('RESOURCE_EXHAUSTED: quota exceeded for GenerateContent');
    const service = new ChatService({
      generate: async (receivedMessages, options) => {
        calls.push({
          messages: copyMessages(receivedMessages),
          modelId: options?.modelId,
          maxSteps: options?.maxSteps,
        });

        if (options?.modelId === 'gemini-primary') {
          throw quotaError;
        }

        return { text: 'Respuesta desde fallback.' };
      },
    });

    assert.equal(await service.answer(messages), 'Respuesta desde fallback.');
    assert.deepEqual(
      calls.map((call) => call.modelId),
      ['gemini-primary', 'gemini-secondary'],
    );
    assert.deepEqual(calls.map((call) => call.maxSteps), [5, 5]);
    assert.deepEqual(calls.map((call) => call.messages), [messages, messages]);
    assert.deepEqual(
      loggedWarnings.map(([payload]) => (payload as { event: string }).event),
      ['chat.model_fallback_retrying'],
    );
    assert.equal((loggedWarnings[0][0] as { modelId: string }).modelId, 'gemini-primary');
    assert.equal((loggedWarnings[0][0] as { nextModelId: string }).nextModelId, 'gemini-secondary');
  } finally {
    Logger.prototype.warn = originalLoggerWarn;
    restoreLoggerLog();
    restoreEnv();
  }
});

test('ChatService exhausts the fallback chain before returning the public quota error', async () => {
  const restoreEnv = useTestAiEnv({
    GASTI_AI_MODEL_FALLBACK_CHAIN: 'gemini-primary,gemini-secondary',
  });
  const restoreLoggerLog = silenceInfoLogs();
  const originalLoggerWarn = Logger.prototype.warn;
  const originalLoggerError = Logger.prototype.error;
  const loggedWarnings: unknown[][] = [];
  const loggedErrors: unknown[][] = [];
  Logger.prototype.warn = function (...args: unknown[]) {
    loggedWarnings.push(args);
  };
  Logger.prototype.error = function (...args: unknown[]) {
    loggedErrors.push(args);
  };

  try {
    const calls: string[] = [];
    const service = new ChatService({
      generate: async (_messages, options) => {
        calls.push(options?.modelId ?? '');
        throw new Error(`Quota exceeded for ${options?.modelId}`);
      },
    });

    await assert.rejects(() => service.answer(userConversation('Cuanto gaste?')), assertProviderQuotaException);
    assert.deepEqual(calls, ['gemini-primary', 'gemini-secondary']);
    assert.deepEqual(
      loggedWarnings.map(([payload]) => (payload as { event: string }).event),
      ['chat.model_fallback_retrying', 'chat.provider_quota_exceeded'],
    );
    assert.equal(loggedErrors.length, 1);
    assert.equal((loggedErrors[0][0] as { event: string }).event, 'chat.model_fallback_exhausted');
    assert.match(
      (loggedErrors[0][0] as { error: { message: string } }).error.message,
      /All Gemini fallback models were exhausted: gemini-primary, gemini-secondary/,
    );
  } finally {
    Logger.prototype.warn = originalLoggerWarn;
    Logger.prototype.error = originalLoggerError;
    restoreLoggerLog();
    restoreEnv();
  }
});

test('ChatService honors GASTI_AI_MODEL as a hard override without fallback', async () => {
  const restoreEnv = useTestAiEnv({
    GASTI_AI_MODEL: 'gemini-fixed',
    GASTI_AI_MODEL_FALLBACK_CHAIN: 'gemini-primary,gemini-secondary',
  });
  const restoreLoggerLog = silenceInfoLogs();
  const originalLoggerWarn = Logger.prototype.warn;
  const originalLoggerError = Logger.prototype.error;
  const loggedWarnings: unknown[][] = [];
  const loggedErrors: unknown[][] = [];
  Logger.prototype.warn = function (...args: unknown[]) {
    loggedWarnings.push(args);
  };
  Logger.prototype.error = function (...args: unknown[]) {
    loggedErrors.push(args);
  };

  try {
    const calls: string[] = [];
    const service = new ChatService({
      generate: async (_messages, options) => {
        calls.push(options?.modelId ?? '');
        throw new Error('RESOURCE_EXHAUSTED: rate limit reached');
      },
    });

    await assert.rejects(() => service.answer(userConversation('Cuanto gaste?')), assertProviderQuotaException);
    assert.deepEqual(calls, ['gemini-fixed']);
    assert.deepEqual(
      loggedWarnings.map(([payload]) => (payload as { event: string }).event),
      ['chat.provider_quota_exceeded'],
    );
    assert.equal(loggedErrors.length, 1);
    assert.equal((loggedErrors[0][0] as { event: string }).event, 'chat.model_fallback_exhausted');
  } finally {
    Logger.prototype.warn = originalLoggerWarn;
    Logger.prototype.error = originalLoggerError;
    restoreLoggerLog();
    restoreEnv();
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

    await assert.rejects(() => service.answer(userConversation('Cuanto gaste?')), {
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

    await assert.rejects(() => service.answer(userConversation('Cuanto gaste?')), {
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

  const restoreLoggerLog = silenceInfoLogs();
  const originalLoggerError = Logger.prototype.error;
  const loggedErrors: unknown[][] = [];
  Logger.prototype.error = function (...args: unknown[]) {
    loggedErrors.push(args);
  };
  let calls = 0;

  try {
    const cause = new Error(`Provider rejected key ${fakeKey}`);
    const agentError = new Error(`Gemini request failed with ${fakeKey}`, { cause });
    const service = new ChatService({
      generate: async () => {
        calls += 1;
        throw agentError;
      },
    });

    await assert.rejects(() => service.answer(userConversation('Cuanto gaste?')), {
      constructor: InternalServerErrorException,
      message: 'Failed to generate a chat answer.',
    });

    assert.equal(loggedErrors.length, 1);
    assert.equal(calls, 1);
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
    restoreLoggerLog();

    if (previousKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousKey;
    }
  }
});

test('ChatService retries invalid tool argument failures once with corrective instructions and full history', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';

  const restoreLoggerLog = silenceInfoLogs();
  const originalLoggerWarn = Logger.prototype.warn;
  const originalLoggerError = Logger.prototype.error;
  const loggedWarnings: unknown[][] = [];
  const loggedErrors: unknown[][] = [];
  Logger.prototype.warn = function (...args: unknown[]) {
    loggedWarnings.push(args);
  };
  Logger.prototype.error = function (...args: unknown[]) {
    loggedErrors.push(args);
  };
  const messages = comparisonFollowUpConversation();

  try {
    const calls: CapturedGenerateCall[] = [];
    const invalidToolError = new Error('Invalid arguments for tool spendingSummaryTool');
    invalidToolError.name = 'AI_InvalidToolArgumentsError';

    const service = new ChatService({
      generate: async (receivedMessages, options) => {
        calls.push({ messages: copyMessages(receivedMessages), maxSteps: options?.maxSteps });

        if (calls.length === 1) {
          throw invalidToolError;
        }

        return { text: 'Salud fue la categoria que mas aumento.' };
      },
    });

    assert.equal(await service.answer(messages), 'Salud fue la categoria que mas aumento.');

    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map((call) => call.maxSteps), [5, 5]);
    assert.deepEqual(calls[0].messages, messages);
    assert.deepEqual(calls[1].messages.slice(0, -1), messages);

    const retryMessage = calls[1].messages.at(-1);
    assert.equal(retryMessage?.role, 'user');
    assert.match(retryMessage?.content ?? '', /previous attempt failed because a tool call used invalid arguments/);
    assert.match(retryMessage?.content ?? '', /exact tool input schema/);
    assert.match(retryMessage?.content ?? '', /Do not invent/);
    assert.match(retryMessage?.content ?? '', /top-level from and to/);
    assert.match(retryMessage?.content ?? '', /currentFrom, currentTo, baselineFrom, and baselineTo/);
    assert.match(retryMessage?.content ?? '', /Do not use nested dateRange/);
    assert.match(retryMessage?.content ?? '', /from1/);
    assert.match(retryMessage?.content ?? '', /YYYY-MM-DD/);

    assert.equal(loggedWarnings.length, 1);
    assert.equal((loggedWarnings[0][0] as { event: string }).event, 'chat.agent_generation_retrying');
    assert.equal(loggedErrors.length, 0);
  } finally {
    Logger.prototype.warn = originalLoggerWarn;
    Logger.prototype.error = originalLoggerError;
    restoreLoggerLog();

    if (previousKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousKey;
    }
  }
});

test('ChatService does not retry non-tool generation failures', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';

  const restoreLoggerLog = silenceInfoLogs();
  const originalLoggerError = Logger.prototype.error;
  const loggedErrors: unknown[][] = [];
  Logger.prototype.error = function (...args: unknown[]) {
    loggedErrors.push(args);
  };

  try {
    let calls = 0;
    const service = new ChatService({
      generate: async () => {
        calls += 1;
        throw new Error('Provider timed out');
      },
    });

    await assert.rejects(() => service.answer(userConversation('Cuanto gaste?')), {
      constructor: InternalServerErrorException,
      message: 'Failed to generate a chat answer.',
    });
    assert.equal(calls, 1);
    assert.equal(loggedErrors.length, 1);
    assert.equal((loggedErrors[0][0] as { event: string }).event, 'chat.agent_generation_failed');
  } finally {
    Logger.prototype.error = originalLoggerError;
    restoreLoggerLog();

    if (previousKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousKey;
    }
  }
});

test('ChatService does not fallback for AI retry errors without quota signals', async () => {
  const restoreEnv = useTestAiEnv();

  const restoreLoggerLog = silenceInfoLogs();
  const originalLoggerError = Logger.prototype.error;
  const originalLoggerWarn = Logger.prototype.warn;
  const loggedErrors: unknown[][] = [];
  const loggedWarnings: unknown[][] = [];
  Logger.prototype.error = function (...args: unknown[]) {
    loggedErrors.push(args);
  };
  Logger.prototype.warn = function (...args: unknown[]) {
    loggedWarnings.push(args);
  };

  try {
    let calls = 0;
    const retryError = new Error('Model returned invalid output');
    retryError.name = 'AI_RetryError';
    const service = new ChatService({
      generate: async () => {
        calls += 1;
        throw retryError;
      },
    });

    await assert.rejects(() => service.answer(userConversation('Cuanto gaste?')), {
      constructor: InternalServerErrorException,
      message: 'Failed to generate a chat answer.',
    });
    assert.equal(calls, 1);
    assert.equal(loggedErrors.length, 1);
    assert.equal((loggedErrors[0][0] as { event: string }).event, 'chat.agent_generation_failed');
    assert.equal(
      loggedWarnings.some(([payload]) => (payload as { event: string }).event === 'chat.model_fallback_retrying'),
      false,
    );
  } finally {
    Logger.prototype.error = originalLoggerError;
    Logger.prototype.warn = originalLoggerWarn;
    restoreLoggerLog();
    restoreEnv();
  }
});

test('ChatService maps provider quota failures to Too Many Requests after exhausting fallback models', async () => {
  const restoreEnv = useTestAiEnv();

  const restoreLoggerLog = silenceInfoLogs();
  const originalLoggerWarn = Logger.prototype.warn;
  const originalLoggerError = Logger.prototype.error;
  const loggedWarnings: unknown[][] = [];
  const loggedErrors: unknown[][] = [];
  Logger.prototype.warn = function (...args: unknown[]) {
    loggedWarnings.push(args);
  };
  Logger.prototype.error = function (...args: unknown[]) {
    loggedErrors.push(args);
  };

  try {
    let calls = 0;
    const quotaError = new Error('You exceeded your current quota, please check your plan and billing details.');
    quotaError.name = 'AI_RetryError';
    const service = new ChatService({
      generate: async () => {
        calls += 1;
        throw quotaError;
      },
    });

    await assert.rejects(() => service.answer(userConversation('Cuanto gaste?')), assertProviderQuotaException);

    assert.equal(calls, 3);
    assert.deepEqual(
      loggedWarnings.map(([payload]) => (payload as { event: string }).event),
      ['chat.model_fallback_retrying', 'chat.model_fallback_retrying', 'chat.provider_quota_exceeded'],
    );
    assert.equal(
      loggedWarnings.some(([payload]) => (payload as { event: string }).event === 'chat.agent_generation_retrying'),
      false,
    );
    assert.equal(loggedErrors.length, 1);
    assert.equal((loggedErrors[0][0] as { event: string }).event, 'chat.model_fallback_exhausted');
  } finally {
    Logger.prototype.warn = originalLoggerWarn;
    Logger.prototype.error = originalLoggerError;
    restoreLoggerLog();
    restoreEnv();
  }
});

test('ChatService detects provider quota failures from nested causes', async () => {
  const restoreEnv = useTestAiEnv({ GASTI_AI_MODEL: 'gemini-fixed' });

  const restoreLoggerLog = silenceInfoLogs();
  const originalLoggerWarn = Logger.prototype.warn;
  const originalLoggerError = Logger.prototype.error;
  const loggedWarnings: unknown[][] = [];
  Logger.prototype.warn = function (...args: unknown[]) {
    loggedWarnings.push(args);
  };
  Logger.prototype.error = function () {};

  try {
    const quotaCause = new Error('Quota exceeded for metric GenerateContent request count');
    quotaCause.name = 'AI_RetryError';
    const providerError = new Error('Gemini provider request failed', { cause: quotaCause });
    const service = new ChatService({
      generate: async () => {
        throw providerError;
      },
    });

    await assert.rejects(() => service.answer(userConversation('Cuanto gaste?')), assertProviderQuotaException);

    assert.equal(loggedWarnings.length, 1);
    assert.equal((loggedWarnings[0][0] as { event: string }).event, 'chat.provider_quota_exceeded');
  } finally {
    Logger.prototype.warn = originalLoggerWarn;
    Logger.prototype.error = originalLoggerError;
    restoreLoggerLog();
    restoreEnv();
  }
});

test('ChatService maps quota failures during the invalid-tool retry to Too Many Requests', async () => {
  const restoreEnv = useTestAiEnv({
    GASTI_AI_MODEL_FALLBACK_CHAIN: 'gemini-primary,gemini-secondary',
  });

  const restoreLoggerLog = silenceInfoLogs();
  const originalLoggerWarn = Logger.prototype.warn;
  const originalLoggerError = Logger.prototype.error;
  const loggedWarnings: unknown[][] = [];
  const loggedErrors: unknown[][] = [];
  Logger.prototype.warn = function (...args: unknown[]) {
    loggedWarnings.push(args);
  };
  Logger.prototype.error = function (...args: unknown[]) {
    loggedErrors.push(args);
  };

  try {
    let calls = 0;
    const invalidToolError = new Error('Invalid arguments for tool spendingSummaryTool');
    invalidToolError.name = 'AI_InvalidToolArgumentsError';
    const quotaError = new Error('RESOURCE_EXHAUSTED: rate limit reached');

    const service = new ChatService({
      generate: async () => {
        calls += 1;

        if (calls === 1) {
          throw invalidToolError;
        }

        throw quotaError;
      },
    });

    await assert.rejects(() => service.answer(userConversation('Cuanto gaste?')), assertProviderQuotaException);

    assert.equal(calls, 3);
    assert.deepEqual(
      loggedWarnings.map(([payload]) => (payload as { event: string }).event),
      ['chat.agent_generation_retrying', 'chat.model_fallback_retrying', 'chat.provider_quota_exceeded'],
    );
    assert.equal(loggedErrors.length, 1);
    assert.equal((loggedErrors[0][0] as { event: string }).event, 'chat.model_fallback_exhausted');
  } finally {
    Logger.prototype.warn = originalLoggerWarn;
    Logger.prototype.error = originalLoggerError;
    restoreLoggerLog();
    restoreEnv();
  }
});

test('ChatService returns the public error when the invalid-tool retry also fails', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';

  const restoreLoggerLog = silenceInfoLogs();
  const originalLoggerWarn = Logger.prototype.warn;
  const originalLoggerError = Logger.prototype.error;
  const loggedWarnings: unknown[][] = [];
  const loggedErrors: unknown[][] = [];
  Logger.prototype.warn = function (...args: unknown[]) {
    loggedWarnings.push(args);
  };
  Logger.prototype.error = function (...args: unknown[]) {
    loggedErrors.push(args);
  };

  try {
    let calls = 0;
    const invalidToolError = new Error('Type validation failed: Invalid arguments for tool spendingSummaryTool');
    invalidToolError.name = 'AI_TypeValidationError';

    const service = new ChatService({
      generate: async () => {
        calls += 1;

        if (calls === 1) {
          throw invalidToolError;
        }

        throw new Error('Retry still failed');
      },
    });

    await assert.rejects(() => service.answer(userConversation('Cuanto gaste?')), {
      constructor: InternalServerErrorException,
      message: 'Failed to generate a chat answer.',
    });

    assert.equal(calls, 2);
    assert.equal(loggedWarnings.length, 1);
    assert.equal((loggedWarnings[0][0] as { event: string }).event, 'chat.agent_generation_retrying');
    assert.equal(loggedErrors.length, 1);
    assert.equal((loggedErrors[0][0] as { event: string }).event, 'chat.agent_generation_failed');
  } finally {
    Logger.prototype.warn = originalLoggerWarn;
    Logger.prototype.error = originalLoggerError;
    restoreLoggerLog();

    if (previousKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousKey;
    }
  }
});
