import { NextResponse } from 'next/server';

const DEFAULT_CHAT_API_URL = 'http://localhost:3001/chat';
const GENERIC_CHAT_ERROR = 'No pude conectar con Gasti. Revisá que el backend esté corriendo e intentá de nuevo.';
const INVALID_INPUT_ERROR = 'Mandame una pregunta para consultar tus gastos.';
const INVALID_RESPONSE_ERROR = 'Gasti respondió con un formato inesperado. Intentá de nuevo.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractLatestUserMessage(body: unknown): string | null {
  if (!isRecord(body) || !Array.isArray(body.messages)) {
    return null;
  }

  const latestUserMessage = body.messages
    .slice()
    .reverse()
    .find((message) => isRecord(message) && message.role === 'user' && typeof message.content === 'string');

  const content = isRecord(latestUserMessage) ? latestUserMessage.content : null;

  if (typeof content !== 'string') {
    return null;
  }

  const trimmedContent = content.trim();

  return trimmedContent.length > 0 ? trimmedContent : null;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError(INVALID_INPUT_ERROR, 400);
  }

  const latestUserMessage = extractLatestUserMessage(body);

  if (!latestUserMessage) {
    return jsonError(INVALID_INPUT_ERROR, 400);
  }

  const backendUrl = process.env.GASTI_CHAT_API_URL ?? DEFAULT_CHAT_API_URL;

  try {
    const backendResponse = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: latestUserMessage }),
    });

    const backendBody = await backendResponse.json().catch(() => null);

    if (!backendResponse.ok) {
      return jsonError(GENERIC_CHAT_ERROR, backendResponse.status);
    }

    if (!isRecord(backendBody) || typeof backendBody.answer !== 'string') {
      return jsonError(INVALID_RESPONSE_ERROR, 502);
    }

    return NextResponse.json({ answer: backendBody.answer });
  } catch {
    return jsonError(GENERIC_CHAT_ERROR, 502);
  }
}
