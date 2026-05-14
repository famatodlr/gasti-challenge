import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { ActivityRail, AssistantMessageCard, formatActivityTime } from './chat-ui';

test('AssistantMessageCard renders structured answerUi without markdown duplication', () => {
  const html = renderToStaticMarkup(
    <AssistantMessageCard
      content="## Fallback\n- Este bloque no debe verse cuando summary y bullets existen."
      answerUi={{ headline: 'Resumen', summary: 'Texto', bullets: ['Uno'], note: 'Ojo' }}
    />,
  );

  assert.match(html, /Resumen/);
  assert.match(html, /Texto/);
  assert.equal(html.includes('Fallback'), false);
});

test('AssistantMessageCard renders suggestion chip when question is inferred', () => {
  const html = renderToStaticMarkup(
    <AssistantMessageCard
      content="Cierre.\n¿Querés comparar contra abril?"
      onSuggestedQuestionClick={() => {}}
    />,
  );

  assert.match(html, /¿Querés comparar contra abril\?/);
  assert.match(html, /<button/);
});

test('ActivityRail renders states and empty state', () => {
  const empty = renderToStaticMarkup(<ActivityRail items={[]} isLoading={false} />);
  assert.match(empty, /La actividad aparecerá/);

  const filled = renderToStaticMarkup(
    <ActivityRail
      isLoading
      items={[
        { id: 'a', type: 'status', label: 'Activo', status: 'active' },
        { id: 'b', type: 'warning', label: 'Warn', status: 'warning' },
        { id: 'c', type: 'error', label: 'Err', status: 'error' },
        { id: 'd', type: 'tool_result', label: 'Ok', status: 'complete' },
      ]}
    />,
  );
  assert.match(filled, /Activo/);
  assert.match(filled, /Warn/);
  assert.match(filled, /Err/);
  assert.match(filled, /Ok/);
});

test('formatActivityTime is defensive for invalid values', () => {
  assert.equal(formatActivityTime(undefined), '');
  assert.equal(formatActivityTime('invalid'), '');
});
