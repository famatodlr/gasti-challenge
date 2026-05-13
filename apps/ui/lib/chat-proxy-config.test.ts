import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CHAT_API_URL, getBackendChatUrl, getBackendStreamUrl } from '../app/api/chat/shared';

const ENV_KEYS = ['GASTI_CHAT_API_URL', 'GASTI_CHAT_STREAM_API_URL'] as const;

function withCleanProxyEnv(run: () => void): void {
  const snapshot = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
    (typeof ENV_KEYS)[number],
    string | undefined
  >;

  for (const key of ENV_KEYS) {
    delete process.env[key];
  }

  try {
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = snapshot[key];

      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('UI chat proxy defaults to the local API on port 7311', () => {
  withCleanProxyEnv(() => {
    assert.equal(DEFAULT_CHAT_API_URL, 'http://localhost:7311/chat');
    assert.equal(getBackendChatUrl(), 'http://localhost:7311/chat');
    assert.equal(getBackendStreamUrl(), 'http://localhost:7311/chat/stream');
  });
});

test('UI chat proxy keeps explicit backend URL overrides', () => {
  withCleanProxyEnv(() => {
    process.env.GASTI_CHAT_API_URL = 'http://localhost:7777/chat';
    process.env.GASTI_CHAT_STREAM_API_URL = 'http://localhost:7777/custom-stream';

    assert.equal(getBackendChatUrl(), 'http://localhost:7777/chat');
    assert.equal(getBackendStreamUrl(), 'http://localhost:7777/custom-stream');
  });
});
