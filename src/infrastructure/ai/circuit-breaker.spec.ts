import type { PinoLogger } from 'nestjs-pino'
import { CircuitBreaker } from './circuit-breaker'

describe('CircuitBreaker', () => {
  let mockLogger: jest.Mocked<PinoLogger>

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<PinoLogger>
  })

  it('should start CLOSED and pass through a successful call', async () => {
    const breaker = new CircuitBreaker(mockLogger, 3, 60_000)

    const result = await breaker.execute(async () => 'ok')

    expect(result).toBe('ok')
    expect(breaker.currentState).toBe('closed')
  })

  it('should stay CLOSED and count failures below the threshold', async () => {
    const breaker = new CircuitBreaker(mockLogger, 3, 60_000)
    const failing = () => Promise.reject(new Error('boom'))

    await expect(breaker.execute(failing)).rejects.toThrow('boom')
    await expect(breaker.execute(failing)).rejects.toThrow('boom')

    expect(breaker.currentState).toBe('closed')
  })

  it('should trip OPEN after reaching the failure threshold, then fail fast without calling fn again', async () => {
    const breaker = new CircuitBreaker(mockLogger, 2, 60_000)
    const failing = jest.fn(() => Promise.reject(new Error('boom')))

    await expect(breaker.execute(failing)).rejects.toThrow('boom')
    await expect(breaker.execute(failing)).rejects.toThrow('boom')
    expect(breaker.currentState).toBe('open')

    const callCountBeforeFastFail = failing.mock.calls.length
    await expect(breaker.execute(failing)).rejects.toThrow('AI service circuit open')
    expect(failing).toHaveBeenCalledTimes(callCountBeforeFastFail) // fn was NOT invoked again
  })

  it('should move to HALF-OPEN after the timeout elapses and CLOSE again on a successful probe', async () => {
    const breaker = new CircuitBreaker(mockLogger, 1, 50)
    const failing = () => Promise.reject(new Error('boom'))

    await expect(breaker.execute(failing)).rejects.toThrow('boom')
    expect(breaker.currentState).toBe('open')

    await new Promise((resolve) => setTimeout(resolve, 60))

    const result = await breaker.execute(async () => 'recovered')

    expect(result).toBe('recovered')
    expect(breaker.currentState).toBe('closed')
  })

  it('should re-open immediately if the HALF-OPEN probe itself fails', async () => {
    const breaker = new CircuitBreaker(mockLogger, 1, 50)
    const failing = () => Promise.reject(new Error('boom'))

    await expect(breaker.execute(failing)).rejects.toThrow('boom')
    await new Promise((resolve) => setTimeout(resolve, 60))

    await expect(breaker.execute(failing)).rejects.toThrow('boom')
    expect(breaker.currentState).toBe('open')
  })
})
