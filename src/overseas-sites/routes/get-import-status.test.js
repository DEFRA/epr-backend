import { StatusCodes } from 'http-status-codes'
import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach
} from 'vitest'

import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrsImportsRepository } from '#overseas-sites/imports/repository/inmemory.js'
import { ORS_IMPORT_STATUS } from '#overseas-sites/domain/import-status.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { orsImportStatusPath } from './get-import-status.js'

describe(`${orsImportStatusPath} route`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let orsImportsRepository

    beforeAll(async () => {
      const factory = createInMemoryOrsImportsRepository()
      orsImportsRepository = factory()
      vi.spyOn(orsImportsRepository, 'findById')

      server = await createTestServer({
        repositories: {
          orsImportsRepository: () => orsImportsRepository
        },
        featureFlags: createInMemoryFeatureFlags({
          overseasSites: true
        })
      })
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    afterAll(async () => {
      await server.stop()
    })

    describe('when import does not exist', () => {
      it('returns OK with default pending status', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/v1/ors-imports/non-existent-id',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = JSON.parse(response.payload)
        expect(body.status).toBe(ORS_IMPORT_STATUS.PENDING)
      })
    })

    describe('when import exists', () => {
      it('returns the import status', async () => {
        await orsImportsRepository.create({
          _id: 'import-1',
          status: ORS_IMPORT_STATUS.PROCESSING,
          files: []
        })

        const response = await server.inject({
          method: 'GET',
          url: '/v1/ors-imports/import-1',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = JSON.parse(response.payload)
        expect(body.status).toBe(ORS_IMPORT_STATUS.PROCESSING)
      })

      it('returns per-file results', async () => {
        const fileResult = {
          status: 'success',
          sitesCreated: 3,
          mappingsUpdated: 3,
          registrationNumber: 'REG-001',
          errors: []
        }

        await orsImportsRepository.create({
          _id: 'import-2',
          status: ORS_IMPORT_STATUS.COMPLETED,
          files: [
            {
              fileId: 'file-1',
              fileName: 'ors-data.xlsx',
              s3Uri: 's3://bucket/file-1',
              result: fileResult
            }
          ]
        })

        const response = await server.inject({
          method: 'GET',
          url: '/v1/ors-imports/import-2',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = JSON.parse(response.payload)
        expect(body.status).toBe(ORS_IMPORT_STATUS.COMPLETED)
        expect(body.files).toHaveLength(1)
        expect(body.files[0].fileName).toBe('ors-data.xlsx')
        expect(body.files[0].result).toEqual(fileResult)
      })

      it('returns failed status with per-file errors', async () => {
        await orsImportsRepository.create({
          _id: 'import-failed',
          status: ORS_IMPORT_STATUS.FAILED,
          files: [
            {
              fileId: 'file-err',
              fileName: 'bad-data.xlsx',
              s3Uri: 's3://bucket/file-err',
              result: {
                status: 'failure',
                sitesCreated: 0,
                mappingsUpdated: 0,
                registrationNumber: null,
                errors: [
                  { field: 'file', message: 'Missing registration number' }
                ]
              }
            }
          ]
        })

        const response = await server.inject({
          method: 'GET',
          url: '/v1/ors-imports/import-failed',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = JSON.parse(response.payload)
        expect(body.status).toBe(ORS_IMPORT_STATUS.FAILED)
        expect(body.files[0].result.errors).toHaveLength(1)
      })

      it('returns files with null result when not yet processed', async () => {
        await orsImportsRepository.create({
          _id: 'import-3',
          status: ORS_IMPORT_STATUS.PENDING,
          files: [
            {
              fileId: 'file-2',
              fileName: 'pending.xlsx',
              s3Uri: 's3://bucket/file-2',
              result: null
            }
          ]
        })

        const response = await server.inject({
          method: 'GET',
          url: '/v1/ors-imports/import-3',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = JSON.parse(response.payload)
        expect(body.files[0].result).toBeNull()
      })
    })

    describe('authorisation', () => {
      it('returns 401 when not authenticated', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/v1/ors-imports/any-id'
        })

        expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      })

      it('returns 403 when authenticated as standard user', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/v1/ors-imports/any-id',
          ...asStandardUser({ linkedOrgId: 'org-123' })
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      })
    })

    describe('error handling', () => {
      it('re-throws Boom errors from repository', async () => {
        const Boom = await import('@hapi/boom')
        orsImportsRepository.findById.mockRejectedValueOnce(
          Boom.default.badRequest('Invalid ID')
        )

        const response = await server.inject({
          method: 'GET',
          url: '/v1/ors-imports/any-id',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      })

      it('returns 500 for unexpected errors', async () => {
        orsImportsRepository.findById.mockRejectedValueOnce(
          new Error('Database connection failed')
        )

        const response = await server.inject({
          method: 'GET',
          url: '/v1/ors-imports/any-id',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      })
    })
  })
})
