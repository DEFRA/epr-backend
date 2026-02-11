import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { syncFromSummaryLog } from '#application/waste-records/sync-from-summary-log.js'
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
import { createInMemoryWasteBalancesRepository } from '#repositories/waste-balances/inmemory.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
// eslint-disable-next-line n/no-unpublished-import
import { createTestServer } from '#test/create-test-server.js'
// eslint-disable-next-line n/no-unpublished-import
import { asStandardUser } from '#test/inject-auth.js'
import { vi } from 'vitest'
import { ObjectId } from 'mongodb'

// eslint-disable-next-line n/no-unpublished-import
export { asStandardUser } from '#test/inject-auth.js'

export const REPROCESSOR_RECEIVED_HEADERS = [
  'ROW_ID',
  'DATE_RECEIVED_FOR_REPROCESSING',
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
  'TONNAGE_RECEIVED_FOR_RECYCLING',
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

export const REPROCESSOR_SENT_ON_HEADERS = [
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

export const REPROCESSED_LOADS_HEADERS = [
  'ROW_ID',
  'DATE_LOAD_LEFT_SITE',
  'PRODUCT_TONNAGE',
  'UK_PACKAGING_WEIGHT_PERCENTAGE',
  'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION',
  'ADD_PRODUCT_WEIGHT'
]

export const EXPORTER_HEADERS = [
  'ROW_ID',
  'DATE_RECEIVED_FOR_EXPORT',
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
  'TONNAGE_RECEIVED_FOR_EXPORT',
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

const DEFAULT_TONNAGE = 850
const TARE_PLUS_PALLET_WEIGHT = 150
const DEFAULT_DATE = '2025-01-15T00:00:00.000Z'
const VALID_FROM = '2025-01-01'
const VALID_TO = '2025-12-31'

export const createReprocessorReceivedRowValues = (overrides = {}) => {
  const tonnage = overrides.tonnageReceived
  const d = {
    rowId: 1001,
    dateReceived: DEFAULT_DATE,
    ewcCode: '15 01 01',
    wasteDescription: 'Paper - other',
    prnIssued: 'No',
    grossWeight: tonnage + TARE_PLUS_PALLET_WEIGHT,
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
    activitiesCarriedOutBySupplier: 'Activities',
    yourReference: 'REF123',
    weighbridgeTicket: 'WB123',
    carrierName: 'Carrier A',
    cbdRegNumber: 'CBD123',
    carrierVehicleReg: 'AB12 CDE',
    ...overrides
  }
  return [
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
    d.tonnageReceived,
    d.supplierName,
    d.supplierAddress,
    d.supplierPostcode,
    d.supplierEmail,
    d.supplierPhone,
    d.activitiesCarriedOutBySupplier,
    d.yourReference,
    d.weighbridgeTicket,
    d.carrierName,
    d.cbdRegNumber,
    d.carrierVehicleReg
  ]
}

export const createReprocessorSentOnRowValues = (overrides = {}) => {
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

export const createReprocessedRowValues = (overrides = {}) => {
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

export const createExporterRowValues = (overrides = {}) => {
  const defaults = {
    rowId: 1001,
    dateReceived: '2025-01-15T00:00:00.000Z',
    ewcCode: '03 03 08',
    wasteDescription: 'Glass - pre-sorted',
    prnIssued: 'No',
    grossWeight: 1000,
    tareWeight: 100,
    palletWeight: 50,
    netWeight: 850,
    bailingWire: 'No',
    recyclablePropMethod: 'Actual weight (100%)',
    nonTargetWeight: 0,
    recyclablePropPct: 1,
    tonnageReceived: 850,
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
    d.tonnageReceived,
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
 * Poll until summary log status changes from the specified status.
 * @param {object} server - Test server instance
 * @param {string} organisationId - Organisation ID
 * @param {string} registrationId - Registration ID
 * @param {string} summaryLogId - Summary log ID
 * @param {object} options - Polling options
 * @param {string} options.waitWhile - Status to wait while (defaults to VALIDATING)
 * @param {number} options.maxAttempts - Maximum poll attempts (defaults to 20)
 * @returns {Promise<string>} Final status after polling
 */
export const pollWhileStatus = async (
  server,
  organisationId,
  registrationId,
  summaryLogId,
  options = {}
) => {
  const waitWhile = options.waitWhile
  const maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS
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
    waitWhile: SUMMARY_LOG_STATUS.VALIDATING,
    maxAttempts: DEFAULT_MAX_ATTEMPTS
  })

export const createStandardMeta = (processingType) => ({
  REGISTRATION_NUMBER: {
    value: 'REG-123',
    location: { sheet: 'Cover', row: 1, column: 'B' }
  },
  PROCESSING_TYPE: {
    value: processingType,
    location: { sheet: 'Cover', row: 2, column: 'B' }
  },
  MATERIAL: {
    value: 'Paper_and_board',
    location: { sheet: 'Cover', row: 3, column: 'B' }
  },
  TEMPLATE_VERSION: {
    value: 5,
    location: { sheet: 'Cover', row: 4, column: 'B' }
  },
  ACCREDITATION_NUMBER: {
    value: 'ACC-123',
    location: { sheet: 'Cover', row: 5, column: 'B' }
  }
})

export const createWasteBalanceMeta = (processingType) => ({
  REGISTRATION_NUMBER: {
    value: 'REG-123',
    location: { sheet: 'Data', row: 1, column: 'B' }
  },
  PROCESSING_TYPE: {
    value: processingType,
    location: { sheet: 'Data', row: 2, column: 'B' }
  },
  MATERIAL: {
    value: 'Paper_and_board',
    location: { sheet: 'Data', row: 3, column: 'B' }
  },
  TEMPLATE_VERSION: {
    value: 5,
    location: { sheet: 'Data', row: 4, column: 'B' }
  },
  ACCREDITATION_NUMBER: {
    value: 'ACC-123',
    location: { sheet: 'Data', row: 5, column: 'B' }
  }
})

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

  const testOrg = buildComplexTestOrg(
    registrationId,
    'ACC-123',
    'reprocessor',
    reprocessingType,
    'paper'
  )
  testOrg.id = organisationId

  const organisationsRepository = createInMemoryOrganisationsRepository([
    { ...testOrg, status: 'active' }
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

export const setupWasteBalanceIntegrationEnvironment = async ({
  processingType = 'exporter',
  reprocessingType = 'input',
  material = 'paper',
  organisationId = new ObjectId().toString(),
  registrationId = new ObjectId().toString(),
  accreditationId = 'ACC-123'
} = {}) => {
  const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn()
  }
  const uploadsRepository = createInMemoryUploadsRepository()
  const summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

  const testOrg = buildComplexTestOrg(
    registrationId,
    accreditationId,
    processingType,
    reprocessingType,
    material
  )
  testOrg.id = organisationId
  testOrg.status = 'active'

  const organisationsRepository = createInMemoryOrganisationsRepository([
    testOrg
  ])()

  const wasteRecordsRepositoryFactory = createInMemoryWasteRecordsRepository()
  const wasteRecordsRepository = wasteRecordsRepositoryFactory()

  const wasteBalancesRepositoryFactory = createInMemoryWasteBalancesRepository(
    [],
    { organisationsRepository }
  )
  const wasteBalancesRepository = wasteBalancesRepositoryFactory()

  const fileDataMap = {}
  const dynamicExtractor = {
    extract: async (summaryLog) => {
      return fileDataMap[summaryLog.file.id]
    }
  }

  const validateSummaryLog = createSummaryLogsValidator({
    summaryLogsRepository,
    organisationsRepository,
    wasteRecordsRepository,
    summaryLogExtractor: dynamicExtractor
  })

  const featureFlags = createInMemoryFeatureFlags({
    summaryLogs: true,
    packagingRecyclingNotes: true
  })

  const syncWasteRecords = syncFromSummaryLog({
    extractor: dynamicExtractor,
    wasteRecordRepository: wasteRecordsRepository,
    wasteBalancesRepository,
    organisationsRepository
  })

  const packagingRecyclingNotesRepositoryFactory =
    createInMemoryPackagingRecyclingNotesRepository()
  const packagingRecyclingNotesRepository =
    packagingRecyclingNotesRepositoryFactory()

  const server = await createTestServer({
    repositories: {
      summaryLogsRepository: () => summaryLogsRepository,
      uploadsRepository,
      wasteBalancesRepository: () => wasteBalancesRepository,
      wasteRecordsRepository: () => wasteRecordsRepository,
      packagingRecyclingNotesRepository: () =>
        packagingRecyclingNotesRepository,
      organisationsRepository: () => organisationsRepository
    },
    workers: {
      summaryLogsWorker: createTestSubmitterWorker({
        summaryLogsRepository,
        syncWasteRecords,
        validateSummaryLog
      })
    },
    featureFlags
  })

  return {
    server,
    summaryLogsRepository,
    wasteBalancesRepository,
    wasteRecordsRepository,
    packagingRecyclingNotesRepository,
    organisationsRepository,
    organisationId,
    registrationId,
    accreditationId,
    fileDataMap
  }
}

const createTestSubmitterWorker = ({
  summaryLogsRepository,
  syncWasteRecords,
  validateSummaryLog
}) => ({
  validate: validateSummaryLog,
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

/**
 * Creates dummy accreditation data for an organisation.
 * @param {string} registrationId
 * @param {string} accreditationId
 * @param {string} processingType
 * @param {string} reprocessingType
 * @param {string} material
 * @returns {Object} Test organisation with registrations and accreditations
 */
const buildComplexTestOrg = (registrationId, accreditationId, processingType, reprocessingType, material) => {
  return buildOrganisation({
    status: 'active',
    registrations: [
      {
        id: registrationId,
        registrationNumber: 'REG-123',
        status: 'approved',
        material,
        wasteProcessingType: processingType,
        reprocessingType,
        formSubmissionTime: new Date(),
        submittedToRegulator: 'ea',
        validFrom: VALID_FROM,
        validTo: VALID_TO,
        accreditationId
      }
    ],
    accreditations: [
      {
        id: accreditationId,
        accreditationNumber: 'ACC-123',
        validFrom: VALID_FROM,
        validTo: VALID_TO,
        material,
        submittedToRegulator: 'ea',
        site: {
          address: {
            line1: '123 Test Street',
            postcode: 'AB1 2CD'
          }
        }
      }
    ]
  })
}
