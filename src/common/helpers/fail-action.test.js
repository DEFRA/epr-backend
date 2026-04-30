import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { failAction } from './fail-action.js'
import { config } from '#root/config.js'

describe('#fail-action', () => {
  afterEach(() => {
    config.reset('cdpEnvironment')
  })

  const createMockRequest = () => ({
    logger: {
      warn: vi.fn()
    }
  })

  const createJoiValidationError = () => {
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

      let thrownError
      try {
        failAction(mockRequest, {}, joiError)
      } catch (e) {
        thrownError = e
      }

      expect(thrownError?.isBoom).toBe(true)
      expect(thrownError?.output.statusCode).toBe(
        StatusCodes.UNPROCESSABLE_ENTITY
      )
      expect(thrownError?.message).toBe('"redirectUrl" is required')
    })

    test('does not carry user-submitted values into the thrown Boom when multiple fields fail', () => {
      const schema = Joi.object({
        email: Joi.string().email().required(),
        age: Joi.number().min(18).required(),
        country: Joi.string().valid('UK', 'IE').required()
      })

      const sensitiveEmail = 'possibly-pii@not-a-real-email'
      const sensitiveAge = 12
      const sensitiveCountry = 'secret-country-name'
      const { error: joiError } = schema.validate(
        { email: sensitiveEmail, age: sensitiveAge, country: sensitiveCountry },
        { abortEarly: false }
      )

      const mockRequest = createMockRequest()

      let thrown
      try {
        failAction(mockRequest, {}, joiError)
      } catch (e) {
        thrown = e
      }

      // Positive shape: Joi joins all three messages with '. '; no data set
      // (Boom defaults .data to null when no second argument is passed).
      expect(thrown.isBoom).toBe(true)
      expect(thrown.output.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      expect(thrown.message).toBe(
        '"email" must be a valid email. "age" must be greater than or equal to 18. "country" must be one of [UK, IE]'
      )
      expect(thrown.data).toBeNull()

      // Regression anchor: none of the user-submitted values appear on the
      // Boom that the err serializer will see (message or data).
      const serialisedBoom = JSON.stringify({
        message: thrown.message,
        data: thrown.data,
        payload: thrown.output.payload
      })
      expect(serialisedBoom).not.toContain(sensitiveEmail)
      expect(serialisedBoom).not.toContain(String(sensitiveAge))
      expect(serialisedBoom).not.toContain(sensitiveCountry)
    })

    test('logs at warn level', () => {
      const mockRequest = createMockRequest()
      const joiError = createJoiValidationError()

      expect(() => failAction(mockRequest, {}, joiError)).toThrow()

      expect(mockRequest.logger.warn).toHaveBeenCalledTimes(1)
    })

    test('includes validation error summary in message in non-prod environment', () => {
      const mockRequest = createMockRequest()
      const joiError = createJoiValidationError()

      expect(() => failAction(mockRequest, {}, joiError)).toThrow()

      const logCall = mockRequest.logger.warn.mock.calls[0][0]
      expect(logCall.message).toBe(
        '"redirectUrl" is required | 1 validation error(s): "redirectUrl" is required'
      )
    })

    test('caps validation error messages at 5 in non-prod environment', () => {
      const mockRequest = createMockRequest()
      const joiError = new Error('Validation failed')
      joiError.isJoi = true
      joiError.details = Array.from({ length: 8 }, (_, i) => ({
        message: `"field${i}" is required`,
        path: [`field${i}`],
        type: 'any.required',
        context: { key: `field${i}`, label: `field${i}` }
      }))

      expect(() => failAction(mockRequest, {}, joiError)).toThrow()

      const logCall = mockRequest.logger.warn.mock.calls[0][0]
      expect(logCall.message).toBe(
        'Validation failed | 8 validation error(s): "field0" is required; "field1" is required; "field2" is required; "field3" is required; "field4" is required ...and 3 more'
      )
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

      let thrownError
      try {
        failAction(mockRequest, {}, boomError)
      } catch (e) {
        thrownError = e
      }

      expect(thrownError?.isBoom).toBe(true)
      expect(thrownError?.output.statusCode).toBe(StatusCodes.BAD_REQUEST)
      expect(thrownError?.message).toBe('Invalid payload')
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
    config.set('cdpEnvironment', 'prod')
  })

  afterEach(() => {
    config.reset('cdpEnvironment')
  })

  test('does NOT include Joi details in message in production', () => {
    const mockRequest = {
      logger: { warn: vi.fn() }
    }
    const joiError = new Error('"redirectUrl" is required')
    joiError.isJoi = true
    joiError.details = [{ message: '"redirectUrl" is required' }]

    expect(() => failAction(mockRequest, {}, joiError)).toThrow()

    const logCall = mockRequest.logger.warn.mock.calls[0][0]
    expect(logCall.message).toBe('"redirectUrl" is required')
    expect(logCall.message).not.toContain('validation error(s)')
  })
})
