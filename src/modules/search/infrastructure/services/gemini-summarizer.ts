import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GeminiApiCaller } from './gemini-api.caller'
import type { ISummarizer, RagSummary, SummaryContext } from '../../domain/services/summarizer'
import { RAG_SYSTEM_PROMPT, buildRagPrompt } from '../../domain/services/rag-prompt.builder'

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

/**
 * RAG summarization via Google Gemini (REST, no SDK). Alternative adapter behind
 * the SAME ISummarizer port — swapping the LLM provider is one adapter + one line
 * in the module, with zero change to search/handler logic. Same `GeminiApiCaller`.
 */
@Injectable()
export class GeminiSummarizer implements ISummarizer {
  private readonly apiKey: string
  private readonly model: string

  constructor(config: ConfigService, private readonly caller: GeminiApiCaller) {
    this.apiKey = config.getOrThrow<string>('env.geminiApiKey')
    this.model = config.getOrThrow<string>('env.geminiModel')
  }

  async summarize(query: string, context: SummaryContext[]): Promise<RagSummary> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`
    const res = await this.caller.call(() =>
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: RAG_SYSTEM_PROMPT }],
          },
          contents: [{ parts: [{ text: buildRagPrompt(query, context) }] }],
          generationConfig: { maxOutputTokens: 1024 },
        }),
      }),
    )

    if (!res.ok) {
      throw new Error(`Gemini API ${res.status}: ${await res.text()}`)
    }

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
