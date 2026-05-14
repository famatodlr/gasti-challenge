import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createDemoMemoryContext,
  GastiModelFallbackExhaustedError,
  buildGastiResponseMarkdown,
  buildSafeGastiResponseFallback,
  detectGastiWorkflowIntent,
  gastiStructuredResponseSchema,
  generateGastiFinanceAgent,
  getGastiModelFallbackChain,
  isGastiQuotaOrRateLimitError,
  normalizeGastiStructuredResponse,
  runGreetingFinancialSnapshotWorkflow,
  runMonthlyFinancialReviewWorkflow,
  streamGastiFinanceAgent,
} from 'ai/mastra';

import type {
  ChatActivityEvent,
  ChatMessage,
  ChatRequestContext,
  ChatResponseBody,
  NormalizedChatRequest,
} from './chat.types.js';

type AgentMemoryContext = {
  resource: string;
  thread: { id: string };
};

type AgentGenerateOptions = {
  disableMemory?: boolean;
  experimental_output?: unknown;
  maxSteps?: number;
  memory?: AgentMemoryContext;
  modelId?: string;
};

type AgentStreamOptions = AgentGenerateOptions;

type AgentGenerateResult = {
  object?: unknown;
  text: string;
  finishReason?: unknown;
  steps?: unknown;
  toolCalls?: unknown;
  toolResults?: unknown;
};

type AgentStreamResult = {
  fullStream: AsyncIterable<unknown>;
};

type WorkflowRunInput = {
  message: string;
  currentDate?: string;
  modelId?: string;
};

type WorkflowRunResult = {
  answer: string;
  activityLabels: readonly string[];
};

export type FinanceAgent = {
  generate: (messages: ChatMessage[], options?: AgentGenerateOptions) => Promise<AgentGenerateResult>;
  stream: (messages: ChatMessage[], options?: AgentStreamOptions) => Promise<AgentStreamResult>;
};

export type FinanceWorkflowRunner = {
  runMonthlyReview: (input: WorkflowRunInput) => Promise<WorkflowRunResult>;
  runGreetingSnapshot: (input: WorkflowRunInput) => Promise<WorkflowRunResult>;
};

export const GASTI_FINANCE_AGENT = Symbol('GASTI_FINANCE_AGENT');
export const GASTI_WORKFLOW_RUNNER = Symbol('GASTI_WORKFLOW_RUNNER');

export const defaultFinanceAgent: FinanceAgent = {
  generate: (messages, options) => generateGastiFinanceAgent(messages, options),
  stream: (messages, options) => streamGastiFinanceAgent(messages, options),
};

