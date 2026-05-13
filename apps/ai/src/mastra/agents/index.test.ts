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
import { GASTI_AGENT_INSTRUCTIONS, financeTools, gastiFinanceAgent } from './index.ts';

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

test('Gasti agent instructions include the conversational formatting contract', () => {
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Response formatting contract:/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /short paragraphs/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /blank lines between sections/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Markdown bullets using "- "/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Put a blank line before every Markdown bullet list/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Put each bullet on its own line/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Do not place bullets inline after a sentence/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Prefer bold labels inside bullets/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Put a blank line after every Markdown bullet list/i);
  assert.match(
    GASTI_AGENT_INSTRUCTIONS,
    /Any time the answer contains two or more financial rows/i,
  );
  assert.match(
    GASTI_AGENT_INSTRUCTIONS,
    /categories, drivers, merchants, expenses, recurring payments, period totals, or breakdown items/i,
  );
  assert.match(
    GASTI_AGENT_INSTRUCTIONS,
    /Before sending the final answer, check for consecutive financial rows or lines starting with \*\*Label:\*\*/i,
  );
  assert.match(
    GASTI_AGENT_INSTRUCTIONS,
    /rewrite each one as a Markdown bullet starting with "- "/i,
  );
  assert.match(
    GASTI_AGENT_INSTRUCTIONS,
    /Never leave bare bold-label rows in the final answer/i,
  );
  assert.match(GASTI_AGENT_INSTRUCTIONS, /A heading sentence before a list must be followed by a blank line/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /bold important months, periods, totals, and amounts/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Short factual answers may use no emoji/i);
  assert.match(
    GASTI_AGENT_INSTRUCTIONS,
    /Longer summaries, comparisons, projections, savings-goal answers, or insight-style responses may include 1-3 helpful emojis/i,
  );
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Use emojis sparingly/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Do not put an emoji in every bullet if the list is long/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /not be one dense paragraph/i);
});

test('Gasti agent instructions include category emoji guidance', () => {
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Category emojis:/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Vivienda \/ alquiler: 🏠/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Salud \/ prepaga \/ farmacia: 🏥/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Supermercado: 🛒/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Compras: 🛍️/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Servicios \/ luz \/ gas \/ internet: 💡/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Ahorro \/ objetivo: 🎯/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Japón: 🇯🇵/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Proyección: 📈/);
});

test('Gasti agent instructions guide savings-goal answers', () => {
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Savings goals:/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /quiero ahorrar/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /quiero guardar/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /quiero juntar/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /1M/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /para Japon/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /mention the target amount clearly/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /connect spending analysis back to the goal/i);
});

test('Gasti agent instructions guide period summaries and follow-ups', () => {
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Period summaries:/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /group results by month or period/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /show the total first/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /top 2-3 drivers/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /separate raw numbers from interpretation/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /one specific follow-up question/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /no generic disclaimers/i);
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
