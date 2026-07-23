const mockCreate = jest.fn()
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }))
})

import { ClaudeSummarizer } from './claude-summarizer'
import type { ClaudeApiCaller } from './claude-api.caller'
import type { SummaryContext } from '../../domain/services/summarizer'

describe('ClaudeSummarizer', () => {
  let summarizer: ClaudeSummarizer
  let mockCaller: { call: jest.Mock }
  let mockConfig: { getOrThrow: jest.Mock }

  beforeEach(() => {
    mockCreate.mockReset()
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
})
