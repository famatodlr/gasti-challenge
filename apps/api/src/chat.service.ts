import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DEMO_RESOURCE_ID,
  LOCAL_DEMO_DEFAULT_THREAD_ID,
  generateGastiFinanceAgent,
  getGastiModelFallbackChain,
} from 'ai/mastra';

import type { ChatMessage, ChatRequestContext } from './chat.types.js';

type AgentMemoryContext = {
  resource: string;
  thread: { id: string };
};

type AgentGenerateOptions = {
  maxSteps?: number;
  memory?: AgentMemoryContext;
  modelId?: string;
};

type AgentGenerateResult = {
  text: string;
  finishReason?: unknown;
  steps?: unknown;
  toolCalls?: unknown;
  toolResults?: unknown;
};

export type FinanceAgent = {
  generate: (messages: ChatMessage[], options?: AgentGenerateOptions) => Promise<AgentGenerateResult>;
};

export const GASTI_FINANCE_AGENT = Symbol('GASTI_FINANCE_AGENT');

export const defaultFinanceAgent: FinanceAgent = {
  generate: (messages, options) => generateGastiFinanceAgent(messages, options),
};

type SerializedAgentError = {
  name?: string;
  message?: string;
  stack?: string;
  cause?: SerializedAgentError | string;
};

const MAX_CAUSE_DEPTH = 2;
const REDACTED_SECRET = '[REDACTED]';
const PROVIDER_QUOTA_EXCEEDED_MESSAGE = 'The AI provider quota was exceeded. Please try again later.';
const EMPTY_AGENT_ANSWER_MESSAGE = 'The AI provider returned an empty answer. Please try again.';
const INVALID_TOOL_ARGUMENT_NAME_SIGNALS = ['AI_InvalidToolArgumentsError', 'AI_TypeValidationError'];
const INVALID_TOOL_ARGUMENT_MESSAGE_SIGNALS = ['Invalid arguments for tool', 'Type validation failed'];
const PROVIDER_QUOTA_MESSAGE_SIGNALS = [
  'exceeded your current quota',
  'Quota exceeded',
  'rate limit',
  'rate-limit',
  'RESOURCE_EXHAUSTED',
];

type SerializeAgentErrorOptions = {
  includeStack?: boolean;
  maxCauseDepth?: number;
};

type AgentGenerationMetadata = {
  modelId: string;
  textLength: number;
  finishReason?: string;
  stepCount?: number;
  toolCallCount?: number;
  messageCount: number;
  lastMessageLength: number;
  totalContentLength: number;
};

function normalizeMemoryIdentifier(value: string | undefined, fallback: string): string {
  const trimmedValue = value?.trim();
  return trimmedValue || fallback;
}

function createAgentMemoryContext(context: ChatRequestContext = {}): AgentMemoryContext {
  return {
    resource: normalizeMemoryIdentifier(context.resourceId, DEMO_RESOURCE_ID),
    thread: { id: normalizeMemoryIdentifier(context.threadId, LOCAL_DEMO_DEFAULT_THREAD_ID) },
  };
}

class GastiModelFallbackExhaustedError extends Error {
  constructor(
    readonly models: readonly string[],
    readonly errors: readonly unknown[],
    cause: unknown,
  ) {
    super(`All Gemini fallback models were exhausted: ${models.join(', ')}`, { cause });
    this.name = 'GastiModelFallbackExhaustedError';
  }
}

class EmptyAgentAnswerError extends Error {
  constructor(readonly metadata: AgentGenerationMetadata) {
    super('Agent returned an empty answer.');
    this.name = 'EmptyAgentAnswerError';
  }
}

class GastiEmptyAnswerExhaustedError extends Error {
  constructor(
    readonly models: readonly string[],
    readonly errors: readonly EmptyAgentAnswerError[],
    cause: unknown,
  ) {
    super(`All Gemini fallback models returned empty answers: ${models.join(', ')}`, { cause });
    this.name = 'GastiEmptyAnswerExhaustedError';
  }
}