export const defaultFinanceWorkflowRunner: FinanceWorkflowRunner = {
  runMonthlyReview: (input) => runMonthlyFinancialReviewWorkflow(input),
  runGreetingSnapshot: (input) => runGreetingFinancialSnapshotWorkflow(input),
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
const PUBLIC_PROVIDER_QUOTA_EXCEEDED_LABEL = 'Se excedió la cuota del proveedor de IA. Intentá de nuevo más tarde.';
const PUBLIC_EMPTY_AGENT_ANSWER_LABEL = 'El proveedor de IA devolvió una respuesta vacía. Intentá de nuevo.';
const PUBLIC_AGENT_GENERATION_FAILED_LABEL = 'No pude generar una respuesta. Intentá de nuevo.';
const INVALID_TOOL_ARGUMENT_NAME_SIGNALS = ['AI_InvalidToolArgumentsError', 'AI_TypeValidationError'];
const INVALID_TOOL_ARGUMENT_MESSAGE_SIGNALS = ['Invalid arguments for tool', 'Type validation failed'];
const ACTIVITY_ANALYZING_LABEL = 'Analizando consulta';
const ACTIVITY_TOOL_CALL_LABEL = 'Consultando herramienta';
const ACTIVITY_TOOL_RESULT_LABEL = 'Herramienta completada';
const ACTIVITY_INVALID_TOOL_RETRY_LABEL = 'Reintentando por argumentos inválidos';
const ACTIVITY_GENERATING_FINAL_LABEL = 'Generando respuesta final';
const ACTIVITY_FINAL_ANSWER_LABEL = 'Respuesta final generada';
const ACTIVITY_MODEL_FALLBACK_LABEL = 'Reintentando con otro modelo';
const ACTIVITY_EMPTY_ANSWER_RETRY_LABEL = 'Reintentando respuesta vacía';

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

type ChatRequestLogMetadata = Pick<
  NormalizedChatRequest['metadata'],
  | 'source'
  | 'originalMessageCount'
  | 'normalizedMessageCount'
  | 'usesMemory'
  | 'mixedLegacyNormalized'
  | 'legacyContextCapped'
  | 'localDemoFallbackThread'
  | 'hasResourceId'
  | 'hasThreadId'
>;

function createAgentMemoryContext(context: ChatRequestContext = {}): AgentMemoryContext {
  return createDemoMemoryContext(context);
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

function resolveFinalAnswerText(result: AgentGenerateResult): string | null {
  const structuredResponse = normalizeGastiStructuredResponse(result.object);

  if (structuredResponse) {
    return buildGastiResponseMarkdown(structuredResponse);
  }

  const hasStructuredAttempt = Object.prototype.hasOwnProperty.call(result, 'object');
  const trimmedText = result.text.trim();

  if (trimmedText) {
    return buildSafeGastiResponseFallback(result.text);
  }

  return hasStructuredAttempt ? buildSafeGastiResponseFallback() : null;
}

function normalizePublicAnswer(answer: string): string {
  return buildSafeGastiResponseFallback(answer);
}

function createActivityEvent(
  type: ChatActivityEvent['type'],
  label: string,
  details: Pick<ChatActivityEvent, 'toolName' | 'answer'> = {},
): ChatActivityEvent {
  return {
    type,
    label,
    timestamp: new Date().toISOString(),
    ...details,
  };
}

function readRecordString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const property = value[key];
  return typeof property === 'string' && property.trim() ? property.trim() : undefined;
}

function readToolName(value: unknown): string | undefined {
  return readRecordString(value, 'toolName');
}

function readToolCallId(value: unknown): string | undefined {
  return readRecordString(value, 'toolCallId');
}

function readChunkType(value: unknown): string | undefined {
  return readRecordString(value, 'type');
}

function readTextDelta(value: unknown): string {
  if (!isRecord(value)) {
    return '';
  }

  return typeof value.textDelta === 'string' ? value.textDelta : '';
}

function readStreamError(value: unknown): unknown {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'error') ? value.error : value;
}

function getPublicStreamErrorLabel(error: unknown): string {
  if (error instanceof GastiEmptyAnswerExhaustedError || isEmptyAgentAnswerError(error)) {
    return PUBLIC_EMPTY_AGENT_ANSWER_LABEL;
  }

  if (error instanceof GastiModelFallbackExhaustedError || isGastiQuotaOrRateLimitError(error)) {
    return PUBLIC_PROVIDER_QUOTA_EXCEEDED_LABEL;
  }

  if (error instanceof HttpException) {
    const response = error.getResponse();

    if (typeof response === 'string' && response.trim()) {
      return response;
    }

    if (isRecord(response) && typeof response.message === 'string' && response.message.trim()) {
      return response.message;
    }
  }

  return PUBLIC_AGENT_GENERATION_FAILED_LABEL;
}

class ActivityEventCollector {
  private readonly emittedToolCalls = new Set<string>();
  private readonly emittedToolResults = new Set<string>();
  private nextToolCallFallbackIndex = 0;
  private nextToolResultFallbackIndex = 0;
  private generatingFinalAnswer = false;

  constructor(private readonly events: ChatActivityEvent[] = []) {}

  get collectedEvents(): ChatActivityEvent[] {
    return this.events;
  }

  addStatus(label: string): ChatActivityEvent {
    return this.addEvent(createActivityEvent('status', label));
  }

  addWarning(label: string): ChatActivityEvent {
    return this.addEvent(createActivityEvent('warning', label));
  }

  addError(label: string): ChatActivityEvent {
    return this.addEvent(createActivityEvent('error', label));
  }

