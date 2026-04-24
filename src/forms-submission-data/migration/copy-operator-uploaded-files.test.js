import { beforeEach, describe, expect, it, vi } from 'vitest'
import { copyOperatorUploadedFiles } from './copy-operator-uploaded-files.js'
import { createInMemoryFormsFileUploadsRepository } from '#adapters/repositories/forms-submissions/inmemory.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

const { logger } = await import('#common/helpers/logging/logger.js')

function fileRef(id) {
  return { defraFormUploadedFileId: id }
}

describe('copyOperatorUploadedFiles', () => {
  let repository

  beforeEach(() => {
    vi.clearAllMocks()
    repository = createInMemoryFormsFileUploadsRepository()
  })

  it('copies files from all upload arrays across registrations and accreditations', async () => {
    const registrations = [
      {
        submittedToRegulator: 'ea',
        samplingInspectionPlanPart1FileUploads: [
          fileRef('p1-a'),
          fileRef('p1-b')
        ],
        orsFileUploads: [fileRef('ors-a')]
      }
    ]
    const accreditations = [
      {
        submittedToRegulator: 'niea',
        samplingInspectionPlanPart2FileUploads: [fileRef('p2-a')]
      }
    ]

    await copyOperatorUploadedFiles(registrations, accreditations, repository)

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          '4 operator uploaded files for 1 registrations and 1 accreditations'
        )
      })
    )
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Finished copying operator uploaded files, total: 4, failed: 0'
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs error and continues when a file copy fails', async () => {
    const copyError = new Error('S3 unavailable')
    const failingRepo = {
      copyFormFileToS3: vi
        .fn()
        .mockRejectedValueOnce(copyError)
        .mockResolvedValue(undefined)
    }

    const registrations = [
      {
        submittedToRegulator: 'ea',
        samplingInspectionPlanPart1FileUploads: [
          fileRef('file-fail'),
          fileRef('file-ok')
        ]
      }
    ]

    await copyOperatorUploadedFiles(registrations, [], failingRepo)

    expect(logger.error).toHaveBeenCalledWith({
      err: copyError,
      message: 'Failed to copy operator uploaded file — fileId: file-fail'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Finished copying operator uploaded files, total: 2, failed: 1'
    })
    expect(failingRepo.copyFormFileToS3).toHaveBeenCalledTimes(2)
  })

  it('does nothing when submissions have no files', async () => {
    await copyOperatorUploadedFiles(
      [{ submittedToRegulator: 'ea' }],
      [{ submittedToRegulator: 'sepa' }],
      repository
    )

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Finished copying operator uploaded files, total: 0, failed: 0'
    })
    expect(logger.error).not.toHaveBeenCalled()
  })
})
