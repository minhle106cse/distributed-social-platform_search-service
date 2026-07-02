export const EMBEDDING_SERVICE = Symbol('EMBEDDING_SERVICE')

/**
 * Port to the embedding provider. Cortex uses a self-hosted local model
 * (Ollama nomic-embed-text, dim 768) — Claude has NO embeddings API. Swapping to
 * Voyage/OpenAI is a new adapter; changing dim means migrating the vector column.
 */
export interface IEmbeddingService {
  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
}
