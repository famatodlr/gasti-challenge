export const DEMO_USER_RESOURCE_ID = 'demo-user';
export const DEMO_DEFAULT_MEMORY_THREAD_ID = 'demo-thread';

export type DemoMemoryContext = {
  resource: string;
  thread: { id: string };
};

export function normalizeDemoResourceId(resourceId: string | undefined): string {
  return normalizeDemoIdentifier(resourceId, DEMO_USER_RESOURCE_ID);
}

export function normalizeDemoThreadId(threadId: string | undefined): string {
  return normalizeDemoIdentifier(threadId, DEMO_DEFAULT_MEMORY_THREAD_ID);
}

export function createDemoMemoryContext({
  resourceId,
  threadId,
}: {
  resourceId?: string;
  threadId?: string;
} = {}): DemoMemoryContext {
  return {
    resource: normalizeDemoResourceId(resourceId),
    thread: { id: normalizeDemoThreadId(threadId) },
  };
}

function normalizeDemoIdentifier(value: string | undefined, fallback: string): string {
  const trimmedValue = value?.trim();
  return trimmedValue || fallback;
}
