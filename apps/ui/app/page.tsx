'use client';

import Image from 'next/image';
import { FormEvent, useEffect, useRef, useState } from 'react';

import {
  createActivityFeedItems,
  normalizeActivityEvent,
  normalizeActivityEvents,
  type ActivityEvent,
  type ActivityFeedStatus,
} from '@/lib/activity';
import { buildChatRequestPayload } from './chat-request';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
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

const THREAD_STORAGE_KEY = 'gasti.threadId';
const LOCAL_DEMO_DEFAULT_THREAD_ID = 'demo-thread';

const initialMessages: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content: 'Hola, soy Gasti. Preguntame por tus gastos, comparaciones, recurrencias o proyecciones.',
  },
];

function createMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
  };
}

function createThreadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `thread-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readOrCreateStoredThreadId(): string {
  if (typeof window === 'undefined') {
    return LOCAL_DEMO_DEFAULT_THREAD_ID;
  }

  const storedThreadId = window.localStorage.getItem(THREAD_STORAGE_KEY)?.trim();

  if (storedThreadId) {
    return storedThreadId;
  }

  const nextThreadId = createThreadId();
  window.localStorage.setItem(THREAD_STORAGE_KEY, nextThreadId);

  return nextThreadId;
}

function getErrorMessage(payload: ChatResponse | null): string {
  if (payload && typeof payload.error === 'string') {
    return payload.error;
  }

  return 'No pude conectar con Gasti. Revisá que el backend esté corriendo e intentá de nuevo.';
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

function activityLabelClass(status: ActivityFeedStatus): string {
  if (status === 'error') {
    return 'text-[#ff9ba3]';
  }

  if (status === 'warning') {
    return 'text-[#f0c56b]';
  }

  if (status === 'active') {
    return 'text-[#f7fff8]';
  }

  return 'text-[#94a098]';
}

function activityDotClass(status: ActivityFeedStatus): string {
  if (status === 'error') {
    return 'border-[#ff9ba3] bg-[#ff6b75] shadow-[0_0_0_4px_rgba(255,107,117,0.08)]';
  }

  if (status === 'warning') {
    return 'border-[#f0c56b] bg-[#f0c56b] shadow-[0_0_0_4px_rgba(240,197,107,0.08)]';
  }

  if (status === 'active') {
    return 'border-[#d9ff99] bg-[#b7f56a] shadow-[0_0_0_5px_rgba(163,230,53,0.12)]';
  }

  return 'border-[#3b4740] bg-[#111713]';
}

export default function Page() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [latestActivity, setLatestActivity] = useState<ActivityEvent[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState(LOCAL_DEMO_DEFAULT_THREAD_ID);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isSendingRef = useRef(false);
  const activityItems = createActivityFeedItems(latestActivity);

  useEffect(() => {
    setThreadId(readOrCreateStoredThreadId());
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  function getActiveThreadId(): string {
    const activeThreadId = readOrCreateStoredThreadId();

    if (activeThreadId !== threadId) {
      setThreadId(activeThreadId);
    }

    return activeThreadId;
  }

  function buildRequestPayload(content: string) {
    return buildChatRequestPayload(content, getActiveThreadId());
  }

  function appendActivity(event: ActivityEvent) {
    setLatestActivity((currentEvents) => [...currentEvents, event]);
  }

  async function sendFallbackMessage(content: string) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestPayload(content)),
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

  async function sendStreamingMessage(content: string): Promise<boolean> {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestPayload(content)),
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

        let parsedEvent: unknown;

        try {
          parsedEvent = JSON.parse(data);
        } catch {
          continue;
        }

        const event = normalizeActivityEvent(parsedEvent);

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
      const streamed = await sendStreamingMessage(trimmedContent);

      if (!streamed) {
        await sendFallbackMessage(trimmedContent);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : getErrorMessage(null));
    } finally {
      isSendingRef.current = false;
      setIsLoading(false);
    }
  }

  function startNewChat() {
    const nextThreadId = createThreadId();

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THREAD_STORAGE_KEY, nextThreadId);
    }

    setThreadId(nextThreadId);
    setMessages(initialMessages);
    setInput('');
    setError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050706] px-3 py-4 text-[#edf2ee] sm:px-5 lg:px-7">
      <section className="mx-auto flex min-h-[calc(100vh-32px)] w-full max-w-6xl flex-col gap-4 lg:h-[calc(100vh-32px)] lg:min-h-[700px]">
        <header className="rounded-lg border border-[#202822] bg-[#0b0f0c] px-4 py-3 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <Image
                src="/gasti-logo.png"
                width={204}
                height={50}
                alt="Gasti"
                priority
                className="h-auto w-[136px] shrink-0 sm:w-[154px]"
              />
              <div className="hidden h-9 w-px bg-[#243028] sm:block" aria-hidden="true" />
              <div className="min-w-0">
                <h1 className="sr-only">Gasti</h1>
                <p className="truncate text-sm font-medium text-[#dfe8e1]">Tu asistente financiero</p>
                <p className="mt-0.5 text-xs text-[#77817a]">Conversaciones sobre gastos en ARS</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={startNewChat}
                disabled={isLoading}
                className="rounded-md border border-[#27322a] bg-[#101611] px-3 py-2 text-xs font-semibold text-[#b9c5bd] transition-colors hover:border-[#a3e635]/60 hover:text-[#d9ff99] focus-visible:border-[#a3e635]/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#a3e635]/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Nuevo chat
              </button>
              <div className="flex items-center gap-2 text-xs font-medium text-[#93a093]">
                <span className="h-2 w-2 rounded-full bg-[#a3e635] shadow-[0_0_0_4px_rgba(163,230,53,0.08)]" />
                En línea
              </div>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-h-[560px] flex-col overflow-hidden rounded-lg border border-[#202822] bg-[#0b0f0c] shadow-[0_24px_80px_rgba(0,0,0,0.35)] lg:min-h-0">
            <div className="flex items-center justify-between gap-3 border-b border-[#202822] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[#f7fff8]">Chat financiero</h2>
                <p className="mt-0.5 truncate text-xs text-[#77817a]">
                  Consultas sobre gastos, recurrencias y proyecciones
                </p>
              </div>
              <div className="shrink-0 rounded-full border border-[#a3e635]/20 bg-[#a3e635]/10 px-2.5 py-1 text-xs font-semibold text-[#bef264]">
                Live
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
              <div className="space-y-4">
                {messages.map((message) => {
                  const isUser = message.role === 'user';

                  return (
                    <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[90%] whitespace-pre-wrap break-words rounded-lg px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[74%] ${
                          isUser
                            ? 'rounded-br-sm border border-[#9bdc4f]/25 bg-[#1d3216] text-[#f6ffe8]'
                            : 'rounded-bl-sm border border-[#252e28] bg-[#111713] text-[#dde5df]'
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  );
                })}

                {isLoading ? (
                  <div className="flex justify-start" aria-live="polite">
                    <div className="rounded-lg rounded-bl-sm border border-[#252e28] bg-[#111713] px-4 py-3 text-sm text-[#8f9a92] shadow-sm">
                      Procesando…
                    </div>
                  </div>
                ) : null}

                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="border-t border-[#202822] bg-[#090d0a] px-4 py-4 sm:px-5">
              {error ? (
                <div
                  className="mb-3 rounded-md border border-[#7f2c32] bg-[#2a1216] px-3 py-2 text-sm text-[#ff9ba3]"
                  role="alert"
                >
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
                    className="rounded-full border border-[#27322a] bg-[#101611] px-3 py-2 text-left text-xs text-[#b9c5bd] transition-colors hover:border-[#a3e635]/60 hover:text-[#d9ff99] focus-visible:border-[#a3e635]/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#a3e635]/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {question}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
                <input
                  name="message"
                  aria-label="Mensaje para Gasti"
                  autoComplete="off"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  disabled={isLoading}
                  placeholder="Preguntá por tus gastos…"
                  className="min-w-0 flex-1 rounded-md border border-[#27322a] bg-[#0f1511] px-4 py-3 text-sm text-[#f4f8f5] outline-none transition-colors placeholder:text-[#667069] focus:border-[#a3e635]/70 focus:ring-4 focus:ring-[#a3e635]/10 disabled:cursor-not-allowed disabled:opacity-70"
                />
                <button
                  type="submit"
                  disabled={isLoading || input.trim().length === 0}
                  className="rounded-md border border-[#b7f56a]/20 bg-[#a3e635] px-5 py-3 text-sm font-semibold text-[#102006] transition-colors hover:bg-[#bef264] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#a3e635]/20 disabled:cursor-not-allowed disabled:border-[#3b443d] disabled:bg-[#27322a] disabled:text-[#78837b] sm:w-auto"
                >
                  Enviar
                </button>
              </form>
            </div>
          </section>

          <aside className="flex min-h-[320px] max-h-[440px] flex-col overflow-hidden rounded-lg border border-[#202822] bg-[#0b0f0c] shadow-[0_24px_80px_rgba(0,0,0,0.28)] lg:max-h-none">
            <div className="border-b border-[#202822] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-[#f7fff8]">Actividad del agente</h2>
                  <p className="mt-0.5 text-xs text-[#77817a]">
                    {isLoading ? 'En curso' : latestActivity.length > 0 ? 'Última respuesta' : 'En espera'}
                  </p>
                </div>
                {activityItems.length > 0 ? (
                  <span className="shrink-0 text-xs font-medium text-[#79847d]">
                    {activityItems.length === 1 ? '1 paso' : `${activityItems.length} pasos`}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
              {activityItems.length === 0 ? (
                <div className="flex h-full min-h-[220px] items-center justify-center px-4 text-center text-sm leading-6 text-[#6f7a72]">
                  La actividad aparecerá cuando Gasti procese tu próxima consulta.
                </div>
              ) : (
                <ol className="space-y-0">
                  {activityItems.map((item, index) => {
                    const time = formatActivityTime(item.timestamp);

                    return (
                      <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
                        <div className="relative flex w-4 shrink-0 justify-center">
                          {index < activityItems.length - 1 ? (
                            <span
                              className="absolute bottom-[-1rem] top-4 w-px bg-[#1f2923]"
                              aria-hidden="true"
                            />
                          ) : null}
                          <span
                            className={`relative z-10 mt-1 h-2.5 w-2.5 rounded-full border ${activityDotClass(
                              item.status,
                            )}`}
                            aria-hidden="true"
                          />
                        </div>
                        <div className="min-w-0 flex-1 pb-0.5">
                          <div className="flex items-start justify-between gap-3">
                            <p className={`break-words text-sm font-medium leading-5 ${activityLabelClass(item.status)}`}>
                              {item.label}
                            </p>
                            {time ? (
                              <span className="shrink-0 pt-0.5 text-[11px] leading-4 text-[#637069]">{time}</span>
                            ) : null}
                          </div>
                          {item.detail ? (
                            <p className="mt-1 break-words font-mono text-[11px] leading-4 text-[#69746d]">
                              {item.detail}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
