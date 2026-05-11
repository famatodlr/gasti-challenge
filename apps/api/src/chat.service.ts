import { Inject, Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { gastiFinanceAgent } from 'ai/mastra';

type AgentGenerateOptions = {
  maxSteps?: number;
};

type AgentGenerateResult = {
  text: string;
};

export type FinanceAgent = {
  generate: (message: string, options?: AgentGenerateOptions) => Promise<AgentGenerateResult>;
};

export const GASTI_FINANCE_AGENT = Symbol('GASTI_FINANCE_AGENT');

export const defaultFinanceAgent: FinanceAgent = {
  generate: (message, options) => gastiFinanceAgent.generate(message, options),
};

@Injectable()
export class ChatService {
  constructor(@Inject(GASTI_FINANCE_AGENT) private readonly agent: FinanceAgent = defaultFinanceAgent) {}

  async answer(message: string): Promise<string> {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
      throw new ServiceUnavailableException('GOOGLE_GENERATIVE_AI_API_KEY is required to use the chat endpoint.');
    }

    try {
      const result = await this.agent.generate(message, { maxSteps: 5 });

      if (!result.text.trim()) {
        throw new Error('Agent returned an empty answer.');
      }

      return result.text;
    } catch {
      throw new InternalServerErrorException('Failed to generate a chat answer.');
    }
  }
}
