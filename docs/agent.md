# Gasti Agent Notes

Este documento resume la parte técnica principal del asistente para acompañar la entrega. No intenta reemplazar el código ni las specs internas; apunta a explicar qué primitivas de Mastra se usaron, por qué, y cuáles son los límites actuales del sistema.

## Qué usa de Mastra y por qué

### Agent

Gasti usa un agente principal, `gastiFinanceAgent`, como punto de entrada para preguntas financieras generales. La idea fue aprovechar la selección de tools y el runtime de Mastra en lugar de armar un loop manual de tool calling.

Esto permitió:

- mantener un flujo idiomático del framework
- centralizar instrucciones y grounding del agente
- separar cálculo determinístico de redacción final

### Tools con schemas

Las capacidades de negocio están expuestas como tools con schemas estrictos. Esa decisión apunta a que los cálculos importantes no dependan del modelo:

- totales y desgloses
- comparaciones de períodos
- detección de recurrencias
- proyección de fin de mes
- búsqueda de transacciones puntuales
- lectura y escritura de memoria financiera estructurada

El modelo interpreta la intención, decide cuándo usar cada tool y redacta la respuesta, pero no hace los cálculos financieros por su cuenta.

### Workflows

Además del agente general, el proyecto registra dos workflows de Mastra:

- `monthlyFinancialReviewWorkflow`: para requests de resumen o review mensual.
- `greetingFinancialSnapshotWorkflow`: para saludos simples con snapshot corto.

La intención no fue “agregar workflows porque sí”, sino usarlos solo donde había una orquestación claramente repetible y más estructurada que una conversación abierta.

### Memory

Mastra Memory se usa para continuidad conversacional por `resourceId` y `threadId`. Eso resuelve bien el caso de seguir una conversación sin reenviar todo el historial desde la UI.

También se agregó una capa separada de memoria financiera estructurada, pero esa parte no depende de Mastra Memory sino de un JSON propio del proyecto. La separación fue deliberada para no mezclar historial conversacional con hechos financieros persistentes del demo user.

## Tools registradas

- `getFinanceContext`: expone rango disponible, meses con datos y fecha de referencia del demo.
- `getFinancialMemory`: devuelve el contexto financiero explícito guardado para el usuario demo.
- `updateFinancialMemory`: persiste hechos financieros confirmados o expresados por el usuario demo.
- `spendingSummaryTool`: calcula gasto total, desgloses y drivers principales.
- `comparePeriodsTool`: compara dos períodos con delta y caveats.
- `detectRecurringExpensesTool`: detecta gastos recurrentes y suscripciones.
- `forecastMonthEndSpendTool`: proyecta gasto de cierre de mes con supuestos explícitos.
- `findTransactionsTool`: devuelve evidencia concreta cuando el usuario pide detalle.

## Modelo de memoria

Hay dos capas distintas:

### Memoria conversacional

- Implementada con Mastra Memory.
- Persistida localmente en `apps/ai/.mastra/memory.db`.
- Organizada por `resourceId` y `threadId`.
- Sirve para continuidad del chat, no para guardar facts financieros estructurados.

### Memoria financiera

- Implementada como estado estructurado propio.
- Persistida en `data/financial-memory.json`.
- Reseedeable desde `data/financial-memory.seed.json`.
- Guarda solo contexto financiero explícito y estable del usuario demo.

La regla conceptual es simple: conversación y facts financieros no viven en la misma capa.

## Decisiones técnicas relevantes

- Cálculo financiero determinístico: el dominio y las tools producen los números; el modelo los interpreta.
- Dataset local mock: evita dependencias externas y mantiene la demo reproducible.
- Single demo user: se priorizó claridad de demo por sobre infraestructura multiusuario.
- Sanitización de memoria conversacional: se filtran tool payloads y datos que no deberían terminar como memoria implícita.
- Fallback de modelo: la API contempla fallback frente a errores de cuota del provider.

## Límites actuales

- No hay integración con bancos ni datos reales.
- No hay multiusuario real.
- No hay dashboards ni capa visual analítica dedicada.
- No hay semantic recall ni RAG entre conversaciones.
- La memoria financiera guarda hechos explícitos del demo user, no inferencias automáticas abiertas.

## Cómo leer el proyecto

Si querés un recorrido corto:

1. Leer [README.md](/Users/franco/Documentos/gasti-challenge/README.md) para setup y framing general.
2. Leer [docs/demo-memory.md](/Users/franco/Documentos/gasti-challenge/docs/demo-memory.md) para entender la demo y el reset.
3. Ir al código del agente y tools si querés ver la implementación exacta.

Los archivos [docs/tools.md](/Users/franco/Documentos/gasti-challenge/docs/tools.md), [docs/product.md](/Users/franco/Documentos/gasti-challenge/docs/product.md) y [docs/data.md](/Users/franco/Documentos/gasti-challenge/docs/data.md) quedan como contexto interno de apoyo y no son necesarios para evaluar el entregable.
