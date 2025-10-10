import { beforeEach, describe, expect, test, vi } from 'vitest'
import process from 'node:process'
import { StatusCodes } from 'http-status-codes'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from './common/enums/index.js'

vi.mock('./start-server.js', () => ({
  startServer: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('./common/helpers/logging/logger.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    logger: {
      error: vi.fn()
    }
  }
})

describe('index.js', () => {
  let loggerErrorSpy

  beforeEach(async () => {
    vi.clearAllMocks()
    const { logger } = await import('./common/helpers/logging/logger.js')
    loggerErrorSpy = logger.error
    await import('./index.js')
  })

  test('handles unhandled rejection with Error object', async () => {
    const error = new Error('Test unhandled rejection')
    const listeners = process.listeners('unhandledRejection')
    const handler = listeners[listeners.length - 1]

    handler(error)

    expect(loggerErrorSpy).toHaveBeenCalledWith({
      error: {
        message: 'Test unhandled rejection',
        stack_trace: expect.stringContaining('Error: Test unhandled rejection'),
        type: 'Error'
      },
      message: 'Unhandled rejection',
      event: {
        category: LOGGING_EVENT_CATEGORIES.HTTP,
        action: LOGGING_EVENT_ACTIONS.REQUEST_FAILURE
      },
      http: {
        response: {
          status_code: StatusCodes.INTERNAL_SERVER_ERROR
        }
      }
    })
    expect(process.exitCode).toBe(1)
  })

  test('handles unhandled rejection with Boom error', async () => {
    const boomError = {
      message: 'Boom error',
      output: {
        status_code: StatusCodes.BAD_REQUEST
      }
    }
    const listeners = process.listeners('unhandledRejection')
    const handler = listeners[listeners.length - 1]

    handler(boomError)

    expect(loggerErrorSpy).toHaveBeenCalledWith({
      message: 'Unhandled rejection',
      event: {
        category: LOGGING_EVENT_CATEGORIES.HTTP,
        action: LOGGING_EVENT_ACTIONS.REQUEST_FAILURE
      },
      http: {
        response: {
          status_code: StatusCodes.BAD_REQUEST
        }
      }
    })
    expect(process.exitCode).toBe(1)
  })
})
