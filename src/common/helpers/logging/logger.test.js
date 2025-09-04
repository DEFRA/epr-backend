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

  it('overloads pino error with error object mapping', () => {
    const errorMessage = 'something went wrong'
    const error = new Error(errorMessage)
    const message = 'log message'

    logger.error(error, { message })

    expect(mockPinoError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        error: {
          type: 'Error',
          message: errorMessage,
          stack_trace: error.stack
        },
        message
      })
    )
  })

  it('calls pino error directly if first argument is not an Error', () => {
    const message = 'plain error message'
    const log = { foo: 'bar' }

    logger.error(message, log)

    expect(mockPinoError).toHaveBeenCalledWith(message, log)
  })

  test.each(['debug', 'fatal', 'info', 'trace', 'warn'])(
    'calls pino method',
    (method) => {
      const message = 'log message'

      logger[method](message)

      expect(mockPino[method]).toHaveBeenCalledExactlyOnceWith(message)
    }
  )
})
