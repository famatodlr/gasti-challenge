import test from 'node:test';
import assert from 'node:assert/strict';

import { getApiPort } from './main-config.ts';

test('getApiPort defaults the local API to port 7311', () => {
  assert.equal(getApiPort({}), 7311);
});

test('getApiPort keeps explicit PORT overrides', () => {
  assert.equal(getApiPort({ PORT: '7001' }), 7001);
});
