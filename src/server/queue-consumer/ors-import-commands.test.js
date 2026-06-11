import { createInMemoryOrsImportsRepository } from '#overseas-sites/imports/repository/inmemory.js'
import { ORS_IMPORT_STATUS } from '#overseas-sites/domain/import-status.js'
import {
  importOverseasSitesHandler,
  orsImportCommandHandlers
} from './ors-import-commands.js'

vi.mock('#overseas-sites/application/process-import.js')
vi.mock('#overseas-sites/metrics/ors-imports.js')

const { processOrsImport } =
  await import('#overseas-sites/application/process-import.js')
const { orsImportMetrics } =
  await import('#overseas-sites/metrics/ors-imports.js')

const seedImport = (orsImportsRepository, _id, status) =>
  orsImportsRepository.create({ _id, status, files: [] })

describe('orsImportCommandHandlers', () => {
  let deps
  let orsImportsRepository

  beforeEach(() => {
    orsImportsRepository = createInMemoryOrsImportsRepository()()
    deps = {
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      orsImportsRepository,
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
    const handler = importOverseasSitesHandler

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

        expect(error?.message).toBe('"importId" is required')
      })

      it('rejects unknown fields', () => {
        const { error } = handler.payloadSchema.validate({
          importId: 'import-123',
          extra: true
        })

        expect(error?.message).toContain('"extra" is not allowed')
      })

      it('accepts a user carrying a resolved role', () => {
        const { error } = handler.payloadSchema.validate({
          importId: 'import-123',
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
          importId: 'import-123',
          user: {
            id: 'user-1',
            email: 'operator@example.com',
            scope: ['operator'],
            role: null
          }
        })

        expect(error).toBeUndefined()
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
      it('marks a non-terminal import as failed and records the transition', async () => {
        await seedImport(
          orsImportsRepository,
          'import-123',
          ORS_IMPORT_STATUS.PROCESSING
        )

        await handler.onFailure({ importId: 'import-123' }, deps)

        const stored = await orsImportsRepository.findById('import-123')
        expect(stored.status).toBe(ORS_IMPORT_STATUS.FAILED)
        expect(orsImportMetrics.recordStatusTransition).toHaveBeenCalledWith({
          status: ORS_IMPORT_STATUS.FAILED
        })
      })

      it('leaves a terminal import untouched, recording no metric and logging the skip', async () => {
        await seedImport(
          orsImportsRepository,
          'import-123',
          ORS_IMPORT_STATUS.COMPLETED
        )

        await handler.onFailure({ importId: 'import-123' }, deps)

        const stored = await orsImportsRepository.findById('import-123')
        expect(stored.status).toBe(ORS_IMPORT_STATUS.COMPLETED)
        expect(orsImportMetrics.recordStatusTransition).not.toHaveBeenCalled()
        expect(deps.logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('import-123')
          })
        )
      })

      it('logs an error when the repository throws', async () => {
        const updateError = new Error('Database error')
        orsImportsRepository.updateStatus = vi
          .fn()
          .mockRejectedValue(updateError)

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
})
