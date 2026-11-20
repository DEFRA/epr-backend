import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { submitSummaryLog } from '#application/summary-logs/submit.js'
import {
  nextYear,
  previousYear,
  toYear,
  utcYearOf
} from '#common/helpers/dates/year.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { REGULATOR } from '#domain/organisations/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { getTemplate } from '#domain/summary-logs/table-schemas/index.js'
import { DEFAULT_TEMPLATE_YEAR } from '#domain/summary-logs/template-year.js'
import {
  buildAccreditation,
  buildRegistration,
  createOrganisationBuilders
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createReportsService } from '#reports/application/report-service.js'
import { createOnSummaryLogUploaded } from '#reports/application/summary-log-events.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { reportKeyOf } from '#reports/repository/contract/test-data.js'

import { uploadCompletedPath } from './natural-key-paths.js'
import { createTestServer } from '#test/create-test-server.js'
import {
  createInMemoryOrganisationReadRepository,
  accreditationsByYear,
  buildReadAccreditation,
  buildReadExporterAccreditation,
  buildReadExporterRegistration,
  buildReadOrganisation as buildServedOrganisation,
  buildReadReprocessorRegistration,
  withStandingThrough
} from '#organisation-read-model/test-support.js'
import { createMockLogger } from '#test/mock-logger.js'
import { partialMock } from '#test/type-helpers.js'
import { signedCallback } from '#test/upload-callback.js'

import { asOperator } from '#test/inject-auth.js'
import { ObjectId } from 'mongodb'
import assert from 'node:assert/strict'
import { onTestFinished, vi } from 'vitest'
import { config } from '#root/config.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'

const { buildReadOrganisation } = createOrganisationBuilders()

const TEST_ACCREDITATION_NUMBER = toAccreditationNumber('ACC-123')

/** @import { HapiServer } from '#common/hapi-types.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { StatusHistoryEntryOf } from '#domain/organisations/accreditation.js' */
/** @import { AppliedForMaterial, Material, StoredRegistrationStatus, ReprocessingType } from '#domain/organisations/model.js' */

export { asOperator } from '#test/inject-auth.js'

/** @import { WasteBalanceLedgerId } from '#waste-balances/repository/ledger-schema.js' */

/**
 * The environment's ledger id.
 *
 * @param {WasteBalanceLedgerId} env
 * @returns {WasteBalanceLedgerId}
 */
export const ledgerIdOf = ({
  organisationNumber,
  registrationNumber,
  accreditationNumber,
  year
}) => ({
  organisationNumber,
  registrationNumber,
  accreditationNumber,
  year
})

/**
 * Reads an accreditation's waste balance from the environment's service and
 * asserts it is present, so callers can read its fields without a null guard at
 * every assertion site. The ledger id is taken entirely from the environment.
 *
 * @param {WasteBalanceLedgerId & { wasteBalanceService: ReturnType<typeof createWasteBalanceService> }} env
 */
export const getWasteBalance = async (env) => {
  const balance = await env.wasteBalanceService.currentBalance(ledgerIdOf(env))
  assert(balance)
  return balance
}

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
  'ADD_PRODUCT_WEIGHT',
  // Product-detail columns: named headers, no value validation
  'PRODUCT_DESCRIPTION',
  'END_OF_WASTE_STANDARDS',
  'WEIGHBRIDGE_TICKET_NUMBER',
  'HAULIER_NAME',
  'HAULIER_VEHICLE_REGISTRATION_NUMBER',
  'CUSTOMER_NAME',
  'CUSTOMER_INVOICE_REFERENCE'
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
  'CONTAINER_NUMBER',
  'WAS_THE_WASTE_REFUSED',
  'WAS_THE_WASTE_STOPPED',
  // Supplementary columns: named headers, no value validation
  'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED',
  'SUPPLIER_NAME',
  'SUPPLIER_ADDRESS',
  'SUPPLIER_POSTCODE',
  'SUPPLIER_EMAIL',
  'SUPPLIER_PHONE_NUMBER',
  'ACTIVITIES_CARRIED_OUT_BY_SUPPLIER',
  'YOUR_REFERENCE',
  'WEIGHBRIDGE_TICKET',
  'WASTE_TRANSFER_NOTE',
  'LOADING_SITE_NAME',
  'LOADING_SITE_ADDRESS',
  'LOADING_SITE_POSTCODE',
  'LOADING_SITE_EMAIL',
  'LOADING_SITE_PHONE_NUMBER',
  'CARRIER_NAME',
  'CBD',
  'CARRIER_VEHICLE_REGISTRATION_NUMBER',
  'OSR_NAME',
  'OSR_COUNTRY',
  'TONNAGE_RECEIVED_BY_OSR',
  'BILL_OF_LANDING_REFERENCE_NUMBER',
  'CUSTOMS_DECLARATION_NUMBER'
]

