import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_DEMO_TIME_ZONE, getCurrentDateString } from './current-date.ts';

test('getCurrentDateString uses the configured demo timezone by default', () => {
  assert.equal(DEFAULT_DEMO_TIME_ZONE, 'America/Argentina/Buenos_Aires');
  assert.equal(
    getCurrentDateString({
      now: new Date('2026-05-14T02:30:00.000Z'),
    }),
    '2026-05-13',
  );
});

test('getCurrentDateString accepts an explicit timezone override', () => {
  assert.equal(
    getCurrentDateString({
      now: new Date('2026-05-14T02:30:00.000Z'),
      timeZone: 'UTC',
    }),
    '2026-05-14',
  );
});
