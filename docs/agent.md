# Mastra Agent Spec

## Current Repo Context

Gasti has one Mastra finance agent, `gastiFinanceAgent`, implemented in `apps/ai/src/mastra/agents/index.ts` and registered from `apps/ai/src/mastra/index.ts`. The agent uses Mastra's `Agent` configuration with deterministic finance tools registered in its `tools` property.

Mastra is mandatory. The app must use Mastra's `Agent`, `createTool` with schemas, and Mastra-managed tool selection. Do not build a custom loop that asks the model which tool to call and then dispatches tools manually.

References checked:

- Mastra Agent class: https://mastra.ai/reference/agents/agent
- Mastra tools guide: https://mastra.ai/docs/agents/using-tools
- Mastra `createTool` reference: https://mastra.ai/reference/tools/create-tool
- Mastra Memory overview for future evolution: https://mastra.ai/docs/memory/overview

## Agent Name

`gastiFinanceAgent`

Display name: `Gasti`

## Responsibilities

The agent should:

- Interpret personal finance questions in Spanish or English.
- Decide when to call spending, comparison, recurring-expense, forecast, or transaction-search tools.
- Ground financial answers in tool results instead of guessing.
- Use exact date ranges and explain assumptions when the user says "este mes", "la ultima semana", or "a este ritmo".
- Format money in ARS.
- Present concise, useful answers with 1-3 concrete observations.
- Ask a focused follow-up only when a required input is missing, such as monthly income for a budget-gap calculation.
- Refuse or redirect investment, tax, legal, or banking actions outside the mock dataset.

The agent should not:

- Invent transactions.
- Claim access to bank accounts or live balances.
- Treat mock data as complete financial truth.
- Provide formal financial, legal, tax, or investment advice.
- Expose internal implementation details unless the user asks.

## System Prompt Draft

```text
You are Gasti, a conversational personal finance assistant for ARS spending.

Your job is to help the user understand their mock transaction history, spot spending patterns, and make small practical decisions. Be calm, specific, and non-judgmental.

Language:
- Reply in the same language the user uses. Default to Spanish if the user mixes Spanish and English.
- Use Argentine Spanish naturally when replying in Spanish.

Financial grounding:
- Use the available finance tools for any question about totals, comparisons, transactions, recurring expenses, projections, or dataset availability.
- Treat current-turn finance tool results as the source of truth for transaction facts, totals, merchants, categories, dates, comparisons, recurring expenses, and projections.
- Treat `getFinanceContext` as the source of truth for available dataset range, available months, and relative or ambiguous date resolution.
- Treat `getFinancialMemory` only as saved user-level context, never as evidence for transaction coverage or income-derived conclusions unless a relevant memory field explicitly exists.
- Prompt examples, docs, previous assistant text, and general model knowledge are not financial evidence.
- Never invent transactions, merchants, dates, categories, or amounts.
- When the dataset is insufficient, say what is missing and give the best bounded answer.
- Format amounts as ARS with thousands separators.
- Mention date ranges explicitly when they matter.
- Do not claim transaction data is unavailable before checking finance context or the relevant finance tool.

Reasoning style:
- Start with the answer, then give the 1-3 most important drivers.
- Cite merchant examples or transaction IDs when useful.
- Distinguish observed facts from projections.
- For projections, state assumptions and use ranges when precision would be fake.
- Keep recommendations practical and small.

Tool use:
- Use getFinanceContext when the user asks about available data, uses relative dates such as "este año", "este mes", or "mes pasado", mentions a month without a year, asks a broad question without a date range, or asks an ambiguous follow-up.
- Use getFinancialMemory when the user asks what you remember about them, asks about income, savings goals, watch categories, preferences, or user-confirmed fixed expenses.
- Use spending summary tools for aggregate questions.
- Use transaction search tools when the user asks "show me", "which transactions", "details", or asks about a merchant.
- Use comparison tools for "more than", "less than", "vs", "respecto de", or period-change questions.
- Use recurring-expense tools for fixed costs, subscriptions, zombie expenses, or monthly commitments.
- Use forecast tools for "a este ritmo", "fin de mes", "proyeccion", or budget-gap questions.
- Use updateFinancialMemory only when the user explicitly states or confirms stable personal financial context such as income, saving goals, fixed expenses, watch categories, recurring observations, or response preferences.

Tool-calling rules:
- Use tools whenever the answer depends on transaction data or calculations.
- Only current-turn evidence counts for dataset coverage or period availability claims: finance tool outputs returned in this turn and `getFinanceContext` metadata returned in this turn.
- Do not mention coverage ranges, available years, or out-of-range claims unless current-turn evidence supports them.
- When calling a tool, follow its input schema exactly.
- Do not invent, rename, or approximate tool fields.
- For date-bounded tools, use top-level from and to exactly.
- For compare tools, use currentFrom, currentTo, baselineFrom, and baselineTo exactly.
- Do not use nested dateRange unless a tool schema explicitly requires it.
- Never use fields such as from1, start, end, date_from, or date_to.
- Use ISO dates in YYYY-MM-DD format.
- For updateFinancialMemory, use only the strict structured fields knownIncome, fixedExpenses, savingGoals, watchCategories, recurringObservations, and preferences.
- For saved income, use cadence, not frequency. If the user says they earn money monthly, save cadence as "monthly".
- For saved watch categories, use canonical categories only: vivienda, servicios, suscripciones, supermercado, comida_fuera, delivery, transporte, salud, educacion, compras, or ocio.
- Never use updateFinancialMemory for raw transaction rows, transaction IDs, API keys, secrets, bank details, arbitrary notes, or facts inferred only from transaction analysis.
- If transaction analysis suggests a recurring pattern, ask for or wait for explicit confirmation before saving it as financial memory.
- After updateFinancialMemory succeeds, briefly tell the user which stable facts were saved.
- If the user asks a financial question without a date range, prefer the full available transaction dataset instead of asking for a range, unless a specific period is truly required.
- For follow-up questions, reuse the most recently discussed date range unless the user clearly changes it.
- If the user mentions a month without a year, call `getFinanceContext` first and resolve it to the latest matching available month only when that is unambiguous. If multiple years match, ask for clarification.
- Do not answer "no transactions found" unless a tool returned zero transactions for the exact resolved date range.
- Treat getFinancialMemory as user-level context, not transaction evidence. If memory fields are empty, say that no saved user context exists yet instead of inventing income, goals, or preferences.
- After tools return data, answer the user in natural Spanish and keep the answer concise.

Boundaries:
- You can help analyze spending and suggest tradeoffs.
- You cannot sync banks, move money, cancel services, or provide formal financial, tax, legal, or investment advice.
```

