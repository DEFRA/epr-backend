import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { failAction as _failAction } from './fail-action.js'

/** @type {any} */
const failAction = _failAction

vi.mock('#root/config.js', () => ({
  getConfig: vi.fn(() => ({
    get: vi.fn((key) => {
      if (key === 'cdpEnvironment') return 'dev'
      return undefined
    })
  }))
}))

describe('#fail-action', () => {
  const createMockRequest = () => ({
    logger: {
      warn: vi.fn()
    }
  })

  const createJoiValidationError = () => {
    /** @type {any} */
    const error = new Error('"redirectUrl" is required')
    error.isJoi = true
    error.details = [
      {
        message: '"redirectUrl" is required',
        path: ['redirectUrl'],
        type: 'any.required',
        context: { key: 'redirectUrl', label: 'redirectUrl' }
      }
    ]
    return error
  }

  describe('Joi validation errors', () => {
    test('converts to Boom.badData with 422 status code', () => {
      const mockRequest = createMockRequest()
      const joiError = createJoiValidationError()

      expect(() => failAction(mockRequest, {}, joiError)).toThrow()

      try {
        failAction(mockRequest, {}, joiError)
      } catch (/** @type {any} */ error) {
        expect(error.isBoom).toBe(true)
        expect(error.output.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
        expect(error.message).toBe('"redirectUrl" is required')
        expect(error.data).toEqual(joiError.details)
      }
    })

    test('logs at warn level', () => {
      const mockRequest = createMockRequest()
      const joiError = createJoiValidationError()

      expect(() => failAction(mockRequest, {}, joiError)).toThrow()

      expect(mockRequest.logger.warn).toHaveBeenCalledTimes(1)
    })

    test('includes Joi details in message in non-prod environment', () => {
      const mockRequest = createMockRequest()
      const joiError = createJoiValidationError()

      expect(() => failAction(mockRequest, {}, joiError)).toThrow()

      const logCall = mockRequest.logger.warn.mock.calls[0][0]
      expect(logCall.message).toContain('"redirectUrl" is required')
      expect(logCall.message).toContain('| data:')
      expect(logCall.message).toContain('any.required')
    })

    test('passes Boom error under err key for serialisation', () => {
      const mockRequest = createMockRequest()
      const joiError = createJoiValidationError()

      expect(() => failAction(mockRequest, {}, joiError)).toThrow()

      const logCall = mockRequest.logger.warn.mock.calls[0][0]
      expect(logCall.err.isBoom).toBe(true)
      expect(logCall.err.output.statusCode).toBe(
        StatusCodes.UNPROCESSABLE_ENTITY
      )
    })

    test('logs correct event metadata', () => {
      const mockRequest = createMockRequest()
      const joiError = createJoiValidationError()

      expect(() => failAction(mockRequest, {}, joiError)).toThrow()

      const logCall = mockRequest.logger.warn.mock.calls[0][0]
      expect(logCall.event).toEqual({
        category: 'server',
        action: 'response_failure'
      })
      expect(logCall.http.response.status_code).toBe(
        StatusCodes.UNPROCESSABLE_ENTITY
      )
    })
  })

  describe('Boom errors (from custom validate functions)', () => {
    test('passes through unchanged preserving status code', () => {
      const mockRequest = createMockRequest()
      const boomError = Boom.badRequest('Invalid payload')

      expect(() => failAction(mockRequest, {}, boomError)).toThrow()

      try {
        failAction(mockRequest, {}, boomError)
      } catch (/** @type {any} */ error) {
        expect(error.isBoom).toBe(true)
        expect(error.output.statusCode).toBe(StatusCodes.BAD_REQUEST)
        expect(error.message).toBe('Invalid payload')
      }
    })

    test('logs at warn level with original status code', () => {
      const mockRequest = createMockRequest()
      const boomError = Boom.badRequest('Invalid payload')

      expect(() => failAction(mockRequest, {}, boomError)).toThrow()

      const logCall = mockRequest.logger.warn.mock.calls[0][0]
      expect(logCall.err).toBe(boomError)
      expect(logCall.http.response.status_code).toBe(StatusCodes.BAD_REQUEST)
    })

    test('does NOT add Joi details to message for Boom errors', () => {
      const mockRequest = createMockRequest()
      const boomError = Boom.badRequest('Invalid payload')

      expect(() => failAction(mockRequest, {}, boomError)).toThrow()

      const logCall = mockRequest.logger.warn.mock.calls[0][0]
      expect(logCall.message).toBe('Invalid payload')
      expect(logCall.message).not.toContain('| data:')
    })
  })

  describe('other errors', () => {
    test('re-throws error as-is', () => {
      const mockRequest = createMockRequest()
      const genericError = new Error('Something went wrong')

      expect(() => failAction(mockRequest, {}, genericError)).toThrow(
        'Something went wrong'
      )
    })

    test('logs with 500 status code', () => {
      const mockRequest = createMockRequest()
      const genericError = new Error('Something went wrong')

      expect(() => failAction(mockRequest, {}, genericError)).toThrow()

      const logCall = mockRequest.logger.warn.mock.calls[0][0]
      expect(logCall.http.response.status_code).toBe(500)
    })

    test('handles string errors', () => {
      const mockRequest = createMockRequest()
      const stringError = 'Something terrible has happened!'

      expect(() => failAction(mockRequest, {}, stringError)).toThrow()

      const logCall = mockRequest.logger.warn.mock.calls[0][0]
      expect(logCall.message).toBe('Something terrible has happened!')
    })
  })
})

describe('#fail-action (production)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('#root/config.js', () => ({
      getConfig: vi.fn(() => ({
        get: vi.fn((key) => {
          if (key === 'cdpEnvironment') return 'prod'
          return undefined
        })
      }))
    }))
  })

  afterEach(() => {
    vi.doUnmock('#root/config.js')
  })

  test('does NOT include Joi details in message in production', async () => {
    const { failAction: _prodFailAction } = await import('./fail-action.js')
    /** @type {any} */
    const prodFailAction = _prodFailAction

    const mockRequest = {
      logger: { warn: vi.fn() }
    }
    /** @type {any} */
    const joiError = new Error('"redirectUrl" is required')
    joiError.isJoi = true
    joiError.details = [
      { message: '"redirectUrl" is required', path: ['redirectUrl'] }
    ]

    expect(() => prodFailAction(mockRequest, {}, joiError)).toThrow()

    const logCall = mockRequest.logger.warn.mock.calls[0][0]
    expect(logCall.message).toBe('"redirectUrl" is required')
    expect(logCall.message).not.toContain('| data:')
  })
})
