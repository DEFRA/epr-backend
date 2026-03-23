import { StatusCodes } from 'http-status-codes'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'

import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrsImportsRepository } from '#overseas-sites/imports/repository/inmemory.js'
import { ORS_IMPORT_STATUS } from '#overseas-sites/domain/import-status.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { orsUploadCompletedPath } from './post-upload-completed.js'

const importId = 'import-123'
const fileId = 'file-456'
const filename = 'sites.xlsx'
const s3Bucket = 'test-bucket'
const s3Key = 'overseas-sites/imports/import-123/file-456'

const createPayload = (overrides = {}) => ({
  form: {
    orsUpload: {
      fileId,
      filename,
      fileStatus: 'complete',
      s3Bucket,
      s3Key,
      ...overrides
    }
  }
})

const createMultipleFilesPayload = () => ({
  form: {
    orsUpload: [
      {
        fileId: 'file-1',
        filename: 'sites-a.xlsx',
        fileStatus: 'complete',
        s3Bucket: 'test-bucket',
        s3Key: 'path/file-1'
      },
      {
        fileId: 'file-2',
        filename: 'sites-b.xlsx',
        fileStatus: 'complete',
        s3Bucket: 'test-bucket',
        s3Key: 'path/file-2'
      }
    ]
  }
})

