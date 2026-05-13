import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDeterministicGreetingAnswer,
  runGreetingFinancialSnapshotWorkflow,
} from './greeting-workflow.ts';
import { isGreetingFinancialSnapshotIntent } from './routing.ts';

const deterministicAnswerGenerator = async ({
  snapshot,
}: Parameters<typeof buildDeterministicGreetingAnswer>[0]) => buildDeterministicGreetingAnswer({ snapshot });

function countLikelyEmoji(value: string): number {
  return Array.from(value).filter((character) => /\p{Extended_Pictographic}/u.test(character)).length;
}

test('greeting workflow detects simple greeting intent', () => {
  assert.equal(isGreetingFinancialSnapshotIntent('Hola'), true);
  assert.equal(isGreetingFinancialSnapshotIntent('Buenas'), true);
  assert.equal(isGreetingFinancialSnapshotIntent('Qué onda'), true);
});

test('greeting workflow does not trigger when the greeting includes a finance question', () => {
  assert.equal(isGreetingFinancialSnapshotIntent('Hola, comparame abril contra mayo'), false);
});

test('greeting workflow produces a short snapshot with at most two insights and one emoji', async () => {
  const result = await runGreetingFinancialSnapshotWorkflow(
    { message: 'Hola', currentDate: '2026-05-13' },
    { answerGenerator: deterministicAnswerGenerator },
  );

  assert.equal(result.snapshot.enoughData, true);
  assert.ok(result.snapshot.insights.length <= 2);
  assert.ok(result.answer.length < 420);
  assert.ok(countLikelyEmoji(result.answer) <= 1);
  assert.match(result.answer, /^Hola Franco/);
});

test('greeting workflow falls back gracefully when there is not enough data', async () => {
  const result = await runGreetingFinancialSnapshotWorkflow(
    { message: 'Buen día', currentDate: '2026-06-03' },
    { answerGenerator: deterministicAnswerGenerator },
  );

  assert.equal(result.snapshot.enoughData, false);
  assert.equal(result.snapshot.insights.length, 0);
  assert.match(result.answer, /Todavía no veo suficiente movimiento este mes/);
});

test('greeting workflow appends fallback activity label when narrator retries model', async () => {
  const result = await runGreetingFinancialSnapshotWorkflow(
    { message: 'Hola', currentDate: '2026-05-13' },
    {
      answerGenerator: async ({ onActivityLabel }) => {
        onActivityLabel?.('Reintentando con otro modelo');
        return 'Hola Franco 👋';
      },
    },
  );

  assert.equal(result.answer, 'Hola Franco 👋');
  assert.deepEqual(result.activityLabels.at(-1), 'Reintentando con otro modelo');
});
