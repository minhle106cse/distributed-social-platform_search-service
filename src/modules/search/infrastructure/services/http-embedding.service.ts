import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { IEmbeddingService } from '../../domain/services/embedding.service'

interface OllamaEmbedResponse {
  embeddings: number[][]
}

/**
 * Adapter to the self-hosted embedding service (Ollama batch API).
 * POST /api/embed { model, input: string[] } -> { embeddings: number[][] }.
 * NOT Anthropic — Claude has no embeddings endpoint.
 */
@Injectable()
export class HttpEmbeddingService implements IEmbeddingService {
  private readonly baseUrl: string
  private readonly model: string

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('env.embeddingServiceUrl') ?? 'http://localhost:8085'
    this.model = config.get<string>('env.embeddingModel') ?? 'nomic-embed-text'
  }

  async embed(text: string): Promise<number[]> {
    const [vector] = await this.embedBatch([text])
    return vector
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []

    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts }),
    })

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
