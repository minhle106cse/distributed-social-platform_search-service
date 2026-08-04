const mockCreate = jest.fn()
const mockAnthropicCtor = jest.fn().mockImplementation(() => ({
  messages: { create: mockCreate },
}))
jest.mock('@anthropic-ai/sdk', () => mockAnthropicCtor)

import { ClaudeSummarizer } from './claude-summarizer'
import type { ClaudeApiCaller } from './claude-api.caller'
import type { SummaryContext } from '../../domain/services/summarizer.service'

describe('ClaudeSummarizer', () => {
  let summarizer: ClaudeSummarizer
  let mockCaller: { call: jest.Mock }
  let mockConfig: { getOrThrow: jest.Mock }

  beforeEach(() => {
    mockCreate.mockReset()
    mockAnthropicCtor.mockClear()
    mockCaller = { call: jest.fn((fn: () => Promise<unknown>) => fn()) }
    mockConfig = {
      getOrThrow: jest.fn((key: string) =>
        key === 'env.anthropicApiKey' ? 'test-key' : 'claude-opus-4-8',
      ),
    }
    summarizer = new ClaudeSummarizer(mockConfig as any, mockCaller as unknown as ClaudeApiCaller)
  })

  it('nên gọi Claude qua caller.call() (circuit breaker) và trả về text + sources đã ghép', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'The answer is [1].' }],
    })
    const context: SummaryContext[] = [
      { knowledgeItemId: 'k1', titleSnapshot: 'Doc A', content: 'body' },
    ]

    const result = await summarizer.summarize('What is X?', context)

    expect(mockCaller.call).toHaveBeenCalledTimes(1)
    expect(result.text).toBe('The answer is [1].')
    expect(result.sources).toEqual([{ knowledgeItemId: 'k1', titleSnapshot: 'Doc A' }])
  })

  it('nên nối nhiều text block lại và trim khoảng trắng thừa', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: 'Part one. ' },
        { type: 'text', text: 'Part two.' },
      ],
    })

    const result = await summarizer.summarize('q', [])

    expect(result.text).toBe('Part one. Part two.')
  })

  it('nên bỏ qua block không phải type text (ví dụ tool_use) khi ghép text', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'tool_use', id: 'x', name: 'y', input: {} },
        { type: 'text', text: 'Only this counts.' },
      ],
    })

    const result = await summarizer.summarize('q', [])

    expect(result.text).toBe('Only this counts.')
  })

  it('nên để lỗi từ caller.call() (breaker open / API lỗi) đi thẳng ra ngoài, không nuốt', async () => {
    mockCaller.call.mockRejectedValueOnce(new Error('Circuit open'))

    await expect(summarizer.summarize('q', [])).rejects.toThrow('Circuit open')
  })

  it('nên override timeout ngắn + tắt maxRetries của SDK — không dùng default 10 phút/2 retries (2026-08-04 fix)', () => {
    // maxRetries: 0 vì ClaudeApiCaller/CircuitBreaker đã là lớp retry/circuit-break
    // của hệ thống — để SDK tự retry ngầm sẽ giấu bớt lỗi thật khỏi breaker và
    // cộng dồn thời gian chờ trên 1 lần caller.call() duy nhất.
    expect(mockAnthropicCtor).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 5000, maxRetries: 0 }),
    )
  })
})