const TARE_PLUS_PALLET_WEIGHT = 150
const DEFAULT_DATE = '2026-01-15T00:00:00.000Z'
const VALID_FROM = '2026-01-01'
const VALID_TO = '2026-12-31'
// A registered overseas site whose approval starts after the default export
// date, so OSR_ID 200 resolves to found-but-unapproved (ORS_NOT_APPROVED).
const UNAPPROVED_VALID_FROM = '2026-06-01'
/** @type {StatusHistoryEntryOf<StoredRegistrationStatus>[]} */
const APPROVED_HISTORY = [
  { status: 'created', updatedAt: '2024-12-01T00:00:00.000Z' },
  { status: 'approved', updatedAt: '2024-12-15T00:00:00.000Z' }
]

export const createReprocessorReceivedRowValues = (overrides = {}) => {
  const tonnage = overrides.tonnageReceived ?? 1000
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
    dateLeft: '2026-01-20T00:00:00.000Z',
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
    dateLeft: '2026-01-15T00:00:00.000Z',
    productTonnage: 100,
    ukPackagingWeightPercentage: 1,
    productUkPackagingWeightProportion: 100,
    addProductWeight: 'Yes',
    // Product-detail columns (no value validation)
    productDescription: 'Plastic pellets',
    endOfWasteStandards: 'Yes',
    weighbridgeTicketNumber: 'WB123',
    haulierName: 'Haulier A',
    haulierVehicleReg: 'AB12 CDE',
    customerName: 'Customer A',
    customerInvoiceReference: 'INV123'
  }
  const d = { ...defaults, ...overrides }
  return [
    d.rowId,
    d.dateLeft,
    d.productTonnage,
    d.ukPackagingWeightPercentage,
    d.productUkPackagingWeightProportion,
    d.addProductWeight,
    d.productDescription,
    d.endOfWasteStandards,
    d.weighbridgeTicketNumber,
    d.haulierName,
    d.haulierVehicleReg,
    d.customerName,
    d.customerInvoiceReference
  ]
}

const EXPORTER_ROW_DEFAULTS = {
  rowId: 1001,
  dateReceived: '2026-01-15T00:00:00.000Z',
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
  dateReceivedByOsr: '2026-01-18T00:00:00.000Z',
  osrId: 100,
  exportTonnage: 100,
  exportDate: '2026-01-20T00:00:00.000Z',
  exportControls: 'Article 18 (Green list)',
  baselCode: 'B3020',
  customsCode: '123456',
  containerNumber: 'CONT123456',
  wasteRefused: 'No',
  wasteStopped: 'No',
  // Supplementary columns (no value validation)
  dateRepatriated: null,
  supplierName: 'Supplier A',
  supplierAddress: '123 Street',
  supplierPostcode: 'AB1 2CD',
  supplierEmail: 'supplier@example.com',
  supplierPhone: '0123456789',
  activitiesCarriedOutBySupplier: 'Baling',
  yourReference: 'REF123',
  weighbridgeTicket: 'WB123',
  wasteTransferNote: 'WTN123',
  loadingSiteName: 'Loading Site A',
  loadingSiteAddress: '456 Road',
  loadingSitePostcode: 'EF3 4GH',
  loadingSiteEmail: 'loading@example.com',
  loadingSitePhone: '0987654321',
  carrierName: 'Carrier A',
  cbd: 'CBDU123456',
  carrierVehicleReg: 'AB12 CDE',
  osrName: 'Overseas Reprocessor A',
  osrCountry: 'Vietnam-VN',
  tonnageReceivedByOsr: 100,
  billOfLadingReference: 'BOL123',
  customsDeclarationNumber: 'CDN123'
}

export const createExporterRowValues = (overrides = {}) => {
  const d = { ...EXPORTER_ROW_DEFAULTS, ...overrides }
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
    d.containerNumber,
    d.wasteRefused,
    d.wasteStopped,
    d.dateRepatriated,
    d.supplierName,
    d.supplierAddress,
    d.supplierPostcode,
    d.supplierEmail,
    d.supplierPhone,
    d.activitiesCarriedOutBySupplier,
    d.yourReference,
    d.weighbridgeTicket,
    d.wasteTransferNote,
    d.loadingSiteName,
    d.loadingSiteAddress,
    d.loadingSitePostcode,
    d.loadingSiteEmail,
    d.loadingSitePhone,
    d.carrierName,
    d.cbd,
    d.carrierVehicleReg,
    d.osrName,
    d.osrCountry,
    d.tonnageReceivedByOsr,
    d.billOfLadingReference,
    d.customsDeclarationNumber
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
        s3Bucket: 're-ex-summary-logs',
        s3Key: `/organisations/${TEST_ORGANISATION_NUMBER}/registrations/${TEST_REGISTRATION_NUMBER}/${fileId}/${filename}`
      })
    }
  },
  numberOfRejectedFiles: fileStatus === UPLOAD_STATUS.REJECTED ? 1 : 0
})

