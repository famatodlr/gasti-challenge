# Product Spec: Gasti

## Product Angle

Gasti is a conversational personal finance assistant for everyday ARS spending. The core promise is not "build a budget app"; it is "help me understand what happened to my money, why it happened, and what small decision I can make this week."

The product should feel like a sharp, calm money companion for someone who does not want dashboards, spreadsheets, or generic advice. The assistant should answer with numbers, cite the transactions behind its claims, and translate spending patterns into practical tradeoffs.

## Target User

The target user is a young professional in Argentina who pays with cards, Mercado Pago, apps, SUBE, subscriptions, and recurring services. They are not trying to become a finance power user. They want fast answers in natural language:

- "Cuanto gaste en delivery este mes?"
- "Que cambio respecto de abril?"
- "Que gastos fijos tengo?"
- "A este ritmo, como cierro el mes?"
- "Que puedo recortar sin arruinarme la vida?"

Assumptions for the challenge build:

- Single demo user.
- ARS only.
- Mock transactions only.
- Expense analysis only. Income can be provided by the user during chat, but it is not stored in the transaction dataset.
- Spanish-first tone, with English responses when the user writes in English.
- Structured financial memory can persist explicit user-stated facts for the demo user. Mastra Memory is enabled separately for conversation continuity by `resourceId` and `threadId`.

## Product Principles

- Conversational first: the chat is the product, not a dashboard with a chat widget.
- Evidence-backed: every financial claim should be grounded in tool output and, when useful, transaction IDs or merchant examples.
- Local and concrete: use ARS, Argentine merchants, exact dates, and plain explanations.
- No shame: highlight patterns and options without moralizing.
- One useful next step: prefer a concise recommendation over a long generic lecture.
- Scope discipline: a small set of excellent finance tools beats a wide set of shallow features.

## Core Use Cases

### 1. Spending Questions

The user asks about spending by date range, category, merchant, or phrase. Gasti returns totals, counts, top drivers, and examples.

Example:

> "Cuanto gaste en comida desde abril?"

Expected answer:

- Total ARS spent.
- Main merchants or sub-patterns.
- A short note separating supermarket, delivery, and other eating-out patterns when relevant.
- Optional follow-up: "Queres que vigilemos delivery de cerca?"

### 2. Period Comparison

The user compares current month vs previous month, a week vs another week, or custom ranges. Gasti identifies the largest category and merchant deltas.

Example:

> "Estoy gastando mas que el mes pasado?"

Expected answer:

- Current period total.
- Baseline period total.
- Absolute and percentage delta.
- Top 2-3 drivers.
- Caveat when periods have different number of elapsed days.

### 3. Recurring Expenses and Subscription Awareness

Gasti detects repeated merchants and likely monthly commitments. This is the product angle that gives the challenge some personality: "what money is leaving by default?"

Example:

> "Que gastos fijos tengo todos los meses?"

Expected answer:

- Rent, utilities, internet, phone, subscriptions, gym, health plan.
- Estimated monthly committed spend.
- Confidence by item based on observed occurrences.
- Possible "zombie" candidates when a recurring entertainment service appears but is easy to forget.

### 4. Month-End Projection

The user asks how the month is trending. Gasti projects month-end spend using observed spend, elapsed days, flexible-spend daily average, and known recurring charges still expected.

Example:

> "Si sigo asi, cuanto gasto en mayo?"

Expected answer:

- Observed spend so far.
- Projected variable spend.
- Known recurring spend already paid and likely remaining.
- Projected total range, not false precision.
- Assumptions used.

### 5. Transaction Drilldown

The user asks to inspect the data behind an answer.

Example:

> "Mostrame los gastos grandes de la ultima semana"

Expected answer:

- A short table-like list in the chat.
- Date, merchant, description, category, amount.
- Sort order that matches the question.

### 6. Lightweight Personalization

Gasti can remember explicit user-stated financial facts and preferences through the structured JSON-backed financial memory. Conversation continuity is handled separately by Mastra Memory threads.

Neither memory layer should store raw transaction rows. Transaction truth should continue to come from tools reading the dataset.

## Non-Goals

- Bank sync, account aggregation, auth, or production privacy controls.
- Budget creation flows with many forms.
- Investment, tax, credit, or legal advice.
- Payment initiation, bill payment, or subscription cancellation.
- Multi-currency support.
- Multi-user data modeling beyond a stable demo resource ID.
- A full analytics dashboard.
- Custom tool-calling orchestration outside Mastra.

## UX Direction

The first screen should be the chat experience. It can include a compact context rail with the current dataset window, top recurring expenses, and suggested prompts, but the assistant remains primary.

Important UI behavior:

- Show when the assistant used finance tools.
- Make transaction evidence easy to scan.
- Use ARS formatting consistently.
- Give graceful caveats when the dataset does not contain enough history.
- Keep suggested prompts specific to the mock data.
