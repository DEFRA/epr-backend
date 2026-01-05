import Boom from '@hapi/boom'
import { failAction } from './fail-action.js'

describe('#fail-action', () => {
  test('passes error to logger under err key for serialisation', () => {
    const mockRequest = {
      logger: {
        warn: vi.fn()
      }
    }
    const mockToolkit = {}
    const boomError = Boom.badRequest('Validation failed', { field: 'email' })

    expect(() => failAction(mockRequest, mockToolkit, boomError)).toThrow()

    expect(mockRequest.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: boomError
      })
    )
  })

  test('Should throw expected error object', () => {
    const mockRequest = {
      logger: {
        warn: vi.fn()
      }
    }
    const mockToolkit = {}
    const mockError = Error('Something terrible has happened!')

    expect(() => failAction(mockRequest, mockToolkit, mockError)).toThrow(
      'Something terrible has happened!'
    )
  })

  test('Should throw expected error string', () => {
    const mockRequest = {
      logger: {
        warn: vi.fn()
      }
    }
    const mockToolkit = {}
    const mockError = 'Something terrible has happened!'

    expect(() => failAction(mockRequest, mockToolkit, mockError)).toThrow(
      'Something terrible has happened!'
    )
  })
})