  addFinalAnswer(answer: string): ChatActivityEvent {
    return this.addEvent(createActivityEvent('final_answer', ACTIVITY_FINAL_ANSWER_LABEL, { answer }));
  }

  addGeneratingFinalAnswerOnce(): ChatActivityEvent | null {
    if (this.generatingFinalAnswer) {
      return null;
    }

    this.generatingFinalAnswer = true;
    return this.addStatus(ACTIVITY_GENERATING_FINAL_LABEL);
  }

  addToolCall(toolName: string | undefined, toolCallId: string | undefined): ChatActivityEvent | null {
    if (!toolName) {
      return null;
    }

    const key = toolCallId ?? `${toolName}:${this.nextToolCallFallbackIndex++}`;

    if (this.emittedToolCalls.has(key)) {
      return null;
    }

    this.emittedToolCalls.add(key);
    return this.addEvent(createActivityEvent('tool_call', ACTIVITY_TOOL_CALL_LABEL, { toolName }));
  }

  addToolResult(toolName: string | undefined, toolCallId: string | undefined): ChatActivityEvent | null {
    if (!toolName) {
      return null;
    }

    const key = toolCallId ?? `${toolName}:${this.nextToolResultFallbackIndex++}`;

    if (this.emittedToolResults.has(key)) {
      return null;
    }

    this.emittedToolResults.add(key);
    return this.addEvent(createActivityEvent('tool_result', ACTIVITY_TOOL_RESULT_LABEL, { toolName }));
  }

  addGenerateResult(result: AgentGenerateResult): void {
    const steps = Array.isArray(result.steps) ? result.steps : [];

    for (const step of steps) {
      if (!isRecord(step)) {
        continue;
      }

      this.addToolEventsFromArray(step.toolCalls, 'call');
      this.addToolEventsFromArray(step.toolResults, 'result');
    }

    this.addToolEventsFromArray(result.toolCalls, 'call');
    this.addToolEventsFromArray(result.toolResults, 'result');
    this.addGeneratingFinalAnswerOnce();
  }

  private addToolEventsFromArray(value: unknown, kind: 'call' | 'result'): void {
    if (!Array.isArray(value)) {
      return;
    }

    for (const toolEvent of value) {
      if (kind === 'call') {
        this.addToolCall(readToolName(toolEvent), readToolCallId(toolEvent));
      } else {
        this.addToolResult(readToolName(toolEvent), readToolCallId(toolEvent));
      }
    }
  }

