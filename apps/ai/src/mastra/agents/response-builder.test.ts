import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGastiResponseMarkdown,
  buildSafeGastiResponseFallback,
  normalizeGastiStructuredResponse,
} from './response-builder.ts';

test('renders a short answer with only summary', () => {
  const response = normalizeGastiStructuredResponse({
    kind: 'short_answer',
    summary: 'Sí. Conviene comparar mayo contra abril hasta el mismo día.',
  });

  assert.ok(response);
  assert.equal(
    buildGastiResponseMarkdown(response),
    'Sí. Conviene comparar mayo contra abril hasta el mismo día.',
  );
});

test('renders a comparison with headline, summary, bullets, and caveats', () => {
  const response = normalizeGastiStructuredResponse({
    kind: 'comparison',
    headline: 'Mayo viene más alto que abril',
    summary: 'Hasta el 13/05 gastaste **ARS 499.698**. La comparación usa abril hasta el mismo día.',
    bullets: [
      'Delivery fue el principal driver de la suba.',
      'Salud también aumentó.',
      'Transporte se mantuvo relativamente estable.',
    ],
    caveats: ['Mayo todavía está incompleto.'],
  });

  assert.ok(response);
  assert.equal(
    buildGastiResponseMarkdown(response),
    [
      '### Mayo viene más alto que abril',
      '',
      'Hasta el 13/05 gastaste **ARS 499.698**. La comparación usa abril hasta el mismo día.',
      '',
      '- Delivery fue el principal driver de la suba.',
      '- Salud también aumentó.',
      '- Transporte se mantuvo relativamente estable.',
      '',
      '_Nota: Mayo todavía está incompleto._',
    ].join('\n'),
  );
});

test('renders a greeting with summary and bullets', () => {
  const response = normalizeGastiStructuredResponse({
    kind: 'greeting',
    summary: '¡Buenas! Mayo viene un poco más alto que tu ritmo habitual.',
    bullets: [
      'Delivery está empujando la suba.',
      'Todavía estás a tiempo de ajustar el resto del mes.',
    ],
  });

  assert.ok(response);
  assert.equal(
    buildGastiResponseMarkdown(response),
    [
      '¡Buenas! Mayo viene un poco más alto que tu ritmo habitual.',
      '',
      '- Delivery está empujando la suba.',
      '- Todavía estás a tiempo de ajustar el resto del mes.',
    ].join('\n'),
  );
});

test('trims whitespace and drops empty bullets and caveats', () => {
  const response = normalizeGastiStructuredResponse({
    kind: 'financial_insight',
    headline: '  Gasto en delivery  ',
    summary: '  Subió frente al período anterior.  ',
    bullets: ['  Rappi explicó la mayor parte. ', ' ', '\n'],
    caveats: ['  Mayo está incompleto. ', '', '   '],
  });

  assert.deepEqual(response, {
    kind: 'financial_insight',
    headline: 'Gasto en delivery',
    summary: 'Subió frente al período anterior.',
    bullets: ['Rappi explicó la mayor parte.'],
    caveats: ['Mayo está incompleto.'],
  });
});

test('does not render empty sections', () => {
  const response = normalizeGastiStructuredResponse({
    kind: 'breakdown',
    headline: 'Detalle',
    summary: 'Acá va el resumen.',
    bullets: [],
    caveats: [],
  });

  assert.ok(response);
  assert.equal(buildGastiResponseMarkdown(response), ['### Detalle', '', 'Acá va el resumen.'].join('\n'));
});

test('preserves more than three bullets', () => {
  const response = normalizeGastiStructuredResponse({
    kind: 'breakdown',
    summary: 'Resumen.',
    bullets: ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'],
  });

  assert.ok(response);
  const markdown = buildGastiResponseMarkdown(response);
  assert.match(markdown, /- Uno/);
  assert.match(markdown, /- Dos/);
  assert.match(markdown, /- Tres/);
  assert.match(markdown, /- Cuatro/);
  assert.match(markdown, /- Cinco/);
});

