import { TextChunker } from './text-chunker'

describe('TextChunker', () => {
  let chunker: TextChunker

  beforeEach(() => {
    chunker = new TextChunker()
  })

  it('should return an empty array for empty/whitespace-only text', () => {
    expect(chunker.chunk('')).toEqual([])
    expect(chunker.chunk('   \n  ')).toEqual([])
  })

  it('should return a single chunk when the text fits within chunkSize', () => {
    const text = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ')

    const chunks = chunker.chunk(text, 400, 64)

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toBe(text)
  })

  it('should split long text into multiple overlapping chunks', () => {
    const words = Array.from({ length: 1000 }, (_, i) => `w${i}`)
    const text = words.join(' ')

    const chunks = chunker.chunk(text, 400, 64)

    expect(chunks.length).toBeGreaterThan(1)
    // Overlap: the tail of chunk[0] should reappear at the head of chunk[1].
    const firstChunkWords = chunks[0].split(' ')
    const secondChunkWords = chunks[1].split(' ')
    expect(secondChunkWords[0]).toBe(firstChunkWords[firstChunkWords.length - 64])
  })

  it('should not lose any words across the chunk boundaries (last chunk reaches the end)', () => {
    const words = Array.from({ length: 900 }, (_, i) => `w${i}`)
    const text = words.join(' ')

    const chunks = chunker.chunk(text, 400, 64)
    const lastChunkWords = chunks[chunks.length - 1].split(' ')

    expect(lastChunkWords[lastChunkWords.length - 1]).toBe('w899')
  })
})
