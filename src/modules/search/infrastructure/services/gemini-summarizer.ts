import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { CircuitBreaker } from '@/infrastructure/ai/circuit-breaker'
import type { ISummarizer, RagSummary, SummaryContext } from '../../domain/services/summarizer'

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

/**
 * RAG summarization via Google Gemini (REST, no SDK). Alternative adapter behind
 * the SAME ISummarizer port — swapping the LLM provider is one adapter + one line
 * in the module, with zero change to search/handler logic. Same CircuitBreaker.
 */
@Injectable()
export class GeminiSummarizer implements ISummarizer {
  private readonly apiKey: string
  private readonly model: string
  private readonly breaker: CircuitBreaker

  constructor(config: ConfigService, @InjectPinoLogger(GeminiSummarizer.name) logger: PinoLogger) {
    this.apiKey = config.get<string>('env.geminiApiKey') ?? ''
    this.model = config.get<string>('env.geminiModel') ?? 'gemini-2.5-flash'
    this.breaker = new CircuitBreaker(logger)
  }

  async summarize(query: string, context: SummaryContext[]): Promise<RagSummary> {
    return this.breaker.execute(async () => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text:
                  'You are Cortex, a team knowledge assistant. Answer using ONLY the provided ' +
                  'sources. Cite sources inline as [n]. If the sources do not contain the answer, ' +
                  'say so plainly. Be concise.',
              },
            ],
          },
          contents: [{ parts: [{ text: this.buildPrompt(query, context) }] }],
          generationConfig: { maxOutputTokens: 1024 },
        }),
      })

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
    })
  }

  private buildPrompt(query: string, context: SummaryContext[]): string {
    const sources = context
      .map((c, i) => `[${i + 1}] ${c.titleSnapshot}\n${c.content}`)
      .join('\n\n')
    return `Question: ${query}\n\nSources:\n${sources}\n\nAnswer (cite as [n]):`
  }
}
