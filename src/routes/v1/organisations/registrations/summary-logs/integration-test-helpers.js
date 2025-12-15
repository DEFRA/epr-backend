import ExcelJS from 'exceljs'

import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { parseS3Uri } from '#adapters/repositories/uploads/s3-uri.js'
import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { RECEIVED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/reprocessor-input/fields.js'
import { REPROCESSED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/reprocessor-output/fields.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
// eslint-disable-next-line n/no-unpublished-import
import { createTestServer } from '#test/create-test-server.js'
// eslint-disable-next-line n/no-unpublished-import
import { asStandardUser } from '#test/inject-auth.js'
// eslint-disable-next-line n/no-unpublished-import
export { asStandardUser } from '#test/inject-auth.js'

const RECEIVED_LOADS_HEADERS = Object.values(RECEIVED_LOADS_FIELDS)
const REPROCESSED_LOADS_HEADERS = Object.values(REPROCESSED_LOADS_FIELDS)

// Excel row positions for data tables
const TABLE_HEADER_ROW = 6
const TABLE_DATA_START_ROW = 7

// Valid test fixture data for REPROCESSOR_INPUT template
const VALID_RECEIVED_LOAD = {
  rowId: 10000000001,
  dateReceived: new Date('2025-05-28'),
  ewcCode: '03 03 08',
  description: 'Glass - pre-sorted',
  prnIssued: 'No',
  grossWeight: 1000,
  tareWeight: 100,
  palletWeight: 50,
  netWeight: 850,
  bailingWireProtocol: 'Yes',
  howCalculated: 'Actual weight (100%)',
  nonTargetWeight: 50,
  recyclableProportion: 0.85,
  tonnageReceived: 678.98
}

// Valid test fixture data for REPROCESSOR_OUTPUT template
const VALID_REPROCESSED_LOAD = {
  rowId: 30000000001,
  dateLeftSite: new Date('2025-05-28'),
  productTonnage: 500,
  ukPackagingPercentage: 0.75,
  ukPackagingProportion: 375,
  addProductWeight: 'Yes'
}

export const createUploadPayload = (
  organisationId,
  registrationId,
  fileStatus,
  fileId,
  filename,
  includeS3 = true
) => ({
  uploadStatus: 'ready',
  metadata: {
    organisationId,
    registrationId
  },
  form: {
    summaryLogUpload: {
      fileId,
      filename,
      fileStatus,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contentLength: 12345,
      checksumSha256: 'abc123def456',
      detectedContentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ...(includeS3 && {
        s3Bucket: 'test-bucket',
        s3Key: `path/to/${filename}`
      })
    }
  },
  numberOfRejectedFiles: fileStatus === UPLOAD_STATUS.REJECTED ? 1 : 0
})

export const buildGetUrl = (organisationId, registrationId, summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`

export const buildPostUrl = (organisationId, registrationId, summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`

export const buildSubmitUrl = (organisationId, registrationId, summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`

const VALIDATION_TIMEOUT_IN_MS = 50

export const pollForValidation = async (
  server,
  organisationId,
  registrationId,
  summaryLogId
) => {
  let attempts = 0
  const maxAttempts = 10
  let status = SUMMARY_LOG_STATUS.VALIDATING

  while (status === SUMMARY_LOG_STATUS.VALIDATING && attempts < maxAttempts) {
    await new Promise((resolve) =>
      setTimeout(resolve, VALIDATION_TIMEOUT_IN_MS)
    )

    const checkResponse = await server.inject({
      method: 'GET',
      url: buildGetUrl(organisationId, registrationId, summaryLogId),
      ...asStandardUser({ linkedOrgId: organisationId })
    })

    status = JSON.parse(checkResponse.payload).status
    attempts++
  }
}

const createMockLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
})

const completeTestUpload = async ({
  uploadsRepository,
  organisationId,
  registrationId,
  summaryLogId,
  spreadsheetBuffer
}) => {
  const { uploadId } = await uploadsRepository.initiateSummaryLogUpload({
    organisationId,
    registrationId,
    summaryLogId,
    redirectUrl: 'https://frontend.test/redirect',
    callbackUrl: `http://localhost:3001/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`
  })
  const { s3Uri } = await uploadsRepository.completeUpload(
    uploadId,
    spreadsheetBuffer
  )
  return parseS3Uri(s3Uri)
}

const defaultRegistration = {
  registrationNumber: 'REG-123',
  material: 'paper',
  wasteProcessingType: 'reprocessor',
  formSubmissionTime: new Date(),
  submittedToRegulator: 'ea'
}

const createInfrastructureWithExtractor = async ({
  organisationId,
  registrationId,
  summaryLogExtractor,
  uploadsRepository,
  mockLogger,
  registration = {}
}) => {
  const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
  const summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

  const testOrg = buildOrganisation({
    registrations: [
      {
        id: registrationId,
        ...defaultRegistration,
        ...registration
      }
    ]
  })
  testOrg.id = organisationId

  const organisationsRepository = createInMemoryOrganisationsRepository([
    testOrg
  ])()
  const wasteRecordsRepository = createInMemoryWasteRecordsRepository()()

  const validateSummaryLog = createSummaryLogsValidator({
    summaryLogsRepository,
    organisationsRepository,
    wasteRecordsRepository,
    summaryLogExtractor
  })

  const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

  const server = await createTestServer({
    repositories: {
      summaryLogsRepository: summaryLogsRepositoryFactory,
      uploadsRepository
    },
    workers: {
      summaryLogsWorker: { validate: validateSummaryLog }
    },
    featureFlags
  })

  return { server, summaryLogsRepository }
}

export const createSpreadsheetInfrastructure = async ({
  organisationId,
  registrationId,
  summaryLogId,
  spreadsheetBuffer,
  registration = {}
}) => {
  const mockLogger = createMockLogger()
  const uploadsRepository = createInMemoryUploadsRepository()

  const summaryLogExtractor = createSummaryLogExtractor({
    uploadsRepository,
    logger: mockLogger
  })

  const { Bucket: s3Bucket, Key: s3Key } = await completeTestUpload({
    uploadsRepository,
    organisationId,
    registrationId,
    summaryLogId,
    spreadsheetBuffer
  })

  const result = await createInfrastructureWithExtractor({
    organisationId,
    registrationId,
    summaryLogExtractor,
    uploadsRepository,
    mockLogger,
    registration
  })

  return { ...result, s3Bucket, s3Key }
}

const createWorkbookWithMetadata = (processingType) => {
  const workbook = new ExcelJS.Workbook()

  const coverSheet = workbook.addWorksheet('Cover')
  coverSheet.protect('password', {})

  const dataSheet = workbook.addWorksheet('Data')
  dataSheet.protect('password', {})

  dataSheet.getCell('A1').value = '__EPR_META_REGISTRATION_NUMBER'
  dataSheet.getCell('B1').value = 'REG-123'
  dataSheet.getCell('A2').value = '__EPR_META_PROCESSING_TYPE'
  dataSheet.getCell('B2').value = processingType
  dataSheet.getCell('A3').value = '__EPR_META_MATERIAL'
  dataSheet.getCell('B3').value = 'Paper_and_board'
  dataSheet.getCell('A4').value = '__EPR_META_TEMPLATE_VERSION'
  dataSheet.getCell('B4').value = 1

  return workbook
}

const addDataTable = (workbook, tableMarker, headers, rowData) => {
  const dataSheet = workbook.getWorksheet('Data')

  dataSheet.getCell(`A${TABLE_HEADER_ROW}`).value = tableMarker

  headers.forEach((header, index) => {
    dataSheet.getCell(TABLE_HEADER_ROW, index + 2).value = header
  })

  rowData.forEach((value, index) => {
    dataSheet.getCell(TABLE_DATA_START_ROW, index + 2).value = value
  })
}

export const createReprocessorInputWorkbook = () => {
  const workbook = createWorkbookWithMetadata('REPROCESSOR_INPUT')

  addDataTable(
    workbook,
    '__EPR_DATA_RECEIVED_LOADS_FOR_REPROCESSING',
    RECEIVED_LOADS_HEADERS,
    Object.values(VALID_RECEIVED_LOAD)
  )

  return workbook
}

export const createReprocessorOutputWorkbook = () => {
  const workbook = createWorkbookWithMetadata('REPROCESSOR_OUTPUT')

  addDataTable(
    workbook,
    '__EPR_DATA_REPROCESSED_LOADS',
    REPROCESSED_LOADS_HEADERS,
    Object.values(VALID_REPROCESSED_LOAD)
  )

  return workbook
}
