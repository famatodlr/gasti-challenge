import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GastiModelFallbackExhaustedError,
  generateWithGastiModelFallback,
} from './model-fallback.ts';

test('generateWithGastiModelFallback retries next model only on quota errors', async () => {
  const previousChain = process.env.GASTI_AI_MODEL_FALLBACK_CHAIN;
  process.env.GASTI_AI_MODEL_FALLBACK_CHAIN = 'gemini-primary,gemini-secondary';

  try {
    const attempts: string[] = [];
    const result = await generateWithGastiModelFallback({
      source: 'test',
      generate: async (modelId) => {
        attempts.push(modelId);

        if (modelId === 'gemini-primary') {
          throw new Error('RESOURCE_EXHAUSTED: quota reached');
        }

        return 'ok';
      },
    });

    assert.equal(result, 'ok');
    assert.deepEqual(attempts, ['gemini-primary', 'gemini-secondary']);
  } finally {
    if (previousChain === undefined) {
      delete process.env.GASTI_AI_MODEL_FALLBACK_CHAIN;
    } else {
      process.env.GASTI_AI_MODEL_FALLBACK_CHAIN = previousChain;
    }
  }
});

test('generateWithGastiModelFallback does not advance on non-quota errors', async () => {
  const previousChain = process.env.GASTI_AI_MODEL_FALLBACK_CHAIN;
  process.env.GASTI_AI_MODEL_FALLBACK_CHAIN = 'gemini-primary,gemini-secondary';

  try {
    const attempts: string[] = [];

    await assert.rejects(
      () =>
        generateWithGastiModelFallback({
          source: 'test',
          generate: async (modelId) => {
            attempts.push(modelId);
            throw new Error('validation failed');
          },
        }),
      /validation failed/,
    );

    assert.deepEqual(attempts, ['gemini-primary']);
  } finally {
    if (previousChain === undefined) {
      delete process.env.GASTI_AI_MODEL_FALLBACK_CHAIN;
    } else {
      process.env.GASTI_AI_MODEL_FALLBACK_CHAIN = previousChain;
    }
  }
});

test('generateWithGastiModelFallback throws GastiModelFallbackExhaustedError after all quota failures', async () => {
  const previousChain = process.env.GASTI_AI_MODEL_FALLBACK_CHAIN;
  process.env.GASTI_AI_MODEL_FALLBACK_CHAIN = 'gemini-primary,gemini-secondary';

  try {
    await assert.rejects(
      () =>
        generateWithGastiModelFallback({
          source: 'test',
          generate: async () => {
            throw new Error('rate limit hit');
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof GastiModelFallbackExhaustedError);
        assert.deepEqual(error.models, ['gemini-primary', 'gemini-secondary']);
        return true;
      },
    );
  } finally {
    if (previousChain === undefined) {
      delete process.env.GASTI_AI_MODEL_FALLBACK_CHAIN;
    } else {
      process.env.GASTI_AI_MODEL_FALLBACK_CHAIN = previousChain;
    }
  }
});
