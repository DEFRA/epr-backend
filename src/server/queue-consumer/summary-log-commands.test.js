import Joi from 'joi'

import { summaryLogCommandHandlers } from './summary-log-commands.js'

vi.mock('#application/summary-logs/validate.js')
vi.mock('#application/summary-logs/submit.js')
vi.mock('#domain/summary-logs/mark-as-failed.js')

const { createSummaryLogsValidator } =
  await import('#application/summary-logs/validate.js')
const { submitSummaryLog } = await import('#application/summary-logs/submit.js')
const { markAsValidationFailed, markAsSubmissionFailed } =
  await import('#domain/summary-logs/mark-as-failed.js')

/**
 * @param {string} command
 */
const handlerFor = (command) => {
  const handler = summaryLogCommandHandlers.find((h) => h.command === command)
  if (!handler) {
    throw new Error(`No handler registered for command: ${command}`)
  }
  return handler
}

/**
 * @param {{ error?: import('joi').ValidationError }} result
 * @returns {import('joi').ValidationError}
 */
const validationErrorFrom = ({ error }) => {
  if (!error) {
    throw new Error('Expected a validation error but validation passed')
  }
  return error
}

describe('summaryLogCommandHandlers', () => {
  let deps

  beforeEach(() => {
    deps = {
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      summaryLogsRepository: { findById: vi.fn(), update: vi.fn() },
      organisationsRepository: {},
      wasteRecordsRepository: {},
      wasteBalancesRepository: {},
      summaryLogExtractor: {}
    }
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('exports two handlers', () => {
    expect(summaryLogCommandHandlers).toHaveLength(2)
  })

  describe('validate handler', () => {
    const handler = handlerFor('validate')

    it('has command "validate"', () => {
      expect(handler.command).toBe('validate')
    })

    describe('payloadSchema', () => {
      it('accepts a valid payload', () => {
        const { error } = handler.payloadSchema.validate({
          summaryLogId: 'log-123'
        })

        expect(error).toBeUndefined()
      })

      it('requires summaryLogId', () => {
        const error = validationErrorFrom(handler.payloadSchema.validate({}))

        expect(error.message).toBe('"summaryLogId" is required')
      })

      it('rejects unknown fields', () => {
        const error = validationErrorFrom(
          handler.payloadSchema.validate({
            summaryLogId: 'log-123',
            extra: true
          })
        )

        expect(error.message).toContain('"extra" is not allowed')
      })
    })

    describe('execute', () => {
      it('calls createSummaryLogsValidator and runs the returned function', async () => {
        const mockValidator = vi.fn()
        vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

        await handler.execute({ summaryLogId: 'log-123' }, deps)

        expect(createSummaryLogsValidator).toHaveBeenCalledWith({
          logger: deps.logger,
          summaryLogsRepository: deps.summaryLogsRepository,
          organisationsRepository: deps.organisationsRepository,
          wasteRecordsRepository: deps.wasteRecordsRepository,
          summaryLogExtractor: deps.summaryLogExtractor
        })
        expect(mockValidator).toHaveBeenCalledWith('log-123')
      })
    })

    describe('onFailure', () => {
      it('calls markAsValidationFailed', async () => {
        await handler.onFailure({ summaryLogId: 'log-123' }, deps)

        expect(markAsValidationFailed).toHaveBeenCalledWith(
          'log-123',
          deps.summaryLogsRepository,
          deps.logger
        )
      })
    })

    describe('logging context', () => {
      it('returns summaryLogId context', () => {
        expect(handler.describe({ summaryLogId: 'log-123' })).toBe(
          'summaryLogId=log-123'
        )
      })
    })
  })

  describe('submit handler', () => {
    const handler = handlerFor('submit')

    it('has command "submit"', () => {
      expect(handler.command).toBe('submit')
    })

    describe('payloadSchema', () => {
      it('rejects payload without user', () => {
        const error = validationErrorFrom(
          handler.payloadSchema.validate({
            summaryLogId: 'log-123'
          })
        )

        expect(error.message).toBe('"user" is required')
      })

      it('accepts payload with user', () => {
        const { error } = handler.payloadSchema.validate({
          summaryLogId: 'log-123',
          user: {
            id: 'user-1',
            email: 'test@example.com',
            scope: ['operator'],
            role: null
          }
        })

        expect(error).toBeUndefined()
      })

      it('accepts a user carrying a name', () => {
        const { error } = handler.payloadSchema.validate({
          summaryLogId: 'log-123',
          user: {
            id: 'user-1',
            name: 'Test User',
            email: 'test@example.com',
            scope: ['operator'],
            role: null
          }
        })

        expect(error).toBeUndefined()
      })

      it('rejects a user without a role', () => {
        const error = validationErrorFrom(
          handler.payloadSchema.validate({
            summaryLogId: 'log-123',
            user: {
              id: 'user-1',
              email: 'test@example.com',
              scope: ['operator']
            }
          })
        )

        expect(error.message).toBe('"user.role" is required')
      })

      it('requires summaryLogId', () => {
        const error = validationErrorFrom(handler.payloadSchema.validate({}))

        expect(error.message).toBe('"summaryLogId" is required')
      })

      it('validates user schema when present', () => {
        const error = validationErrorFrom(
          handler.payloadSchema.validate({
            summaryLogId: 'log-123',
            user: { id: 'user-1' }
          })
        )

        expect(error.message).toContain('"user.email" is required')
      })

      it('accepts a user carrying a resolved role', () => {
        const { error } = handler.payloadSchema.validate({
          summaryLogId: 'log-123',
          user: {
            id: 'user-1',
            email: 'maintainer@example.com',
            scope: ['admin.read'],
            role: 'service_maintainer'
          }
        })

        expect(error).toBeUndefined()
      })

      it('accepts a user with a null role', () => {
        const { error } = handler.payloadSchema.validate({
          summaryLogId: 'log-123',
          user: {
            id: 'user-1',
            email: 'operator@example.com',
            scope: ['operator'],
            role: null
          }
        })

        expect(error).toBeUndefined()
      })

      it('rejects unknown fields', () => {
        const error = validationErrorFrom(
          handler.payloadSchema.validate({
            summaryLogId: 'log-123',
            user: {
              id: 'user-1',
              email: 'test@example.com',
              scope: ['operator'],
              role: null
            },
            extra: true
          })
        )

        expect(error.message).toContain('"extra" is not allowed')
      })
    })

    describe('execute', () => {
      it('calls submitSummaryLog with payload spread into deps', async () => {
        const payload = {
          summaryLogId: 'log-123',
          user: {
            id: 'user-1',
            email: 'test@example.com',
            scope: ['operator'],
            role: null
          }
        }

        await handler.execute(payload, deps)

        expect(submitSummaryLog).toHaveBeenCalledWith('log-123', {
          ...deps,
          user: payload.user
        })
      })
    })

    describe('onFailure', () => {
      it('calls markAsSubmissionFailed', async () => {
        await handler.onFailure({ summaryLogId: 'log-123' }, deps)

        expect(markAsSubmissionFailed).toHaveBeenCalledWith(
          'log-123',
          deps.summaryLogsRepository,
          deps.logger
        )
      })
    })

    describe('logging context', () => {
      it('returns summaryLogId context', () => {
        expect(handler.describe({ summaryLogId: 'log-123' })).toBe(
          'summaryLogId=log-123'
        )
      })
    })
  })

  it('all handlers have valid Joi payload schemas', () => {
    for (const handler of summaryLogCommandHandlers) {
      expect(Joi.isSchema(handler.payloadSchema)).toBe(true)
    }
  })
})
