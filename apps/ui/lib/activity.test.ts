import test from 'node:test';
import assert from 'node:assert/strict';

import { createActivityFeedItems, normalizeActivityEvent, normalizeActivityEvents } from './activity';

test('normalizeActivityEvent strips unsupported payload fields from safe events', () => {
  assert.deepEqual(
    normalizeActivityEvent({
      type: 'tool_call',
      label: 'Consultando herramienta',
      toolName: 'findTransactionsTool',
      timestamp: '2026-05-12T12:00:00.000Z',
      args: { merchant: 'Rappi' },
      providerMetadata: { secret: 'hidden' },
      reasoning: 'private reasoning',
    }),
    {
      type: 'tool_call',
      label: 'Consultando herramienta',
      toolName: 'findTransactionsTool',
      timestamp: '2026-05-12T12:00:00.000Z',
    },
  );
});

test('normalizeActivityEvents ignores unsupported and malformed events', () => {
  assert.deepEqual(
    normalizeActivityEvents([
      { type: 'status', label: 'Analizando consulta' },
      { type: 'source', label: 'https://example.test/private' },
      { type: 'tool_result', label: '' },
      null,
    ]),
    [{ type: 'status', label: 'Analizando consulta' }],
  );
});

test('createActivityFeedItems groups a tool call with its result', () => {
  assert.deepEqual(
    createActivityFeedItems([
      { type: 'status', label: 'Analizando consulta', timestamp: '2026-05-12T12:00:00.000Z' },
      {
        type: 'tool_call',
        label: 'Consultando herramienta',
        toolName: 'findTransactionsTool',
        timestamp: '2026-05-12T12:00:01.000Z',
      },
      {
        type: 'tool_result',
        label: 'Herramienta completada',
        toolName: 'findTransactionsTool',
        timestamp: '2026-05-12T12:00:02.000Z',
      },
    ]),
    [
      {
        id: 'status-0',
        label: 'Analizando consulta',
        status: 'complete',
        timestamp: '2026-05-12T12:00:00.000Z',
        type: 'status',
      },
      {
        id: 'tool-findTransactionsTool-1',
        label: 'Herramienta completada',
        detail: 'findTransactionsTool',
        status: 'complete',
        timestamp: '2026-05-12T12:00:02.000Z',
        type: 'tool_result',
      },
    ],
  );
});

test('createActivityFeedItems deduplicates repeated pending tool calls', () => {
  assert.deepEqual(
    createActivityFeedItems([
      { type: 'tool_call', label: 'Consultando herramienta', toolName: 'spendingSummaryTool' },
      { type: 'tool_call', label: 'Consultando herramienta', toolName: 'spendingSummaryTool' },
    ]),
    [
      {
        id: 'tool-spendingSummaryTool-0',
        label: 'Consultando herramienta',
        detail: 'spendingSummaryTool',
        status: 'active',
        type: 'tool_call',
      },
    ],
  );
});

test('createActivityFeedItems preserves warning, error, and final answer states', () => {
  assert.deepEqual(
    createActivityFeedItems([
      { type: 'warning', label: 'Reintentando con otro modelo' },
      { type: 'error', label: 'No pude generar una respuesta.' },
      { type: 'final_answer', label: 'Respuesta final generada', answer: 'No se muestra en actividad.' },
    ]),
    [
      {
        id: 'warning-0',
        label: 'Reintentando con otro modelo',
        status: 'warning',
        type: 'warning',
      },
      {
        id: 'error-1',
        label: 'No pude generar una respuesta.',
        status: 'error',
        type: 'error',
      },
      {
        id: 'final_answer-2',
        label: 'Respuesta final generada',
        status: 'complete',
        type: 'final_answer',
      },
    ],
  );
});

test('createActivityFeedItems uses the compact generating response label', () => {
  assert.deepEqual(
    createActivityFeedItems([{ type: 'status', label: 'Generando respuesta final' }]),
    [
      {
        id: 'status-0',
        label: 'Generando respuesta',
        status: 'active',
        type: 'status',
      },
    ],
  );
});
