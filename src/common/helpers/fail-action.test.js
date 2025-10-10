import { failAction } from './fail-action.js'

describe('#fail-action', () => {
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
