# Challenge — Gasti

## Contexto

Este challenge no evalúa si sos crack técnicamente — no nos importa tanto. Lo que queremos ver es:

1. Cómo trabajás con IA (no como autocomplete: como pareja de trabajo).
2. Si podés meterte rápido en un framework nuevo y usarlo idiomáticamente.
3. Si podés moverte en un stack que tal vez no es el tuyo (React + Nest).

**Vibecodear está bien.** Más que bien: es lo que esperamos.
Lo que no está bien es vibecodear sin criterio: usar IA como buscador glorificado, no investigar qué hay disponible, no pensar antes de tirarle prompts.

---

## El task

Construir una herramienta para finanzas personales. Que tiene que hacer? Lo que vos creas que tiene que hacer, la libertad es total. 

### Stack

- **Frontend:** React.
- **Backend:** NestJS.
- **Agente:** [Mastra](https://mastra.ai). No es opcional — queremos ver cómo te metés en un framework moderno de agentes.
- **LLM:** el provider que elijas (OpenAI, Anthropic, lo que esté soportado por Mastra).
- **Datos:** un JSON mock con ~50 transacciones que vas a inventar (categorías, montos, fechas, descripciones realistas).

### Qué tiene que hacer

Un asistente de finanzas personales, 100% conversacional.

---

## Sobre cómo construirlo

Esto no es código que tenés que tipear vos línea por línea. Es producto que tenés que shippear usando IA como pareja de trabajo.

**Sobre Mastra:** lee la docs antes de tipear. Mastra tiene primitivas específicas (agents, tools con schemas Zod, workflows, memory) — usalas idiomáticamente, no las recrees a mano. Si terminás escribiendo tu propio loop de tool-calling, algo salió mal.

**Sobre el proceso de dev con IA:** hay todo un ecosistema de metodologías para trabajar con agentes coding como pareja, no como autocomplete. Ejemplos para que mires: [Superpowers](https://github.com/obra/superpowers) de Jesse Vincent, [Spec-Driven Development / spec-kit](https://github.com/github/spec-kit/blob/main/spec-driven.md) de GitHub. No te pedimos que uses uno específico — sí que tengas un proceso pensado y nos lo cuentes.
Yo preparo documentos detallados: 1) db.md 2) context.md 3) etc. -> cada uno con un dominio particular. Una vez estoy conforme con todos los documentos, paso a implementarlo.

---

## Tu impronta

Lo más fácil es entregar algo que cumple el brief y nada más. Lo más fácil también es lo más fácil de descartar.

Queremos ver **tu mano** en esto. ¿Qué harías si fuera tu producto, no nuestro challenge?

Algunas formas en las que se nota:
- Una tool que no pedimos pero tiene sentido en el dominio (comparar mes vs mes, detectar suscripciones zombi, proyectar fin de mes, lo que veas vos).
- Un detalle de UX con criterio: cómo presentás los tool-calls, qué pasa cuando el agente no sabe, cómo manejás errores.
- Un ángulo de producto que se te ocurre a vos porque vos usarías esto.
- Un uso de Mastra que vaya más allá del happy path: streaming bien hecho, memory que recuerda lo que importa, un workflow donde tenga sentido (no donde quede lindo).

No es "agregar features para impresionar". Es la diferencia entre alguien que ejecuta y alguien con quien queremos construir.

---

## Entregable

Un repo (GitHub o lo que uses) con:

1. **Código.**
2. **README** que explique:
   - Cómo correrlo localmente.
   - Qué tools elegiste para el agente y por qué.
   - Decisiones de producto que tomaste.
   - Qué dejarías para después.
3. **Un writeup corto (1 página)** sobre tu proceso:
   - Cómo te metiste en Mastra. Qué primitivas usaste y por qué. Qué te costó, qué te sorprendió.
   - Qué metodología seguiste para trabajar con la IA durante el desarrollo (specs, planes, subagentes, lo que hayas hecho).
   - Si investigaste herramientas o frameworks adicionales y los descartaste, contanos por qué.
4. **Un loom de 3-5 min** mostrando:
   - La app funcionando.
   - Cómo trabajaste con IA durante el desarrollo. Mostrá prompts y outputs reales, no resumas. Si usaste Cursor, Claude Code, Codex, lo que sea — mostralo.

---

## Cómo te vamos a evaluar

| Criterio | Qué miramos |
|---|---|
| AI-native dev | ¿Usás IA como pareja o como autocomplete? ¿Cómo organizás el trabajo con ella? |
| Profundidad en Mastra | ¿Usaste las primitivas idiomáticamente o lo trataste como API random? |
| Tools del agente | ¿Las tools tienen sentido para el dominio? ¿Pensaste como producto? |
| Velocidad | ¿Pudiste shippear algo funcional en un stack que tal vez no conocés? |
| Comunicación | ¿El writeup y el loom son claros? ¿Sabés explicar lo que hiciste y por qué? |

No miramos: code style, arquitectura tipo libro, performance, tests. PERO, si te interesa: usamos Clean architecture, use-cases, providers, repositories, dependency injection 👀👀👀👀

---

# Starter

Este repo viene con el scaffolding listo. Vos construís el resto encima.

## Estructura

```
gasti-challenge/
├── apps/
│   ├── api/    # NestJS — solo GET /health
│   ├── ui/     # Next.js (App Router) + Tailwind — placeholder
│   └── ai/     # Mastra — agent placeholder, tools/ y workflows/ vacías
└── data/       # transactions.json (50 mock txs ARS, ~60 días) — usalo o reemplazalo
```

Stack del starter: **Bun** workspaces + **Turborepo** + **TypeScript** en todo.

## Setup

```bash
bun install
cp apps/ai/.env.example apps/ai/.env   # agregá tu GEMINI_API_KEY
```

## Run

```bash
bun dev                    # las 3 apps en paralelo (turbo)
bun dev --filter=api       # NestJS         → http://localhost:3001/health
bun dev --filter=ui        # Next.js        → http://localhost:3000
bun dev --filter=ai        # Mastra dev     → playground local
```

## Docs útiles

### Stack

- **Bun** — package manager y runtime · https://bun.sh/docs
- **Turborepo** — task runner / pipeline · https://turborepo.com/docs
- **NestJS** — controllers, modules, providers, DI · https://docs.nestjs.com
- **Next.js (App Router)** — server components, route handlers · https://nextjs.org/docs
- **Tailwind CSS** — utility-first styling · https://tailwindcss.com/docs

### Agente

- **Mastra** — agents, tools (Zod schemas), workflows, memory · https://mastra.ai/docs
- **Mastra Memory** — `lastMessages`, `semanticRecall` (vector + topK + messageRange) y `workingMemory` (template persistente por thread/resource). Paquetes `@mastra/memory` + `@mastra/libsql` para storage local · https://mastra.ai/docs/memory/overview
- **Mastra Tools** — definí tools con `createTool({ id, inputSchema, outputSchema, execute })` y registralas en el agent · https://mastra.ai/docs/agents/using-tools-and-mcp
- **AI SDK (Vercel)** — providers de modelos que Mastra consume (`@ai-sdk/openai`, `@ai-sdk/anthropic`, etc.) · https://ai-sdk.dev/docs

### Proceso con IA

- **Superpowers** (Jesse Vincent) — sistema de skills: brainstorming, writing-plans, TDD, debugging, code-review · https://github.com/obra/superpowers
- **Spec Kit / SDD** (GitHub) — flujo `constitution → specify → clarify → plan → tasks → implement` · https://github.com/github/spec-kit/blob/main/spec-driven.md
