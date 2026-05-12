export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatRequestBody = {
  message?: unknown;
  messages?: unknown;
};

export type ChatResponseBody = {
  answer: string;
};
