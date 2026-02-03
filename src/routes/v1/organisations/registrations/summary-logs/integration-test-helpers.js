import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
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

const POLL_INTERVAL_MS = 50
const DEFAULT_MAX_ATTEMPTS = 20

/**
 * @typedef {object} PollOptions
 * @property {string} [waitWhile] Status to wait while (defaults to VALIDATING)
 * @property {number} [maxAttempts] Maximum poll attempts (defaults to 20)
 */

/**
 * Poll until summary log status changes from the specified status.
 * @param {object} server - Test server instance
 * @param {string} organisationId - Organisation ID
 * @param {string} registrationId - Registration ID
 * @param {string} summaryLogId - Summary log ID
 * @param {PollOptions} [options] - Polling options
 * @returns {Promise<string>} Final status after polling
 */
export const pollWhileStatus = async (
  server,
  organisationId,
  registrationId,
  summaryLogId,
  {
    waitWhile = SUMMARY_LOG_STATUS.VALIDATING,
    maxAttempts = DEFAULT_MAX_ATTEMPTS
  } = {}
) => {
  let attempts = 0
  let status = waitWhile

  while (status === waitWhile && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

    const checkResponse = await server.inject({
      method: 'GET',
      url: buildGetUrl(organisationId, registrationId, summaryLogId),
      ...asStandardUser({ linkedOrgId: organisationId })
    })

    status = JSON.parse(checkResponse.payload).status
    attempts++
  }

  return status
}

export const pollForValidation = (
  server,
  organisationId,
  registrationId,
  summaryLogId
) =>
  pollWhileStatus(server, organisationId, registrationId, summaryLogId, {
    waitWhile: SUMMARY_LOG_STATUS.VALIDATING
  })

/**
 * @typedef {object} BuildMetaOptions
 * @property {string} [registrationNumber]
 * @property {string} [processingType]
 * @property {string} [material]
 * @property {number} [templateVersion]
 * @property {string} [accreditationNumber]
 * @property {string} [sheet]
 */

/**
 * @param {BuildMetaOptions} options
 */
export const buildMeta = ({
  registrationNumber = 'REG-123',
  processingType,
  material = 'Paper_and_board',
  templateVersion = 5,
  accreditationNumber = 'ACC-123',
  sheet = 'Cover'
} = {}) => ({
  REGISTRATION_NUMBER: {
    value: registrationNumber,
    location: { sheet, row: 1, column: 'B' }
  },
  PROCESSING_TYPE: {
    value: processingType,
    location: { sheet, row: 2, column: 'B' }
  },
  MATERIAL: {
    value: material,
    location: { sheet, row: 3, column: 'B' }
  },
  TEMPLATE_VERSION: {
    value: templateVersion,
    location: { sheet, row: 4, column: 'B' }
  },
  ACCREDITATION_NUMBER: {
    value: accreditationNumber,
    location: { sheet, row: 5, column: 'B' }
  }
})

export const createStandardMeta = (processingType) =>
  buildMeta({ processingType })

export const createTestInfrastructure = async (
  organisationId,
  registrationId,
  extractorData,
  { reprocessingType = 'input' } = {}
) => {
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn()
  }

  const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
  const uploadsRepository = createInMemoryUploadsRepository()
  const summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

  const testOrg = buildOrganisation({
    registrations: [
      {
        id: registrationId,
        registrationNumber: 'REG-123',
        material: 'paper',
        wasteProcessingType: 'reprocessor',
        reprocessingType,
        formSubmissionTime: new Date(),
        submittedToRegulator: 'ea',
        validFrom: '2025-01-01',
        validTo: '2025-12-31',
        accreditation: {
          accreditationNumber: 'ACC-123'
        }
      }
    ]
  })
  testOrg.id = organisationId

  const organisationsRepository = createInMemoryOrganisationsRepository([
    testOrg
  ])()
  const summaryLogExtractor = createInMemorySummaryLogExtractor(extractorData)
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

export const createWasteBalanceMeta = (processingType) =>
  buildMeta({
    registrationNumber: 'REG-12345',
    processingType,
    accreditationNumber: 'ACC-2025-001',
    sheet: 'Data'
  })

export const createSummaryLogSubmitterWorker = ({
  validate,
  summaryLogsRepository,
  syncWasteRecords
}) => ({
  validate,
  submit: async (summaryLogId) => {
    await new Promise((resolve) => setImmediate(resolve))

    const existing = await summaryLogsRepository.findById(summaryLogId)
    const { version, summaryLog } = existing

    await syncWasteRecords(summaryLog)

    await summaryLogsRepository.update(
      summaryLogId,
      version,
      transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTED)
    )
  }
})

