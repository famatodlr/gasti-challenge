import { getGastiModelFallbackChain } from './model.ts';

const MAX_CAUSE_DEPTH = 2;
const PROVIDER_QUOTA_MESSAGE_SIGNALS = [
  'exceeded your current quota',
  'Quota exceeded',
  'rate limit',
  'rate-limit',
  'RESOURCE_EXHAUSTED',
];

export class GastiModelFallbackExhaustedError extends Error {
  constructor(
    readonly models: readonly string[],
    readonly errors: readonly unknown[],
    cause: unknown,
  ) {
    super(`All Gemini fallback models were exhausted: ${models.join(', ')}`, { cause });
    this.name = 'GastiModelFallbackExhaustedError';
  }
}

type GenerateWithGastiModelFallbackParams<TResult> = {
  source: string;
  generate: (modelId: string, context: { attempt: number; modelIndex: number; modelCount: number }) => Promise<TResult>;
  onAttemptStarted?: (context: {
    source: string;
    modelId: string;
    attempt: number;
    modelIndex: number;
    modelCount: number;
  }) => void;
  onAttemptFailed?: (context: {
    source: string;
    modelId: string;
    attempt: number;
    modelIndex: number;
    modelCount: number;
    isQuotaOrRateLimit: boolean;
    error: unknown;
  }) => void;
  onFallbackRetrying?: (context: {
    source: string;
    modelId: string;
    nextModelId: string;
    attempt: number;
    modelIndex: number;
    modelCount: number;
    isQuotaOrRateLimit: boolean;
    error: unknown;
  }) => void;
  onAttemptSucceeded?: (context: {
    source: string;
    modelId: string;
    attempt: number;
    modelIndex: number;
    modelCount: number;
  }) => void;
  onFallbackExhausted?: (context: {
    source: string;
    modelIds: readonly string[];
    errors: readonly unknown[];
    error: GastiModelFallbackExhaustedError;
  }) => void;
};

function matchesAnySignalCaseInsensitive(value: string | undefined, signals: readonly string[]): boolean {
  if (!value) {
    return false;
  }

  const normalizedValue = value.toLocaleLowerCase();
  return signals.some((signal) => normalizedValue.includes(signal.toLocaleLowerCase()));
}

function isTooManyRequestsStatus(value: unknown): boolean {
  return value === 429 || value === '429';
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

function readCause(value: object): unknown {
  return (value as { cause?: unknown }).cause;
}

export function isGastiQuotaOrRateLimitError(error: unknown, depth = 0): boolean {
  if (typeof error !== 'object' || error === null) {
    return matchesAnySignalCaseInsensitive(String(error), PROVIDER_QUOTA_MESSAGE_SIGNALS);
  }

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

  return nestedErrors.some((nestedError) => nestedError !== undefined && isGastiQuotaOrRateLimitError(nestedError, depth + 1));
}

export async function generateWithGastiModelFallback<TResult>({
  source,
  generate,
  onAttemptStarted,
  onAttemptFailed,
  onFallbackRetrying,
  onAttemptSucceeded,
  onFallbackExhausted,
}: GenerateWithGastiModelFallbackParams<TResult>): Promise<TResult> {
  const modelIds = getGastiModelFallbackChain();
  const quotaErrors: unknown[] = [];

  for (const [modelIndex, modelId] of modelIds.entries()) {
    const attempt = modelIndex + 1;
    const modelCount = modelIds.length;
    onAttemptStarted?.({ source, modelId, attempt, modelIndex: attempt, modelCount });

    try {
      const result = await generate(modelId, { attempt, modelIndex: attempt, modelCount });
      onAttemptSucceeded?.({ source, modelId, attempt, modelIndex: attempt, modelCount });
      return result;
    } catch (error) {
      const isQuotaOrRateLimit = isGastiQuotaOrRateLimitError(error);
      onAttemptFailed?.({
        source,
        modelId,
        attempt,
        modelIndex: attempt,
        modelCount,
        isQuotaOrRateLimit,
        error,
      });

      if (!isQuotaOrRateLimit) {
        throw error;
      }

      quotaErrors.push(error);
      const nextModelId = modelIds[modelIndex + 1];

      if (nextModelId) {
        onFallbackRetrying?.({
          source,
          modelId,
          nextModelId,
          attempt,
          modelIndex: attempt,
          modelCount,
          isQuotaOrRateLimit: true,
          error,
        });
        continue;
      }

      const exhaustedError = new GastiModelFallbackExhaustedError(modelIds, quotaErrors, error);
      onFallbackExhausted?.({ source, modelIds, errors: quotaErrors, error: exhaustedError });
      throw exhaustedError;
    }
  }

  const exhaustedError = new GastiModelFallbackExhaustedError(modelIds, quotaErrors, quotaErrors.at(-1));
  onFallbackExhausted?.({ source, modelIds, errors: quotaErrors, error: exhaustedError });
  throw exhaustedError;
}
