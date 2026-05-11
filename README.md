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

By default, Gasti uses `gemini-2.5-flash` for development and `gemini-2.5-pro` when `NODE_ENV=production`. Override either with `GASTI_AI_MODEL`.

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

Health check:

```bash
curl -s http://localhost:3001/health
```

Chat request:

```bash
curl -s http://localhost:3001/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Cuanto gaste en supermercado en mayo?"}'
```

Response shape:

```json
{
  "answer": "..."
}
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
- Development uses Gemini 2.5 Flash by default; production uses Gemini 2.5 Pro by default.
- Challenge data is local-only mock spending data in ARS from `data/transactions.json`.
- Raw transaction categories are preserved from the dataset. The domain layer normalizes them into 10 product categories for analytics and tool outputs: `vivienda`, `servicios`, `suscripciones`, `supermercado`, `comida_fuera`, `transporte`, `salud`, `educacion`, `compras`, and `ocio`.
- Transaction tool outputs include both normalized `category` and original `rawCategory`.

- Public tool schemas intentionally use flat date fields to improve LLM tool-calling reliability. Internally, tools adapt those fields back into domain date range objects.

## Left For Later

- Build the UI chat integration.
- Add authentication if the product needs it.
- Add Memory only if it helps the chat experience.
- Add Workflow only if there is a useful recurring review flow.
- Improve category labels and explanations as the assistant experience matures.
