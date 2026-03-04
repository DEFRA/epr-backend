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
    const handler = summaryLogCommandHandlers.find(
      (h) => h.command === 'validate'
    )

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
        const { error } = handler.payloadSchema.validate({})

        expect(error.message).toBe('"summaryLogId" is required')
      })

      it('rejects unknown fields', () => {
        const { error } = handler.payloadSchema.validate({
          summaryLogId: 'log-123',
          extra: true
        })

        expect(error.message).toContain('"extra" is not allowed')
      })
    })

    describe('execute', () => {
      it('calls createSummaryLogsValidator and runs the returned function', async () => {
        const mockValidator = vi.fn()
        vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

        await handler.execute({ summaryLogId: 'log-123' }, deps)

        expect(createSummaryLogsValidator).toHaveBeenCalledWith({
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
    const handler = summaryLogCommandHandlers.find(
      (h) => h.command === 'submit'
    )

    it('has command "submit"', () => {
      expect(handler.command).toBe('submit')
    })

    describe('payloadSchema', () => {
      it('accepts payload without user', () => {
        const { error } = handler.payloadSchema.validate({
          summaryLogId: 'log-123'
        })

        expect(error).toBeUndefined()
      })

      it('accepts payload with user', () => {
        const { error } = handler.payloadSchema.validate({
          summaryLogId: 'log-123',
          user: {
            id: 'user-1',
            email: 'test@example.com',
            scope: ['operator']
          }
        })

        expect(error).toBeUndefined()
      })

      it('requires summaryLogId', () => {
        const { error } = handler.payloadSchema.validate({})

        expect(error.message).toBe('"summaryLogId" is required')
      })

      it('validates user schema when present', () => {
        const { error } = handler.payloadSchema.validate({
          summaryLogId: 'log-123',
          user: { id: 'user-1' }
        })

        expect(error.message).toContain('"user.email" is required')
      })

      it('rejects unknown fields', () => {
        const { error } = handler.payloadSchema.validate({
          summaryLogId: 'log-123',
          extra: true
        })

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
            scope: ['operator']
          }
        }

        await handler.execute(payload, deps)

        expect(submitSummaryLog).toHaveBeenCalledWith('log-123', {
          ...deps,
          user: payload.user
        })
      })

      it('calls submitSummaryLog without user when not provided', async () => {
        await handler.execute({ summaryLogId: 'log-123' }, deps)

        expect(submitSummaryLog).toHaveBeenCalledWith('log-123', {
          ...deps,
          user: undefined
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
