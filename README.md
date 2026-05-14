# Gasti

Gasti es un asistente conversacional de finanzas personales pensado para explorar gastos cotidianos en ARS desde chat. El foco del challenge fue construir una experiencia conversacional útil y explicable sobre un dataset mock local, usando Mastra de forma idiomática para tools, workflows y memoria.

## Qué incluye

- Chat sobre gastos, comparaciones, recurrencias y proyección de cierre de mes.
- Datos mock locales en ARS.
- Continuidad conversacional por thread con Mastra Memory local.
- Memoria financiera estructurada para recordar contexto explícito del usuario demo, con reset a estado vacío para la demo.

## Stack

- Bun workspaces + Turborepo
- Next.js / React
- NestJS
- Mastra
- Google Gemini vía AI SDK

## Correr localmente

Prerequisitos:

- Bun
- `GEMINI_API_KEY`

Configurar variables de entorno (archivo unico en la raiz):

```bash
cp .env.example .env
```

Editar `.env` y completar:

```bash
GEMINI_API_KEY=your-google-ai-studio-key
```

No commitear claves reales.

Instalar dependencias:

```bash
bun install
```

Levantar el proyecto:

```bash
bun run dev
```

Puertos esperados:

- UI: `http://localhost:7310`
- API: `http://localhost:7311`

Si necesitás correr servicios por separado:

```bash
bun run dev:ai
bun run dev:api
bun run dev:ui
```

## Demo memory y reset

Antes de una demo conviene resetear la memoria del usuario demo:

```bash
bun run demo:reset-memory
```

Detalles de qué persiste, qué resetea cada comando y el flujo recomendado están en [docs/demo-memory.md](/Users/franco/Documentos/gasti-challenge/docs/demo-memory.md).

## Tools del agente y por qué

- `spendingSummaryTool`: resuelve preguntas base como cuánto gasté y en qué se fue la plata.
- `comparePeriodsTool`: permite comparar meses o períodos sin depender de cálculo del modelo.
- `detectRecurringExpensesTool`: hace visible el tipo de hallazgo que más valor aporta en finanzas personales conversacionales.
- `forecastMonthEndSpendTool`: cubre la pregunta natural de “a este ritmo cómo cierro el mes”.
- `findTransactionsTool`: baja la respuesta a evidencia concreta cuando el usuario pide detalle.
- `getFinanceContext`: ancla fechas disponibles y evita inventar cobertura del dataset.
- `getFinancialMemory` y `updateFinancialMemory`: separan claramente continuidad conversacional de contexto financiero explícito del usuario demo.

Más detalle técnico sobre Mastra, workflows y memoria en [docs/agent.md](/Users/franco/Documentos/gasti-challenge/docs/agent.md).

## Decisiones de producto

- Conversacional first: el chat es la interfaz principal, no un dashboard con chat al costado.
- Determinismo para cálculos: totales, comparaciones, recurrencias y proyecciones viven en tools y dominio, no en el modelo.
- Single demo user: el alcance quedó deliberadamente acotado para priorizar una demo clara.
- Memoria separada en dos capas: conversación por thread con Mastra y memoria financiera estructurada para hechos estables del usuario.
- Tono local: respuestas orientadas a ARS, merchants argentinos y lenguaje cotidiano.

## Validación
Desde la raíz, para verificar que el proyecto compila:

```bash
bun run build
```

Para correr toda la suite de tests:

```
bun run test
```

También se pueden correr las validaciones por módulo:

```
bun run test:ai
bun run test:api
bun run test:ui
```

Si los tests de memoria fallan por datos persistidos de una demo anterior, se puede resetear la memoria demo con:

bun run demo:reset-memory

Hay un checklist final en [docs/final-checklist.md](/Users/franco/Documentos/gasti-challenge/docs/final-checklist.md).
## Qué dejaría para después

- Multiusuario real con aislamiento de memoria y contexto.
- Más profundidad en memoria financiera y mejores controles de edición.
- Semantic recall o una estrategia de recuperación más rica entre conversaciones.
- Una capa visual complementaria para tendencias o comparaciones, sin sacar al chat del centro.

## Documentación complementaria

- [docs/agent.md](/Users/franco/Documentos/gasti-challenge/docs/agent.md): arquitectura del agente, uso de Mastra y límites del sistema.
- [docs/demo-memory.md](/Users/franco/Documentos/gasti-challenge/docs/demo-memory.md): manejo de memoria demo y reset por terminal.
- [docs/final-checklist.md](/Users/franco/Documentos/gasti-challenge/docs/final-checklist.md): checklist final de verificación para entrega/demo.
- [docs/writeup-draft.md](/Users/franco/Documentos/gasti-challenge/docs/writeup-draft.md): primera iteración del writeup.

Los archivos [docs/product.md](/Users/franco/Documentos/gasti-challenge/docs/product.md), [docs/tools.md](/Users/franco/Documentos/gasti-challenge/docs/tools.md) y [docs/data.md](/Users/franco/Documentos/gasti-challenge/docs/data.md) quedan como notas internas de soporte y no son necesarias para correr ni evaluar el proyecto.