describe(`${orsUploadCompletedPath} route`, () => {
  setupAuthContext()

  let server
  let orsImportsRepository
  let orsImportsWorker

  beforeAll(async () => {
    const factory = createInMemoryOrsImportsRepository()
    orsImportsRepository = factory()

    orsImportsWorker = {
      importOverseasSites: vi.fn()
    }

    server = await createTestServer({
      repositories: {
        orsImportsRepository: () => orsImportsRepository
      },
      workers: {
        orsImportsWorker
      },
      featureFlags: createInMemoryFeatureFlags({
        overseasSites: true
      })
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
    server.loggerMocks.info.mockClear()
    server.loggerMocks.error.mockClear()
  })

  afterAll(async () => {
    await server.stop()
  })

  it('returns 202 when upload completes successfully', async () => {
    await orsImportsRepository.create({
      _id: importId,
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: []
    })

    const response = await server.inject({
      method: 'POST',
      url: `/v1/overseas-sites/imports/${importId}/upload-completed`,
      payload: createPayload()
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
  })

  it('adds file details to the import record', async () => {
    await orsImportsRepository.create({
      _id: importId,
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: []
    })

    await server.inject({
      method: 'POST',
      url: `/v1/overseas-sites/imports/${importId}/upload-completed`,
      payload: createPayload()
    })

    const doc = await orsImportsRepository.findById(importId)
    expect(doc.files).toHaveLength(1)
    expect(doc.files[0]).toEqual({
      fileId,
      fileName: filename,
      s3Uri: `s3://${s3Bucket}/${s3Key}`
    })
  })

  it('handles multiple files in a single callback', async () => {
    await orsImportsRepository.create({
      _id: importId,
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: []
    })

    await server.inject({
      method: 'POST',
      url: `/v1/overseas-sites/imports/${importId}/upload-completed`,
      payload: createMultipleFilesPayload()
    })

    const doc = await orsImportsRepository.findById(importId)
    expect(doc.files).toHaveLength(2)
    expect(doc.files[0].fileId).toBe('file-1')
    expect(doc.files[1].fileId).toBe('file-2')
  })

  it('enqueues an import-overseas-sites command', async () => {
    await orsImportsRepository.create({
      _id: importId,
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: []
    })

    await server.inject({
      method: 'POST',
      url: `/v1/overseas-sites/imports/${importId}/upload-completed`,
      payload: createPayload()
    })

    expect(orsImportsWorker.importOverseasSites).toHaveBeenCalledWith(importId)
  })

  it('does not enqueue command when file was rejected', async () => {
    await orsImportsRepository.create({
      _id: importId,
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: []
    })

    await server.inject({
      method: 'POST',
      url: `/v1/overseas-sites/imports/${importId}/upload-completed`,
      payload: createPayload({
        fileStatus: 'rejected',
        s3Bucket: undefined,
        s3Key: undefined
      })
    })

    expect(orsImportsWorker.importOverseasSites).not.toHaveBeenCalled()
  })

  it('marks import as failed when all files are rejected', async () => {
    await orsImportsRepository.create({
      _id: importId,
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: []
    })

    await server.inject({
      method: 'POST',
      url: `/v1/overseas-sites/imports/${importId}/upload-completed`,
      payload: createPayload({
        fileStatus: 'rejected',
        s3Bucket: undefined,
        s3Key: undefined
      })
    })

    const doc = await orsImportsRepository.findById(importId)
    expect(doc.status).toBe(ORS_IMPORT_STATUS.FAILED)
  })

  it('marks import as failed when all files in a batch are rejected', async () => {
    await orsImportsRepository.create({
      _id: importId,
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: []
    })

    await server.inject({
      method: 'POST',
      url: `/v1/overseas-sites/imports/${importId}/upload-completed`,
      payload: {
        form: {
          orsUpload: [
            {
              fileId: 'file-1',
              filename: 'sites-a.xlsm',
              fileStatus: 'rejected'
            },
            {
              fileId: 'file-2',
              filename: 'sites-b.xlsm',
              fileStatus: 'rejected'
            }
          ]
        }
      }
    })

    const doc = await orsImportsRepository.findById(importId)
    expect(doc.status).toBe(ORS_IMPORT_STATUS.FAILED)
  })

  it('does not mark as failed when some files complete and others are rejected', async () => {
    await orsImportsRepository.create({
      _id: importId,
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: []
    })

    await server.inject({
      method: 'POST',
      url: `/v1/overseas-sites/imports/${importId}/upload-completed`,
      payload: {
        form: {
          orsUpload: [
            {
              fileId: 'file-1',
              filename: 'sites-a.xlsx',
              fileStatus: 'complete',
              s3Bucket: 'test-bucket',
              s3Key: 'path/file-1'
            },
            {
              fileId: 'file-2',
              filename: 'sites-b.xlsm',
              fileStatus: 'rejected'
            }
          ]
        }
      }
    })

    const doc = await orsImportsRepository.findById(importId)
    expect(doc.status).toBe(ORS_IMPORT_STATUS.PREPROCESSING)
  })

  it('returns 404 when import does not exist', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/v1/overseas-sites/imports/nonexistent/upload-completed`,
      payload: createPayload()
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('returns 422 when payload is missing form.orsUpload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/v1/overseas-sites/imports/${importId}/upload-completed`,
      payload: { uploadStatus: 'ready' }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('returns 422 when file is complete but missing s3 info', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/v1/overseas-sites/imports/${importId}/upload-completed`,
      payload: createPayload({ s3Bucket: undefined, s3Key: undefined })
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  describe('logging', () => {
    it('logs successful upload completion', async () => {
      await orsImportsRepository.create({
        _id: importId,
        status: ORS_IMPORT_STATUS.PREPROCESSING,
        files: []
      })

      await server.inject({
        method: 'POST',
        url: `/v1/overseas-sites/imports/${importId}/upload-completed`,
        payload: createPayload()
      })

      expect(server.loggerMocks.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(`importId=${importId}`),
          event: expect.objectContaining({
            action: 'request_success'
          })
        })
      )
    })

    it('logs error when repository fails', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      const failingRepository = {
        findById: vi.fn().mockRejectedValue(new Error('DB down')),
        addFiles: vi.fn(),
        create: vi.fn(),
        updateStatus: vi.fn(),
        recordFileResult: vi.fn()
      }

      const failServer = await createTestServer({
        repositories: {
          orsImportsRepository: () => failingRepository
        },
        workers: { orsImportsWorker },
        featureFlags: createInMemoryFeatureFlags({ overseasSites: true })
      })

      const response = await failServer.inject({
        method: 'POST',
        url: `/v1/overseas-sites/imports/${importId}/upload-completed`,
        payload: createPayload()
      })

      consoleErrorSpy.mockRestore()
      await failServer.stop()

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })
  })
})
