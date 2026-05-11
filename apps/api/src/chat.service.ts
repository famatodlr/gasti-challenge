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

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(@Inject(GASTI_FINANCE_AGENT) private readonly agent: FinanceAgent = defaultFinanceAgent) {}

  async answer(message: string): Promise<string> {
    if (!process.env.GEMINI_API_KEY?.trim()) {
      throw new ServiceUnavailableException('GEMINI_API_KEY is required to use the chat endpoint.');
    }

    try {
      const result = await this.agent.generate(message, { maxSteps: 5 });

      if (!result.text.trim()) {
        throw new Error('Agent returned an empty answer.');
      }

      return result.text;
    } catch (error) {
      this.logger.error({
        event: 'chat.agent_generation_failed',
        error: serializeAgentError(error),
      });

      throw new InternalServerErrorException('Failed to generate a chat answer.');
    }
  }
}
