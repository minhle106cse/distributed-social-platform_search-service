/**
 * Fixed-size word-window chunking with overlap (rag_ai_integration.md §5).
 * ~400 words ≈ 512 tokens, 64-word overlap keeps context continuous across cuts.
 * Pure domain logic — no framework deps (domain layer stays NestJS-free); Nest
 * still DI-instantiates it as a zero-arg provider.
 */
export class TextChunker {
  chunk(text: string, chunkSize = 400, overlap = 64): string[] {
    const words = text.split(/\s+/).filter((w) => w.length > 0)
    if (words.length === 0) return []
    if (words.length <= chunkSize) return [words.join(' ')]

    const step = Math.max(1, chunkSize - overlap)
    const chunks: string[] = []
    for (let start = 0; start < words.length; start += step) {
      chunks.push(words.slice(start, start + chunkSize).join(' '))
      if (start + chunkSize >= words.length) break
    }
    return chunks
  }
}
