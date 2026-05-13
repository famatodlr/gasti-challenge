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

export type ChatResponseBody = {
  answer: string;
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
