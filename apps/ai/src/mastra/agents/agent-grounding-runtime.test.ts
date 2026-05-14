import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateGastiFinanceAgent,
  streamGastiFinanceAgent,
  type GastiFinanceAgentMessage,
  gastiFinanceAgent,
} from './index.ts';

test('generate path injects grounding addendum for dataset availability questions and logs safe policy metadata', async () => {
  const originalGenerate = gastiFinanceAgent.generate.bind(gastiFinanceAgent);
  const originalInfo = console.info;
  const capturedLogs: unknown[] = [];

  try {
    let capturedMessages: string | GastiFinanceAgentMessage[] | undefined;

    console.info = (...args: unknown[]) => {
      capturedLogs.push(args);
    };

    (gastiFinanceAgent.generate as typeof gastiFinanceAgent.generate) = (async (messages, options) => {
      capturedMessages = messages as string | GastiFinanceAgentMessage[];
      assert.equal(options?.maxSteps, 1);

      return { text: 'ok' };
    }) as typeof gastiFinanceAgent.generate;

    await generateGastiFinanceAgent('Que transacciones tenes registradas?', { disableMemory: true, maxSteps: 1 });

    assert.ok(Array.isArray(capturedMessages));
    assert.equal(capturedMessages?.at(0)?.role, 'user');
    assert.match(capturedMessages?.at(0)?.content ?? '', /Que transacciones tenes registradas\?/);
    assert.match(capturedMessages?.at(0)?.content ?? '', /getFinanceContext/);
    assert.match(capturedMessages?.at(0)?.content ?? '', /current-turn evidence/i);
    assert.match(capturedMessages?.at(0)?.content ?? '', /do not mention coverage ranges/i);

    const serializedLogs = JSON.stringify(capturedLogs);
    assert.match(serializedLogs, /dataset_availability/);
    assert.match(serializedLogs, /getFinanceContext/);
    assert.equal(serializedLogs.includes('Que transacciones tenes registradas?'), false);
  } finally {
    gastiFinanceAgent.generate = originalGenerate;
    console.info = originalInfo;
  }
});

test('stream path injects grounding addendum for merchant spend questions', async () => {
  const originalStream = gastiFinanceAgent.stream.bind(gastiFinanceAgent);
  const originalInfo = console.info;

  try {
    let capturedMessages: string | GastiFinanceAgentMessage[] | undefined;

    console.info = () => {};

    (gastiFinanceAgent.stream as typeof gastiFinanceAgent.stream) = (async (messages, options) => {
      capturedMessages = messages as string | GastiFinanceAgentMessage[];
      assert.equal(options?.toolCallStreaming, true);

      return {
        fullStream: (async function* () {
          yield { type: 'text-delta', textDelta: 'ok' };
        })(),
      };
    }) as typeof gastiFinanceAgent.stream;

    await streamGastiFinanceAgent('Cuánto gasté en Netflix en mayo?', { disableMemory: true, maxSteps: 1 });

    assert.ok(Array.isArray(capturedMessages));
    assert.match(capturedMessages?.at(0)?.content ?? '', /findTransactionsTool/);
    assert.match(capturedMessages?.at(0)?.content ?? '', /getFinanceContext/);
    assert.match(capturedMessages?.at(0)?.content ?? '', /month without a year/i);
  } finally {
    gastiFinanceAgent.stream = originalStream;
    console.info = originalInfo;
  }
});

test('non-finance greetings do not inject a grounding addendum', async () => {
  const originalGenerate = gastiFinanceAgent.generate.bind(gastiFinanceAgent);
  const originalInfo = console.info;

  try {
    let capturedMessages: string | GastiFinanceAgentMessage[] | undefined;

    console.info = () => {};

    (gastiFinanceAgent.generate as typeof gastiFinanceAgent.generate) = (async (messages) => {
      capturedMessages = messages as string | GastiFinanceAgentMessage[];
      return { text: 'hola' };
    }) as typeof gastiFinanceAgent.generate;

    await generateGastiFinanceAgent('Hola', { disableMemory: true, maxSteps: 1 });

    assert.equal(capturedMessages, 'Hola');
  } finally {
    gastiFinanceAgent.generate = originalGenerate;
    console.info = originalInfo;
  }
});
