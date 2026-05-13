import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GastiModelFallbackExhaustedError } from 'ai/mastra';

import { ChatService } from './chat.service.ts';
import type { ChatRequestContext, NormalizedChatRequest } from './chat.types.ts';

const PROVIDER_QUOTA_MESSAGE = 'The AI provider quota was exceeded. Please try again later.';
const EMPTY_ANSWER_MESSAGE = 'The AI provider returned an empty answer. Please try again.';
const AI_ENV_KEYS = ['GEMINI_API_KEY', 'GASTI_AI_MODEL', 'GASTI_AI_MODEL_FALLBACK_CHAIN'] as const;

type AiEnvKey = (typeof AI_ENV_KEYS)[number];
type TestChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};
type CapturedGenerateCall = {
  messages: TestChatMessage[];
  disableMemory?: boolean;
  modelId?: string;
  maxSteps?: number;
  memory?: {
    resource: string;
    thread: { id: string };
  };
};
type TestStreamChunk = Record<string, unknown>;

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

async function* streamChunks(chunks: readonly TestStreamChunk[]): AsyncGenerator<TestStreamChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

function chatRequest(
  messages: readonly TestChatMessage[],
  {
    context = {},
    metadata = {},
    mode = 'memory',
    source = 'message',
  }: {
    context?: ChatRequestContext;
    metadata?: Partial<NormalizedChatRequest['metadata']>;
    mode?: NormalizedChatRequest['mode'];
    source?: NormalizedChatRequest['metadata']['source'];
  } = {},
): NormalizedChatRequest {
  const normalizedMessages = copyMessages(messages);
  const hasThreadId = Boolean(context.threadId?.trim());

  return {
    mode,
    messages: normalizedMessages,
    context,
    metadata: {
      source,
      originalMessageCount: normalizedMessages.length,
      normalizedMessageCount: normalizedMessages.length,
      usesMemory: mode === 'memory',
      mixedLegacyNormalized: false,
      legacyContextCapped: false,
      localDemoFallbackThread: mode === 'memory' && !hasThreadId,
      hasResourceId: Boolean(context.resourceId?.trim()),
      hasThreadId,
      ...metadata,
    },
  };
}

function memoryChatRequest(
  messages: readonly TestChatMessage[],
  context: ChatRequestContext = {},
  metadata: Partial<NormalizedChatRequest['metadata']> = {},
): NormalizedChatRequest {
  return chatRequest(messages, { context, metadata, mode: 'memory' });
}

