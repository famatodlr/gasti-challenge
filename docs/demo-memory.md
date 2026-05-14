# Demo Memory

Este proyecto usa dos capas distintas de memoria para la demo. Entender esa diferencia ayuda a evitar confusión cuando se resetea el estado o se muestra continuidad entre preguntas.

## 1. Memoria conversacional

- Tecnología: Mastra Memory con storage local LibSQL.
- Ubicación local: `apps/ai/.mastra/memory.db`
- Archivos asociados: `memory.db-shm`, `memory.db-wal`
- Función: recordar el historial conversacional por `resourceId` y `threadId`

Esto permite que un thread conserve contexto sin que la UI tenga que reenviar toda la conversación en cada request.

## 2. Memoria financiera

- Tecnología: JSON estructurado propio del proyecto
- Estado runtime: `data/financial-memory.json`
- Seed base inmutable: `data/financial-memory.seed.json`
- Función: guardar contexto financiero explícito y estable del usuario demo
- Estado inicial de demo: semilla vacía, sin ingresos, metas ni categorías vigiladas precargadas

Ejemplos de lo que puede vivir ahí:

- ingresos conocidos
- metas de ahorro
- categorías a vigilar
- preferencias de respuesta
- gastos fijos confirmados

## Qué hace cada comando de reset

Desde la raíz del repo:

```bash
bun run demo:reset-memory
```

- Borra la memoria conversacional persistida del demo:
  - `apps/ai/.mastra/memory.db`
  - `apps/ai/.mastra/memory.db-shm`
  - `apps/ai/.mastra/memory.db-wal`
- Restaura `data/financial-memory.json` desde `data/financial-memory.seed.json`
- Después del reset, `¿Qué recordás de mí?` no debería mencionar metas o datos demo previos

Solo memoria conversacional:

```bash
bun run demo:reset-memory:conversation
```

- Borra únicamente la base local de Mastra Memory y sus archivos asociados.

Solo memoria financiera:

```bash
bun run demo:reset-memory:financial
```

- Restaura únicamente `data/financial-memory.json` desde el seed base.
- Ese seed base hoy representa una memoria financiera vacía.

## Qué no resetea

- No modifica `data/transactions.json`
- No toca código ni configuración
- No cambia puertos
- No agrega un nuevo usuario demo
- No reemplaza el botón de “nuevo chat” de la UI

`Nuevo chat` crea un thread nuevo, pero no implica un reset global de la memoria demo.

## Flujo recomendado antes de demo

1. Detener AI/API si estaban levantados.
2. Correr:

```bash
bun run demo:reset-memory
```

3. Levantar la app:

```bash
bun run dev
```

4. Empezar la demo desde ese estado limpio.

## Recomendación práctica

Para máxima confiabilidad, corré el reset con AI/API detenidos. Así el borrado de la base local de memoria no compite con procesos abiertos.
