import { Mastra } from '@mastra/core';
import { placeholderAgent } from './agents';

export const mastra = new Mastra({
  agents: { placeholderAgent },
});