function statelessChatRequest(
  messages: readonly TestChatMessage[],
  metadata: Partial<NormalizedChatRequest['metadata']> = {},
): NormalizedChatRequest {
  return chatRequest(messages, {
    metadata: { source: 'messages', usesMemory: false, localDemoFallbackThread: false, ...metadata },
    mode: 'stateless',
    source: 'messages',
  });
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

test('ChatService routes monthly review intent to the monthly workflow', async () => {
  const restoreEnv = useTestAiEnv();
  const restoreLoggerLog = silenceInfoLogs();
  const messages = userConversation('Haceme un resumen financiero de mayo 2026');

  try {
    let monthlyCalls = 0;
    const service = new ChatService(
      {
        generate: async () => {
          throw new Error('agent should not be called for monthly review intent');
        },
      },
      {
        runMonthlyReview: async (input) => {
          monthlyCalls += 1;
          assert.equal(input.message, 'Haceme un resumen financiero de mayo 2026');

          return {
            answer: 'Resumen mensual por workflow.',
            activityLabels: [
              'Detectando período',
              'Calculando KPIs',
              'Comparando contra el período anterior',
              'Buscando insights',
              'Armando respuesta',
            ],
          };
        },
        runGreetingSnapshot: async () => {
          throw new Error('greeting workflow should not be called');
        },
      },
    );

    const response = await service.answerWithSteps(memoryChatRequest(messages));

    assert.equal(response.answer, 'Resumen mensual por workflow.');
    assert.equal(monthlyCalls, 1);
    assert.deepEqual(
      response.steps?.map((event) => event.label),
      [
        'Analizando consulta',
        'Detectando período',
        'Calculando KPIs',
        'Comparando contra el período anterior',
        'Buscando insights',
        'Armando respuesta',
        'Respuesta final generada',
      ],
    );
  } finally {
    restoreLoggerLog();
    restoreEnv();
  }
});

test('ChatService routes simple greeting intent to the greeting workflow', async () => {
  const restoreEnv = useTestAiEnv();
  const restoreLoggerLog = silenceInfoLogs();

  try {
    let greetingCalls = 0;
    const service = new ChatService(
      {
        generate: async () => {
          throw new Error('agent should not be called for plain greetings');
        },
      },
      {
        runMonthlyReview: async () => {
          throw new Error('monthly workflow should not be called');
        },
        runGreetingSnapshot: async (input) => {
          greetingCalls += 1;
          assert.equal(input.message, 'Hola');

          return {
            answer: 'Hola Franco 👋\nMayo viene arriba de abril comparable.',
            activityLabels: ['Detectando contexto', 'Armando respuesta'],
          };
        },
      },
    );

    assert.equal(
      await service.answer(memoryChatRequest(userConversation('Hola'))),
      'Hola Franco 👋\nMayo viene arriba de abril comparable.',
    );
    assert.equal(greetingCalls, 1);
  } finally {
    restoreLoggerLog();
    restoreEnv();
  }
});

test('ChatService keeps normal finance questions on the existing agent route', async () => {
  const restoreEnv = useTestAiEnv();
  const restoreLoggerLog = silenceInfoLogs();

  try {
    let agentCalls = 0;
    const service = new ChatService(
      {
        generate: async (receivedMessages) => {
          agentCalls += 1;
          assert.deepEqual(receivedMessages, userConversation('Cuánto gasté en supermercado en mayo?'));

          return { text: 'Gastaste ARS 38.500 en supermercado.' };
        },
      },
      {
        runMonthlyReview: async () => {
          throw new Error('monthly workflow should not be called for normal finance questions');
        },
        runGreetingSnapshot: async () => {
          throw new Error('greeting workflow should not be called for normal finance questions');
        },
      },
    );

    assert.equal(
      await service.answer(memoryChatRequest(userConversation('Cuánto gasté en supermercado en mayo?'))),
      'Gastaste ARS 38.500 en supermercado.',
    );
    assert.equal(agentCalls, 1);
  } finally {
    restoreLoggerLog();
    restoreEnv();
  }
});

test('ChatService does not route greeting workflow when the message contains a real finance question', async () => {
  const restoreEnv = useTestAiEnv();
  const restoreLoggerLog = silenceInfoLogs();

  try {
    let agentCalls = 0;
    const service = new ChatService(
      {
        generate: async () => {
          agentCalls += 1;

          return { text: 'Comparación hecha por el agente.' };
        },
      },
      {
        runMonthlyReview: async () => {
          throw new Error('monthly workflow should not be called');
        },
        runGreetingSnapshot: async () => {
          throw new Error('greeting workflow should not be called when there is a finance question');
        },
      },
    );

    assert.equal(
      await service.answer(memoryChatRequest(userConversation('Hola, comparame abril contra mayo'))),
      'Comparación hecha por el agente.',
    );
    assert.equal(agentCalls, 1);
  } finally {
    restoreLoggerLog();
    restoreEnv();
  }
});

test('ChatService streams workflow activity as valid chat events', async () => {
  const restoreEnv = useTestAiEnv();
  const restoreLoggerLog = silenceInfoLogs();

  try {
    const service = new ChatService(
      {
        generate: async () => {
          throw new Error('generate should not be called by streamAnswerEvents');
        },
        stream: async () => {
          throw new Error('agent stream should not be called for monthly review workflow');
        },
      },
      {
        runMonthlyReview: async () => ({
          answer: 'Resumen mensual por workflow.',
          activityLabels: [
            'Detectando período',
            'Calculando KPIs',
            'Comparando contra el período anterior',
            'Buscando insights',
            'Armando respuesta',
          ],
        }),
        runGreetingSnapshot: async () => {
          throw new Error('greeting workflow should not be called');
        },
      },
    );
    const events = [];

    for await (const event of service.streamAnswerEvents(
      memoryChatRequest(userConversation('Resumen de mayo 2026')),
    )) {
      events.push(event);
    }

    assert.deepEqual(
      events.map((event) => event.type),
      ['status', 'status', 'status', 'status', 'status', 'status', 'final_answer'],
    );
    assert.deepEqual(
      events.map((event) => event.label),
      [
        'Analizando consulta',
        'Detectando período',
        'Calculando KPIs',
        'Comparando contra el período anterior',
        'Buscando insights',
        'Armando respuesta',
        'Respuesta final generada',
      ],
    );
    assert.equal(events.at(-1)?.answer, 'Resumen mensual por workflow.');
  } finally {
    restoreLoggerLog();
    restoreEnv();
  }
});

test('ChatService includes workflow fallback activity labels in step metadata', async () => {
  const restoreEnv = useTestAiEnv();
  const restoreLoggerLog = silenceInfoLogs();

  try {
    const service = new ChatService(
      {
        generate: async () => {
          throw new Error('agent should not be called');
        },
      },
      {
        runMonthlyReview: async () => ({
          answer: 'Resumen mensual por workflow.',
          activityLabels: ['Detectando período', 'Armando respuesta', 'Reintentando con otro modelo'],
        }),
        runGreetingSnapshot: async () => {
          throw new Error('greeting workflow should not be called');
        },
      },
    );

    const response = await service.answerWithSteps(memoryChatRequest(userConversation('Resumen de mayo 2026')));

    assert.deepEqual(
      response.steps?.map((event) => event.label),
      [
        'Analizando consulta',
        'Detectando período',
        'Armando respuesta',
        'Reintentando con otro modelo',
        'Respuesta final generada',
      ],
    );
  } finally {
    restoreLoggerLog();
    restoreEnv();
  }
});

test('ChatService maps workflow model exhaustion to the same public quota error', async () => {
  const restoreEnv = useTestAiEnv();
  const restoreLoggerLog = silenceInfoLogs();

  try {
    const service = new ChatService(
      {
        generate: async () => {
          throw new Error('agent should not be called');
        },
      },
      {
        runMonthlyReview: async () => {
          throw new GastiModelFallbackExhaustedError(
            ['gemini-primary', 'gemini-secondary'],
            [new Error('quota1'), new Error('quota2')],
            new Error('quota2'),
          );
        },
        runGreetingSnapshot: async () => {
          throw new Error('greeting workflow should not be called');
        },
      },
    );

    await assert.rejects(
      () => service.answerWithSteps(memoryChatRequest(userConversation('Resumen financiero de mayo 2026'))),
      assertProviderQuotaException,
    );
  } finally {
    restoreLoggerLog();
    restoreEnv();
  }
});

test('ChatService invokes the finance agent with full history in stateless legacy mode', async () => {
  const restoreEnv = useTestAiEnv();
  const restoreLoggerLog = silenceInfoLogs();
  const messages = comparisonFollowUpConversation();

  try {
    const service = new ChatService({
      generate: async (receivedMessages, options) => {
        assert.deepEqual(receivedMessages, messages);
        assert.equal(options?.maxSteps, 5);
        assert.equal(options?.modelId, 'gemini-2.5-flash');
        assert.equal(options?.memory, undefined);
        assert.equal(options?.disableMemory, true);

        return { text: 'Salud fue la categoria que mas aumento.' };
      },
    });

    assert.equal(await service.answer(statelessChatRequest(messages)), 'Salud fue la categoria que mas aumento.');
  } finally {
    restoreEnv();
    restoreLoggerLog();
  }
});

test('ChatService passes resourceId and threadId as Mastra memory context', async () => {
  const restoreEnv = useTestAiEnv();
  const restoreLoggerLog = silenceInfoLogs();
  const messages = userConversation('Qué veníamos hablando?');

  try {
    const service = new ChatService({
      generate: async (receivedMessages, options) => {
        assert.deepEqual(receivedMessages, messages);
        assert.equal(options?.maxSteps, 5);
        assert.equal(options?.modelId, 'gemini-2.5-flash');
        assert.deepEqual(options?.memory, {
          resource: 'demo-user',
          thread: { id: 'thread-mayo' },
        });

        return { text: 'Venías evaluando tus gastos de mayo.' };
      },
    });

    assert.equal(
      await service.answer(memoryChatRequest(messages, { resourceId: 'demo-user', threadId: 'thread-mayo' })),
      'Venías evaluando tus gastos de mayo.',
    );
  } finally {
    restoreEnv();
    restoreLoggerLog();
  }
});

test('ChatService uses the local demo fallback memory thread when no threadId is provided', async () => {
  const restoreEnv = useTestAiEnv();
  const restoreLoggerLog = silenceInfoLogs();

  try {
    const service = new ChatService({
      generate: async (_receivedMessages, options) => {
        assert.deepEqual(options?.memory, {
          resource: 'demo-user',
          thread: { id: 'demo-thread' },
        });

        return { text: 'Respuesta con thread demo.' };
      },
    });

    assert.equal(
      await service.answer(memoryChatRequest(userConversation('Qué veníamos hablando?'))),
      'Respuesta con thread demo.',
    );
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
          disableMemory: options?.disableMemory,
          memory: options?.memory,
        });

        if (options?.modelId === 'gemini-primary') {
          throw quotaError;
        }

        return { text: 'Respuesta desde fallback.' };
      },
    });

    assert.equal(
      await service.answer(memoryChatRequest(messages, { resourceId: 'demo-user', threadId: 'fallback-thread' })),
      'Respuesta desde fallback.',
    );
    assert.deepEqual(
      calls.map((call) => call.modelId),
      ['gemini-primary', 'gemini-secondary'],
    );
    assert.deepEqual(calls.map((call) => call.maxSteps), [5, 5]);
    assert.deepEqual(calls.map((call) => call.disableMemory), [undefined, undefined]);
    assert.deepEqual(calls.map((call) => call.messages), [messages, messages]);
    assert.deepEqual(
      calls.map((call) => call.memory),
      [
        { resource: 'demo-user', thread: { id: 'fallback-thread' } },
        { resource: 'demo-user', thread: { id: 'fallback-thread' } },
      ],
    );
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

