import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GeminiApiCaller } from './gemini-api.caller'
import type {
  ISummarizerService,
  RagSummary,
  SummaryContext,
} from '../../domain/services/summarizer.service'
import { RAG_SYSTEM_PROMPT, buildRagPrompt } from '../../domain/services/rag-prompt.builder'

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

// Fixed algorithm constant, same convention/value as HttpEmbeddingService's
// REQUEST_TIMEOUT_MS — this call had NO timeout at all before 2026-08-04
// (unlike Ollama's fetch(), which already used AbortSignal.timeout) — a
// hanging Gemini response could block a search request indefinitely.
const REQUEST_TIMEOUT_MS = 5000

/**
 * RAG summarization via Google Gemini (REST, no SDK). Alternative adapter behind
 * the SAME ISummarizerService port — swapping the LLM provider is one adapter + one line
 * in the module, with zero change to search/handler logic. Same `GeminiApiCaller`.
 */
@Injectable()
export class GeminiSummarizer implements ISummarizerService {
  private readonly apiKey: string
  private readonly model: string

  constructor(
    config: ConfigService,
    private readonly caller: GeminiApiCaller,
  ) {
    this.apiKey = config.getOrThrow<string>('env.geminiApiKey')
    this.model = config.getOrThrow<string>('env.geminiModel')
  }

  async summarize(query: string, context: SummaryContext[]): Promise<RagSummary> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`
    // `!res.ok` check MUST stay inside the wrapped closure, not after
    // caller.call() returns — fetch() only rejects on network failure, never
    // on HTTP status, so a 4xx/5xx here would otherwise resolve as a breaker
    // "success" and the breaker would never trip on a real Gemini outage
    // (2026-08-04 audit, same class of bug as the ALREADY_EXISTS one fixed
    // earlier — this time a fault silently NOT counted, not the reverse).
    const res = await this.caller.call(async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: RAG_SYSTEM_PROMPT }],
          },
          contents: [{ parts: [{ text: buildRagPrompt(query, context) }] }],
          generationConfig: { maxOutputTokens: 1024 },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) {
        throw new Error(`Gemini API ${response.status}: ${await response.text()}`)
      }
      return response
    })

    const data = (await res.json()) as GeminiResponse
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
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
