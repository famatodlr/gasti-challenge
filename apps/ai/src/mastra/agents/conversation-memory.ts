import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';

import type { MastraMessageV1 } from '@mastra/core/memory';
import type { MastraMessageV2 } from '@mastra/core/agent';
import type { MemoryConfig, SharedMemoryConfig } from '@mastra/core/memory';
import { createDemoMemoryContext } from '../domain/demo-context.ts';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export const memoryDatabasePath = resolve(currentDirectory, '../../../.mastra/memory.db');

mkdirSync(dirname(memoryDatabasePath), { recursive: true });

export type GastiConversationMemoryContext = {
  resource: string;
  thread: { id: string };
};

type GastiConversationMemoryIdentifiers = {
  resourceId?: string;
  threadId?: string;
};

type SaveMessagesArgs =
  | {
      messages: (MastraMessageV1 | MastraMessageV2)[] | MastraMessageV1[] | MastraMessageV2[];
      memoryConfig?: MemoryConfig;
      format?: 'v1';
    }
  | {
      messages: (MastraMessageV1 | MastraMessageV2)[] | MastraMessageV1[] | MastraMessageV2[];
      memoryConfig?: MemoryConfig;
      format: 'v2';
    };

const gastiConversationMemoryOptions: MemoryConfig = {
  lastMessages: 20,
  semanticRecall: false,
  workingMemory: { enabled: false },
  threads: { generateTitle: false },
};

const transactionIdPattern = /\btxn_\d{3,}\b/gi;

export function createGastiConversationMemoryContext({
  resourceId,
  threadId,
}: GastiConversationMemoryIdentifiers = {}): GastiConversationMemoryContext {
  return createDemoMemoryContext({ resourceId, threadId });
}

export function sanitizeMastraMemoryMessagesForGasti<T extends MastraMessageV1 | MastraMessageV2>(
  messages: readonly T[],
): T[] {
  return messages
    .map((message) => sanitizeMastraMemoryMessageForGasti(message))
    .filter((message): message is T => Boolean(message));
}

function sanitizeMastraMemoryMessageForGasti<T extends MastraMessageV1 | MastraMessageV2>(message: T): T | null {
  if (isMastraMessageV2(message)) {
    return sanitizeMastraMemoryMessageV2(message) as T | null;
  }

  return sanitizeMastraMemoryMessageV1(message) as T | null;
}

function isMastraMessageV2(message: MastraMessageV1 | MastraMessageV2): message is MastraMessageV2 {
  return (
    Boolean((message as MastraMessageV2).content) &&
    typeof (message as MastraMessageV2).content === 'object' &&
    !Array.isArray((message as MastraMessageV2).content) &&
    (message as MastraMessageV2).content.format === 2
  );
}

function sanitizeMastraMemoryMessageV2(message: MastraMessageV2): MastraMessageV2 | null {
  const textParts = (message.content.parts ?? [])
    .filter((part): part is { type: 'text'; text: string } => {
      return isRecord(part) && part.type === 'text' && typeof part.text === 'string';
    })
    .map((part) => ({ type: 'text' as const, text: sanitizeMemoryText(part.text) }))
    .filter((part) => part.text.length > 0);

  const contentText =
    typeof message.content.content === 'string' ? sanitizeMemoryText(message.content.content) : undefined;

  const parts = textParts.length > 0 ? textParts : contentText ? [{ type: 'text' as const, text: contentText }] : [];

  if (parts.length === 0) {
    return null;
  }

  return {
    id: message.id,
    role: message.role,
    createdAt: message.createdAt,
    threadId: message.threadId,
    resourceId: message.resourceId,
    type: message.type,
    content: {
      format: 2,
      content: contentText,
      parts,
    },
  };
}

function sanitizeMastraMemoryMessageV1(message: MastraMessageV1): MastraMessageV1 | null {
  const content = message.content;

  if (typeof content === 'string') {
    const sanitizedContent = sanitizeMemoryText(content);

    return sanitizedContent ? { ...message, content: sanitizedContent } : null;
  }

  if (!Array.isArray(content)) {
    return { ...message };
  }

  const sanitizedContent = content
    .filter((part): part is { type: 'text'; text: string } => {
      return isRecord(part) && part.type === 'text' && typeof part.text === 'string';
    })
    .map((part) => ({ type: 'text' as const, text: sanitizeMemoryText(part.text) }))
    .filter((part) => part.text.length > 0);

  return sanitizedContent.length > 0 ? { ...message, content: sanitizedContent } : null;
}

function sanitizeMemoryText(value: string): string {
  return value.replace(transactionIdPattern, '[redacted-transaction-id]').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export class SanitizedGastiMemory extends Memory {
  saveMessages(args: {
    messages: (MastraMessageV1 | MastraMessageV2)[] | MastraMessageV1[] | MastraMessageV2[];
    memoryConfig?: MemoryConfig | undefined;
    format?: 'v1';
  }): Promise<MastraMessageV1[]>;
  saveMessages(args: {
    messages: (MastraMessageV1 | MastraMessageV2)[] | MastraMessageV1[] | MastraMessageV2[];
    memoryConfig?: MemoryConfig | undefined;
    format: 'v2';
  }): Promise<MastraMessageV2[]>;
  async saveMessages(args: SaveMessagesArgs): Promise<MastraMessageV1[] | MastraMessageV2[]> {
    return await super.saveMessages({
      ...args,
      messages: sanitizeMastraMemoryMessagesForGasti(args.messages),
    } as never);
  }

  async updateWorkingMemory(): Promise<void> {
    throw new Error('Mastra working memory is disabled for Gasti conversation memory.');
  }

  async __experimental_updateWorkingMemoryVNext(): Promise<{ success: boolean; reason: string }> {
    return {
      success: false,
      reason: 'Mastra working memory is disabled for Gasti conversation memory.',
    };
  }
}

export const gastiConversationMemory = new SanitizedGastiMemory({
  storage: new LibSQLStore({ url: `file:${memoryDatabasePath}` }) as unknown as SharedMemoryConfig['storage'],
  options: gastiConversationMemoryOptions,
} satisfies SharedMemoryConfig);
