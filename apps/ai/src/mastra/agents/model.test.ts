import test from 'node:test';
import assert from 'node:assert/strict';

import { getGastiModelFallbackChain, getGastiModelId, getGeminiApiKey } from './model.ts';

test('getGastiModelFallbackChain returns the default Gemini fallback chain', () => {
  assert.deepEqual(getGastiModelFallbackChain({}), [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash-lite',
  ]);
});

test('getGastiModelFallbackChain uses GASTI_AI_MODEL as a hard override', () => {
  assert.deepEqual(
    getGastiModelFallbackChain({
      GASTI_AI_MODEL: '  gemini-custom-dev  ',
      GASTI_AI_MODEL_FALLBACK_CHAIN: 'gemini-2.5-flash,gemini-2.5-pro',
    }),
    ['gemini-custom-dev'],
  );
});

test('getGastiModelFallbackChain parses comma-separated fallback models', () => {
  assert.deepEqual(
    getGastiModelFallbackChain({
      GASTI_AI_MODEL_FALLBACK_CHAIN: ' gemini-a, ,gemini-b ,, gemini-c ',
    }),
    ['gemini-a', 'gemini-b', 'gemini-c'],
  );
});

test('getGastiModelFallbackChain uses the default chain when the fallback env is blank', () => {
  assert.deepEqual(getGastiModelFallbackChain({ GASTI_AI_MODEL_FALLBACK_CHAIN: ' ,  , ' }), [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash-lite',
  ]);
});

test('getGastiModelId returns the first configured fallback model', () => {
  assert.equal(
    getGastiModelId({ GASTI_AI_MODEL_FALLBACK_CHAIN: 'gemini-first,gemini-second' }),
    'gemini-first',
  );
});

test('getGeminiApiKey reads and trims GEMINI_API_KEY', () => {
  assert.equal(getGeminiApiKey({ GEMINI_API_KEY: '  test-gemini-key  ' }), 'test-gemini-key');
});

test('getGeminiApiKey ignores provider-specific legacy key names', () => {
  const legacyGoogleKey = ['GOOGLE', 'GENERATIVE', 'AI', 'API', 'KEY'].join('_');

  assert.equal(getGeminiApiKey({ [legacyGoogleKey]: 'legacy-google-key' }), '');
});
