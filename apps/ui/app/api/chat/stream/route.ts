import {
  GENERIC_CHAT_ERROR,
  INVALID_INPUT_ERROR,
  getBackendStreamUrl,
  jsonError,
  normalizeMessages,
} from '../shared';

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError(INVALID_INPUT_ERROR, 400);
  }

  const messages = normalizeMessages(body);

  if (!messages) {
    return jsonError(INVALID_INPUT_ERROR, 400);
  }

  try {
    const backendResponse = await fetch(getBackendStreamUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });

    if (!backendResponse.ok || !backendResponse.body) {
      return jsonError(GENERIC_CHAT_ERROR, backendResponse.status || 502);
    }

    return new Response(backendResponse.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch {
    return jsonError(GENERIC_CHAT_ERROR, 502);
  }
}
