import test from 'node:test';
import assert from 'node:assert/strict';

import { getGastiModelId, getGeminiApiKey } from './model.ts';

test('getGastiModelId defaults to Gemini 2.5 Flash for development', () => {
  assert.equal(getGastiModelId({ NODE_ENV: 'development' }), 'gemini-2.5-flash');
});

test('getGastiModelId uses Gemini 2.5 Pro in production', () => {
  assert.equal(getGastiModelId({ NODE_ENV: 'production' }), 'gemini-2.5-pro');
});

test('getGastiModelId allows an explicit model override', () => {
  assert.equal(
    getGastiModelId({ NODE_ENV: 'production', GASTI_AI_MODEL: 'gemini-custom-dev' }),
    'gemini-custom-dev',
  );
});

test('getGeminiApiKey reads and trims GEMINI_API_KEY', () => {
  assert.equal(getGeminiApiKey({ GEMINI_API_KEY: '  test-gemini-key  ' }), 'test-gemini-key');
});

test('getGeminiApiKey ignores provider-specific legacy key names', () => {
  const legacyGoogleKey = ['GOOGLE', 'GENERATIVE', 'AI', 'API', 'KEY'].join('_');

  assert.equal(getGeminiApiKey({ [legacyGoogleKey]: 'legacy-google-key' }), '');
});
