import { NextResponse } from 'next/server';

import {
  GENERIC_CHAT_ERROR,
  INVALID_INPUT_ERROR,
  INVALID_RESPONSE_ERROR,
  getBackendChatUrl,
  isRecord,
  jsonError,
  normalizeAnswerUi,
  normalizeActivityEvents,
  normalizeChatPayload,
} from './shared';

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError(INVALID_INPUT_ERROR, 400);
  }

  const payload = normalizeChatPayload(body);

  if (!payload) {
    return jsonError(INVALID_INPUT_ERROR, 400);
  }

  try {
    const backendResponse = await fetch(getBackendChatUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const backendBody = await backendResponse.json().catch(() => null);

    if (!backendResponse.ok) {
      return jsonError(GENERIC_CHAT_ERROR, backendResponse.status);
    }

    if (!isRecord(backendBody) || typeof backendBody.answer !== 'string') {
      return jsonError(INVALID_RESPONSE_ERROR, 502);
    }

    const steps = normalizeActivityEvents(backendBody.steps);
    const answerUi = normalizeAnswerUi(backendBody.answerUi);

    return NextResponse.json({ answer: backendBody.answer, ...(steps ? { steps } : {}), ...(answerUi ? { answerUi } : {}) });
  } catch {
    return jsonError(GENERIC_CHAT_ERROR, 502);
  }
}
