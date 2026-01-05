import { requestValidationFailAction } from './validation-fail-action.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../enums/index.js'

describe('#request-validation-fail-action', () => {
  test('throws Boom.badData with 422 status', () => {
    const mockRequest = {
      logger: {
        error: vi.fn()
      }
    }
    const joiError = {
      message: 'Validation failed',
      details: [{ path: ['email'], message: '"email" is required' }]
    }

    let thrownError
    try {
      requestValidationFailAction(mockRequest, {}, joiError)
    } catch (error) {
      thrownError = error
    }

    expect(thrownError.isBoom).toBe(true)
    expect(thrownError.output.statusCode).toBe(422)
    expect(thrownError.message).toBe('Validation failed')
    expect(thrownError.data).toEqual(joiError.details)
  })

  test('logs error with Joi details in message', () => {
    const mockRequest = {
      logger: {
        error: vi.fn()
      }
    }
    const joiError = {
      message: 'Validation failed',
      details: [{ path: ['email'], message: '"email" is required' }]
    }

    expect(() =>
      requestValidationFailAction(mockRequest, {}, joiError)
    ).toThrow()

    expect(mockRequest.logger.error).toHaveBeenCalledWith({
      err: expect.any(Object),
      message: `Validation failed | data: ${JSON.stringify(joiError.details)}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
      },
      http: {
        response: {
          status_code: 422
        }
      }
    })
  })

  test('passes Boom error to logger under err key for serialisation', () => {
    const mockRequest = {
      logger: {
        error: vi.fn()
      }
    }
    const joiError = {
      message: 'Bad input',
      details: []
    }

    expect(() =>
      requestValidationFailAction(mockRequest, {}, joiError)
    ).toThrow()

    const logCall = mockRequest.logger.error.mock.calls[0][0]
    expect(logCall.err.isBoom).toBe(true)
    expect(logCall.err.output.statusCode).toBe(422)
  })
})
