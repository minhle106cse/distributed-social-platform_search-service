import { GeminiSummarizer } from './gemini-summarizer'
import type { GeminiApiCaller } from './gemini-api.caller'
import type { SummaryContext } from '../../domain/services/summarizer.service'

describe('GeminiSummarizer', () => {
  let summarizer: GeminiSummarizer
  let mockCaller: { call: jest.Mock }
  let mockConfig: { getOrThrow: jest.Mock }
  let fetchMock: jest.Mock

  beforeEach(() => {
    mockCaller = { call: jest.fn((fn: () => Promise<unknown>) => fn()) }
    mockConfig = {
      getOrThrow: jest.fn((key: string) =>
        key === 'env.geminiApiKey' ? 'test-key' : 'gemini-2.5-flash',
      ),
    }
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    summarizer = new GeminiSummarizer(mockConfig as any, mockCaller as unknown as GeminiApiCaller)
  })

  it('nên gọi Gemini qua caller.call() và trả về text + sources đã ghép', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Answer [1].' }] } }] }),
    })
    const context: SummaryContext[] = [
      { knowledgeItemId: 'k1', titleSnapshot: 'Doc A', content: 'body' },
    ]

    const result = await summarizer.summarize('q', context)

    expect(mockCaller.call).toHaveBeenCalledTimes(1)
    expect(result.text).toBe('Answer [1].')
    expect(result.sources).toEqual([{ knowledgeItemId: 'k1', titleSnapshot: 'Doc A' }])
  })

  it('nên throw kèm status + body khi Gemini API trả lỗi HTTP', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limited',
    })

    await expect(summarizer.summarize('q', [])).rejects.toThrow('Gemini API 429')
  })

  it('nên trả text rỗng (không throw) khi response không có candidates', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })

    const result = await summarizer.summarize('q', [])

    expect(result.text).toBe('')
  })

  it('nên gửi đúng model + apiKey vào URL/header của request', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'x' }] } }] }),
    })

    await summarizer.summarize('q', [])

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain('gemini-2.5-flash:generateContent')
    expect(options.headers['x-goog-api-key']).toBe('test-key')
  })

  it('nên gửi request kèm AbortSignal timeout — trước 2026-08-04 fix call này KHÔNG có timeout nào cả', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'x' }] } }] }),
    })

    await summarizer.summarize('q', [])

    const [, options] = fetchMock.mock.calls[0]
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it('status không phải 2xx phải reject NGAY BÊN TRONG hàm truyền cho caller.call() — breaker phải thấy đây là failure thật, không phải success (2026-08-04 fix)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'down' })

    await expect(summarizer.summarize('q', [])).rejects.toThrow('Gemini API 500')

    // fetch() tự nó KHÔNG reject khi status non-2xx — nếu code lỡ để check
    // `!res.ok` chạy SAU khi caller.call() đã resolve, wrappedFn() ở đây sẽ
    // resolve chứ không reject, và breaker sẽ tính nhầm là success.
    const wrappedFn = mockCaller.call.mock.calls[0][0]
    await expect(wrappedFn()).rejects.toThrow('Gemini API 500')
  })
})
