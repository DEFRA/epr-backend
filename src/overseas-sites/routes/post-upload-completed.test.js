import { StatusCodes } from 'http-status-codes'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'

import { createInMemoryOrsImportsRepository } from '#overseas-sites/imports/repository/inmemory.js'
import { ORS_IMPORT_STATUS } from '#overseas-sites/domain/import-status.js'
import { createTestServer } from '#test/create-test-server.js'
import { signedCallbackPayload } from '#test/upload-callback.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { orsUploadCompletedPath } from './post-upload-completed.js'

const importId = 'import-123'
const fileId = 'file-456'
const filename = 'sites.xlsx'
const s3Bucket = 're-ex-overseas-sites'
const s3Key = '/overseas-sites/imports/import-123/upload-1/file-456'

const uploadCompletedPath = (id) =>
  `/v1/overseas-sites/imports/${id}/upload-completed`

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
        s3Bucket: 're-ex-overseas-sites',
        s3Key: '/overseas-sites/imports/import-123/upload-1/file-1'
      },
      {
        fileId: 'file-2',
        filename: 'sites-b.xlsx',
        fileStatus: 'complete',
        s3Bucket: 're-ex-overseas-sites',
        s3Key: '/overseas-sites/imports/import-123/upload-1/file-2'
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
      }
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
      url: uploadCompletedPath(importId),
      payload: signedCallbackPayload(
        uploadCompletedPath(importId),
        createPayload()
      )
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
      url: uploadCompletedPath(importId),
      payload: signedCallbackPayload(
        uploadCompletedPath(importId),
        createPayload()
      )
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
      url: uploadCompletedPath(importId),
      payload: signedCallbackPayload(
        uploadCompletedPath(importId),
        createMultipleFilesPayload()
      )
    })

    const doc = await orsImportsRepository.findById(importId)
    expect(doc.files).toHaveLength(2)
    expect(doc.files[0].fileId).toBe('file-1')
    expect(doc.files[1].fileId).toBe('file-2')
  })

  it('enqueues an import-overseas-sites command with the initiating user', async () => {
    const createdBy = {
      id: 'user-123',
      email: 'maintainer@defra.gov.uk',
      scope: ['serviceMaintainer']
    }

    await orsImportsRepository.create({
      _id: importId,
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: [],
      createdBy
    })

    await server.inject({
      method: 'POST',
      url: uploadCompletedPath(importId),
      payload: signedCallbackPayload(
        uploadCompletedPath(importId),
        createPayload()
      )
    })

    expect(orsImportsWorker.importOverseasSites).toHaveBeenCalledWith(
      importId,
      createdBy
    )
  })

  it('does not enqueue command when file was rejected', async () => {
    await orsImportsRepository.create({
      _id: importId,
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: []
    })

    await server.inject({
      method: 'POST',
      url: uploadCompletedPath(importId),
      payload: signedCallbackPayload(
        uploadCompletedPath(importId),
        createPayload({
          fileStatus: 'rejected',
          s3Bucket: undefined,
          s3Key: undefined
        })
      )
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
      url: uploadCompletedPath(importId),
      payload: signedCallbackPayload(
        uploadCompletedPath(importId),
        createPayload({
          fileStatus: 'rejected',
          s3Bucket: undefined,
          s3Key: undefined
        })
      )
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
      url: uploadCompletedPath(importId),
      payload: signedCallbackPayload(uploadCompletedPath(importId), {
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
      })
    })

    const doc = await orsImportsRepository.findById(importId)
    expect(doc.status).toBe(ORS_IMPORT_STATUS.FAILED)
  })

  it('does not mark as failed when some files complete and others are rejected', async () => {
    const createdBy = {
      id: 'user-456',
      email: 'admin@defra.gov.uk',
      scope: ['serviceMaintainer']
    }

    await orsImportsRepository.create({
      _id: importId,
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: [],
      createdBy
    })

    await server.inject({
      method: 'POST',
      url: uploadCompletedPath(importId),
      payload: signedCallbackPayload(uploadCompletedPath(importId), {
        form: {
          orsUpload: [
            {
              fileId: 'file-1',
              filename: 'sites-a.xlsx',
              fileStatus: 'complete',
              s3Bucket: 're-ex-overseas-sites',
              s3Key: '/overseas-sites/imports/import-123/upload-1/file-1'
            },
            {
              fileId: 'file-2',
              filename: 'sites-b.xlsm',
              fileStatus: 'rejected'
            }
          ]
        }
      })
    })

    const doc = await orsImportsRepository.findById(importId)
    expect(doc.status).toBe(ORS_IMPORT_STATUS.PREPROCESSING)
    expect(orsImportsWorker.importOverseasSites).toHaveBeenCalledWith(
      importId,
      createdBy
    )
  })

  describe('when a file is not where this import sends its uploads', () => {
    const completeFileAt = (fileBucket, fileKey) => ({
      fileId,
      filename,
      fileStatus: 'complete',
      s3Bucket: fileBucket,
      s3Key: fileKey
    })

    it.for([
      {
        description: 'another bucket',
        orsUpload: completeFileAt('some-other-bucket', s3Key),
        location: `s3Bucket=some-other-bucket, s3Key=${s3Key}`
      },
      {
        description: 'another import',
        orsUpload: completeFileAt(
          s3Bucket,
          '/overseas-sites/imports/import-999/upload-1/file-456'
        ),
        location: `s3Bucket=${s3Bucket}, s3Key=/overseas-sites/imports/import-999/upload-1/file-456`
      },
      {
        description: 'one file among several',
        orsUpload: [
          completeFileAt(s3Bucket, s3Key),
          completeFileAt('some-other-bucket', s3Key)
        ],
        location: `s3Bucket=some-other-bucket, s3Key=${s3Key}`
      }
    ])(
      'refuses $description, fails the import without its files, and logs an error',
      async ({ orsUpload, location }) => {
        await orsImportsRepository.create({
          _id: importId,
          status: ORS_IMPORT_STATUS.PREPROCESSING,
          files: []
        })

        const response = await server.inject({
          method: 'POST',
          url: uploadCompletedPath(importId),
          payload: signedCallbackPayload(uploadCompletedPath(importId), {
            form: { orsUpload }
          })
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
        const doc = await orsImportsRepository.findById(importId)
        expect(doc).toMatchObject({
          status: ORS_IMPORT_STATUS.FAILED,
          files: []
        })
        expect(orsImportsWorker.importOverseasSites).not.toHaveBeenCalled()
        expect(server.loggerMocks.error).toHaveBeenCalledWith(
          expect.objectContaining({
            message: `Upload is not in the upload location for this import: importId=${importId}, ${location}`,
            event: expect.objectContaining({ reference: importId })
          })
        )
      }
    )
  })

  it('refuses an unsigned callback, and leaves the import untouched', async () => {
    await orsImportsRepository.create({
      _id: importId,
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: []
    })

    const response = await server.inject({
      method: 'POST',
      url: uploadCompletedPath(importId),
      payload: createPayload()
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    const doc = await orsImportsRepository.findById(importId)
    expect(doc).toMatchObject({
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: []
    })
    expect(orsImportsWorker.importOverseasSites).not.toHaveBeenCalled()
  })

  it('returns 404 when import does not exist', async () => {
    const response = await server.inject({
      method: 'POST',
      url: uploadCompletedPath('nonexistent'),
      payload: signedCallbackPayload(
        uploadCompletedPath('nonexistent'),
        createPayload()
      )
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('returns 422 when payload is missing form.orsUpload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: uploadCompletedPath(importId),
      payload: signedCallbackPayload(uploadCompletedPath(importId), {
        uploadStatus: 'ready'
      })
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('returns 422 when file is complete but missing s3 info', async () => {
    const response = await server.inject({
      method: 'POST',
      url: uploadCompletedPath(importId),
      payload: signedCallbackPayload(
        uploadCompletedPath(importId),
        createPayload({ s3Bucket: undefined, s3Key: undefined })
      )
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
        url: uploadCompletedPath(importId),
        payload: signedCallbackPayload(
          uploadCompletedPath(importId),
          createPayload()
        )
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
        workers: { orsImportsWorker }
      })

      const response = await failServer.inject({
        method: 'POST',
        url: uploadCompletedPath(importId),
        payload: signedCallbackPayload(
          uploadCompletedPath(importId),
          createPayload()
        )
      })

      consoleErrorSpy.mockRestore()
      await failServer.stop()

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })
  })
})