test('normalizes obvious inline bullet runs embedded in summary into a real list block', () => {
  const response = normalizeGastiStructuredResponse({
    kind: 'breakdown',
    summary:
      'En mayo de 2026, gastaste un total de **ARS 499.698**. Aquí tenés un resumen por categoría: * **Vivienda:** ARS 250.000 * **Salud:** ARS 83.900',
  });

  assert.ok(response);
  assert.equal(
    buildGastiResponseMarkdown(response),
    [
      'En mayo de 2026, gastaste un total de **ARS 499.698**. Aquí tenés un resumen por categoría:',
      '',
      '- **Vivienda:** ARS 250.000',
      '- **Salud:** ARS 83.900',
    ].join('\n'),
  );
});

test('splits a structured bullet containing multiple inline bullet markers into separate bullet lines', () => {
  const response = normalizeGastiStructuredResponse({
    kind: 'breakdown',
    summary: 'Tus transacciones más grandes fueron:',
    bullets: ['* **Propietario:** ARS 250.000 * **Galeno:** ARS 75.000'],
  });

  assert.ok(response);
  assert.equal(
    buildGastiResponseMarkdown(response),
    [
      'Tus transacciones más grandes fueron:',
      '',
      '- **Propietario:** ARS 250.000',
      '- **Galeno:** ARS 75.000',
    ].join('\n'),
  );
  assert.doesNotMatch(buildGastiResponseMarkdown(response), /\* \*\*Propietario/);
});

test('keeps plain prose with emphasis unchanged when there is no repeated inline list marker', () => {
  const response = normalizeGastiStructuredResponse({
    kind: 'short_answer',
    summary: 'Meta: **ARS 1.000.000**. Foco principal: vivienda.',
  });

  assert.ok(response);
  assert.equal(buildGastiResponseMarkdown(response), 'Meta: **ARS 1.000.000**. Foco principal: vivienda.');
});

test('fallback normalizes obvious inline bullet runs without rewriting a single emphasized row', () => {
  assert.equal(
    buildSafeGastiResponseFallback(
      'En mayo: * **Vivienda:** ARS 250.000 * **Salud:** ARS 83.900',
    ),
    ['En mayo:', '', '- **Vivienda:** ARS 250.000', '- **Salud:** ARS 83.900'].join('\n'),
  );

  assert.equal(
    buildSafeGastiResponseFallback('**Vivienda:** ARS 250.000'),
    '**Vivienda:** ARS 250.000',
  );
});

test('fallback normalizes line-start asterisk bullets to dash bullets', () => {
  assert.equal(
    buildSafeGastiResponseFallback(
      ['Tus principales gastos fueron:', '*   **Vivienda**: ARS 250.000', '*   **Salud**: ARS 83.900'].join('\n'),
    ),
    ['Tus principales gastos fueron:', '', '- **Vivienda**: ARS 250.000', '- **Salud**: ARS 83.900'].join('\n'),
  );
});

test('fallback normalizes line-start plus bullets to dash bullets', () => {
  assert.equal(
    buildSafeGastiResponseFallback(['Tus principales gastos fueron:', '+   Compras: ARS 45.000'].join('\n')),
    ['Tus principales gastos fueron:', '', '- Compras: ARS 45.000'].join('\n'),
  );
});

test('fallback keeps paragraph emphasis unchanged when normalizing line-start bullets', () => {
  assert.equal(
    buildSafeGastiResponseFallback('Esto es *importante* para entender el gasto.'),
    'Esto es *importante* para entender el gasto.',
  );
});

test('structured markdown output does not leave list lines starting with asterisk or plus markers', () => {
  const response = normalizeGastiStructuredResponse({
    kind: 'breakdown',
    summary: ['Tus principales gastos fueron:', '*   **Vivienda**: ARS 250.000', '+   **Compras**: ARS 45.000'].join(
      '\n',
    ),
  });

  assert.ok(response);
  const markdown = buildGastiResponseMarkdown(response);

  assert.equal(
    markdown,
    ['Tus principales gastos fueron:', '', '- **Vivienda**: ARS 250.000', '- **Compras**: ARS 45.000'].join('\n'),
  );
  assert.doesNotMatch(markdown, /^\*|\n\*|\n\+/m);
});

test('falls back safely for invalid structured content', () => {
  assert.equal(
    normalizeGastiStructuredResponse({
      kind: 'comparison',
      summary: '   ',
    }),
    null,
  );

  assert.equal(buildSafeGastiResponseFallback(), 'No pude armar una respuesta confiable con los datos disponibles.');
  assert.equal(
    buildSafeGastiResponseFallback('  Respuesta simple ya armada.  '),
    'Respuesta simple ya armada.',
  );
});
