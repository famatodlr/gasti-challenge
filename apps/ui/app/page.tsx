'use client';

import Image from 'next/image';
import { FormEvent, useEffect, useRef, useState } from 'react';

import {
  createActivityFeedItems,
  normalizeActivityEvent,
  normalizeActivityEvents,
  type ActivityEvent,
} from '@/lib/activity';
import { normalizeAnswerUi, type AssistantAnswerUi, PlainChatText } from '@/lib/assistant-markdown';
import { ActivityRail, AssistantMessageCard } from '@/lib/chat-ui';
import { buildChatRequestPayload } from './chat-request';
import {
  buildNewChatSessionState,
  createInitialChatMessages,
  createThreadId,
  DEMO_DEFAULT_THREAD_ID,
  DEMO_THREAD_STORAGE_KEY,
  type ChatMessage as SessionChatMessage,
  type ChatRole,
  readOrCreateStoredThreadId as readOrCreateStoredThreadIdFromStorage,
} from './thread-session';

type ChatResponse = {
  answer?: unknown;
  steps?: unknown;
  answerUi?: unknown;
  error?: unknown;
};

type ChatMessage = SessionChatMessage & {
  answerUi?: AssistantAnswerUi | null;
};

const starterQuestions = [
  '¿Cuánto gasté en mayo de 2026?',
  'Comparame mis gastos de mayo contra abril',
  'Detectá mis gastos recurrentes',
  'Proyectá mi gasto de este mes',
];

const initialMessages: ChatMessage[] = createInitialChatMessages();

function createMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
  };
}

function readOrCreateStoredThreadId(): string {
  if (typeof window === 'undefined') {
    return DEMO_DEFAULT_THREAD_ID;
  }

  return readOrCreateStoredThreadIdFromStorage(window.localStorage);
}

function getErrorMessage(payload: ChatResponse | null): string {
  if (payload && typeof payload.error === 'string') {
    return payload.error;
  }

  return 'No pude conectar con Gasti. Revisá que el backend esté corriendo e intentá de nuevo.';
}

export default function Page() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [latestActivity, setLatestActivity] = useState<ActivityEvent[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState(DEMO_DEFAULT_THREAD_ID);
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
    setMessages((currentMessages) => [
      ...currentMessages,
      { ...createMessage('assistant', payload.answer as string), answerUi: normalizeAnswerUi(payload.answerUi) },
    ]);
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
    let finalAnswerUi: AssistantAnswerUi | null = null;

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
          finalAnswerUi = normalizeAnswerUi(event.answerUi);
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

    setMessages((currentMessages) => [...currentMessages, { ...createMessage('assistant', finalAnswer), answerUi: finalAnswerUi }]);
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
      window.localStorage.setItem(DEMO_THREAD_STORAGE_KEY, nextThreadId);
    }

    const nextState = buildNewChatSessionState(nextThreadId);

    setThreadId(nextState.threadId);
    setMessages(nextState.messages);
    setLatestActivity(nextState.latestActivity);
    setInput(nextState.input);
    setError(nextState.error);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--bg-base)] px-3 py-4 text-[var(--text-primary)] sm:px-5 lg:px-7">
      <section className="mx-auto flex min-h-[calc(100vh-32px)] w-full max-w-7xl flex-col gap-4 lg:h-[calc(100vh-32px)] lg:min-h-[700px]">
        <header className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3 shadow-[var(--shadow-lg)] sm:px-5">
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
              <div className="hidden h-9 w-px bg-[var(--border-subtle)] sm:block" aria-hidden="true" />
              <div className="min-w-0">
                <h1 className="sr-only">Gasti</h1>
                <p className="truncate text-sm font-medium text-[var(--text-secondary)]">Tu asistente financiero</p>
                <p className="mt-0.5 text-xs text-[var(--text-dim)]">Conversaciones sobre gastos en ARS</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={startNewChat}
                disabled={isLoading}
                className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-soft)] hover:text-[var(--text-primary)] focus-visible:border-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring-focus)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Nuevo chat
              </button>
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-dim)]">
                <span className="h-2 w-2 rounded-full bg-[var(--accent-primary)] shadow-[0_0_0_4px_rgba(167,201,107,0.12)]" />
                En línea
              </div>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_270px] xl:grid-cols-[minmax(0,1fr)_290px]">
          <section className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] shadow-[var(--shadow-lg)] lg:min-h-0">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Chat financiero</h2>
                <p className="mt-0.5 truncate text-xs text-[var(--text-dim)]">
                  Consultas sobre gastos, recurrencias y proyecciones
                </p>
              </div>
              <div className="shrink-0 rounded-full border border-[color:color-mix(in_srgb,var(--accent-primary),transparent_70%)] bg-[color:color-mix(in_srgb,var(--accent-primary),transparent_88%)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-primary)]">
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
                        className={`max-w-[90%] break-words text-sm leading-6 sm:max-w-[78%] ${
                          isUser
                            ? 'whitespace-pre-wrap rounded-2xl rounded-br-md border border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-3 text-[var(--text-primary)] shadow-[0_8px_24px_rgba(0,0,0,0.2)]'
                            : ''
                        }`}
                      >
                        {isUser ? (
                          <PlainChatText content={message.content} />
                        ) : (
                          <AssistantMessageCard
                            content={message.content}
                            answerUi={message.answerUi}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}

                {isLoading ? (
                  <div className="flex justify-start" aria-live="polite">
                    <div className="rounded-2xl rounded-bl-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-muted)] shadow-sm">
                      Procesando…
                    </div>
                  </div>
                ) : null}

                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-4 sm:px-5">
              {error ? (
                <div
                  className="mb-3 rounded-md border border-[color:color-mix(in_srgb,var(--state-error),transparent_46%)] bg-[color:color-mix(in_srgb,var(--state-error),transparent_86%)] px-3 py-2 text-sm text-[var(--state-error)]"
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
                    className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3.5 py-2 text-left text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--border-soft)] hover:text-[var(--text-primary)] focus-visible:border-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring-focus)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {question}
                  </button>
                ))}
              </div>

              <form
                onSubmit={handleSubmit}
                className="flex flex-col gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-2)] p-2.5 shadow-[inset_0_1px_0_rgba(242,241,236,0.03)] sm:flex-row"
              >
                <input
                  name="message"
                  aria-label="Mensaje para Gasti"
                  autoComplete="off"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  disabled={isLoading}
                  placeholder="Preguntá por tus gastos…"
                  className="min-w-0 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-3)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-dim)] focus:border-[var(--accent-active)] focus:ring-4 focus:ring-[var(--ring-focus)] disabled:cursor-not-allowed disabled:opacity-70"
                />
                <button
                  type="submit"
                  disabled={isLoading || input.trim().length === 0}
                  className="rounded-xl border border-[color:color-mix(in_srgb,var(--accent-primary),transparent_55%)] bg-[var(--accent-primary)] px-5 py-3 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring-focus)] disabled:cursor-not-allowed disabled:border-[var(--border-subtle)] disabled:bg-[var(--surface-3)] disabled:text-[var(--text-dim)] sm:w-auto"
                >
                  Enviar
                </button>
              </form>
            </div>
          </section>

          <aside className="order-last lg:order-none">
            <ActivityRail items={activityItems} isLoading={isLoading} />
          </aside>
        </div>
      </section>
    </main>
  );
}
