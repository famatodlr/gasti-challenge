import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { gastiFinanceAgent } from 'ai/mastra';

type AgentGenerateOptions = {
  maxSteps?: number;
};

type AgentGenerateResult = {
  text: string;
};

export type FinanceAgent = {
  generate: (message: string, options?: AgentGenerateOptions) => Promise<AgentGenerateResult>;
};

export const GASTI_FINANCE_AGENT = Symbol('GASTI_FINANCE_AGENT');

export const defaultFinanceAgent: FinanceAgent = {
  generate: (message, options) => gastiFinanceAgent.generate(message, options),
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
const INVALID_TOOL_ARGUMENT_NAME_SIGNALS = ['AI_InvalidToolArgumentsError', 'AI_TypeValidationError'];
const INVALID_TOOL_ARGUMENT_MESSAGE_SIGNALS = ['Invalid arguments for tool', 'Type validation failed'];
const PROVIDER_QUOTA_NAME_SIGNALS = ['AI_RetryError'];
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
  const code = (value as Record<string, unknown>).code;

  if (isTooManyRequestsStatus(code)) {
    return true;
  }

  return typeof code === 'string' && code.toLocaleUpperCase() === 'RESOURCE_EXHAUSTED';
}

function isProviderQuotaError(error: unknown, depth = 0): boolean {
  if (typeof error !== 'object' || error === null) {
    return matchesAnySignalCaseInsensitive(String(error), PROVIDER_QUOTA_MESSAGE_SIGNALS);
  }

  const name = (error as { name?: unknown }).name;
  const message = (error as { message?: unknown }).message;

  if (
    matchesAnySignal(typeof name === 'string' ? name : undefined, PROVIDER_QUOTA_NAME_SIGNALS) ||
    matchesAnySignalCaseInsensitive(typeof message === 'string' ? message : undefined, PROVIDER_QUOTA_MESSAGE_SIGNALS) ||
    objectHasTooManyRequestsStatus(error) ||
    objectHasProviderQuotaCode(error)
  ) {
    return true;
  }

  const cause = readCause(error);

  if (cause === undefined || depth >= MAX_CAUSE_DEPTH) {
    return false;
  }

  return isProviderQuotaError(cause, depth + 1);
}

function createInvalidToolArgumentsRetryMessage(message: string): string {
  return `The previous attempt failed because a tool call used invalid arguments.
Original user message:
${message}

Retry the task from scratch. When calling tools, use the exact tool input schema.
Do not invent, rename, or approximate field names.
For date-bounded tools, use top-level from and to exactly.
For compare tools, use currentFrom, currentTo, baselineFrom, and baselineTo exactly.
Do not use nested dateRange unless the tool schema explicitly requires it.
Do not use fields such as from1, start, end, date_from, or date_to.
Use ISO dates in YYYY-MM-DD format.
After the tool succeeds, return the final user-facing answer in Spanish.`;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(@Inject(GASTI_FINANCE_AGENT) private readonly agent: FinanceAgent = defaultFinanceAgent) {}

  async answer(message: string): Promise<string> {
    if (!process.env.GEMINI_API_KEY?.trim()) {
      throw new ServiceUnavailableException('GEMINI_API_KEY is required to use the chat endpoint.');
    }

    this.logger.log({
      event: 'chat.request_received',
      message: 'Chat request received',
      messageLength: message.length,
    });

    try {
      return await this.generateAnswer(message, 1);
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
          return await this.generateAnswer(createInvalidToolArgumentsRetryMessage(message), 2);
        } catch (retryError) {
          if (isProviderQuotaError(retryError)) {
            this.throwProviderQuotaExceeded(retryError);
          }

          this.logAgentGenerationFailure(retryError);
        }
      } else if (isProviderQuotaError(error)) {
        this.throwProviderQuotaExceeded(error);
      } else {
        this.logAgentGenerationFailure(error);
      }

      throw new InternalServerErrorException('Failed to generate a chat answer.');
    }
  }

  private async generateAnswer(message: string, attempt: number): Promise<string> {
    this.logger.log({
      event: 'chat.agent_generation_started',
      message: 'Agent generation started',
      attempt,
      messageLength: message.length,
    });

    const result = await this.agent.generate(message, { maxSteps: 5 });

    if (!result.text.trim()) {
      throw new Error('Agent returned an empty answer.');
    }

    this.logger.log({
      event: 'chat.agent_response_generated',
      message: 'Agent response generated',
      attempt,
      responseLength: result.text.length,
    });

    return result.text;
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
}
