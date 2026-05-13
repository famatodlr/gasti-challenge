import test from 'node:test';
import assert from 'node:assert/strict';

import { buildChatRequestPayload } from './app/chat-request';

test('buildChatRequestPayload sends only latest message with memory context', () => {
  const payload = buildChatRequestPayload('Hola, estoy evaluando mayo.', 'thread-mayo');

  assert.deepEqual(payload, {
    message: 'Hola, estoy evaluando mayo.',
    resourceId: 'demo-user',
    threadId: 'thread-mayo',
  });
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'messages'), false);
});

test('buildChatRequestPayload does not include visible chat history', () => {
  const visibleMessages = [
    { role: 'assistant', content: 'Mensaje de bienvenida.' },
    { role: 'user', content: 'Historial visible anterior.' },
  ];
  const payload = buildChatRequestPayload('Último mensaje.', 'thread-nuevo');

  assert.equal(JSON.stringify(payload).includes(visibleMessages[0].content), false);
  assert.equal(JSON.stringify(payload).includes(visibleMessages[1].content), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'messages'), false);
});