test('ChatService preserves stateless mode across provider fallback', async () => {
  const restoreEnv = useTestAiEnv({
    GASTI_AI_MODEL_FALLBACK_CHAIN: 'gemini-primary,gemini-secondary',
  });
  const restoreLoggerLog = silenceInfoLogs();
  const originalLoggerWarn = Logger.prototype.warn;
  Logger.prototype.warn = function () {};
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
          disableMemory: options?.disableMemory,
          memory: options?.memory,
        });

        if (options?.modelId === 'gemini-primary') {
          throw quotaError;
        }

        return { text: 'Respuesta stateless desde fallback.' };
      },
    });

    assert.equal(await service.answer(statelessChatRequest(messages)), 'Respuesta stateless desde fallback.');
    assert.deepEqual(
      calls.map((call) => call.modelId),
      ['gemini-primary', 'gemini-secondary'],
    );
    assert.deepEqual(calls.map((call) => call.messages), [messages, messages]);
    assert.deepEqual(calls.map((call) => call.memory), [undefined, undefined]);
    assert.deepEqual(calls.map((call) => call.disableMemory), [true, true]);
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

    await assert.rejects(
      () => service.answer(memoryChatRequest(userConversation('Cuanto gaste?'))),
      assertProviderQuotaException,
    );
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

    await assert.rejects(
      () => service.answer(memoryChatRequest(userConversation('Cuanto gaste?'))),
      assertProviderQuotaException,
    );
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

    await assert.rejects(() => service.answer(memoryChatRequest(userConversation('Cuanto gaste?'))), {
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

    await assert.rejects(() => service.answer(memoryChatRequest(userConversation('Cuanto gaste?'))), {
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

    await assert.rejects(() => service.answer(memoryChatRequest(userConversation('Cuanto gaste?'))), {
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

test('ChatService logs successful generation metadata without raw messages or tool results', async () => {
  const restoreEnv = useTestAiEnv({ GASTI_AI_MODEL: 'gemini-fixed' });
  const originalLoggerLog = Logger.prototype.log;
  const loggedInfo: unknown[][] = [];
  Logger.prototype.log = function (...args: unknown[]) {
    loggedInfo.push(args);
  };

  try {
    const service = new ChatService({
      generate: async () => ({
        text: 'Respuesta con datos.',
        finishReason: 'stop',
        toolCalls: [
          {
            toolName: 'findTransactionsTool',
            args: { merchant: 'Rappi' },
          },
        ],
        toolResults: [
          {
            result: {
              transactions: [{ id: 'txn_001', merchant: 'Rappi' }],
            },
          },
        ],
        steps: [
          {
            text: '',
            finishReason: 'tool-calls',
            toolCalls: [{ toolName: 'findTransactionsTool' }],
          },
          {
            text: 'Respuesta con datos.',
            finishReason: 'stop',
            toolCalls: [],
          },
        ],
      }),
    });

    assert.equal(
      await service.answer(memoryChatRequest(userConversation('Cuanto gaste en Rappi?'))),
      'Respuesta con datos.',
    );

    const successLog = loggedInfo
      .map(([payload]) => payload as { event?: string; [key: string]: unknown })
      .find((payload) => payload.event === 'chat.model_attempt_succeeded');

    assert.ok(successLog);
    assert.equal(successLog.modelId, 'gemini-fixed');
    assert.equal(successLog.textLength, 'Respuesta con datos.'.length);
    assert.equal(successLog.finishReason, 'stop');
    assert.equal(successLog.stepCount, 2);
    assert.equal(successLog.toolCallCount, 1);
    assert.equal(successLog.messageCount, 1);

    const serializedLogs = JSON.stringify(loggedInfo);
    assert.equal(serializedLogs.includes('Cuanto gaste en Rappi?'), false);
    assert.equal(serializedLogs.includes('txn_001'), false);
    assert.equal(serializedLogs.includes('"merchant":"Rappi"'), false);
  } finally {
    Logger.prototype.log = originalLoggerLog;
    restoreEnv();
  }
});

test('ChatService streams safe Spanish activity events without leaking raw stream payloads', async () => {
  const restoreEnv = useTestAiEnv({ GASTI_AI_MODEL: 'gemini-fixed' });
  const restoreLoggerLog = silenceInfoLogs();
  const secret = process.env.GEMINI_API_KEY ?? '';

  try {
    const service = new ChatService({
      generate: async () => {
        throw new Error('generate should not be called by streamAnswerEvents');
      },
      stream: async () => ({
        fullStream: streamChunks([
          {
            type: 'tool-call-streaming-start',
            toolCallId: 'call_1',
            toolName: 'findTransactionsTool',
          },
          {
            type: 'tool-call-delta',
            toolCallId: 'call_1',
            toolName: 'findTransactionsTool',
            argsTextDelta: '{"merchant":"Rappi"}',
          },
          {
            type: 'tool-call',
            toolCallId: 'call_1',
            toolName: 'findTransactionsTool',
            args: { merchant: 'Rappi', secret },
          },
          {
            type: 'tool-result',
            toolCallId: 'call_1',
            toolName: 'findTransactionsTool',
            result: { transactions: [{ id: 'txn_001', merchant: 'Rappi', secret }] },
          },
          { type: 'reasoning', textDelta: 'private reasoning' },
          { type: 'reasoning-signature', signature: 'signed-private-reasoning' },
          { type: 'redacted-reasoning', data: 'redacted-private-reasoning' },
          { type: 'source', source: { url: 'https://example.test/private-source' } },
          { type: 'file', mimeType: 'text/plain', base64: 'private-file', uint8Array: new Uint8Array() },
          {
            type: 'step-finish',
            providerMetadata: { privateProviderData: secret },
            usage: { promptTokens: 1, completionTokens: 1 },
          },
          { type: 'text-delta', textDelta: 'Respuesta ' },
          { type: 'text-delta', textDelta: 'lista.' },
          { type: 'finish', finishReason: 'stop', providerMetadata: { privateProviderData: secret } },
        ]),
      }),
    } as never);

    const events = [];

    for await (const event of service.streamAnswerEvents(memoryChatRequest(userConversation('Mostrame gastos en Rappi')))) {
      events.push(event);
    }

    assert.deepEqual(
      events.map((event) => event.type),
      ['status', 'tool_call', 'tool_result', 'status', 'final_answer'],
    );
    assert.deepEqual(
      events.map((event) => event.label),
      [
        'Analizando consulta',
        'Consultando herramienta',
        'Herramienta completada',
        'Generando respuesta final',
        'Respuesta final generada',
      ],
    );
    assert.equal(events[1].toolName, 'findTransactionsTool');
    assert.equal(events[2].toolName, 'findTransactionsTool');
    assert.equal(events.at(-1)?.answer, 'Respuesta lista.');

    const serializedEvents = JSON.stringify(events);
    assert.equal(serializedEvents.includes('Rappi'), false);
    assert.equal(serializedEvents.includes('txn_001'), false);
    assert.equal(serializedEvents.includes('private reasoning'), false);
    assert.equal(serializedEvents.includes('signed-private-reasoning'), false);
    assert.equal(serializedEvents.includes('redacted-private-reasoning'), false);
    assert.equal(serializedEvents.includes('private-source'), false);
    assert.equal(serializedEvents.includes('private-file'), false);
    assert.equal(serializedEvents.includes('privateProviderData'), false);
    assert.equal(serializedEvents.includes(secret), false);
  } finally {
    restoreLoggerLog();
    restoreEnv();
  }
});

test('ChatService emits a Spanish warning before retrying invalid tool arguments in streaming mode', async () => {
  const restoreEnv = useTestAiEnv({ GASTI_AI_MODEL: 'gemini-fixed' });
  const restoreLoggerLog = silenceInfoLogs();

  try {
    let calls = 0;
    const invalidToolError = new Error('Invalid arguments for tool spendingSummaryTool');
    invalidToolError.name = 'AI_InvalidToolArgumentsError';
    const service = new ChatService({
      generate: async () => {
        throw new Error('generate should not be called by streamAnswerEvents');
      },
      stream: async () => {
        calls += 1;

        if (calls === 1) {
          throw invalidToolError;
        }

        return {
          fullStream: streamChunks([{ type: 'text-delta', textDelta: 'Respuesta recuperada.' }]),
        };
      },
    } as never);

    const events = [];

    for await (const event of service.streamAnswerEvents(memoryChatRequest(userConversation('Cuanto gaste?')))) {
      events.push(event);
    }

    assert.equal(calls, 2);
    assert.ok(
      events.some(
        (event) => event.type === 'warning' && event.label === 'Reintentando por argumentos inválidos',
      ),
    );
    assert.equal(events.at(-1)?.type, 'final_answer');
    assert.equal(events.at(-1)?.answer, 'Respuesta recuperada.');
  } finally {
    restoreLoggerLog();
    restoreEnv();
  }
});

test('ChatService falls back after an empty agent answer and logs safe metadata', async () => {
  const restoreEnv = useTestAiEnv({
    GASTI_AI_MODEL_FALLBACK_CHAIN: 'gemini-empty,gemini-success',
  });
  const restoreLoggerLog = silenceInfoLogs();
  const originalLoggerWarn = Logger.prototype.warn;
  const loggedWarnings: unknown[][] = [];
  Logger.prototype.warn = function (...args: unknown[]) {
    loggedWarnings.push(args);
  };

  try {
    const calls: CapturedGenerateCall[] = [];
    const service = new ChatService({
      generate: async (receivedMessages, options) => {
        calls.push({
          messages: copyMessages(receivedMessages),
          modelId: options?.modelId,
          maxSteps: options?.maxSteps,
        });

        if (options?.modelId === 'gemini-empty') {
          return {
            text: '   ',
            finishReason: 'stop',
            steps: [
              {
                finishReason: 'tool-calls',
                toolCalls: [{ toolName: 'spendingSummaryTool' }, { toolName: 'getFinanceContext' }],
              },
            ],
          };
        }

        return { text: 'Respuesta recuperada.' };
      },
    });

    assert.equal(await service.answer(memoryChatRequest(userConversation('Cuanto gaste?'))), 'Respuesta recuperada.');
    assert.deepEqual(
      calls.map((call) => call.modelId),
      ['gemini-empty', 'gemini-success'],
    );

    const warningPayloads = loggedWarnings.map(([payload]) => payload as { event?: string; [key: string]: unknown });
    const emptyLog = warningPayloads.find((payload) => payload.event === 'chat.model_attempt_empty');

    assert.ok(emptyLog);
    assert.equal(emptyLog.modelId, 'gemini-empty');
    assert.equal(emptyLog.textLength, 3);
    assert.equal(emptyLog.finishReason, 'stop');
    assert.equal(emptyLog.stepCount, 1);
    assert.equal(emptyLog.toolCallCount, 2);
    assert.ok(warningPayloads.some((payload) => payload.event === 'chat.model_fallback_retrying'));
  } finally {
    Logger.prototype.warn = originalLoggerWarn;
    restoreLoggerLog();
    restoreEnv();
  }
});

test('ChatService returns a clean public error after the final model repeats empty answers', async () => {
  const restoreEnv = useTestAiEnv({ GASTI_AI_MODEL: 'gemini-empty' });
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

        return {
          text: '',
          finishReason: 'stop',
          toolCalls: [],
          steps: [{ finishReason: 'stop', toolCalls: [] }],
        };
      },
    });

    await assert.rejects(
      () => service.answer(memoryChatRequest(userConversation('Cuanto gaste?'))),
      (error: unknown): boolean => {
        assert.ok(error instanceof HttpException);
        assert.equal(error.getStatus(), HttpStatus.BAD_GATEWAY);
        const response = error.getResponse();

        if (typeof response === 'string') {
          assert.equal(response, EMPTY_ANSWER_MESSAGE);
        } else {
          assert.equal((response as { message: string }).message, EMPTY_ANSWER_MESSAGE);
        }

        return true;
      },
    );

    assert.deepEqual(calls, ['gemini-empty', 'gemini-empty']);
    assert.equal(
      loggedWarnings.filter(([payload]) => (payload as { event?: string }).event === 'chat.model_attempt_empty')
        .length,
      2,
    );
    assert.ok(loggedErrors.some(([payload]) => (payload as { event?: string }).event === 'chat.empty_answer_exhausted'));
  } finally {
    Logger.prototype.warn = originalLoggerWarn;
    Logger.prototype.error = originalLoggerError;
    restoreLoggerLog();
    restoreEnv();
  }
});

test('ChatService retries invalid tool argument failures once with memory context preserved', async () => {
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
        calls.push({
          messages: copyMessages(receivedMessages),
          maxSteps: options?.maxSteps,
          disableMemory: options?.disableMemory,
          memory: options?.memory,
        });

        if (calls.length === 1) {
          throw invalidToolError;
        }

        return { text: 'Salud fue la categoria que mas aumento.' };
      },
    });

    assert.equal(
      await service.answer(memoryChatRequest(messages, { resourceId: 'demo-user', threadId: 'retry-thread' })),
      'Salud fue la categoria que mas aumento.',
    );

    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map((call) => call.maxSteps), [5, 5]);
    assert.deepEqual(calls.map((call) => call.disableMemory), [undefined, undefined]);
    assert.deepEqual(
      calls.map((call) => call.memory),
      [
        { resource: 'demo-user', thread: { id: 'retry-thread' } },
        { resource: 'demo-user', thread: { id: 'retry-thread' } },
      ],
    );
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
    assert.match(retryMessage?.content ?? '', /same language the user used/i);
    assert.match(retryMessage?.content ?? '', /Gasti formatting contract/i);
    assert.match(retryMessage?.content ?? '', /concise, structured Markdown/i);
    assert.match(retryMessage?.content ?? '', /real Markdown bullets using "- "/i);
    assert.match(retryMessage?.content ?? '', /blank lines between sections/i);
    assert.match(retryMessage?.content ?? '', /one specific follow-up/i);

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

