import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Anthropic from '@anthropic-ai/sdk'
import { ClaudeApiCaller } from './claude-api.caller'
import type { ISummarizer, RagSummary, SummaryContext } from '../../domain/services/summarizer'
import { RAG_SYSTEM_PROMPT, buildRagPrompt } from '../../domain/services/rag-prompt.builder'

/**
 * RAG summarization via Claude (rag_ai_integration.md). NOT embeddings — Claude
 * only synthesises the answer from retrieved chunks. `ClaudeApiCaller` protects
 * the API call so a slow/failing Anthropic API can't drag search down; when it
 * trips, summarize() throws and the query handler returns chunks with no summary.
 */
@Injectable()
export class ClaudeSummarizer implements ISummarizer {
  private readonly client: Anthropic
  private readonly model: string

  constructor(config: ConfigService, private readonly caller: ClaudeApiCaller) {
    this.client = new Anthropic({ apiKey: config.getOrThrow<string>('env.anthropicApiKey') })
    this.model = config.getOrThrow<string>('env.ragModel')
  }

  async summarize(query: string, context: SummaryContext[]): Promise<RagSummary> {
    const response = await this.caller.call(() =>
      this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: RAG_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildRagPrompt(query, context) }],
      }),
    )

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
  }
}
