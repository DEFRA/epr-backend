import { afterEach, beforeEach, describe, test, expect, vi } from 'vitest'
import process from 'node:process'
import { StatusCodes } from 'http-status-codes'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../enums/index.js'

describe('setupGlobalErrorHandler', () => {
  let originalExitCode
  let loggerErrorSpy

  beforeEach(async () => {
    vi.clearAllMocks()
    originalExitCode = process.exitCode
    process.exitCode = undefined
    process.removeAllListeners('unhandledRejection')

    const { logger } = await import('./logging/logger.js')
    loggerErrorSpy = vi.spyOn(logger, 'error')

    const { setupGlobalErrorHandler } = await import('./global-handlers.js')
    setupGlobalErrorHandler()
  })

  afterEach(() => {
    process.exitCode = originalExitCode
    process.removeAllListeners('unhandledRejection')
    vi.restoreAllMocks()
  })

  test('registers unhandledRejection handler that logs Error objects', () => {
    const error = new Error('Test unhandled rejection')
    const listeners = process.listeners('unhandledRejection')
    expect(listeners.length).toBeGreaterThan(0)

    listeners[listeners.length - 1](error)

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

  test('handles Boom-style errors with status code', () => {
    const boomError = {
      message: 'Boom error',
      output: {
        status_code: StatusCodes.BAD_REQUEST
      }
    }
    const listeners = process.listeners('unhandledRejection')

    listeners[listeners.length - 1](boomError)

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
