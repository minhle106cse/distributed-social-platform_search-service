import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import Anthropic from '@anthropic-ai/sdk'
import { CircuitBreaker } from '@/infrastructure/ai/circuit-breaker'
import type { ISummarizer, RagSummary, SummaryContext } from '../../domain/services/summarizer'

/**
 * RAG summarization via Claude (rag_ai_integration.md). NOT embeddings — Claude
 * only synthesises the answer from retrieved chunks. Every call goes through a
 * Circuit Breaker so a slow/failing Anthropic API can't drag search down; when it
 * trips, summarize() throws and the query handler returns chunks with no summary.
 */
@Injectable()
export class ClaudeSummarizer implements ISummarizer {
  private readonly client: Anthropic
  private readonly model: string
  private readonly breaker: CircuitBreaker

  constructor(config: ConfigService, @InjectPinoLogger(ClaudeSummarizer.name) logger: PinoLogger) {
    this.client = new Anthropic({ apiKey: config.get<string>('env.anthropicApiKey') ?? '' })
    this.model = config.get<string>('env.ragModel') ?? 'claude-opus-4-8'
    this.breaker = new CircuitBreaker(logger)
  }

  async summarize(query: string, context: SummaryContext[]): Promise<RagSummary> {
    return this.breaker.execute(async () => {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system:
          'You are Cortex, a team knowledge assistant. Answer the question using ONLY the ' +
          'provided sources. Cite sources inline as [n]. If the sources do not contain the ' +
          'answer, say so plainly. Be concise.',
        messages: [{ role: 'user', content: this.buildPrompt(query, context) }],
      })

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')
        .trim()

      return {
        text,
        sources: context.map((c) => ({
          knowledgeItemId: c.knowledgeItemId,
          titleSnapshot: c.titleSnapshot,
        })),
      }
    })
  }

  private buildPrompt(query: string, context: SummaryContext[]): string {
    const sources = context
      .map((c, i) => `[${i + 1}] ${c.titleSnapshot}\n${c.content}`)
      .join('\n\n')
    return `Question: ${query}\n\nSources:\n${sources}\n\nAnswer (cite as [n]):`
  }
}
