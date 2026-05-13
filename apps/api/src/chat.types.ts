export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export const MAX_CHAT_MESSAGE_CONTENT_LENGTH = 8000;
export const MAX_LEGACY_STATELESS_MESSAGES = 20;

export type ChatRequestBody = {
  message?: unknown;
  messages?: unknown;
  resourceId?: unknown;
  threadId?: unknown;
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

export type ChatRequestContext = {
  resourceId?: string;
  threadId?: string;
};

export type ChatRequestMode = 'memory' | 'stateless';

export type ChatRequestSource = 'message' | 'messages';

export type ChatRequestMetadata = {
  source: ChatRequestSource;
  originalMessageCount: number;
  normalizedMessageCount: number;
  usesMemory: boolean;
  mixedLegacyNormalized: boolean;
  legacyContextCapped: boolean;
  localDemoFallbackThread: boolean;
  hasResourceId: boolean;
  hasThreadId: boolean;
};

export type NormalizedChatRequest = {
  mode: ChatRequestMode;
  messages: ChatMessage[];
  context: ChatRequestContext;
  metadata: ChatRequestMetadata;
};