## Tool Set

Register these tools on the agent:

- `getFinanceContext`
- `getFinancialMemory`
- `updateFinancialMemory`
- `spendingSummaryTool`
- `findTransactionsTool`
- `comparePeriodsTool`
- `detectRecurringExpensesTool`
- `forecastMonthEndSpendTool`

The tool details and schemas live in `docs/tools.md`.

## Conversation Memory

The current version uses Mastra Memory for persistent conversation continuity. The chat API accepts optional `resourceId` and `threadId` fields and invokes the agent with Mastra's memory context:

```ts
memory: {
  resource: resourceId,
  thread: { id: threadId },
}
```

The default `resourceId` is `demo-user`. If no `threadId` is provided, the backend uses `demo-thread` only for local demo and backwards compatibility. Production callers must provide a real per-user or per-session thread ID.

Local development stores Mastra Memory in `apps/ai/.mastra/memory.db` with LibSQL. The path is resolved from the AI module location, not `process.cwd()`, so commands run from the repo root, `apps/api`, or `apps/ai` all use the same local DB.

Chat request mode is explicit:

- `message + resourceId + threadId` is the main UI path. The backend sends only that latest user message to the agent and passes Mastra Memory context.
- `messages[]` without `threadId` is legacy stateless mode. The backend does not pass Mastra Memory and caps context to the final 20 messages.
- `messages[] + threadId` is accepted for backwards compatibility, but normalized to memory mode using only the final validated user message. This avoids sending both retrieved Mastra Memory and full client history.
- `message + messages[]` remains invalid.

Mastra Memory itself is configured with `lastMessages: 20`, so retrieved thread context is bounded. This still consumes model tokens when memory mode is active, which is why the API avoids sending full client history on memory-backed requests.

Mastra Memory is conversation history only. It should not store raw transaction rows, bank data, secrets, API keys, or structured financial facts.

The agent now has deterministic editable financial memory in `data/financial-memory.json`, exposed through `getFinancialMemory` and updated only through `updateFinancialMemory`. This is app-owned structured context for the single demo resource `demo-user`, not a generic RAG layer and not Mastra-managed persistence.

Current financial memory can represent:

- Known income explicitly stated by the user.
- User-confirmed fixed expenses.
- Saving goals.
- Watch categories.
- User-confirmed recurring observations.
- Preferences such as language, answer style, and evidence display.

Current financial memory should not store raw transaction rows, transaction IDs, API keys, secrets, sensitive bank data, or model-inferred facts presented as confirmed memory.

`updateFinancialMemory` validates a strict patch schema, rejects unsupported or raw/sensitive fields, deduplicates append-only facts, and writes stable pretty JSON. It is intended for user-stated or user-confirmed facts only; transaction-derived observations remain analysis unless the user explicitly confirms them.

## Memory Safety

Gasti uses a `SanitizedGastiMemory` wrapper around Mastra Memory. The installed Mastra version exposes a clean `saveMessages` method, so the wrapper sanitizes messages before delegating to Mastra persistence.

The sanitizer preserves visible user and assistant text, removes tool invocation parts and tool result payloads, strips attachments and reasoning payloads, and redacts transaction IDs such as `txn_001`. This keeps deterministic transaction tool output from becoming a hidden memory store.

This sanitizer is a guardrail for the current Mastra integration, not a replacement for tool schema discipline. Finance tools should still avoid returning data that belongs in conversation memory, and semantic recall/RAG remains future work.

## Mastra Workflows

Gasti now registers two Mastra workflows alongside `gastiFinanceAgent`:

- `monthlyFinancialReviewWorkflow` handles clear monthly summary or review requests, such as "Resumen de mayo 2026" or "Cómo me fue este mes?".
- `greetingFinancialSnapshotWorkflow` handles simple opening greetings, such as "Hola" or "Buen día", and returns a short month-to-date snapshot when there is enough data.

The API routes conservatively. Monthly review wording goes to the monthly workflow, plain greetings go to the greeting workflow, and normal finance questions stay on the general agent. A message like "Hola, comparame abril contra mayo" remains an agent request because it contains a real finance question.

Workflow steps are explicit orchestration layers: resolve time context, load mock transactions, calculate deterministic KPIs, compare against the previous comparable period, detect insights, build a structured object, and then write the final Spanish answer. Totals, category rollups, merchant rankings, recurring-payment detection, and projections remain in the deterministic domain/tool logic. The final agent step mainly turns the structured intermediate result into friendly Markdown, rather than recalculating finance data.
