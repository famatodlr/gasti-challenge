import test from 'node:test';
import assert from 'node:assert/strict';
import { MockStore } from '@mastra/core/storage';
import { DEMO_DEFAULT_MEMORY_THREAD_ID, DEMO_USER_RESOURCE_ID } from '../domain/demo-context.ts';

import {
  SanitizedGastiMemory,
  gastiConversationMemory,
  memoryDatabasePath,
  sanitizeMastraMemoryMessagesForGasti,
} from './conversation-memory.ts';
import {
  GASTI_AGENT_INSTRUCTIONS,
  buildGastiFinanceGroundingAddendum,
  financeTools,
  gastiFinanceAgent,
  prepareGastiFinanceAgentMessages,
} from './index.ts';
import { buildFinanceGroundingPolicy } from './finance-grounding-policy.ts';

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
  assert.equal(DEMO_USER_RESOURCE_ID, 'demo-user');
  assert.equal(DEMO_DEFAULT_MEMORY_THREAD_ID, 'demo-thread');
  assert.equal(gastiFinanceAgent.getMemory(), gastiConversationMemory);
});

test('Gasti agent instructions include plain Markdown fallback formatting guidance', () => {
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Plain Markdown fallback formatting:/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /short paragraphs with blank lines/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Markdown bullets/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Never put multiple financial rows inline/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /render them as bullets/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Use emojis sparingly/i);
});

test('Gasti agent instructions include tone and emoji guidance', () => {
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Tone and style:/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Emojis are allowed/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /optional visual cues/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Do not use emojis in every bullet/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Do not let emojis replace precise financial facts/i);
});

test('Gasti agent instructions guide savings-goal answers', () => {
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Savings goals:/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /quiero ahorrar/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /quiero guardar/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /quiero juntar/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /1M/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /para Japón/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /mention the target amount clearly/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Connect spending analysis back to the goal only when supported by tools or memory/i);
});

test('Gasti agent instructions guide grounding and follow-up behavior', () => {
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Evidence and grounding:/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Current-turn finance tool results are the source of truth/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Prompt examples, docs, previous assistant text, and general model knowledge are never evidence/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /latest matching available month when unambiguous/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /ask for clarification/i);
});

test('Gasti agent instructions mention partial-period and comparison-basis handling', () => {
  assert.match(GASTI_AGENT_INSTRUCTIONS, /periodMeta/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /month-to-date|partial period/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /comparisonBasis/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /sameLength/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /avoid implying a full like-for-like month comparison/i);
});

test('Gasti agent instructions define the structured response contract', () => {
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Structured response contract:/);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /GastiStructuredResponse/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /kind.*required/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /summary.*required/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Do not return arbitrary Markdown when structured output is requested/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Use caveats for partial periods/i);
  assert.match(GASTI_AGENT_INSTRUCTIONS, /Only include suggestedQuestion/i);
});

test('grounding addendum requires finance context for dataset availability questions', () => {
  const policy = buildFinanceGroundingPolicy('Que transacciones tenes registradas?');
  const addendum = buildGastiFinanceGroundingAddendum(policy);

  assert.ok(addendum);
  assert.match(addendum, /getFinanceContext/);
  assert.match(addendum, /current-turn evidence/i);
  assert.match(addendum, /coverage ranges/i);
});

test('grounding addendum includes acceptable merchant tools and bare-month warning', () => {
  const policy = buildFinanceGroundingPolicy('Cuánto gasté en Netflix en mayo?');
  const addendum = buildGastiFinanceGroundingAddendum(policy);

  assert.ok(addendum);
  assert.match(addendum, /findTransactionsTool/);
  assert.match(addendum, /getFinanceContext/);
  assert.match(addendum, /month without a year/i);
});

test('prepareGastiFinanceAgentMessages leaves greetings unchanged', () => {
  const prepared = prepareGastiFinanceAgentMessages('Hola');

  assert.equal(prepared.messages, 'Hola');
  assert.equal(prepared.policy.questionType, 'non_finance');
});

test('prepareGastiFinanceAgentMessages augments the last user message for finance grounding', () => {
  const prepared = prepareGastiFinanceAgentMessages([
    { role: 'assistant', content: 'Hola' },
    { role: 'user', content: 'Cuánto gasté en Netflix en mayo?' },
  ]);

  assert.ok(Array.isArray(prepared.messages));
  assert.equal(prepared.messages.at(-1)?.role, 'user');
  assert.match(prepared.messages.at(-1)?.content ?? '', /Cuánto gasté en Netflix en mayo\?/);
  assert.match(prepared.messages.at(-1)?.content ?? '', /acceptable finance tools/i);
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
