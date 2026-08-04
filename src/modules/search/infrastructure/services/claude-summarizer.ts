import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Anthropic from '@anthropic-ai/sdk'
import { ClaudeApiCaller } from './claude-api.caller'
import type {
  ISummarizerService,
  RagSummary,
  SummaryContext,
} from '../../domain/services/summarizer.service'
import { RAG_SYSTEM_PROMPT, buildRagPrompt } from '../../domain/services/rag-prompt.builder'

// Fixed algorithm constant, same convention/value as HttpEmbeddingService's
// REQUEST_TIMEOUT_MS — this is a synchronous search-hot-path call, not
// background work, so it needs the same bound as every other hot-path call in
// this service (ollama-embedding, elasticsearch-search).
const REQUEST_TIMEOUT_MS = 5000

/**
 * RAG summarization via Claude (rag_ai_integration.md). NOT embeddings — Claude
 * only synthesises the answer from retrieved chunks. `ClaudeApiCaller` protects
 * the API call so a slow/failing Anthropic API can't drag search down; when it
 * trips, summarize() throws and the query handler returns chunks with no summary.
 *
 * `timeout`/`maxRetries` overridden from the SDK's own defaults (10 min timeout,
 * 2 retries) — 2026-08-04 audit: the default timeout is far longer than every
 * other hot-path call bound in this service, and the SDK's own retrying happens
 * INSIDE a single caller.call() attempt, silently hiding real failures from the
 * breaker's failure count (and stacking its own retry/backoff on top of the
 * breaker's, a duplicate resilience mechanism with different semantics — same
 * class of issue as not double-wrapping indexItem() in a breaker, see
 * resilience_patterns.md §3.1).
 */
@Injectable()
export class ClaudeSummarizer implements ISummarizerService {
  private readonly client: Anthropic
  private readonly model: string

  constructor(
    config: ConfigService,
    private readonly caller: ClaudeApiCaller,
  ) {
    this.client = new Anthropic({
      apiKey: config.getOrThrow<string>('env.anthropicApiKey'),
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 0,
    })
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