/** The natural keys every organisation these helpers build is served under. */
export const TEST_ORGANISATION_NUMBER = toOrganisationNumber('500999')
export const TEST_REGISTRATION_NUMBER = toRegistrationNumber('REG123')
export const UPLOAD_YEAR = toYear(2026)

export const registrationUrl = `/organisations/${TEST_ORGANISATION_NUMBER}/registrations/${TEST_REGISTRATION_NUMBER}`
export const accreditationUrl = `${registrationUrl}/accreditations/${UPLOAD_YEAR}`

/** @param {string} summaryLogId */
export const buildGetUrl = (summaryLogId) =>
  `${registrationUrl}/summary-logs/${summaryLogId}`

/**
 * @param {string} summaryLogId
 * @param {{ accredited?: boolean, year?: Year }} [options]
 */
export const buildPostUrl = (
  summaryLogId,
  { accredited = true, year = UPLOAD_YEAR } = {}
) =>
  signedCallback(
    uploadCompletedPath({
      organisationNumber: TEST_ORGANISATION_NUMBER,
      registrationNumber: TEST_REGISTRATION_NUMBER,
      year,
      accredited,
      summaryLogId
    })
  )

/** @param {string} summaryLogId */
export const buildSubmitUrl = (summaryLogId) =>
  `${buildGetUrl(summaryLogId)}/submit`

const POLL_INTERVAL_MS = 50
const DEFAULT_MAX_ATTEMPTS = 20

/**
 * Poll until summary log status changes from the specified status.
 * @param {HapiServer} server - Test server instance
 * @param {string} summaryLogId - Summary log ID
 * @param {object} [options] - Polling options
 * @param {string} [options.waitWhile] - Status to wait while (defaults to VALIDATING)
 * @param {number} [options.maxAttempts] - Maximum poll attempts (defaults to 20)
 * @returns {Promise<string>} Final status after polling
 */
export const pollWhileStatus = async (server, summaryLogId, options = {}) => {
  const {
    waitWhile = SUMMARY_LOG_STATUS.VALIDATING,
    maxAttempts = DEFAULT_MAX_ATTEMPTS
  } = options
  let attempts = 0
  let status = waitWhile

  while (status === waitWhile && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

    const checkResponse = await server.inject({
      method: 'GET',
      url: buildGetUrl(summaryLogId),
      ...asOperator()
    })

    status = JSON.parse(checkResponse.payload).status
    attempts++
  }

  return status
}

/**
 * @param {HapiServer} server
 * @param {string} summaryLogId
 */
export const pollForValidation = (server, summaryLogId) =>
  pollWhileStatus(server, summaryLogId, {
    waitWhile: SUMMARY_LOG_STATUS.VALIDATING,
    maxAttempts: DEFAULT_MAX_ATTEMPTS
  })

/**
 * An accredited reprocessor's 2027 received loads, each row defaulting to 100
 * tonnes received in January 2027.
 *
 * @param {Array<Record<string, unknown> & { dwtSupplyId?: number | null }>} rows
 */
export const reprocessorReceivedLoads2027 = (rows) => ({
  RECEIVED_LOADS_FOR_REPROCESSING: {
    location: { sheet: 'Received', row: 7, column: 'A' },
    headers: [...REPROCESSOR_RECEIVED_HEADERS, 'DWT_SUPPLY_ID'],
    rows: rows.map(({ dwtSupplyId = null, ...row }, index) => ({
      rowNumber: 8 + index,
      values: [
        ...createReprocessorReceivedRowValues({
          dateReceived: '2027-01-15T00:00:00.000Z',
          tonnageReceived: 100,
          ...row
        }),
        dwtSupplyId
      ]
    }))
  }
})

/**
 * Submits a summary log as the operator and waits for the submission to
 * finish, returning the submit response and the status it ends in.
 *
 * @param {{ server: HapiServer }} env
 * @param {string} summaryLogId
 */
