import { vi } from 'vitest'

let logger
beforeAll(async () => {
  ;({ logger } = await import('./logger.js'))
})

const mockPinoDebug = vi.fn()
const mockPinoError = vi.fn()
const mockPinoFatal = vi.fn()
const mockPinoInfo = vi.fn()
const mockPinoTrace = vi.fn()
const mockPinoWarn = vi.fn()

const mockPino = {
  debug: mockPinoDebug,
  error: mockPinoError,
  fatal: mockPinoFatal,
  info: mockPinoInfo,
  trace: mockPinoTrace,
  warn: mockPinoWarn
}

vi.mock('pino', () => ({
  pino: vi.fn(() => mockPino)
}))

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test.each(['debug', 'error', 'fatal', 'info', 'trace', 'warn'])(
    'calls pino %s method',
    (method) => {
      const message = 'log message'

      logger[method](message)

      expect(mockPino[method]).toHaveBeenCalledExactlyOnceWith(message)
    }
  )
})
