export const DEMO_RESOURCE_ID = 'demo-user';

export type ChatRequestPayload = {
  message: string;
  resourceId: string;
  threadId: string;
};

export function buildChatRequestPayload(message: string, threadId: string): ChatRequestPayload {
  return {
    message,
    resourceId: DEMO_RESOURCE_ID,
    threadId,
  };
}