export const submitAndWait = async ({ server }, summaryLogId) => {
  const response = await server.inject({
    method: 'POST',
    url: buildSubmitUrl(summaryLogId),
    ...asOperator()
  })
  const status = await pollWhileStatus(server, summaryLogId, {
    waitWhile: SUMMARY_LOG_STATUS.SUBMITTING
  })
  return { response, status }
}

export const createStandardMeta = (processingType) => ({
  REGISTRATION_NUMBER: {
    value: 'REG123',
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
    value: 'REG123',
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

/** @param {string} processingType */
export const createRegisteredOnlyMeta = (processingType) => {
  const { ACCREDITATION_NUMBER: _registeredOnlyHasNone, ...meta } =
    createStandardMeta(processingType)
  return {
    ...meta,
    TEMPLATE_VERSION: {
      value: getTemplate(
        DEFAULT_TEMPLATE_YEAR,
        PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY
      ).minVersion,
      location: { sheet: 'Cover', row: 4, column: 'B' }
    }
  }
}

/**
 * @param {Record<string, any>} meta
 * @param {Year} year
 */
export const withTemplateYear = (meta, year) => ({
  ...meta,
  TEMPLATE_VERSION: {
    ...meta.TEMPLATE_VERSION,
    value: getTemplate(year, meta.PROCESSING_TYPE.value).minVersion
  }
})

export const openNextYear = () => {
  config.set('openNextYear', true)
  onTestFinished(() => config.reset('openNextYear'))
}

/**
 * Fakes only `Date`, so the summary log's upload date is `uploadedAt` while
 * timers still run.
 * @param {string} uploadedAt
 */
export const uploadOn = (uploadedAt) => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(uploadedAt))
  onTestFinished(() => {
    vi.useRealTimers()
  })
}

export const EXPORTER_2027_HEADERS = [
  ...EXPORTER_HEADERS,
  'PREVIOUS_YEAR_ROW_ID',
  'EXIT_PORT',
  'DWT_EXPORT_ID',
  'DWT_SUPPLY_ID'
]

/** @param {Record<string, any>[]} rows */
export const exporter2027Loads = (rows) => ({
  RECEIVED_LOADS_FOR_EXPORT: {
    location: { sheet: 'Exported (sections 1, 2 and 3)', row: 7, column: 'A' },
    headers: EXPORTER_2027_HEADERS,
    rows: rows.map(
      (
        {
          previousYearRowId = null,
          exitPort = null,
          dwtExportId = null,
          dwtSupplyId = null,
          ...row
        },
        index
      ) => ({
        rowNumber: 8 + index,
        values: [
          ...createExporterRowValues({
            dateReceived: '2027-01-15',
            dateReceivedByOsr: '2027-01-18',
            exportDate: '2027-01-20',
            ...row
          }),
          previousYearRowId,
          exitPort,
          dwtExportId,
          dwtSupplyId
        ]
      })
    )
  }
})

/**
 * @param {Awaited<ReturnType<typeof setupWasteBalanceIntegrationEnvironment>>} env
 * @param {{ summaryLogId: string, fileId: string, year?: Year, accredited?: boolean }} ids - the year and accreditation default to the environment's
 * @param {object} parsed
 */
export const uploadAndValidate = async (
  env,
  { summaryLogId, fileId, year = env.year, accredited = env.accredited },
  parsed
) => {
  env.fileDataMap[fileId] = parsed
  await env.server.inject({
    method: 'POST',
    url: buildPostUrl(summaryLogId, { accredited, year }),
    payload: createUploadPayload(
      env.organisationId,
      env.registrationId,
      UPLOAD_STATUS.COMPLETE,
      fileId,
      `${fileId}.xlsx`
    )
  })
  await pollForValidation(env.server, summaryLogId)
  const response = await env.server.inject({
    method: 'GET',
    url: buildGetUrl(summaryLogId),
    ...asOperator()
  })
  return JSON.parse(response.payload)
}

/**
 * @param {string} sheet
 * @param {Record<string, unknown>[]} rows
 */
export const tableOf = (sheet, rows) => ({
  location: { sheet, row: 7, column: 'A' },
  headers: Object.keys(rows[0] ?? {}),
  rows: rows.map((row, index) => ({
    rowNumber: 8 + index,
    values: Object.values(row)
  }))
})

/**
 * @param {{ rowId: number, month: string }} load
 * @param {{ monthHeader?: string, tonnageHeader?: string }} [headers]
 */
export const createRegisteredOnlyReceivedRow = (
  { rowId, month },
  {
    monthHeader = 'MONTH_RECEIVED_FOR_REPROCESSING',
    tonnageHeader = 'TONNAGE_RECEIVED_FOR_RECYCLING'
  } = {}
) => ({
  ROW_ID: rowId,
  [monthHeader]: month,
  NET_WEIGHT: 10.5,
  HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Actual weight (100%)',
  RECYCLABLE_PROPORTION_PERCENTAGE: 0.95,
  [tonnageHeader]: 9.975,
  SUPPLIER_NAME: 'Supplier Co',
  SUPPLIER_ADDRESS: '1 High St',
  SUPPLIER_POSTCODE: 'SW1A 1AA',
  SUPPLIER_EMAIL: 'supplier@example.com',
  SUPPLIER_PHONE_NUMBER: '01234567',
  ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Sorting'
})

/**
 * @param {Parameters<typeof createInMemorySummaryLogExtractor>[0]} extractorData
 * @param {{ reprocessingType?: ReprocessingType }} [options]
 */
export const createTestInfrastructure = async (
  extractorData,
  { reprocessingType = 'input' } = {}
) => {
  const mockLogger = createMockLogger()

  const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
  const uploadsRepository = createInMemoryUploadsRepository()
  const summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

  const organisationReadRepository = createInMemoryOrganisationReadRepository([
    buildComplexTestReadOrg({
      processingType: 'reprocessor',
      reprocessingType,
      material: 'paper'
    })
  ])()

  const summaryLogExtractor = createInMemorySummaryLogExtractor(extractorData)
  const ledgerRepository = createInMemoryLedgerRepository()()
  const summaryLogRowStatesRepository =
    createInMemorySummaryLogRowStatesRepository()()

  const validateSummaryLog = createSummaryLogsValidator({
    summaryLogsRepository,
    organisationReadRepository,
    summaryLogRowStatesRepository,
    ledgerRepository,
    reportsService: /** @type {any} */ ({
      findPeriodicReport: async () => null
    }),
    summaryLogExtractor,
    logger: mockLogger
  })

  const server = await createTestServer({
    repositories: {
      summaryLogsRepository: summaryLogsRepositoryFactory,
      organisationReadRepository: () => organisationReadRepository,
      uploadsRepository
    },
    workers: {
      summaryLogsWorker: { validate: validateSummaryLog }
    }
  })

  return { server, summaryLogsRepository }
}

/**
 * @typedef {{
 *   processingType?: string,
 *   reprocessingType?: ReprocessingType,
 *   material?: Material,
 *   organisationId?: string,
 *   registrationId?: string,
 *   reportsRepository?: ReturnType<ReturnType<typeof createInMemoryReportsRepository>>,
 *   accredited?: boolean,
 *   accreditationValidFrom?: string,
 *   previousYearAccreditationNumber?: import('#domain/organisations/numbers.js').AccreditationNumber,
 *   previousYearAccreditationValidFrom?: string,
 *   previousYearAccreditationSuspendedOn?: string,
 *   year?: Year,
 *   config?: NonNullable<Parameters<typeof createTestServer>[0]>['config'],
 *   ledgerRepository?: import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository,
 *   summaryLogRowStatesRepository?: import('#waste-records/repository/port.js').SummaryLogRowStatesRepository
 * }} WasteBalanceEnvironmentOptions
 */

/** @param {WasteBalanceEnvironmentOptions} [options] */
export const setupWasteBalanceIntegrationEnvironment = async ({
  processingType = 'exporter',
  reprocessingType = 'input',
  material = 'paper',
  organisationId = new ObjectId().toString(),
  registrationId = new ObjectId().toString(),
  reportsRepository = createInMemoryReportsRepository()(),
  accredited = true,
  year = UPLOAD_YEAR,
  accreditationValidFrom = `${year}-01-01`,
  previousYearAccreditationNumber,
  previousYearAccreditationValidFrom,
  previousYearAccreditationSuspendedOn,
  config,
  ledgerRepository = createInMemoryLedgerRepository()(),
  summaryLogRowStatesRepository = createInMemorySummaryLogRowStatesRepository()()
} = {}) => {
  const accreditationId = 'ACC-123'
  const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
  const mockLogger = createMockLogger()
  const uploadsRepository = createInMemoryUploadsRepository()
  const summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

  const testOrg = buildComplexTestOrg({
    registrationId,
    accreditationId,
    processingType,
    reprocessingType,
    material,
    accredited,
    accreditationValidFrom,
    accreditationValidTo: `${year}-12-31`
  })
  testOrg.id = organisationId
  const organisationReadRepository = createInMemoryOrganisationReadRepository([
    buildComplexTestReadOrg({
      processingType,
      reprocessingType,
      material,
      accredited,
      accreditationValidFrom,
      previousYearAccreditationNumber,
      previousYearAccreditationValidFrom,
      previousYearAccreditationSuspendedOn
    })
  ])()

  const organisationAdministrationRepository =
    createInMemoryOrganisationsRepository([{ ...testOrg, status: 'active' }])()

  const systemLogsForBalanceAudit = {
    insert: vi.fn().mockResolvedValue(undefined),
    insertMany: vi.fn().mockResolvedValue(undefined),
    find: vi.fn(),
    findSummaryLogSubmitActors: vi.fn()
  }

  const wasteBalanceService = createWasteBalanceService(
    ledgerRepository,
    systemLogsForBalanceAudit
  )

  const fileDataMap = {}
  const dynamicExtractor = {
    extract: async (summaryLog) => {
      const fileId = summaryLog?.file?.id
      if (!fileId || !Object.hasOwn(fileDataMap, fileId)) {
        throw new Error(
          `No test file data found in fileDataMap for summary log file id: ${fileId}`
        )
      }
      return fileDataMap[fileId]
    }
  }

  const packagingRecyclingNotesRepositoryFactory =
    createInMemoryPackagingRecyclingNotesRepository()
  const packagingRecyclingNotesRepository =
    packagingRecyclingNotesRepositoryFactory(mockLogger)

  const validateSummaryLog = createSummaryLogsValidator({
    summaryLogsRepository,
    organisationReadRepository,
    summaryLogRowStatesRepository,
    ledgerRepository,
    reportsService: createReportsService(reportsRepository),
    summaryLogExtractor: dynamicExtractor,
    logger: mockLogger
  })

  const server = await createTestServer({
    config,
    repositories: {
      summaryLogsRepository: () => summaryLogsRepository,
      summaryLogRowStatesRepository: () => summaryLogRowStatesRepository,
      reportsRepository: () => reportsRepository,
      uploadsRepository,
      ledgerRepository: () => ledgerRepository,
      wasteBalanceService: () => wasteBalanceService,
      packagingRecyclingNotesRepository: () =>
        packagingRecyclingNotesRepository,
      organisationAdministrationRepository: () =>
        organisationAdministrationRepository,
      organisationReadRepository: () => organisationReadRepository
    },
    workers: {
      summaryLogsWorker: createTestSubmitterWorker({
        logger: mockLogger,
        summaryLogsRepository,
        organisationReadRepository,
        ledgerRepository,
        wasteBalanceService,
        reportsService: createReportsService(reportsRepository),
        onSummaryLogUploaded: createOnSummaryLogUploaded({
          reportsRepository,
          systemLogsRepository: createSystemLogsRepository()(mockLogger)
        }),
        validateSummaryLog
      })
    }
  })

  return {
    server,
    summaryLogsRepository,
    wasteBalanceService,
    packagingRecyclingNotesRepository,
    organisationAdministrationRepository,
    organisationReadRepository,
    organisationId,
    registrationId,
    reportKey: reportKeyOf(testOrg, testOrg.registrations[0]),
    accreditationId,
    organisationNumber: TEST_ORGANISATION_NUMBER,
    registrationNumber: TEST_REGISTRATION_NUMBER,
    accreditationNumber: accredited ? TEST_ACCREDITATION_NUMBER : null,
    year,
    accredited,
    fileDataMap,
    ledgerRepository,
    summaryLogRowStatesRepository,
    systemLogsForBalanceAudit,
    reportsRepository,
    validateSummaryLog,
    logger: mockLogger
  }
}

const TEST_SYNC_USER = {
  id: 'test-user',
  email: 'test-user@example.com',
  scope: ['some-scope'],
  role: null
}

/**
 * @param {Omit<Parameters<typeof submitSummaryLog>[1], 'user' | 'onSummaryLogUploaded'> & {
 *   validateSummaryLog: (summaryLogId: import('#domain/summary-logs/ids.js').SummaryLogId) => Promise<void>,
 *   onSummaryLogUploaded?: Parameters<typeof submitSummaryLog>[1]['onSummaryLogUploaded']
 * }} deps
 */
export const createTestSubmitterWorker = ({
  validateSummaryLog,
  onSummaryLogUploaded = async () => {},
  ...submitDeps
}) => ({
  validate: validateSummaryLog,
  submit: async (summaryLogId) => {
    await new Promise((resolve) => setImmediate(resolve))
    await submitSummaryLog(summaryLogId, {
      ...submitDeps,
      user: TEST_SYNC_USER,
      onSummaryLogUploaded
    })
  }
})

/**
 * A registration the organisation read model serves under the test keys, so
 * the natural-key routes find it. Built on the full fixture, whose own
 * accreditation link is dropped: the overrides decide it.
 *
 * @param {Record<string, unknown> & { wasteProcessingType: string }} overrides
 */
export const servedTestRegistration = (overrides) => {
  const { accreditationId: _fixtureLink, ...fixture } = buildRegistration({
    wasteProcessingType: overrides.wasteProcessingType
  })
  return partialMock({
    ...fixture,
    registrationNumber: TEST_REGISTRATION_NUMBER,
    status: 'approved',
    statusHistory: APPROVED_HISTORY,
    validFrom: VALID_FROM,
    ...overrides
  })
}

/**
 * An accreditation the organisation read model serves, built on the full
 * fixture.
 *
 * @param {Record<string, unknown> & { wasteProcessingType: string }} overrides
 */
export const servedTestAccreditation = (overrides) =>
  partialMock({
    ...buildAccreditation(
      partialMock({ wasteProcessingType: overrides.wasteProcessingType })
    ),
    statusHistory: APPROVED_HISTORY,
    validFrom: VALID_FROM,
    validTo: VALID_TO,
    ...overrides
  })

/**
 * Creates a complex test organisation with registrations and accreditations.
 * @param {object} options
 * @param {string} options.registrationId
 * @param {string} options.accreditationId
 * @param {string} options.processingType
 * @param {string} options.reprocessingType
 * @param {string} options.material
 * @param {boolean} [options.accredited] - When false, builds a registered-only registration (no accreditation, quarterly cadence)
 * @param {string} [options.accreditationValidFrom] - The date the accreditation's window opens
 * @param {string} [options.accreditationValidTo] - The date the accreditation's window closes
 * @returns {Object} Test organisation with registrations and accreditations
 */
export const TEST_OVERSEAS_SITE_ID = 'test-overseas-site-100'
const TEST_UNAPPROVED_OVERSEAS_SITE_ID = 'test-overseas-site-200'

const buildComplexTestOrg = ({
  registrationId,
  accreditationId,
  processingType,
  reprocessingType,
  material,
  accredited = true,
  accreditationValidFrom = VALID_FROM,
  accreditationValidTo = VALID_TO
}) => {
  const registration = {
    id: registrationId,
    material: /** @type {AppliedForMaterial} */ (material),
    wasteProcessingType: processingType,
    reprocessingType: /** @type {ReprocessingType} */ (reprocessingType),
    formSubmission: { id: registrationId, time: new Date() },
    submittedToRegulator: REGULATOR.EA,
    // A registered-only operator has no accreditation, which makes the
    // registration report on a quarterly cadence rather than monthly.
    ...(accredited && { accreditationId }),
    ...(processingType === 'exporter' && {
      overseasSites: {
        100: { overseasSiteId: TEST_OVERSEAS_SITE_ID },
        200: { overseasSiteId: TEST_UNAPPROVED_OVERSEAS_SITE_ID }
      }
    })
  }

  return buildReadOrganisation({
    organisationNumber: TEST_ORGANISATION_NUMBER,
    status: 'active',
    registrations: [servedTestRegistration(registration)],
    accreditations: accredited
      ? [
          servedTestAccreditation({
            wasteProcessingType: processingType,
            id: accreditationId,
            accreditationNumber: TEST_ACCREDITATION_NUMBER,
            validFrom: accreditationValidFrom,
            validTo: accreditationValidTo,
            material,
            submittedToRegulator: 'ea',
            site: {
              address: {
                line1: '123 Test Street',
                postcode: 'AB1 2CD'
              }
            },
            statusHistory: APPROVED_HISTORY
          })
        ]
      : []
  })
}

/**
 * The organisation `buildComplexTestOrg` builds, as the read model serves it:
 * its registration under the test keys, approved from `VALID_FROM`, and its
 * accreditation for the year of `accreditationValidFrom` when accredited,
 * approved from `accreditationValidFrom`, and, given its number, the
 * accreditation for the year before, approved from
 * `previousYearAccreditationValidFrom`, or the start of that year.
 *
 * @param {{
 *   processingType: string,
 *   reprocessingType: ReprocessingType,
 *   material: Material,
 *   accredited?: boolean,
 *   accreditationValidFrom?: string,
 *   withOverseasSites?: boolean,
 *   accreditationNumber?: import('#domain/organisations/numbers.js').AccreditationNumber,
 *   previousYearAccreditationNumber?: import('#domain/organisations/numbers.js').AccreditationNumber,
 *   previousYearAccreditationValidFrom?: string,
 *   previousYearAccreditationSuspendedOn?: string
 * }} options
 * @returns {import('#organisation-read-model/index.js').Organisation}
 */
const buildComplexTestReadOrg = ({
  processingType,
  reprocessingType,
  material,
  accredited = true,
  accreditationValidFrom = VALID_FROM,
  withOverseasSites = true,
  accreditationNumber = TEST_ACCREDITATION_NUMBER,
  previousYearAccreditationNumber,
  previousYearAccreditationValidFrom,
  previousYearAccreditationSuspendedOn
}) => {
  const isExporter = processingType === 'exporter'
  /** @param {string} approvedAt */
  const approvedFrom = (approvedAt) => ({
    current: /** @type {const} */ ('approved'),
    lastUpdatedAt: '2023-12-15T00:00:00.000Z',
    timeline: [
      {
        status: /** @type {const} */ ('approved'),
        at: `${approvedAt}T00:00:00.000Z`
      }
    ]
  })
  /**
   * @param {string} approvedAt
   * @param {string | undefined} suspendedOn
   */
  const accreditationStatusFrom = (approvedAt, suspendedOn) => {
    const approved = approvedFrom(approvedAt)
    return suspendedOn
      ? {
          ...approved,
          current: /** @type {const} */ ('suspended'),
          timeline: [
            ...approved.timeline,
            {
              status: /** @type {const} */ ('suspended'),
              at: `${suspendedOn}T00:00:00.000Z`
            }
          ]
        }
      : approved
  }
  const accreditationYear = utcYearOf(accreditationValidFrom)
  const followingYear = nextYear(accreditationYear)
  const accreditations = [
    ...(previousYearAccreditationNumber
      ? [
          buildReadAccreditation({
            accreditationNumber: previousYearAccreditationNumber,
            status: accreditationStatusFrom(
              previousYearAccreditationValidFrom ??
                `${previousYear(accreditationYear)}-01-01`,
              previousYearAccreditationSuspendedOn
            ),
            year: previousYear(accreditationYear)
          })
        ]
      : []),
    buildReadAccreditation({
      accreditationNumber,
      status: approvedFrom(accreditationValidFrom),
      year: accreditationYear
    })
  ]
  const common = {
    material,
    status: approvedFrom(VALID_FROM)
  }
  const registration = isExporter
    ? buildReadExporterRegistration({
        ...common,
        overseasSites: withOverseasSites
          ? {
              100: {
                name: 'Test Overseas Site',
                address: {
                  line1: '1 Test Road',
                  townOrCity: 'Berlin',
                  country: 'Germany'
                }
              },
              200: {
                name: 'Test Unapproved Overseas Site',
                address: {
                  line1: '2 Test Road',
                  townOrCity: 'Hamburg',
                  country: 'Germany'
                }
              }
            }
          : {},
        accreditations: accredited
          ? accreditationsByYear(
              ...accreditations.map((accreditation) =>
                buildReadExporterAccreditation({
                  ...accreditation,
                  overseasSites: {
                    100: { status: 'approved', approvedOn: VALID_FROM },
                    200: {
                      status: 'approved',
                      approvedOn: UNAPPROVED_VALID_FROM
                    }
                  }
                })
              )
            )
          : {}
      })
    : buildReadReprocessorRegistration({
        ...common,
        reprocessingType,
        accreditations: accredited
          ? accreditationsByYear(...accreditations)
          : {}
      })
  return buildServedOrganisation({
    organisationNumber: TEST_ORGANISATION_NUMBER,
    registrations: {
      [TEST_REGISTRATION_NUMBER]: withStandingThrough(
        registration,
        followingYear
      )
    }
  })
}

/**
 * The organisation `servedTestRegistration` builds, as the read model serves
 * it under the test keys: registered only, or accredited for `UPLOAD_YEAR` from
 * `VALID_FROM` when given an `accreditationNumber`, as
 * `servedTestAccreditation` builds it.
 *
 * @param {{
 *   wasteProcessingType: string,
 *   material?: Material,
 *   reprocessingType?: ReprocessingType,
 *   accreditationNumber?: import('#domain/organisations/numbers.js').AccreditationNumber
 * }} options
 */
export const servedTestReadOrganisation = ({
  wasteProcessingType,
  material = wasteProcessingType === 'exporter' ? 'plastic' : 'glass_re_melt',
  reprocessingType = 'input',
  accreditationNumber
}) =>
  buildComplexTestReadOrg({
    processingType: wasteProcessingType,
    reprocessingType,
    material,
    accredited: accreditationNumber !== undefined,
    accreditationNumber,
    withOverseasSites: false
  })
