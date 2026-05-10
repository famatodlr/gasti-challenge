# Gasti Conversational Finance Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shippable conversational personal finance assistant that uses Mastra idiomatically to answer questions about mock ARS transactions.

**Architecture:** Keep the finance brain in `apps/ai` as a Mastra `Agent` with Zod-backed tools. Expose it through a small NestJS chat endpoint in `apps/api`. Build `apps/ui` as the chat-first product surface that calls the API and displays answers plus evidence.

**Tech Stack:** Bun workspaces, Turborepo, TypeScript, Mastra, Zod, OpenAI via AI SDK, NestJS, Next.js App Router, Tailwind.

---

## File Map

- Modify `data/transactions.json`: normalize categories and preserve 50 realistic ARS expense rows.
- Create `apps/ai/src/mastra/domain/transaction.ts`: transaction schema, category schema, date helpers, ARS formatting helpers.
- Create `apps/ai/src/mastra/domain/transaction-repository.ts`: load and validate `data/transactions.json`.
- Create `apps/ai/src/mastra/domain/analytics.ts`: deterministic calculations for totals, comparisons, recurring detection, and forecasting.
- Create `apps/ai/src/mastra/tools/index.ts`: export all finance tools.
- Create `apps/ai/src/mastra/tools/spending-summary-tool.ts`.
- Create `apps/ai/src/mastra/tools/find-transactions-tool.ts`.
- Create `apps/ai/src/mastra/tools/compare-periods-tool.ts`.
- Create `apps/ai/src/mastra/tools/detect-recurring-expenses-tool.ts`.
- Create `apps/ai/src/mastra/tools/forecast-month-end-spend-tool.ts`.
- Modify `apps/ai/src/mastra/agents/index.ts`: replace placeholder agent with `gastiFinanceAgent`.
- Modify `apps/ai/src/mastra/index.ts`: register `gastiFinanceAgent`, optional memory storage, and optional workflow.
- Modify `apps/ai/package.json`: add memory dependencies only if memory is implemented.
- Modify `apps/api/package.json`: depend on the local `ai` workspace package if importing the Mastra runtime.
- Create `apps/api/src/chat.controller.ts`: `POST /chat` endpoint.
- Create `apps/api/src/chat.dto.ts`: request and response schemas or TypeScript types.
- Modify `apps/api/src/app.module.ts`: register chat controller.
- Modify `apps/ui/app/page.tsx`: replace placeholder with chat UI.
- Modify `apps/ui/app/globals.css`: small product-specific polish.
- Modify `README.md`: setup, run, tools chosen, product decisions, what remains.
- Create `docs/process-writeup.md`: one-page AI-native process writeup for the final deliverable.

## Phase 1: Verify Runtime and Normalize Data

- [ ] Run `bun install` if dependencies are not installed.

- [ ] Run `bun run build` to capture the starter baseline.

- [ ] Normalize `data/transactions.json` to the category design in `docs/data.md`, keeping 50 rows and the 2026-03-15 to 2026-05-08 window.

- [ ] Create `apps/ai/src/mastra/domain/transaction.ts` with:
  - `transactionSchema`
  - `categorySchema`
  - `dateRangeSchema`
  - `type Transaction`
  - `type Category`
  - `formatARS(amount: number): string`
  - `parseISODate(value: string): Date`
  - `isWithinDateRange(transaction, range): boolean`

- [ ] Create `apps/ai/src/mastra/domain/transaction-repository.ts` with `loadTransactions()` that reads the root `data/transactions.json`, validates every row with Zod, and returns rows sorted ascending for calculations.

- [ ] Add a focused Bun test file for repository validation if the repo has test support after dependency install. If not, add a temporary verification script under `apps/ai/src/mastra/domain/verify-transactions.ts` and run it with Bun during development, then keep it only if it is useful.

## Phase 2: Build Deterministic Analytics

- [ ] Create `apps/ai/src/mastra/domain/analytics.ts`.

- [ ] Implement `summarizeSpending(transactions, input)` for date/category/merchant filters and grouping by category, merchant, day, or week.

- [ ] Implement `findTransactions(transactions, input)` for drilldown filters, query matching across merchant and description, sorting, and limit.

- [ ] Implement `comparePeriods(transactions, input)` for current vs baseline totals and grouped deltas.

- [ ] Implement `detectRecurringExpenses(transactions, input)` using merchant repetition, date spacing, amount similarity, and category hints.

- [ ] Implement `forecastMonthEndSpend(transactions, input)` using observed fixed spend, observed variable run rate, days elapsed, and a visible confidence value.

