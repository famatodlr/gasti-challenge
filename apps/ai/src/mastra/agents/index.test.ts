import test from 'node:test';
import assert from 'node:assert/strict';
import { MockStore } from '@mastra/core/storage';

import {
  DEMO_RESOURCE_ID,
  LOCAL_DEMO_DEFAULT_THREAD_ID,
  SanitizedGastiMemory,
  gastiConversationMemory,
  memoryDatabasePath,
  sanitizeMastraMemoryMessagesForGasti,
} from './conversation-memory.ts';
import { financeTools, gastiFinanceAgent } from './index.ts';

test('finance tools include getFinanceContext for the Gasti finance agent', () => {
  assert.equal(financeTools.getFinanceContext.id, 'getFinanceContext');
});

test('finance tools include getFinancialMemory for the Gasti finance agent', () => {
  assert.equal(financeTools.getFinancialMemory.id, 'getFinancialMemory');
});

test('finance tools include updateFinancialMemory for the Gasti finance agent', () => {
  assert.equal(financeTools.updateFinancialMemory.id, 'updateFinancialMemory');
});

test('gastiFinanceAgent registers getFinanceContext as an available tool', () => {
  const registeredTools = (gastiFinanceAgent as unknown as { tools?: Record<string, unknown> }).tools;

  assert.ok(registeredTools);
  assert.ok(registeredTools.getFinanceContext);
});

test('gastiFinanceAgent registers getFinancialMemory as an available tool', () => {
  const registeredTools = (gastiFinanceAgent as unknown as { tools?: Record<string, unknown> }).tools;

  assert.ok(registeredTools);
  assert.ok(registeredTools.getFinancialMemory);
});

test('gastiFinanceAgent registers updateFinancialMemory as an available tool', () => {
  const registeredTools = (gastiFinanceAgent as unknown as { tools?: Record<string, unknown> }).tools;

  assert.ok(registeredTools);
  assert.ok(registeredTools.updateFinancialMemory);
});

test('gastiFinanceAgent has persistent conversation memory configured', () => {
  assert.equal(DEMO_RESOURCE_ID, 'demo-user');
  assert.equal(LOCAL_DEMO_DEFAULT_THREAD_ID, 'demo-thread');
  assert.equal(gastiFinanceAgent.getMemory(), gastiConversationMemory);
});

test('conversation memory database path is independent of process cwd', () => {
  const originalCwd = process.cwd();

  try {
    process.chdir('/tmp');

    assert.equal(memoryDatabasePath.endsWith('/apps/ai/.mastra/memory.db'), true);
    assert.equal(memoryDatabasePath.includes(process.cwd()), false);
  } finally {
    process.chdir(originalCwd);
  }
});

test('conversation memory sanitizer preserves text while removing tool results and raw transactions', () => {
  const [sanitized] = sanitizeMastraMemoryMessagesForGasti([
    {
      id: 'assistant-with-tool-result',
      role: 'assistant',
      createdAt: new Date('2026-05-13T12:00:00.000Z'),
      threadId: 'thread-1',
      resourceId: 'demo-user',
      content: {
        format: 2,
        content: 'Gastaste ARS 12.000 en delivery.',
        parts: [
          { type: 'step-start' },
          { type: 'text', text: 'Gastaste ARS 12.000 en delivery.' },
          {
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              toolName: 'findTransactionsTool',
              toolCallId: 'call-1',
              args: { merchant: 'Rappi' },
              result: {
                transactions: [{ id: 'txn_001', merchant: 'Rappi', amount: 12000 }],
              },
            },
          },
        ],
        toolInvocations: [
          {
            state: 'result',
            toolName: 'findTransactionsTool',
            toolCallId: 'call-1',
            args: { merchant: 'Rappi' },
            result: {
              transactions: [{ id: 'txn_001', merchant: 'Rappi', amount: 12000 }],
            },
          },
        ],
        reasoning: 'private chain',
        experimental_attachments: [{ url: 'file:///tmp/statement.csv', contentType: 'text/csv' }],
      },
      type: 'v2',
    },
  ]);

  const serialized = JSON.stringify(sanitized);

  assert.match(serialized, /Gastaste ARS 12\.000 en delivery/);
  assert.equal(serialized.includes('tool-invocation'), false);
  assert.equal(serialized.includes('toolInvocations'), false);
  assert.equal(serialized.includes('transactions'), false);
  assert.equal(serialized.includes('txn_001'), false);
  assert.equal(serialized.includes('Rappi'), false);
  assert.equal(serialized.includes('private chain'), false);
  assert.equal(serialized.includes('statement.csv'), false);
});

test('SanitizedGastiMemory persists sanitized messages to storage', async () => {
  const memory = new SanitizedGastiMemory({ storage: new MockStore() });

  const savedMessages = await memory.saveMessages({
    format: 'v2',
    messages: [
      {
        id: 'assistant-with-persisted-tool-result',
        role: 'assistant',
        createdAt: new Date('2026-05-13T12:00:00.000Z'),
        threadId: 'thread-1',
        resourceId: 'demo-user',
        content: {
          format: 2,
          parts: [
            { type: 'text', text: 'La compra aparece como [redacted-transaction-id].' },
            {
              type: 'tool-invocation',
              toolInvocation: {
                state: 'result',
                toolName: 'findTransactionsTool',
                toolCallId: 'call-1',
                args: {},
                result: {
                  transactions: [{ id: 'txn_999', merchant: 'Rappi' }],
                },
              },
            },
          ],
        },
        type: 'v2',
      },
    ],
  });

  const serialized = JSON.stringify(savedMessages);

  assert.match(serialized, /La compra aparece/);
  assert.equal(serialized.includes('tool-invocation'), false);
  assert.equal(serialized.includes('transactions'), false);
  assert.equal(serialized.includes('txn_999'), false);
  assert.equal(serialized.includes('Rappi'), false);
});
