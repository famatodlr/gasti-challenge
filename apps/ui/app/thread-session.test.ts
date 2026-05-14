import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNewChatSessionState,
  createInitialChatMessages,
} from './thread-session';

test('buildNewChatSessionState rotates the active thread and clears visible chat state', () => {
  const nextThreadId = 'thread-nuevo-demo';
  const state = buildNewChatSessionState(nextThreadId);

  assert.equal(state.threadId, nextThreadId);
  assert.deepEqual(state.messages, createInitialChatMessages());
  assert.deepEqual(state.latestActivity, []);
  assert.equal(state.input, '');
  assert.equal(state.error, null);
});

test('buildNewChatSessionState does not carry over prior visible messages or activity', () => {
  const previousVisibleState = {
    threadId: 'thread-viejo',
    messages: [
      ...createInitialChatMessages(),
      { id: 'user-1', role: 'user' as const, content: 'Historial previo visible.' },
    ],
    latestActivity: [{ type: 'status' as const, label: 'Procesando' }],
    input: 'borrador',
    error: 'fallo previo',
  };

  const state = buildNewChatSessionState('thread-limpio');

  assert.notDeepEqual(state.messages, previousVisibleState.messages);
  assert.notDeepEqual(state.latestActivity, previousVisibleState.latestActivity);
  assert.notEqual(state.input, previousVisibleState.input);
  assert.notEqual(state.error, previousVisibleState.error);
});