function redactSecrets(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }

  let redacted = value;
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();

  if (geminiApiKey) {
    redacted = redacted.split(geminiApiKey).join(REDACTED_SECRET);
  }

  redacted = redacted.replace(/\bAIza[0-9A-Za-z_-]{10,}\b/g, REDACTED_SECRET);
  redacted = redacted.replace(/\bsk-[0-9A-Za-z_-]{10,}\b/g, REDACTED_SECRET);

  return redacted;
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  try {
    return JSON.stringify(value, (_key, nestedValue) => {
      if (typeof nestedValue !== 'object' || nestedValue === null) {
        return nestedValue;
      }

      if (seen.has(nestedValue)) {
        return '[Circular]';
      }

      seen.add(nestedValue);
      return nestedValue;
    });
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStringProperty(value: object, key: 'name' | 'message' | 'stack'): string | undefined {
  const property = (value as Record<string, unknown>)[key];
  return typeof property === 'string' ? redactSecrets(property) : undefined;
}

function readCause(value: object): unknown {
  return (value as { cause?: unknown }).cause;
}

function serializeAgentError(
  error: unknown,
  depth = 0,
  options: SerializeAgentErrorOptions = {},
): SerializedAgentError | string {
  if (typeof error !== 'object' || error === null) {
    return redactSecrets(String(error)) ?? '';
  }

  const includeStack = options.includeStack ?? true;
  const maxCauseDepth = options.maxCauseDepth ?? MAX_CAUSE_DEPTH;
  const serialized: SerializedAgentError = {
    name: readStringProperty(error, 'name'),
    message: readStringProperty(error, 'message'),
    stack: includeStack ? readStringProperty(error, 'stack') : undefined,
  };

  const cause = readCause(error);

  if (cause !== undefined) {
    serialized.cause =
      depth >= maxCauseDepth ? '[Cause depth limit reached]' : serializeAgentError(cause, depth + 1, options);
  }

  if (!serialized.name && !serialized.message && !serialized.stack && !serialized.cause) {
    serialized.message = redactSecrets(safeStringify(error));
  }

  return serialized;
}

function matchesAnySignal(value: string | undefined, signals: readonly string[]): boolean {
  return Boolean(value && signals.some((signal) => value.includes(signal)));
}

function matchesAnySignalCaseInsensitive(value: string | undefined, signals: readonly string[]): boolean {
  if (!value) {
    return false;
  }

  const normalizedValue = value.toLocaleLowerCase();
  return signals.some((signal) => normalizedValue.includes(signal.toLocaleLowerCase()));
}

function isInvalidToolArgumentsError(error: unknown, depth = 0): boolean {
  if (typeof error !== 'object' || error === null) {
    return matchesAnySignal(String(error), INVALID_TOOL_ARGUMENT_MESSAGE_SIGNALS);
  }

  const name = (error as { name?: unknown }).name;
  const message = (error as { message?: unknown }).message;

  if (
    matchesAnySignal(typeof name === 'string' ? name : undefined, INVALID_TOOL_ARGUMENT_NAME_SIGNALS) ||
    matchesAnySignal(typeof message === 'string' ? message : undefined, INVALID_TOOL_ARGUMENT_MESSAGE_SIGNALS)
  ) {
    return true;
  }

  const cause = readCause(error);

  if (cause === undefined || depth >= MAX_CAUSE_DEPTH) {
    return false;
  }

  return isInvalidToolArgumentsError(cause, depth + 1);
}

function isTooManyRequestsStatus(value: unknown): boolean {
  return value === HttpStatus.TOO_MANY_REQUESTS || value === String(HttpStatus.TOO_MANY_REQUESTS);
}

function objectHasTooManyRequestsStatus(value: object): boolean {
  const record = value as Record<string, unknown>;
  const response = record.response;

  if (isTooManyRequestsStatus(record.status) || isTooManyRequestsStatus(record.statusCode)) {
    return true;
  }

  if (typeof response === 'object' && response !== null) {
    const responseRecord = response as Record<string, unknown>;
    return isTooManyRequestsStatus(responseRecord.status) || isTooManyRequestsStatus(responseRecord.statusCode);
  }

  return false;
}

function objectHasProviderQuotaCode(value: object): boolean {
  const record = value as Record<string, unknown>;
  const code = record.code;
  const status = record.status;

  if (isTooManyRequestsStatus(code)) {
    return true;
  }

  if (typeof code === 'string' && code.toLocaleUpperCase() === 'RESOURCE_EXHAUSTED') {
    return true;
  }

  return typeof status === 'string' && status.toLocaleUpperCase() === 'RESOURCE_EXHAUSTED';
}

function objectHasGeminiQuotaErrorData(value: object): boolean {
  const data = (value as Record<string, unknown>).data;

  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const error = (data as Record<string, unknown>).error;

  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const errorRecord = error as Record<string, unknown>;
  const code = errorRecord.code;
  const status = errorRecord.status;
  const message = errorRecord.message;

  return (
    isTooManyRequestsStatus(code) ||
    (typeof status === 'string' && status.toLocaleUpperCase() === 'RESOURCE_EXHAUSTED') ||
    matchesAnySignalCaseInsensitive(typeof message === 'string' ? message : undefined, PROVIDER_QUOTA_MESSAGE_SIGNALS)
  );
}

function objectHasQuotaResponseBody(value: object): boolean {
  const responseBody = (value as Record<string, unknown>).responseBody;

  return matchesAnySignalCaseInsensitive(
    typeof responseBody === 'string' ? responseBody : undefined,
    PROVIDER_QUOTA_MESSAGE_SIGNALS,
  );
}

function isProviderQuotaError(error: unknown, depth = 0): boolean {
  if (typeof error !== 'object' || error === null) {
    return matchesAnySignalCaseInsensitive(String(error), PROVIDER_QUOTA_MESSAGE_SIGNALS);
  }

  const name = (error as { name?: unknown }).name;
  const message = (error as { message?: unknown }).message;

  if (
    matchesAnySignalCaseInsensitive(typeof message === 'string' ? message : undefined, PROVIDER_QUOTA_MESSAGE_SIGNALS) ||
    objectHasTooManyRequestsStatus(error) ||
    objectHasProviderQuotaCode(error) ||
    objectHasGeminiQuotaErrorData(error) ||
    objectHasQuotaResponseBody(error)
  ) {
    return true;
  }

  if (depth >= MAX_CAUSE_DEPTH) {
    return false;
  }

  const record = error as Record<string, unknown>;
  const nestedErrors = [readCause(error), record.lastError, ...(Array.isArray(record.errors) ? record.errors : [])];

  return nestedErrors.some((nestedError) => nestedError !== undefined && isProviderQuotaError(nestedError, depth + 1));
}

function isEmptyAgentAnswerError(error: unknown): error is EmptyAgentAnswerError {
  return error instanceof EmptyAgentAnswerError;
}

function totalContentLength(messages: readonly ChatMessage[]): number {
  return messages.reduce((total, message) => total + message.content.length, 0);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getArrayLength(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

function countToolCallsFromSteps(steps: unknown): number | undefined {
  if (!Array.isArray(steps)) {
    return undefined;
  }

  return steps.reduce((total, step) => {
    if (!isRecord(step) || !Array.isArray(step.toolCalls)) {
      return total;
    }

    return total + step.toolCalls.length;
  }, 0);
}

function buildAgentGenerationMetadata(
  result: AgentGenerateResult,
  messages: readonly ChatMessage[],
  modelId: string,
): AgentGenerationMetadata {
  const lastMessage = messages.at(-1);
  const topLevelToolCallCount = getArrayLength(result.toolCalls);

  return {
    modelId,
    textLength: result.text.length,
    finishReason: readOptionalString(result.finishReason),
    stepCount: getArrayLength(result.steps),
    toolCallCount: topLevelToolCallCount ?? countToolCallsFromSteps(result.steps),
    messageCount: messages.length,
    lastMessageLength: lastMessage?.content.length ?? 0,
    totalContentLength: totalContentLength(messages),
  };
}

function createInvalidToolArgumentsRetryMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  return [
    ...messages,
    {
      role: 'user',
      content: `The previous attempt failed because a tool call used invalid arguments.

Retry the latest user request from the conversation above. When calling tools, use the exact tool input schema.
Do not invent, rename, or approximate field names.
For date-bounded tools, use top-level from and to exactly.
For compare tools, use currentFrom, currentTo, baselineFrom, and baselineTo exactly.
Do not use nested dateRange unless the tool schema explicitly requires it.
Do not use fields such as from1, start, end, date_from, or date_to.
Use ISO dates in YYYY-MM-DD format.
After the tool succeeds, return the final user-facing answer in Spanish.`,
    },
  ];
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(@Inject(GASTI_FINANCE_AGENT) private readonly agent: FinanceAgent = defaultFinanceAgent) {}

  async answer(messages: ChatMessage[], context: ChatRequestContext = {}): Promise<string> {
    if (!process.env.GEMINI_API_KEY?.trim()) {
      throw new ServiceUnavailableException('GEMINI_API_KEY is required to use the chat endpoint.');
    }

    const lastMessage = messages.at(-1);
    const memory = createAgentMemoryContext(context);

    this.logger.log({
      event: 'chat.request_received',
      message: 'Chat request received',
      messageCount: messages.length,
      lastMessageLength: lastMessage?.content.length ?? 0,
      totalContentLength: totalContentLength(messages),
      resourceId: memory.resource,
      threadId: memory.thread.id,
      localDemoFallbackThread: !context.threadId?.trim(),
    });

    try {
      return await this.generateAnswerWithModelFallback(messages, 1, memory);
    } catch (error) {
      if (isInvalidToolArgumentsError(error)) {
        this.logger.warn({
          event: 'chat.agent_generation_retrying',
          message: 'Invalid tool arguments detected, retrying once',
          attempt: 1,
          nextAttempt: 2,
          error: serializeAgentError(error),
        });

        try {
          return await this.generateAnswerWithModelFallback(createInvalidToolArgumentsRetryMessages(messages), 2, memory);
        } catch (retryError) {
          if (retryError instanceof GastiModelFallbackExhaustedError || isProviderQuotaError(retryError)) {
            this.throwProviderQuotaExceeded(retryError);
          }

          if (retryError instanceof GastiEmptyAnswerExhaustedError || isEmptyAgentAnswerError(retryError)) {
            this.throwEmptyAgentAnswer(retryError);
          }

          this.logAgentGenerationFailure(retryError);
        }
      } else if (error instanceof GastiModelFallbackExhaustedError || isProviderQuotaError(error)) {
        this.throwProviderQuotaExceeded(error);
      } else if (error instanceof GastiEmptyAnswerExhaustedError || isEmptyAgentAnswerError(error)) {
        this.throwEmptyAgentAnswer(error);
      } else {
        this.logAgentGenerationFailure(error);
      }

      throw new InternalServerErrorException('Failed to generate a chat answer.');
    }
  }

  private async generateAnswerWithModelFallback(
    messages: ChatMessage[],
    attempt: number,
    memory: AgentMemoryContext,
  ): Promise<string> {
    const modelIds = getGastiModelFallbackChain();
    const quotaErrors: unknown[] = [];
    const emptyAnswerErrors: EmptyAgentAnswerError[] = [];

    for (const [modelIndex, modelId] of modelIds.entries()) {
      try {
        return await this.generateAnswer(messages, attempt, modelId, modelIndex, modelIds.length, memory);
      } catch (error) {
        if (isProviderQuotaError(error)) {
          quotaErrors.push(error);
          const nextModelId = modelIds[modelIndex + 1];

          if (nextModelId) {
            this.logger.warn({
              event: 'chat.model_fallback_retrying',
              message: 'Gemini model quota exhausted, retrying with fallback model',
              attempt,
              modelId,
              nextModelId,
              modelIndex: modelIndex + 1,
              modelCount: modelIds.length,
              error: serializeAgentError(error, 0, { includeStack: false, maxCauseDepth: 1 }),
            });

            continue;
          }

          const exhaustedError = new GastiModelFallbackExhaustedError(modelIds, quotaErrors, error);
          this.logger.error({
            event: 'chat.model_fallback_exhausted',
            message: 'All Gemini fallback models failed with quota or rate-limit errors',
            modelIds,
            error: serializeAgentError(exhaustedError, 0, { includeStack: false, maxCauseDepth: 1 }),
          });

          throw exhaustedError;
        }

        if (isEmptyAgentAnswerError(error)) {
          emptyAnswerErrors.push(error);
          const nextModelId = modelIds[modelIndex + 1];

          if (nextModelId) {
            this.logger.warn({
              event: 'chat.model_fallback_retrying',
              message: 'Gemini model returned an empty answer, retrying with fallback model',
              attempt,
              modelId,
              nextModelId,
              modelIndex: modelIndex + 1,
              modelCount: modelIds.length,
              reason: 'empty_answer',
              generation: error.metadata,
            });

            continue;
          }

          this.logger.warn({
            event: 'chat.empty_answer_final_model_retrying',
            message: 'Final Gemini model returned an empty answer, retrying the same model once',
            attempt,
            modelId,
            modelIndex: modelIndex + 1,
            modelCount: modelIds.length,
            generation: error.metadata,
          });

          try {
            return await this.generateAnswer(messages, attempt, modelId, modelIndex, modelIds.length, memory);
          } catch (retryError) {
            if (isEmptyAgentAnswerError(retryError)) {
              emptyAnswerErrors.push(retryError);
              this.throwEmptyAnswerExhausted(modelIds, emptyAnswerErrors, retryError);
            }

            throw retryError;
          }
        }

        throw error;
      }
    }

    throw new GastiModelFallbackExhaustedError(modelIds, quotaErrors, quotaErrors.at(-1));
  }

  private async generateAnswer(
    messages: ChatMessage[],
    attempt: number,
    modelId: string,
    modelIndex: number,
    modelCount: number,
    memory: AgentMemoryContext,
  ): Promise<string> {
    const lastMessage = messages.at(-1);

    this.logger.log({
      event: 'chat.model_attempt_started',
      message: 'Gemini model attempt started',
      attempt,
      modelId,
      modelIndex: modelIndex + 1,
      modelCount,
      messageCount: messages.length,
      lastMessageLength: lastMessage?.content.length ?? 0,
      totalContentLength: totalContentLength(messages),
      resourceId: memory.resource,
      threadId: memory.thread.id,
    });

    const result = await this.agent.generate(messages, { maxSteps: 5, memory, modelId });
    const generation = buildAgentGenerationMetadata(result, messages, modelId);

    if (!result.text.trim()) {
      this.logger.warn({
        event: 'chat.model_attempt_empty',
        message: 'Gemini model attempt returned an empty answer',
        attempt,
        modelIndex: modelIndex + 1,
        modelCount,
        ...generation,
      });

      throw new EmptyAgentAnswerError(generation);
    }

    this.logger.log({
      event: 'chat.model_attempt_succeeded',
      message: 'Gemini model attempt succeeded',
      attempt,
      modelIndex: modelIndex + 1,
      modelCount,
      responseLength: result.text.length,
      ...generation,
    });

    return result.text;
  }

  private throwEmptyAnswerExhausted(
    modelIds: readonly string[],
    emptyAnswerErrors: readonly EmptyAgentAnswerError[],
    cause: unknown,
  ): never {
    const exhaustedError = new GastiEmptyAnswerExhaustedError(modelIds, emptyAnswerErrors, cause);

    this.logger.error({
      event: 'chat.empty_answer_exhausted',
      message: 'All Gemini fallback models returned empty answers',
      modelIds,
      emptyAnswerAttempts: emptyAnswerErrors.map((error) => error.metadata),
      error: serializeAgentError(exhaustedError, 0, { includeStack: false, maxCauseDepth: 1 }),
    });

    throw exhaustedError;
  }

  private logAgentGenerationFailure(error: unknown): void {
    this.logger.error({
      event: 'chat.agent_generation_failed',
      message: 'Agent generation failed',
      error: serializeAgentError(error),
    });
  }

  private throwProviderQuotaExceeded(error: unknown): never {
    this.logger.warn({
      event: 'chat.provider_quota_exceeded',
      message: 'AI provider quota exceeded',
      provider: 'gemini',
      retryable: true,
      error: serializeAgentError(error, 0, { includeStack: false, maxCauseDepth: 1 }),
    });

    throw new HttpException(PROVIDER_QUOTA_EXCEEDED_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
  }

  private throwEmptyAgentAnswer(error: unknown): never {
    this.logger.warn({
      event: 'chat.empty_answer_public_error',
      message: 'AI provider returned an empty answer',
      provider: 'gemini',
      retryable: true,
      error: serializeAgentError(error, 0, { includeStack: false, maxCauseDepth: 1 }),
    });

    throw new BadGatewayException(EMPTY_AGENT_ANSWER_MESSAGE);
  }
}
