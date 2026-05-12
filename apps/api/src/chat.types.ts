export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatRequestBody = {
  message?: unknown;
  messages?: unknown;
};

export type ChatActivityEventType = 'status' | 'tool_call' | 'tool_result' | 'warning' | 'error' | 'final_answer';

export type ChatActivityEvent = {
  type: ChatActivityEventType;
  label: string;
  toolName?: string;
  timestamp?: string;
  answer?: string;
};

export type ChatResponseBody = {
  answer: string;
  steps?: ChatActivityEvent[];
};
