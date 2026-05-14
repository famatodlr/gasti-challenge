import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import Page from '../app/page';

test('Page keeps chat-first shell with composer and secondary rail', () => {
  const html = renderToStaticMarkup(<Page />);
  assert.match(html, /Chat financiero/);
  assert.match(html, /Actividad/);
  assert.match(html, /Mensaje para Gasti/);
});
