# Demo Flow

Archivo temporal para preparar la demo final. No es parte obligatoria del entregable.

## Demo flow recomendado

### 1. Abrir con framing corto

- Mostrar la UI y explicar en una frase qué es Gasti:
  - asistente conversacional de finanzas personales sobre un dataset mock local en ARS
- Marcar que el foco está en chat, no en dashboards

### 2. Arrancar desde estado limpio

- Mencionar que antes de la demo corriste `bun run demo:reset-memory`
- Aclarar que eso limpia:
  - memoria conversacional persistida
  - memoria financiera demo editable

### 3. Mostrar una pregunta base fácil de seguir

Ejemplos:

- `Comparame mis gastos de mayo de 2026 contra abril de 2026`
- `Proyectá mi gasto total de mayo de 2026`

Objetivo:

- mostrar que responde con números concretos
- mostrar que no depende de prosa vaga del modelo

### 4. Mostrar una pregunta con valor de producto

Ejemplos:

- `Detectá mis gastos recurrentes entre abril y mayo de 2026`
- `Mostrame mis gastos por categoría en mayo de 2026`

Objetivo:

- hacer visible el tipo de insight que vuelve útil al asistente
- mostrar tools que tienen sentido para el dominio

### 5. Mostrar memoria demo sin enredar la historia

Secuencia sugerida:

1. Decir algo estable sobre el usuario demo, por ejemplo una preferencia o meta.
2. Hacer una pregunta de seguimiento dentro del mismo thread.
3. Explicar que hay dos capas:
   - continuidad conversacional por thread
   - memoria financiera estructurada del demo user

### 6. Cerrar con una lectura honesta del alcance

- Dataset mock local
- single demo user
- herramientas determinísticas para cálculo
- roadmap natural hacia multiusuario, recall más rico y capa visual futura

## Demo flow a evitar

- Evitar arrancar con una explicación larga de arquitectura antes de mostrar el producto.
- Evitar preguntas demasiado ambiguas si no aportan valor a la demo.
- Evitar secuencias que mezclen “nuevo chat”, reset por terminal y memoria financiera sin explicar la diferencia.
- Evitar vender como feature actual algo que hoy es roadmap, como multiusuario real o semantic recall.
- Evitar mostrar un caso extraño solo porque existe técnicamente si no ayuda a contar mejor la propuesta.
- Evitar una demo donde todo gira alrededor de internals de Mastra en vez de valor de producto.

## Recordatorio rápido

Si algo se siente confuso durante la demo, volver a este encuadre:

- chat-first
- tools determinísticas para números
- Mastra para agent, workflows y conversación
- memoria demo separada en conversación y facts financieros
