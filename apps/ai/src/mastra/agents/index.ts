import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';

export const placeholderAgent = new Agent({
  name: 'Placeholder Agent',
  instructions: 'You are a placeholder agent. Replace me.',
  model: openai('gpt-4o-mini'),
});
