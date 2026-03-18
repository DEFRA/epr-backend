import Joi from 'joi'

import { orsImportCommandHandlers } from './ors-import-commands.js'

vi.mock('#overseas-sites/application/process-import.js')
vi.mock('#overseas-sites/metrics/ors-imports.js')

const { processOrsImport } =
  await import('#overseas-sites/application/process-import.js')
const { orsImportMetrics } =
  await import('#overseas-sites/metrics/ors-imports.js')

describe('orsImportCommandHandlers', () => {
  let deps

  beforeEach(() => {
    deps = {
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      orsImportsRepository: { updateStatus: vi.fn() },
      uploadsRepository: {},
      overseasSitesRepository: {},
      organisationsRepository: {}
    }
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('exports one handler', () => {
    expect(orsImportCommandHandlers).toHaveLength(1)
  })

  describe('import-overseas-sites handler', () => {
    const handler = orsImportCommandHandlers.find(
      (h) => h.command === 'import-overseas-sites'
    )

    it('has command "import-overseas-sites"', () => {
      expect(handler.command).toBe('import-overseas-sites')
    })

    describe('payloadSchema', () => {
      it('accepts a valid payload', () => {
        const { error } = handler.payloadSchema.validate({
          importId: 'import-123'
        })

        expect(error).toBeUndefined()
      })

      it('requires importId', () => {
        const { error } = handler.payloadSchema.validate({})

        expect(error.message).toBe('"importId" is required')
      })

      it('rejects unknown fields', () => {
        const { error } = handler.payloadSchema.validate({
          importId: 'import-123',
          extra: true
        })

        expect(error.message).toContain('"extra" is not allowed')
      })
    })

    describe('execute', () => {
      it('calls processOrsImport with importId and deps', async () => {
        await handler.execute({ importId: 'import-123' }, deps)

        expect(processOrsImport).toHaveBeenCalledWith('import-123', {
          orsImportsRepository: deps.orsImportsRepository,
          uploadsRepository: deps.uploadsRepository,
          overseasSitesRepository: deps.overseasSitesRepository,
          organisationsRepository: deps.organisationsRepository,
          logger: deps.logger,
          orsImportMetrics
        })
      })
    })

    describe('onFailure', () => {
      it('marks ORS import as failed', async () => {
        await handler.onFailure({ importId: 'import-123' }, deps)

        expect(deps.orsImportsRepository.updateStatus).toHaveBeenCalledWith(
          'import-123',
          'failed'
        )
      })

      it('records failed status transition metric', async () => {
        await handler.onFailure({ importId: 'import-123' }, deps)

        expect(orsImportMetrics.recordStatusTransition).toHaveBeenCalledWith({
          status: 'failed'
        })
      })

      it('logs error when marking as failed throws', async () => {
        const updateError = new Error('Database error')
        deps.orsImportsRepository.updateStatus.mockRejectedValue(updateError)

        await handler.onFailure({ importId: 'import-123' }, deps)

        expect(deps.logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            err: updateError,
            message: 'Failed to mark ORS import import-123 as failed'
          })
        )
      })
    })

    describe('logging context', () => {
      it('returns importId context', () => {
        expect(handler.describe({ importId: 'import-123' })).toBe(
          'importId=import-123'
        )
      })
    })
  })

  it('all handlers have valid Joi payload schemas', () => {
    for (const handler of orsImportCommandHandlers) {
      expect(Joi.isSchema(handler.payloadSchema)).toBe(true)
    }
  })
})
