import { describe, it, expect, vi, beforeEach } from 'vitest'

// Import after mocks
import { logger } from '#common/helpers/logging/logger.js'
import { copyAllFormFilesToS3 } from './copy-files-to-s3.js'

const mockCreateFormSubmissionsRepository = vi.fn()
const mockGetUploadedFileInfo = vi.fn()

vi.mock('#repositories/form-submissions/mongodb.js', () => ({
  createFormSubmissionsRepository: (...args) =>
    mockCreateFormSubmissionsRepository(...args)
}))

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('#formsubmission/parsing-common/get-file-upload-details.js', () => ({
  getUploadedFileInfo: (...args) => mockGetUploadedFileInfo(...args)
}))

describe('copyAllFormFilesToS3', () => {
  let mockFormSubmissionsRepository
  let mockFormsFileUploadsRepository

  beforeEach(() => {
    vi.clearAllMocks()

    mockFormSubmissionsRepository = {}

    mockFormsFileUploadsRepository = {
      copyFormFileToS3: vi.fn().mockResolvedValue(undefined)
    }

    mockCreateFormSubmissionsRepository.mockResolvedValue(
      () => mockFormSubmissionsRepository
    )
  })

  it('should successfully copy all files to S3', async () => {
    const mockFiles = [
      {
        formName:
          'Demo for pEPR - Extended Producer Responsibilities: register as a packaging waste exporter (EA)',
        id: '68e6912278f83083f0f17a7b',
        fileId: '12b95c25-6119-4478-a060-79716455036b',
        orgId: 500000
      },
      {
        formName:
          'Demo for pEPR - Extended Producer Responsibilities: register as a packaging waste exporter (EA)',
        id: '68e6912278f83083f0f17a7b',
        fileId: '92133d12-b525-412a-8328-860dfeaa0718',
        orgId: 500000
      },
      {
        formName:
          'Demo for pEPR - Extended Producer Responsibilities: apply for accreditation as a packaging waste exporter (NRW)',
        id: '68e6912278f83083f0f17a7c',
        fileId: '8292dc89-a288-4b7e-afa5-6ef6ac0d7068',
        orgId: 500001
      }
    ]

    mockGetUploadedFileInfo.mockResolvedValue(mockFiles)

    await copyAllFormFilesToS3(
      mockFormSubmissionsRepository,
      mockFormsFileUploadsRepository
    )

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Starting to copy form files to S3'
    })

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Found 3 files to copy',
      totalFiles: 3
    })

    expect(
      mockFormsFileUploadsRepository.copyFormFileToS3
    ).toHaveBeenCalledWith({
      fileId: '12b95c25-6119-4478-a060-79716455036b',
      regulator: 'ea'
    })

    expect(
      mockFormsFileUploadsRepository.copyFormFileToS3
    ).toHaveBeenCalledWith({
      fileId: '92133d12-b525-412a-8328-860dfeaa0718',
      regulator: 'ea'
    })

    expect(
      mockFormsFileUploadsRepository.copyFormFileToS3
    ).toHaveBeenCalledWith({
      fileId: '8292dc89-a288-4b7e-afa5-6ef6ac0d7068',
      regulator: 'nrw'
    })

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Finished copying form files to S3, total: 3, failed: 0'
    })

    expect(logger.error).not.toHaveBeenCalled()
  })

  it('should log error and continue processing when one file fails', async () => {
    const mockFiles = [
      {
        formName:
          'Demo for pEPR - Extended Producer Responsibilities: register as a packaging waste reprocessor (EA)',
        id: '68e6912278f83083f0f17a7d',
        fileId: 'be506501-273f-4770-9d0a-169f4c513465',
        orgId: 500000
      },
      {
        formName:
          'Demo for pEPR - Extended Producer Responsibilities: register as a packaging waste reprocessor (EA)',
        id: '68e6912278f83083f0f17a7d',
        fileId: '704d9252-645d-4d6f-b68c-7907c1d040ef',
        orgId: 500000
      }
    ]

    mockGetUploadedFileInfo.mockResolvedValue(mockFiles)

    const copyError = new Error('S3 upload failed')
    mockFormsFileUploadsRepository.copyFormFileToS3
      .mockRejectedValueOnce(copyError)
      .mockResolvedValueOnce(undefined)

    await copyAllFormFilesToS3(
      mockFormSubmissionsRepository,
      mockFormsFileUploadsRepository
    )

    expect(logger.error).toHaveBeenCalledWith({
      err: copyError,
      message:
        'Failed to copy file - formName: Demo for pEPR - Extended Producer Responsibilities: register as a packaging waste reprocessor (EA), submissionId: 68e6912278f83083f0f17a7d, fileId: be506501-273f-4770-9d0a-169f4c513465, orgId: 500000'
    })

    expect(
      mockFormsFileUploadsRepository.copyFormFileToS3
    ).toHaveBeenCalledTimes(2)

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Finished copying form files to S3, total: 2, failed: 1'
    })
  })

  it('should log error when regulator cannot be extracted from form name', async () => {
    const mockFiles = [
      {
        formName: 'Invalid Form Name Without Agency',
        id: '68e6912278f83083f0f17a7e',
        fileId: 'd2ffa1d3-49a5-4eba-be63-a22235536c22',
        orgId: 500000
      },
      {
        formName:
          'Demo for pEPR - Extended Producer Responsibilities: register as a packaging waste exporter (EA)',
        id: '68e6912278f83083f0f17a7b',
        fileId: '342ea001-3627-4486-b024-3621f9881029',
        orgId: 500001
      }
    ]

    mockGetUploadedFileInfo.mockResolvedValue(mockFiles)

    const extractError = new Error(
      'Cannot extract regulator from form name: Invalid Form Name Without Agency'
    )

    await copyAllFormFilesToS3(
      mockFormSubmissionsRepository,
      mockFormsFileUploadsRepository
    )

    expect(logger.error).toHaveBeenCalledWith({
      err: extractError,
      message:
        'Failed to copy file - formName: Invalid Form Name Without Agency, submissionId: 68e6912278f83083f0f17a7e, fileId: d2ffa1d3-49a5-4eba-be63-a22235536c22, orgId: 500000'
    })

    expect(
      mockFormsFileUploadsRepository.copyFormFileToS3
    ).toHaveBeenCalledTimes(1)
    expect(
      mockFormsFileUploadsRepository.copyFormFileToS3
    ).toHaveBeenCalledWith({
      fileId: '342ea001-3627-4486-b024-3621f9881029',
      regulator: 'ea'
    })

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Finished copying form files to S3, total: 2, failed: 1'
    })
  })
})
