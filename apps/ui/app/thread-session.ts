import type { ActivityEvent } from '@/lib/activity';

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

export type NewChatSessionState = {
  threadId: string;
  messages: ChatMessage[];
  latestActivity: ActivityEvent[];
  input: string;
  error: string | null;
};

export const DEMO_THREAD_STORAGE_KEY = 'gasti.threadId';
export const DEMO_DEFAULT_THREAD_ID = 'demo-thread';

export function createInitialChatMessages(): ChatMessage[] {
  return [
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hola, soy Gasti. Preguntame por tus gastos, comparaciones, recurrencias o proyecciones.',
    },
  ];
}

export function createThreadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `thread-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function readOrCreateStoredThreadId(storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined): string {
  const storedThreadId = storage?.getItem(DEMO_THREAD_STORAGE_KEY)?.trim();

  if (storedThreadId) {
    return storedThreadId;
  }

  const nextThreadId = createThreadId();
  storage?.setItem(DEMO_THREAD_STORAGE_KEY, nextThreadId);

  return nextThreadId;
}

export function buildNewChatSessionState(threadId: string): NewChatSessionState {
  return {
    threadId,
    messages: createInitialChatMessages(),
    latestActivity: [],
    input: '',
    error: null,
  };
}