test('ChatService retries invalid tool argument failures in stateless mode without memory', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';

  const restoreLoggerLog = silenceInfoLogs();
  const originalLoggerWarn = Logger.prototype.warn;
  const originalLoggerError = Logger.prototype.error;
  Logger.prototype.warn = function () {};
  Logger.prototype.error = function () {};
  const messages = comparisonFollowUpConversation();

  try {
    const calls: CapturedGenerateCall[] = [];
    const invalidToolError = new Error('Invalid arguments for tool spendingSummaryTool');
    invalidToolError.name = 'AI_InvalidToolArgumentsError';

    const service = new ChatService({
      generate: async (receivedMessages, options) => {
        calls.push({
          messages: copyMessages(receivedMessages),
          maxSteps: options?.maxSteps,
          disableMemory: options?.disableMemory,
          memory: options?.memory,
        });

        if (calls.length === 1) {
          throw invalidToolError;
        }

        return { text: 'Salud fue la categoria que mas aumento.' };
      },
    });

    assert.equal(await service.answer(statelessChatRequest(messages)), 'Salud fue la categoria que mas aumento.');

    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map((call) => call.memory), [undefined, undefined]);
    assert.deepEqual(calls.map((call) => call.disableMemory), [true, true]);
    assert.deepEqual(calls[0].messages, messages);
    assert.deepEqual(calls[1].messages.slice(0, -1), messages);
    assert.match(calls[1].messages.at(-1)?.content ?? '', /exact tool input schema/);
    assert.match(calls[1].messages.at(-1)?.content ?? '', /same language the user used/i);
    assert.match(calls[1].messages.at(-1)?.content ?? '', /Gasti formatting contract/i);
    assert.match(calls[1].messages.at(-1)?.content ?? '', /concise, structured Markdown/i);
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

    await assert.rejects(() => service.answer(memoryChatRequest(userConversation('Cuanto gaste?'))), {
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

    await assert.rejects(() => service.answer(memoryChatRequest(userConversation('Cuanto gaste?'))), {
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

    await assert.rejects(
      () => service.answer(memoryChatRequest(userConversation('Cuanto gaste?'))),
      assertProviderQuotaException,
    );

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

    await assert.rejects(
      () => service.answer(memoryChatRequest(userConversation('Cuanto gaste?'))),
      assertProviderQuotaException,
    );

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

    await assert.rejects(
      () => service.answer(memoryChatRequest(userConversation('Cuanto gaste?'))),
      assertProviderQuotaException,
    );

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

    await assert.rejects(() => service.answer(memoryChatRequest(userConversation('Cuanto gaste?'))), {
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
