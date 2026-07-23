import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OllamaEmbeddingCaller } from './ollama-embedding.caller'
import type { IEmbeddingService } from '../../domain/services/embedding.service'

interface OllamaEmbedResponse {
  embeddings: number[][]
}

// Fixed algorithm constants (never vary per instance/environment) — module-level,
// not `this.x` (see resilience_patterns.md convention note under item 1's side quests).
const REQUEST_TIMEOUT_MS = 5000

/**
 * Adapter to the self-hosted embedding service (Ollama batch API).
 * POST /api/embed { model, input: string[] } -> { embeddings: number[][] }.
 * NOT Anthropic — Claude has no embeddings endpoint.
 *
 * `OllamaEmbeddingCaller` protects the raw call (Circuit Breaker) + a
 * per-request timeout (Ollama can hang instead of erroring under load — fetch
 * alone never bounds that), same discipline as Claude/GeminiApiCaller
 * (resilience_patterns.md §3.1.2). This path is on the synchronous search hot
 * path (SearchKnowledgeService calls embedBatch([query]) on every query), not
 * just the async indexer consumer.
 */
@Injectable()
export class HttpEmbeddingService implements IEmbeddingService {
  private readonly baseUrl: string
  private readonly model: string

  constructor(
    config: ConfigService,
    private readonly caller: OllamaEmbeddingCaller,
  ) {
    this.baseUrl = config.getOrThrow<string>('env.embeddingServiceUrl')
    this.model = config.getOrThrow<string>('env.embeddingModel')
  }

  // A 100k-char body chunks into ~60+ texts; sending them in one request gives
  // the embedder an unbounded payload and unbounded latency. Cap each request.
  private static readonly BATCH_SIZE = 16

  async embed(text: string): Promise<number[]> {
    const [vector] = await this.embedBatch([text])
    return vector
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []

    const out: number[][] = []
    for (let i = 0; i < texts.length; i += HttpEmbeddingService.BATCH_SIZE) {
      const slice = texts.slice(i, i + HttpEmbeddingService.BATCH_SIZE)
      out.push(...(await this.embedSlice(slice)))
    }
    return out
  }

  private async embedSlice(texts: string[]): Promise<number[][]> {
    const res = await this.caller.call(() =>
      fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, input: texts }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    )

    if (!res.ok) {
      throw new Error(`Embedding service returned ${res.status}: ${await res.text()}`)
    }

    const data = (await res.json()) as OllamaEmbedResponse
    if (!data.embeddings || data.embeddings.length !== texts.length) {
      throw new Error('Embedding service returned an unexpected shape')
    }
    return data.embeddings
  }
}