  private addEvent(event: ChatActivityEvent): ChatActivityEvent {
    this.events.push(event);
    return event;
  }
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
After the tool succeeds, return the final user-facing answer in the same language the user used.

Preserve the Gasti formatting contract:
- Return concise, structured Markdown.
- Use short paragraphs with blank lines between sections.
- Use real Markdown bullets using "- " for lists.
- Bold important months, periods, totals, and amounts with **text**.
- Avoid excessive percentage precision.
- Ask one specific follow-up only when it advances the analysis.
- Do not return one dense paragraph.`,
    },
  ];
}

function buildChatRequestLogMetadata(request: NormalizedChatRequest): ChatRequestLogMetadata {
  return {
    source: request.metadata.source,
    originalMessageCount: request.metadata.originalMessageCount,
    normalizedMessageCount: request.metadata.normalizedMessageCount,
    usesMemory: request.metadata.usesMemory,
    mixedLegacyNormalized: request.metadata.mixedLegacyNormalized,
    legacyContextCapped: request.metadata.legacyContextCapped,
    localDemoFallbackThread: request.metadata.localDemoFallbackThread,
    hasResourceId: request.metadata.hasResourceId,
    hasThreadId: request.metadata.hasThreadId,
  };
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject(GASTI_FINANCE_AGENT) private readonly agent: FinanceAgent = defaultFinanceAgent,
    @Optional()
    @Inject(GASTI_WORKFLOW_RUNNER)
    private readonly workflowRunner: FinanceWorkflowRunner = defaultFinanceWorkflowRunner,
  ) {}

  async answer(request: NormalizedChatRequest): Promise<string> {
    return (await this.answerWithSteps(request)).answer;
  }

  async answerWithSteps(request: NormalizedChatRequest): Promise<ChatResponseBody> {
    if (!process.env.GEMINI_API_KEY?.trim()) {
      throw new ServiceUnavailableException('GEMINI_API_KEY is required to use the chat endpoint.');
    }

    const { messages } = request;
    const lastMessage = messages.at(-1);
    const activity = new ActivityEventCollector();
    activity.addStatus(ACTIVITY_ANALYZING_LABEL);
    const memory = request.mode === 'memory' ? createAgentMemoryContext(request.context) : undefined;
    const requestMetadata = buildChatRequestLogMetadata(request);
    const workflowIntent = this.detectWorkflowIntent(lastMessage);

    this.logger.log({
      event: 'chat.request_received',
      message: 'Chat request received',
      mode: request.mode,
      messageCount: messages.length,
      lastMessageLength: lastMessage?.content.length ?? 0,
      totalContentLength: totalContentLength(messages),
      memoryUsed: Boolean(memory),
      ...requestMetadata,
    });

    try {
      if (workflowIntent !== 'agent') {
        const workflowResult = await this.runWorkflow(workflowIntent, lastMessage?.content ?? '');
        const answer = normalizePublicAnswer(workflowResult.answer);

        for (const label of workflowResult.activityLabels) {
          activity.addStatus(label);
        }

        activity.addFinalAnswer(answer);

        return { answer, steps: activity.collectedEvents };
      }

      const answer = await this.generateAnswerWithModelFallback(
        messages,
        1,
        memory,
        request.mode,
        requestMetadata,
        activity,
      );
      activity.addFinalAnswer(answer);

      return { answer, steps: activity.collectedEvents };
    } catch (error) {
      if (isInvalidToolArgumentsError(error)) {
        this.logger.warn({
          event: 'chat.agent_generation_retrying',
          message: 'Invalid tool arguments detected, retrying once',
          attempt: 1,
          nextAttempt: 2,
          error: serializeAgentError(error),
        });
        activity.addWarning(ACTIVITY_INVALID_TOOL_RETRY_LABEL);

        try {
          const answer = await this.generateAnswerWithModelFallback(
            createInvalidToolArgumentsRetryMessages(messages),
            2,
            memory,
            request.mode,
            requestMetadata,
            activity,
          );
          activity.addFinalAnswer(answer);

          return { answer, steps: activity.collectedEvents };
        } catch (retryError) {
          if (retryError instanceof GastiModelFallbackExhaustedError || isGastiQuotaOrRateLimitError(retryError)) {
            this.throwProviderQuotaExceeded(retryError);
          }

          if (retryError instanceof GastiEmptyAnswerExhaustedError || isEmptyAgentAnswerError(retryError)) {
            this.throwEmptyAgentAnswer(retryError);
          }

          this.logAgentGenerationFailure(retryError);
        }
      } else if (error instanceof GastiModelFallbackExhaustedError || isGastiQuotaOrRateLimitError(error)) {
        this.throwProviderQuotaExceeded(error);
      } else if (error instanceof GastiEmptyAnswerExhaustedError || isEmptyAgentAnswerError(error)) {
        this.throwEmptyAgentAnswer(error);
      } else {
        this.logAgentGenerationFailure(error);
      }

      throw new InternalServerErrorException('Failed to generate a chat answer.');
    }
  }

  async *streamAnswerEvents(request: NormalizedChatRequest): AsyncGenerator<ChatActivityEvent, void, unknown> {
    if (!process.env.GEMINI_API_KEY?.trim()) {
      yield createActivityEvent('error', 'GEMINI_API_KEY es requerida para usar el chat.');
      return;
    }

    const { messages } = request;
    const lastMessage = messages.at(-1);
    const memory = request.mode === 'memory' ? createAgentMemoryContext(request.context) : undefined;
    const requestMetadata = buildChatRequestLogMetadata(request);
    const workflowIntent = this.detectWorkflowIntent(lastMessage);

    this.logger.log({
      event: 'chat.request_received',
      message: 'Chat request received',
      mode: request.mode,
      messageCount: messages.length,
      lastMessageLength: lastMessage?.content.length ?? 0,
      totalContentLength: totalContentLength(messages),
      memoryUsed: Boolean(memory),
      ...requestMetadata,
    });

    yield createActivityEvent('status', ACTIVITY_ANALYZING_LABEL);

    try {
      if (workflowIntent !== 'agent') {
        const workflowResult = await this.runWorkflow(workflowIntent, lastMessage?.content ?? '');
        const answer = normalizePublicAnswer(workflowResult.answer);

        for (const label of workflowResult.activityLabels) {
          yield createActivityEvent('status', label);
        }

        yield createActivityEvent('final_answer', ACTIVITY_FINAL_ANSWER_LABEL, { answer });
        return;
      }

      yield* this.streamAnswerWithInvalidToolRetry(messages, memory, request.mode, requestMetadata);
    } catch (error) {
      if (error instanceof GastiModelFallbackExhaustedError || isGastiQuotaOrRateLimitError(error)) {
        this.logger.warn({
          event: 'chat.provider_quota_exceeded',
          message: 'AI provider quota exceeded',
          provider: 'gemini',
          retryable: true,
          error: serializeAgentError(error, 0, { includeStack: false, maxCauseDepth: 1 }),
        });
      } else if (error instanceof GastiEmptyAnswerExhaustedError || isEmptyAgentAnswerError(error)) {
        this.logger.warn({
          event: 'chat.empty_answer_public_error',
          message: 'AI provider returned an empty answer',
          provider: 'gemini',
          retryable: true,
          error: serializeAgentError(error, 0, { includeStack: false, maxCauseDepth: 1 }),
        });
      } else {
        this.logAgentGenerationFailure(error);
      }

      yield createActivityEvent('error', getPublicStreamErrorLabel(error));
    }
  }

  private detectWorkflowIntent(lastMessage: ChatMessage | undefined): ReturnType<typeof detectGastiWorkflowIntent> {
    if (!lastMessage || lastMessage.role !== 'user') {
      return 'agent';
    }

    return detectGastiWorkflowIntent(lastMessage.content);
  }

  private async runWorkflow(
    intent: Exclude<ReturnType<typeof detectGastiWorkflowIntent>, 'agent'>,
    message: string,
  ): Promise<WorkflowRunResult> {
    const modelId = getGastiModelFallbackChain()[0];
    const input = { message, ...(modelId ? { modelId } : {}) };

    if (intent === 'monthly_review') {
      return await this.workflowRunner.runMonthlyReview(input);
    }

    return await this.workflowRunner.runGreetingSnapshot(input);
  }

  private async generateAnswerWithModelFallback(
    messages: ChatMessage[],
    attempt: number,
    memory: AgentMemoryContext | undefined,
    mode: NormalizedChatRequest['mode'],
    requestMetadata: ChatRequestLogMetadata,
    activity?: ActivityEventCollector,
  ): Promise<string> {
    const modelIds = getGastiModelFallbackChain();
    const quotaErrors: unknown[] = [];
    const emptyAnswerErrors: EmptyAgentAnswerError[] = [];

    for (const [modelIndex, modelId] of modelIds.entries()) {
      try {
        return await this.generateAnswer(
          messages,
          attempt,
          modelId,
          modelIndex,
          modelIds.length,
          memory,
          mode,
          requestMetadata,
          activity,
        );
      } catch (error) {
        if (isGastiQuotaOrRateLimitError(error)) {
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
            activity?.addWarning(ACTIVITY_MODEL_FALLBACK_LABEL);

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
          const modelId = error.metadata.modelId;
          const modelIndex = modelIds.findIndex((candidate) => candidate === modelId);
          emptyAnswerErrors.push(error);
          const nextModelId = modelIndex >= 0 ? modelIds[modelIndex + 1] : undefined;

          if (nextModelId) {
            this.logger.warn({
              event: 'chat.model_fallback_retrying',
              message: 'Gemini model returned an empty answer, retrying with fallback model',
              attempt,
              modelId,
              nextModelId,
              modelIndex: modelIndex >= 0 ? modelIndex + 1 : undefined,
              modelCount: modelIds.length,
              reason: 'empty_answer',
              generation: error.metadata,
            });
            activity?.addWarning(ACTIVITY_EMPTY_ANSWER_RETRY_LABEL);
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
          activity?.addWarning(ACTIVITY_EMPTY_ANSWER_RETRY_LABEL);

          try {
            return await this.generateAnswer(
              messages,
              attempt,
              modelId,
              modelIndex >= 0 ? modelIndex : modelIds.length - 1,
              modelIds.length,
              memory,
              mode,
              requestMetadata,
              activity,
            );
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
    memory: AgentMemoryContext | undefined,
    mode: NormalizedChatRequest['mode'],
    requestMetadata: ChatRequestLogMetadata,
    activity?: ActivityEventCollector,
  ): Promise<string> {
    const lastMessage = messages.at(-1);

    this.logger.log({
      event: 'chat.model_attempt_started',
      message: 'Gemini model attempt started',
      attempt,
      modelId,
      modelIndex: modelIndex + 1,
      modelCount,
      mode,
      messageCount: messages.length,
      lastMessageLength: lastMessage?.content.length ?? 0,
      totalContentLength: totalContentLength(messages),
      memoryUsed: Boolean(memory),
      ...requestMetadata,
    });

    const generateOptions: AgentGenerateOptions = { maxSteps: 5, modelId };

    if (memory) {
      generateOptions.memory = memory;
    } else {
      generateOptions.disableMemory = true;
    }

    generateOptions.experimental_output = gastiStructuredResponseSchema;

    const result = await this.agent.generate(messages, generateOptions);
    const finalAnswer = resolveFinalAnswerText(result);
    const generation = buildAgentGenerationMetadata(result, messages, modelId);

    if (!finalAnswer?.trim()) {
      this.logger.warn({
        event: 'chat.model_attempt_empty',
        message: 'Gemini model attempt returned an empty answer',
        attempt,
        modelIndex: modelIndex + 1,
        modelCount,
        mode,
        memoryUsed: Boolean(memory),
        ...requestMetadata,
        ...generation,
      });

      throw new EmptyAgentAnswerError(generation);
    }

    activity?.addGenerateResult(result);

    this.logger.log({
      event: 'chat.model_attempt_succeeded',
      message: 'Gemini model attempt succeeded',
      attempt,
      modelIndex: modelIndex + 1,
      modelCount,
      responseLength: finalAnswer.length,
      mode,
      memoryUsed: Boolean(memory),
      ...requestMetadata,
      ...generation,
    });

    return finalAnswer;
  }

  private async *streamAnswerWithInvalidToolRetry(
    messages: ChatMessage[],
    memory: AgentMemoryContext | undefined,
    mode: NormalizedChatRequest['mode'],
    requestMetadata: ChatRequestLogMetadata,
  ): AsyncGenerator<ChatActivityEvent, string, unknown> {
    try {
      return yield* this.streamAnswerWithModelFallback(messages, 1, memory, mode, requestMetadata);
    } catch (error) {
      if (!isInvalidToolArgumentsError(error)) {
        throw error;
      }

      this.logger.warn({
        event: 'chat.agent_generation_retrying',
        message: 'Invalid tool arguments detected, retrying once',
        attempt: 1,
        nextAttempt: 2,
        error: serializeAgentError(error),
      });

      yield createActivityEvent('warning', ACTIVITY_INVALID_TOOL_RETRY_LABEL);

      try {
        return yield* this.streamAnswerWithModelFallback(
          createInvalidToolArgumentsRetryMessages(messages),
          2,
          memory,
          mode,
          requestMetadata,
        );
      } catch (retryError) {
        if (retryError instanceof GastiModelFallbackExhaustedError || isGastiQuotaOrRateLimitError(retryError)) {
          throw retryError;
        }

        if (retryError instanceof GastiEmptyAnswerExhaustedError || isEmptyAgentAnswerError(retryError)) {
          throw retryError;
        }

        this.logAgentGenerationFailure(retryError);
        throw new InternalServerErrorException('Failed to generate a chat answer.');
      }
    }
  }

  private async *streamAnswerWithModelFallback(
    messages: ChatMessage[],
    attempt: number,
    memory: AgentMemoryContext | undefined,
    mode: NormalizedChatRequest['mode'],
    requestMetadata: ChatRequestLogMetadata,
  ): AsyncGenerator<ChatActivityEvent, string, unknown> {
    const modelIds = getGastiModelFallbackChain();
    const quotaErrors: unknown[] = [];
    const emptyAnswerErrors: EmptyAgentAnswerError[] = [];

    for (const [modelIndex, modelId] of modelIds.entries()) {
      try {
        return yield* this.streamAnswer(
          messages,
          attempt,
          modelId,
          modelIndex,
          modelIds.length,
          memory,
          mode,
          requestMetadata,
        );
      } catch (error) {
        if (isGastiQuotaOrRateLimitError(error)) {
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

            yield createActivityEvent('warning', ACTIVITY_MODEL_FALLBACK_LABEL);
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

            yield createActivityEvent('warning', ACTIVITY_EMPTY_ANSWER_RETRY_LABEL);
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

          yield createActivityEvent('warning', ACTIVITY_EMPTY_ANSWER_RETRY_LABEL);

          try {
            return yield* this.streamAnswer(
              messages,
              attempt,
              modelId,
              modelIndex,
              modelIds.length,
              memory,
              mode,
              requestMetadata,
            );
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

  private async *streamAnswer(
    messages: ChatMessage[],
    attempt: number,
    modelId: string,
    modelIndex: number,
    modelCount: number,
    memory: AgentMemoryContext | undefined,
    mode: NormalizedChatRequest['mode'],
    requestMetadata: ChatRequestLogMetadata,
  ): AsyncGenerator<ChatActivityEvent, string, unknown> {
    const lastMessage = messages.at(-1);
    const activity = new ActivityEventCollector();
    let answer = '';

    this.logger.log({
      event: 'chat.model_attempt_started',
      message: 'Gemini model attempt started',
      attempt,
      modelId,
      modelIndex: modelIndex + 1,
      modelCount,
      mode,
      messageCount: messages.length,
      lastMessageLength: lastMessage?.content.length ?? 0,
      totalContentLength: totalContentLength(messages),
      memoryUsed: Boolean(memory),
      ...requestMetadata,
    });

    const streamOptions: AgentStreamOptions = { maxSteps: 5, modelId };

    if (memory) {
      streamOptions.memory = memory;
    } else {
      streamOptions.disableMemory = true;
    }

    const result = await this.agent.stream(messages, streamOptions);

    for await (const chunk of result.fullStream) {
      const chunkType = readChunkType(chunk);

      if (chunkType === 'tool-call-streaming-start' || chunkType === 'tool-call') {
        const event = activity.addToolCall(readToolName(chunk), readToolCallId(chunk));

        if (event) {
          yield event;
        }

        continue;
      }

      if (chunkType === 'tool-result') {
        const event = activity.addToolResult(readToolName(chunk), readToolCallId(chunk));

        if (event) {
          yield event;
        }

        continue;
      }

      if (chunkType === 'text-delta') {
        const textDelta = readTextDelta(chunk);

        if (!textDelta) {
          continue;
        }

        const event = activity.addGeneratingFinalAnswerOnce();

        if (event) {
          yield event;
        }

        answer += textDelta;
        continue;
      }

      if (chunkType === 'error') {
        throw readStreamError(chunk);
      }
    }

    const finalAnswer = normalizePublicAnswer(answer);
    const generation = buildAgentGenerationMetadata({ text: finalAnswer }, messages, modelId);

    if (!finalAnswer.trim()) {
      this.logger.warn({
        event: 'chat.model_attempt_empty',
        message: 'Gemini model attempt returned an empty answer',
        attempt,
        modelIndex: modelIndex + 1,
        modelCount,
        mode,
        memoryUsed: Boolean(memory),
        ...requestMetadata,
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
      responseLength: answer.length,
      mode,
      memoryUsed: Boolean(memory),
      ...requestMetadata,
      ...generation,
    });

    yield activity.addFinalAnswer(finalAnswer);

    return finalAnswer;
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