- [ ] Verify analytics with deterministic examples from the dataset:
  - May spending total.
  - April vs May comparison.
  - Netflix and Spotify recurring detection.
  - May month-end projection as of 2026-05-08.

## Phase 3: Build Mastra Tools

- [ ] Create one Mastra `createTool` file per tool listed in `docs/tools.md`.

- [ ] Use Zod `inputSchema` and `outputSchema` directly in each tool.

- [ ] Keep each `execute` function thin: load transactions, call the matching analytics function, return structured output.

- [ ] Export the tools from `apps/ai/src/mastra/tools/index.ts`.

- [ ] Run `bun run build --filter=ai` or the closest workspace build command supported by Turbo.

## Phase 4: Replace Placeholder Agent

- [ ] Replace `placeholderAgent` with `gastiFinanceAgent` in `apps/ai/src/mastra/agents/index.ts`.

- [ ] Use the system prompt from `docs/agent.md`.

- [ ] Register all finance tools in the agent's `tools` property.

- [ ] Keep model selection simple: continue with the starter OpenAI provider pattern unless the installed Mastra version requires the newer string model format.

- [ ] Add Mastra Memory with LibSQL if dependency install is smooth:
  - Add `@mastra/memory`.
  - Add `@mastra/libsql`.
  - Configure shared storage in `apps/ai/src/mastra/index.ts`.
  - Pass `memory: { thread, resource }` from the API call.

- [ ] Skip `monthlyReviewWorkflow` unless the core chat path is already working.

- [ ] Validate in Mastra dev playground with:
  - "Cuanto gaste en comida en mayo?"
  - "Estoy gastando mas que en abril?"
  - "Que gastos fijos tengo?"
  - "Si sigo asi, cuanto gasto en mayo?"

## Phase 5: Add NestJS Chat Endpoint

- [ ] Decide on the simplest reliable response mode first: JSON response with full assistant answer. Streaming can follow only after the JSON path works.

- [ ] In `apps/api/package.json`, add a workspace dependency on the local AI package if needed.

- [ ] Add an export path in `apps/ai/package.json` if the API cannot import the Mastra runtime cleanly.

- [ ] Create `apps/api/src/chat.dto.ts`:
  - Request: `message`, optional `threadId`, optional `resourceId`.
  - Response: `threadId`, `answer`, optional `toolTrace`, optional `error`.

- [ ] Create `apps/api/src/chat.controller.ts` with `POST /chat`.

- [ ] In the controller, get `gastiFinanceAgent` from the Mastra runtime or import it directly from the AI package.

- [ ] Invoke the agent with Mastra's `generate` or `stream` API. Do not manually route tool calls.

- [ ] Return friendly errors for missing API keys, model failures, or invalid request bodies.

- [ ] Register the controller in `apps/api/src/app.module.ts`.

- [ ] Verify:
  - `GET /health` still returns `{ ok: true }`.
  - `POST /chat` returns an assistant answer for a spending question.

## Phase 6: Build Chat-First UI

- [ ] Replace `apps/ui/app/page.tsx` with the product surface:
  - Chat history.
  - Input composer.
  - Suggested prompts based on the dataset.
  - Compact data context: transaction window and ARS-only note.
  - Evidence/tool-use area when the API returns trace data.

- [ ] Keep visual scope restrained and useful. This is an operational assistant, not a marketing page.

- [ ] Add client-side loading, empty, and error states.

- [ ] Use ARS formatting and exact dates in any static helper text.

- [ ] Verify the UI against desktop and mobile widths.

## Phase 7: Documentation and Deliverable Prep

- [ ] Update `README.md` with:
  - How to run locally.
  - Which Mastra tools were chosen and why.
  - Product decisions.
  - What remains.

- [ ] Create `docs/process-writeup.md` with:
  - How Mastra was investigated and used.
  - Why Agent and tools were chosen.
  - Memory decision.
  - Workflow decision.
  - How Codex/Superpowers/spec docs shaped the work.

- [ ] Add a short "demo script" section to the README for the 3-5 minute Loom:
  - Start the apps.
  - Ask spending summary.
  - Ask comparison.
  - Ask recurring expenses.
  - Ask month-end projection.
  - Show the docs process.

## Verification Checklist

- [ ] `bun run build` succeeds.
- [ ] `bun dev:api` serves `http://localhost:3001/health`.
- [ ] `bun dev:ai` opens the Mastra playground.
- [ ] `bun dev:ui` serves the chat UI at `http://localhost:3000`.
- [ ] The agent answers at least five scripted prompts using Mastra tools.
- [ ] The implementation contains no custom tool-calling loop.
- [ ] README and process writeup explain the AI-native process clearly.

