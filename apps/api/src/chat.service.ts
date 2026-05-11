import { Inject, Injectable, InternalServerErrorException, Logger, ServiceUnavailableException } from '@nestjs/common';
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
const INVALID_TOOL_ARGUMENT_NAME_SIGNALS = ['AI_InvalidToolArgumentsError', 'AI_TypeValidationError'];
const INVALID_TOOL_ARGUMENT_MESSAGE_SIGNALS = ['Invalid arguments for tool', 'Type validation failed'];

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

function serializeAgentError(error: unknown, depth = 0): SerializedAgentError | string {
  if (typeof error !== 'object' || error === null) {
    return redactSecrets(String(error)) ?? '';
  }

  const serialized: SerializedAgentError = {
    name: readStringProperty(error, 'name'),
    message: readStringProperty(error, 'message'),
    stack: readStringProperty(error, 'stack'),
  };

  const cause = readCause(error);

  if (cause !== undefined) {
    serialized.cause =
      depth >= MAX_CAUSE_DEPTH ? '[Cause depth limit reached]' : serializeAgentError(cause, depth + 1);
  }

  if (!serialized.name && !serialized.message && !serialized.stack && !serialized.cause) {
    serialized.message = redactSecrets(safeStringify(error));
  }

  return serialized;
}

function matchesAnySignal(value: string | undefined, signals: readonly string[]): boolean {
  return Boolean(value && signals.some((signal) => value.includes(signal)));
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

    try {
      return await this.generateAnswer(message);
    } catch (error) {
      if (isInvalidToolArgumentsError(error)) {
        this.logger.warn({
          event: 'chat.agent_generation_retrying',
          error: serializeAgentError(error),
        });

        try {
          return await this.generateAnswer(createInvalidToolArgumentsRetryMessage(message));
        } catch (retryError) {
          this.logAgentGenerationFailure(retryError);
        }
      } else {
        this.logAgentGenerationFailure(error);
      }

      throw new InternalServerErrorException('Failed to generate a chat answer.');
    }
  }

  private async generateAnswer(message: string): Promise<string> {
    const result = await this.agent.generate(message, { maxSteps: 5 });

    if (!result.text.trim()) {
      throw new Error('Agent returned an empty answer.');
    }

    return result.text;
  }

  private logAgentGenerationFailure(error: unknown): void {
    this.logger.error({
      event: 'chat.agent_generation_failed',
      error: serializeAgentError(error),
    });
  }
}
