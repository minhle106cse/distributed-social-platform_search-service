import { generateKeyPairSync } from 'crypto'
import type { PinoLogger } from 'nestjs-pino'
import {
  InternalRpc,
  InternalServiceName,
  RagOutcome,
  InternalAssertion,
  StaticKeyResolver,
} from '@distributed-social-platform/shared-kernel'
import type { SearchKnowledgeService } from '@/modules/search/application/queries/search-knowledge.service'
import { RagQueryGrpcService } from './rag-query.grpc-service'

const coreKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
const coreSigner = InternalAssertion.createSigner({
  issuer: InternalServiceName.CoreApi,
  privateKey: coreKeys.privateKey,
})
const resolver = new StaticKeyResolver({ [InternalServiceName.CoreApi]: coreKeys.publicKey })
const validAssertion = (orgId = 'org-1') =>
  coreSigner.sign({
    audience: InternalServiceName.SearchService,
    method: InternalRpc.RagQuery,
    claims: { orgId },
  })

function buildCall(assertion: string | undefined, request: Record<string, unknown> = {}) {
  return {
    metadata: {
      get: (key: string) =>
        key === 'x-internal-assertion' && assertion !== undefined ? [assertion] : [],
    },
    request: { orgId: 'org-1', question: 'q', topK: 5, ...request },
  } as any
}

const chunk = {
  knowledgeItemId: 'k-1',
  titleSnapshot: 'Deploy Guide',
  content: 'nội dung',
  score: 0.9,
}

describe('RagQueryGrpcService', () => {
  let mockSearch: jest.Mocked<SearchKnowledgeService>
  let mockLogger: jest.Mocked<PinoLogger>
  let service: RagQueryGrpcService

  beforeEach(() => {
    mockSearch = { search: jest.fn() } as unknown as jest.Mocked<SearchKnowledgeService>
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<PinoLogger>
    service = new RagQueryGrpcService(mockSearch, mockLogger, resolver)
  })

  async function call(assertion = validAssertion()) {
    const callback = jest.fn()
    service.query(buildCall(assertion), callback)
    await new Promise((r) => setImmediate(r))
    return callback
  }

  it('nên từ chối + log warn khi assertion sai, không chạy search', async () => {
    const callback = await call('not-a-real-token')

    expect(mockSearch.search).not.toHaveBeenCalled()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ context: 'GrpcLayer' }),
      expect.stringContaining('invalid internal assertion'),
    )
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ code: 16 }))
  })

  it('nên từ chối assertion đúc cho org khác — không đọc chéo tenant', async () => {
    const callback = await call(validAssertion('a-different-org'))

    expect(mockSearch.search).not.toHaveBeenCalled()
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ code: 16 }))
  })

  it('nên luôn yêu cầu summarize=true — đây là đường DUY NHẤT còn tạo RAG summary', async () => {
    mockSearch.search.mockResolvedValue({ chunks: [chunk], summary: 'tóm tắt', sources: [] })

    await call()

    expect(mockSearch.search).toHaveBeenCalledWith('org-1', 'q', 5, true)
  })

  // Đây là toàn bộ lý do contract mang enum thay vì `bool degraded`:
  // SearchKnowledgeService trả `summary: null` cho HAI tình huống khác hẳn nhau.
  it('có chunks + có summary → ANSWERED (tính tiền được)', async () => {
    mockSearch.search.mockResolvedValue({
      chunks: [chunk],
      summary: 'tóm tắt',
      sources: [{ knowledgeItemId: 'k-1', titleSnapshot: 'Deploy Guide' }],
    })

    const callback = await call()

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        outcome: RagOutcome.RAG_OUTCOME_ANSWERED,
        summary: 'tóm tắt',
        sources: [{ knowledgeItemId: 'k-1', title: 'Deploy Guide' }],
      }),
    )
  })

  it('KHÔNG có chunk nào → NO_RESULTS, không phải AI_UNAVAILABLE', async () => {
    // Knowledge base rỗng cũng cho summary=null. Nếu map bằng bool thì user nhận
    // 503 "AI hỏng" cho một org đơn giản là chưa có tài liệu nào.
    mockSearch.search.mockResolvedValue({ chunks: [], summary: null, sources: [] })

    const callback = await call()

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ outcome: RagOutcome.RAG_OUTCOME_NO_RESULTS }),
    )
  })

  it('có chunks nhưng summary null → AI_UNAVAILABLE, kèm chunks làm fallback', async () => {
    mockSearch.search.mockResolvedValue({ chunks: [chunk], summary: null, sources: [] })

    const callback = await call()

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        outcome: RagOutcome.RAG_OUTCOME_AI_UNAVAILABLE,
        summary: '',
        chunks: [chunk],
      }),
    )
  })

  it('search throw → INTERNAL, không rò rỉ chi tiết lỗi ra wire', async () => {
    mockSearch.search.mockRejectedValue(new Error('pgvector exploded'))

    const callback = await call()

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ code: 13, message: 'Failed to run RAG query' }),
    )
    expect(mockLogger.error).toHaveBeenCalled()
  })
})
