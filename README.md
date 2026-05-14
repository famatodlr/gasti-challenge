# Gasti

Gasti es un asistente conversacional de finanzas personales. Analiza transacciones mock locales en ARS y responde preguntas sobre gastos, comparaciones, categorías, recurrencias y proyecciones en lenguaje natural.

## Qué hace

- Consulta gasto mensual y por período.
- Compara gastos entre meses.
- Desglosa gastos por categoría o comercio.
- Detecta gastos recurrentes y suscripciones.
- Proyecta el gasto estimado de fin de mes.
- Recupera continuidad conversacional por thread con Mastra Memory local.
- Responde en lenguaje natural usando cálculos financieros determinísticos.

## Stack técnico

- TypeScript
- Bun
- Mastra
- Mastra Memory con LibSQL local para continuidad de conversación
- Google Gemini vía AI SDK
- NestJS
- Next.js / React

## Estructura del proyecto

```text
apps/
  ai/    # Agente Mastra y tools financieras
  api/   # API NestJS que expone el chat
  ui/    # Frontend Next.js / React
data/    # Transacciones mock locales y memoria financiera determinística
docs/    # Specs y notas de diseño
```

## Requisitos

- Bun
- API key de Google AI Studio

Antes de usar el chat, configurar la API key:

```bash
export GEMINI_API_KEY="your-google-ai-studio-key"
```

## Correr localmente

Instalar dependencias:

```bash
bun install
```

Levantar la app completa:

```bash
bun run dev
```

La UI escucha en http://localhost:7310 y se comunica con la API mediante su proxy local. La API escucha en http://localhost:7311.

Podés cambiar los puertos locales con `PORT` al correr cada app. Por defecto, el proxy de la UI apunta a `http://localhost:7311/chat`; si necesitás otro backend, usá `GASTI_CHAT_API_URL`.

## Ejemplos de uso

- "Comparame mis gastos de mayo de 2026 contra abril de 2026"
- "Detectá mis gastos recurrentes entre abril y mayo de 2026"
- "Proyectá mi gasto total de mayo de 2026"
- "Mostrame mis gastos por categoría en mayo de 2026"

## Verificación

Desde la raíz del repo:

```bash
bun run build
```

Para validar el dominio financiero y las tools del agente:

```bash
cd apps/ai
bun run test:domain
bun run test:tools
bun run test:agents
bun run verify:domain
```

Para validar la API:

```bash
cd apps/api
bun run test
bun run build
```

## Notas de implementación

- Los datos son mock y locales, cargados desde `data/transactions.json`.
- Mastra Memory persiste historial conversacional por `resourceId` y `threadId` solamente. En desarrollo usa LibSQL local en `apps/ai/.mastra/memory.db`, que está ignorado por git.
- El camino principal de chat es `message + resourceId + threadId`: la UI manda solo el último mensaje y Mastra Memory recupera el contexto del thread.
- `messages[]` sin `threadId` sigue soportado como modo legacy stateless; la API usa ese historial como contexto completo, limitado a los últimos 20 mensajes.
- `messages[] + threadId` se acepta por compatibilidad, pero se normaliza al camino con memoria usando solo el último mensaje de usuario para evitar contexto duplicado. `message + messages[]` sigue siendo inválido.
- Si el cliente manda `message` sin `threadId`, la API usa `demo-thread` solo por compatibilidad local/demo. En producción se debe enviar un thread real por usuario o sesión.
- La memoria financiera es estructurada, determinística y respaldada por `data/financial-memory.json`; permite guardar hechos financieros explícitos del usuario demo, no guarda transacciones crudas, no usa RAG y no es Mastra Memory.
- El motor financiero es determinístico: los totales, comparaciones, recurrencias y proyecciones se calculan con funciones y tools.
- El agente usa Mastra tools para calcular y luego usa IA para interpretar la consulta y redactar la respuesta.
- La API contempla fallback entre modelos Gemini ante errores de cuota o rate-limit.
- Semantic recall, embeddings, vector stores y RAG siguen fuera de alcance.

## Tools del agente

- `getFinanceContext`: expone el rango disponible, meses con datos y fecha de referencia sin devolver transacciones crudas.
- `getFinancialMemory`: expone contexto financiero del usuario demo, como ingresos conocidos, metas, categorías a vigilar y preferencias.
- `updateFinancialMemory`: persiste hechos financieros explícitos o confirmados con un schema estricto y rechaza datos crudos, secretos, campos no soportados y categorías desconocidas.
- `spendingSummaryTool`: calcula totales y desgloses de gasto.
- `comparePeriodsTool`: compara gastos entre dos períodos.
- `detectRecurringExpensesTool`: detecta gastos recurrentes y suscripciones.
- `forecastMonthEndSpendTool`: proyecta gasto de fin de mes.
- `findTransactionsTool`: busca transacciones concretas para mostrar evidencia.

## Para después

- Agregar semantic recall: Buscar recuerdos relevantes entre chats distintos.
- Expandir lo realizado a multiples usuarios
- Incluir ABM de datos
- Agregar seccion de dashboards en la UI para mostrar gráfico de comparación entre meses y entre categorías.

## To do:

- Ampliar la memoria financiera
- Hacer alguna forma facil de borrar la memoria desde terminal
- Mejorar la UI (hacerla blanca?)
- Agregar semantic recall: Buscar recuerdos relevantes entre chats distintos. ?