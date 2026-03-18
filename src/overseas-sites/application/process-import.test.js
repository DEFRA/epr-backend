import { describe, it, expect, vi, beforeEach } from 'vitest'

import { processOrsImport } from './process-import.js'
import { PermanentError } from '#server/queue-consumer/permanent-error.js'
import {
  ORS_FILE_RESULT_STATUS,
  ORS_IMPORT_STATUS
} from '../domain/import-status.js'

vi.mock('./process-import-file.js')

const { processImportFile } = await import('./process-import-file.js')

describe('processOrsImport', () => {
  let orsImportsRepository
  let uploadsRepository
  let overseasSitesRepository
  let organisationsRepository
  let logger

  beforeEach(() => {
    vi.clearAllMocks()

    orsImportsRepository = {
      findById: vi.fn(),
      updateStatus: vi.fn(),
      recordFileResult: vi.fn()
    }

    uploadsRepository = {
      findByLocation: vi.fn(),
      deleteByLocation: vi.fn()
    }

    overseasSitesRepository = {}
    organisationsRepository = {}

    logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }
  })

  const deps = () => ({
    orsImportsRepository,
    uploadsRepository,
    overseasSitesRepository,
    organisationsRepository,
    logger
  })

  it('processes all files in the import batch', async () => {
    const importDoc = {
      _id: 'import-123',
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: [
        { fileId: 'f1', fileName: 'sites1.xlsx', s3Uri: 's3://bucket/f1' },
        { fileId: 'f2', fileName: 'sites2.xlsx', s3Uri: 's3://bucket/f2' }
      ]
    }
    orsImportsRepository.findById.mockResolvedValue(importDoc)

    uploadsRepository.findByLocation
      .mockResolvedValueOnce(Buffer.from('file1'))
      .mockResolvedValueOnce(Buffer.from('file2'))

    const successResult = {
      status: ORS_FILE_RESULT_STATUS.SUCCESS,
      sitesCreated: 3,
      mappingsUpdated: 3,
      registrationNumber: 'EPR/AB1234CD/R1',
      errors: []
    }
    processImportFile.mockResolvedValue(successResult)

    await processOrsImport('import-123', deps())

    expect(orsImportsRepository.updateStatus).toHaveBeenCalledWith(
      'import-123',
      ORS_IMPORT_STATUS.PROCESSING
    )

    expect(uploadsRepository.findByLocation).toHaveBeenCalledWith(
      's3://bucket/f1'
    )
    expect(uploadsRepository.findByLocation).toHaveBeenCalledWith(
      's3://bucket/f2'
    )

    expect(processImportFile).toHaveBeenCalledTimes(2)

    expect(orsImportsRepository.recordFileResult).toHaveBeenCalledWith(
      'import-123',
      0,
      successResult
    )
    expect(orsImportsRepository.recordFileResult).toHaveBeenCalledWith(
      'import-123',
      1,
      successResult
    )

    expect(orsImportsRepository.updateStatus).toHaveBeenCalledWith(
      'import-123',
      ORS_IMPORT_STATUS.COMPLETED
    )
  })

  it('deletes files from S3 after successful processing', async () => {
    const importDoc = {
      _id: 'import-123',
      status: ORS_IMPORT_STATUS.PENDING,
      files: [
        { fileId: 'f1', fileName: 'sites1.xlsx', s3Uri: 's3://bucket/f1' },
        { fileId: 'f2', fileName: 'sites2.xlsx', s3Uri: 's3://bucket/f2' }
      ]
    }
    orsImportsRepository.findById.mockResolvedValue(importDoc)
    uploadsRepository.findByLocation.mockResolvedValue(Buffer.from('data'))
    processImportFile.mockResolvedValue({
      status: ORS_FILE_RESULT_STATUS.SUCCESS,
      sitesCreated: 1,
      mappingsUpdated: 1,
      registrationNumber: 'EPR/AB1234CD/R1',
      errors: []
    })

    await processOrsImport('import-123', deps())

    expect(uploadsRepository.deleteByLocation).toHaveBeenCalledWith(
      's3://bucket/f1'
    )
    expect(uploadsRepository.deleteByLocation).toHaveBeenCalledWith(
      's3://bucket/f2'
    )
  })

  it('does not delete file from S3 when file could not be retrieved', async () => {
    const importDoc = {
      _id: 'import-123',
      status: ORS_IMPORT_STATUS.PENDING,
      files: [
        { fileId: 'f1', fileName: 'missing.xlsx', s3Uri: 's3://bucket/f1' }
      ]
    }
    orsImportsRepository.findById.mockResolvedValue(importDoc)
    uploadsRepository.findByLocation.mockResolvedValue(null)

    await processOrsImport('import-123', deps())

    expect(uploadsRepository.deleteByLocation).not.toHaveBeenCalled()
  })

  it('still records result when S3 deletion fails', async () => {
    const importDoc = {
      _id: 'import-123',
      status: ORS_IMPORT_STATUS.PENDING,
      files: [{ fileId: 'f1', fileName: 'sites.xlsx', s3Uri: 's3://bucket/f1' }]
    }
    orsImportsRepository.findById.mockResolvedValue(importDoc)
    uploadsRepository.findByLocation.mockResolvedValue(Buffer.from('data'))
    uploadsRepository.deleteByLocation.mockRejectedValue(
      new Error('S3 access denied')
    )
    processImportFile.mockResolvedValue({
      status: ORS_FILE_RESULT_STATUS.SUCCESS,
      sitesCreated: 1,
      mappingsUpdated: 1,
      registrationNumber: 'EPR/AB1234CD/R1',
      errors: []
    })

    await processOrsImport('import-123', deps())

    expect(orsImportsRepository.recordFileResult).toHaveBeenCalledWith(
      'import-123',
      0,
      expect.objectContaining({ status: ORS_FILE_RESULT_STATUS.SUCCESS })
    )
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          'Failed to delete file sites.xlsx from S3'
        )
      })
    )
  })

  it('throws PermanentError when import not found', async () => {
    orsImportsRepository.findById.mockResolvedValue(null)

    await expect(processOrsImport('missing-id', deps())).rejects.toThrow(
      PermanentError
    )
    await expect(processOrsImport('missing-id', deps())).rejects.toThrow(
      'ORS import missing-id not found'
    )
  })

  it('isolates file failures — one failure does not block others', async () => {
    const importDoc = {
      _id: 'import-123',
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: [
        { fileId: 'f1', fileName: 'bad.xlsx', s3Uri: 's3://bucket/f1' },
        { fileId: 'f2', fileName: 'good.xlsx', s3Uri: 's3://bucket/f2' }
      ]
    }
    orsImportsRepository.findById.mockResolvedValue(importDoc)

    uploadsRepository.findByLocation
      .mockResolvedValueOnce(Buffer.from('bad'))
      .mockResolvedValueOnce(Buffer.from('good'))

    const failResult = {
      status: ORS_FILE_RESULT_STATUS.FAILURE,
      sitesCreated: 0,
      mappingsUpdated: 0,
      registrationNumber: null,
      errors: [{ field: 'file', message: 'Corrupt file' }]
    }
    const successResult = {
      status: ORS_FILE_RESULT_STATUS.SUCCESS,
      sitesCreated: 2,
      mappingsUpdated: 2,
      registrationNumber: 'EPR/AB1234CD/R1',
      errors: []
    }
    processImportFile
      .mockResolvedValueOnce(failResult)
      .mockResolvedValueOnce(successResult)

    await processOrsImport('import-123', deps())

    // Both files processed despite first failure
    expect(processImportFile).toHaveBeenCalledTimes(2)
    expect(orsImportsRepository.recordFileResult).toHaveBeenCalledWith(
      'import-123',
      0,
      failResult
    )
    expect(orsImportsRepository.recordFileResult).toHaveBeenCalledWith(
      'import-123',
      1,
      successResult
    )

    expect(orsImportsRepository.updateStatus).toHaveBeenCalledWith(
      'import-123',
      ORS_IMPORT_STATUS.COMPLETED
    )
  })

  it('records failure when file cannot be fetched from S3', async () => {
    const importDoc = {
      _id: 'import-123',
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: [
        { fileId: 'f1', fileName: 'missing.xlsx', s3Uri: 's3://bucket/f1' }
      ]
    }
    orsImportsRepository.findById.mockResolvedValue(importDoc)
    uploadsRepository.findByLocation.mockResolvedValue(null)

    await processOrsImport('import-123', deps())

    expect(orsImportsRepository.recordFileResult).toHaveBeenCalledWith(
      'import-123',
      0,
      {
        status: ORS_FILE_RESULT_STATUS.FAILURE,
        sitesCreated: 0,
        mappingsUpdated: 0,
        registrationNumber: null,
        errors: [
          {
            field: 'file',
            message: 'File missing.xlsx could not be retrieved from storage'
          }
        ]
      }
    )

    expect(orsImportsRepository.updateStatus).toHaveBeenCalledWith(
      'import-123',
      ORS_IMPORT_STATUS.FAILED
    )
  })

  it('catches unexpected errors from file processing and records them', async () => {
    const importDoc = {
      _id: 'import-123',
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: [{ fileId: 'f1', fileName: 'crash.xlsx', s3Uri: 's3://bucket/f1' }]
    }
    orsImportsRepository.findById.mockResolvedValue(importDoc)
    uploadsRepository.findByLocation.mockResolvedValue(Buffer.from('data'))

    processImportFile.mockRejectedValue(new Error('Unexpected DB error'))

    await processOrsImport('import-123', deps())

    expect(orsImportsRepository.recordFileResult).toHaveBeenCalledWith(
      'import-123',
      0,
      {
        status: ORS_FILE_RESULT_STATUS.FAILURE,
        sitesCreated: 0,
        mappingsUpdated: 0,
        registrationNumber: null,
        errors: [{ field: 'file', message: 'Unexpected DB error' }]
      }
    )

    expect(logger.error).toHaveBeenCalled()

    expect(orsImportsRepository.updateStatus).toHaveBeenCalledWith(
      'import-123',
      ORS_IMPORT_STATUS.FAILED
    )
  })

  it('sets FAILED when all files in a multi-file batch fail', async () => {
    const importDoc = {
      _id: 'import-123',
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: [
        { fileId: 'f1', fileName: 'bad1.xlsx', s3Uri: 's3://bucket/f1' },
        { fileId: 'f2', fileName: 'bad2.xlsx', s3Uri: 's3://bucket/f2' }
      ]
    }
    orsImportsRepository.findById.mockResolvedValue(importDoc)

    uploadsRepository.findByLocation
      .mockResolvedValueOnce(Buffer.from('bad1'))
      .mockResolvedValueOnce(Buffer.from('bad2'))

    const failResult = {
      status: ORS_FILE_RESULT_STATUS.FAILURE,
      sitesCreated: 0,
      mappingsUpdated: 0,
      registrationNumber: null,
      errors: [{ field: 'file', message: 'Invalid format' }]
    }
    processImportFile.mockResolvedValue(failResult)

    await processOrsImport('import-123', deps())

    expect(processImportFile).toHaveBeenCalledTimes(2)
    expect(orsImportsRepository.updateStatus).toHaveBeenCalledWith(
      'import-123',
      ORS_IMPORT_STATUS.FAILED
    )
  })
})
