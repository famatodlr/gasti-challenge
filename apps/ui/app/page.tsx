'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

import { buildChatRequestPayload } from './chat-request';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type ChatResponse = {
  answer?: unknown;
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

export default function Page() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState(LOCAL_DEMO_DEFAULT_THREAD_ID);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isSendingRef = useRef(false);

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

  async function sendMessage(content: string) {
    const trimmedContent = content.trim();

    if (!trimmedContent || isSendingRef.current) {
      return;
    }

    isSendingRef.current = true;

    const userMessage = createMessage('user', trimmedContent);
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput('');
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildChatRequestPayload(trimmedContent, getActiveThreadId())),
      });

      const payload = (await response.json().catch(() => null)) as ChatResponse | null;

      if (!response.ok) {
        throw new Error(getErrorMessage(payload));
      }

      if (!payload || typeof payload.answer !== 'string') {
        throw new Error('Gasti respondió con un formato inesperado.');
      }

      setMessages((currentMessages) => [...currentMessages, createMessage('assistant', payload.answer as string)]);
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
    <main className="flex min-h-screen items-center justify-center bg-[#f3f6f4] px-4 py-6 text-[#202421] sm:px-6">
      <section className="flex h-[min(860px,calc(100vh-48px))] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[#d9e2dd] bg-[#fbfdfc] shadow-[0_24px_70px_rgba(32,36,33,0.12)]">
        <header className="border-b border-[#dfe7e2] px-5 py-5 sm:px-7">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-normal text-[#161616]">Gasti</h1>
                <p className="mt-1 text-sm text-[#66746b]">Tu asistente financiero</p>
              </div>
              <button
                type="button"
                onClick={startNewChat}
                disabled={isLoading}
                className="shrink-0 rounded-md border border-[#cbd8d1] bg-white px-3 py-2 text-sm font-medium text-[#435048] transition hover:border-[#1f6f5b] hover:text-[#1f6f5b] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Nuevo chat
              </button>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-7">
            <div className="space-y-4">
              {messages.map((message) => {
                const isUser = message.role === 'user';

                return (
                  <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[84%] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[72%] ${
                        isUser
                          ? 'rounded-br-md bg-[#1f6f5b] text-white'
                          : 'rounded-bl-md border border-[#dfe7e2] bg-white text-[#2a2f2b]'
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                );
              })}

              {isLoading ? (
                <div className="flex justify-start">
                  <div className="rounded-lg rounded-bl-md border border-[#dfe7e2] bg-white px-4 py-3 text-sm text-[#66746b] shadow-sm">
                    Pensando...
                  </div>
                </div>
              ) : null}

              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="border-t border-[#dfe7e2] bg-[#eef6f2] px-4 py-4 sm:px-7">
            {error ? (
              <div className="mb-3 rounded-md border border-[#f0c6b7] bg-[#fff1ec] px-3 py-2 text-sm text-[#98452f]">
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
                  className="rounded-full border border-[#cbd8d1] bg-white px-3 py-2 text-left text-sm text-[#435048] transition hover:border-[#1f6f5b] hover:text-[#1f6f5b] disabled:cursor-not-allowed disabled:opacity-50"
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
                className="min-w-0 flex-1 rounded-md border border-[#cbd8d1] bg-white px-4 py-3 text-sm text-[#202421] outline-none transition placeholder:text-[#849188] focus:border-[#1f6f5b] focus:ring-4 focus:ring-[#1f6f5b]/10 disabled:cursor-not-allowed disabled:opacity-70"
              />
              <button
                type="submit"
                disabled={isLoading || input.trim().length === 0}
                className="rounded-md bg-[#1f6f5b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#195a4b] disabled:cursor-not-allowed disabled:bg-[#9eb8af]"
              >
                Enviar
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