const buildWasteHeader = (dateLabel, tonnageLabel, suffixes = []) => [
  'ROW_ID',
  dateLabel,
  'EWC_CODE',
  'DESCRIPTION_WASTE',
  'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE',
  'GROSS_WEIGHT',
  'TARE_WEIGHT',
  'PALLET_WEIGHT',
  'NET_WEIGHT',
  'BAILING_WIRE_PROTOCOL',
  'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
  'WEIGHT_OF_NON_TARGET_MATERIALS',
  'RECYCLABLE_PROPORTION_PERCENTAGE',
  tonnageLabel,
  ...suffixes
]

export const EXPORTER_HEADERS = buildWasteHeader(
  'DATE_RECEIVED_FOR_EXPORT',
  'TONNAGE_RECEIVED_FOR_EXPORT',
  [
    'DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE',
    'INTERIM_SITE_ID',
    'TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR',
    'DATE_RECEIVED_BY_OSR',
    'OSR_ID',
    'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED',
    'DATE_OF_EXPORT',
    'EXPORT_CONTROLS',
    'BASEL_EXPORT_CODE',
    'CUSTOMS_CODES',
    'CONTAINER_NUMBER'
  ]
)

export const REPROCESSOR_INPUT_RECEIVED_HEADERS = buildWasteHeader(
  'DATE_RECEIVED_FOR_REPROCESSING',
  'TONNAGE_RECEIVED_FOR_RECYCLING',
  [
    'SUPPLIER_NAME',
    'SUPPLIER_ADDRESS',
    'SUPPLIER_POSTCODE',
    'SUPPLIER_EMAIL',
    'SUPPLIER_PHONE_NUMBER',
    'ACTIVITIES_CARRIED_OUT_BY_SUPPLIER',
    'YOUR_REFERENCE',
    'WEIGHBRIDGE_TICKET',
    'CARRIER_NAME',
    'CBD_REG_NUMBER',
    'CARRIER_VEHICLE_REGISTRATION_NUMBER'
  ]
)

export const REPROCESSOR_INPUT_SENT_ON_HEADERS = [
  'ROW_ID',
  'DATE_LOAD_LEFT_SITE',
  'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON',
  'FINAL_DESTINATION_FACILITY_TYPE',
  'FINAL_DESTINATION_NAME',
  'FINAL_DESTINATION_ADDRESS',
  'FINAL_DESTINATION_POSTCODE',
  'FINAL_DESTINATION_EMAIL',
  'FINAL_DESTINATION_PHONE',
  'YOUR_REFERENCE',
  'DESCRIPTION_WASTE',
  'EWC_CODE',
  'WEIGHBRIDGE_TICKET'
]

export const REPROCESSOR_OUTPUT_HEADERS = [
  'ROW_ID',
  'DATE_LOAD_LEFT_SITE',
  'PRODUCT_TONNAGE',
  'UK_PACKAGING_WEIGHT_PERCENTAGE',
  'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION',
  'ADD_PRODUCT_WEIGHT'
]

const DEFAULT_ROW_ID = 1001
const DEFAULT_TONNAGE = 850
const GROSS_WEIGHT_OFFSET = 150

const buildCommonWasteRowValues = (d) => [
  d.rowId,
  d.dateReceived,
  d.ewcCode,
  d.wasteDescription,
  d.prnIssued,
  d.grossWeight,
  d.tareWeight,
  d.palletWeight,
  d.netWeight,
  d.bailingWire,
  d.recyclablePropMethod,
  d.nonTargetWeight,
  d.recyclablePropPct,
  d.tonnageReceived
]

export const createExporterRowValues = (overrides = {}) => {
  const defaults = {
    rowId: DEFAULT_ROW_ID,
    dateReceived: '2025-01-15T00:00:00.000Z',
    ewcCode: '03 03 08',
    wasteDescription: 'Glass - pre-sorted',
    prnIssued: 'No',
    grossWeight: 1000,
    tareWeight: 100,
    palletWeight: 50,
    netWeight: DEFAULT_TONNAGE,
    bailingWire: 'No',
    recyclablePropMethod: 'Actual weight (100%)',
    nonTargetWeight: 0,
    recyclablePropPct: 1,
    tonnageReceived: DEFAULT_TONNAGE,
    interimSite: 'No',
    interimSiteId: 100,
    interimTonnage: 0,
    dateReceivedByOsr: '2025-01-18T00:00:00.000Z',
    osrId: 100,
    exportTonnage: 100,
    exportDate: '2025-01-20T00:00:00.000Z',
    exportControls: 'Article 18 (Green list)',
    baselCode: 'B3020',
    customsCode: '123456',
    containerNumber: 'CONT123456'
  }
  const d = { ...defaults, ...overrides }
  return [
    ...buildCommonWasteRowValues(d),
    d.interimSite,
    d.interimSiteId,
    d.interimTonnage,
    d.dateReceivedByOsr,
    d.osrId,
    d.exportTonnage,
    d.exportDate,
    d.exportControls,
    d.baselCode,
    d.customsCode,
    d.containerNumber
  ]
}

