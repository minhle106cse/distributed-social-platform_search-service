import { HttpEmbeddingService } from './http-embedding.service'
import type { OllamaEmbeddingCaller } from './ollama-embedding.caller'

describe('HttpEmbeddingService', () => {
  let service: HttpEmbeddingService
  let mockCaller: { call: jest.Mock }
  let mockConfig: { getOrThrow: jest.Mock }
  let fetchMock: jest.Mock

  beforeEach(() => {
    mockCaller = { call: jest.fn((fn: () => Promise<unknown>) => fn()) }
    mockConfig = {
      getOrThrow: jest.fn((key: string) =>
        key === 'env.embeddingServiceUrl' ? 'http://ollama:11434' : 'nomic-embed-text',
      ),
    }
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    service = new HttpEmbeddingService(
      mockConfig as any,
      mockCaller as unknown as OllamaEmbeddingCaller,
    )
  })

  it('embed() nên gọi embedBatch với 1 phần tử và trả về đúng vector đầu tiên', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] }),
    })

    const result = await service.embed('hello')

    expect(result).toEqual([0.1, 0.2, 0.3])
    expect(fetchMock).toHaveBeenCalledWith(
      'http://ollama:11434/api/embed',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('embedBatch([]) nên trả về [] ngay, không gọi fetch (tránh request rỗng vô nghĩa)', async () => {
    const result = await service.embedBatch([])

    expect(result).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('embedBatch() nên chia request thành nhiều batch khi vượt BATCH_SIZE=16, giữ đúng thứ tự output', async () => {
    const texts = Array.from({ length: 20 }, (_, i) => `text-${i}`)
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embeddings: Array.from({ length: 16 }, (_, i) => [i]) }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embeddings: Array.from({ length: 4 }, (_, i) => [16 + i]) }),
      })

    const result = await service.embedBatch(texts)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(20)
    expect(result[0]).toEqual([0])
    expect(result[19]).toEqual([19])
  })

  it('nên throw khi Ollama trả về status không phải 2xx', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    })

    await expect(service.embed('x')).rejects.toThrow('Embedding service returned 503')
  })

  it('nên throw khi response shape không khớp số lượng input (Ollama trả thiếu/thừa vector)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [] }), // mismatch: 1 input, 0 output
    })

    await expect(service.embed('x')).rejects.toThrow('unexpected shape')
  })

  it('nên gọi fetch qua caller.call() (circuit breaker) chứ không gọi fetch trực tiếp bên ngoài', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ embeddings: [[1]] }) })

    await service.embed('x')

    expect(mockCaller.call).toHaveBeenCalledTimes(1)
  })
})
