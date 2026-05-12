'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

type ChatRole = 'user' | 'assistant';
type ActivityType = 'status' | 'tool_call' | 'tool_result' | 'warning' | 'error' | 'final_answer';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type ApiChatMessage = {
  role: ChatRole;
  content: string;
};

type ActivityEvent = {
  type: ActivityType;
  label: string;
  toolName?: string;
  timestamp?: string;
  answer?: string;
};

type ChatResponse = {
  answer?: unknown;
  steps?: unknown;
  error?: unknown;
};

const starterQuestions = [
  '¿Cuánto gasté en mayo de 2026?',
  'Comparame mis gastos de mayo contra abril',
  'Detectá mis gastos recurrentes',
  'Proyectá mi gasto de este mes',
];

const initialMessages: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content: 'Hola, soy Gasti. Preguntame por tus gastos, comparaciones, recurrencias o proyecciones.',
  },
];

const supportedActivityTypes = new Set<ActivityType>([
  'status',
  'tool_call',
  'tool_result',
  'warning',
  'error',
  'final_answer',
]);

function createMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeActivityEvent(value: unknown): ActivityEvent | null {
  if (!isRecord(value) || typeof value.type !== 'string' || !supportedActivityTypes.has(value.type as ActivityType)) {
    return null;
  }

  if (typeof value.label !== 'string' || value.label.trim().length === 0) {
    return null;
  }

  return {
    type: value.type as ActivityType,
    label: value.label,
    toolName: typeof value.toolName === 'string' ? value.toolName : undefined,
    timestamp: typeof value.timestamp === 'string' ? value.timestamp : undefined,
    answer: typeof value.answer === 'string' ? value.answer : undefined,
  };
}

function normalizeActivityEvents(value: unknown): ActivityEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((event) => normalizeActivityEvent(event)).filter((event): event is ActivityEvent => event !== null);
}

function getErrorMessage(payload: ChatResponse | null): string {
  if (payload && typeof payload.error === 'string') {
    return payload.error;
  }

  return 'No pude conectar con Gasti. Revisá que el backend esté corriendo e intentá de nuevo.';
}

function toApiMessages(messages: ChatMessage[]): ApiChatMessage[] {
  return messages
    .filter((message) => message.id !== 'welcome')
    .map(({ role, content }) => ({ role, content: content.trim() }))
    .filter((message) => message.content.length > 0);
}