export const createReprocessorInputReceivedRowValues = (overrides = {}) => {
  const tonnage = overrides.tonnageReceived ?? DEFAULT_TONNAGE
  const d = {
    rowId: DEFAULT_ROW_ID,
    dateReceived: '2025-01-15T00:00:00.000Z',
    ewcCode: '15 01 01',
    wasteDescription: 'Paper - other',
    prnIssued: 'No',
    grossWeight: tonnage + GROSS_WEIGHT_OFFSET,
    tareWeight: 100,
    palletWeight: 50,
    netWeight: tonnage,
    bailingWire: 'No',
    recyclablePropMethod: 'Actual weight (100%)',
    nonTargetWeight: 0,
    recyclablePropPct: 1,
    tonnageReceived: tonnage,
    supplierName: 'Supplier A',
    supplierAddress: '123 Street',
    supplierPostcode: 'AB1 2CD',
    supplierEmail: 'supplier@example.com',
    supplierPhone: '0123456789',
    yourReference: 'REF123',
    weighbridgeTicket: 'WB123',
    carrierName: 'Carrier A',
    cbdRegNumber: 'CBD123',
    carrierVehicleReg: 'AB12 CDE',
    ...overrides
  }
  return [
    ...buildCommonWasteRowValues(d),
    d.supplierName,
    d.supplierAddress,
    d.supplierPostcode,
    d.supplierEmail,
    d.supplierPhone,
    'Activities',
    d.yourReference,
    d.weighbridgeTicket,
    d.carrierName,
    d.cbdRegNumber,
    d.carrierVehicleReg
  ]
}

export const createReprocessorInputSentOnRowValues = (overrides = {}) => {
  const d = {
    rowId: 5001,
    dateLeft: '2025-01-20T00:00:00.000Z',
    tonnageSent: 100,
    destinationType: 'Reprocessor',
    destinationName: 'Dest A',
    destinationAddress: '456 Road',
    destinationPostcode: 'XY9 8ZW',
    destinationEmail: 'dest@example.com',
    destinationPhone: '0987654321',
    yourReference: 'REF456',
    wasteDescription: 'Paper',
    ewcCode: '15 01 01',
    weighbridgeTicket: 'WB456',
    ...overrides
  }
  return [
    d.rowId,
    d.dateLeft,
    d.tonnageSent,
    d.destinationType,
    d.destinationName,
    d.destinationAddress,
    d.destinationPostcode,
    d.destinationEmail,
    d.destinationPhone,
    d.yourReference,
    d.wasteDescription,
    d.ewcCode,
    d.weighbridgeTicket
  ]
}

export const createReprocessorOutputRowValues = (overrides = {}) => {
  const defaults = {
    rowId: 3001,
    dateLeft: '2025-01-15T00:00:00.000Z',
    productTonnage: 100,
    ukPackagingWeightPercentage: 1,
    productUkPackagingWeightProportion: 100,
    addProductWeight: 'Yes'
  }
  const d = { ...defaults, ...overrides }
  return [
    d.rowId,
    d.dateLeft,
    d.productTonnage,
    d.ukPackagingWeightPercentage,
    d.productUkPackagingWeightProportion,
    d.addProductWeight
  ]
}

export const uploadAndValidate = async (
  env,
  organisationId,
  registrationId,
  summaryLogId,
  fileId,
  { filename, uploadData, sharedMeta }
) => {
  const { server, fileDataMap } = env

  // Register the file data for this submission
  fileDataMap[fileId] = { meta: sharedMeta, data: uploadData }

  await server.inject({
    method: 'POST',
    url: buildPostUrl(organisationId, registrationId, summaryLogId),
    payload: createUploadPayload(
      organisationId,
      registrationId,
      UPLOAD_STATUS.COMPLETE,
      fileId,
      filename
    )
  })

  await pollForValidation(server, organisationId, registrationId, summaryLogId)

  return server.inject({
    method: 'GET',
    url: buildGetUrl(organisationId, registrationId, summaryLogId),
    ...asStandardUser({ linkedOrgId: organisationId })
  })
}

export const submitAndPoll = async (
  env,
  organisationId,
  registrationId,
  summaryLogId
) => {
  const { server } = env

  await server.inject({
    method: 'POST',
    url: buildSubmitUrl(organisationId, registrationId, summaryLogId),
    ...asStandardUser({ linkedOrgId: organisationId })
  })

  return pollWhileStatus(server, organisationId, registrationId, summaryLogId, {
    waitWhile: SUMMARY_LOG_STATUS.SUBMITTING,
    maxAttempts: 20
  })
}

export const performSubmission = async (
  env,
  organisationId,
  registrationId,
  summaryLogId,
  fileId,
  { filename, uploadData, sharedMeta }
) => {
  await uploadAndValidate(
    env,
    organisationId,
    registrationId,
    summaryLogId,
    fileId,
    { filename, uploadData, sharedMeta }
  )
  return submitAndPoll(env, organisationId, registrationId, summaryLogId)
}
