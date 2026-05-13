export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatRequestBody = {
  message?: unknown;
  messages?: unknown;
  resourceId?: unknown;
  threadId?: unknown;
};

export type ChatResponseBody = {
  answer: string;
};

export type ChatRequestContext = {
  resourceId?: string;
  threadId?: string;
};