function formatActivityTime(timestamp: string | undefined): string {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function activityTone(type: ActivityType): string {
  if (type === 'error') {
    return 'border-[#7f2c32] bg-[#2a1216] text-[#ff9ba3]';
  }

  if (type === 'warning') {
    return 'border-[#6e4f1f] bg-[#241d0e] text-[#f0c56b]';
  }

  if (type === 'tool_call') {
    return 'border-[#365339] bg-[#101b12] text-[#b7f56a]';
  }

  if (type === 'tool_result' || type === 'final_answer') {
    return 'border-[#2d4d46] bg-[#0d1917] text-[#8ee7d0]';
  }

  return 'border-[#2d332f] bg-[#101311] text-[#d8ded9]';
}

function activityDot(type: ActivityType): string {
  if (type === 'error') {
    return 'bg-[#ff6b75]';
  }

  if (type === 'warning') {
    return 'bg-[#f0c56b]';
  }

  if (type === 'tool_call') {
    return 'bg-[#b7f56a]';
  }

  if (type === 'tool_result' || type === 'final_answer') {
    return 'bg-[#8ee7d0]';
  }

  return 'bg-[#7f8a82]';
}

export default function Page() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [latestActivity, setLatestActivity] = useState<ActivityEvent[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isSendingRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  function appendActivity(event: ActivityEvent) {
    setLatestActivity((currentEvents) => [...currentEvents, event]);
  }

  async function sendFallbackMessage(nextMessages: ChatMessage[]) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: toApiMessages(nextMessages),
      }),
    });

    const payload = (await response.json().catch(() => null)) as ChatResponse | null;

    if (!response.ok) {
      throw new Error(getErrorMessage(payload));
    }

    if (!payload || typeof payload.answer !== 'string') {
      throw new Error('Gasti respondió con un formato inesperado.');
    }

    setLatestActivity(normalizeActivityEvents(payload.steps));
    setMessages((currentMessages) => [...currentMessages, createMessage('assistant', payload.answer as string)]);
  }

  async function sendStreamingMessage(nextMessages: ChatMessage[]): Promise<boolean> {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: toApiMessages(nextMessages),
      }),
    });

    if (!response.ok || !response.body) {
      return false;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let receivedEvent = false;
    let finalAnswer = '';

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const frames = buffer.split(/\n\n/);
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');

        if (!data) {
          continue;
        }

        const event = normalizeActivityEvent(JSON.parse(data));

        if (!event) {
          continue;
        }

        receivedEvent = true;
        appendActivity(event);

        if (event.type === 'error') {
          throw new Error(event.label);
        }

        if (event.type === 'final_answer' && typeof event.answer === 'string') {
          finalAnswer = event.answer;
        }
      }

      if (done) {
        break;
      }
    }

    if (!receivedEvent) {
      return false;
    }

    if (!finalAnswer) {
      throw new Error('Gasti no devolvió una respuesta final.');
    }

    setMessages((currentMessages) => [...currentMessages, createMessage('assistant', finalAnswer)]);
    return true;
  }

  async function sendMessage(content: string) {
    const trimmedContent = content.trim();

    if (!trimmedContent || isSendingRef.current) {
      return;
    }

    isSendingRef.current = true;

    const userMessage = createMessage('user', trimmedContent);
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setLatestActivity([]);
    setInput('');
    setError(null);
    setIsLoading(true);

    try {
      const streamed = await sendStreamingMessage(nextMessages);

      if (!streamed) {
        await sendFallbackMessage(nextMessages);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : getErrorMessage(null));
    } finally {
      isSendingRef.current = false;
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <main className="min-h-screen bg-[#050706] px-4 py-5 text-[#edf2ee] sm:px-6 lg:px-8">
      <section className="mx-auto flex h-[calc(100vh-40px)] min-h-[720px] w-full max-w-6xl flex-col gap-4">
        <header className="rounded-lg border border-[#202822] bg-[#0b0f0c] px-5 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[#a3e635]/30 bg-[#a3e635]/10 text-sm font-bold text-[#bef264]">
                  G
                </div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-normal text-[#f7fff8]">Gasti</h1>
                  <p className="mt-0.5 text-sm text-[#89948b]">Tu asistente financiero</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs sm:min-w-[330px]">
              <div className="rounded-md border border-[#202822] bg-[#0f1511] px-3 py-2">
                <p className="text-[#6f7a72]">Datos</p>
                <p className="mt-1 font-semibold text-[#dce7de]">Mock ARS</p>
              </div>
              <div className="rounded-md border border-[#202822] bg-[#0f1511] px-3 py-2">
                <p className="text-[#6f7a72]">Modo</p>
                <p className="mt-1 font-semibold text-[#bef264]">Live</p>
              </div>
              <div className="rounded-md border border-[#202822] bg-[#0f1511] px-3 py-2">
                <p className="text-[#6f7a72]">Tools</p>
                <p className="mt-1 font-semibold text-[#dce7de]">Auditables</p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#202822] bg-[#0b0f0c] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between border-b border-[#202822] px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-sm font-semibold text-[#f7fff8]">Chat financiero</h2>
                <p className="mt-0.5 text-xs text-[#77817a]">Consultas sobre gastos, recurrencias y proyecciones</p>
              </div>
              <div className="rounded-full border border-[#a3e635]/25 bg-[#a3e635]/10 px-3 py-1 text-xs font-semibold text-[#bef264]">
                Online
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
              <div className="space-y-4">
                {messages.map((message) => {
                  const isUser = message.role === 'user';

                  return (
                    <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[88%] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[74%] ${
                          isUser
                            ? 'rounded-br-sm border border-[#9bdc4f]/25 bg-[#1f3517] text-[#f6ffe8]'
                            : 'rounded-bl-sm border border-[#252e28] bg-[#111713] text-[#dde5df]'
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  );
                })}

                {isLoading ? (
                  <div className="flex justify-start">
                    <div className="rounded-lg rounded-bl-sm border border-[#252e28] bg-[#111713] px-4 py-3 text-sm text-[#8f9a92] shadow-sm">
                      Procesando...
                    </div>
                  </div>
                ) : null}

                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="border-t border-[#202822] bg-[#090d0a] px-4 py-4 sm:px-5">
              {error ? (
                <div className="mb-3 rounded-md border border-[#7f2c32] bg-[#2a1216] px-3 py-2 text-sm text-[#ff9ba3]">
                  {error}
                </div>
              ) : null}

              <div className="mb-4 flex flex-wrap gap-2">
                {starterQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => void sendMessage(question)}
                    disabled={isLoading}
                    className="rounded-full border border-[#27322a] bg-[#101611] px-3 py-2 text-left text-xs text-[#b9c5bd] transition hover:border-[#a3e635]/60 hover:text-[#d9ff99] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {question}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  disabled={isLoading}
                  placeholder="Preguntá por tus gastos..."
                  className="min-w-0 flex-1 rounded-md border border-[#27322a] bg-[#0f1511] px-4 py-3 text-sm text-[#f4f8f5] outline-none transition placeholder:text-[#667069] focus:border-[#a3e635]/70 focus:ring-4 focus:ring-[#a3e635]/10 disabled:cursor-not-allowed disabled:opacity-70"
                />
                <button
                  type="submit"
                  disabled={isLoading || input.trim().length === 0}
                  className="rounded-md border border-[#b7f56a]/20 bg-[#a3e635] px-5 py-3 text-sm font-semibold text-[#102006] transition hover:bg-[#bef264] disabled:cursor-not-allowed disabled:border-[#3b443d] disabled:bg-[#27322a] disabled:text-[#78837b]"
                >
                  Enviar
                </button>
              </form>
            </div>
          </section>

          <aside className="flex min-h-[320px] flex-col rounded-lg border border-[#202822] bg-[#0b0f0c] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="border-b border-[#202822] px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-[#f7fff8]">Actividad del agente</h2>
                  <p className="mt-0.5 text-xs text-[#77817a]">Última respuesta</p>
                </div>
                <div className="rounded-md border border-[#27322a] bg-[#101611] px-2.5 py-1 text-xs font-semibold text-[#a3e635]">
                  {latestActivity.length}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {latestActivity.length === 0 ? (
                <div className="flex h-full min-h-[220px] items-center justify-center rounded-md border border-dashed border-[#27322a] px-5 text-center text-sm text-[#6f7a72]">
                  La actividad aparecerá cuando Gasti procese tu próxima consulta.
                </div>
              ) : (
                <div className="space-y-2">
                  {latestActivity.map((event, index) => {
                    const time = formatActivityTime(event.timestamp);

                    return (
                      <div
                        key={`${event.type}-${event.timestamp ?? index}-${index}`}
                        className={`rounded-md border px-3 py-2.5 ${activityTone(event.type)}`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${activityDot(event.type)}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="break-words text-sm font-medium leading-5">{event.label}</p>
                              {time ? <span className="shrink-0 text-[11px] opacity-60">{time}</span> : null}
                            </div>
                            {event.toolName ? (
                              <p className="mt-1 break-words font-mono text-[11px] text-[#8b978f]">{event.toolName}</p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
