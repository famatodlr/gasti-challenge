# Challenge - Gasti

Conversational finance assistant challenge using local mock ARS transactions.

## Run Locally

```bash
bun install
bun run build
```

The chat agent uses Google Gemini through AI SDK. Set your Google AI Studio key before calling the API:

```bash
export GEMINI_API_KEY="your-google-ai-studio-key"
```

By default, Gasti tries Gemini models in this order when quota or rate limits are hit:

1. `gemini-2.5-flash`
2. `gemini-2.5-pro`
3. `gemini-2.5-flash-lite`

Override the chain with a comma-separated `GASTI_AI_MODEL_FALLBACK_CHAIN`:

```bash
export GASTI_AI_MODEL_FALLBACK_CHAIN="gemini-2.5-flash,gemini-2.5-pro,gemini-2.5-flash-lite"
```

Set `GASTI_AI_MODEL` as a hard override to use exactly one model with no fallback.

AI workspace:

```bash
cd apps/ai
bun run test:domain
bun run test:tools
bun run test:agents
bun run verify:domain
bun run build:package
bun run build
```

API workspace:

```bash
cd apps/api
bun run test
bun run build
bun run dev
```

From the repo root, you can run the API with:

```bash
bun run dev:api
```

The API listens on `http://localhost:3001` unless `PORT` is set.

Frontend workspace:

```bash
cd apps/ui
bun run dev
bun run build
```

From the repo root, you can run the frontend with:

```bash
bun run dev:ui
```

The UI listens on `http://localhost:3000` by default and posts to its local Next proxy at `/api/chat`. The proxy forwards to `http://localhost:3001/chat` unless `GASTI_CHAT_API_URL` is set:

```bash
export GASTI_CHAT_API_URL="http://localhost:3001/chat"
```

Health check:

```bash
curl -s http://localhost:3001/health
```

Chat request with client-owned conversation context:

```bash
curl -s http://localhost:3001/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Comparame mis gastos de mayo de 2026 contra abril de 2026"
      }
    ]
  }'
```

Follow-up request:

```bash
curl -s http://localhost:3001/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Comparame mis gastos de mayo de 2026 contra abril de 2026"
      },
      {
        "role": "assistant",
        "content": "En mayo de 2026, tus gastos fueron de ARS 499.698, lo que representa una disminucion del 19.27% en comparacion con abril de 2026. Salud aumento un 206.2%, Servicios disminuyo un 76.5% y Educacion disminuyo un 100%."
      },
      {
        "role": "user",
        "content": "Que categoria aumento mas?"
      }
    ]
  }'
```

Response shape:

```json
{
  "answer": "..."
}
```

`POST /chat` is stateless. The `messages` array is conversation context for the current request only; the API does not persist chat history, create user accounts, use vector search, or add long-term memory.

The Phase 6 UI keeps chat bubbles locally for the demo, but it does not implement real conversation memory. Its `/api/chat` proxy accepts the UI's local `{ messages: [...] }` payload, extracts the latest user message, and forwards the existing backend contract as `{ "message": "..." }`.

For simple one-shot calls, the legacy body shape is still accepted and internally converted to a single user message:

```bash
curl -s http://localhost:3001/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Cuanto gaste en supermercado en mayo?"}'
```

If `GEMINI_API_KEY` is unset or blank, `POST /chat` returns `503` with a missing-key error and does not invoke the model.

## Validation

Run these commands from `apps/ai` to validate the deterministic finance tools work:

```bash
bun run test:domain
bun run test:tools
bun run test:agents
bun run verify:domain
bun run build:package
bun run build
```

The domain analytics tests and finance tool wrapper tests should pass, the domain verifier should print deterministic JSON output, `bun run build:package` should emit the `ai/mastra` package export, and `bun run build` should also produce the Mastra artifact when the local Mastra/Rollup CLI toolchain is healthy.

Run these commands from `apps/api` to validate the NestJS chat endpoint:

```bash
bun run test
bun run build
```

### Mastra Dev Tooling Note

`bun run dev` from `apps/ai` and `bun run dev:ai` from the repo root currently fail under Bun with a Rollup `commonjs--resolver` read-only property error. This appears to be external Mastra/Bun/Rollup dev-mode tooling version skew, not a Gasti finance logic issue, and it does not block the deterministic finance tools work.

If `bun run build` in `apps/ai` fails with a Rollup native optional dependency or code-signature error, rerun `bun install` or refresh `node_modules`. The API path only needs `bun run build:package`, which emits the local `ai/mastra` package used by NestJS.

## Agent Tools

- `spendingSummaryTool`: totals and grouped spending breakdowns.
- `findTransactionsTool`: exact transaction rows for evidence and drilldowns.
- `comparePeriodsTool`: deterministic period-over-period comparisons.
- `detectRecurringExpensesTool`: repeated merchants, subscriptions, and fixed-cost signals.
- `forecastMonthEndSpendTool`: month-end spend projection from observed data.

These tools are registered on `gastiFinanceAgent`, which is exposed through the `ai/mastra` package export and called by `POST /chat`.

## Product Decisions So Far

- Deterministic analytics live in `apps/ai/src/mastra/domain`.
- Mastra tools are thin wrappers: load local data, call analytics, return structured output.
- The NestJS API stays thin: it validates the chat body, checks `GEMINI_API_KEY`, invokes the Mastra agent, and returns `{ answer }`.
- The chat API is stateless multi-turn: clients may send `messages[]` history, and the backend uses that history only for the current answer.
- Gemini model selection uses the default fallback chain unless `GASTI_AI_MODEL` hard-overrides it.
- Challenge data is local-only mock spending data in ARS from `data/transactions.json`.
- Raw transaction categories are preserved from the dataset. The domain layer normalizes them into 10 product categories for analytics and tool outputs: `vivienda`, `servicios`, `suscripciones`, `supermercado`, `comida_fuera`, `transporte`, `salud`, `educacion`, `compras`, and `ocio`.
- Transaction tool outputs include both normalized `category` and original `rawCategory`.

- Public tool schemas intentionally use flat date fields to improve LLM tool-calling reliability. Internally, tools adapt those fields back into domain date range objects.

## Left For Later

- Add real conversation memory if the product needs multi-turn context beyond the visible demo.
- Add authentication if the product needs it.
- Add Memory only if it helps the chat experience.
- Add Workflow only if there is a useful recurring review flow.
- Improve category labels and explanations as the assistant experience matures.
