# Final Checklist

Usar este checklist antes de grabar el Loom o mostrar la demo final.

## Setup

- [ ] `GEMINI_API_KEY` configurada en el entorno actual
- [ ] Dependencias instaladas con `bun install`
- [ ] Confirmar que los puertos esperados siguen siendo `7310` para UI y `7311` para API

## Reset demo

- [ ] Detener AI/API si ya estaban corriendo
- [ ] Ejecutar `bun run demo:reset-memory`
- [ ] Confirmar que la demo arranca desde estado limpio

## Validación automatizada

- [ ] Ejecutar `bun run build`
- [ ] Ejecutar `cd apps/ai && bun run test:domain && bun run test:tools && bun run test:agents && bun run test:workflows && bun run verify:domain`
- [ ] Ejecutar `cd apps/api && bun run test`
- [ ] Ejecutar `cd apps/ui && bun run test`

## Smoke manual

- [ ] Levantar `bun run dev`
- [ ] Abrir la UI en `http://localhost:7310`
- [ ] Confirmar que el chat responde
- [ ] Confirmar que una comparación de períodos devuelve números y explicación
- [ ] Confirmar que una pregunta de recurrencias devuelve merchants plausibles
- [ ] Confirmar que una pregunta de proyección devuelve caveats razonables

## Sanity checks de memoria

- [ ] Verificar que un follow-up dentro del mismo thread conserve contexto conversacional
- [ ] Verificar que “nuevo chat” cree un thread nuevo sin reset global
- [ ] Verificar que el reset por terminal vuelva a limpiar conversación y memoria financiera demo

## Revisión de entrega

- [ ] Leer [README.md](/Users/franco/Documentos/gasti-challenge/README.md) como si fuera la única puerta de entrada
- [ ] Revisar [docs/demo-memory.md](/Users/franco/Documentos/gasti-challenge/docs/demo-memory.md)
- [ ] Revisar [docs/writeup-draft.md](/Users/franco/Documentos/gasti-challenge/docs/writeup-draft.md)
- [ ] Revisar [docs/demo-flow.md](/Users/franco/Documentos/gasti-challenge/docs/demo-flow.md) antes de grabar
- [ ] Confirmar que el material no promete features fuera del alcance actual
